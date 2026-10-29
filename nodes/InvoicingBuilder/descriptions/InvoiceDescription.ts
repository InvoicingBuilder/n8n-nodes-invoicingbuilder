import type { INodeProperties } from 'n8n-workflow';

export const invoiceOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['invoice'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create an invoice (PDF or PNG) from a Google Sheet or direct data',
				action: 'Create an invoice',
			},
			{
				name: 'Download',
				value: 'download',
				description: 'Download a past invoice as a PDF or PNG file',
				action: 'Download an invoice',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get details of an invoice by ID',
				action: 'Get an invoice',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a past invoice by ID',
				action: 'Delete an invoice',
			},
		],
		default: 'create',
	},
];

export const invoiceFields: INodeProperties[] = [
	// ----------------------------------
	// Common Template & Format Selection
	// ----------------------------------
	{
		displayName: 'Template Name or ID',
		name: 'templateId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a template...',
				typeOptions: {
					searchListMethod: 'searchTemplates',
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
				resource: ['invoice'],
				operation: ['create'],
			},
		},
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},
	// ----------------------------------
	// Data Source Selection
	// ----------------------------------
	{
		displayName: 'Data Source',
		name: 'source',
		type: 'options',
		options: [
			{
				name: 'Google Sheet',
				value: 'googleSheets',
				description: 'Load invoice data from a Google Spreadsheet',
			},
			{
				name: 'Direct Input / Workflow Data',
				value: 'direct',
				description: 'Specify invoice fields directly or map from incoming workflow items',
			},
		],
		default: 'googleSheets',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
			},
		},
		description: 'Where to load invoice data from',
	},

	// ----------------------------------
	// Google Sheets Connection & Data Retrieval
	// ----------------------------------
	{
		displayName: 'Google Spreadsheet',
		name: 'spreadsheet',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://docs.google.com/spreadsheets/d/... or Spreadsheet ID',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
				source: ['googleSheets'],
			},
		},
		description: 'Enter the Google Spreadsheet URL or Spreadsheet ID',
	},
	{
		displayName: 'Worksheet / Sheet Name',
		name: 'worksheet',
		type: 'string',
		required: true,
		default: 'Sheet1',
		placeholder: 'Sheet1',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
				source: ['googleSheets'],
			},
		},
		description: 'The name or ID of the worksheet/tab in the Google Spreadsheet',
	},

	// ----------------------------------
	// Direct Input Fields
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
				resource: ['invoice'],
				operation: ['create'],
				source: ['direct'],
			},
		},
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},
	{
		displayName: 'Invoice Number',
		name: 'invoiceNumber',
		type: 'string',
		default: '',
		placeholder: 'e.g. INV-1001',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
				source: ['direct'],
			},
		},
		description: 'Custom invoice number. If empty, the template default is preserved.',
	},
	{
		displayName: 'PO Number',
		name: 'poNumber',
		type: 'string',
		default: '',
		placeholder: 'e.g. PO-98765',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
				source: ['direct'],
			},
		},
		description: 'Purchase Order number',
	},
	{
		displayName: 'Invoice Date',
		name: 'issueDate',
		type: 'dateTime',
		default: '',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
				source: ['direct'],
			},
		},
		description: 'Issue date in UTC (YYYY-MM-DD)',
	},
	{
		displayName: 'Due Date',
		name: 'dueDate',
		type: 'dateTime',
		default: '',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
				source: ['direct'],
			},
		},
		description: 'Payment due date in UTC (YYYY-MM-DD)',
	},
	{
		displayName: 'Line Items',
		name: 'lineItems',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		placeholder: 'Add Line Item',
		default: {},
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
				source: ['direct'],
			},
		},
		options: [
			{
				name: 'item',
				displayName: 'Item',
				values: [
					{
						displayName: 'Amount',
						name: 'amount',
						type: 'string',
						default: '',
						placeholder: 'Leave blank to auto-calculate (Qty * Rate)',
						description: 'Total item amount. If omitted, calculated as Quantity * Rate.',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						required: true,
						placeholder: 'e.g. Web Development Services',
						description: 'Description of the service or product',
					},
					{
						displayName: 'Quantity',
						name: 'quantity',
						type: 'number',
						default: 1,
						description: 'Quantity of items',
					},
					{
						displayName: 'Rate / Price',
						name: 'rate',
						type: 'number',
						default: 0,
						description: 'Price or rate per unit',
					},
					{
						displayName: 'Tax (%)',
						name: 'tax',
						type: 'string',
						default: '',
						placeholder: 'e.g. 10 or 10%',
						description: 'Optional tax percentage applied to this line item',
					},
				],
			},
		],
		description: 'Line items to include in the invoice table',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
				source: ['direct'],
			},
		},
		options: [
			{
				displayName: 'Amount Paid',
				name: 'amountPaid',
				type: 'string',
				default: '',
				description: 'Amount already paid towards this invoice',
			},
			{
				displayName: 'Custom Fields (JSON)',
				name: 'customFieldsJson',
				type: 'json',
				default: '',
				description: 'Raw JSON object of field mappings or component values for advanced template customization',
			},
			{
				displayName: 'Logo (URL or Base64)',
				name: 'logo',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/logo.png or data:image/png;base64,...',
				description: 'Logo image URL or Base64 data URI to override the template logo',
			},
			{
				displayName: 'Notes',
				name: 'notes',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				placeholder: 'e.g. Thank you for your business!',
				description: 'Custom notes displayed on the invoice',
			},
			{
				displayName: 'Payment Terms',
				name: 'paymentTerms',
				type: 'string',
				default: '',
				placeholder: 'e.g. Net 30',
				description: 'Payment terms label or description',
			},
			{
				displayName: 'Signature (URL or Base64)',
				name: 'signature',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/signature.png or data:image/png;base64,...',
				description: 'Signature image URL or Base64 data URI to override the template signature',
			},
			{
				displayName: 'Terms & Conditions',
				name: 'terms',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				description: 'Terms and legal conditions',
			},
		],
	},
	{
		displayName: 'Format',
		name: 'format',
		type: 'options',
		options: [
			{
				name: 'PDF',
				value: 'pdf',
				description: 'Portable Document Format',
			},
			{
				name: 'PNG',
				value: 'png',
				description: 'Portable Network Graphics image',
			},
		],
		default: 'pdf',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
			},
		},
		description: 'Output document format',
	},
	{
		displayName: 'Send to Client',
		name: 'sendToClient',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
			},
		},
		description: 'Whether to email the generated invoice to the client email',
	},

	// ----------------------------------
	// Invoice Selection (get, download)
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
					searchListMethod: 'searchInvoices',
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
				resource: ['invoice'],
				operation: ['get', 'download', 'delete'],
			},
		},
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},

	// ----------------------------------
	// Invoice Download Options
	// ----------------------------------
	{
		displayName: 'Download Format',
		name: 'downloadFormat',
		type: 'options',
		options: [
			{
				name: 'PDF',
				value: 'pdf',
				description: 'Portable Document Format (.pdf)',
			},
			{
				name: 'PNG',
				value: 'png',
				description: 'Portable Network Graphics image (.png)',
			},
		],
		default: 'pdf',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['download'],
			},
		},
		description: 'The file format of the downloaded invoice',
	},
];
