import { describe, it, expect } from 'vitest';
import { groupRows } from '../nodes/InvoicingBuilder/helpers/groupRows';
import { buildInvoiceFields } from '../nodes/InvoicingBuilder/helpers/buildInvoiceFields';
import { normalizeBaseUrl, DEFAULT_BASE_URL } from '../nodes/InvoicingBuilder/helpers/request';
import { formatApiError } from '../nodes/InvoicingBuilder/helpers/errors';

describe('groupRows pure function', () => {
	it('groups rows by column value', () => {
		const items = [
			{ invoiceId: 'INV-1', item: 'Item 1' },
			{ invoiceId: 'INV-1', item: 'Item 2' },
			{ invoiceId: 'INV-2', item: 'Item 3' },
		];
		const result = groupRows(items, 'invoiceId');
		expect(result).toHaveLength(2);
		expect(result[0].groupKey).toBe('INV-1');
		expect(result[0].rows).toHaveLength(2);
		expect(result[0].itemIndexes).toEqual([0, 1]);
		expect(result[1].groupKey).toBe('INV-2');
		expect(result[1].rows).toHaveLength(1);
		expect(result[1].itemIndexes).toEqual([2]);
	});

	it('handles ungrouped when groupBy column is undefined or empty', () => {
		const items = [{ a: 1 }, { a: 2 }, { a: 3 }];
		const resultUndefined = groupRows(items, undefined);
		expect(resultUndefined).toHaveLength(3);
		expect(resultUndefined[0].rows[0]).toEqual({ a: 1 });
		expect(resultUndefined[1].rows[0]).toEqual({ a: 2 });
		expect(resultUndefined[2].rows[0]).toEqual({ a: 3 });

		const resultEmpty = groupRows(items, '   ');
		expect(resultEmpty).toHaveLength(3);
	});

	it('preserves mixed-case values as distinct group keys', () => {
		const items = [
			{ code: 'Inv-A', row: 1 },
			{ code: 'inv-a', row: 2 },
			{ code: 'INV-A', row: 3 },
			{ code: 'Inv-A', row: 4 },
		];
		const result = groupRows(items, 'code');
		expect(result).toHaveLength(3);
		expect(result[0].groupKey).toBe('Inv-A');
		expect(result[0].rows).toHaveLength(2);
		expect(result[1].groupKey).toBe('inv-a');
		expect(result[2].groupKey).toBe('INV-A');
	});

	it('handles empty/null/undefined group keys', () => {
		const items = [
			{ inv: '', val: 1 },
			{ inv: null, val: 2 },
			{ inv: undefined, val: 3 },
			{ inv: 'INV-1', val: 4 },
		];
		const result = groupRows(items, 'inv');
		expect(result).toHaveLength(2);
		expect(result[0].groupKey).toBe('');
		expect(result[0].rows).toHaveLength(3);
		expect(result[0].itemIndexes).toEqual([0, 1, 2]);
		expect(result[1].groupKey).toBe('INV-1');
		expect(result[1].rows).toHaveLength(1);
	});

	it('preserves arrival order of groups and rows', () => {
		const items = [
			{ g: 'B', id: 1 },
			{ g: 'A', id: 2 },
			{ g: 'B', id: 3 },
			{ g: 'C', id: 4 },
			{ g: 'A', id: 5 },
		];
		const result = groupRows(items, 'g');
		expect(result.map((r) => r.groupKey)).toEqual(['B', 'A', 'C']);
		expect(result[0].rows.map((r) => r.id)).toEqual([1, 3]);
		expect(result[1].rows.map((r) => r.id)).toEqual([2, 5]);
		expect(result[2].rows.map((r) => r.id)).toEqual([4]);
	});

	it('returns empty array when input is empty', () => {
		expect(groupRows([], 'col')).toEqual([]);
	});
});

describe('buildInvoiceFields pure function', () => {
	it('maps header fields from first row of group', () => {
		const rowGroup = {
			rows: [
				{ client: 'Acme Corp', date: '2026-10-27', total: 500 },
				{ client: 'Ignored Client', date: '2026-10-28', total: 600 },
			],
		};
		const result = buildInvoiceFields({
			rowGroup,
			templateId: 'tmpl_1',
			format: 'pdf',
			headerMappings: [
				{ fieldId: 'client_name', column: 'client' },
				{ fieldId: 'invoice_date', column: 'date' },
			],
		});

		expect(result.templateId).toBe('tmpl_1');
		expect(result.format).toBe('pdf');
		expect(result.fields.client_name).toBe('Acme Corp');
		expect(result.fields.invoice_date).toBe('2026-10-27');
	});

	it('maps line items and skips empty rows', () => {
		const rowGroup = {
			rows: [
				{ desc: 'Consulting', qty: 10, rate: 100, tax: 5 },
				{ desc: '', qty: 5, rate: '', tax: 0 }, // empty desc and rate -> skipped
				{ desc: null, qty: 1, rate: undefined }, // empty desc and rate -> skipped
				{ desc: 'Development', qty: 20, rate: 150, tax: 10 },
			],
		};
		const result = buildInvoiceFields({
			rowGroup,
			templateId: 'tmpl_1',
			format: 'pdf',
			headerMappings: [],
			tableFieldId: 'items_table',
			lineItemColumns: {
				description: 'desc',
				quantity: 'qty',
				rate: 'rate',
				tax: 'tax',
			},
		});

		const table = result.fields.items_table as Array<{
			description: string;
			quantity: string;
			rate: string;
			tax?: string;
		}>;
		expect(table).toHaveLength(2);
		expect(table[0]).toEqual({
			description: 'Consulting',
			quantity: '10',
			rate: '100',
			tax: '5',
		});
		expect(table[1]).toEqual({
			description: 'Development',
			quantity: '20',
			rate: '150',
			tax: '10',
		});
	});

	it('passes through cell values as strings without reformatting dates or numbers', () => {
		const rowGroup = {
			rows: [
				{
					dateRaw: '27/10/2026 14:30:00',
					numberRaw: 1234.56,
					booleanVal: true,
					desc: 'Widget #42',
					qty: 42.0,
					rate: '99.99',
				},
			],
		};
		const result = buildInvoiceFields({
			rowGroup,
			templateId: 'tmpl_1',
			format: 'pdf',
			headerMappings: [
				{ fieldId: 'date_fld', column: 'dateRaw' },
				{ fieldId: 'num_fld', column: 'numberRaw' },
				{ fieldId: 'bool_fld', column: 'booleanVal' },
			],
			tableFieldId: 'tbl',
			lineItemColumns: {
				description: 'desc',
				quantity: 'qty',
				rate: 'rate',
			},
		});

		expect(result.fields.date_fld).toBe('27/10/2026 14:30:00');
		expect(result.fields.num_fld).toBe('1234.56');
		expect(result.fields.bool_fld).toBe('true');
		const tbl = result.fields.tbl as Array<Record<string, unknown>>;
		expect(tbl[0].quantity).toBe('42');
		expect(tbl[0].rate).toBe('99.99');
	});

	it('sets externalId from first row of group when configured', () => {
		const rowGroup = {
			rows: [
				{ extId: 'ORDER-999', desc: 'Item' },
				{ extId: 'ORDER-888', desc: 'Item 2' },
			],
		};
		const result = buildInvoiceFields({
			rowGroup,
			templateId: 'tmpl_1',
			format: 'png',
			headerMappings: [],
			externalIdColumn: 'extId',
		});

		expect(result.externalId).toBe('ORDER-999');
	});
});

describe('normalizeBaseUrl', () => {
	it('strips single trailing slash', () => {
		expect(normalizeBaseUrl('https://api.invoicingbuilder.com/')).toBe(
			'https://api.invoicingbuilder.com',
		);
	});

	it('strips multiple trailing slashes', () => {
		expect(normalizeBaseUrl('https://api.invoicingbuilder.com///')).toBe(
			'https://api.invoicingbuilder.com',
		);
	});

	it('returns default baseUrl when undefined or empty', () => {
		expect(normalizeBaseUrl(undefined)).toBe(DEFAULT_BASE_URL);
		expect(normalizeBaseUrl('')).toBe(DEFAULT_BASE_URL);
		expect(normalizeBaseUrl('   ')).toBe(DEFAULT_BASE_URL);
	});

	it('supports self-hosted URLs with ports and preserves path', () => {
		expect(normalizeBaseUrl('http://localhost:3001/')).toBe('http://localhost:3001');
		expect(normalizeBaseUrl('https://custom.domain.org:8080/prefix/')).toBe(
			'https://custom.domain.org:8080/prefix',
		);
	});
});

describe('formatApiError', () => {
	it('maps 401 to Invalid, revoked or expired API key', () => {
		const err = { response: { status: 401, data: { message: 'Unauthorized' } } };
		const formatted = formatApiError(err);
		expect(formatted.message).toBe('Invalid, revoked or expired API key');
		expect(formatted.httpCode).toBe('401');
	});

	it('maps 429 to Rate limit exceeded with retryAfter', () => {
		const err = { response: { status: 429, data: { retryAfter: 20 } } };
		const formatted = formatApiError(err);
		expect(formatted.message).toBe('Rate limit exceeded; retry in 20 seconds');
		expect(formatted.httpCode).toBe('429');
	});

	it('maps 400 and 404 to backend message', () => {
		const err400 = {
			response: {
				status: 400,
				data: { message: ['invoices must contain between 1 and 2 items'] },
			},
		};
		const formatted400 = formatApiError(err400);
		expect(formatted400.message).toBe('invoices must contain between 1 and 2 items');

		const err404 = {
			response: {
				status: 404,
				data: { message: 'Template not found' },
			},
		};
		const formatted404 = formatApiError(err404);
		expect(formatted404.message).toBe('Template not found');
	});
});
