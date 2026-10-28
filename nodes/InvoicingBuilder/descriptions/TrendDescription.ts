import type { INodeProperties } from 'n8n-workflow';

export const trendFields: INodeProperties[] = [
	{
		displayName: 'Period',
		name: 'period',
		type: 'options',
		options: [
			{
				name: 'Monthly',
				value: 'monthly',
			},
			{
				name: 'Quarterly',
				value: 'quarterly',
			},
			{
				name: 'Yearly',
				value: 'yearly',
			},
		],
		default: 'monthly',
		required: true,
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['analyseTrends'],
			},
		},
		description: 'Trend grouping frequency. The final period in the series may be partial (isPartial: true).',
	},
	{
		displayName: 'Number of Periods',
		name: 'periods',
		type: 'number',
		typeOptions: {
			minValue: 2,
			maxValue: 36,
		},
		default: 12,
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['analyseTrends'],
			},
		},
		description:
			'Number of historical periods to include (2-36). Defaults: 12 (monthly), 8 (quarterly), 5 (yearly). Leave empty to use the backend default.',
	},
	{
		displayName: 'End Date',
		name: 'endDate',
		type: 'dateTime',
		default: '',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['analyseTrends'],
			},
		},
		description:
			'Anchor end date in UTC (YYYY-MM-DD). Series ends with the period containing it. Note that the final period may be partial (isPartial: true).',
	},
	{
		displayName: 'Date Basis',
		name: 'dateBasis',
		type: 'options',
		options: [
			{
				name: 'Issue Date',
				value: 'issueDate',
			},
			{
				name: 'Created At',
				value: 'createdAt',
			},
		],
		default: 'issueDate',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['analyseTrends'],
			},
		},
		description: 'Date field to evaluate for trends',
	},
	{
		displayName: 'Currency',
		name: 'currency',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['analyseTrends'],
			},
		},
		description: 'Optional ISO currency code filter (e.g. USD, EUR)',
	},
	{
		displayName: 'Send to User',
		name: 'sendToUser',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: ['invoice'],
				operation: ['analyseTrends'],
			},
		},
		description: 'Whether to email the trend analysis report to the current user (associated with the API key)',
	},
];
