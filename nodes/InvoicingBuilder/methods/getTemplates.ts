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

	try {
		const response = (await apiRequest.call(
			this,
			'GET',
			'/api/v1/templates',
			undefined,
			{
				page: 1,
				limit: 50,
			},
		)) as TemplatesApiResponse;

		const items = Array.isArray(response?.items) ? response.items : [];
		for (const item of items) {
			const templateName =
				item.template?.name ||
				item.template?.templateName ||
				`Template ${item.id}`;

			returnData.push({
				name: templateName,
				value: item.id,
			});
		}
	} catch {
		// If request fails (e.g. offline configuration), return empty list
	}

	return returnData;
}
