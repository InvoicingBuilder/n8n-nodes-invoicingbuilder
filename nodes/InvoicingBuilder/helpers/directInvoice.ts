import type { IDataObject } from 'n8n-workflow';
import type { BuiltInvoiceItem, TemplateFieldItem } from './buildInvoiceFields';

export interface DirectLineItemInput {
	description: string;
	quantity?: number | string;
	rate?: number | string;
	tax?: string | number;
	amount?: string | number;
}

export interface DirectAdditionalFields {
	shipTo?: string;
	poNumber?: string;
	paymentTerms?: string;
	notes?: string;
	terms?: string;
	amountPaid?: string | number;
	logo?: string;
	signature?: string;
	customFieldsJson?: string | IDataObject;
}

export interface BuildDirectInvoiceOptions {
	templateId: string;
	format: 'pdf' | 'png';
	invoiceNumber?: string;
	poNumber?: string;
	clientId?: string;
	clientName?: string;
	clientEmail?: string;
	billTo?: string;
	shipTo?: string;
	issueDate?: string;
	dueDate?: string;
	lineItems?: DirectLineItemInput[];
	additionalFields?: DirectAdditionalFields;
	templateFields?: TemplateFieldItem[];
	tableFieldId?: string;
}

/**
 * Builds an invoice payload directly from workflow parameters without spreadsheet dependence.
 * Clears unused template defaults and properly formats line items.
 */
export function buildDirectInvoice(options: BuildDirectInvoiceOptions): BuiltInvoiceItem {
	const {
		templateId,
		format,
		invoiceNumber,
		poNumber,
		clientId,
		clientName,
		clientEmail,
		billTo,
		shipTo,
		issueDate,
		dueDate,
		lineItems = [],
		additionalFields = {},
		templateFields = [],
		tableFieldId,
	} = options;

	const fields: Record<string, unknown> = {};

	// 1. Clear editable template fields by default to avoid stale designer dummy data
	// Preserve preconfigured template logo/signature unless explicitly overridden
	for (const tf of templateFields) {
		if (tf && tf.id) {
			if (tf.type === 'table' || tf.type === 'payslipTable') {
				fields[tf.id] = [];
			} else if (tf.type !== 'total' && tf.type !== 'addLogo' && tf.type !== 'signature') {
				fields[tf.id] = '';
			}
		}
	}

	// 2. Format and populate line items
	const formattedLineItems = lineItems.map((item, idx) => {
		const qty = parseFloat(String(item.quantity ?? '1')) || 1;
		const rate = parseFloat(String(item.rate ?? '0.00')) || 0;
		const cleanTaxStr =
			item.tax !== undefined && item.tax !== null
				? String(item.tax).replace(/%/g, '').trim()
				: '';
		const taxNum = cleanTaxStr ? parseFloat(cleanTaxStr) || 0 : 0;
		const subtotal = qty * rate;
		const taxAmount = (subtotal * taxNum) / 100;
		const calcAmount = subtotal + taxAmount;

		return {
			id: `item-${idx + 1}-${Date.now()}`,
			description: item.description || '',
			quantity: String(item.quantity ?? '1'),
			rate: String(item.rate ?? '0.00'),
			tax: cleanTaxStr,
			amount:
				item.amount !== undefined && String(item.amount).trim() !== ''
					? String(item.amount)
					: calcAmount.toFixed(2),
		};
	});

	if (tableFieldId) {
		fields[tableFieldId] = formattedLineItems;
	}
	fields.table = formattedLineItems;

	// 3. Map primary fields (both by standard component key and matching template field IDs)
	if (billTo && billTo.trim()) {
		fields.billTo = billTo.trim();
		const tf = templateFields.find((f) => f.type === 'billTo');
		if (tf) fields[tf.id] = billTo.trim();
	}

	const resolvedShipTo = shipTo?.trim() || additionalFields.shipTo?.trim();
	if (resolvedShipTo) {
		fields.shipTo = resolvedShipTo;
		const tf = templateFields.find((f) => f.type === 'shipTo');
		if (tf) fields[tf.id] = resolvedShipTo;
	}

	if (clientEmail && clientEmail.trim()) {
		fields.clientEmail = clientEmail.trim();
		const tf = templateFields.find(
			(f) =>
				f.type === 'textarea' &&
				(f.label?.toLowerCase().includes('email') || f.id.toLowerCase().includes('email')),
		);
		if (tf) fields[tf.id] = clientEmail.trim();
	}

	if (invoiceNumber && invoiceNumber.trim()) {
		fields.invoiceNumber = invoiceNumber.trim();
		const tf = templateFields.find((f) => f.type === 'invoiceNumber');
		if (tf) fields[tf.id] = invoiceNumber.trim();
	}

	const resolvedPoNumber = poNumber?.trim() || additionalFields.poNumber?.trim();
	if (resolvedPoNumber) {
		fields.poNumber = resolvedPoNumber;
		const tf = templateFields.find((f) => f.type === 'poNumber');
		if (tf) fields[tf.id] = resolvedPoNumber;
	}

	if (issueDate && issueDate.trim()) {
		const cleanDate = issueDate.includes('T') ? issueDate.split('T')[0] : issueDate.trim();
		fields.customDate = cleanDate;
		fields.date = cleanDate;
		const tf = templateFields.find((f) => f.type === 'customDate' || f.type === 'date');
		if (tf) fields[tf.id] = cleanDate;
	}

	if (dueDate && dueDate.trim()) {
		const cleanDueDate = dueDate.includes('T') ? dueDate.split('T')[0] : dueDate.trim();
		fields.dueDate = cleanDueDate;
		const tf = templateFields.find((f) => f.type === 'dueDate');
		if (tf) fields[tf.id] = cleanDueDate;
	}

	// 4. Map additional fields
	const logoVal =
		additionalFields.logo || (additionalFields as Record<string, unknown>).addLogo;
	if (logoVal && String(logoVal).trim()) {
		const trimmedLogo = String(logoVal).trim();
		fields.addLogo = trimmedLogo;
		fields.logo = trimmedLogo;
		const tf = templateFields.find((f) => f.type === 'addLogo' || f.type === 'logo');
		if (tf) fields[tf.id] = trimmedLogo;
	}

	if (additionalFields.signature && String(additionalFields.signature).trim()) {
		const trimmedSig = String(additionalFields.signature).trim();
		fields.signature = trimmedSig;
		const tf = templateFields.find((f) => f.type === 'signature');
		if (tf) fields[tf.id] = trimmedSig;
	}

	if (additionalFields.paymentTerms && additionalFields.paymentTerms.trim()) {
		fields.paymentTerms = additionalFields.paymentTerms.trim();
		const tf = templateFields.find((f) => f.type === 'paymentTerms');
		if (tf) fields[tf.id] = additionalFields.paymentTerms.trim();
	}

	if (additionalFields.notes && additionalFields.notes.trim()) {
		fields.notes = additionalFields.notes.trim();
		const tf = templateFields.find((f) => f.type === 'notes');
		if (tf) fields[tf.id] = additionalFields.notes.trim();
	}

	if (additionalFields.terms && additionalFields.terms.trim()) {
		fields.terms = additionalFields.terms.trim();
		const tf = templateFields.find((f) => f.type === 'terms');
		if (tf) fields[tf.id] = additionalFields.terms.trim();
	}

	if (additionalFields.amountPaid !== undefined && String(additionalFields.amountPaid).trim() !== '') {
		fields.amountPaid = String(additionalFields.amountPaid).trim();
		const tf = templateFields.find((f) => f.type === 'amountPaid');
		if (tf) fields[tf.id] = String(additionalFields.amountPaid).trim();
	}

	// 5. Merge raw customFieldsJson if provided
	if (additionalFields.customFieldsJson) {
		let customObj: Record<string, unknown> = {};
		if (typeof additionalFields.customFieldsJson === 'string') {
			try {
				customObj = JSON.parse(additionalFields.customFieldsJson);
			} catch {
				// Ignore invalid JSON string
			}
		} else if (typeof additionalFields.customFieldsJson === 'object') {
			customObj = additionalFields.customFieldsJson as Record<string, unknown>;
		}
		Object.assign(fields, customObj);
	}

	if (clientId && clientId.trim()) {
		fields.clientId = clientId.trim();
	}

	return {
		templateId,
		format,
		clientId: clientId?.trim() || undefined,
		clientEmail: clientEmail?.trim() || undefined,
		clientName: clientName?.trim() || undefined,
		fields,
	};
}
