import { describe, it, expect, vi } from 'vitest';
import { InvoicingBuilder } from '../nodes/InvoicingBuilder/InvoicingBuilder.node';
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
}

interface HttpErrorPayload extends Error {
	response?: {
		status?: number;
		data?: IDataObject;
		headers?: Record<string, string>;
	};
}

function createMockExecuteContext(options: MockContextOptions = {}): IExecuteFunctions {
	const items = options.items || [{ json: { col1: 'val1' } }];
	const params: IDataObject = {
		resource: 'invoice',
		operation: 'create',
		templateId: 'tmpl_123',
		format: 'pdf',
		groupBy: '',
		externalIdColumn: '',
		saveToHistory: true,
		binaryPropertyName: 'data',
		headerFieldMappings: {},
		lineItemColumns: {},
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
			httpRequestWithAuthentication: vi.fn(
				async function (this: unknown, _credName: string, reqOpts: IHttpRequestOptions) {
					if (options.httpHandler) {
						return await options.httpHandler(reqOpts);
					}
					// Default template fields response
					if (reqOpts.url?.includes('/api/v1/templates/fields')) {
						return {
							id: 'tmpl_123',
							fields: [{ id: 'tbl_id', type: 'table' }],
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

describe('InvoicingBuilder 2-invoice limit validation', () => {
	const node = new InvoicingBuilder();

	it('throws NodeOperationError when no rows provided', async () => {
		const context = createMockExecuteContext({
			items: [],
		});

		await expect(node.execute.call(context)).rejects.toThrow(NodeOperationError);
		await expect(node.execute.call(context)).rejects.toThrow('No rows to turn into invoices');
	});

	it('executes successfully with 1 invoice', async () => {
		const context = createMockExecuteContext({
			items: [{ json: { orderId: '1', item: 'Item 1' } }],
			parameters: { groupBy: 'orderId' },
		});

		const result = await node.execute.call(context);
		expect(result).toHaveLength(1);
		expect(result[0]).toHaveLength(1);
		expect(result[0][0].json.success).toBe(true);
		expect(result[0][0].json.invoiceCount).toBe(1);
		expect(result[0][0].json.fileName).toBe('invoice.pdf');
		expect(result[0][0].binary?.data).toBeDefined();
	});

	it('executes successfully with 2 invoices and produces zip', async () => {
		const context = createMockExecuteContext({
			items: [
				{ json: { orderId: 'INV-1', item: 'Item 1' } },
				{ json: { orderId: 'INV-2', item: 'Item 2' } },
			],
			parameters: { groupBy: 'orderId' },
			httpHandler: async (opts) => {
				if (opts.url?.includes('/api/v1/templates/fields')) {
					return { fields: [{ id: 'tbl_id', type: 'table' }] };
				}
				return {
					statusCode: 200,
					headers: {
						'x-invoice-count': '2',
						'x-invoice-ids': 'inv_1,inv_2',
					},
					body: Buffer.from('PK-zip-content'),
				};
			},
		});

		const result = await node.execute.call(context);
		expect(result[0][0].json.success).toBe(true);
		expect(result[0][0].json.invoiceCount).toBe(2);
		expect(result[0][0].json.fileName).toBe('invoices.zip');
		expect(result[0][0].json.invoiceIds).toEqual(['inv_1', 'inv_2']);
	});

	it('blocks execution before HTTP call when >2 invoices found', async () => {
		const httpSpy = vi.fn();
		const context = createMockExecuteContext({
			items: [
				{ json: { orderId: 'INV-1', item: 'Item 1' } },
				{ json: { orderId: 'INV-2', item: 'Item 2' } },
				{ json: { orderId: 'INV-3', item: 'Item 3' } },
			],
			parameters: { groupBy: 'orderId' },
			httpHandler: httpSpy,
		});

		await expect(node.execute.call(context)).rejects.toThrow(NodeOperationError);
		await expect(node.execute.call(context)).rejects.toThrow(
			'Found 3 invoices; the limit is 2 per execution. Split the rows (e.g. with Loop Over Items or Limit) and try again.',
		);
		expect(httpSpy).not.toHaveBeenCalled();
	});
});

describe('InvoicingBuilder Create Operation - Mock HTTP & Error Handling', () => {
	const node = new InvoicingBuilder();

	it('maps 401 error to Invalid, revoked or expired API key', async () => {
		const context = createMockExecuteContext({
			items: [{ json: { id: 1 } }],
			httpHandler: async () => {
				const error: HttpErrorPayload = new Error('Unauthorized');
				error.response = { status: 401, data: { message: 'Unauthorized' } };
				throw error;
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
			items: [{ json: { id: 1 } }],
			httpHandler: async () => {
				const error: HttpErrorPayload = new Error('Too Many Requests');
				error.response = {
					status: 429,
					data: { message: 'Rate limit exceeded', retryAfter: 15 },
				};
				throw error;
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
			items: [{ json: { id: 1 } }],
			httpHandler: async () => {
				const error: HttpErrorPayload = new Error('Bad Request');
				error.response = {
					status: 400,
					data: { message: 'Template tmpl_invalid does not exist' },
				};
				throw error;
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
			items: [{ json: { id: 1 } }],
			continueOnFail: true,
			httpHandler: async () => {
				const error: HttpErrorPayload = new Error('Unauthorized');
				error.response = { status: 401, data: { message: 'Unauthorized' } };
				throw error;
			},
		});

		const result = await node.execute.call(context);
		expect(result).toHaveLength(1);
		expect(result[0][0].json.error).toBeDefined();
	});

	it('validates missing mapped columns before calling API', async () => {
		const httpSpy = vi.fn();
		const context = createMockExecuteContext({
			items: [{ json: { validCol: 'val' } }],
			parameters: {
				headerFieldMappings: {
					mappings: [{ fieldId: 'cust_name', column: 'nonExistentCol' }],
				},
			},
			httpHandler: httpSpy,
		});

		await expect(node.execute.call(context)).rejects.toThrow(NodeOperationError);
		await expect(node.execute.call(context)).rejects.toThrow(
			'The following mapped column(s) were not found in any input row: nonExistentCol',
		);
		expect(httpSpy).not.toHaveBeenCalled();
	});
});

describe('InvoicingBuilder Generate Report Operation', () => {
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

describe('InvoicingBuilder Analyse Trends Operation', () => {
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
