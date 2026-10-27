import { describe, it, expect, vi } from 'vitest';
import { InvoicingBuilder } from '../nodes/InvoicingBuilder/InvoicingBuilder.node';
import { invoiceFields } from '../nodes/InvoicingBuilder/descriptions/InvoiceDescription';
import {
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestOptions,
	type INode,
	NodeOperationError,
	NodeApiError,
} from 'n8n-workflow';

interface MockContextOptions {
	items?: Array<{ json: IDataObject }>;
	parameters?: IDataObject;
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
			void itemIndex;
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
					capturedCreateBody = opts.body;
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
		const invoice = capturedCreateBody.invoices[0];
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
					capturedCreateBody = opts.body;
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
			'spreadsheet',
			'worksheet',
			'templateId',
			'format',
			'sendToClient',
		]);

		const unwanted = [
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

		const context = createMockExecuteContext({
			items: [{ json: {} }],
			parameters: {
				operation: 'generateReport',
				from: '2026-01-01T00:00:00.000Z',
				to: '2026-12-31T00:00:00.000Z',
				status: 'all',
				dateBasis: 'issueDate',
			},
			httpHandler: async () => reportPayload,
		});

		const result = await node.execute.call(context);
		expect(result[0][0].json).toEqual(reportPayload);
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

		const context = createMockExecuteContext({
			items: [{ json: {} }],
			parameters: {
				operation: 'analyseTrends',
				period: 'monthly',
				periods: 12,
			},
			httpHandler: async () => trendsPayload,
		});

		const result = await node.execute.call(context);
		expect(result[0][0].json).toEqual(trendsPayload);
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
