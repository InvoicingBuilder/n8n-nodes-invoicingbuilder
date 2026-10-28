import type { INodeProperties } from 'n8n-workflow';

export const reportFields: INodeProperties[] = [
	{
		displayName: 'From',
		name: 'from',
		type: 'dateTime',
		default: '',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['generateReport'],
			},
		},
		description: 'Start date in UTC (YYYY-MM-DD, inclusive)',
	},
	{
		displayName: 'To',
		name: 'to',
		type: 'dateTime',
		default: '',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['generateReport'],
			},
		},
		description: 'End date in UTC (YYYY-MM-DD, inclusive)',
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
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['generateReport'],
			},
		},
		description: 'Invoice status filter',
	},
	{
		displayName: 'Send to User',
		name: 'sendToUser',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['generateReport'],
			},
		},
		description: 'Whether to email the generated report to the current user (associated with the API key)',
	},
];
