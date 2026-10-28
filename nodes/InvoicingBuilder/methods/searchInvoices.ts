import type {
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { apiRequest } from '../helpers/request';
import {
	deduplicateByValue,
	fetchWithInflightDeduplication,
} from '../helpers/resourceLocator';

interface ComponentItem {
	type?: string;
	properties?: {
		text?: string;
		invoiceNumber?: string;
		date?: string;
	};
}

interface InvoiceHistoryItem {
	id: string;
	invoice?: {
		id?: string;
		templateName?: string;
		date?: string;
		balanceDue?: string;
		currency?: string;
		components?: ComponentItem[];
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
 * Searches/pages invoices incrementally for n8n resourceLocator list mode.
 * - Loads 50 records per page.
 * - Supports server-side search via `search` query parameter.
 * - Deduplicates in-flight requests and returned records.
 * - Returns `paginationToken` for the next page, or `undefined` at the end of dataset.
 */
export async function searchInvoices(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const page = paginationToken ? parseInt(paginationToken, 10) : 1;
	const trimmedFilter = filter?.trim() || '';

	const qs: Record<string, string | number> = {
		page,
		limit: PAGE_SIZE,
	};
	if (trimmedFilter) {
		qs.search = trimmedFilter;
	}

	const cacheKey = `invoices:${page}:${trimmedFilter}`;

	try {
		const response = await fetchWithInflightDeduplication(cacheKey, () =>
			apiRequest.call(
				this,
				'GET',
				'/api/v1/n8n/invoices',
				undefined,
				qs,
			),
		) as InvoicesListResponse;

		const rawItems: InvoiceHistoryItem[] = Array.isArray(response?.items)
			? response.items
			: Array.isArray(response)
			? response
			: [];

		const results: INodeListSearchItems[] = [];
		for (const item of rawItems) {
			if (!item || !item.id) continue;
			const inv = item.invoice || {};
			const numComp = inv.components?.find(
				(c: ComponentItem) => c?.type === 'invoiceNumber' || c?.type === 'invoice-number',
			);
			const invoiceNumber = numComp?.properties?.text || numComp?.properties?.invoiceNumber;
			const title = invoiceNumber
				? `${invoiceNumber} (${inv.templateName || 'Invoice'})`
				: inv.templateName || item.id;

			const dateComp = inv.components?.find(
				(c: ComponentItem) => c?.type === 'customDate' || c?.type === 'date',
			);
			const rawDate = inv.date || dateComp?.properties?.text || dateComp?.properties?.date;
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
