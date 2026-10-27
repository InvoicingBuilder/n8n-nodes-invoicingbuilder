# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-10-27

### Added
- Initial release of `n8n-nodes-invoicingbuilder`.
- `InvoicingBuilder` programmatic node with `Invoice` resource and 3 operations:
  - `Create`: Generate single (PDF/PNG) or dual (ZIP) invoices with row grouping and line item mapping.
  - `Generate Report`: Summary metrics per currency with date and status filters.
  - `Analyse Trends`: Historical periodic trend series with percentage and absolute changes.
- `InvoicingBuilderApi` credential with `baseUrl` and `apiKey` fields, and `valid: true` test rule.
- Pure functions `groupRows` and `buildInvoiceFields`.
- Full unit test and mock HTTP test suites.
