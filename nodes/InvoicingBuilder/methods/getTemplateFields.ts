import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { apiRequest } from '../helpers/request';

interface TemplateFieldItem {
	id: string;
	type: string;
	label?: string;
	value?: unknown;
}

interface TemplateFieldsApiResponse {
	id: string;
	source: string;
	updatedAt: string;
	fields: TemplateFieldItem[];
}

/**
 * Loads fields for the selected template (excluding type table).
 * Label shown as <label> (<type>), value is the field ID.
 */
export async function getTemplateFields(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	let templateId = this.getCurrentNodeParameter('templateId') as string | undefined;
	if (!templateId) {
		try {
			templateId = this.getNodeParameter('templateId', 0) as string | undefined;
		} catch {
			// Parameter not yet selected or not available
		}
	}

	if (!templateId) {
		return [];
	}

	const response = (await apiRequest.call(
		this,
		'GET',
		'/api/v1/templates/fields',
		undefined,
		{ templateId },
	)) as TemplateFieldsApiResponse;

	if (response && Array.isArray(response.fields)) {
		return response.fields
			.filter((f) => f && f.type !== 'table')
			.map((f) => ({
				name: `${f.label || f.id} (${f.type})`,
				value: f.id,
			}));
	}

	return [];
}
