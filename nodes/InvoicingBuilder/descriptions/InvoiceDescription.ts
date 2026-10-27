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
				description: 'Create an invoice (PDF or PNG) from a Google Sheet',
				action: 'Create an invoice',
			},
			{
				name: 'Generate Report',
				value: 'generateReport',
				description: 'Get aggregate invoice metrics and monthly breakdown',
				action: 'Generate a summary report',
			},
			{
				name: 'Analyse Trends',
				value: 'analyseTrends',
				description: 'Get historical trend series with period-over-period percentage changes',
				action: 'Analyse trends',
			},
		],
		default: 'create',
	},
];

export const invoiceFields: INodeProperties[] = [
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
			},
		},
		description: 'The name or ID of the worksheet/tab in the Google Spreadsheet',
	},
	{
		displayName: 'Google Authentication',
		name: 'googleAuthType',
		type: 'options',
		options: [
			{
				name: 'Public / Anyone with Link',
				value: 'public',
				description: 'Access sheet via public link or web export (no auth required)',
			},
			{
				name: 'Google API Key / Bearer Token',
				value: 'apiKey',
				description: 'Access sheet using Google Cloud API Key or Bearer token',
			},
			{
				name: 'InvoicingBuilder Backend Proxy',
				value: 'backendProxy',
				description: 'Access sheet via InvoicingBuilder backend proxy',
			},
		],
		default: 'public',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
			},
		},
		description: 'Method to authenticate and retrieve data from Google Sheets',
	},
	{
		displayName: 'Google API Key / Bearer Token',
		name: 'googleApiKey',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
				googleAuthType: ['apiKey'],
			},
		},
		description: 'Google Cloud API key or OAuth Bearer token to authorize Google Sheets API requests',
	},

	// ----------------------------------
	// Template Selection
	// ----------------------------------
	{
		displayName: 'Template Name or ID',
		name: 'templateId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getTemplates',
		},
		required: true,
		default: '',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
			},
		},
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
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

	// ----------------------------------
	// Row Grouping & Column Mapping
	// ----------------------------------
	{
		displayName: 'Group Rows By Column',
		name: 'groupBy',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
			},
		},
		description:
			'Spreadsheet column to group rows into separate invoices (e.g. OrderNumber or InvoiceID). Rows sharing the same value become one invoice. If empty, all rows become line items in a single invoice.',
	},
	{
		displayName: 'Header Field Mappings',
		name: 'headerFieldMappings',
		placeholder: 'Add Field Mapping',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
			},
		},
		default: {},
		description:
			'Map template header fields (customer name, email, dates, etc.) to Google Sheets column names. Any unmapped or missing fields will be cleared in the generated invoice.',
		options: [
			{
				name: 'mappings',
				displayName: 'Mapping',
				values: [
					{
						displayName: 'Field Name or ID',
						name: 'fieldId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getTemplateFields',
							loadOptionsDependsOn: ['templateId'],
						},
						default: '',
						description:
							'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					},
					{
						displayName: 'Column',
						name: 'column',
						type: 'string',
						default: '',
						description: 'Name of the column in the Google Sheet',
					},
				],
			},
		],
	},
	{
		displayName: 'Line Item Columns',
		name: 'lineItemColumns',
		placeholder: 'Add Column Mapping',
		type: 'collection',
		default: {},
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
			},
		},
		description:
			'Map Google Sheets columns to line item table fields. These line items completely replace any default items in the template.',
		options: [
			{
				displayName: 'Description Column',
				name: 'description',
				type: 'string',
				default: '',
				description: 'Spreadsheet column containing the item description',
			},
			{
				displayName: 'Quantity Column',
				name: 'quantity',
				type: 'string',
				default: '',
				description: 'Spreadsheet column containing the item quantity',
			},
			{
				displayName: 'Rate Column',
				name: 'rate',
				type: 'string',
				default: '',
				description: 'Spreadsheet column containing the unit price or rate',
			},
			{
				displayName: 'Tax % Column',
				name: 'tax',
				type: 'string',
				default: '',
				description: 'Spreadsheet column containing the tax percentage',
			},
		],
	},
	{
		displayName: 'External ID Column',
		name: 'externalIdColumn',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
			},
		},
		description:
			'Spreadsheet column name to use as an idempotency key (from the first row of each group) so retries do not duplicate',
	},

	// ----------------------------------
	// Document Output Options
	// ----------------------------------
	{
		displayName: 'Save To Invoice History',
		name: 'saveToHistory',
		type: 'boolean',
		default: true,
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
			},
		},
		description: 'Whether to save the generated invoice(s) to InvoicingBuilder invoice history',
	},
	{
		displayName: 'Binary Property',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['create'],
			},
		},
		description: 'Name of the binary property to store the rendered document in',
	},
];
