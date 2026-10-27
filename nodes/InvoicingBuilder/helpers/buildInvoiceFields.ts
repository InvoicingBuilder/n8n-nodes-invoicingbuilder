import type { IDataObject } from 'n8n-workflow';

export interface HeaderFieldMapping {
	fieldId: string;
	column: string;
}

export interface LineItemColumnConfig {
	description?: string;
	quantity?: string;
	rate?: string;
	tax?: string;
}

export interface TemplateFieldItem {
	id: string;
	type: string;
	label?: string;
	value?: unknown;
}

export interface BuildInvoiceFieldsOptions {
	rowGroup: {
		rows: IDataObject[];
	};
	templateId: string;
	format: 'pdf' | 'png';
	headerMappings?: HeaderFieldMapping[];
	lineItemColumns?: LineItemColumnConfig;
	externalIdColumn?: string;
	tableFieldId?: string;
	templateFields?: TemplateFieldItem[];
}

export interface BuiltInvoiceItem {
	templateId: string;
	format: 'pdf' | 'png';
	externalId?: string;
	clientEmail?: string;
	clientName?: string;
	fields: Record<string, unknown>;
}

function isNilOrEmpty(value: unknown): boolean {
	return value === undefined || value === null || String(value).trim() === '';
}

/**
 * Builds the invoice payload from spreadsheet rows.
 * Clears existing template values prior to populating with new data.
 * Completely replaces the line-item collection rather than appending.
 */
function normalizeKey(str: string): string {
	return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds a column in spreadsheet headers matching candidate names/aliases.
 */
function findMatchingColumn(headers: string[], candidates: string[]): string | undefined {
	const normalizedCandidates = candidates.map(normalizeKey);

	// 1. Exact normalized match first (highest priority)
	for (const cand of normalizedCandidates) {
		for (const header of headers) {
			if (normalizeKey(header) === cand) {
				return header;
			}
		}
	}

	// 2. Substring/prefix match (lower priority)
	for (const cand of normalizedCandidates) {
		if (cand.length < 3) continue;
		for (const header of headers) {
			const normHeader = normalizeKey(header);
			if (normHeader.startsWith(cand) || normHeader.endsWith(cand) || normHeader.includes(cand)) {
				return header;
			}
		}
	}

	return undefined;
}

/**
 * Builds the invoice payload from spreadsheet rows.
 * Clears existing template values prior to populating with new data.
 * Supports both manual and automatic mapping of headers and line items.
 * Completely replaces the line-item collection rather than appending.
 */
export function buildInvoiceFields(options: BuildInvoiceFieldsOptions): BuiltInvoiceItem {
	const {
		rowGroup,
		templateId,
		format,
		headerMappings = [],
		lineItemColumns,
		externalIdColumn,
		tableFieldId,
		templateFields = [],
	} = options;

	const firstRow = rowGroup.rows[0] || {};
	const headers = Object.keys(firstRow);
	const fields: Record<string, unknown> = {};

	// 1. Clear all existing template values so defaults (customer details, dates, items) do not linger
	for (const tf of templateFields) {
		if (!tf.id) continue;
		if (tf.type === 'table' || tf.type === 'payslipTable') {
			fields[tf.id] = [];
		} else {
			fields[tf.id] = '';
		}
	}

	// 2. Header Fields: Manual mappings take precedence
	const mappedFieldIds = new Set<string>();
	for (const mapping of headerMappings) {
		if (mapping.fieldId && mapping.column) {
			const cellVal = firstRow[mapping.column];
			const val = cellVal !== undefined && cellVal !== null ? String(cellVal).trim() : '';
			fields[mapping.fieldId] = val;
			mappedFieldIds.add(mapping.fieldId);
		}
	}

	// Resolve Line Item Columns: Manual mappings override auto-detection
	const descriptionCol =
		lineItemColumns?.description?.trim() ||
		findMatchingColumn(headers, [
			'description',
			'item',
			'itemname',
			'itemdescription',
			'product',
			'productname',
			'service',
			'servicename',
			'details',
			'particulars',
			'title',
			'name',
		]);

	const quantityCol =
		lineItemColumns?.quantity?.trim() ||
		findMatchingColumn(headers, ['quantity', 'qty', 'count', 'units', 'hours', 'numberofunits']);

	const rateCol =
		lineItemColumns?.rate?.trim() ||
		findMatchingColumn(headers, [
			'rate',
			'unitprice',
			'price',
			'unitcost',
			'cost',
			'fee',
			'hourlyrate',
			'rateperunit',
		]);

	const taxCol =
		lineItemColumns?.tax?.trim() ||
		findMatchingColumn(headers, [
			'tax',
			'taxrate',
			'vat',
			'gst',
			'taxpercentage',
			'taxpercent',
			'tax%',
			'taxes',
			'itemtax',
			'linetax',
			'taxamount',
			'taxvalue',
		]);

	const amountCol = findMatchingColumn(headers, ['amount', 'linetotal', 'totalamount', 'subtotal', 'total']);

	// 3. For unmapped template fields, auto-detect matching columns from spreadsheet headers
	for (const tf of templateFields) {
		if (!tf.id || mappedFieldIds.has(tf.id)) continue;
		if (tf.type === 'table' || tf.type === 'payslipTable') continue;

		const candidates: string[] = [];
		if (tf.label) candidates.push(tf.label);
		if (tf.type) candidates.push(tf.type);
		if (tf.id) candidates.push(tf.id);

		switch (tf.type) {
			case 'invoiceNumber':
			case 'invoiceLabel':
				candidates.push(
					'invoicenumber',
					'invoiceno',
					'invoicenum',
					'invoiceid',
					'invoice',
					'invnumber',
					'invno',
					'inv',
					'orderid',
					'ordernumber',
					'orderno',
					'order',
				);
				break;
			case 'customDate':
			case 'date':
				candidates.push('invoicedate', 'date', 'issuedate', 'createddate', 'billdate');
				break;
			case 'dueDate':
				candidates.push('duedate', 'paymentdue', 'paymentduedate', 'due');
				break;
			case 'billTo':
				candidates.push(
					'billto',
					'customername',
					'customer',
					'clientname',
					'client',
					'billedto',
					'recipient',
					'company',
					'companyname',
				);
				break;
			case 'shipTo':
				candidates.push('shipto', 'shippingaddress', 'deliveryaddress', 'shippedto', 'shipping');
				break;
			case 'poNumber':
				candidates.push('ponumber', 'pono', 'po', 'purchaseorder', 'purchaseordernumber');
				break;
			case 'terms':
			case 'paymentTerms':
				candidates.push('terms', 'paymentterms', 'conditions');
				break;
			case 'notes':
				candidates.push('notes', 'note', 'memo', 'remarks', 'comments');
				break;
			case 'amountPaid':
				candidates.push('amountpaid', 'paidamount', 'paid', 'deposit');
				break;
			default:
				if (
					(tf.label && tf.label.toLowerCase().includes('email')) ||
					(tf.id && tf.id.toLowerCase().includes('email'))
				) {
					candidates.push('customeremail', 'clientemail', 'email', 'billingemail');
				}
				break;
		}

		// Don't auto-match line item columns to header fields
		const candidatesFiltered = candidates.filter((c) => {
			const norm = normalizeKey(c);
			return (
				norm !== normalizeKey(descriptionCol || '') &&
				norm !== normalizeKey(rateCol || '') &&
				norm !== normalizeKey(quantityCol || '')
			);
		});

		const matchedCol = findMatchingColumn(headers, candidatesFiltered);
		if (matchedCol && firstRow[matchedCol] !== undefined && firstRow[matchedCol] !== null) {
			const cellVal = String(firstRow[matchedCol]).trim();
			fields[tf.id] = cellVal;
			if (tf.type) fields[tf.type] = cellVal;
			if (tf.label) fields[tf.label] = cellVal;
		} else {
			fields[tf.id] = '';
			if (tf.type) fields[tf.type] = '';
		}
	}

	// 4. Map line items
	const tableRows: Array<{
		description: string;
		quantity: string | number;
		rate: string | number;
		tax?: string | number;
		amount?: string | number;
	}> = [];

	for (const row of rowGroup.rows) {
		const desc = descriptionCol ? row[descriptionCol] : undefined;
		const rate = rateCol ? row[rateCol] : undefined;
		const qty = quantityCol ? row[quantityCol] : undefined;
		const tax = taxCol ? row[taxCol] : undefined;
		const amount = amountCol ? row[amountCol] : undefined;

		// Skip row if description, rate, and amount are all empty
		if (isNilOrEmpty(desc) && isNilOrEmpty(rate) && isNilOrEmpty(amount)) {
			continue;
		}

		const qtyStr =
			qty !== undefined && qty !== null && String(qty).trim() !== '' ? String(qty).trim() : '1';
		const qtyNum = parseFloat(qtyStr) || 1;
		let rateStr = '0';
		if (!isNilOrEmpty(rate)) {
			rateStr = String(rate).trim();
		} else if (!isNilOrEmpty(amount)) {
			const amtNum = parseFloat(String(amount).trim()) || 0;
			rateStr = (amtNum / qtyNum).toFixed(2);
		}

		const rateNum = parseFloat(rateStr) || 0;
		const cleanTaxStr = !isNilOrEmpty(tax) ? String(tax).replace(/%/g, '').trim() : '';
		const taxNum = cleanTaxStr ? parseFloat(cleanTaxStr) || 0 : 0;
		const calcAmount = !isNilOrEmpty(amount)
			? String(amount).trim()
			: (qtyNum * rateNum + (qtyNum * rateNum * taxNum) / 100).toFixed(2);

		const lineItem: {
			description: string;
			quantity: string | number;
			rate: string | number;
			tax?: string | number;
			amount?: string | number;
		} = {
			description: desc !== undefined && desc !== null ? String(desc).trim() : '',
			quantity: qtyStr,
			rate: rateStr,
			amount: calcAmount,
		};

		if (cleanTaxStr) {
			lineItem.tax = cleanTaxStr;
		}

		tableRows.push(lineItem);
	}

	// Completely replace the line-item collection
	if (tableFieldId) {
		fields[tableFieldId] = tableRows;
	}
	for (const tf of templateFields) {
		if (tf.id && (tf.type === 'table' || tf.type === 'payslipTable')) {
			fields[tf.id] = tableRows;
		}
	}
	fields['table'] = tableRows;
	fields['payslipTable'] = tableRows;

	// Enable tax column if any line items have tax or if a tax column was provided
	const hasAnyTax =
		Boolean(taxCol) ||
		tableRows.some(
			(r) =>
				r.tax !== undefined &&
				r.tax !== null &&
				String(r.tax).trim() !== '' &&
				String(r.tax).trim() !== '0',
		);

	if (hasAnyTax) {
		fields['taxColumn'] = true;
	}

	// 5. Set externalId from first row of group if specified or auto-detected
	let externalId: string | undefined;
	const resolvedExternalIdCol =
		externalIdColumn ||
		findMatchingColumn(headers, [
			'invoicenumber',
			'invoiceno',
			'invoiceid',
			'invoice',
			'inv',
			'orderid',
			'ordernumber',
			'id',
		]);

	if (
		resolvedExternalIdCol &&
		firstRow[resolvedExternalIdCol] !== undefined &&
		firstRow[resolvedExternalIdCol] !== null
	) {
		const extVal = String(firstRow[resolvedExternalIdCol]).trim();
		if (extVal.length > 0) {
			externalId = extVal;
		}
	}

	// 6. Detect clientEmail and clientName from spreadsheet columns
	let clientEmail: string | undefined;
	const clientEmailCol = findMatchingColumn(headers, [
		'clientemail',
		'customeremail',
		'email',
		'clientmail',
		'billingemail',
		'billtoemail',
	]);
	if (
		clientEmailCol &&
		firstRow[clientEmailCol] !== undefined &&
		firstRow[clientEmailCol] !== null
	) {
		const emailVal = String(firstRow[clientEmailCol]).trim();
		if (emailVal.length > 0) {
			clientEmail = emailVal;
		}
	}

	let clientName: string | undefined;
	const clientNameCol = findMatchingColumn(headers, [
		'clientname',
		'customername',
		'client',
		'customer',
		'billto',
		'billedto',
		'recipient',
		'company',
		'companyname',
	]);
	if (
		clientNameCol &&
		firstRow[clientNameCol] !== undefined &&
		firstRow[clientNameCol] !== null
	) {
		const nameVal = String(firstRow[clientNameCol]).trim();
		if (nameVal.length > 0) {
			clientName = nameVal;
		}
	}

	const invoice: BuiltInvoiceItem = {
		templateId,
		format,
		fields,
	};

	if (externalId) {
		invoice.externalId = externalId;
	}
	if (clientEmail) {
		invoice.clientEmail = clientEmail;
	}
	if (clientName) {
		invoice.clientName = clientName;
	}

	return invoice;
}
