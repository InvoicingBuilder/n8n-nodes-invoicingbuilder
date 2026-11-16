import { describe, it, expect } from 'vitest';
import { normalizeBaseUrl, DEFAULT_BASE_URL } from '../nodes/InvoicingBuilder/helpers/request';
import { formatApiError } from '../nodes/InvoicingBuilder/helpers/errors';
import { buildDirectInvoice } from '../nodes/InvoicingBuilder/helpers/directInvoice';

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
			lineItems: [{ description: 'Widget A', quantity: 2, rate: 50 }],
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

	it('preserves and maps clientId when provided in buildDirectInvoice', () => {
		const result = buildDirectInvoice({
			templateId: 'tmpl_client',
			format: 'pdf',
			clientId: 'client_xyz_789',
			clientName: 'Client XYZ',
			clientEmail: 'xyz@example.com',
		});

		expect(result.clientId).toBe('client_xyz_789');
		expect(result.fields.clientId).toBe('client_xyz_789');
		expect(result.clientName).toBe('Client XYZ');
		expect(result.clientEmail).toBe('xyz@example.com');
	});

	it('handles multi-row line items and clears template defaults', () => {
		const templateFields = [
			{ id: 'comp_billto', type: 'billTo', value: 'ABC Company' },
			{ id: 'comp_notes', type: 'notes', value: 'Default terms and notes' },
			{
				id: 'comp_table',
				type: 'table',
				value: [{ description: 'Laptop' }, { description: 'Keyboard' }],
			},
		];

		const multiRows = [
			{ description: 'Item 1', quantity: 2, rate: 50 },
			{ description: 'Item 2', quantity: 1, rate: 100 },
			{ description: 'Item 3', quantity: 4, rate: 25 },
		];

		const result = buildDirectInvoice({
			templateId: 'tmpl_multi',
			format: 'pdf',
			billTo: 'XYZ Company',
			tableFieldId: 'comp_table',
			lineItems: multiRows,
			templateFields,
		});

		expect(result.fields.comp_billto).toBe('XYZ Company');
		// Notes was not provided, so cleared from default
		expect(result.fields.comp_notes).toBe('');

		// Line items completely replaced by new rows; old items are gone
		const table = result.fields.comp_table as Array<{
			description: string;
			quantity: string;
			rate: string;
			amount: string;
		}>;
		expect(table).toHaveLength(3);
		expect(table[0].description).toBe('Item 1');
		expect(table[0].quantity).toBe('2');
		expect(table[0].rate).toBe('50');
		expect(table[0].amount).toBe('100.00');

		expect(table[1].description).toBe('Item 2');
		expect(table[1].quantity).toBe('1');
		expect(table[1].rate).toBe('100');
		expect(table[1].amount).toBe('100.00');

		expect(table[2].description).toBe('Item 3');
		expect(table[2].quantity).toBe('4');
		expect(table[2].rate).toBe('25');
		expect(table[2].amount).toBe('100.00');
	});

	it('supports common field aliases in line items (e.g. from upstream nodes or external tables)', () => {
		const itemsWithAliases = [
			{ Item: 'Product Alpha', Qty: 3, Price: 40, Tax: '5%' },
			{ Description: 'Service Beta', Quantity: '2', UnitPrice: '150' },
		];

		const result = buildDirectInvoice({
			templateId: 'tmpl_alias',
			format: 'pdf',
			lineItems: itemsWithAliases,
		});

		const table = result.fields.table as Array<{
			description: string;
			quantity: string;
			rate: string;
			tax: string;
			amount: string;
		}>;
		expect(table).toHaveLength(2);
		expect(table[0].description).toBe('Product Alpha');
		expect(table[0].quantity).toBe('3');
		expect(table[0].rate).toBe('40');
		expect(table[0].tax).toBe('5');
		expect(table[0].amount).toBe('126.00'); // 3 * 40 = 120 + 5% = 126

		expect(table[1].description).toBe('Service Beta');
		expect(table[1].quantity).toBe('2');
		expect(table[1].rate).toBe('150');
		expect(table[1].tax).toBe('');
		expect(table[1].amount).toBe('300.00'); // 2 * 150 = 300
	});
});
