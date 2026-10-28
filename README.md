# n8n-nodes-invoicingbuilder

This is an n8n community node for [InvoicingBuilder](https://invoicingbuilder.com). It allows you to generate invoices (PDF/PNG) dynamically from spreadsheet data and run comprehensive invoice summary reports and trends analyses directly inside your n8n workflows.

[n8n](https://n8n.io/) is a fair-code licensed workflow automation platform.

---

## Table of Contents

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
  - [1. Create Invoice](#1-create-invoice)
  - [2. Generate Report](#2-generate-report)
  - [3. Analyse Trends](#3-analyse-trends)
- [The 2-Invoice Limit](#the-2-invoice-limit)
- [Example Workflow](#example-workflow)
- [Development and Testing](#development-and-testing)
- [Compatibility](#compatibility)
- [License](#license)

---

## Installation

### Community Nodes (Recommended)
1. In your n8n instance, go to **Settings > Community Nodes**.
2. Select **Install**.
3. Enter `n8n-nodes-invoicingbuilder` in the **npm package name** field.
4. Agree to the risks of installing community nodes and select **Install**.

### Self-Hosted / Docker
Install the package into your custom n8n directory:
```bash
npm install n8n-nodes-invoicingbuilder
```

---

## Credentials

To authenticate requests to the InvoicingBuilder API, configure an **InvoicingBuilder API** credential in n8n.

### Required Fields:
- **API Key**: Your InvoicingBuilder API key (starts with `ib_`). You can generate an API key from your InvoicingBuilder dashboard under Developer Settings.
- **Base URL**: The base URL of the API. Defaults to `https://api.invoicingbuilder.com`. For self-hosted instances or local development, specify your custom base URL (e.g. `http://localhost:3001` or your ngrok tunnel). Trailing slashes are stripped automatically.

When you click **Test step** in n8n, the node verifies your credentials against `GET /api/v1/auth`. If the key is invalid, revoked, or expired, a clear error message is displayed.

---

## Operations

The **InvoicingBuilder** node provides one resource (**Invoice**) and three actions:

### 1. Create Invoice
Generates rendered invoice documents directly from a Google Sheet.

- **Google Spreadsheet**: Provide the Google Spreadsheet URL or Spreadsheet ID.
- **Worksheet / Sheet Name**: Name or ID of the worksheet tab (e.g. `Sheet1`).
- **Google Authentication**: Choose authentication method (`Public / Anyone with Link`, `Google API Key / Bearer Token`, or `InvoicingBuilder Backend Proxy`).
- **Template**: Choose a template from your InvoicingBuilder account (automatically paged from `GET /api/v1/templates`).
- **Format**: `PDF` (default) or `PNG`.
- **Group Rows By Column**: Optional spreadsheet column name (e.g. `InvoiceID` or `OrderNumber`). Rows sharing the same value are grouped into a single invoice. Header fields are taken from the first row of each group, and each row becomes a line item in the invoice table. If empty, all rows become line items in a single invoice.
- **Header Field Mappings**: Map template header fields (customer name, email, date, invoice number, etc.) to spreadsheet column names. **Template defaults are cleared before populating**, ensuring stale customer or company data is never retained.
- **Line Item Columns**: Map columns for `Description`, `Quantity`, `Rate`, and `Tax %`. The spreadsheet line items completely replace any default items in the template. Rows where both description and rate are empty are automatically skipped.
- **External ID Column**: Optional column containing an idempotency key (from the first row of the group) so retries do not create duplicate invoices.
- **Save To Invoice History**: Toggle whether generated invoices should be saved to your InvoicingBuilder invoice history (defaults to `true`).
- **Binary Property**: The name of the binary property in which the document is returned (defaults to `data`).

#### Output
- **1 Invoice**: Returns a single PDF or PNG named `invoice.pdf` or `invoice.png`.
- **2 Invoices**: Returns a zip archive named `invoices.zip` containing both generated invoices.
- **Metadata**: JSON output includes `success: true`, `invoiceCount`, `format`, `fileName`, `spreadsheetId`, `worksheet`, and `invoiceIds` (when saved to history).

### 2. Generate Report
Fetches aggregate invoice metrics and zero-filled monthly breakdowns grouped by currency.

- **Date Basis**: `Issue Date` (default) or `Created At`.
- **From / To**: Optional UTC date range (`YYYY-MM-DD`). The node validates that `From <= To`.
- **Status**: Filter by invoice status (`All`, `Paid`, `Unpaid`, `Overdue`).
- **Send to User**: Optional boolean (default: `false`). When enabled, automatically emails the summary report to the current authenticated user in the background without blocking node execution.

#### Output
Returns the complete summary report JSON unchanged with separate breakdowns for each currency (currencies are never summed together).

### 3. Analyse Trends
Fetches historical trend series with period-over-period percentage changes grouped by currency.

- **Period**: `Monthly`, `Quarterly`, or `Yearly`.
- **Number of Periods**: Number of historical periods (2–36). Defaults to 12 for monthly, 8 for quarterly, and 5 for yearly.
- **End Date**: Optional anchor end date (`YYYY-MM-DD`). The series ends with the period containing this date. Note that the final period may be partial (`isPartial: true`).
- **Date Basis**: `Issue Date` (default) or `Created At`.
- **Currency**: Optional ISO currency code filter.
- **Send to User**: Optional boolean (default: `false`). When enabled, automatically emails the trend analysis report to the current authenticated user in the background without blocking node execution.

#### Output
Returns the trend series JSON unchanged including absolute and percentage period-over-period deltas.

---

## The 2-Invoice Limit

The InvoicingBuilder API enforces a strict safety limit of **maximum 2 invoices per request**.

If an execution receives rows that resolve to more than 2 invoices, the node halts execution before making any API requests with the message:
```
Found N invoices; the limit is 2 per execution. Split the rows (e.g. with Loop Over Items or Limit) and try again.
```

---

## Example Workflow

### Google Sheets to InvoicingBuilder to Email

```text
[InvoicingBuilder Node]
   Resource: Invoice
   Operation: Create
   Google Spreadsheet: https://docs.google.com/spreadsheets/d/.../edit
   Worksheet: Orders
   Template: Standard Tax Invoice
   Group Rows By Column: OrderId
   Line Items: Description -> ItemTitle, Qty -> Quantity, Rate -> Price
         │
         ▼
[Send Email / Gmail Node]
   To: ={{ $json.customerEmail }}
   Subject: =Your Invoice for Order #{{ $json.orderId }}
   Attachments: Binary Property 'data'
```

1. **InvoicingBuilder**: Connects directly to Google Sheets, retrieves sheet headers and rows, clears template defaults, populates spreadsheet values, recalculates totals, generates the invoice PDF, and writes it to the `data` binary property.
2. **Gmail / Send Email**: Attaches the binary file directly to an outgoing confirmation email.

---

## Error Handling

- **401 Unauthorized**: Mapped to `Invalid, revoked or expired API key`.
- **429 Rate Limit**: Mapped to `Rate limit exceeded; retry in N seconds` (reading the server's `retryAfter` response) so n8n's **Retry On Fail** handles backoff automatically.
- **400 / 404**: Cleanly extracts validation messages from the backend response.
- **Continue on Fail**: Fully supported via n8n's node error settings. Emits `{ error: message }` to allow workflows to proceed.

---

## Development and Testing

### Build
```bash
npm run build
```

### Lint
```bash
npm run lint
```

### Run Tests
```bash
npm test
```

Unit tests cover:
- Pure row grouping (`groupRows`): grouped, ungrouped, mixed-case keys, empty keys, and arrival order preservation.
- Pure invoice mapping (`buildInvoiceFields`): header mapping, line items, skipping empty lines, string passthrough.
- 2-invoice pre-execution safety limit (0 throws, 1 ok, 2 ok, 3 throws before HTTP).
- Base URL normalizer and error formatting.
- Mock-HTTP test suites for all 3 operations (success, 401, 429, 400).

---

## License

[MIT](LICENSE)
