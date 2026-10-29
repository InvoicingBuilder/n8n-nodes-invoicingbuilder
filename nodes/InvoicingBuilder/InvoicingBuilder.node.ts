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
import { clientFields, clientOperations } from './descriptions/ClientDescription';
import { reportFields, reportOperations } from './descriptions/ReportDescription';
import { trendFields } from './descriptions/TrendDescription';
import { getTemplates } from './methods/getTemplates';
import { getClients } from './methods/getClients';
import { getClientUpdateFields } from './methods/getClientUpdateFields';
import { getInvoices } from './methods/getInvoices';
import { searchTemplates } from './methods/searchTemplates';
import { searchClients } from './methods/searchClients';
import { searchInvoices } from './methods/searchInvoices';
import { searchClientInvoices } from './methods/searchClientInvoices';
import { extractResourceLocatorValue } from './helpers/resourceLocator';
import { apiRequest } from './helpers/request';
import { groupRows } from './helpers/groupRows';
import {
	buildInvoiceFields,
	type TemplateFieldItem,
} from './helpers/buildInvoiceFields';
import {
	buildDirectInvoice,
	type DirectLineItemInput,
	type DirectAdditionalFields,
} from './helpers/directInvoice';
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

async function executeSummaryReport(
	context: IExecuteFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[][]> {
	const fromRaw = context.getNodeParameter('from', 0, '') as string;
	const toRaw = context.getNodeParameter('to', 0, '') as string;
	const status = context.getNodeParameter('status', 0, 'all') as string;
	const sendToUser = context.getNodeParameter('sendToUser', 0, false) as boolean;

	const from = fromRaw ? fromRaw.split('T')[0] : undefined;
	const to = toRaw ? toRaw.split('T')[0] : undefined;

	if (from && to && from > to) {
		throw new NodeOperationError(
			context.getNode(),
			'The "From" date must be earlier than or equal to the "To" date.',
		);
	}

	const qs: IDataObject = {
		status,
	};
	if (from) qs.from = from;
	if (to) qs.to = to;
	if (sendToUser) qs.sendToUser = true;

	const response = (await apiRequest.call(
		context,
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

async function executeTrendsReport(
	context: IExecuteFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[][]> {
	const period = context.getNodeParameter('period', 0, 'monthly') as string;
	const periods = context.getNodeParameter('periods', 0, undefined) as number | undefined;
	const endDateRaw = context.getNodeParameter('endDate', 0, '') as string;
	const sendToUser = context.getNodeParameter('sendToUser', 0, false) as boolean;

	const qs: IDataObject = {
		period,
	};
	if (periods && periods >= 2 && periods <= 36) {
		qs.periods = periods;
	}
	if (endDateRaw) {
		qs.endDate = endDateRaw.split('T')[0];
	}
	if (sendToUser) {
		qs.sendToUser = true;
	}

	const response = (await apiRequest.call(
		context,
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

export class InvoicingBuilder implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'InvoicingBuilder',
		name: 'invoicingBuilder',
		icon: { light: 'file:invoicingBuilder.svg', dark: 'file:invoicingBuilder.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create invoices, manage clients, and generate reports using InvoicingBuilder',
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
					{
						name: 'Client',
						value: 'client',
					},
					{
						name: 'Report',
						value: 'report',
					},
				],
				default: 'invoice',
			},
			...invoiceOperations,
			...clientOperations,
			...reportOperations,
			...invoiceFields,
			...clientFields,
			...reportFields,
			...trendFields,
		],
	};

	methods = {
		loadOptions: {
			getTemplates,
			getClients,
			getInvoices,
		},
		listSearch: {
			searchTemplates,
			searchClients,
			searchInvoices,
			searchClientInvoices,
			getTemplates: searchTemplates,
			getClients: searchClients,
			getInvoices: searchInvoices,
			getClientInvoices: searchClientInvoices,
		},
		resourceMapping: {
			getClientUpdateFields,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		try {
			// Handle Report Resource (and backward compatibility under Invoice)
			if (
				resource === 'report' ||
				(resource === 'invoice' &&
					(operation === 'generateReport' || operation === 'analyseTrends'))
			) {
				if (operation === 'summary' || operation === 'generateReport') {
					return await executeSummaryReport(this, items);
				}
				if (operation === 'trends' || operation === 'analyseTrends') {
					return await executeTrendsReport(this, items);
				}
			}

			// Handle Client Resource
			if (resource === 'client') {
				if (operation === 'getAll') {
					const returnAll = this.getNodeParameter('returnAll', 0, true) as boolean;
					const limit = this.getNodeParameter('limit', 0, 50) as number;

					const response = (await apiRequest.call(
						this,
						'GET',
						'/api/v1/clients',
					)) as IDataObject[];

					let clients = Array.isArray(response) ? response : [];
					if (!returnAll && limit && limit > 0) {
						clients = clients.slice(0, limit);
					}

					const returnItems: INodeExecutionData[] = clients.map((client, index) => {
						const clientJson = { ...client };
						delete clientJson.reminderSchedule;
						return {
							json: clientJson,
							pairedItem: { item: index },
						};
					});

					return [returnItems];
				}

				const numItems = items.length > 0 ? items.length : 1;
				const returnData: INodeExecutionData[] = [];

				for (let i = 0; i < numItems; i++) {
					try {
						if (operation === 'create') {
							const name = this.getNodeParameter('name', i) as string;
							const email = this.getNodeParameter('email', i, '') as string;
							const billTo = this.getNodeParameter('billTo', i, '') as string;
							const shipTo = this.getNodeParameter('shipTo', i, '') as string;

							const body: IDataObject = { name };
							if (email) body.email = email;
							if (billTo) body.billTo = billTo;
							if (shipTo) body.shipTo = shipTo;

							const response = (await apiRequest.call(
								this,
								'POST',
								'/api/v1/clients',
								body,
							)) as IDataObject;

							const clientJson = { ...response };
							delete clientJson.reminderSchedule;

							returnData.push({
								json: clientJson,
								pairedItem: { item: i },
							});
						} else if (operation === 'get') {
							const clientId = extractResourceLocatorValue(this.getNodeParameter('clientId', i));
							const response = (await apiRequest.call(
								this,
								'GET',
								`/api/v1/clients/${clientId}`,
							)) as IDataObject;

							const clientJson = { ...response };
							delete clientJson.reminderSchedule;

							returnData.push({
								json: clientJson,
								pairedItem: { item: i },
							});
						} else if (operation === 'update') {
							const clientId = extractResourceLocatorValue(this.getNodeParameter('clientId', i, ''));
							if (!clientId) {
								throw new NodeOperationError(
									this.getNode(),
									'Client Name or ID is required to update a client.',
									{ itemIndex: i },
								);
							}

							const currentClient = (await apiRequest.call(
								this,
								'GET',
								`/api/v1/clients/${clientId}`,
							)) as IDataObject;

							const name = this.getNodeParameter('name', i, '') as string;
							const email = this.getNodeParameter('email', i, '') as string;
							const billTo = this.getNodeParameter('billTo', i, '') as string;
							const shipTo = this.getNodeParameter('shipTo', i, '') as string;

							let updateFields: IDataObject = {};
							try {
								const rawUpdate = this.getNodeParameter('updateFields', i, {}) as
									| { value?: IDataObject }
									| IDataObject;
								if (rawUpdate && typeof rawUpdate === 'object') {
									if ('value' in rawUpdate && rawUpdate.value && typeof rawUpdate.value === 'object') {
										updateFields = rawUpdate.value as IDataObject;
									} else {
										updateFields = rawUpdate as IDataObject;
									}
								}
							} catch {
								updateFields = {};
							}

							const updatePayload: IDataObject = {};

							const applyField = (
								fieldName: string,
								directVal: unknown,
								collectionVal: unknown,
								currentVal: unknown,
							) => {
								const normalizedCurrent = (currentVal ?? '') as string;
								if (collectionVal !== undefined && collectionVal !== null) {
									const strVal = String(collectionVal).trim();
									if (strVal !== normalizedCurrent) {
										updatePayload[fieldName] = strVal;
									}
									return;
								}
								if (typeof directVal === 'string' && directVal.trim() !== '') {
									if (directVal.trim() !== normalizedCurrent) {
										updatePayload[fieldName] = directVal.trim();
									}
								}
							};

							applyField('name', name, updateFields.name, currentClient?.name);
							applyField('email', email, updateFields.email, currentClient?.email);
							applyField('billTo', billTo, updateFields.billTo, currentClient?.billTo);
							applyField('shipTo', shipTo, updateFields.shipTo, currentClient?.shipTo);

							let responseData: IDataObject;
							if (Object.keys(updatePayload).length > 0) {
								responseData = (await apiRequest.call(
									this,
									'PUT',
									`/api/v1/clients/${clientId}`,
									updatePayload,
								)) as IDataObject;
							} else {
								responseData = currentClient;
							}

							const clientJson = { ...responseData };
							delete clientJson.reminderSchedule;

							returnData.push({
								json: clientJson,
								pairedItem: { item: i },
							});
						} else if (operation === 'delete') {
							const clientId = extractResourceLocatorValue(this.getNodeParameter('clientId', i));
							const response = (await apiRequest.call(
								this,
								'DELETE',
								`/api/v1/clients/${clientId}`,
							)) as IDataObject;

							returnData.push({
								json: response,
								pairedItem: { item: i },
							});
						} else if (operation === 'sendReminder') {
							const clientId = extractResourceLocatorValue(this.getNodeParameter('clientId', i));
							const invoiceIdParam = this.getNodeParameter('invoiceId', i, '') as unknown;
							const invoiceId = extractResourceLocatorValue(invoiceIdParam).trim();

							const body: IDataObject = {};
							if (invoiceId) {
								body.invoiceId = invoiceId;
							}

							const response = (await apiRequest.call(
								this,
								'POST',
								`/api/v1/clients/${clientId}/remind`,
								body,
							)) as IDataObject;

							returnData.push({
								json: response,
								pairedItem: { item: i },
							});
						}
					} catch (error) {
						if (this.continueOnFail()) {
							returnData.push({
								json: {
									error: (error as Error).message,
								},
								pairedItem: { item: i },
							});
							continue;
						}
						if (error instanceof NodeOperationError) {
							throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
						}
						const formatted = formatApiError(error);
						throw new NodeApiError(this.getNode(), formatted.response, {
							message: formatted.message,
							httpCode: formatted.httpCode,
							itemIndex: i,
						});
					}
				}

				return [returnData];
			}

			// Handle Invoice Resource
			if (resource === 'invoice') {
				if (operation === 'get') {
					const numItems = items.length > 0 ? items.length : 1;
					const returnData: INodeExecutionData[] = [];

					for (let i = 0; i < numItems; i++) {
						try {
							const invoiceId = extractResourceLocatorValue(this.getNodeParameter('invoiceId', i));
							const response = (await apiRequest.call(
								this,
								'GET',
								`/api/v1/n8n/invoices/${invoiceId}`,
							)) as IDataObject;

							returnData.push({
								json: response,
								pairedItem: { item: i },
							});
						} catch (error) {
							if (this.continueOnFail()) {
								returnData.push({
									json: {
										error: (error as Error).message,
									},
									pairedItem: { item: i },
								});
								continue;
							}
							if (error instanceof NodeOperationError) {
								throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
							}
							const formatted = formatApiError(error);
							throw new NodeApiError(this.getNode(), formatted.response, {
								message: formatted.message,
								httpCode: formatted.httpCode,
								itemIndex: i,
							});
						}
					}

					return [returnData];
				}

				if (operation === 'download') {
					const numItems = items.length > 0 ? items.length : 1;
					const returnData: INodeExecutionData[] = [];

					for (let i = 0; i < numItems; i++) {
						try {
							const invoiceId = extractResourceLocatorValue(this.getNodeParameter('invoiceId', i));
							const downloadFormat = this.getNodeParameter('downloadFormat', i, 'pdf') as string;

							const response = (await apiRequest.call(
								this,
								'GET',
								`/api/v1/n8n/invoices/${invoiceId}/download`,
								undefined,
								{ format: downloadFormat },
								{
									encoding: 'arraybuffer',
									returnFullResponse: true,
									headers: {
										Accept: 'application/pdf, image/png, */*',
									},
								},
							)) as CreateApiResponse;

							const contentDisposition = response.headers?.['content-disposition'];
							let fileName = `invoice_${invoiceId}.${downloadFormat}`;
							if (contentDisposition) {
								const match = contentDisposition.match(/filename="?([^"]+)"?/);
								if (match && match[1]) {
									fileName = match[1];
								}
							}

							const mimeType = downloadFormat === 'pdf' ? 'application/pdf' : 'image/png';
							const fileBuffer = Buffer.isBuffer(response.body)
								? response.body
								: Buffer.from(response.body as ArrayBuffer);

							const binaryData = await this.helpers.prepareBinaryData(
								fileBuffer,
								fileName,
								mimeType,
							);

							returnData.push({
								json: {
									success: true,
									invoiceId,
									format: downloadFormat,
									fileName,
								},
								binary: {
									data: binaryData,
								},
								pairedItem: { item: i },
							});
						} catch (error) {
							if (this.continueOnFail()) {
								returnData.push({
									json: {
										error: (error as Error).message,
									},
									pairedItem: { item: i },
								});
								continue;
							}
							if (error instanceof NodeOperationError) {
								throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
							}
							const formatted = formatApiError(error);
							throw new NodeApiError(this.getNode(), formatted.response, {
								message: formatted.message,
								httpCode: formatted.httpCode,
								itemIndex: i,
							});
						}
					}

					return [returnData];
				}

				if (operation === 'create') {
					const source = this.getNodeParameter('source', 0, 'googleSheets') as string;
					const templateId = extractResourceLocatorValue(this.getNodeParameter('templateId', 0));
					const format = this.getNodeParameter('format', 0, 'pdf') as string;
					const sendToClient = this.getNodeParameter('sendToClient', 0, false) as boolean;

					// Validate format
					if (format !== 'pdf' && format !== 'png') {
						throw new NodeOperationError(
							this.getNode(),
							'Invalid format. Format must be "pdf" or "png".',
						);
					}

					// Fetch Template Fields for mapping & clearing
					const fieldsResponse = (await apiRequest.call(
						this,
						'GET',
						'/api/v1/templates/fields',
						undefined,
						{ templateId },
					)) as TemplateFieldsResponse;

					const templateFields = fieldsResponse?.fields || [];
					const tableField = templateFields.find(
						(f) => f?.type === 'table' || f?.type === 'payslipTable',
					);
					const tableFieldId = tableField?.id;

					let invoicesPayload: unknown[] = [];
					let spreadsheetId: string | undefined;
					let resolvedWorksheet: string | undefined;

					if (source === 'googleSheets') {
						const spreadsheet = this.getNodeParameter('spreadsheet', 0) as string;
						const worksheet = this.getNodeParameter('worksheet', 0, 'Sheet1') as string;

						// 1. Retrieve Data from Google Sheets
						const sheetData = await fetchGoogleSheetData.call(this, {
							spreadsheet,
							worksheet,
							googleAuthType: 'public',
							googleApiKey: '',
						});

						spreadsheetId = sheetData.spreadsheetId;
						resolvedWorksheet = sheetData.worksheet;

						// 2. Group rows
						const groups = groupRows(sheetData.rows);

						if (groups.length === 0) {
							throw new NodeOperationError(
								this.getNode(),
								'No rows to turn into invoices',
							);
						}

						// If more than 2 invoices found in invoice data, use first 2 and ignore others
						const groupsToProcess = groups.slice(0, 2);

						// 3. Build invoices with template clearing and spreadsheet population
						invoicesPayload = groupsToProcess.map((g) =>
							buildInvoiceFields({
								rowGroup: g,
								templateId,
								format: format as 'pdf' | 'png',
								tableFieldId,
								templateFields,
							}),
						);
					} else {
						// source === 'direct'
						const numItems = items.length > 0 ? items.length : 1;
						const countToProcess = Math.min(numItems, 2);
						const builtInvoices = [];

						for (let i = 0; i < countToProcess; i++) {
							const clientId = extractResourceLocatorValue(this.getNodeParameter('clientId', i, ''));
							const invoiceNumber = this.getNodeParameter('invoiceNumber', i, '') as string;
							const poNumber = this.getNodeParameter('poNumber', i, '') as string;
							const issueDate = this.getNodeParameter('issueDate', i, '') as string;
							const dueDate = this.getNodeParameter('dueDate', i, '') as string;

							if (!clientId) {
								throw new NodeOperationError(
									this.getNode(),
									'Client Name or ID is required for direct invoice creation. Please select a client.',
									{ itemIndex: i },
								);
							}

							let clientData:
								| { name?: string; email?: string; billTo?: string; shipTo?: string }
								| undefined;

							try {
								clientData = (await apiRequest.call(
									this,
									'GET',
									`/api/v1/clients/${clientId}`,
								)) as { name?: string; email?: string; billTo?: string; shipTo?: string };
							} catch {
								throw new NodeOperationError(
									this.getNode(),
									`Failed to retrieve details for selected client "${clientId}".`,
									{ itemIndex: i },
								);
							}

							const lineItemsParam = this.getNodeParameter('lineItems', i, {}) as {
								item?: DirectLineItemInput[];
							};

							const additionalFields = this.getNodeParameter(
								'additionalFields',
								i,
								{},
							) as DirectAdditionalFields;

							// Resolve line items: from parameter, or fallback to json.lineItems / json.items
							let lineItems = lineItemsParam?.item || [];
							if (lineItems.length === 0 && items[i]?.json) {
								const fallbackItems =
									(items[i].json.lineItems as DirectLineItemInput[]) ||
									(items[i].json.items as DirectLineItemInput[]);
								if (Array.isArray(fallbackItems)) {
									lineItems = fallbackItems;
								}
							}

							const resolvedClientName = clientData?.name || undefined;
							const resolvedClientEmail = clientData?.email || undefined;
							const resolvedBillTo = clientData?.billTo || undefined;
							const resolvedShipTo = clientData?.shipTo || undefined;

							const invoiceItem = buildDirectInvoice({
								templateId,
								format: format as 'pdf' | 'png',
								invoiceNumber:
									invoiceNumber ||
									(items[i]?.json?.invoiceNumber as string) ||
									(items[i]?.json?.['Invoice Number'] as string) ||
									undefined,
								poNumber:
									poNumber ||
									(items[i]?.json?.poNumber as string) ||
									(items[i]?.json?.['PO Number'] as string) ||
									undefined,
								clientId: clientId || undefined,
								clientName: resolvedClientName,
								clientEmail: resolvedClientEmail,
								billTo: resolvedBillTo,
								shipTo: resolvedShipTo,
								issueDate,
								dueDate,
								lineItems,
								additionalFields,
								templateFields,
								tableFieldId,
							});

							builtInvoices.push(invoiceItem);
						}

						invoicesPayload = builtInvoices;
					}

					const requestBody = {
						invoices: invoicesPayload,
						saveToHistory: true,
						sendToClient,
					};

					// Submit invoice creation to NestJS backend
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
					const invoiceCount = countHeader ? parseInt(countHeader, 10) : invoicesPayload.length;
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
						source,
					};

					if (spreadsheetId) {
						jsonOutput.spreadsheetId = spreadsheetId;
					}
					if (resolvedWorksheet) {
						jsonOutput.worksheet = resolvedWorksheet;
					}

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
