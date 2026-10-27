import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { userDescription } from './resources/user';
import { companyDescription } from './resources/company';

export class InvoicingBuilder implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Invoicing Builder',
		name: 'invoicingBuilder',
		icon: { light: 'file:invoicingBuilder.svg', dark: 'file:invoicingBuilder.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the Invoicing Builder API',
		defaults: {
			name: 'Invoicing Builder',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'invoicingBuilderApi', required: true }],
		requestDefaults: {
			baseURL: 'https://recliner-specked-ebony.ngrok-free.dev',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'User',
						value: 'user',
					},
					{
						name: 'Company',
						value: 'company',
					},
				],
				default: 'user',
			},
			...userDescription,
			...companyDescription,
		],
	};
}
