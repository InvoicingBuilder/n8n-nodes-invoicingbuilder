# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-10-29

### Added
- Initial release of `n8n-nodes-invoicingbuilder`.
- `InvoicingBuilder` programmatic node with 3 core resources:
  - **Invoice**:
    - `Create`: Support multi-source invoice generation from Google Sheets (auto-detecting columns and grouped line items) or Direct Workflow Data (dynamic parameter mapping, line items, and client linkage).
    - `Get`: Retrieve invoice metadata, calculated totals, and payment status.
    - `Mark as Paid`: Mark an invoice as paid or unpaid.
    - `Download`: Download rendered invoices as binary PDF or PNG files.
    - `Delete`: Remove an invoice and its associated reminders from account history.
  - **Client**:
    - `Create`: Add new client directory records with billing and shipping details.
    - `Update`: Visual resource mapping (`ResourceMapper`) allowing selective field updates without wiping unchanged client data.
    - `Get`: Retrieve specific client details.
    - `Get Many`: List all clients or fetch with pagination limits.
    - `Delete`: Remove a client from account history.
    - `Send Payment Reminder`: Dispatch automated reminder emails to clients for overdue invoices.
  - **Report**:
    - `Summary`: Aggregate revenue metrics and monthly breakdowns per currency with date and status filters.
    - `Analyse Trends`: Historical periodic growth timelines with period-over-period percentage and absolute changes.
    - Optional `sendToUser` parameter for background email dispatch of reports.
- `InvoicingBuilderApi` credentials with `baseUrl` and `apiKey` fields, and `/api/v1/auth` verification testing.
- Dynamic `ResourceLocator` methods with search, lazy loading, and pagination for Templates, Clients, and Invoices.
- Robust error mapping for 400, 401 (safe token handling), 404, and 429 (`retryAfter` backoff extraction) status codes.
- 98 automated unit and mock HTTP integration tests covering helpers, pagination, and execution flows.

