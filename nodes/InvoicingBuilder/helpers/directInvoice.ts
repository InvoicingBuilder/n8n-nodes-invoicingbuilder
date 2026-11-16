import type { IDataObject } from 'n8n-workflow';

export interface TemplateFieldItem {
	id: string;
	type: string;
	label?: string;
	value?: unknown;
}

export interface BuiltInvoiceItem {
	templateId: string;
	format: 'pdf' | 'png';
	externalId?: string;
	clientId?: string;
	clientEmail?: string;
	clientName?: string;
	fields: Record<string, unknown>;
}

export interface DirectLineItemInput {
	description?: string;
	Description?: string;
	item?: string;
	Item?: string;
	name?: string;
	Name?: string;
	title?: string;
	Title?: string;
	quantity?: number | string;
	Quantity?: number | string;
	qty?: number | string;
	Qty?: number | string;
	count?: number | string;
	Count?: number | string;
	rate?: number | string;
	Rate?: number | string;
	price?: number | string;
	Price?: number | string;
	unitPrice?: number | string;
	UnitPrice?: number | string;
	cost?: number | string;
	Cost?: number | string;
	tax?: string | number;
	Tax?: string | number;
	amount?: string | number;
	Amount?: string | number;
	total?: string | number;
	Total?: string | number;
	[key: string]: unknown;
}

export interface DirectAdditionalFields {
	invoiceNumber?: string;
	poNumber?: string;
	issueDate?: string;
	dueDate?: string;
	shipTo?: string;
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
 * Builds an invoice payload directly from workflow parameters and data.
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

	// 2. Format and populate line items with flexible key alias support
	const formattedLineItems = lineItems.map((item, idx) => {
		const rawDesc =
			item.description ??
			item.Description ??
			item.item ??
			item.Item ??
			item.name ??
			item.Name ??
			item.title ??
			item.Title ??
			'';
		const rawQty =
			item.quantity ??
			item.Quantity ??
			item.qty ??
			item.Qty ??
			item.count ??
			item.Count ??
			'1';
		const rawRate =
			item.rate ??
			item.Rate ??
			item.price ??
			item.Price ??
			item.unitPrice ??
			item.UnitPrice ??
			item.cost ??
			item.Cost ??
			'0.00';
		const rawTax = item.tax ?? item.Tax;
		const rawAmount = item.amount ?? item.Amount ?? item.total ?? item.Total;

		const qty = parseFloat(String(rawQty)) || 1;
		const rate = parseFloat(String(rawRate)) || 0;
		const cleanTaxStr =
			rawTax !== undefined && rawTax !== null
				? String(rawTax).replace(/%/g, '').trim()
				: '';
		const taxNum = cleanTaxStr ? parseFloat(cleanTaxStr) || 0 : 0;
		const subtotal = qty * rate;
		const taxAmount = (subtotal * taxNum) / 100;
		const calcAmount = subtotal + taxAmount;

		return {
			id: `item-${idx + 1}-${Date.now()}`,
			description: String(rawDesc),
			quantity: String(rawQty),
			rate: String(rawRate),
			tax: cleanTaxStr,
			amount:
				rawAmount !== undefined && String(rawAmount).trim() !== ''
					? String(rawAmount)
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

	const resolvedInvoiceNumber = invoiceNumber?.trim() || additionalFields.invoiceNumber?.trim();
	if (resolvedInvoiceNumber) {
		fields.invoiceNumber = resolvedInvoiceNumber;
		const tf = templateFields.find((f) => f.type === 'invoiceNumber');
		if (tf) fields[tf.id] = resolvedInvoiceNumber;
	}

	const resolvedPoNumber = poNumber?.trim() || additionalFields.poNumber?.trim();
	if (resolvedPoNumber) {
		fields.poNumber = resolvedPoNumber;
		const tf = templateFields.find((f) => f.type === 'poNumber');
		if (tf) fields[tf.id] = resolvedPoNumber;
	}

	const resolvedIssueDate = issueDate?.trim() || additionalFields.issueDate?.trim();
	if (resolvedIssueDate) {
		const cleanDate = resolvedIssueDate.includes('T') ? resolvedIssueDate.split('T')[0] : resolvedIssueDate.trim();
		fields.customDate = cleanDate;
		fields.date = cleanDate;
		const tf = templateFields.find((f) => f.type === 'customDate' || f.type === 'date');
		if (tf) fields[tf.id] = cleanDate;
	}

	const resolvedDueDate = dueDate?.trim() || additionalFields.dueDate?.trim();
	if (resolvedDueDate) {
		const cleanDueDate = resolvedDueDate.includes('T') ? resolvedDueDate.split('T')[0] : resolvedDueDate.trim();
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
