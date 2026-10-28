import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { apiRequest } from '../helpers/request';

interface TemplateSummaryItem {
	id: string;
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

/**
 * Loads all templates by paging through GET /api/v1/templates with limit=50 until totalPages is reached.
 * The display name is template.name || template.templateName.
 */
export async function getTemplates(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const returnData: INodePropertyOptions[] = [];
	let page = 1;
	let totalPages = 1;

	do {
		const response = (await apiRequest.call(
			this,
			'GET',
			'/api/v1/templates',
			undefined,
			{
				page,
				limit: 50,
			},
		)) as TemplatesApiResponse;

		if (response && Array.isArray(response.items)) {
			for (const item of response.items) {
				const templateName =
					item.template?.name ||
					item.template?.templateName ||
					`Template ${item.id}`;

				returnData.push({
					name: templateName,
					value: item.id,
				});
			}
		}

		totalPages = response?.totalPages || 1;
		page++;
	} while (page <= totalPages);

	return returnData;
}
