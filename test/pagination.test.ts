import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ILoadOptionsFunctions, IExecuteFunctions } from 'n8n-workflow';
import { sleep } from 'n8n-workflow';
import { InvoicingBuilder } from '../nodes/InvoicingBuilder/InvoicingBuilder.node';
import {
	extractResourceLocatorValue,
	deduplicateByValue,
	fetchWithInflightDeduplication,
} from '../nodes/InvoicingBuilder/helpers/resourceLocator';

describe('Pagination and Lazy Loading in Dynamic Dropdowns', () => {
	let node: InvoicingBuilder;

	beforeEach(() => {
		node = new InvoicingBuilder();
		vi.clearAllMocks();
	});

	describe('searchTemplates (Incremental Loading & Server Search)', () => {
		it('fetches initial 50 records with page=1 and limit=50 and returns paginationToken="2"', async () => {
			let capturedQs: Record<string, unknown> | undefined;
			let capturedUrl = '';

			const mockContext = {
				getCredentials: vi.fn().mockResolvedValue({
					baseUrl: 'https://api.invoicingbuilder.com',
				}),
				helpers: {
					httpRequestWithAuthentication: vi.fn().mockImplementation(async (_cred, options) => {
						capturedUrl = options.url;
						capturedQs = options.qs;
						const items = Array.from({ length: 50 }, (_, i) => ({
							id: `tmpl-${i + 1}`,
							template: { name: `Template ${i + 1}` },
						}));
						return {
							items,
							total: 120,
							page: 1,
							limit: 50,
							totalPages: 3,
						};
					}),
				},
			} as unknown as ILoadOptionsFunctions;

			const result = await node.methods.listSearch.searchTemplates.call(
				mockContext,
				undefined,
				undefined,
			);

			expect(capturedUrl).toContain('/api/v1/templates');
			expect(capturedQs).toEqual({ page: 1, limit: 50 });
			expect(result.results).toHaveLength(50);
			expect(result.results[0]).toEqual({
				name: 'Template 1',
				value: 'tmpl-1',
			});
			expect(result.paginationToken).toBe('2');
		});

		it('fetches the next page when paginationToken is supplied', async () => {
			let capturedQs: Record<string, unknown> | undefined;

			const mockContext = {
				getCredentials: vi.fn().mockResolvedValue({
					baseUrl: 'https://api.invoicingbuilder.com',
				}),
				helpers: {
					httpRequestWithAuthentication: vi.fn().mockImplementation(async (_cred, options) => {
						capturedQs = options.qs;
						const items = Array.from({ length: 50 }, (_, i) => ({
							id: `tmpl-${i + 51}`,
							template: { name: `Template ${i + 51}` },
						}));
						return {
							items,
							total: 120,
							page: 2,
							limit: 50,
							totalPages: 3,
						};
					}),
				},
			} as unknown as ILoadOptionsFunctions;

			const result = await node.methods.listSearch.searchTemplates.call(
				mockContext,
				undefined,
				'2',
			);

			expect(capturedQs).toEqual({ page: 2, limit: 50 });
			expect(result.results).toHaveLength(50);
			expect(result.results[0].value).toBe('tmpl-51');
			expect(result.paginationToken).toBe('3');
		});

		it('returns paginationToken=undefined when reaching the end of the dataset', async () => {
			const mockContext = {
				getCredentials: vi.fn().mockResolvedValue({
					baseUrl: 'https://api.invoicingbuilder.com',
				}),
				helpers: {
					httpRequestWithAuthentication: vi.fn().mockResolvedValue({
						items: [
							{ id: 'tmpl-101', template: { name: 'Final Template 1' } },
							{ id: 'tmpl-102', template: { name: 'Final Template 2' } },
						],
						total: 102,
						page: 3,
						limit: 50,
						totalPages: 3,
					}),
				},
			} as unknown as ILoadOptionsFunctions;

			const result = await node.methods.listSearch.searchTemplates.call(
				mockContext,
				undefined,
				'3',
			);

			expect(result.results).toHaveLength(2);
			expect(result.paginationToken).toBeUndefined();
		});

		it('supports server-side search and resets pagination to page 1', async () => {
			let capturedQs: Record<string, unknown> | undefined;

			const mockContext = {
				getCredentials: vi.fn().mockResolvedValue({
					baseUrl: 'https://api.invoicingbuilder.com',
				}),
				helpers: {
					httpRequestWithAuthentication: vi.fn().mockImplementation(async (_cred, options) => {
						capturedQs = options.qs;
						return {
							items: [
								{ id: 'tmpl-inv', template: { name: 'Invoice Clean' } },
							],
							total: 1,
							page: 1,
							limit: 50,
							totalPages: 1,
						};
					}),
				},
			} as unknown as ILoadOptionsFunctions;

			const result = await node.methods.listSearch.searchTemplates.call(
				mockContext,
				'Invoice Clean',
				undefined,
			);

			expect(capturedQs).toEqual({
				page: 1,
				limit: 50,
				search: 'Invoice Clean',
			});
			expect(result.results).toEqual([
				{ name: 'Invoice Clean', value: 'tmpl-inv' },
			]);
			expect(result.paginationToken).toBeUndefined();
		});

		it('deduplicates duplicate records in results', async () => {
			const mockContext = {
				getCredentials: vi.fn().mockResolvedValue({
					baseUrl: 'https://api.invoicingbuilder.com',
				}),
				helpers: {
					httpRequestWithAuthentication: vi.fn().mockResolvedValue({
						items: [
							{ id: 'tmpl-dup', template: { name: 'Duplicate One' } },
							{ id: 'tmpl-dup', template: { name: 'Duplicate One' } },
							{ id: 'tmpl-unique', template: { name: 'Unique' } },
						],
						total: 2,
						page: 1,
						limit: 50,
						totalPages: 1,
					}),
				},
			} as unknown as ILoadOptionsFunctions;

			const result = await node.methods.listSearch.searchTemplates.call(
				mockContext,
				undefined,
				undefined,
			);

			expect(result.results).toHaveLength(2);
			expect(result.results.map((r) => r.value)).toEqual(['tmpl-dup', 'tmpl-unique']);
		});

		it('handles API errors gracefully and returns empty results', async () => {
			const mockContext = {
				getCredentials: vi.fn().mockResolvedValue({
					baseUrl: 'https://api.invoicingbuilder.com',
				}),
				helpers: {
					httpRequestWithAuthentication: vi.fn().mockRejectedValue(new Error('Network error')),
				},
			} as unknown as ILoadOptionsFunctions;

			const result = await node.methods.listSearch.searchTemplates.call(
				mockContext,
				undefined,
				undefined,
			);

			expect(result).toEqual({ results: [] });
		});
	});

	describe('searchClients (Incremental Loading & Server Search)', () => {
		it('fetches initial 50 clients with server search and pagination', async () => {
			let capturedQs: Record<string, unknown> | undefined;

			const mockContext = {
				getCredentials: vi.fn().mockResolvedValue({
					baseUrl: 'https://api.invoicingbuilder.com',
				}),
				helpers: {
					httpRequestWithAuthentication: vi.fn().mockImplementation(async (_cred, options) => {
						capturedQs = options.qs;
						const items = Array.from({ length: 50 }, (_, i) => ({
							id: `client-${i + 1}`,
							name: `Client ${i + 1}`,
							email: `client${i + 1}@example.com`,
							billTo: '123 Main St',
							shipTo: '456 Elm St',
						}));
						return {
							items,
							total: 80,
							page: 1,
							limit: 50,
							totalPages: 2,
						};
					}),
				},
			} as unknown as ILoadOptionsFunctions;

			const result = await node.methods.listSearch.searchClients.call(
				mockContext,
				'Client',
				undefined,
			);

			expect(capturedQs).toEqual({
				page: 1,
				limit: 50,
				search: 'Client',
			});
			expect(result.results).toHaveLength(50);
			expect(result.results[0]).toEqual({
				name: 'Client 1 (client1@example.com)',
				value: 'client-1',
				description: 'Bill: 123 Main St | Ship: 456 Elm St',
			});
			expect(result.paginationToken).toBe('2');
		});

		it('handles raw array response from backend without totalPages', async () => {
			const mockContext = {
				getCredentials: vi.fn().mockResolvedValue({
					baseUrl: 'https://api.invoicingbuilder.com',
				}),
				helpers: {
					httpRequestWithAuthentication: vi.fn().mockResolvedValue([
						{ id: 'c1', name: 'Alpha', email: 'alpha@test.com' },
						{ id: 'c2', name: 'Beta', email: '' },
					]),
				},
			} as unknown as ILoadOptionsFunctions;

			const result = await node.methods.listSearch.searchClients.call(
				mockContext,
				undefined,
				undefined,
			);

			expect(result.results).toEqual([
				{ name: 'Alpha (alpha@test.com)', value: 'c1', description: undefined },
				{ name: 'Beta', value: 'c2', description: undefined },
			]);
			expect(result.paginationToken).toBeUndefined();
		});

		it('handles API errors gracefully and returns empty results', async () => {
			const mockContext = {
				getCredentials: vi.fn().mockResolvedValue({
					baseUrl: 'https://api.invoicingbuilder.com',
				}),
				helpers: {
					httpRequestWithAuthentication: vi.fn().mockRejectedValue(new Error('Unauthorized')),
				},
			} as unknown as ILoadOptionsFunctions;

			const result = await node.methods.listSearch.searchClients.call(
				mockContext,
				undefined,
				undefined,
			);

			expect(result).toEqual({ results: [] });
		});
	});

	describe('searchInvoices (Incremental Loading & Server Search)', () => {
		it('fetches initial 50 invoices and parses invoiceNumber component', async () => {
			let capturedQs: Record<string, unknown> | undefined;

			const mockContext = {
				getCredentials: vi.fn().mockResolvedValue({
					baseUrl: 'https://api.invoicingbuilder.com',
				}),
				helpers: {
					httpRequestWithAuthentication: vi.fn().mockImplementation(async (_cred, options) => {
						capturedQs = options.qs;
						const items = Array.from({ length: 50 }, (_, i) => ({
							id: `inv-${i + 1}`,
							invoice: {
								templateName: 'Tax Invoice',
								date: '2026-10-15T00:00:00Z',
								balanceDue: '150.00',
								currency: '$',
								components: [
									{
										type: 'invoiceNumber',
										properties: { text: `INV-${1000 + i}` },
									},
								],
							},
						}));
						return {
							items,
							total: 100,
							page: 1,
							limit: 50,
							totalPages: 2,
						};
					}),
				},
			} as unknown as ILoadOptionsFunctions;

			const result = await node.methods.listSearch.searchInvoices.call(
				mockContext,
				'INV',
				undefined,
			);

			expect(capturedQs).toEqual({
				page: 1,
				limit: 50,
				search: 'INV',
			});
			expect(result.results).toHaveLength(50);
			expect(result.results[0]).toEqual({
				name: 'INV-1000 (Tax Invoice) - 2026-10-15 - $150.00',
				value: 'inv-1',
				description: 'Date: 2026-10-15 | Balance: $150.00',
			});
			expect(result.paginationToken).toBe('2');
		});

		it('handles API errors gracefully and returns empty results', async () => {
			const mockContext = {
				getCredentials: vi.fn().mockResolvedValue({
					baseUrl: 'https://api.invoicingbuilder.com',
				}),
				helpers: {
					httpRequestWithAuthentication: vi.fn().mockRejectedValue(new Error('Server 500')),
				},
			} as unknown as ILoadOptionsFunctions;

			const result = await node.methods.listSearch.searchInvoices.call(
				mockContext,
				undefined,
				undefined,
			);

			expect(result).toEqual({ results: [] });
		});
	});

	describe('helpers: resourceLocator extraction & deduplication', () => {
		it('extracts string value from raw string, resource locator objects, and primitives', () => {
			expect(extractResourceLocatorValue('tpl-123')).toBe('tpl-123');
			expect(extractResourceLocatorValue({ mode: 'list', value: 'tpl-list' })).toBe('tpl-list');
			expect(extractResourceLocatorValue({ mode: 'id', value: 'tpl-id' })).toBe('tpl-id');
			expect(extractResourceLocatorValue(null, 'default')).toBe('default');
			expect(extractResourceLocatorValue(undefined, 'default')).toBe('default');
			expect(extractResourceLocatorValue({ mode: 'list', value: 456 })).toBe('456');
		});

		it('deduplicates items by value', () => {
			const items = [
				{ name: 'A', value: '1' },
				{ name: 'B', value: '2' },
				{ name: 'A2', value: '1' },
			];
			expect(deduplicateByValue(items)).toEqual([
				{ name: 'A', value: '1' },
				{ name: 'B', value: '2' },
			]);
		});

		it('deduplicates concurrent in-flight requests with same key', async () => {
			let callCount = 0;
			const fetcher = async () => {
				callCount++;
				await sleep(20);
				return 'result';
			};

			const [res1, res2] = await Promise.all([
				fetchWithInflightDeduplication('test-key', fetcher),
				fetchWithInflightDeduplication('test-key', fetcher),
			]);

			expect(res1).toBe('result');
			expect(res2).toBe('result');
			expect(callCount).toBe(1);
		});
	});

	describe('Execution backward compatibility with resourceLocator object and string ID', () => {
		it('executes invoice get with resourceLocator object parameter', async () => {
			let requestedUrl = '';
			const context = {
				getInputData: () => [{ json: {} }],
				getNodeParameter: (param: string) => {
					if (param === 'resource') return 'invoice';
					if (param === 'operation') return 'get';
					if (param === 'invoiceId') return { mode: 'list', value: 'inv-rl-123' };
					return undefined;
				},
				getCredentials: vi.fn().mockResolvedValue({
					baseUrl: 'https://api.invoicingbuilder.com',
				}),
				helpers: {
					httpRequestWithAuthentication: vi.fn().mockImplementation(async (_cred, options) => {
						requestedUrl = options.url;
						return { id: 'inv-rl-123', templateName: 'Invoice A' };
					}),
				},
				continueOnFail: () => false,
				getNode: () => ({ name: 'InvoicingBuilder' }),
			} as unknown as IExecuteFunctions;

			const result = await node.execute.call(context);
			expect(requestedUrl).toContain('/api/v1/n8n/invoices/inv-rl-123');
			expect(result[0][0].json.id).toBe('inv-rl-123');
		});

		it('executes client get with resourceLocator object parameter', async () => {
			let requestedUrl = '';
			const context = {
				getInputData: () => [{ json: {} }],
				getNodeParameter: (param: string) => {
					if (param === 'resource') return 'client';
					if (param === 'operation') return 'get';
					if (param === 'clientId') return { mode: 'list', value: 'client-rl-456' };
					return undefined;
				},
				getCredentials: vi.fn().mockResolvedValue({
					baseUrl: 'https://api.invoicingbuilder.com',
				}),
				helpers: {
					httpRequestWithAuthentication: vi.fn().mockImplementation(async (_cred, options) => {
						requestedUrl = options.url;
						return { id: 'client-rl-456', name: 'Client RL' };
					}),
				},
				continueOnFail: () => false,
				getNode: () => ({ name: 'InvoicingBuilder' }),
			} as unknown as IExecuteFunctions;

			const result = await node.execute.call(context);
			expect(requestedUrl).toContain('/api/v1/clients/client-rl-456');
			expect(result[0][0].json.id).toBe('client-rl-456');
		});
	});
});
