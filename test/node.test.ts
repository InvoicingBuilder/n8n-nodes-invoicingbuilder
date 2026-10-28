import { describe, it, expect, vi } from 'vitest';
import { InvoicingBuilder } from '../nodes/InvoicingBuilder/InvoicingBuilder.node';
import { invoiceFields } from '../nodes/InvoicingBuilder/descriptions/InvoiceDescription';
import { clientFields } from '../nodes/InvoicingBuilder/descriptions/ClientDescription';
import {
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestOptions,
	type ILoadOptionsFunctions,
	type INode,
	NodeOperationError,
	NodeApiError,
} from 'n8n-workflow';

interface MockContextOptions {
	items?: Array<{ json: IDataObject }>;
	parameters?: IDataObject;
	itemParameters?: Array<IDataObject>;
	credentials?: IDataObject;
	continueOnFail?: boolean;
	httpHandler?: (options: IHttpRequestOptions) => Promise<unknown>;
	sheetCsvData?: string;
}

interface HttpErrorPayload extends Error {
	response?: {
		status?: number;
		data?: IDataObject;
		headers?: Record<string, string>;
	};
}

const DEFAULT_SHEET_CSV = `"orderId","item","quantity","rate","Customer Name","Customer Email"
"1","Monitor","1","200","XYZ Company","xyz@example.com"
`;

function createMockExecuteContext(options: MockContextOptions = {}): IExecuteFunctions {
	const items = options.items || [{ json: {} }];
	const params: IDataObject = {
		resource: 'invoice',
		operation: 'create',
		spreadsheet: 'https://docs.google.com/spreadsheets/d/test_sheet_123/edit#gid=0',
		worksheet: 'Sheet1',
		templateId: 'tmpl_123',
		format: 'pdf',
		sendToClient: false,
		...options.parameters,
	};

	const credentials: IDataObject = {
		apiKey: 'ib_test_secret',
		baseUrl: 'https://api.invoicingbuilder.com',
		...options.credentials,
	};

	const mockNode: INode = {
		id: 'test_node_id',
		name: 'InvoicingBuilder',
		type: 'n8n-nodes-invoicingbuilder.invoicingBuilder',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};

	const csvData = options.sheetCsvData !== undefined ? options.sheetCsvData : DEFAULT_SHEET_CSV;

	const context = {
		getInputData: vi.fn(() => items),
		getNodeParameter: vi.fn((param: string, itemIndex = 0, defaultValue?: unknown) => {
			if (
				options.itemParameters &&
				options.itemParameters[itemIndex] &&
				param in options.itemParameters[itemIndex]
			) {
				return options.itemParameters[itemIndex][param];
			}
			if (param in params) {
				return params[param];
			}
			return defaultValue;
		}),
		getNode: vi.fn(() => mockNode),
		getCredentials: vi.fn(async () => credentials),
		continueOnFail: vi.fn(() => options.continueOnFail ?? false),
		helpers: {
			httpRequest: vi.fn(async (reqOpts: IHttpRequestOptions) => {
				if (options.httpHandler) {
					return await options.httpHandler(reqOpts);
				}
				// Default Google Sheets export response
				return csvData;
			}),
			httpRequestWithAuthentication: vi.fn(
				async function (this: unknown, _credName: string, reqOpts: IHttpRequestOptions) {
					if (options.httpHandler) {
						return await options.httpHandler(reqOpts);
					}
					// Default template fields response (includes default template values to test clearing)
					if (reqOpts.url?.includes('/api/v1/templates/fields')) {
						return {
							id: 'tmpl_123',
							fields: [
								{ id: 'comp_billto', type: 'billTo', value: 'ABC Company' },
								{ id: 'comp_email', type: 'textarea', value: 'abc@example.com' },
								{ id: 'comp_notes', type: 'notes', value: 'Old template notes' },
								{ id: 'tbl_id', type: 'table', value: [{ description: 'Laptop' }, { description: 'Keyboard' }] },
							],
						};
					}
					// Default create response
					if (reqOpts.url?.includes('/api/v1/n8n/invoices/create')) {
						return {
							statusCode: 200,
							headers: {
								'x-invoice-count': '1',
								'x-invoice-ids': 'inv_created_1',
							},
							body: Buffer.from('%PDF-1.4 test pdf'),
						};
					}
					// Default summary response
					if (reqOpts.url?.includes('/api/v1/n8n/reports/summary')) {
						return {
							generatedAt: '2026-10-27T00:00:00Z',
							currencies: [{ currency: 'USD', invoiceCount: 5, totalValue: 500 }],
						};
					}
					// Default trends response
					if (reqOpts.url?.includes('/api/v1/n8n/reports/trends')) {
						return {
							generatedAt: '2026-10-27T00:00:00Z',
							period: 'monthly',
							currencies: [{ currency: 'USD', series: [] }],
						};
					}
					return {};
				},
			),
			prepareBinaryData: vi.fn(async (buffer: Buffer, fileName: string, mimeType: string) => ({
				data: buffer.toString('base64'),
				fileName,
				mimeType,
			})),
		},
	};

	return context as unknown as IExecuteFunctions;
}

describe('InvoicingBuilder Google Sheets-based Create Invoice Workflow', () => {
	const node = new InvoicingBuilder();

	it('retrieves spreadsheet, clears template defaults, populates spreadsheet values, and creates invoice', async () => {
		let capturedCreateBody: {
			invoices: Array<{
				fields: {
					comp_billto: string;
					comp_email: string;
					comp_notes: string;
					tbl_id: Array<{ description: string; rate: string }>;
				};
			}>;
		} | null = null;

		const context = createMockExecuteContext({
			sheetCsvData: `"Customer Name","Customer Email","Item","Quantity","Rate"
"XYZ Company","xyz@example.com","Monitor",1,200
`,
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/templates/fields')) {
					return {
						id: 'tmpl_123',
						fields: [
							{ id: 'comp_billto', type: 'billTo', value: 'ABC Company' },
							{ id: 'comp_email', type: 'textarea', value: 'abc@example.com' },
							{ id: 'comp_notes', type: 'notes', value: 'Old template notes' },
							{ id: 'tbl_id', type: 'table', value: [{ description: 'Laptop' }, { description: 'Keyboard' }] },
						],
					};
				}
				if (opts.url?.includes('/api/v1/n8n/invoices/create')) {
					capturedCreateBody = opts.body as typeof capturedCreateBody;
					return {
						statusCode: 200,
						headers: {
							'x-invoice-count': '1',
							'x-invoice-ids': 'inv_created_1',
						},
						body: Buffer.from('%PDF-1.4 test pdf'),
					};
				}
				// Gviz CSV export
				return `"Customer Name","Customer Email","Item","Quantity","Rate"\n"XYZ Company","xyz@example.com","Monitor",1,200\n`;
			},
		});

		const result = await node.execute.call(context);
		expect(result).toHaveLength(1);
		expect(result[0]).toHaveLength(1);
		expect(result[0][0].json.success).toBe(true);
		expect(result[0][0].json.invoiceCount).toBe(1);
		expect(result[0][0].json.fileName).toBe('invoice.pdf');
		expect(result[0][0].json.spreadsheetId).toBe('test_sheet_123');
		expect(result[0][0].json.worksheet).toBe('Sheet1');
		expect(result[0][0].binary?.data).toBeDefined();

		// Verify Requirement 3: Template Clearing & Spreadsheet Mapping
		expect(capturedCreateBody).not.toBeNull();
		const invoice = capturedCreateBody!.invoices[0];
		expect(invoice.fields.comp_billto).toBe('XYZ Company');
		expect(invoice.fields.comp_email).toBe('xyz@example.com');
		// comp_notes was not in spreadsheet, so it is cleared to '' rather than retaining 'Old template notes'
		expect(invoice.fields.comp_notes).toBe('');
		// Line items completely replaced by Monitor; Laptop and Keyboard are gone
		expect(invoice.fields.tbl_id).toHaveLength(1);
		expect(invoice.fields.tbl_id[0].description).toBe('Monitor');
		expect(invoice.fields.tbl_id[0].rate).toBe('200');
	});

	it('populates template automatically when user provides only spreadsheet and templateId (no manual mappings)', async () => {
		let capturedCreateBody: {
			invoices: Array<{
				fields: {
					comp_billto?: string;
					tbl_id?: Array<{ description: string; quantity: string; rate: string; amount: string }>;
				};
			}>;
		} | null = null;

		const context = createMockExecuteContext({
			sheetCsvData: `"Description","Qty.","Rate","Amount","Bill To","Date"
"Web Design",2,1500,3000,"Acme Corp","2026-10-27"
"Hosting",1,200,200,"Acme Corp","2026-10-27"
`,
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/templates/fields')) {
					return {
						id: 'tmpl_123',
						fields: [
							{ id: 'comp_billto', type: 'billTo', label: 'Bill To', value: 'Default Company' },
							{ id: 'comp_notes', type: 'notes', label: 'Notes', value: 'Default Notes' },
							{ id: 'tbl_id', type: 'table', label: 'Table', value: [{ description: 'Old Item' }] },
						],
					};
				}
				if (opts.url?.includes('/api/v1/n8n/invoices/create')) {
					capturedCreateBody = opts.body as typeof capturedCreateBody;
					return {
						statusCode: 200,
						headers: {
							'x-invoice-count': '1',
							'x-invoice-ids': 'inv_created_1',
						},
						body: Buffer.from('%PDF-1.4 test pdf'),
					};
				}
				return `"Description","Qty.","Rate","Amount","Bill To","Date"\n"Web Design",2,1500,3000,"Acme Corp","2026-10-27"\n"Hosting",1,200,200,"Acme Corp","2026-10-27"\n`;
			},
		});

		const result = await node.execute.call(context);
		expect(result[0][0].json.success).toBe(true);
		expect(result[0][0].json.invoiceCount).toBe(1);

		// Verify automatic population occurred
		expect(capturedCreateBody).not.toBeNull();
		const inv = capturedCreateBody!.invoices[0];
		expect(inv.fields.comp_billto).toBe('Acme Corp');
		// Notes was omitted from spreadsheet, so cleared
		expect((inv.fields as Record<string, unknown>).comp_notes).toBe('');

		// Line items auto-mapped
		const table = inv.fields.tbl_id!;
		expect(table).toHaveLength(2);
		expect(table[0].description).toBe('Web Design');
		expect(table[0].quantity).toBe('2');
		expect(table[0].rate).toBe('1500');
		expect(table[0].amount).toBe('3000');
		expect(table[1].description).toBe('Hosting');
		expect(table[1].quantity).toBe('1');
		expect(table[1].rate).toBe('200');
		expect(table[1].amount).toBe('200');
	});

	it('throws error when spreadsheet contains no data rows', async () => {
		const context = createMockExecuteContext({
			sheetCsvData: `"Customer Name","Customer Email","Item"\n`, // headers only, 0 data rows
		});

		await expect(node.execute.call(context)).rejects.toThrow(NodeOperationError);
		await expect(node.execute.call(context)).rejects.toThrow(
			'The worksheet "Sheet1" contains column headers but no data rows.',
		);
	});

	it('only exposes allowed create invoice properties in description', () => {
		const createFields = invoiceFields.filter((f) => {
			const ops = f.displayOptions?.show?.operation as string[] | undefined;
			return ops?.includes('create');
		});
		const fieldNames = createFields.map((f) => f.name);
		expect(fieldNames).toEqual([
			'templateId',
			'source',
			'spreadsheet',
			'worksheet',
			'clientId',
			'invoiceNumber',
			'poNumber',
			'issueDate',
			'dueDate',
			'lineItems',
			'additionalFields',
			'format',
			'sendToClient',
		]);

		const unwanted = [
			'clientName',
			'clientEmail',
			'billTo',
			'shipTo',
			'googleAuthType',
			'googleApiKey',
			'groupBy',
			'headerFieldMappings',
			'lineItemColumns',
			'externalIdColumn',
			'saveToHistory',
			'binaryPropertyName',
		];
		for (const name of unwanted) {
			expect(fieldNames).not.toContain(name);
		}
	});

	it('supports sendToClient toggle: passes flag to backend and extracts clientEmail and clientName from spreadsheet', async () => {
		let capturedCreateBody: {
			invoices: Array<{
				clientEmail?: string;
				clientName?: string;
				fields: { tbl_id: unknown[] };
			}>;
			sendToClient?: boolean;
		} | null = null;

		const context = createMockExecuteContext({
			sheetCsvData: `"Client Name","Client Email","Item","Quantity","Rate"
"Acme Inc","billing@acme.com","Consulting",5,100
`,
			parameters: {
				sendToClient: true,
			},
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/templates/fields')) {
					return { fields: [{ id: 'tbl_id', type: 'table' }] };
				}
				if (opts.url?.includes('/api/v1/n8n/invoices/create')) {
					capturedCreateBody = opts.body as typeof capturedCreateBody;
					return {
						statusCode: 200,
						headers: {
							'x-invoice-count': '1',
							'x-invoice-ids': 'inv_email_1',
							'x-invoices-emailed': 'billing@acme.com',
						},
						body: Buffer.from('%PDF-1.4 emailed invoice'),
					};
				}
				return `"Client Name","Client Email","Item","Quantity","Rate"\n"Acme Inc","billing@acme.com","Consulting",5,100\n`;
			},
		});

		const result = await node.execute.call(context);
		expect(result[0][0].json.success).toBe(true);
		expect(result[0][0].json.sendToClient).toBe(true);
		expect(result[0][0].json.emailedTo).toEqual(['billing@acme.com']);

		expect(capturedCreateBody).not.toBeNull();
		expect(capturedCreateBody!.sendToClient).toBe(true);
		expect(capturedCreateBody!.invoices[0].clientEmail).toBe('billing@acme.com');
		expect(capturedCreateBody!.invoices[0].clientName).toBe('Acme Inc');
	});

	it('groups rows into 2 invoices and creates zip archive', async () => {
		const context = createMockExecuteContext({
			sheetCsvData: `"OrderId","Customer Name","Item","Quantity","Rate"
"INV-1","Acme Corp","Monitor",1,200
"INV-2","Beta LLC","Laptop",1,1000
`,
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/templates/fields')) {
					return { fields: [{ id: 'tbl_id', type: 'table' }] };
				}
				if (opts.url?.includes('/api/v1/n8n/invoices/create')) {
					return {
						statusCode: 200,
						headers: {
							'x-invoice-count': '2',
							'x-invoice-ids': 'inv_1,inv_2',
						},
						body: Buffer.from('PK-zip-content'),
					};
				}
				return `"OrderId","Customer Name","Item","Quantity","Rate"\n"INV-1","Acme Corp","Monitor",1,200\n"INV-2","Beta LLC","Laptop",1,1000\n`;
			},
		});

		const result = await node.execute.call(context);
		expect(result[0][0].json.success).toBe(true);
		expect(result[0][0].json.invoiceCount).toBe(2);
		expect(result[0][0].json.fileName).toBe('invoices.zip');
		expect(result[0][0].json.invoiceIds).toEqual(['inv_1', 'inv_2']);
	});

	it('uses first 2 invoices and ignores others when spreadsheet yields > 2 invoice groups', async () => {
		let capturedCreateBody: { invoices: Array<{ externalId?: string }> } | null = null;
		const context = createMockExecuteContext({
			sheetCsvData: `"OrderId","Item","Rate"
"INV-1","Item 1",100
"INV-2","Item 2",200
"INV-3","Item 3",300
`,
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/templates/fields')) {
					return { fields: [{ id: 'tbl_id', type: 'table' }] };
				}
				if (opts.url?.includes('/api/v1/n8n/invoices/create')) {
					capturedCreateBody = opts.body as { invoices: Array<{ externalId?: string }> };
					return {
						statusCode: 200,
						headers: {
							'x-invoice-count': '2',
							'x-invoice-ids': 'inv_1,inv_2',
						},
						body: Buffer.from('PK-zip-content'),
					};
				}
				return `"OrderId","Item","Rate"\n"INV-1","Item 1",100\n"INV-2","Item 2",200\n"INV-3","Item 3",300\n`;
			},
		});

		const result = await node.execute.call(context);
		expect(result[0][0].json.success).toBe(true);
		expect(result[0][0].json.invoiceCount).toBe(2);
		expect(result[0][0].json.fileName).toBe('invoices.zip');

		// Verify create API received only the first 2 invoices; INV-3 was ignored
		expect(capturedCreateBody).not.toBeNull();
		expect(capturedCreateBody!.invoices).toHaveLength(2);
		expect(capturedCreateBody!.invoices[0].externalId).toBe('INV-1');
		expect(capturedCreateBody!.invoices[1].externalId).toBe('INV-2');
	});

	it('calculates invoice count based on invoice data, not on row or column numbers', async () => {
		let capturedCreateBody: { invoices: Array<{ fields: { tbl_id: unknown[] } }> } | null = null;
		// 5 rows in spreadsheet, but no identifier column => exactly 1 invoice with 5 line items (not 5 invoices)
		const context = createMockExecuteContext({
			sheetCsvData: `"Item","Quantity","Rate"
"Item A",1,10
"Item B",2,20
"Item C",1,30
"Item D",3,40
"Item E",1,50
`,
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/templates/fields')) {
					return { fields: [{ id: 'tbl_id', type: 'table' }] };
				}
				if (opts.url?.includes('/api/v1/n8n/invoices/create')) {
					capturedCreateBody = opts.body as { invoices: Array<{ fields: { tbl_id: unknown[] } }> };
					return {
						statusCode: 200,
						headers: {
							'x-invoice-count': '1',
							'x-invoice-ids': 'inv_1',
						},
						body: Buffer.from('%PDF-1.4 single invoice'),
					};
				}
				return `"Item","Quantity","Rate"\n"Item A",1,10\n"Item B",2,20\n"Item C",1,30\n"Item D",3,40\n"Item E",1,50\n`;
			},
		});

		const result = await node.execute.call(context);
		expect(result[0][0].json.success).toBe(true);
		expect(result[0][0].json.invoiceCount).toBe(1);
		expect(result[0][0].json.fileName).toBe('invoice.pdf');

		// Verify that 5 rows did NOT produce 5 invoices, but 1 invoice containing all 5 line items
		expect(capturedCreateBody).not.toBeNull();
		expect(capturedCreateBody!.invoices).toHaveLength(1);
		expect(capturedCreateBody!.invoices[0].fields.tbl_id).toHaveLength(5);
	});

	it('auto-detects invoice groups from data and keeps line items separate', async () => {
		let capturedCreateBody: {
			invoices: Array<{
				externalId?: string;
				fields: { tbl_id: Array<{ description: string }> };
			}>;
		} | null = null;

		const context = createMockExecuteContext({
			sheetCsvData: `"Invoice #","Customer Name","Item","Rate"
"INV-101","Acme Corp","Monitor",200
"INV-101","Acme Corp","Mouse",25
"INV-102","Beta LLC","Laptop",1000
"INV-102","Beta LLC","Keyboard",75
`,
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/templates/fields')) {
					return { fields: [{ id: 'tbl_id', type: 'table' }] };
				}
				if (opts.url?.includes('/api/v1/n8n/invoices/create')) {
					capturedCreateBody = opts.body as {
						invoices: Array<{
							externalId?: string;
							fields: { tbl_id: Array<{ description: string }> };
						}>;
					};
					return {
						statusCode: 200,
						headers: {
							'x-invoice-count': '2',
							'x-invoice-ids': 'inv_101,inv_102',
						},
						body: Buffer.from('PK-zip-content'),
					};
				}
				return `"Invoice #","Customer Name","Item","Rate"\n"INV-101","Acme Corp","Monitor",200\n"INV-101","Acme Corp","Mouse",25\n"INV-102","Beta LLC","Laptop",1000\n"INV-102","Beta LLC","Keyboard",75\n`;
			},
		});

		const result = await node.execute.call(context);
		expect(result[0][0].json.success).toBe(true);
		expect(result[0][0].json.invoiceCount).toBe(2);

		// Verify that line items were NOT combined into 1 invoice
		expect(capturedCreateBody).not.toBeNull();
		expect(capturedCreateBody!.invoices).toHaveLength(2);

		// Invoice 1 only has Monitor and Mouse
		const inv1Items = capturedCreateBody!.invoices[0].fields.tbl_id;
		expect(inv1Items).toHaveLength(2);
		expect(inv1Items[0].description).toBe('Monitor');
		expect(inv1Items[1].description).toBe('Mouse');

		// Invoice 2 only has Laptop and Keyboard
		const inv2Items = capturedCreateBody!.invoices[1].fields.tbl_id;
		expect(inv2Items).toHaveLength(2);
		expect(inv2Items[0].description).toBe('Laptop');
		expect(inv2Items[1].description).toBe('Keyboard');
	});
});

describe('InvoicingBuilder Create Operation - Error Handling & Edge Cases', () => {
	const node = new InvoicingBuilder();

	it('maps 401 error to Invalid, revoked or expired API key', async () => {
		const context = createMockExecuteContext({
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/templates/fields')) {
					const error: HttpErrorPayload = new Error('Unauthorized');
					error.response = { status: 401, data: { message: 'Unauthorized' } };
					throw error;
				}
				return DEFAULT_SHEET_CSV;
			},
		});

		await expect(node.execute.call(context)).rejects.toThrow(NodeApiError);
		try {
			await node.execute.call(context);
		} catch (err: unknown) {
			const error = err as NodeApiError;
			expect(error.message).toBe('Invalid, revoked or expired API key');
			expect(error.httpCode).toBe('401');
		}
	});

	it('maps 429 error to Rate limit exceeded with retryAfter', async () => {
		const context = createMockExecuteContext({
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/templates/fields')) {
					const error: HttpErrorPayload = new Error('Too Many Requests');
					error.response = {
						status: 429,
						data: { message: 'Rate limit exceeded', retryAfter: 15 },
					};
					throw error;
				}
				return DEFAULT_SHEET_CSV;
			},
		});

		try {
			await node.execute.call(context);
			expect.fail('Should have thrown NodeApiError');
		} catch (err: unknown) {
			const error = err as NodeApiError;
			expect(error).toBeInstanceOf(NodeApiError);
			expect(error.message).toBe('Rate limit exceeded; retry in 15 seconds');
		}
	});

	it('maps 400 validation error from backend', async () => {
		const context = createMockExecuteContext({
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/templates/fields')) {
					const error: HttpErrorPayload = new Error('Bad Request');
					error.response = {
						status: 400,
						data: { message: 'Template tmpl_invalid does not exist' },
					};
					throw error;
				}
				return DEFAULT_SHEET_CSV;
			},
		});

		try {
			await node.execute.call(context);
			expect.fail('Should have thrown NodeApiError');
		} catch (err: unknown) {
			const error = err as NodeApiError;
			expect(error).toBeInstanceOf(NodeApiError);
			expect(error.message).toBe('Template tmpl_invalid does not exist');
		}
	});

	it('supports continueOnFail()', async () => {
		const context = createMockExecuteContext({
			continueOnFail: true,
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/templates/fields')) {
					const error: HttpErrorPayload = new Error('Unauthorized');
					error.response = { status: 401, data: { message: 'Unauthorized' } };
					throw error;
				}
				return DEFAULT_SHEET_CSV;
			},
		});

		const result = await node.execute.call(context);
		expect(result).toHaveLength(1);
		expect(result[0][0].json.error).toBeDefined();
	});
});

describe('InvoicingBuilder Generate Report Operation (Regression Tests)', () => {
	const node = new InvoicingBuilder();

	it('successfully fetches summary report and passes through unchanged json', async () => {
		const reportPayload = {
			generatedAt: '2026-10-27T10:00:00Z',
			filters: { from: '2026-01-01', to: '2026-12-31', dateBasis: 'issueDate', status: 'all', currency: null },
			scan: { scanned: 10, included: 8, truncated: false, skipped: { payslips: 0, noTotal: 1, noDate: 1, corrupt: 0 } },
			currencies: [
				{
					currency: 'USD',
					invoiceCount: 5,
					totalValue: 1000,
					taxTotal: 100,
					averageInvoiceValue: 200,
					paid: { count: 3, value: 600 },
					unpaid: { count: 2, value: 400 },
					overdue: { count: 0, value: 0 },
					monthly: [],
				},
				{
					currency: 'EUR',
					invoiceCount: 3,
					totalValue: 500,
					taxTotal: 50,
					averageInvoiceValue: 166.67,
					paid: { count: 2, value: 300 },
					unpaid: { count: 1, value: 200 },
					overdue: { count: 0, value: 0 },
					monthly: [],
				},
			],
		};

		let capturedQs: IDataObject | undefined;
		const context = createMockExecuteContext({
			items: [{ json: {} }],
			parameters: {
				operation: 'generateReport',
				from: '2026-01-01T00:00:00.000Z',
				to: '2026-12-31T00:00:00.000Z',
				status: 'all',
			},
			httpHandler: async (opts) => {
				capturedQs = opts.qs as IDataObject;
				return reportPayload;
			},
		});

		const result = await node.execute.call(context);
		expect(capturedQs?.dateBasis).toBeUndefined();
		expect(result[0][0].json).toEqual(reportPayload);
	});

	it('passes sendToUser=true in qs to summary report endpoint when enabled', async () => {
		let capturedQs: IDataObject | undefined;
		const context = createMockExecuteContext({
			items: [{ json: {} }],
			parameters: {
				operation: 'generateReport',
				sendToUser: true,
			},
			httpHandler: async (opts) => {
				capturedQs = opts.qs as IDataObject;
				return { generatedAt: '2026-10-27T10:00:00Z', sendToUser: true };
			},
		});

		const result = await node.execute.call(context);
		expect(capturedQs?.sendToUser).toBe(true);
		expect(capturedQs?.currency).toBeUndefined();
		expect(result[0][0].json.sendToUser).toBe(true);
	});

	it('validates that from <= to in report date range', async () => {
		const httpSpy = vi.fn();
		const context = createMockExecuteContext({
			items: [{ json: {} }],
			parameters: {
				operation: 'generateReport',
				from: '2026-12-31T00:00:00.000Z',
				to: '2026-01-01T00:00:00.000Z',
			},
			httpHandler: httpSpy,
		});

		await expect(node.execute.call(context)).rejects.toThrow(NodeOperationError);
		await expect(node.execute.call(context)).rejects.toThrow(
			'The "From" date must be earlier than or equal to the "To" date.',
		);
		expect(httpSpy).not.toHaveBeenCalled();
	});

	it('handles 401 on report endpoint', async () => {
		const context = createMockExecuteContext({
			items: [{ json: {} }],
			parameters: { operation: 'generateReport' },
			httpHandler: async () => {
				const error: HttpErrorPayload = new Error('Unauthorized');
				error.response = { status: 401, data: { message: 'Unauthorized' } };
				throw error;
			},
		});

		try {
			await node.execute.call(context);
			expect.fail('Should throw');
		} catch (err: unknown) {
			const error = err as NodeApiError;
			expect(error).toBeInstanceOf(NodeApiError);
			expect(error.message).toBe('Invalid, revoked or expired API key');
		}
	});
});

describe('InvoicingBuilder Analyse Trends Operation (Regression Tests)', () => {
	const node = new InvoicingBuilder();

	it('successfully calls trends endpoint and returns result unchanged', async () => {
		const trendsPayload = {
			generatedAt: '2026-10-27T00:00:00Z',
			period: 'monthly',
			dateBasis: 'issueDate',
			range: { from: '2025-11-01', to: '2026-10-31' },
			scan: { scanned: 20, included: 20, truncated: false, skipped: { payslips: 0, noTotal: 0, noDate: 0, corrupt: 0 } },
			currencies: [
				{
					currency: 'USD',
					series: [
						{
							periodKey: '2026-10',
							start: '2026-10-01',
							end: '2026-10-31',
							isPartial: true,
							invoiceCount: 4,
							totalValue: 800,
							taxTotal: 80,
							paidValue: 500,
							change: null,
						},
					],
				},
			],
		};

		let capturedQs: IDataObject | undefined;
		const context = createMockExecuteContext({
			items: [{ json: {} }],
			parameters: {
				operation: 'analyseTrends',
				period: 'monthly',
				periods: 12,
			},
			httpHandler: async (opts) => {
				capturedQs = opts.qs as IDataObject;
				return trendsPayload;
			},
		});

		const result = await node.execute.call(context);
		expect(capturedQs?.dateBasis).toBeUndefined();
		expect(capturedQs?.currency).toBeUndefined();
		expect(result[0][0].json).toEqual(trendsPayload);
	});

	it('passes sendToUser=true in qs to trends endpoint when enabled', async () => {
		let capturedQs: IDataObject | undefined;
		const context = createMockExecuteContext({
			items: [{ json: {} }],
			parameters: {
				operation: 'analyseTrends',
				sendToUser: true,
			},
			httpHandler: async (opts) => {
				capturedQs = opts.qs as IDataObject;
				return { generatedAt: '2026-10-27T00:00:00Z', sendToUser: true };
			},
		});

		const result = await node.execute.call(context);
		expect(capturedQs?.sendToUser).toBe(true);
		expect(result[0][0].json.sendToUser).toBe(true);
	});

	it('handles 429 on trends endpoint', async () => {
		const context = createMockExecuteContext({
			items: [{ json: {} }],
			parameters: { operation: 'analyseTrends' },
			httpHandler: async () => {
				const error: HttpErrorPayload = new Error('Rate limit');
				error.response = { status: 429, data: { retryAfter: 30 } };
				throw error;
			},
		});

		try {
			await node.execute.call(context);
			expect.fail('Should throw');
		} catch (err: unknown) {
			const error = err as NodeApiError;
			expect(error).toBeInstanceOf(NodeApiError);
			expect(error.message).toBe('Rate limit exceeded; retry in 30 seconds');
		}
	});
});

describe('InvoicingBuilder Direct Input Create Invoice Workflow', () => {
	const node = new InvoicingBuilder();

	it('creates an invoice directly from workflow parameters without spreadsheet', async () => {
		let capturedCreateBody: {
			invoices: Array<{
				templateId: string;
				format: string;
				clientEmail?: string;
				clientName?: string;
				fields: Record<string, unknown>;
			}>;
			saveToHistory: boolean;
			sendToClient: boolean;
		} | null = null;

		const context = createMockExecuteContext({
			parameters: {
				resource: 'invoice',
				operation: 'create',
				source: 'direct',
				templateId: 'tmpl_123',
				clientId: 'client_direct_1',
				format: 'pdf',
				invoiceNumber: 'INV-2026-001',
				poNumber: 'PO-2026-999',
				issueDate: '2026-10-28',
				dueDate: '2026-11-28',
				sendToClient: true,
				lineItems: {
					item: [
						{
							description: 'Consulting Services',
							quantity: 5,
							rate: 200,
							tax: '10%',
						},
					],
				},
				additionalFields: {
					notes: 'Custom notes from workflow',
					logo: 'https://example.com/logo.png',
					signature: 'data:image/png;base64,sig123',
				},
			},
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/clients/client_direct_1')) {
					return {
						id: 'client_direct_1',
						name: 'Direct Client Inc',
						email: 'billing@directclient.com',
						billTo: 'Direct Client Inc\n456 Market St',
						shipTo: 'Direct Warehouse\n789 Industrial Rd',
					};
				}
				if (opts.url?.includes('/api/v1/templates/fields')) {
					return {
						id: 'tmpl_123',
						fields: [
							{ id: 'comp_billto', type: 'billTo', value: 'Old Default' },
							{ id: 'comp_shipto', type: 'shipTo', value: 'Old Ship' },
							{ id: 'comp_invnum', type: 'invoiceNumber', value: 'Old #000' },
							{ id: 'comp_ponum', type: 'poNumber', value: 'Old PO' },
							{ id: 'comp_logo', type: 'addLogo', value: 'Old Logo' },
							{ id: 'comp_sig', type: 'signature', value: 'Old Signature' },
							{ id: 'tbl_id', type: 'table', value: [{ description: 'Old Item' }] },
						],
					};
				}
				if (opts.url?.includes('/api/v1/n8n/invoices/create')) {
					capturedCreateBody = opts.body as typeof capturedCreateBody;
					return {
						statusCode: 200,
						headers: {
							'x-invoice-count': '1',
							'x-invoice-ids': 'inv_direct_1',
							'x-invoices-emailed': 'billing@directclient.com',
						},
						body: Buffer.from('%PDF-1.4 direct test pdf'),
					};
				}
				return {};
			},
		});

		const result = await node.execute.call(context);
		expect(result).toHaveLength(1);
		expect(result[0][0].json.success).toBe(true);
		expect(result[0][0].json.source).toBe('direct');
		expect(result[0][0].json.fileName).toBe('invoice.pdf');
		expect(result[0][0].json.sendToClient).toBe(true);
		expect(result[0][0].json.emailedTo).toEqual(['billing@directclient.com']);
		expect(result[0][0].binary?.data).toBeDefined();

		expect(capturedCreateBody).not.toBeNull();
		const invoice = capturedCreateBody!.invoices[0];
		expect(invoice.templateId).toBe('tmpl_123');
		expect(invoice.clientName).toBe('Direct Client Inc');
		expect(invoice.clientEmail).toBe('billing@directclient.com');
		expect(invoice.fields.billTo).toBe('Direct Client Inc\n456 Market St');
		expect(invoice.fields.shipTo).toBe('Direct Warehouse\n789 Industrial Rd');
		expect(invoice.fields.invoiceNumber).toBe('INV-2026-001');
		expect(invoice.fields.poNumber).toBe('PO-2026-999');
		expect(invoice.fields.customDate).toBe('2026-10-28');
		expect(invoice.fields.dueDate).toBe('2026-11-28');
		expect(invoice.fields.notes).toBe('Custom notes from workflow');
		expect(invoice.fields.addLogo).toBe('https://example.com/logo.png');
		expect(invoice.fields.signature).toBe('data:image/png;base64,sig123');

		// Line items check
		const lineItems = invoice.fields.table as Array<{
			description: string;
			quantity: string;
			rate: string;
			tax: string;
			amount: string;
		}>;
		expect(lineItems).toHaveLength(1);
		expect(lineItems[0].description).toBe('Consulting Services');
		expect(lineItems[0].quantity).toBe('5');
		expect(lineItems[0].rate).toBe('200');
		expect(lineItems[0].tax).toBe('10');
		expect(lineItems[0].amount).toBe('1100.00');
	});

	it('falls back to input item json lineItems when parameter is omitted', async () => {
		let capturedCreateBody: {
			invoices: Array<{
				clientName?: string;
				clientEmail?: string;
				fields: Record<string, unknown>;
			}>;
		} | null = null;

		const context = createMockExecuteContext({
			items: [
				{
					json: {
						lineItems: [
							{ description: 'Design Work', quantity: 2, rate: 500 },
							{ description: 'SEO Work', quantity: 1, rate: 300 },
						],
					},
				},
			],
			parameters: {
				resource: 'invoice',
				operation: 'create',
				source: 'direct',
				templateId: 'tmpl_123',
				clientId: 'client_json',
				format: 'png',
			},
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/clients/client_json')) {
					return {
						id: 'client_json',
						name: 'Json Corp',
						email: 'contact@jsoncorp.com',
						billTo: 'Json Corp Suite 100',
					};
				}
				if (opts.url?.includes('/api/v1/templates/fields')) {
					return { id: 'tmpl_123', fields: [] };
				}
				if (opts.url?.includes('/api/v1/n8n/invoices/create')) {
					capturedCreateBody = opts.body as typeof capturedCreateBody;
					return {
						statusCode: 200,
						headers: {
							'x-invoice-count': '1',
							'x-invoice-ids': 'inv_json_1',
						},
						body: Buffer.from('PNG test binary'),
					};
				}
				return {};
			},
		});

		const result = await node.execute.call(context);
		expect(result[0][0].json.fileName).toBe('invoice.png');
		expect(capturedCreateBody).not.toBeNull();
		const invoice = capturedCreateBody!.invoices[0];
		expect(invoice.clientName).toBe('Json Corp');
		expect(invoice.clientEmail).toBe('contact@jsoncorp.com');
		expect(invoice.fields.billTo).toBe('Json Corp Suite 100');

		const lineItems = invoice.fields.table as Array<{ description: string; rate: string }>;
		expect(lineItems).toHaveLength(2);
		expect(lineItems[0].description).toBe('Design Work');
		expect(lineItems[1].description).toBe('SEO Work');
	});

	it('throws error when clientId is missing for direct invoice creation', async () => {
		const context = createMockExecuteContext({
			parameters: {
				resource: 'invoice',
				operation: 'create',
				source: 'direct',
				templateId: 'tmpl_123',
			},
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/templates/fields')) {
					return { id: 'tmpl_123', fields: [] };
				}
				return {};
			},
		});

		await expect(node.execute.call(context)).rejects.toThrow(NodeOperationError);
		await expect(node.execute.call(context)).rejects.toThrow(
			'Client Name or ID is required for direct invoice creation. Please select a client.',
		);
	});

	it('auto-fills Bill To, Ship To, client name, and email from selected client when parameters are blank', async () => {
		let capturedCreateBody: {
			invoices: Array<{
				clientName?: string;
				clientEmail?: string;
				fields: Record<string, unknown>;
			}>;
		} | null = null;

		const context = createMockExecuteContext({
			parameters: {
				resource: 'invoice',
				operation: 'create',
				source: 'direct',
				templateId: 'tmpl_123',
				clientId: 'client_stark',
				format: 'pdf',
				lineItems: {
					item: [{ description: 'Arc Reactor', quantity: 1, rate: 50000 }],
				},
			},
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/clients/client_stark')) {
					return {
						id: 'client_stark',
						name: 'Stark Industries',
						email: 'tony@stark.com',
						billTo: '10880 Malibu Point, CA',
						shipTo: 'Avengers Compound, NY',
					};
				}
				if (opts.url?.includes('/api/v1/templates/fields')) {
					return { id: 'tmpl_123', fields: [] };
				}
				if (opts.url?.includes('/api/v1/n8n/invoices/create')) {
					capturedCreateBody = opts.body as typeof capturedCreateBody;
					return {
						statusCode: 200,
						headers: {
							'x-invoice-count': '1',
							'x-invoice-ids': 'inv_stark_1',
						},
						body: Buffer.from('PDF test binary'),
					};
				}
				return {};
			},
		});

		const result = await node.execute.call(context);
		expect(result[0][0].json.success).toBe(true);
		expect(capturedCreateBody).not.toBeNull();
		const invoice = capturedCreateBody!.invoices[0];
		expect(invoice.clientName).toBe('Stark Industries');
		expect(invoice.clientEmail).toBe('tony@stark.com');
		expect(invoice.fields.billTo).toBe('10880 Malibu Point, CA');
		expect(invoice.fields.shipTo).toBe('Avengers Compound, NY');
	});
});

describe('InvoicingBuilder Report Resource Workflow', () => {
	const node = new InvoicingBuilder();

	it('executes summary report under resource: report, operation: summary', async () => {
		let capturedQs: IDataObject | undefined;
		const context = createMockExecuteContext({
			parameters: {
				resource: 'report',
				operation: 'summary',
				from: '2026-01-01',
				to: '2026-10-28',
				status: 'paid',
				sendToUser: true,
			},
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/n8n/reports/summary')) {
					capturedQs = opts.qs as IDataObject;
					return {
						generatedAt: '2026-10-28T00:00:00Z',
						status: 'paid',
						sendToUser: true,
						currencies: [{ currency: 'USD', invoiceCount: 10, totalValue: 10000 }],
					};
				}
				return {};
			},
		});

		const result = await node.execute.call(context);
		expect(capturedQs?.status).toBe('paid');
		expect(capturedQs?.from).toBe('2026-01-01');
		expect(capturedQs?.to).toBe('2026-10-28');
		expect(capturedQs?.sendToUser).toBe(true);
		expect(result[0][0].json.currencies).toBeDefined();
	});

	it('executes trends report under resource: report, operation: trends', async () => {
		let capturedQs: IDataObject | undefined;
		const context = createMockExecuteContext({
			parameters: {
				resource: 'report',
				operation: 'trends',
				period: 'quarterly',
				periods: 4,
				sendToUser: false,
			},
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/n8n/reports/trends')) {
					capturedQs = opts.qs as IDataObject;
					return {
						generatedAt: '2026-10-28T00:00:00Z',
						period: 'quarterly',
						currencies: [{ currency: 'USD', series: [] }],
					};
				}
				return {};
			},
		});

		const result = await node.execute.call(context);
		expect(capturedQs?.period).toBe('quarterly');
		expect(capturedQs?.periods).toBe(4);
		expect(result[0][0].json.period).toBe('quarterly');
	});
});

describe('InvoicingBuilder Client Resource Workflow', () => {
	const node = new InvoicingBuilder();

	it('creates a client with full properties', async () => {
		let capturedBody: IDataObject | undefined;
		const context = createMockExecuteContext({
			parameters: {
				resource: 'client',
				operation: 'create',
				name: 'Stark Industries',
				email: 'tony@stark.com',
				billTo: '10880 Malibu Point',
				shipTo: 'Avengers Compound',
			},
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/clients') && opts.method === 'POST') {
					capturedBody = opts.body as IDataObject;
					return {
						id: 'client_stark',
						name: 'Stark Industries',
						email: 'tony@stark.com',
						billTo: '10880 Malibu Point',
						shipTo: 'Avengers Compound',
					};
				}
				return {};
			},
		});

		const result = await node.execute.call(context);
		expect(capturedBody).toEqual({
			name: 'Stark Industries',
			email: 'tony@stark.com',
			billTo: '10880 Malibu Point',
			shipTo: 'Avengers Compound',
		});
		expect(result[0][0].json.id).toBe('client_stark');
		expect(result[0][0].json.name).toBe('Stark Industries');
	});

	it('gets a client by ID', async () => {
		let requestedUrl: string | undefined;
		const context = createMockExecuteContext({
			parameters: {
				resource: 'client',
				operation: 'get',
				clientId: 'client_123',
			},
			httpHandler: async (opts) => {
				requestedUrl = opts.url;
				return { id: 'client_123', name: 'Wayne Enterprises' };
			},
		});

		const result = await node.execute.call(context);
		expect(requestedUrl).toContain('/api/v1/clients/client_123');
		expect(result[0][0].json.id).toBe('client_123');
		expect(result[0][0].json.name).toBe('Wayne Enterprises');
	});

	it('gets all clients and returns multiple execution items', async () => {
		const context = createMockExecuteContext({
			parameters: {
				resource: 'client',
				operation: 'getAll',
				returnAll: true,
			},
			httpHandler: async () => {
				return [
					{ id: 'c_1', name: 'Client 1' },
					{ id: 'c_2', name: 'Client 2' },
				];
			},
		});

		const result = await node.execute.call(context);
		expect(result[0]).toHaveLength(2);
		expect(result[0][0].json.id).toBe('c_1');
		expect(result[0][1].json.id).toBe('c_2');
	});

	it('gets all clients respecting limit when returnAll is false', async () => {
		const context = createMockExecuteContext({
			parameters: {
				resource: 'client',
				operation: 'getAll',
				returnAll: false,
				limit: 1,
			},
			httpHandler: async () => {
				return [
					{ id: 'c_1', name: 'Client 1' },
					{ id: 'c_2', name: 'Client 2' },
				];
			},
		});

		const result = await node.execute.call(context);
		expect(result[0]).toHaveLength(1);
		expect(result[0][0].json.id).toBe('c_1');
	});

	it('updates a client', async () => {
		let capturedUpdateBody: IDataObject | undefined;
		const context = createMockExecuteContext({
			parameters: {
				resource: 'client',
				operation: 'update',
				clientId: 'client_123',
				updateFields: {
					name: 'Wayne Enterprises Updated',
					email: 'bruce@wayne.com',
				},
			},
			httpHandler: async (opts) => {
				if (opts.method === 'PUT' && opts.url?.includes('/api/v1/clients/client_123')) {
					capturedUpdateBody = opts.body as IDataObject;
					return { id: 'client_123', name: 'Wayne Enterprises Updated', email: 'bruce@wayne.com' };
				}
				return {};
			},
		});

		const result = await node.execute.call(context);
		expect(capturedUpdateBody).toEqual({
			name: 'Wayne Enterprises Updated',
			email: 'bruce@wayne.com',
		});
		expect(result[0][0].json.name).toBe('Wayne Enterprises Updated');
	});

	it('deletes a client', async () => {
		let requestedMethod: string | undefined;
		const context = createMockExecuteContext({
			parameters: {
				resource: 'client',
				operation: 'delete',
				clientId: 'client_123',
			},
			httpHandler: async (opts) => {
				requestedMethod = opts.method;
				return { success: true, message: 'Client deleted successfully.' };
			},
		});

		const result = await node.execute.call(context);
		expect(requestedMethod).toBe('DELETE');
		expect(result[0][0].json.success).toBe(true);
	});

	it('sends reminder to a client', async () => {
		let requestedUrl: string | undefined;
		let requestedMethod: string | undefined;
		const context = createMockExecuteContext({
			parameters: {
				resource: 'client',
				operation: 'sendReminder',
				clientId: 'client_123',
			},
			httpHandler: async (opts) => {
				requestedUrl = opts.url;
				requestedMethod = opts.method;
				return { success: true, message: 'Reminder sent.' };
			},
		});

		const result = await node.execute.call(context);
		expect(requestedMethod).toBe('POST');
		expect(requestedUrl).toContain('/api/v1/clients/client_123/remind');
		expect(result[0][0].json.success).toBe(true);
	});

	it('clientFields defines updateFields as resourceMapper and hides it until clientId is selected', () => {
		const updateFieldsParam = clientFields.find((f) => f.name === 'updateFields');
		expect(updateFieldsParam).toBeDefined();
		expect(updateFieldsParam?.type).toBe('resourceMapper');
		expect(updateFieldsParam?.typeOptions?.loadOptionsDependsOn).toEqual(['clientId']);
		expect(updateFieldsParam?.typeOptions?.resourceMapper?.resourceMapperMethod).toBe('getClientUpdateFields');
		expect(updateFieldsParam?.typeOptions?.resourceMapper?.addAllFields).toBe(true);
		expect(updateFieldsParam?.typeOptions?.resourceMapper?.supportAutoMap).toBe(false);
		expect(updateFieldsParam?.typeOptions?.resourceMapper?.valuesLabel).toBe('Client Details');
		expect(updateFieldsParam?.displayOptions?.hide?.clientId).toEqual(['']);
	});

	it('getClientUpdateFields fetches client details and populates defaultValues for Name, Email, Bill To, and Ship To', async () => {
		const mockLoadContext = {
			getCurrentNodeParameter: vi.fn((param: string) => (param === 'clientId' ? 'client_123' : undefined)),
			getNodeParameter: vi.fn((param: string, fallback?: unknown) => (param === 'clientId' ? 'client_123' : fallback)),
			getCredentials: vi.fn(async () => ({
				apiKey: 'ib_test_secret',
				baseUrl: 'https://api.invoicingbuilder.com',
			})),
			helpers: {
				httpRequestWithAuthentication: vi.fn(async () => ({
					id: 'client_123',
					name: 'Team Holland',
					email: 'teamram61@gmail.com',
					billTo: 'Psi Solutions, 1010 23rd St, New York, NY 10023',
					shipTo: 'Chi Enterprises, 909 22nd St, New York, NY 10022',
				})),
			},
		};

		const result = await node.methods.resourceMapping.getClientUpdateFields.call(
			mockLoadContext as unknown as ILoadOptionsFunctions,
		);

		expect(result.fields).toEqual([
			{
				id: 'name',
				displayName: 'Name',
				required: false,
				display: true,
				type: 'string',
				defaultMatch: false,
				canBeUsedToMatch: false,
				defaultValue: 'Team Holland',
			},
			{
				id: 'email',
				displayName: 'Email',
				required: false,
				display: true,
				type: 'string',
				defaultMatch: false,
				canBeUsedToMatch: false,
				defaultValue: 'teamram61@gmail.com',
			},
			{
				id: 'billTo',
				displayName: 'Bill To',
				required: false,
				display: true,
				type: 'string',
				defaultMatch: false,
				canBeUsedToMatch: false,
				defaultValue: 'Psi Solutions, 1010 23rd St, New York, NY 10023',
			},
			{
				id: 'shipTo',
				displayName: 'Ship To',
				required: false,
				display: true,
				type: 'string',
				defaultMatch: false,
				canBeUsedToMatch: false,
				defaultValue: 'Chi Enterprises, 909 22nd St, New York, NY 10022',
			},
		]);
	});

	it('getClientUpdateFields returns empty fields array when clientId is empty or missing', async () => {
		const mockLoadContext = {
			getCurrentNodeParameter: vi.fn(() => ''),
			getNodeParameter: vi.fn(() => ''),
		};

		const result = await node.methods.resourceMapping.getClientUpdateFields.call(
			mockLoadContext as unknown as ILoadOptionsFunctions,
		);

		expect(result).toEqual({ fields: [] });
	});

	it('getClients loads clients with name, email, billTo, and shipTo in description', async () => {
		const mockLoadContext = {
			getCredentials: vi.fn(async () => ({
				apiKey: 'ib_test_secret',
				baseUrl: 'https://api.invoicingbuilder.com',
			})),
			helpers: {
				httpRequestWithAuthentication: vi.fn(async () => [
					{
						id: 'client_1',
						name: 'Acme Corp',
						email: 'billing@acme.com',
						billTo: '123 Market St\nSan Francisco, CA',
						shipTo: '789 Warehouse Rd\nSan Francisco, CA',
					},
					{
						id: 'client_2',
						name: 'Solo Client',
					},
				]),
			},
		};

		const options = await node.methods.loadOptions.getClients.call(
			mockLoadContext as unknown as ILoadOptionsFunctions,
		);
		expect(options).toEqual([
			{
				name: 'Acme Corp (billing@acme.com)',
				value: 'client_1',
				description: 'Bill: 123 Market St, San Francisco, CA | Ship: 789 Warehouse Rd, San Francisco, CA',
			},
			{
				name: 'Solo Client',
				value: 'client_2',
				description: undefined,
			},
		]);
	});

	it('updates only the Name field, leaving email, billTo, shipTo unchanged and not sent as empty strings', async () => {
		let capturedPutBody: IDataObject | undefined;
		let getCalled = false;

		const context = createMockExecuteContext({
			parameters: {
				resource: 'client',
				operation: 'update',
				clientId: 'client_123',
				name: 'Acme Corporation Updated',
				email: '',
				billTo: '',
				shipTo: '',
			},
			httpHandler: async (opts) => {
				if (opts.method === 'GET' && opts.url?.includes('/api/v1/clients/client_123')) {
					getCalled = true;
					return {
						id: 'client_123',
						name: 'Acme Corporation',
						email: 'billing@acme.com',
						billTo: '123 Market St',
						shipTo: '789 Warehouse Rd',
					};
				}
				if (opts.method === 'PUT' && opts.url?.includes('/api/v1/clients/client_123')) {
					capturedPutBody = opts.body as IDataObject;
					return {
						id: 'client_123',
						name: 'Acme Corporation Updated',
						email: 'billing@acme.com',
						billTo: '123 Market St',
						shipTo: '789 Warehouse Rd',
					};
				}
				return {};
			},
		});

		const result = await node.execute.call(context);
		expect(getCalled).toBe(true);
		expect(capturedPutBody).toEqual({
			name: 'Acme Corporation Updated',
		});
		expect(result[0][0].json.name).toBe('Acme Corporation Updated');
		expect(result[0][0].json.email).toBe('billing@acme.com');
	});

	it('updates only Bill To independently without affecting Ship To or other fields', async () => {
		let capturedPutBody: IDataObject | undefined;

		const context = createMockExecuteContext({
			parameters: {
				resource: 'client',
				operation: 'update',
				clientId: 'client_123',
				name: '',
				email: '',
				billTo: '456 New Billing Ave\nNew York, NY 10001',
				shipTo: '',
			},
			httpHandler: async (opts) => {
				if (opts.method === 'GET' && opts.url?.includes('/api/v1/clients/client_123')) {
					return {
						id: 'client_123',
						name: 'Wayne Enterprises',
						email: 'bruce@wayne.com',
						billTo: 'Old Billing Address',
						shipTo: '100 Gotham Pier',
					};
				}
				if (opts.method === 'PUT' && opts.url?.includes('/api/v1/clients/client_123')) {
					capturedPutBody = opts.body as IDataObject;
					return {
						id: 'client_123',
						name: 'Wayne Enterprises',
						email: 'bruce@wayne.com',
						billTo: '456 New Billing Ave\nNew York, NY 10001',
						shipTo: '100 Gotham Pier',
					};
				}
				return {};
			},
		});

		const result = await node.execute.call(context);
		expect(capturedPutBody).toEqual({
			billTo: '456 New Billing Ave\nNew York, NY 10001',
		});
		expect(result[0][0].json.billTo).toBe('456 New Billing Ave\nNew York, NY 10001');
		expect(result[0][0].json.shipTo).toBe('100 Gotham Pier');
	});

	it('updates only Ship To independently without affecting Bill To or other fields', async () => {
		let capturedPutBody: IDataObject | undefined;

		const context = createMockExecuteContext({
			parameters: {
				resource: 'client',
				operation: 'update',
				clientId: 'client_123',
				name: '',
				email: '',
				billTo: '',
				shipTo: '789 Logistics Way\nDock 4, Seattle, WA',
			},
			httpHandler: async (opts) => {
				if (opts.method === 'GET' && opts.url?.includes('/api/v1/clients/client_123')) {
					return {
						id: 'client_123',
						name: 'Wayne Enterprises',
						email: 'bruce@wayne.com',
						billTo: '456 Billing Ave',
						shipTo: 'Old Shipping Address',
					};
				}
				if (opts.method === 'PUT' && opts.url?.includes('/api/v1/clients/client_123')) {
					capturedPutBody = opts.body as IDataObject;
					return {
						id: 'client_123',
						name: 'Wayne Enterprises',
						email: 'bruce@wayne.com',
						billTo: '456 Billing Ave',
						shipTo: '789 Logistics Way\nDock 4, Seattle, WA',
					};
				}
				return {};
			},
		});

		const result = await node.execute.call(context);
		expect(capturedPutBody).toEqual({
			shipTo: '789 Logistics Way\nDock 4, Seattle, WA',
		});
		expect(result[0][0].json.shipTo).toBe('789 Logistics Way\nDock 4, Seattle, WA');
		expect(result[0][0].json.billTo).toBe('456 Billing Ave');
	});

	it('supports dynamic expressions for Name, Email, Bill To, and Ship To', async () => {
		let capturedPutBody: IDataObject | undefined;

		// In n8n execution, expressions are evaluated into the parameter values for the item
		const context = createMockExecuteContext({
			items: [
				{
					json: {
						name: 'Dynamic Corp',
						email: 'dynamic@corp.com',
						billTo: '100 Dynamic St',
						shipTo: '200 Express Way',
					},
				},
			],
			parameters: {
				resource: 'client',
				operation: 'update',
				clientId: 'client_dynamic_1',
				name: 'Dynamic Corp',
				email: 'dynamic@corp.com',
				billTo: '100 Dynamic St',
				shipTo: '200 Express Way',
			},
			httpHandler: async (opts) => {
				if (opts.method === 'GET' && opts.url?.includes('/api/v1/clients/client_dynamic_1')) {
					return {
						id: 'client_dynamic_1',
						name: 'Old Corp',
						email: 'old@corp.com',
						billTo: 'Old Bill',
						shipTo: 'Old Ship',
					};
				}
				if (opts.method === 'PUT' && opts.url?.includes('/api/v1/clients/client_dynamic_1')) {
					capturedPutBody = opts.body as IDataObject;
					return {
						id: 'client_dynamic_1',
						...(opts.body as IDataObject),
					};
				}
				return {};
			},
		});

		const result = await node.execute.call(context);
		expect(capturedPutBody).toEqual({
			name: 'Dynamic Corp',
			email: 'dynamic@corp.com',
			billTo: '100 Dynamic St',
			shipTo: '200 Express Way',
		});
		expect(result[0][0].json.name).toBe('Dynamic Corp');
		expect(result[0][0].json.email).toBe('dynamic@corp.com');
	});

	it('updates client fields provided via updateFields resourceMapper', async () => {
		let capturedPutBody: IDataObject | undefined;

		const context = createMockExecuteContext({
			parameters: {
				resource: 'client',
				operation: 'update',
				clientId: 'client_rm_1',
				updateFields: {
					mappingMode: 'defineBelow',
					value: {
						name: 'Updated RM Name',
						email: 'billing@rm.com',
						billTo: '123 Market St',
						shipTo: 'New RM Ship To 999',
					},
				},
			},
			httpHandler: async (opts) => {
				if (opts.method === 'GET' && opts.url?.includes('/api/v1/clients/client_rm_1')) {
					return {
						id: 'client_rm_1',
						name: 'Original RM Name',
						email: 'billing@rm.com',
						billTo: '123 Market St',
						shipTo: 'Old RM Ship To',
					};
				}
				if (opts.method === 'PUT' && opts.url?.includes('/api/v1/clients/client_rm_1')) {
					capturedPutBody = opts.body as IDataObject;
					return {
						id: 'client_rm_1',
						...(opts.body as IDataObject),
					};
				}
				return {};
			},
		});

		const result = await node.execute.call(context);
		expect(capturedPutBody).toEqual({
			name: 'Updated RM Name',
			shipTo: 'New RM Ship To 999',
		});
		expect(result[0][0].json.name).toBe('Updated RM Name');
	});

	it('does not send PUT request when all fields are unmodified', async () => {
		let putCalled = false;

		const context = createMockExecuteContext({
			parameters: {
				resource: 'client',
				operation: 'update',
				clientId: 'client_123',
				name: 'Acme Corporation',
				email: 'billing@acme.com',
				billTo: '',
				shipTo: '',
			},
			httpHandler: async (opts) => {
				if (opts.method === 'GET' && opts.url?.includes('/api/v1/clients/client_123')) {
					return {
						id: 'client_123',
						name: 'Acme Corporation',
						email: 'billing@acme.com',
						billTo: '123 Market St',
						shipTo: '789 Warehouse Rd',
					};
				}
				if (opts.method === 'PUT') {
					putCalled = true;
					return {};
				}
				return {};
			},
		});

		const result = await node.execute.call(context);
		expect(putCalled).toBe(false);
		expect(result[0][0].json.id).toBe('client_123');
		expect(result[0][0].json.name).toBe('Acme Corporation');
	});

	it('bulk workflows: correctly processes multiple clients with individual updates', async () => {
		const putCalls: Array<{ url: string; body: IDataObject }> = [];

		const context = createMockExecuteContext({
			items: [
				{ json: { id: 'client_A', name: 'New Client A' } },
				{ json: { id: 'client_B', email: 'b_new@client.com' } },
			],
			parameters: {
				resource: 'client',
				operation: 'update',
			},
			itemParameters: [
				{
					clientId: 'client_A',
					name: 'New Client A',
					email: '',
					billTo: '',
					shipTo: '',
				},
				{
					clientId: 'client_B',
					name: '',
					email: 'b_new@client.com',
					billTo: '',
					shipTo: '',
				},
			],
			httpHandler: async (opts) => {
				if (opts.method === 'GET') {
					if (opts.url?.includes('/api/v1/clients/client_A')) {
						return { id: 'client_A', name: 'Old Client A', email: 'a@old.com' };
					}
					if (opts.url?.includes('/api/v1/clients/client_B')) {
						return { id: 'client_B', name: 'Old Client B', email: 'b@old.com' };
					}
				}
				if (opts.method === 'PUT') {
					putCalls.push({ url: opts.url || '', body: opts.body as IDataObject });
					return { id: opts.url?.split('/').pop(), ...(opts.body as IDataObject) };
				}
				return {};
			},
		});

		const result = await node.execute.call(context);
		expect(result[0]).toHaveLength(2);
		expect(result[0][0].pairedItem).toEqual({ item: 0 });
		expect(result[0][1].pairedItem).toEqual({ item: 1 });

		expect(putCalls).toHaveLength(2);
		expect(putCalls[0].url).toContain('/api/v1/clients/client_A');
		expect(putCalls[0].body).toEqual({ name: 'New Client A' });
		expect(putCalls[1].url).toContain('/api/v1/clients/client_B');
		expect(putCalls[1].body).toEqual({ email: 'b_new@client.com' });
	});

	it('safely handles missing clientId with NodeOperationError', async () => {
		const context = createMockExecuteContext({
			parameters: {
				resource: 'client',
				operation: 'update',
				clientId: '',
			},
		});

		await expect(node.execute.call(context)).rejects.toThrow(NodeOperationError);
	});

	it('safely handles API errors and respects continueOnFail', async () => {
		const context = createMockExecuteContext({
			parameters: {
				resource: 'client',
				operation: 'update',
				clientId: 'client_error',
				name: 'Will Fail',
			},
			continueOnFail: true,
			httpHandler: async () => {
				throw new Error('Client not found or server error');
			},
		});

		const result = await node.execute.call(context);
		expect(result[0][0].json).toEqual({
			error: 'Client not found or server error',
		});
		expect(result[0][0].pairedItem).toEqual({ item: 0 });
	});
});