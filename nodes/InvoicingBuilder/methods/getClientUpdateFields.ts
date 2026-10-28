import type { ILoadOptionsFunctions, ResourceMapperFields } from 'n8n-workflow';
import { apiRequest } from '../helpers/request';

interface ClientItem {
	id: string;
	name: string;
	email?: string;
	billTo?: string;
	shipTo?: string;
}

/**
 * Loads existing client details to automatically populate update fields in resourceMapper.
 */
export async function getClientUpdateFields(
	this: ILoadOptionsFunctions,
): Promise<ResourceMapperFields> {
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
			return { fields: [] };
		}
	}

	if (typeof clientId === 'object' && clientId !== null && 'value' in clientId) {
		clientId = (clientId as { value?: string }).value;
	}

	if (!clientId || typeof clientId !== 'string') {
		return { fields: [] };
	}

	const trimmedId = clientId.trim();
	if (!trimmedId) {
		return { fields: [] };
	}

	try {
		const client = (await apiRequest.call(
			this,
			'GET',
			`/api/v1/clients/${trimmedId}`,
		)) as ClientItem;

		return {
			fields: [
				{
					id: 'name',
					displayName: 'Name',
					required: false,
					display: true,
					type: 'string',
					defaultMatch: false,
					canBeUsedToMatch: false,
					defaultValue: client.name || '',
				},
				{
					id: 'email',
					displayName: 'Email',
					required: false,
					display: true,
					type: 'string',
					defaultMatch: false,
					canBeUsedToMatch: false,
					defaultValue: client.email || '',
				},
				{
					id: 'billTo',
					displayName: 'Bill To',
					required: false,
					display: true,
					type: 'string',
					defaultMatch: false,
					canBeUsedToMatch: false,
					defaultValue: client.billTo || '',
				},
				{
					id: 'shipTo',
					displayName: 'Ship To',
					required: false,
					display: true,
					type: 'string',
					defaultMatch: false,
					canBeUsedToMatch: false,
					defaultValue: client.shipTo || '',
				},
			],
		};
	} catch {
		return {
			fields: [
				{
					id: 'name',
					displayName: 'Name',
					required: false,
					display: true,
					type: 'string',
					defaultMatch: false,
					canBeUsedToMatch: false,
					defaultValue: '',
				},
				{
					id: 'email',
					displayName: 'Email',
					required: false,
					display: true,
					type: 'string',
					defaultMatch: false,
					canBeUsedToMatch: false,
					defaultValue: '',
				},
				{
					id: 'billTo',
					displayName: 'Bill To',
					required: false,
					display: true,
					type: 'string',
					defaultMatch: false,
					canBeUsedToMatch: false,
					defaultValue: '',
				},
				{
					id: 'shipTo',
					displayName: 'Ship To',
					required: false,
					display: true,
					type: 'string',
					defaultMatch: false,
					canBeUsedToMatch: false,
					defaultValue: '',
				},
			],
		};
	}
}
