# Smart Inventory Management System with Seasonal Demand Forecasting

A working Next.js application for Indian retail stores. The interface is branded **Stockwise**. PostgreSQL is the source of truth for products, inventory, orders, sales, alerts, reports, and demand forecasts. There are no mock runtime APIs or hardcoded dashboard/forecast results.

## Run locally

Requires **Node.js 22.14+**, npm, and PostgreSQL 16+ (or the bundled portable development option below).

```sh
npm install
```

Copy `.env.example` to `.env`, then choose one database option:

```sh
# Option A: Docker PostgreSQL (Docker must be installed)
docker compose up -d

# Option B: Portable development PostgreSQL; keep this terminal open
npm run db:local
```

The portable option binds to `127.0.0.1:5432`, persists its data in `.local/postgres`, and creates `smart_inventory`. Do not start both options on the same port. For an existing PostgreSQL server, create a database and role and update `DATABASE_URL` instead.

In another terminal:

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://127.0.0.1:3000**. Set `APP_URL` to the exact origin used by the browser. A mismatch between `localhost` and `127.0.0.1` intentionally causes cross-origin mutation rejection. This workspace's `.env` is configured for `127.0.0.1`.

Production build:

```sh
npm run build
npm start
```

Prisma client generation is a separate setup step because Windows cannot replace its engine DLL while a running application is using it. Development and production builds use separate `.next` and `.next-production` directories. On a server, use HTTPS, change development database credentials, set the production `DATABASE_URL` and `APP_URL`, run migrations, and provision real users. Do not seed public production databases with demo credentials.

## Demo accounts

| Role | Email | Development password |
|---|---|---|
| Admin | admin@inventory.local | Inventory@123 |
| Manager | manager@inventory.local | Inventory@123 |
| Staff | staff@inventory.local | Inventory@123 |
| Staff | staff2@inventory.local | Inventory@123 |

Set `DEMO_PASSWORD` before the first seed to choose a different demo password (minimum 10 characters). Only bcrypt hashes are stored. Demo supplier/customer contact information is fictional. The seed is atomic, skips an already completed seed, and refuses to overwrite an unrelated nonempty database.

## Features and pages

| Route | Function |
|---|---|
| `/login` | Email/password authentication, remember-me, validation, password visibility |
| `/dashboard` | Eight calculated KPIs, revenue ranges, category inventory, bestsellers, low stock, recent orders, forecasts |
| `/products` | Search, category/status filters, sorting, pagination, create/edit/archive, categories |
| `/products/[id]` | Product details, monthly sales, historical charts, demand forecasts |
| `/inventory` | Current/reserved/available stock, valuation, stock in/out and signed adjustments |
| `/inventory/movements` | Searchable, filtered stock ledger with prior/new balances and users |
| `/orders` | Customer orders, search and status filtering |
| `/orders/new` | Customer/address, line items, discounts, GST, payment and fulfilment |
| `/orders/[id]` | Printable invoice, pending-order editing, status changes, cancellation |
| `/billing` | Staff checkout with product search, quantities, discounts, GST, cash/change and automatic stock deduction |
| `/billing/history` | Search completed invoices by number/customer/phone, filter by date, view and print |
| `/billing/[id]` | Immutable invoice with saved product, customer and store details |
| `/sales` | Daily/monthly revenue, units, average order value, category sales, fast/slow sellers, ledger |
| `/forecasting` | Upcoming season/festival stock plans from prior-year event sales, plus 7/30/90-day product demand forecasts |
| `/alerts` | Stock warnings and predictive shortages, acknowledge/resolve |
| `/suppliers` and `/suppliers/[id]` | Supplier management, lead times, supplied products and purchase history |
| `/reports` | Nine report types, product/category/supplier/date filters, CSV exports |
| `/users` | Admin-only user creation, editing, roles, disable and password reset |
| `/settings` | Store/address/GST/currency, reorder defaults, safety-stock and forecast preferences |

## Architecture

The application uses Next.js 15 App Router, React 19, strict TypeScript, Tailwind CSS, shadcn-style Radix UI components, Lucide, Recharts, React Hook Form, and Zod. It uses Prisma 6 with PostgreSQL and Decimal money fields.

```text
src/app/                      Pages, protected workspace layout, API route handlers
src/components/               Shared shell, charts, UI primitives and operations forms
src/hooks/                    Abortable data loading
src/lib/                      Authentication, authorization, validation, formatting, errors, Prisma
src/services/resources.ts     Resource CRUD, search, pagination, reports and export
src/services/inventory.ts     Serializable stock changes and alert updates
src/services/orders.ts        Transactional order lifecycle
src/services/billing.ts       Atomic POS checkout, invoice snapshots and bill history
src/services/billing-business.ts Decimal GST, discount allocation and cash-change rules
src/services/business.ts      Pure inventory and GST rules
src/services/analytics.ts     Database aggregation and forecast persistence
src/services/forecasting.ts   Replaceable database-independent forecasting engine
prisma/                       Schema, migrations and deterministic seasonal seed
tests/                        Business-logic tests
scripts/                      Portable PostgreSQL and live integration tests
```

API lists return `{ items, total, page, pageSize }`; details return a record. Requests are validated server-side, and protected operations enforce role permissions independently of UI visibility. Route handlers delegate to services. All quantities are integer units, including counted packets/boxes or whole weight/volume units.

## Database models

`User`, `Session`, `Category`, `Supplier`, `Product`, `Inventory`, `StockMovement`, `Customer`, `Order`, `OrderItem`, `Sale`, `Alert`, `Forecast`, `ForecastPoint`, and `StoreSettings` have foreign keys, unique constraints and useful indexes. Monetary fields use PostgreSQL Decimal columns. Sales and ledger history are preserved on product/supplier archival and order cancellation. The three SQL migrations under `prisma/migrations` create the schema, add stock constraints, and extend the existing order models for Billing without duplicating the sales ledger.

The seed creates **4 users, 10 categories, 8 suppliers, 50 products, 24 customers**, 730 historical days plus the current day, approximately **35,900 daily sale aggregates**, more than **39,500 stock movements**, recent customer orders, computed alerts and forecasts. Historical imported POS aggregates have no customer-order reference; the most recent 61 days include linked customer orders. Every sale has a corresponding stock deduction and replenishment history.

## Authentication and roles

Passwords use bcrypt with cost 12. Sessions use 32 random bytes; only the SHA-256 token hash is stored in the database. Cookies are HttpOnly, SameSite=Lax, and Secure in production. Standard sessions last 12 hours; remember-me sessions last 30 days. Logout, password changes, role changes and disabling users invalidate sessions. The last active administrator cannot be disabled or demoted.

Admins have all permissions. Managers manage operational resources, forecasting and reports; only admins may change store settings or users. Staff view products/inventory, process orders and bills, and receive or issue stock; adjustments, damage and transfers require a manager/admin. All signed-in users can read store settings needed for invoice calculations. Protected page layouts check sessions server-side; resource APIs enforce permissions. Cross-site mutations are rejected. Login attempts are throttled per email in the current server process.

## Billing / POS

Staff, managers and administrators can use `/billing` from the sidebar. Search existing active products by name, SKU or barcode, add them to a bill, edit quantities and line discounts, enter optional customer details, choose the place of supply and payment method, and complete the sale. Cash payments record the amount received and change; other methods record payment without processing an external transfer. The store currency defaults to INR. Prices exclude GST. A blank customer becomes Walk-in Customer.

The server reloads current products, prices, GST rates, stock and store settings inside one serializable transaction. It applies line discounts, allocates an additional bill discount proportionally in paise, calculates CGST/SGST or IGST, creates a paid delivered Order with bill items, deducts inventory through the existing stock service, records one SALE movement and one shared Sale per product, and refreshes existing alerts. Any failure rolls everything back. Reserved units are unavailable for sale. Reusing the same checkout key and payload returns the original invoice without another stock deduction; reuse for different content is rejected.

Bills reuse Order, OrderItem, Customer, Inventory, StockMovement and Sale. No separate invoice ledger duplicates revenue. Invoice numbers start with `INV-` and the Indian business year, followed by a unique random suffix. Completed bills are immutable. Product names, SKU, HSN, units, prices, GST, discounts, customer and store details are saved with the bill, so later catalog/settings edits do not change printed invoices. Links to billed orders open the immutable invoice.

`/billing/history` supports invoice/customer/phone search, inclusive Indian date filters, pagination, viewing and printing. `/billing/[id]` renders the saved invoice and cash details with an A4 print layout. All billing UI labels are available in the nine supported languages. Completed bills immediately appear in Sales and dashboard revenue. Forecasting consumes the same Sale records; its `todaySales` field reports the current day's recorded quantity while the prediction model continues to train on complete days. The day's sales enter normal training automatically after the Indian midnight boundary.

Apply the additive migration with `npm run db:migrate` and regenerate the client with `npm run db:generate`. The local connection uses `127.0.0.1`, matching the embedded PostgreSQL listener. `npm run test:billing` runs isolated checkout, rollback, concurrency, GST, invoice history and downstream-integration checks; it removes only its own fixture records afterward.

## Inventory and order consistency

Inventory mutation and its signed `StockMovement` occur in one serializable transaction. A guarded update prevents lost writes, and available stock cannot become negative or fall below reserved stock. Serialization conflicts retry up to three times. Opening stock, receipts, returns, sales, damage, transfers and adjustments all produce ledger entries.

Pending orders leave stock unchanged. Confirmation, processing or delivery deducts it and creates sales once. Repeated confirmation is idempotent. Cancellation restores deducted inventory once and marks sales void, excluding them from analytics and forecasts. Failed multi-product fulfilment rolls back the complete order transaction. Fulfilled order contents are immutable; pending orders can be edited.

## GST and Indian conventions

Prices are exclusive of GST. Order discounts are distributed proportionally to lines. Each line retains its unit price, GST percentage, taxable amount and total. Intra-state orders split tax into CGST/SGST; inter-state orders use IGST. Decimal arithmetic and component rounding reconcile invoice totals. Store/customer GSTIN, HSN codes, Indian addresses, PINs and phone numbers are supported. GST percentages are editable; example seed rates are configuration examples, not a maintained tax classification service.

Cash, UPI, debit card, credit card and bank transfer are supported, with pending/paid/partially paid/refunded recording. These are bookkeeping statuses; the application does not charge or refund through a payment gateway. Cancelling a paid order marks its recorded status refunded but does not move money.

Amounts default to INR with Indian digit grouping. Changing currency changes display formatting; it does not convert historical amounts.

## Forecast algorithm and seasonality

Forecasting opens with **Season & festival planning**. Pick an upcoming occasion over the next 6 or 12 months to see the products sold during that occasion last year, expected quantities, available and projected stock, reorder quantities, and supplier order-by dates. Search, sort by seasonal lift or expected demand, filter products needing stock, and export the selected event as CSV. **Product trends** retains the individual product charts and forecasts; existing product-specific links still open that view. All planner labels and event names support the nine interface languages.

`event-calendar.ts` defines Tamil Nadu retail seasons and sourced festival dates. Festivals compare the 14 days before the festival plus the festival day in each year, so a shifted Diwali date uses the actual prior Diwali window. Seasons use complete fixed retail windows, including winter across the year boundary. Only windows starting within the chosen horizon are listed; already-started windows are excluded, and an event may end beyond the horizon. Variable festival dates are verified for 2025–2027; later variable dates require calendar maintenance and are omitted until verified. Fixed annual dates have explicitly labeled reference rules. Season dates are planning assumptions, not weather or school-opening forecasts. Both years' source calendars are linked from festival plans.

The event demand engine reads non-voided sales in Indian business dates and excludes the current incomplete day. It starts with last year's daily sales in the matching event window and scales by the upcoming window length. When comparable data exists, it applies the last 28 complete days' sales growth against the matching dates last year, limited to a 0.5–2 multiplier. Otherwise it keeps the previous-year daily rate. Seasonal lift compares prior event daily sales with the preceding 28 days; ranking does not use product names or category guesses. Products with a fully observed zero-sale window are omitted. Products without full prior-window coverage are listed separately as insufficient history. Continuous observation is assumed from product creation or an earlier imported sale; gaps are zero-sale days, so incomplete imports and stockouts can understate demand.

For each event, projected stock at its start equals available stock (on hand minus reservations) less expected sales before the event at the recent daily rate, floored at zero. Recommended reorder is expected event demand plus safety stock less projected stock, rounded upward without floating-point artifacts. Order-by is the planning start minus supplier lead time. Each plan is independent: overlapping seasons and festivals must be reviewed separately, and viewing/exporting a forecast never places orders. Mixed product units are shown per row rather than combined into a unit-total headline.

The pure TypeScript engine consumes actual non-voided sales from PostgreSQL. It aggregates by calendar day and explicitly includes zero-sale days, excludes future/incomplete-day observations, and bounds the history window. After sufficient history it learns normalized monthly seasonal indices and weekday factors, removes seasonality, computes exponentially smoothed demand and a damped recent trend, then reapplies factors to future dates. Predictions are nonnegative. Sparse histories use a moving average and report limited confidence.

Each forecast returns historical and predicted points, empirical prediction bounds, expected/average/peak demand, monthly indices, comparable year-over-year growth, calculated insights and inventory recommendations. Snapshots and forecast points are persisted, throttled to one snapshot per product/period per six hours. Refresh returns a fresh calculation even within that interval. The module can be replaced by a Python service without changing the database UI contract.

The deterministic demonstration generator includes summer cold drinks/fans, monsoon umbrellas/raincoats, winter clothing, school-reopening stationery, festival gifts/decor/clothing, and stable everyday staples. The forecast learns from the saved quantities. Demonstration festival effects remain approximate monthly seed patterns; the event planner compares saved sales around its sourced festival dates. Confidence in the product-trends view represents data coverage and consistency; it is not calibrated accuracy. Sales during stockouts can understate true demand.

## Reorder recommendations

```text
availableStock = currentStock - reservedStock
dailyDemand = forecastDemand / forecastDays
leadTimeDemand = dailyDemand × supplierLeadTimeDays
safetyStock = dailyDemand × safetyStockDays
targetStock = leadTimeDemand + safetyStock
reorderQuantity = max(0, ceil(targetStock - availableStock))
```

The engine shows No action, Reorder soon, Reorder now or Critical, expected shortage/surplus, and estimated stockout. Stock alerts refresh on inventory/threshold changes; forecast reads also detect shortages inside supplier lead time. Forecast alerts are on-demand, not a scheduled background monitor.

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run build

# Requires seeded PostgreSQL and the running app
npm run test:integration
npm run test:billing
```

The Billing update passed lint, typecheck, the production build, **109 unit tests**, and **42 live Billing integration checks** against PostgreSQL. Unit tests cover forecasting, calendar windows, sparse data, trends, zero-sale days, nonnegative output, reorder math, GST, inventory invariants, order transitions, role permissions, Billing discount/tax calculations and matching cart previews. The Billing script verifies the exact 50 → 47 stock flow for a three-unit sale, shared sales and dashboard/forecast updates, cash, mixed GST rates, immutable invoice snapshots, rollback, idempotent retries and concurrent oversell protection.

The original live integration script also passed all **42 checks after the Billing update**. It checks seeded ledger balances, all three login roles, authentication/authorization, CRUD, invalid/duplicate data, stock receipts/adjustments, transactional order deduction, idempotence, cancellations, inter-state tax, concurrent oversell protection, reports, CSV, forecasts, alerts, user disable/session invalidation and page responses. Browser checks verified checkout, the generated invoice, staff history filters, all nine Billing languages and mobile layouts. See `VALIDATION.md` for the recorded run scope. Both integration scripts remove their fixture records afterward; seed records are retained.

## Interface languages

The interface supports English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, and Gujarati. Use the globe selector in the header or on the sign-in page; administrators can also find it in Settings. The preference is saved for one year in this browser and applied during server rendering. English is the default, and unknown messages fall back to their original text.

Navigation, forms, statuses, validation messages, notifications, reports, forecast explanations, and chart labels are translated. Dates and numbers use the selected Indian locale; currency follows the store setting. Changing language preserves unsaved form entries. Product names, customer/supplier details, notes, identifiers, stored enum values, and amounts remain as entered. CSV exports retain their stable English field headers for compatibility.

Catalogs live in `src/lib/i18n/messages`, with **873 messages in each of the nine languages**, including Billing. Use `useI18n()` in client components and pass user data as explicit parameters, for example `t('View {0}', [product.name])`. Add every new message to all nine catalogs. Tests verify key/placeholder parity, data-preserving interpolation, generated forecast text, formatting, and stable dropdown values.

## Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (server only) |
| `APP_URL` | Trusted browser origin, e.g. `http://127.0.0.1:3000` |
| `DEMO_PASSWORD` | Optional password override during first seed |
| `TEST_BASE_URL` | Integration-test server origin override |

`.env` and `.local` are ignored. No database credentials or password hashes are sent to the browser. `.env.example` contains development defaults only.

## Scope and future improvements

This is a single-store application. It does not include multi-store tenancy, purchase-order approval workflows, payment gateways, e-invoicing submission, email/SMS alerts, barcode hardware integrations or fractional quantity accounting. Reserved-stock columns are supported in availability calculations; pending orders do not automatically reserve stock. Existing general-purpose forms use bounded 100-item dropdowns; Billing has a searchable, paginated product picker. General report CSV export is capped at 50,000 rows; the event CSV exports its selected product plan. Several analytics aggregates load the selected window into memory. Add shared/distributed login throttling, managed backups, monitoring, forecast backtesting, ongoing festival calendar maintenance and scheduled alert refresh before a large multi-instance deployment. Regular order invoices still read current seller and product HSN details; immutable snapshots remain a future improvement for those invoices. Billing/POS invoices already retain their product, customer and store snapshots.

No cloud deployment or external PostgreSQL account is configured by this repository. The included runtime and verification are local.

