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

interface ClientItem {
	id: string;
	name: string;
	email?: string;
	billTo?: string;
	shipTo?: string;
}

interface ClientsApiResponse {
	items?: ClientItem[];
	total?: number;
	page?: number;
	limit?: number;
	totalPages?: number;
}

const PAGE_SIZE = 50;

/**
 * Searches/pages clients incrementally for n8n resourceLocator list mode.
 * - Loads 50 records per page.
 * - Supports server-side search via `search` query parameter.
 * - Deduplicates in-flight requests and returned records.
 * - Returns `paginationToken` for the next page, or `undefined` at the end of dataset.
 */
export async function searchClients(
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

	const cacheKey = `clients:${page}:${trimmedFilter}`;

	try {
		const response = await fetchWithInflightDeduplication(cacheKey, () =>
			apiRequest.call(
				this,
				'GET',
				'/api/v1/clients',
				undefined,
				qs,
			),
		) as ClientsApiResponse | ClientItem[];

		const rawItems: ClientItem[] = Array.isArray(response)
			? response
			: Array.isArray((response as ClientsApiResponse)?.items)
			? (response as ClientsApiResponse).items!
			: [];

		const results: INodeListSearchItems[] = [];
		for (const client of rawItems) {
			if (!client || !client.id) continue;
			const displayName = client.email
				? `${client.name} (${client.email})`
				: client.name || client.id;

			const details: string[] = [];
			if (client.billTo) {
				details.push(`Bill: ${client.billTo.replace(/\r?\n/g, ', ')}`);
			}
			if (client.shipTo) {
				details.push(`Ship: ${client.shipTo.replace(/\r?\n/g, ', ')}`);
			}

			results.push({
				name: displayName,
				value: client.id,
				description: details.length > 0 ? details.join(' | ') : undefined,
			});
		}

		const uniqueResults = deduplicateByValue(results);

		let hasNextPage = false;
		if (!Array.isArray(response) && typeof response?.totalPages === 'number') {
			hasNextPage = page < response.totalPages && rawItems.length >= PAGE_SIZE;
		} else if (!Array.isArray(response) && typeof response?.total === 'number') {
			const totalPages = Math.ceil(response.total / PAGE_SIZE);
			hasNextPage = page < totalPages && rawItems.length >= PAGE_SIZE;
		} else {
			hasNextPage = rawItems.length >= PAGE_SIZE;
		}

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
