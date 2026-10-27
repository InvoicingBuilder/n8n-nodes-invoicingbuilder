import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class InvoicingBuilderApi implements ICredentialType {
	name = 'invoicingBuilderApi';

	displayName = 'Invoicing Builder API';

	// Link to your community node's README
	documentationUrl = 'https://github.com/org/-invoicing-builder?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://recliner-specked-ebony.ngrok-free.dev',
			url: '/v1/user',
		},
	};
}
