# Validation — 11 September 2026

The Billing/POS update was built and tested against local PostgreSQL. The production Next.js server is served on `http://127.0.0.1:3000`. Current Billing results are recorded below; earlier application and browser results are identified separately.

| Check | Result |
|---|---|
| `npm run lint` | Passed, no errors or warnings |
| `npm run typecheck` | Passed |
| `npm test` | 109 tests passed in 7 files |
| `npm run build` | Passed with all requested routes |
| `npm run db:migrate` | 3 migrations applied successfully, including the additive Billing/POS migration |
| `npm run test:billing` against production | 42 checks passed |
| `npm run test:integration` against production after Billing | 42 checks passed; existing orders, stock, roles, reports and seasonal forecasting remain working |
| Nine language catalogs | 873 messages per language across all nine locales; exact key and interpolation-placeholder parity |
| Browser checkout | Product search, cart quantity 3, ₹315 total, ₹500 cash, ₹185 change, and generated invoice verified; database confirmed stock 50 → 47, one -3 movement and one three-unit Sale |
| Browser invoice/history | Store/customer/HSN/tax/cash details and print controls verified; staff invoice search and same-day date filters returned the saved bill |
| Billing languages/mobile | All nine translated headings rendered while preserving product and quantity; Tamil Billing and English invoice fit a 390px viewport without horizontal page overflow |
| Billing browser console | No captured errors or warnings; English and desktop viewport restored, temporary product and invoice removed by exact IDs |

Billing checks verified staff access and anonymous rejection; a completed three-unit bill reducing stock from 50 to 47; one SALE movement of -3 with matching prior/new balances and invoice reference; one shared Sale containing the three sold units; dashboard revenue, existing Sales and forecasting `todaySales` updates; and automatic low-stock alert creation and refresh. Insufficient stock (2 available, 3 requested), short cash, reserved stock, inactive/missing products, invalid quantities, excessive discounts and a failing multi-item bill left no partial invoice, customer, inventory, movement, sale or alert changes.

The same suite verified that server prices/GST/totals override tampered client values; line and bill discounts reconcile across mixed GST rates; intra-state CGST/SGST and inter-state IGST are calculated correctly; cash/change and all five payment methods work; simultaneous retries create one invoice; conflicting checkout keys are rejected; competing bills cannot oversell one available unit; out-of-stock status and alerts update; name/SKU/barcode product lookup works; saved invoice snapshots survive catalog edits; bill history searches and Indian date filters work; completed bills cannot be cancelled through regular order APIs; all three Billing pages return successful staff responses; and fixture balances reconcile to their movement ledger. This suite checks page responses, not browser interactions or printing. Its fixture records and sessions were removed afterward.

The 31 additional Billing unit tests cover Decimal tax and discount calculations, cash change, invalid inputs, proportional paise allocation and browser cart-preview parity. The existing 78 unit tests remain passing. The Billing migration extends Order and OrderItem with invoice identity, idempotency and snapshot fields; existing Sale and StockMovement records remain the shared source for analytics and forecasting. No new package dependencies were required.

The following results were recorded before the Billing update. Earlier browser checks are retained for the existing pages; current Billing browser checks and the successful rerun of the original integration suite are recorded above.

| Prior check | Recorded result |
|---|---|
| `npm run db:seed` | Passed; 50 products, 618 orders, 35,922 sales, 39,571 stock movements |
| `npm run test:integration` against production | 42 checks passed |
| Browser login | Admin sign-in and database-backed dashboard verified |
| Browser forecasting | Event-first planner, shifted Diwali comparison, search and stock filter verified; individual product trends retained |
| Mobile browser | 390px forecast layout and navigation drawer verified; viewport reset afterward |
| Language switching | All nine choices rendered translated event-planner headings; product names and search state remained intact |
| Saved preference | Hindi remained selected after reloading the dashboard |
| Form preservation | An unsaved order name and bank-transfer selection survived Hindi → Bengali switching; raw state/payment/status values remained intact |
| Localized mobile layout | Tamil event planner at 390px: 375px document width, translated cards and controls, no horizontal page overflow; viewport restored |
| Browser console | No captured errors or warnings during language checks |

The earlier integration checks covered seed ledger reconciliation; anonymous/protected routes; valid and invalid login; all three roles; staff forecast restrictions including dashboard previews; cross-site mutation protection; safe user fields; last-admin protection; supplier/category/product CRUD and duplicate SKU handling; receipts, adjustments and negative-stock rejection; GST and discounts; pending/confirmed/cancelled orders; exactly-once stock deduction and reversal; sale creation and voiding; complete rollback of failed orders; concurrent oversell prevention; automatic low-stock alerts and acknowledgment; nonnegative forecasts derived from database history; learned seasonal indices; live report values; CSV export; dashboard calculations; disabled-user session revocation; archive preservation; all required page responses; and logout.

Integration-created records were cleaned up by exact IDs. Demo store data was retained. Two final edge-case tests additionally cover penny discount allocation across 100 order lines and date filters at Indian midnight.

The earlier event-planning update added 21 demand tests and 21 calendar tests. These cover actual previous-festival windows, lunar date shifts, zero-sale days versus missing coverage, current-day exclusion, trend limits, stock reservations, supplier deadlines, leap-year windows, invalid dates, unverified-calendar limits, and floating-point rounding regressions. Eight additional live integration checks verify event selection, six/twelve-month horizons, quantities against PostgreSQL sums in the exact prior-event IST window, projected stock gaps, incomplete-history exclusion, CSV contents, invalid filters, and staff restrictions for both JSON and CSV. Build, lint, unit and integration checks for that update passed on 10 September; the local server and database were restarted and mobile behavior verified on 11 September. That event-planning update required no schema or dependency changes.

The application remains a local, single-store implementation. See README.md for deployment prerequisites and the known scope limits. Payment statuses do not execute financial transactions, and forecast confidence is not a guarantee of prediction accuracy.
