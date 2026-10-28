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
		description: 'Whether to email the generated invoice to the client email specified in the Google Sheet',
	},
];
