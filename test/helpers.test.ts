import { describe, it, expect } from 'vitest';
import { groupRows } from '../nodes/InvoicingBuilder/helpers/groupRows';
import { buildInvoiceFields } from '../nodes/InvoicingBuilder/helpers/buildInvoiceFields';
import { normalizeBaseUrl, DEFAULT_BASE_URL } from '../nodes/InvoicingBuilder/helpers/request';
import { formatApiError } from '../nodes/InvoicingBuilder/helpers/errors';
import { parseCsv, extractSpreadsheetId } from '../nodes/InvoicingBuilder/helpers/googleSheets';
import { buildDirectInvoice } from '../nodes/InvoicingBuilder/helpers/directInvoice';

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

	it('groups all rows into 1 single invoice when groupBy column is undefined or empty', () => {
		const items = [{ a: 1 }, { a: 2 }, { a: 3 }];
		const resultUndefined = groupRows(items, undefined);
		expect(resultUndefined).toHaveLength(1);
		expect(resultUndefined[0].rows).toHaveLength(3);
		expect(resultUndefined[0].rows).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
		expect(resultUndefined[0].itemIndexes).toEqual([0, 1, 2]);

		const resultEmpty = groupRows(items, '   ');
		expect(resultEmpty).toHaveLength(1);
		expect(resultEmpty[0].rows).toHaveLength(3);
	});

	it('auto-detects invoice identifier column when groupBy is not provided', () => {
		const items = [
			{ 'Invoice #': 'INV-1', item: 'Item 1' },
			{ 'Invoice #': 'INV-1', item: 'Item 2' },
			{ 'Invoice #': 'INV-2', item: 'Item 3' },
			{ 'Invoice #': 'INV-3', item: 'Item 4' },
		];
		const result = groupRows(items);
		expect(result).toHaveLength(3);
		expect(result[0].groupKey).toBe('INV-1');
		expect(result[0].rows).toHaveLength(2);
		expect(result[1].groupKey).toBe('INV-2');
		expect(result[1].rows).toHaveLength(1);
		expect(result[2].groupKey).toBe('INV-3');
		expect(result[2].rows).toHaveLength(1);
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
			amount: '1050.00',
		});
		expect(table[1]).toEqual({
			description: 'Development',
			quantity: '20',
			rate: '150',
			tax: '10',
			amount: '3300.00',
		});
	});

	it('automatically maps line items and header fields when no manual mappings are configured', () => {
		const rowGroup = {
			rows: [
				{
					'Description': 'Web Development',
					'Qty.': 2,
					'Rate': 1500,
					'Amount': 3000,
					'Customer Name': 'Acme Global Corp',
					'Invoice #': 'INV-2026-001',
					'Date': '2026-10-27',
					'Due Date': '2026-11-27',
					'PO Number': 'PO-9988',
				},
				{
					'Description': 'Cloud Hosting',
					'Qty.': 1,
					'Rate': 500,
					'Amount': 500,
					'Customer Name': 'Acme Global Corp',
					'Invoice #': 'INV-2026-001',
				},
			],
		};

		const result = buildInvoiceFields({
			rowGroup,
			templateId: 'standard-invoice',
			format: 'pdf',
			headerMappings: [], // No manual mappings configured
			lineItemColumns: {}, // No manual columns configured
			templateFields: [
				{ id: 'comp_inv_num', type: 'invoiceNumber', label: 'Invoice #' },
				{ id: 'comp_billto', type: 'billTo', label: 'Bill To' },
				{ id: 'comp_date', type: 'date', label: 'Date' },
				{ id: 'comp_duedate', type: 'dueDate', label: 'Due Date' },
				{ id: 'comp_ponum', type: 'poNumber', label: 'PO Number' },
				{ id: 'comp_notes', type: 'notes', label: 'Notes' },
				{ id: 'comp_table', type: 'table', label: 'Table' },
			],
		});

		// Auto-detected header fields
		expect(result.fields.comp_inv_num).toBe('INV-2026-001');
		expect(result.fields.comp_billto).toBe('Acme Global Corp');
		expect(result.fields.comp_date).toBe('2026-10-27');
		expect(result.fields.comp_duedate).toBe('2026-11-27');
		expect(result.fields.comp_ponum).toBe('PO-9988');
		// Notes was omitted from spreadsheet, so cleared to ''
		expect(result.fields.comp_notes).toBe('');

		// Auto-detected line items
		const table = result.fields.comp_table as Array<{
			description: string;
			quantity: string;
			rate: string;
			amount: string;
		}>;
		expect(table).toHaveLength(2);
		expect(table[0].description).toBe('Web Development');
		expect(table[0].quantity).toBe('2');
		expect(table[0].rate).toBe('1500');
		expect(table[0].amount).toBe('3000');
		expect(table[1].description).toBe('Cloud Hosting');
		expect(table[1].quantity).toBe('1');
		expect(table[1].rate).toBe('500');
		expect(table[1].amount).toBe('500');

		// External ID auto-detected from Invoice #
		expect(result.externalId).toBe('INV-2026-001');
	});

	it('auto-detects Tax column and enables taxColumn in fields', () => {
		const rowGroup = {
			rows: [
				{
					'Description': 'Widget',
					'Qty': 2,
					'Rate': 100,
					'Tax': '10%',
				},
			],
		};

		const result = buildInvoiceFields({
			rowGroup,
			templateId: 'standard-invoice',
			format: 'pdf',
			headerMappings: [],
			lineItemColumns: {},
			templateFields: [{ id: 'comp_table', type: 'table', label: 'Table' }],
		});

		const table = result.fields.comp_table as Array<{
			description: string;
			quantity: string;
			rate: string;
			tax?: string;
			amount?: string;
		}>;
		expect(table).toHaveLength(1);
		expect(table[0].tax).toBe('10');
		expect(table[0].amount).toBe('220.00'); // 2 * 100 + 10% = 220.00
		expect(result.fields.taxColumn).toBe(true);
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

describe('Google Sheets Helpers', () => {
	it('extractSpreadsheetId extracts ID from full URL or raw ID', () => {
		expect(
			extractSpreadsheetId(
				'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0',
			),
		).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');

		expect(extractSpreadsheetId('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms')).toBe(
			'1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
		);
	});

	it('parseCsv handles quotes, commas, and newlines correctly', () => {
		const csv = `Customer Name,Customer Email,Item,Quantity,Rate
"XYZ Company","xyz@example.com","Monitor, 27-inch",1,299.99
"XYZ Company","xyz@example.com","Keyboard ""Mechanical""",2,89.50
`;
		const { headers, rows } = parseCsv(csv);
		expect(headers).toEqual(['Customer Name', 'Customer Email', 'Item', 'Quantity', 'Rate']);
		expect(rows).toHaveLength(2);
		expect(rows[0]['Customer Name']).toBe('XYZ Company');
		expect(rows[0]['Item']).toBe('Monitor, 27-inch');
		expect(rows[0]['Rate']).toBe('299.99');
		expect(rows[1]['Item']).toBe('Keyboard "Mechanical"');
		expect(rows[1]['Quantity']).toBe('2');
	});
});

describe('Template Value Clearing & Replacement (Requirement 3)', () => {
	it('clears template defaults and populates exclusively with new spreadsheet data', () => {
		// Selected template initially contains:
		// Customer Name: ABC Company (comp_billto)
		// Customer Email: abc@example.com (comp_email)
		// Notes: "Default terms and notes" (comp_notes)
		// Item 1: Laptop, Item 2: Keyboard (comp_table)
		const templateFields = [
			{ id: 'comp_billto', type: 'billTo', value: 'ABC Company' },
			{ id: 'comp_email', type: 'textarea', value: 'abc@example.com' },
			{ id: 'comp_notes', type: 'notes', value: 'Default terms and notes' },
			{
				id: 'comp_table',
				type: 'table',
				value: [{ description: 'Laptop' }, { description: 'Keyboard' }],
			},
		];

		// Google Sheets provides:
		// Customer Name: XYZ Company
		// Customer Email: xyz@example.com
		// Item 1: Monitor
		const rowGroup = {
			rows: [
				{
					'Customer Name': 'XYZ Company',
					'Customer Email': 'xyz@example.com',
					'Item Name': 'Monitor',
					Qty: 1,
					Price: 200,
				},
			],
		};

		const result = buildInvoiceFields({
			rowGroup,
			templateId: 'tmpl_standard',
			format: 'pdf',
			headerMappings: [
				{ fieldId: 'comp_billto', column: 'Customer Name' },
				{ fieldId: 'comp_email', column: 'Customer Email' },
			],
			tableFieldId: 'comp_table',
			lineItemColumns: {
				description: 'Item Name',
				quantity: 'Qty',
				rate: 'Price',
			},
			templateFields,
		});

		// 1. Mapped fields contain new spreadsheet data
		expect(result.fields.comp_billto).toBe('XYZ Company');
		expect(result.fields.comp_email).toBe('xyz@example.com');

		// 2. Unmapped template field (notes) is explicitly cleared and does NOT retain "Default terms and notes"
		expect(result.fields.comp_notes).toBe('');

		// 3. Line items are completely replaced with Monitor; Laptop and Keyboard are gone!
		const table = result.fields.comp_table as Array<{ description: string; quantity: string; rate: string }>;
		expect(table).toHaveLength(1);
		expect(table[0].description).toBe('Monitor');
		expect(table[0].quantity).toBe('1');
		expect(table[0].rate).toBe('200');
		expect(table.some((i) => i.description === 'Laptop')).toBe(false);
		expect(table.some((i) => i.description === 'Keyboard')).toBe(false);
	});
});

describe('buildDirectInvoice helper', () => {
	it('maps shipTo, poNumber, logo, and signature correctly', () => {
		const templateFields = [
			{ id: 'f_billto', type: 'billTo', value: 'Default Bill' },
			{ id: 'f_shipto', type: 'shipTo', value: 'Default Ship' },
			{ id: 'f_ponum', type: 'poNumber', value: 'Default PO' },
			{ id: 'f_logo', type: 'addLogo', value: 'Default Logo' },
			{ id: 'f_sig', type: 'signature', value: 'Default Sig' },
			{ id: 'f_table', type: 'table', value: [{ description: 'Default Item' }] },
		];

		const result = buildDirectInvoice({
			templateId: 'tmpl_custom',
			format: 'pdf',
			billTo: 'Acme HQ\n100 Main St',
			shipTo: 'Acme Depot\n200 Warehouse Way',
			poNumber: 'PO-2026-ABC',
			tableFieldId: 'f_table',
			lineItems: [
				{ description: 'Widget A', quantity: 2, rate: 50 },
			],
			additionalFields: {
				logo: 'https://example.com/brand-logo.png',
				signature: 'data:image/png;base64,sample-signature',
				paymentTerms: 'Net 15',
				notes: 'Prompt payment appreciated',
			},
			templateFields,
		});

		expect(result.templateId).toBe('tmpl_custom');
		expect(result.format).toBe('pdf');
		expect(result.fields.billTo).toBe('Acme HQ\n100 Main St');
		expect(result.fields.f_billto).toBe('Acme HQ\n100 Main St');
		expect(result.fields.shipTo).toBe('Acme Depot\n200 Warehouse Way');
		expect(result.fields.f_shipto).toBe('Acme Depot\n200 Warehouse Way');
		expect(result.fields.poNumber).toBe('PO-2026-ABC');
		expect(result.fields.f_ponum).toBe('PO-2026-ABC');
		expect(result.fields.addLogo).toBe('https://example.com/brand-logo.png');
		expect(result.fields.f_logo).toBe('https://example.com/brand-logo.png');
		expect(result.fields.signature).toBe('data:image/png;base64,sample-signature');
		expect(result.fields.f_sig).toBe('data:image/png;base64,sample-signature');
		expect(result.fields.paymentTerms).toBe('Net 15');
		expect(result.fields.notes).toBe('Prompt payment appreciated');
	});

	it('preserves preconfigured template logo and signature when not overridden in additionalFields', () => {
		const templateFields = [
			{ id: 'f_logo', type: 'addLogo', value: 'https://stored.com/existing-logo.png' },
			{ id: 'f_sig', type: 'signature', value: 'https://stored.com/existing-sig.png' },
			{ id: 'f_notes', type: 'notes', value: 'Old dummy template notes' },
		];

		const result = buildDirectInvoice({
			templateId: 'tmpl_1',
			format: 'png',
			billTo: 'Customer Co',
			additionalFields: {},
			templateFields,
		});

		// Dummy notes are cleared
		expect(result.fields.f_notes).toBe('');
		// Preconfigured template logo and signature are NOT wiped with empty string
		expect(result.fields.f_logo).toBeUndefined();
		expect(result.fields.f_sig).toBeUndefined();
	});
});

