import type { INodeProperties } from 'n8n-workflow';

export const clientOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['client'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a new client',
				action: 'Create a client',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a client',
				action: 'Delete a client',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get client details by ID',
				action: 'Get a client',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many clients for the account',
				action: 'Get many clients',
			},
			{
				name: 'Send Reminder',
				value: 'sendReminder',
				description: 'Send a payment reminder email to a client',
				action: 'Send reminder to a client',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update an existing client',
				action: 'Update a client',
			},
		],
		default: 'create',
	},
];

export const clientFields: INodeProperties[] = [
	// ----------------------------------
	// Client Selection (get, delete, sendReminder, update)
	// ----------------------------------
	{
		displayName: 'Client Name or ID',
		name: 'clientId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a client...',
				typeOptions: {
					searchListMethod: 'searchClients',
					searchable: true,
				},
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 6ba7b810-9dad-11d1-80b4-00c04fd430c8',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: '[a-zA-Z0-9_-]+',
							errorMessage: 'Not a valid ID',
						},
					},
				],
			},
		],
		displayOptions: {
			show: {
				resource: ['client'],
				operation: ['get', 'delete', 'sendReminder', 'update'],
			},
		},
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},

	// ----------------------------------
	// Create Operation Fields
	// ----------------------------------
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Acme Corporation',
		displayOptions: {
			show: {
				resource: ['client'],
				operation: ['create'],
			},
		},
		description: 'The name of the client or company',
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		default: '',
		placeholder: 'e.g. billing@acme.com',
		displayOptions: {
			show: {
				resource: ['client'],
				operation: ['create'],
			},
		},
		description: 'The primary billing email address for the client',
	},
	{
		displayName: 'Bill To',
		name: 'billTo',
		type: 'string',
		typeOptions: {
			rows: 3,
		},
		default: '',
		placeholder: 'Acme Corporation\n123 Innovation Way\nSan Francisco, CA 94105',
		displayOptions: {
			show: {
				resource: ['client'],
				operation: ['create'],
			},
		},
		description: 'Default billing address and notes for this client',
	},
	{
		displayName: 'Ship To',
		name: 'shipTo',
		type: 'string',
		typeOptions: {
			rows: 3,
		},
		default: '',
		placeholder: 'Acme Warehouse\n789 Industrial Rd\nSan Francisco, CA 94105',
		displayOptions: {
			show: {
				resource: ['client'],
				operation: ['create'],
			},
		},
		description: 'Default shipping address for this client',
	},

	// ----------------------------------
	// Get All Operation Fields
	// ----------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				resource: ['client'],
				operation: ['getAll'],
			},
		},
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: {
			minValue: 1,
		},
		default: 50,
		displayOptions: {
			show: {
				resource: ['client'],
				operation: ['getAll'],
				returnAll: [false],
			},
		},
		description: 'Max number of results to return',
	},

	// ----------------------------------
	// Update Operation Fields
	// ----------------------------------
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'resourceMapper',
		noDataExpression: true,
		default: {
			mappingMode: 'defineBelow',
			value: null,
		},
		required: true,
		typeOptions: {
			loadOptionsDependsOn: ['clientId'],
			resourceMapper: {
				resourceMapperMethod: 'getClientUpdateFields',
				mode: 'add',
				valuesLabel: 'Client Details',
				fieldWords: {
					singular: 'field',
					plural: 'fields',
				},
				addAllFields: true,
				multiKeyMatch: false,
				supportAutoMap: false,
			},
		},
		displayOptions: {
			show: {
				resource: ['client'],
				operation: ['update'],
			},
			hide: {
				clientId: [''],
			},
		},
	},

	// ----------------------------------
	// Send Reminder Operation Fields
	// ----------------------------------
	{
		displayName: 'Invoice Name or ID',
		name: 'invoiceId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select an invoice...',
				typeOptions: {
					searchListMethod: 'searchClientInvoices',
					searchable: true,
				},
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 172823b3-ddf0-42db-9b70-7e0c22ce6db9',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: '[a-zA-Z0-9_-]+',
							errorMessage: 'Not a valid ID',
						},
					},
				],
			},
		],
		typeOptions: {
			loadOptionsDependsOn: ['clientId'],
		},
		displayOptions: {
			show: {
				resource: ['client'],
				operation: ['sendReminder'],
			},
			hide: {
				clientId: [''],
			},
		},
		description:
			'Choose an invoice belonging to the selected client, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},
];
