import type { INodeProperties } from 'n8n-workflow';

export const reportOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['report'],
			},
		},
		options: [
			{
				name: 'Summary',
				value: 'summary',
				description: 'Get aggregate invoice metrics and monthly breakdown',
				action: 'Generate a summary report',
			},
			{
				name: 'Analyse Trends',
				value: 'trends',
				description: 'Get historical trend series with period-over-period percentage changes',
				action: 'Analyse trends',
			},
		],
		default: 'summary',
	},
];

export const reportFields: INodeProperties[] = [
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: {
			show: {
				resource: ['report', 'invoice'],
				operation: ['summary', 'generateReport'],
			},
		},
		options: [
			{
				displayName: 'From',
				name: 'from',
				type: 'dateTime',
				default: '',
				description: 'Start date in UTC (YYYY-MM-DD, inclusive)',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{
						name: 'All',
						value: 'all',
					},
					{
						name: 'Paid',
						value: 'paid',
					},
					{
						name: 'Unpaid',
						value: 'unpaid',
					},
					{
						name: 'Overdue',
						value: 'overdue',
					},
				],
				default: 'all',
				description: 'Invoice status filter',
			},
			{
				displayName: 'To',
				name: 'to',
				type: 'dateTime',
				default: '',
				description: 'End date in UTC (YYYY-MM-DD, inclusive)',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['report', 'invoice'],
				operation: ['summary', 'generateReport'],
			},
		},
		options: [
			{
				displayName: 'Send to User',
				name: 'sendToUser',
				type: 'boolean',
				default: false,
				description:
					'Whether to email the generated report to the current user (associated with the API key)',
			},
		],
	},
];
