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

interface TemplateSummaryItem {
	id: string;
	name?: string;
	template?: {
		name?: string;
		templateName?: string;
	};
	updatedAt?: string;
}

interface TemplatesApiResponse {
	items: TemplateSummaryItem[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

const PAGE_SIZE = 50;

/**
 * Searches/pages templates incrementally for n8n resourceLocator list mode.
 * - Loads 50 records per page.
 * - Supports server-side search via `search` query parameter.
 * - Deduplicates in-flight requests and returned records.
 * - Returns `paginationToken` for the next page, or `undefined` at the end of dataset.
 */
export async function searchTemplates(
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

	const cacheKey = `templates:${page}:${trimmedFilter}`;

	try {
		const response = await fetchWithInflightDeduplication(cacheKey, () =>
			apiRequest.call(
				this,
				'GET',
				'/api/v1/templates',
				undefined,
				qs,
			),
		) as TemplatesApiResponse;

		const rawItems: TemplateSummaryItem[] = Array.isArray(response?.items)
			? response.items
			: Array.isArray(response)
			? response
			: [];

		const results: INodeListSearchItems[] = [];
		for (const item of rawItems) {
			if (!item || !item.id) continue;
			const templateName =
				item.template?.name ||
				item.template?.templateName ||
				item.name ||
				`Template ${item.id}`;

			results.push({
				name: templateName,
				value: item.id,
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
