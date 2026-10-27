import {
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	NodeConnectionTypes,
	NodeOperationError,
	NodeApiError,
} from 'n8n-workflow';
import { invoiceFields, invoiceOperations } from './descriptions/InvoiceDescription';
import { reportFields } from './descriptions/ReportDescription';
import { trendFields } from './descriptions/TrendDescription';
import { getTemplates } from './methods/getTemplates';
import { getTemplateFields } from './methods/getTemplateFields';
import { apiRequest } from './helpers/request';
import { groupRows } from './helpers/groupRows';
import {
	buildInvoiceFields,
	type HeaderFieldMapping,
	type LineItemColumnConfig,
} from './helpers/buildInvoiceFields';
import { formatApiError } from './helpers/errors';

interface RawFieldMappings {
	mappings?: HeaderFieldMapping[];
}

interface TemplateFieldsResponse {
	fields?: Array<{
		id: string;
		type: string;
	}>;
}

interface CreateApiResponse {
	body: ArrayBuffer | Buffer;
	headers: Record<string, string | undefined>;
	statusCode: number;
}

export class InvoicingBuilder implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'InvoicingBuilder',
		name: 'invoicingBuilder',
		icon: { light: 'file:invoicingBuilder.svg', dark: 'file:invoicingBuilder.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create invoices and generate reports using InvoicingBuilder',
		defaults: {
			name: 'InvoicingBuilder',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'invoicingBuilderApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Invoice',
						value: 'invoice',
					},
				],
				default: 'invoice',
			},
			...invoiceOperations,
			...invoiceFields,
			...reportFields,
			...trendFields,
		],
	};

	methods = {
		loadOptions: {
			getTemplates,
			getTemplateFields,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		try {
			if (resource === 'invoice') {
				if (operation === 'create') {
					const templateId = this.getNodeParameter('templateId', 0) as string;
					const format = this.getNodeParameter('format', 0, 'pdf') as string;
					const groupBy = this.getNodeParameter('groupBy', 0, '') as string;
					const externalIdColumn = this.getNodeParameter('externalIdColumn', 0, '') as string;
					const saveToHistory = this.getNodeParameter('saveToHistory', 0, true) as boolean;
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', 0, 'data') as string;

					// Validate format
					if (format !== 'pdf' && format !== 'png') {
						throw new NodeOperationError(
							this.getNode(),
							'Invalid format. Format must be "pdf" or "png".',
						);
					}

					// Extract header mappings
					let headerMappings: HeaderFieldMapping[] = [];
					const rawMappings = this.getNodeParameter(
						'headerFieldMappings',
						0,
						{},
					) as RawFieldMappings | HeaderFieldMapping[];

					if (rawMappings && typeof rawMappings === 'object' && 'mappings' in rawMappings && Array.isArray(rawMappings.mappings)) {
						headerMappings = rawMappings.mappings;
					} else if (Array.isArray(rawMappings)) {
						headerMappings = rawMappings;
					}

					// Extract line item columns
					const lineItemColumns = this.getNodeParameter(
						'lineItemColumns',
						0,
						{},
					) as LineItemColumnConfig;

					// Validate mapped columns exist in at least one input row
					const columnsToCheck: string[] = [];
					for (const mapping of headerMappings) {
						if (mapping.column && mapping.column.trim()) {
							columnsToCheck.push(mapping.column.trim());
						}
					}
					if (lineItemColumns.description?.trim()) columnsToCheck.push(lineItemColumns.description.trim());
					if (lineItemColumns.quantity?.trim()) columnsToCheck.push(lineItemColumns.quantity.trim());
					if (lineItemColumns.rate?.trim()) columnsToCheck.push(lineItemColumns.rate.trim());
					if (lineItemColumns.tax?.trim()) columnsToCheck.push(lineItemColumns.tax.trim());
					if (externalIdColumn?.trim()) columnsToCheck.push(externalIdColumn.trim());
					if (groupBy?.trim()) columnsToCheck.push(groupBy.trim());

					if (columnsToCheck.length > 0 && items.length > 0) {
						const missingColumns = columnsToCheck.filter(
							(col) => !items.some((item) => item.json && (col in item.json || item.json[col] !== undefined)),
						);

						if (missingColumns.length > 0) {
							throw new NodeOperationError(
								this.getNode(),
								`The following mapped column(s) were not found in any input row: ${missingColumns.join(', ')}`,
							);
						}
					}

					// Group rows
					const rowObjects = items.map((item) => (item.json || {}) as IDataObject);
					const groups = groupRows(rowObjects, groupBy);

					if (groups.length === 0) {
						throw new NodeOperationError(
							this.getNode(),
							'No rows to turn into invoices',
						);
					}

					if (groups.length > 2) {
						throw new NodeOperationError(
							this.getNode(),
							`Found ${groups.length} invoices; the limit is 2 per execution. Split the rows (e.g. with Loop Over Items or Limit) and try again.`,
						);
					}

					// Fetch template fields to identify table field ID
					const fieldsResponse = (await apiRequest.call(
						this,
						'GET',
						'/api/v1/templates/fields',
						undefined,
						{ templateId },
					)) as TemplateFieldsResponse;

					const tableField = fieldsResponse?.fields?.find((f) => f?.type === 'table');
					const tableFieldId = tableField?.id;

					// Build invoices
					const invoices = groups.map((g) =>
						buildInvoiceFields({
							rowGroup: g,
							templateId,
							format: format as 'pdf' | 'png',
							headerMappings,
							lineItemColumns,
							externalIdColumn,
							tableFieldId,
						}),
					);

					const requestBody = {
						invoices,
						saveToHistory,
					};

					const response = (await apiRequest.call(
						this,
						'POST',
						'/api/v1/n8n/invoices/create',
						requestBody,
						{},
						{
							encoding: 'arraybuffer',
							returnFullResponse: true,
							headers: {
								'Content-Type': 'application/json',
								Accept: 'application/pdf, image/png, application/zip, */*',
							},
						},
					)) as CreateApiResponse;

					const countHeader = response.headers?.['x-invoice-count'];
					const invoiceCount = countHeader ? parseInt(countHeader, 10) : invoices.length;
					const idsHeader = response.headers?.['x-invoice-ids'];
					const invoiceIds = idsHeader
						? idsHeader
								.split(',')
								.map((id: string) => id.trim())
								.filter(Boolean)
						: undefined;

					const fileName = invoiceCount === 1 ? `invoice.${format}` : 'invoices.zip';
					const mimeType =
						invoiceCount === 1
							? format === 'pdf'
								? 'application/pdf'
								: 'image/png'
							: 'application/zip';

					const fileBuffer = Buffer.isBuffer(response.body)
						? response.body
						: Buffer.from(response.body as ArrayBuffer);

					const binaryData = await this.helpers.prepareBinaryData(
						fileBuffer,
						fileName,
						mimeType,
					);

					const jsonOutput: IDataObject = {
						success: true,
						invoiceCount,
						format,
						fileName,
					};

					if (invoiceIds && invoiceIds.length > 0) {
						jsonOutput.invoiceIds = invoiceIds;
					}

					const pairedItem = items.map((_, i) => ({ item: i }));

					return [
						[
							{
								json: jsonOutput,
								binary: {
									[binaryPropertyName]: binaryData,
								},
								pairedItem,
							},
						],
					];
				}

				if (operation === 'generateReport') {
					const dateBasis = this.getNodeParameter('dateBasis', 0, 'issueDate') as string;
					const fromRaw = this.getNodeParameter('from', 0, '') as string;
					const toRaw = this.getNodeParameter('to', 0, '') as string;
					const status = this.getNodeParameter('status', 0, 'all') as string;
					const currency = this.getNodeParameter('currency', 0, '') as string;

					const from = fromRaw ? fromRaw.split('T')[0] : undefined;
					const to = toRaw ? toRaw.split('T')[0] : undefined;

					if (from && to && from > to) {
						throw new NodeOperationError(
							this.getNode(),
							'The "From" date must be earlier than or equal to the "To" date.',
						);
					}

					const qs: IDataObject = {
						dateBasis,
						status,
					};
					if (from) qs.from = from;
					if (to) qs.to = to;
					if (currency?.trim()) qs.currency = currency.trim();

					const response = (await apiRequest.call(
						this,
						'GET',
						'/api/v1/n8n/reports/summary',
						undefined,
						qs,
					)) as IDataObject;

					const pairedItem =
						items.length > 0 ? items.map((_, i) => ({ item: i })) : [{ item: 0 }];

					return [
						[
							{
								json: response,
								pairedItem,
							},
						],
					];
				}

				if (operation === 'analyseTrends') {
					const period = this.getNodeParameter('period', 0, 'monthly') as string;
					const periods = this.getNodeParameter('periods', 0, undefined) as number | undefined;
					const endDateRaw = this.getNodeParameter('endDate', 0, '') as string;
					const dateBasis = this.getNodeParameter('dateBasis', 0, 'issueDate') as string;
					const currency = this.getNodeParameter('currency', 0, '') as string;

					const qs: IDataObject = {
						period,
						dateBasis,
					};
					if (periods && periods >= 2 && periods <= 36) {
						qs.periods = periods;
					}
					if (endDateRaw) {
						qs.endDate = endDateRaw.split('T')[0];
					}
					if (currency?.trim()) {
						qs.currency = currency.trim();
					}

					const response = (await apiRequest.call(
						this,
						'GET',
						'/api/v1/n8n/reports/trends',
						undefined,
						qs,
					)) as IDataObject;

					const pairedItem =
						items.length > 0 ? items.map((_, i) => ({ item: i })) : [{ item: 0 }];

					return [
						[
							{
								json: response,
								pairedItem,
							},
						],
					];
				}
			}

			throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
		} catch (error) {
			if (this.continueOnFail()) {
				const pairedItem =
					items.length > 0 ? items.map((_, i) => ({ item: i })) : [{ item: 0 }];
				return [
					[
						{
							json: {
								error: (error as Error).message,
							},
							pairedItem,
						},
					],
				];
			}

			if (error instanceof NodeOperationError) {
				throw new NodeOperationError(this.getNode(), error);
			}

			const formatted = formatApiError(error);
			throw new NodeApiError(this.getNode(), formatted.response, {
				message: formatted.message,
				httpCode: formatted.httpCode,
			});
		}
	}
}
