# Café 1 St Albans — Adyen for Platforms migration (proposed, not activated)

**Decision status (15 October 2026):** evaluating Adyen for Platforms as a replacement for SumUp at the St Albans Crown Court branch. The business is still using its existing SumUp payment integration. Do **not** route any real money through Adyen, claim an approved merchant or disable SumUp based on this document.

## Why the change requires a separate workstream

`src/lib/payments.functions.ts`, `src/lib/till.functions.ts`, `src/lib/sumup.server.ts`, `src/routes/checkout.tsx` and `src/routes/pay.$orderId.tsx` use SumUp-specific checkout, reader and refund behaviour. Existing Dishbee's Adyen integration is primarily for the Hive platform and **does not prove** a St Albans merchant/store, verified account holder, platform splits or terminal is configured.

Cafe 1 St Albans remains a separate **Dishbee One** business/tenant with one St Albans Crown Court location. Cafe 1 Luton, Futures House and MealDeck are independent merchant/location boundaries. Never use a shared tenant's API token, merchant account or balance account to process a Cafe 1 St Albans sale.

## Required live migration design

- Online: site order priced and reserved by Dishbee server; Adyen Checkout Session against **St Albans' approved merchant account**; 3DS + Apple Pay / Google Pay according to merchant eligibility; signed webhook AUTHORISATION/CAPTURE, failure, cancel and refund; idempotent paid-only KDS release and one order reference.
- Counter: provision Adyen-supported POS hardware and per-till device binding. The current SumUp Solo is not automatically an Adyen terminal. Exercise chip & PIN, contactless, disconnection, decline, reversal, receipt printer and terminal-refund flows.
- Court: juror daily allowance with separate top-up, judge/chambers tabs, cash + card split, accurate tax and VAT status, two simultaneous till operators and kitchen routing must remain unaffected.
- Settlement: confirm legal entity, merchant, store, balance accounts, bank/payout instrument, split rules and fee arrangements. Avoid accidentally routing Cafe 1 funds into platform liable funds or another restaurant's account. Match Adyen payout report, internal cash/card ledger and bank for full weekly reconciliation.
- Legacy: preserve all original SumUp transaction IDs, refunds, unsettled orders, disputes and financial records. Do not charge an order twice. Keep SumUp active until the new provider has accepted both payment channels and rollback.
- Rollout: approve and test online and counter **independently**. Never infer 'active' from credentials/blueprint status. Real authenticated staging sessions, providers, KDS, devices, staff roles, vouchers, security and monitoring are required.

## Read-only completeness preflight

`npm run preflight:adyen -- /path/to/private-adyen-evidence.json`

The optional input file is never committed and must contain non-secret evidence references only. It must have `schemaVersion: 1`, `provider: "adyen_for_platforms"`, `businessKey: "cafe1stalbans"`, `landlord: "dishbee"`, `product: "dishbee-one"`, and `checks` with every field exported by `ADYEN_STALBANS_EVIDENCE`. Each check takes `{ "passed": true, "evidence": "approved-ticket-or-clean-https-link" }`.

**Critical:** even a complete evidence report always returns `liveSwitchAuthorised: false` and `productionProviderConfigured: false`. These are deliberately hard-coded: offline JSON can never authorise live payment processing. A person with operations/finance authority must accept real evidence in the release process and explicitly commission the provider.

No merchant secret, bank information, balance account ID or checkout token belongs in this JSON, GitHub or chat. Store secrets in the approved server secret manager or Dishbee Vault only.

Tracking: [GitHub #41](https://github.com/asaffilate01-ship-it/cafe1-connect-dash/issues/41).
