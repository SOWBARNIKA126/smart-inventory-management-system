# Stockwise UI/UX polish — 28 September 2026

The existing Stockwise branding, dark green sidebar, brand green actions, page structure and workflows are preserved. This is a refinement of the existing application. No dependencies, database schema, payment behavior or stock rules were changed.

## Improvements delivered

- **Surface hierarchy:** light gray/green `#eef3f0` page background, white cards, clearer neutral green borders and restrained shadows. Consistent card, section, header and control spacing.
- **Legibility:** darker secondary text, table headings, metadata and status labels; larger chart ticks and commonly used labels. Representative calculated contrast ratios: secondary text on white 5.47:1; on the page background 4.87:1; table headings 5.56:1; warning badge text 5.69:1; chart ticks 5.53:1; primary button text 4.93:1. These are specific token checks, not a certification of every screen.
- **KPI scanning:** stronger numeric hierarchy, tabular numerals, consistent icon sizing, wrapping hints and responsive two-column/single-column grids.
- **Dashboard correctness:** increases point up, decreases point down, and rounded-zero changes use a neutral indicator. Invalid comparisons show the existing unavailable state. Monthly revenue is explicitly labeled month-to-date versus the previous full month.
- **Revenue charts:** only completed Indian business days/months form the historical line. The current period remains visible as a separate running total labeled “In progress”; historical zero values remain intact. Date labels are independent of the browser's timezone. Axis/tooltip contrast, currency formatting and keyboard chart access are improved.
- **Category charts:** complete matching legends, category names, amounts, percentages and totals on both Dashboard and Sales. No eight-category truncation. Sales values use store currency; inventory values use units. Empty/all-zero data gets a readable empty state. The decorative pie no longer adds an unannounced keyboard stop.
- **Chart and card density:** compact two-column category legends, bounded grid columns, fewer oversized gaps, and contained horizontal table scrolling.
- **Shared controls:** consistent buttons, inputs, badges, radii, status colors, touch targets, action tooltips and visible green focus outlines. Existing animations are reduced; reduced-motion preferences are respected.
- **Navigation:** active-page semantics, a skip-to-content link, full-name tooltips for truncated store/profile names, and wrapping translated navigation labels. Mobile navigation uses the existing Radix dialog primitive for focus trapping, Escape, scroll locking and focus restoration.
- **Forms and dialogs:** stable error IDs with `aria-invalid`/`aria-describedby`, named order-product selectors, a named loading sign-in button, improved modal spacing/close targets, and focus return for dialogs opened by ordinary buttons.
- **Tables:** overflowing tables become named keyboard-focusable regions and can be scrolled with arrow keys. Empty action headers receive accessible text. Icon action buttons have hover titles.
- **Loading, empty and error states:** visible loading text with status semantics, calmer skeletons, higher-contrast messages/icons, wrapping errors and consistent retry controls. Empty category charts and empty sales rankings have explicit states.
- **Responsive behavior:** page/control wrapping on tablet, no cramped profile block in the tablet header, long detail values wrap, dense forms collapse on small screens, and POS product cards use one column on narrow phones. The Tamil tablet header overflow found during QA was corrected.
- **Billing:** improved product/stock/total contrast, consistent quantity controls, larger mobile targets and clearer invoice metadata on screen. Print-specific invoice rules remain in place.
- **Languages:** all 13 new UI messages are translated into English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali and Gujarati; each catalog now has 886 messages.

## Limited reporting-date correction

The previous-month calculation changed a UTC month on an Indian-midnight timestamp, causing the previous period to begin on the wrong local date in some months. It now constructs the first day of the previous Indian month directly, including January rollover and leap years. Dashboard and Sales range starts also use the Indian business date consistently. This corrects displayed reporting periods; checkout, pricing, stock and forecasting algorithms are unchanged.

## Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test -- --reporter=dot`: 125 tests passed in eight files, including 16 new trend/period/date-boundary regression tests.
- `npm run build`: passed with all existing routes.
- Browser: dashboard at 1440px and 390px; all ten inventory categories and downward trend icon verified. Mobile document width 375px within a 390px viewport.
- Keyboard: mobile drawer wraps focus, locks background scroll, closes with Escape and returns focus to its trigger. Product table moves horizontally with ArrowRight and uses the dark brand-green focus ring.
- Product dialog: invalid submission associates all four required-field errors with their controls; Escape returns focus to Add product. No product was created.
- Empty state: unmatched product search displays useful filter guidance; search was cleared afterward.
- Tablet/language: Tamil forecasting at 768px fits within a 768px document after the header correction.
- Validation scope: representative browser checks plus the shared-component/code audit; no claim of a full screen-reader certification or every device/browser combination.

## Exact source files changed

| File | Change |
|---|---|
| `src/app/layout.tsx` | Loads the shared polish stylesheet. |
| `src/app/ui-polish.css` | New shared surface, contrast, spacing, controls, chart, state, responsive and focus refinements. |
| `src/app/(workspace)/dashboard/page.tsx` | Accurate KPI comparison labels, complete category legend, selected range semantics and keyboard table wrappers. |
| `src/app/(workspace)/forecasting/page.tsx` | Keyboard-accessible overflowing planner table. |
| `src/app/(workspace)/reports/page.tsx` | Keyboard-accessible report tables. |
| `src/app/(workspace)/sales/page.tsx` | Correct period presentation, currency category legend, selected controls, empty rankings and keyboard tables. |
| `src/app/(workspace)/users/page.tsx` | Error associations and keyboard table wrapper. |
| `src/app/login/page.tsx` | Input-error associations and a persistent accessible name while submitting. |
| `src/components/billing-documents.css` | Better invoice screen text contrast and metadata sizing. |
| `src/components/billing-history.tsx` | Keyboard table wrapper. |
| `src/components/billing-pos.css` | Product/total contrast, quantity targets and mobile product-card refinements. |
| `src/components/billing-pos.tsx` | Keyboard cart wrapper, action header and icon titles. |
| `src/components/charts.tsx` | Complete-period revenue display, complete category legends, clearer values/ticks/tooltips and chart accessibility. |
| `src/components/product-forecast.tsx` | Selected range semantics and keyboard table wrapper. |
| `src/components/shared.tsx` | Shared keyboard table wrapper, loading/empty states and correct growth indicators. |
| `src/components/workspace-shell.tsx` | Accessible mobile drawer, skip link, active-page semantics and truncation titles. |
| `src/components/operations/inventory.tsx` | Keyboard table wrappers and action accessibility. |
| `src/components/operations/order-detail.tsx` | Keyboard table wrapper. |
| `src/components/operations/order-form.tsx` | Named product selectors, line errors, action header and keyboard table wrapper. |
| `src/components/operations/orders.tsx` | Keyboard table wrapper. |
| `src/components/operations/products.tsx` | Keyboard table wrapper, action header and icon titles. |
| `src/components/operations/shared.tsx` | Form field error IDs and control associations. |
| `src/components/operations/suppliers.tsx` | Keyboard table wrappers, action header and icon titles. |
| `src/components/ui/dialog.tsx` | Returns focus to the actual opener for controlled dialogs. |
| `src/lib/chart-presentation.ts` | New pure helpers for reporting dates, completed chart periods and trend direction. |
| `src/lib/i18n/messages/en.json` | 13 new English messages. |
| `src/lib/i18n/messages/hi.json` | Hindi translations. |
| `src/lib/i18n/messages/ta.json` | Tamil translations. |
| `src/lib/i18n/messages/te.json` | Telugu translations. |
| `src/lib/i18n/messages/kn.json` | Kannada translations. |
| `src/lib/i18n/messages/ml.json` | Malayalam translations. |
| `src/lib/i18n/messages/mr.json` | Marathi translations. |
| `src/lib/i18n/messages/bn.json` | Bengali translations. |
| `src/lib/i18n/messages/gu.json` | Gujarati translations. |
| `src/services/analytics.ts` | Correct previous-Indian-month boundary and consistent dashboard range date. |
| `tests/chart-presentation.test.ts` | 16 regression cases for chart periods, Indian midnight/month boundaries and trend directions. |

This report, `UI_UX_AUDIT.md`, is also new. Local ignored build outputs and temporary audit helpers are not application source changes.
