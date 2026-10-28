import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class InvoicingBuilderApi implements ICredentialType {
	name = 'invoicingBuilderApi';

	displayName = 'InvoicingBuilder API';

	documentationUrl = 'https://invoicingbuilder.com/docs';

	icon = {
		light: 'file:../nodes/InvoicingBuilder/invoicingBuilder.svg',
		dark: 'file:../nodes/InvoicingBuilder/invoicingBuilder.dark.svg',
	} as const;

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'InvoicingBuilder API key (starts with ib_)',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			required: true,
			default: 'https://api.invoicingbuilder.com',
			description:
				'The InvoicingBuilder API base URL. Trailing slashes are stripped automatically.',
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
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/v1/auth',
			method: 'GET',
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'valid',
					value: true,
					message: 'Invalid, revoked or expired API key',
				},
			},
		],
	};
}

