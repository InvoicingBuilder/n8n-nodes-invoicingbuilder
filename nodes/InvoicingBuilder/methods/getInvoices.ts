import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { apiRequest } from '../helpers/request';

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
}

/**
 * Loads recent invoices from GET /api/v1/n8n/invoices to populate invoice dropdowns.
 */
export async function getInvoices(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const returnData: INodePropertyOptions[] = [];

	try {
		const response = (await apiRequest.call(
			this,
			'GET',
			'/api/v1/n8n/invoices',
			undefined,
			{ page: 1, limit: 50 },
		)) as InvoicesListResponse;

		const items = Array.isArray(response?.items) ? response.items : [];
		for (const item of items) {
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

			returnData.push({
				name: label,
				value: item.id,
				description: descParts.length > 0 ? descParts.join(' | ') : undefined,
			});
		}
	} catch {
		// If request fails (e.g. during offline configuration), return empty list
	}

	return returnData;
}
