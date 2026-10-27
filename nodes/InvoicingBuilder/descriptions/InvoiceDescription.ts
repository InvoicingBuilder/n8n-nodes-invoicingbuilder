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
				description: 'Create an invoice (PDF or PNG) from rows of data',
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
			'Rows with the same value in this column become one invoice (header fields from the first row of the group, one table line per row). If empty, each incoming item is its own invoice with one line.',
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
		description: 'Map template header fields to incoming item columns',
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
						description: 'Name of the incoming item property/column (expressions allowed)',
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
			'Map incoming row columns to line item table fields. Rows with an empty description and empty rate are skipped.',
		options: [
			{
				displayName: 'Description Column',
				name: 'description',
				type: 'string',
				default: '',
				description: 'Name of the item property containing the item description',
			},
			{
				displayName: 'Quantity Column',
				name: 'quantity',
				type: 'string',
				default: '',
				description: 'Name of the item property containing the quantity',
			},
			{
				displayName: 'Rate Column',
				name: 'rate',
				type: 'string',
				default: '',
				description: 'Name of the item property containing the unit price or rate',
			},
			{
				displayName: 'Tax % Column',
				name: 'tax',
				type: 'string',
				default: '',
				description: 'Name of the item property containing the tax percentage',
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
			'Value from the first row of each group, sent as externalId so retries do not duplicate',
	},
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
