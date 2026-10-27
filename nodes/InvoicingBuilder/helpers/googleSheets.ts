import {
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestOptions,
	NodeOperationError,
} from 'n8n-workflow';
import { apiRequest } from './request';

export interface GoogleSheetDataResult {
	headers: string[];
	rows: IDataObject[];
	spreadsheetId: string;
	worksheet: string;
}

/**
 * Pure CSV parser supporting standard quotes, commas, and newlines without external dependencies.
 */
export function parseCsv(csvText: string): { headers: string[]; rows: IDataObject[] } {
	const lines: string[][] = [];
	let currentRow: string[] = [];
	let currentField = '';
	let inQuotes = false;

	const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		const nextChar = text[i + 1];

		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				currentField += '"';
				i++; // skip escaped quote
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === ',' && !inQuotes) {
			currentRow.push(currentField);
			currentField = '';
		} else if (char === '\n' && !inQuotes) {
			currentRow.push(currentField);
			currentField = '';
			if (currentRow.some((f) => f.trim() !== '')) {
				lines.push(currentRow);
			}
			currentRow = [];
		} else {
			currentField += char;
		}
	}

	if (currentField !== '' || currentRow.length > 0) {
		currentRow.push(currentField);
		if (currentRow.some((f) => f.trim() !== '')) {
			lines.push(currentRow);
		}
	}

	if (lines.length === 0) {
		return { headers: [], rows: [] };
	}

	const rawHeaders = lines[0];
	const headers = rawHeaders.map((h) => h.trim());

	const rows: IDataObject[] = [];
	for (let r = 1; r < lines.length; r++) {
		const rowArr = lines[r];
		if (rowArr.every((c) => c.trim() === '')) {
			continue;
		}
		const rowObj: IDataObject = {};
		for (let c = 0; c < headers.length; c++) {
			const headerName = headers[c];
			if (headerName) {
				rowObj[headerName] = rowArr[c] !== undefined ? rowArr[c].trim() : '';
			}
		}
		rows.push(rowObj);
	}

	return { headers, rows };
}

/**
 * Extracts the spreadsheet ID from a full Google Sheets URL or raw ID.
 */
export function extractSpreadsheetId(spreadsheetInput: string): string {
	if (!spreadsheetInput || typeof spreadsheetInput !== 'string') {
		return '';
	}
	const trimmed = spreadsheetInput.trim();
	const match = trimmed.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
	if (match && match[1]) {
		return match[1];
	}
	return trimmed;
}

/**
 * Connects to Google Sheets and retrieves column headers and row values.
 */
export async function fetchGoogleSheetData(
	this: IExecuteFunctions,
	options: {
		spreadsheet: string;
		worksheet?: string;
		googleAuthType?: string;
		googleApiKey?: string;
	},
): Promise<GoogleSheetDataResult> {
	const { spreadsheet, worksheet = 'Sheet1', googleAuthType = 'public', googleApiKey } = options;

	const spreadsheetId = extractSpreadsheetId(spreadsheet);
	if (!spreadsheetId) {
		throw new NodeOperationError(
			this.getNode(),
			'Please provide a valid Google Spreadsheet URL or Spreadsheet ID.',
		);
	}

	const sheetName = worksheet.trim() || 'Sheet1';

	// 1. Google Sheets API via Key or Bearer Token
	if (googleAuthType === 'apiKey' && googleApiKey && googleApiKey.trim()) {
		const token = googleApiKey.trim();
		const isBearer = token.startsWith('ya29.') || token.length > 50;
		const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

		const requestOptions: IHttpRequestOptions = {
			method: 'GET',
			url,
			headers: isBearer ? { Authorization: `Bearer ${token}` } : {},
			qs: isBearer ? {} : { key: token },
			json: true,
		};

		try {
			const response = (await this.helpers.httpRequest(requestOptions)) as {
				values?: Array<string[]>;
			};

			const values = response?.values || [];
			if (values.length === 0) {
				throw new NodeOperationError(
					this.getNode(),
					`The worksheet "${sheetName}" in spreadsheet "${spreadsheetId}" is empty.`,
				);
			}

			const rawHeaders = values[0] || [];
			const headers = rawHeaders.map((h) => String(h || '').trim());
			const rows: IDataObject[] = [];

			for (let r = 1; r < values.length; r++) {
				const rowArr = values[r] || [];
				if (rowArr.every((c) => !c || String(c).trim() === '')) {
					continue;
				}
				const rowObj: IDataObject = {};
				for (let c = 0; c < headers.length; c++) {
					const headerName = headers[c];
					if (headerName) {
						rowObj[headerName] = rowArr[c] !== undefined ? String(rowArr[c]).trim() : '';
					}
				}
				rows.push(rowObj);
			}

			if (rows.length === 0) {
				throw new NodeOperationError(
					this.getNode(),
					`Spreadsheet "${sheetName}" contains column headers but no data rows.`,
				);
			}

			return { headers, rows, spreadsheetId, worksheet: sheetName };
		} catch (error) {
			if (error instanceof NodeOperationError) {
				throw new NodeOperationError(this.getNode(), error);
			}
			throw new NodeOperationError(
				this.getNode(),
				`Failed to fetch Google Sheet via API: ${(error as Error).message}`,
			);
		}
	}

	// 2. InvoicingBuilder Backend Proxy
	if (googleAuthType === 'backendProxy') {
		const targetUrl = spreadsheet.includes('docs.google.com')
			? spreadsheet
			: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

		try {
			const proxyResponse = (await apiRequest.call(
				this,
				'POST',
				'/api/v1/n8n/invoices/google-sheets/export',
				{ url: targetUrl },
			)) as { success: boolean; data?: string; message?: string };

			if (!proxyResponse.success || !proxyResponse.data) {
				throw new NodeOperationError(
					this.getNode(),
					proxyResponse.message || 'Failed to export Google Sheet via backend proxy.',
				);
			}

			const { headers, rows } = parseCsv(proxyResponse.data);
			if (rows.length === 0) {
				throw new NodeOperationError(
					this.getNode(),
					`Spreadsheet "${sheetName}" contains no data rows.`,
				);
			}

			return { headers, rows, spreadsheetId, worksheet: sheetName };
		} catch (error) {
			if (error instanceof NodeOperationError) {
				throw new NodeOperationError(this.getNode(), error);
			}
			throw new NodeOperationError(
				this.getNode(),
				`Backend Google Sheets proxy error: ${(error as Error).message}`,
			);
		}
	}

	// 3. Public or Shareable Google Sheets Export (default)
	const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

	try {
		const responseText = (await this.helpers.httpRequest({
			method: 'GET',
			url: gvizUrl,
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) n8n-InvoicingBuilder',
			},
		})) as string;

		const lower = String(responseText || '').trim().toLowerCase();
		if (
			lower.startsWith('<!doctype html') ||
			lower.startsWith('<html') ||
			lower.includes('accounts.google.com')
		) {
			throw new NodeOperationError(
				this.getNode(),
				"This Google Sheet is not publicly accessible. Please set sharing to 'Anyone with the link can view' or use Google API Key / Authentication.",
			);
		}

		const { headers, rows } = parseCsv(responseText);
		if (headers.length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				`Failed to retrieve column headers from sheet "${sheetName}". Please verify sheet name.`,
			);
		}

		if (rows.length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				`The worksheet "${sheetName}" contains column headers but no data rows.`,
			);
		}

		return { headers, rows, spreadsheetId, worksheet: sheetName };
	} catch (error) {
		if (error instanceof NodeOperationError) {
			throw new NodeOperationError(this.getNode(), error);
		}
		throw new NodeOperationError(
			this.getNode(),
			`Failed to retrieve Google Sheet data: ${(error as Error).message}`,
		);
	}
}
