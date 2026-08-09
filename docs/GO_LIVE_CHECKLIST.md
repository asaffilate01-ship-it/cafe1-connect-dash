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

## 3. Identity and security

- [ ] Give every operator a named account; remove shared or unused accounts.
- [ ] Enrol and verify authenticator MFA for every manager in **Admin → Security**.
- [ ] Set `REQUIRE_ADMIN_MFA=true` only after every manager can reach AAL2.
- [ ] Restrict the Google Maps browser key to `https://cafe1stalbans.co.uk/*` and only required APIs.
- [ ] Enable GitHub secret scanning and Supabase security notifications.
- [ ] Verify CSP, HSTS, frame blocking and `Cache-Control: no-store` on protected routes at the production edge.
- [ ] Confirm `npm run verify:build-output` passes and the deployed `/admin/security` response contains `private, no-store`.

## 4. Payments and till

- [ ] Configure production SumUp merchant/API/affiliate values in the host secret manager.
- [ ] Run `npm run validate:production-env` in the production secret-bearing environment and retain the pass result.
- [ ] Test one real low-value website charge, one reader charge and one manual-reference transaction.
- [ ] Cancel and decline a payment; confirm no paid KDS ticket appears and vouchers are released.
- [ ] Test cash, voucher, split tender, partial refund and remaining refund.
- [ ] Confirm duplicate requests do not create a second order, charge, refund or loyalty award.
- [ ] Reconcile the test transactions against the SumUp settlement export.
- [ ] Test the receipt printer, cash drawer and customer display on the production till device.

## 5. Ordering and operations

- [ ] Verify menu names, prices, the confirmed non-VAT-registered accounting treatment, allergens, dietary labels and availability.
- [ ] Verify Mon–Fri 08:00–17:00 dine-in/pickup/takeaway, 08:30–16:30 delivery, weekend/bank-holiday closure, the 805-metre radius and AL1 3JU map origin.
- [ ] Test delivery, collection, dine-in and jury-room orders from phone and desktop.
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
- [ ] If Deliveroo is enabled, verify webhook signature rejection, duplicate delivery handling and cancellation sync.

## 7. Compliance and launch operations

- [ ] Confirm privacy, cookies, terms, complaints, company/legal name, phone, opening hours and AL1 3JU.
- [ ] Obtain HMCTS/privacy approval before enabling attendance QR functionality.
- [ ] With HMCTS, prove one activated Juror ID is the voucher code for exactly 12 weeks, cannot redeem on a weekend or configured England/Wales bank holiday, cannot exceed its daily allowance, and cannot be used online without that day's attendance proof.
- [ ] Confirm retention periods for orders, addresses, audit events, staff time and voucher records.
- [ ] Configure application/server logs, 5xx alerts, payment failures and till variance alerts.
- [ ] Document the incident owner, SumUp escalation route, database restore owner and rollback procedure.
- [ ] Complete a staff rehearsal, then run a monitored soft launch before public promotion.

Record payment, hardware, recovery and staff evidence in `docs/OPERATIONAL_ACCEPTANCE_RECORD.md`.

Automated GitHub gates can be recorded without editing JSON by hand: after the
final candidate has green exact-SHA runs, start **Record verified release
evidence** and review its draft evidence PR. The workflow never records real
payment, hardware, legal, recovery or staff gates.
