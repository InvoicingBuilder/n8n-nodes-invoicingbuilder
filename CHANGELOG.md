# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-10-27

### Added
- Initial release of `n8n-nodes-invoicingbuilder`.
- `InvoicingBuilder` programmatic node with `Invoice` resource and 3 operations:
  - `Create`: Connect directly to Google Sheets, retrieve spreadsheet and worksheet data, select template, clear template defaults, map fields and line items, recalculate totals, and generate single (PDF/PNG) or dual (ZIP) invoices.
  - `Generate Report`: Summary metrics per currency with date and status filters, and optional `sendToUser` background email delivery.
  - `Analyse Trends`: Historical periodic trend series with percentage and absolute changes, and optional `sendToUser` background email delivery.
- `InvoicingBuilderApi` credential with `baseUrl` and `apiKey` fields, and `valid: true` test rule.
- Helper functions: `fetchGoogleSheetData`, `parseCsv`, `groupRows`, and `buildInvoiceFields` with explicit template value clearing.
- Full unit test and mock HTTP test suites.
