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
import { apiRequest } from './helpers/request';
import { groupRows } from './helpers/groupRows';
import {
	buildInvoiceFields,
	type TemplateFieldItem,
} from './helpers/buildInvoiceFields';
import { fetchGoogleSheetData } from './helpers/googleSheets';
import { formatApiError } from './helpers/errors';

interface TemplateFieldsResponse {
	fields?: TemplateFieldItem[];
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
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		try {
			if (resource === 'invoice') {
				if (operation === 'create') {
					const spreadsheet = this.getNodeParameter('spreadsheet', 0) as string;
					const worksheet = this.getNodeParameter('worksheet', 0, 'Sheet1') as string;
					const templateId = this.getNodeParameter('templateId', 0) as string;
					const format = this.getNodeParameter('format', 0, 'pdf') as string;
					const sendToClient = this.getNodeParameter('sendToClient', 0, false) as boolean;

					// Validate format
					if (format !== 'pdf' && format !== 'png') {
						throw new NodeOperationError(
							this.getNode(),
							'Invalid format. Format must be "pdf" or "png".',
						);
					}

					// 1. Retrieve Data from Google Sheets
					const sheetData = await fetchGoogleSheetData.call(this, {
						spreadsheet,
						worksheet,
						googleAuthType: 'public',
						googleApiKey: '',
					});

					const { rows, spreadsheetId, worksheet: resolvedWorksheet } = sheetData;

					// 2. Select an Invoice Template & Retrieve Template Fields
					const fieldsResponse = (await apiRequest.call(
						this,
						'GET',
						'/api/v1/templates/fields',
						undefined,
						{ templateId },
					)) as TemplateFieldsResponse;

					const templateFields = fieldsResponse?.fields || [];
					const tableField = templateFields.find((f) => f?.type === 'table' || f?.type === 'payslipTable');
					const tableFieldId = tableField?.id;

					// 3. Group rows
					const groups = groupRows(rows);

					if (groups.length === 0) {
						throw new NodeOperationError(
							this.getNode(),
							'No rows to turn into invoices',
						);
					}

					// If more than 2 invoices found in invoice data, use first 2 and ignore others
					const groupsToProcess = groups.slice(0, 2);

					// 4. Build invoices with template clearing and spreadsheet population
					const invoices = groupsToProcess.map((g) =>
						buildInvoiceFields({
							rowGroup: g,
							templateId,
							format: format as 'pdf' | 'png',
							tableFieldId,
							templateFields,
						}),
					);

					const requestBody = {
						invoices,
						saveToHistory: true,
						sendToClient,
					};

					// 5. Submit invoice creation to NestJS backend
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
						spreadsheetId,
						worksheet: resolvedWorksheet,
					};

					if (invoiceIds && invoiceIds.length > 0) {
						jsonOutput.invoiceIds = invoiceIds;
					}

					if (sendToClient) {
						jsonOutput.sendToClient = true;
						const emailedHeader = response.headers?.['x-invoices-emailed'];
						if (emailedHeader) {
							jsonOutput.emailedTo = emailedHeader
								.split(',')
								.map((e: string) => e.trim())
								.filter(Boolean);
						}
					}

					const pairedItem =
						items.length > 0 ? items.map((_, i) => ({ item: i })) : [{ item: 0 }];

					return [
						[
							{
								json: jsonOutput,
								binary: {
									data: binaryData,
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
					const sendToUser = this.getNodeParameter('sendToUser', 0, false) as boolean;

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
					if (sendToUser) qs.sendToUser = true;

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
					const sendToUser = this.getNodeParameter('sendToUser', 0, false) as boolean;

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
					if (sendToUser) {
						qs.sendToUser = true;
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
