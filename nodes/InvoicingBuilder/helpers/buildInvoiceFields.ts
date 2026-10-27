import type { IDataObject } from 'n8n-workflow';

export interface HeaderFieldMapping {
	fieldId: string;
	column: string;
}

export interface LineItemColumnConfig {
	description?: string;
	quantity?: string;
	rate?: string;
	tax?: string;
}

export interface BuildInvoiceFieldsOptions {
	rowGroup: {
		rows: IDataObject[];
	};
	templateId: string;
	format: 'pdf' | 'png';
	headerMappings: HeaderFieldMapping[];
	lineItemColumns?: LineItemColumnConfig;
	externalIdColumn?: string;
	tableFieldId?: string;
}

export interface BuiltInvoiceItem {
	templateId: string;
	format: 'pdf' | 'png';
	externalId?: string;
	fields: Record<string, unknown>;
}

function isNilOrEmpty(value: unknown): boolean {
	return value === undefined || value === null || String(value).trim() === '';
}

/**
 * Pure function to build the invoice payload from a row group.
 * Pass cell values through as strings exactly as received without reformatting dates or numbers.
 */
export function buildInvoiceFields(options: BuildInvoiceFieldsOptions): BuiltInvoiceItem {
	const {
		rowGroup,
		templateId,
		format,
		headerMappings,
		lineItemColumns,
		externalIdColumn,
		tableFieldId,
	} = options;

	const firstRow = rowGroup.rows[0] || {};
	const fields: Record<string, unknown> = {};

	// 1. Map header fields from the first row of the group
	for (const mapping of headerMappings) {
		if (mapping.fieldId && mapping.column) {
			const cellVal = firstRow[mapping.column];
			fields[mapping.fieldId] = cellVal !== undefined && cellVal !== null ? String(cellVal) : '';
		}
	}

	// 2. Map line items if tableFieldId and lineItemColumns are configured
	if (tableFieldId && lineItemColumns) {
		const tableRows: Array<{
			description: string;
			quantity: string | number;
			rate: string | number;
			tax?: string | number;
		}> = [];

		for (const row of rowGroup.rows) {
			const desc = lineItemColumns.description ? row[lineItemColumns.description] : undefined;
			const rate = lineItemColumns.rate ? row[lineItemColumns.rate] : undefined;
			const qty = lineItemColumns.quantity ? row[lineItemColumns.quantity] : undefined;
			const tax = lineItemColumns.tax ? row[lineItemColumns.tax] : undefined;

			// Rows with an empty description and empty rate are skipped
			if (isNilOrEmpty(desc) && isNilOrEmpty(rate)) {
				continue;
			}

			const lineItem: {
				description: string;
				quantity: string | number;
				rate: string | number;
				tax?: string | number;
			} = {
				description: desc !== undefined && desc !== null ? String(desc) : '',
				quantity: qty !== undefined && qty !== null ? String(qty) : '',
				rate: rate !== undefined && rate !== null ? String(rate) : '',
			};

			if (tax !== undefined && tax !== null && String(tax).trim() !== '') {
				lineItem.tax = String(tax);
			}

			tableRows.push(lineItem);
		}

		if (tableRows.length > 0) {
			fields[tableFieldId] = tableRows;
		}
	}

	// 3. Set externalId from first row of group if specified
	let externalId: string | undefined;
	if (externalIdColumn && firstRow[externalIdColumn] !== undefined && firstRow[externalIdColumn] !== null) {
		const extVal = String(firstRow[externalIdColumn]).trim();
		if (extVal.length > 0) {
			externalId = extVal;
		}
	}

	const invoice: BuiltInvoiceItem = {
		templateId,
		format,
		fields,
	};

	if (externalId) {
		invoice.externalId = externalId;
	}

	return invoice;
}
