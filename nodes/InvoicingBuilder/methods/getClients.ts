import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { apiRequest } from '../helpers/request';

interface ClientItem {
	id: string;
	name: string;
	email?: string;
	billTo?: string;
	shipTo?: string;
}

/**
 * Loads all clients from GET /api/v1/clients to populate client dropdowns.
 */
export async function getClients(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const returnData: INodePropertyOptions[] = [];

	const clients = (await apiRequest.call(
		this,
		'GET',
		'/api/v1/clients',
	)) as ClientItem[];

	if (Array.isArray(clients)) {
		for (const client of clients) {
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

			returnData.push({
				name: displayName,
				value: client.id,
				description: details.length > 0 ? details.join(' | ') : undefined,
			});
		}
	}

	return returnData;
}
