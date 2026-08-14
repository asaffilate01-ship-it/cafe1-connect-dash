# Cafe 1 go-live checklist

Do not enable live ordering or live SumUp charging until every mandatory box is complete and recorded with the release date and operator.

## 1. Repository and release

- [ ] Run **Remove tracked environment files** with confirmation `DELETE-TRACKED-ENV`; confirm `.env` and legacy `env.example` are no longer tracked and keep `.env.example`.
- [ ] Upload this release without rewriting Lovable/Git history.
- [ ] Confirm GitHub Actions passes both **Application** and **Supabase migrations and pgTAP**.
- [ ] Confirm **CodeQL** passes with no unresolved high-severity alert.
- [ ] Confirm **Browser journeys** passes on desktop Chromium and the Pixel 7 viewport.
- [ ] After deployment, run **Release candidate evidence** and retain its workflow URL and artifact.
- [ ] Protect `main`: require pull requests, passing checks and no force pushes.
- [ ] Create a release tag for the deployed commit and record the rollback commit.

## 2. Database

- [ ] Take a production Supabase backup and confirm it can be restored.
- [ ] Restore recent data to staging and run `supabase db push`.
- [ ] Run `supabase test db`; retain the output with the release record.
- [ ] Confirm the St Albans site and delivery origin both use `AL1 3JU`.
- [ ] Test anonymous, customer, staff, driver and manager RLS separately.
- [ ] Confirm customers cannot query internal menu costs, barcodes or KDS routing fields.
- [ ] Apply the modifier-classification migration, then mark each modifier **Veg** only after its ingredients have been checked; confirm no modifier has a null classification.

## 3. Identity and security

- [ ] Give every operator a named account; remove shared or unused accounts.
- [ ] Enrol and verify authenticator MFA for every manager in **Admin → Security**.
- [ ] Set `REQUIRE_ADMIN_MFA=true` only after every manager can reach AAL2.
- [ ] Restrict the Google Maps browser key to `https://cafe1stalbans.co.uk/*` and only required APIs.
- [ ] Enable GitHub secret scanning and Supabase security notifications.
- [ ] Verify CSP, HSTS, frame blocking and `Cache-Control: no-store` on protected routes at the production edge.
- [ ] Verify anonymous `/`, `/menu`, `/socials` and `/blog` HTML exposes the five-minute CDN policy, while cookie-bearing requests and every private route bypass shared caching.
- [ ] Confirm `npm run verify:build-output` passes and the deployed `/admin/security` response contains `private, no-store`.

## 4. Payments and till

- [ ] Configure production SumUp merchant/API/affiliate values in the host secret manager.
- [ ] Run `npm run validate:production-env` in the production secret-bearing environment and retain the pass result.
- [ ] Test one real low-value website charge, one reader charge and one manual-reference transaction.
- [ ] Cancel and decline a payment; confirm no paid KDS ticket appears and vouchers are released.
- [ ] Test cash, voucher, split tender, partial refund and remaining refund.
- [ ] On both the Cafe1 till and SumUp POS, complete a cash + card split sale; confirm the full sale appears as exactly one KDS ticket, remains one ticket after repeated sync/reload and records payment method `split`.
- [ ] Confirm duplicate requests do not create a second order, charge, refund or loyalty award.
- [ ] Reconcile the test transactions against the SumUp settlement export.
- [ ] On the café phone and tablet, complete orders at 320–430px portrait, phone landscape, tablet portrait checkout-sheet and tablet landscape split-view layouts; retain screenshots with operator and date.
- [ ] On each mobile till size, open **View order**, prove Dine In/Takeaway and **Back to menu** remain visible, return to the catalogue, then complete one public-side and one judge-side sale.
- [ ] Create a test house tab, charge it from both tills, prove one order reaches the KDS each time, inspect running items/payment history, reject a charge above its credit limit and settle it with a dated payment reference.
- [ ] On real 320–430px phones, confirm the till action menu stays above every product image, the dense three/four-column quick-key grid is aligned and readable, safe areas are applied once, and checkout remains reachable without horizontal overflow.
- [ ] Measure three cold and three warm production navigations for `/`, `/menu`, `/socials` and `/till`; retain timings and confirm public edge caching reduces the cold public-page delay without caching the till.
- [ ] Test the receipt printer, cash drawer and customer display on the production till device.

## 5. Ordering and operations

- [ ] Verify menu names, prices, the confirmed non-VAT-registered accounting treatment, allergens, dietary labels and availability.
- [ ] Test a vegetarian item with both vegetarian and non-vegetarian modifiers on the customer menu and till; confirm the Veg labels and non-veg warning are correct through basket and checkout.
- [ ] Verify Mon–Fri 08:00–17:00 dine-in/pickup/takeaway, 08:30–16:30 delivery, weekend/bank-holiday closure, the 805-metre radius and AL1 3JU map origin.
- [ ] Test delivery, collection, dine-in and jury-room orders from phone and desktop.
- [ ] On `/menu`, choose **Just browsing**, confirm no order mode is silently created, then add an item and prove checkout requires pickup, delivery or dine-in before submission.
- [ ] Test barcode search, held/recovered baskets and every KDS station.
- [ ] Enter opening stock, build recipes, post waste and complete a controlled stocktake.
- [ ] Clock staff in/out and generate/sign off a daily control summary.
- [ ] Confirm two drivers cannot claim the same delivery.

## 6. Scheduled work and integrations

- [ ] Generate a 32+ character `CRON_SECRET`.
- [ ] Schedule authenticated POST calls to `/api/public/cleanup-unpaid` and `/api/public/juror-daily`.
- [ ] Confirm GET calls return 405 and missing/incorrect bearer secrets return 401/503.
- [ ] Confirm the scheduled **Production smoke** workflow has a recent successful run and retained JSON evidence.
- [ ] Verify email delivery, bounce handling and the correct sender/domain records.
- [ ] Configure official social profiles, automatic YouTube/Instagram feeds and `GOOGLE_PLACE_ID` using `docs/SOCIALS_AUTO_SETUP.md`; verify `/about` and `/socials`, the marketing-consent gate, source links and Google review attribution on phone and desktop.
- [ ] On `/socials`, choose **Allow and show TikTok**; confirm the cookie banner closes, the canonical `@cafe1_stalbans` creator feed replaces the paused card, and no **Profile not available** error appears.
- [ ] Correct the public TikTok bio's legacy postcode and `08:30–17:00` hours to `AL1 3JU` and the confirmed public hours: Mon–Fri 08:00–17:00, delivery 08:30–16:30, weekends and England/Wales bank holidays closed. Verify Facebook, Instagram and YouTube profiles show the same NAP and hours.
- [ ] If Deliveroo Orders API is enabled, complete `docs/DELIVEROO_ORDERS_API_SETUP.md`: verify exact-byte HMAC rejection, accepted-only KDS release, cross-channel duplicate handling, tablet sync status, scheduled orders, cancellation and staff-triggered ready-for-collection.
- [ ] While the Hub watcher fallback is used, complete `docs/DELIVEROO_WATCHER_SETUP.md`: prove accepted-only KDS release, exact items/modifiers/notes/total, refresh/restart deduplication, cancellation removal, minute heartbeats, sign-out warning and automatic Windows restart. Record the chosen flow under `deliveroo_kds_integration`.
- [ ] Before enabling Just Eat ingestion, set `JUSTEAT_INGEST_MODE=hub_watcher` and a 32+ character `JUSTEAT_BRIDGE_SECRET`, then complete `docs/JUSTEAT_WATCHER_SETUP.md`: prove accepted-only KDS release, exact items/modifiers/notes/total, refresh/restart deduplication, cancellation removal, minute heartbeats, sign-out warning and automatic Windows restart. Record evidence under `just_eat_kds_integration`; continue using Orderpad to notify the customer/rider that an order is ready.

## 7. Compliance and launch operations

- [ ] Confirm privacy, cookies, terms, complaints, company/legal name, phone, opening hours and AL1 3JU.
- [ ] Confirm the cookie banner works before optional scripts, granular choices persist for 180 days, withdrawal removes social/analytics players, and the Cloudflare `__cf_bm` inventory entry matches the live edge.
- [ ] Obtain HMCTS/privacy approval before enabling attendance QR functionality: issue `docs/HMCTS_ATTENDANCE_QR_PRIVACY_NOTE.md` to the Jury Office and HMCTS privacy reviewer, collect all three signatures, and attach the signed copy to the `legal_hmcts_retention` gate.
- [ ] With HMCTS, prove one activated Juror ID is the voucher code for exactly 12 weeks, cannot redeem on a weekend or configured England/Wales bank holiday, cannot exceed its daily allowance, and cannot be used online without that day's attendance proof.
- [ ] Confirm retention periods for orders, addresses, audit events, staff time and voucher records.
- [ ] Configure application/server logs, 5xx alerts, payment failures and till variance alerts.
- [ ] Document the incident owner, SumUp escalation route, database restore owner and rollback procedure.
- [ ] Complete a staff rehearsal, then run a monitored soft launch before public promotion.

## 8. Local search and indexability

- [ ] Apply `20260809234000_local_search_content_phase24.sql` and confirm all six published articles render.
- [ ] Confirm `/menu` and `/blog` contain their catalogue/article links in server-rendered HTML.
- [ ] Confirm `/breakfast-st-albans`, `/halal-food-st-albans` and `/lunch-st-albans` return 200 with self-referencing canonicals.
- [ ] Submit the canonical sitemap in the verified Google Search Console property and inspect the six priority public URLs.
- [ ] Validate Restaurant, Breadcrumb and Article data with Google's Rich Results Test.
- [ ] Make Google Business Profile NAP, regular hours, public-holiday hours, menu URL and ordering links match production.
- [ ] Record Search Console and Business Profile baseline metrics before assessing organic movement.

## 9. Financial controls and stock purchasing

- [ ] Confirm the canonical hosted Phase 33 migration
      `20260811214754_1542aaa3-c874-48b8-bc64-257ad8dda913.sql` is applied and retain the full pgTAP
      result. Keep `20260811220000_finance_kpis_phase33.sql` as its compatibility no-op.
- [ ] As anonymous, customer, staff and driver, prove financial RPCs and tables are denied; as a
      named AAL2 manager, prove authorised access and audit events.
- [ ] Enter an opening stock count, current gross supplier costs and complete recipes for all sold
      items; resolve every zero-cost sale-line warning before relying on gross margin.
- [ ] Receive a controlled supplier invoice and prove its delivery/discount-adjusted landed cost,
      stock movement and purchase order are created exactly once. Do not also post it as an operating
      expense.
- [ ] Import the official SumUp POS expense CSV twice and prove the second import is skipped. Void one
      test expense with a reason and retain both the record and audit event.
- [ ] Give the server credential `payouts.read`, sync SumUp payouts/deductions twice and prove the
      settlement and processing-fee records remain idempotent.
- [ ] Reconcile one full week of gross sales, vouchers, cash, card, refunds, SumUp fees/payouts,
      expenses and supplier purchases to the till, SumUp and bank statement.
- [ ] Have the accountant approve the chart of accounts and confirm the non-VAT treatment, opening
      balances, payroll, accruals, depreciation and statutory/year-end process.

Record payment, hardware, recovery and staff evidence in `docs/OPERATIONAL_ACCEPTANCE_RECORD.md`.

Automated GitHub gates can be recorded without editing JSON by hand: after the
final candidate has green exact-SHA runs, start **Record verified release
evidence** and review its draft evidence PR. The workflow never records real
payment, hardware, legal, recovery or staff gates.
