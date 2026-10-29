import type {
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { apiRequest } from '../helpers/request';
import {
	deduplicateByValue,
	extractResourceLocatorValue,
	fetchWithInflightDeduplication,
	findComponentRecursive,
	type RecursiveComponentItem,
} from '../helpers/resourceLocator';

interface InvoiceHistoryItem {
	id: string;
	invoice?: {
		id?: string;
		templateName?: string;
		date?: string;
		balanceDue?: string;
		currency?: string;
		invoiceNumber?: string;
		name?: string;
		components?: RecursiveComponentItem[];
	};
	updatedAt?: string;
}

interface InvoicesListResponse {
	items: InvoiceHistoryItem[];
	total: number;
	page?: number;
	limit?: number;
	totalPages?: number;
}

const PAGE_SIZE = 50;

/**
 * Searches/pages client invoices incrementally for n8n resourceLocator list mode.
 * - Extracts selected `clientId`.
 * - Loads 50 records per page belonging to the selected client.
 * - Supports server-side search via `search` query parameter.
 * - Deduplicates in-flight requests and returned records.
 * - Returns `paginationToken` for the next page, or `undefined` at the end of dataset.
 */
export async function searchClientInvoices(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	let clientId: unknown;
	try {
		if (typeof this.getCurrentNodeParameter === 'function') {
			clientId = this.getCurrentNodeParameter('clientId');
		}
		if (!clientId && typeof this.getNodeParameter === 'function') {
			clientId = this.getNodeParameter('clientId', '');
		}
	} catch {
		try {
			clientId = this.getNodeParameter('clientId', '');
		} catch {
			return { results: [] };
		}
	}

	const trimmedClientId = extractResourceLocatorValue(clientId).trim();
	if (!trimmedClientId) {
		return { results: [] };
	}

	const page = paginationToken ? parseInt(paginationToken, 10) : 1;
	const trimmedFilter = filter?.trim() || '';

	const qs: Record<string, string | number> = {
		page,
		limit: PAGE_SIZE,
	};
	if (trimmedFilter) {
		qs.search = trimmedFilter;
	}

	const cacheKey = `clientInvoices:${trimmedClientId}:${page}:${trimmedFilter}`;

	try {
		const response = (await fetchWithInflightDeduplication(cacheKey, () =>
			apiRequest.call(
				this,
				'GET',
				`/api/v1/clients/${trimmedClientId}/invoices`,
				undefined,
				qs,
			),
		)) as InvoicesListResponse;

		const rawItems: InvoiceHistoryItem[] = Array.isArray(response?.items)
			? response.items
			: Array.isArray(response)
			? response
			: [];

		const results: INodeListSearchItems[] = [];
		for (const item of rawItems) {
			if (!item || !item.id) continue;
			const inv = item.invoice || {};
			const numComp = findComponentRecursive(inv.components, [
				'invoiceNumber',
				'invoice_number',
				'invoice-number',
			]);
			const invoiceNumber = (
				numComp?.properties?.text ||
				numComp?.properties?.invoiceNumber ||
				inv.invoiceNumber ||
				''
			).trim();

			const templateName = inv.templateName || inv.name || 'Invoice';
			const title = invoiceNumber
				? `${invoiceNumber} (${templateName})`
				: templateName || item.id;

			const dateComp = findComponentRecursive(inv.components, [
				'customDate',
				'date',
				'issueDate',
				'invoiceDate',
			]);
			const rawDate =
				inv.date || dateComp?.properties?.text || dateComp?.properties?.date;
			const issueDate = rawDate ? String(rawDate).split('T')[0] : '';

			const currency = inv.currency || '$';
			const amountStr =
				inv.balanceDue !== undefined && inv.balanceDue !== null && inv.balanceDue !== ''
					? `${currency}${inv.balanceDue}`
					: '';

			const parts: string[] = [title];
			if (issueDate) parts.push(issueDate);
			if (amountStr) parts.push(amountStr);

			const label = parts.join(' - ');

			const descParts: string[] = [];
			if (issueDate) descParts.push(`Date: ${issueDate}`);
			if (amountStr) descParts.push(`Balance: ${amountStr}`);

			results.push({
				name: label,
				value: item.id,
				description: descParts.length > 0 ? descParts.join(' | ') : undefined,
			});
		}

		const uniqueResults = deduplicateByValue(results);

		const totalPages =
			typeof response?.totalPages === 'number'
				? response.totalPages
				: typeof response?.total === 'number'
				? Math.ceil(response.total / PAGE_SIZE)
				: 1;

		const hasNextPage = page < totalPages && rawItems.length >= PAGE_SIZE;

		return {
			results: uniqueResults,
			paginationToken: hasNextPage ? String(page + 1) : undefined,
		};
	} catch {
		return {
			results: [],
		};
	}
}
