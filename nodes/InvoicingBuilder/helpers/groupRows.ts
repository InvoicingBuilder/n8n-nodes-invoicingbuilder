import type { IDataObject } from 'n8n-workflow';

export interface RowGroup {
	groupKey: string;
	rows: IDataObject[];
	itemIndexes: number[];
}

function normalizeKey(str: string): string {
	return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Auto-detects the column in the spreadsheet that identifies distinct invoices.
 */
export function findInvoiceIdentifierColumn(headers: string[]): string | undefined {
	const invoiceNumberCandidates = [
		'invoicenumber',
		'invoiceno',
		'invoicenum',
		'invoiceid',
		'invoice',
		'invnumber',
		'invno',
		'inv',
	];

	const orderCandidates = ['orderid', 'ordernumber', 'orderno', 'order'];

	const customerCandidates = ['customername', 'customer', 'clientname', 'client', 'billto'];

	const allCandidateGroups = [invoiceNumberCandidates, orderCandidates, customerCandidates];

	// 1. Exact normalized match first (highest priority)
	for (const candidateGroup of allCandidateGroups) {
		for (const cand of candidateGroup) {
			for (const header of headers) {
				if (normalizeKey(header) === cand) {
					return header;
				}
			}
		}
	}

	// 2. StartsWith or EndsWith match
	for (const candidateGroup of allCandidateGroups) {
		for (const cand of candidateGroup) {
			if (cand.length < 3) continue;
			for (const header of headers) {
				const norm = normalizeKey(header);
				if (norm.startsWith(cand) || norm.endsWith(cand)) {
					return header;
				}
			}
		}
	}

	return undefined;
}

/**
 * Pure function to group items by an invoice data column value (e.g. Invoice Number / Order ID).
 * If groupByColumn is not provided, it auto-detects the invoice identifier column from the data.
 * If no identifier column exists or all rows have the same identifier, all rows belong to 1 invoice.
 * Preserves the original arrival order of groups and rows.
 */
export function groupRows(
	items: IDataObject[],
	groupByColumn?: string,
): RowGroup[] {
	if (!items || items.length === 0) {
		return [];
	}

	const trimmedColumn = groupByColumn?.trim();
	const firstRow = items[0] || {};
	const headers = Object.keys(firstRow);

	// Use explicitly configured column or auto-detect invoice identifier from data
	const colToUse = trimmedColumn || findInvoiceIdentifierColumn(headers);

	// If no column is provided and no invoice identifier column exists,
	// all rows in the spreadsheet belong to one single invoice
	if (!colToUse) {
		return [
			{
				groupKey: '',
				rows: items,
				itemIndexes: items.map((_, index) => index),
			},
		];
	}

	const groupsMap = new Map<string, RowGroup>();
	let currentGroupKey = '';

	items.forEach((item, index) => {
		const rawVal = item[colToUse];
		let key = rawVal === null || rawVal === undefined ? '' : String(rawVal).trim();

		// If current row has blank key but follows an active invoice group, attach to current group
		if (!key && currentGroupKey) {
			key = currentGroupKey;
		} else if (key) {
			currentGroupKey = key;
		}

		const existing = groupsMap.get(key);
		if (existing) {
			existing.rows.push(item);
			existing.itemIndexes.push(index);
		} else {
			groupsMap.set(key, {
				groupKey: key,
				rows: [item],
				itemIndexes: [index],
			});
		}
	});

	return Array.from(groupsMap.values());
}
