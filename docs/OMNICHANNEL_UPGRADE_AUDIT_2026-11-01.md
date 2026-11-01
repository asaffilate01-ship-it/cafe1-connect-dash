# Café 1 St Albans — omnichannel security, product and design programme

Audited against the GitHub `main` implementation on 1 November 2026. This is a scope and evidence register, **not proof that the public site is running the new build**. Release drift on 31 October found `cafe1stalbans.co.uk` **754 commits behind** the expected main commit; Production smoke also failed. Maintain the production launch gates in `docs/GO_LIVE_CHECKLIST.md` and `docs/GO_LIVE_FINAL_GUIDE.md`.

## One kitchen, one financially authoritative order

A paid direct order, authorised house-tab charge or **accepted** marketplace order creates exactly one KDS ticket. Retries, print watcher replays, gateway callbacks and duplicate devices must never create an extra paid order or kitchen job. A pending or failed online charge must never reach the paid food queue. A cancellation must propagate across KDS, dispatch, refunds and reports without deleting audit evidence.

| Customer or fulfilment path | Found in repository | Production or partner gate / remaining gap |
| --- | --- | --- |
| Direct website delivery, pickup / Pay & Collect, dine-in | Order-context gate, server-priced checkout, customer menu, pickup and dine-in modes | Full mobile, allergen, scheduling, postcode and payment journey acceptance |
| Card entry | SumUp server-created checkout, embedded official widget and provider re-verification | Live SumUp configuration, low-value charge, 3DS, cancel/decline/refund and settlement reconciliation |
| Apple Pay | SumUp widget support and domain-association setup | SumUp wallet activation and Apple domain verification; real Safari + eligible Wallet card |
| Google Pay | SumUp widget and Google merchant ID configuration plus TEST onboarding screens | Merchant approval and domain allowlist; real Chrome Android + eligible Wallet card |
| EPOS / counter / judges' tab | Till, cash/card/voucher/split tender, tab charging, receipts and manager controls | Hardware test, offline recovery, two tills racing, named judge identities, Friday settlement |
| Jury voucher / HMCTS | Issued Juror ID, separate PIN, attendance checks, allowance, opt-in and daily claim job | HMCTS privacy/retention sign-off, sitting-day test, £5.71/£12.17 allowances, double-spend stress tests |
| Court-staff discounts | Approved member, allowlisted email, manager overrides and court delivery locations | Provider-confirmed email, suspended-member regression, staff approval and audit |
| Kitchen display | Stations, status changes, realtime updates, SumUp POS sync, aggregator tickets | Outage/duplicate tests, clear queue aging, printer failover and cancelled-order removal |
| Own delivery | Driver claim, driver progress/status and location | Two-driver race, local geofence, permission consent and connectivity-loss rehearsal |
| Uber Direct | Outbound courier quote/create/tracking, webhook and test mode setting | Provider credentials and live approval, **atomic dispatch claim to avoid double booking**, cancellation and fee reconciliation |
| Uber Eats marketplace | Not established by Uber Direct code | Separate authorised Uber Eats order ingestion / restaurant partner integration |
| Deliveroo Orders API | Signed webhook, accepted order handling, cancellation and KDS ingest | Provider enablement and exact-byte HMAC, status acceptance, idempotency and test orders |
| Deliveroo Express | Not established by Deliveroo Orders API integration | Separate delivery-as-a-service commercial/API approval and outbound dispatch adapter |
| Just Eat orders | Authenticated bridge and Just Eat Hub watcher, KDS import | Status acceptance tests, bridge health, Orderpad notifications and approval |
| Just Eat Go | Not established by the Just Eat order-ingest bridge | Separate last-mile courier partner entitlement and booking/status adapter |

**Do not confuse a marketplace source with a last-mile courier.** Uber Eats and Uber Direct have different contracts and flows. The same applies to Deliveroo Orders versus Express and Just Eat Marketplace versus Go.

## Release priorities

### P0 — block unsafe launch
1. Promote only an exact successful Git SHA and confirm that deployed commit via `/api/public/health`; resolve production smoke failures.
2. Verify SumUp webhook and customer callback settlement against our stored checkout ID, reference, GBP and amount; keep declined/unverified orders off paid KDS. Test replay and concurrent webhook/client confirmation.
3. Enrol manager MFA, review named staff accounts, prove RLS with anon/customer/staff/driver/admin, rotate potentially exposed credentials, scan secrets and rehearse backup restore.
4. Confirm merchant wallets with real devices and reconcile charges/refunds; never infer wallet availability from a simulated Google Pay review screen.
5. Apply pending attendance migrations only after staging backup and native companion field tests; five-metre building-buffer detection is not evidence of reliable GPS indoors.

### P1 — operational correctness
1. Evolve the till into a zero-surprise rush-hour flow: persistent order type, seat/table or juror room, large fast-access product keys, clear modifiers and allergen warnings, one-touch hold/recall, split tender and recovery.
2. Unify KDS source badges (direct, till, Deliveroo, Just Eat, Uber Eats where approved), SLA queue age, station routing, ready/collected proof, print retry and manager exception tray.
3. Track voucher claims with pseudonymous identifiers, sitting-day limits, serialisable balance reservations, human approval and Excel-safe exports.
4. Remove the shared judges credential: issue individually identified accounts, personal-tab scope and MFA proportional to risk. Preserve weekly invoices and credit limits. Do not change existing logins without provisioning a migration path.
5. Make courier booking atomic/idempotent before production Uber Direct auto-booking; reconcile quote, final courier fee, delivery success, cancellation and exception recovery.

### P2 — customer experience and resilience
1. Build mobile-first pickup, dine-in QR and delivery cards; show clear ETA/slot, charges, payment status, allergen information and accessibility. Never show wallet or payment success not returned by the provider.
2. Trial offline-first local till/KDS queue and network/printer failover **without** accepting or representing offline card authorisation as paid.
3. Add reliable SMS/email/push status notifications, refund tracking, favourites, repeat order and loyalty within consent.
4. Introduce store-level channel switches and a single diagnostics screen with last heartbeat, account approval, webhook status, sample-order evidence and reconciliation exceptions.

### P3 — AI agents and MCP, controlled
- Read-only kitchen queue monitor: ageing tickets, missing items, device/bridge heartbeat and delivery ETA anomalies; human dispatch override.
- Order-integrity agent: duplicate payment attempts, inconsistent provider totals, cancelled-order tickets and unsettled vouchers; never autonomously modify a balance.
- Menu/allergen compliance assistant: flag data inconsistencies and missing modifiers for human verification; never infer that an item is allergy-safe.
- Sales and staffing forecasting, recipe/waste analysis, daily juror claim variance and weekly tab reminders using redacted aggregates.
- MCP tooling should have scoped identities, least privilege, audited actions, customer-data minimisation, source attribution, prompt-injection boundaries and explicit approval for any financial change. Never expose service-role secrets or payment tokens to models.

## Curated external engineering and design references

These are design/implementation references, **not installed dependencies**. Evaluate licence, maintenance, security and the product boundary before importing code.

- [Taste Skill](https://github.com/Leonxlnx/taste-skill): brand-specific art direction and review of rendered storefront/till/KDS.
- [Impeccable](https://github.com/pbakaus/impeccable): audit/harden/polish workflows and accessibility critique, advisory source check in CI.
- [Awesome DESIGN.md](https://github.com/VoltAgent/awesome-design-md): design decisions, interaction inventory and acceptance criteria.
- [SumUp official skills](https://github.com/sumup/sumup-skills): provider checkout verification, widget callback handling, SCA and wallet-activation playbook.
- [FloCafe](https://github.com/FreeOpenSourcePOS/FloCafe): MIT-licensed offline-first counter POS, independent LAN KDS, printing, table service and recovery patterns; adapt concepts to the existing TanStack/Supabase stack.
- [ElitaleRestro](https://github.com/elitale/restro): modern POS/KDS state modelling, recipe stock, split tender and touch UX patterns; validate its licence before reusing code.
- [Supabase security guidance](https://supabase.com/docs/guides/database/postgres/row-level-security): row-level and column-level privilege reviews.
- [Playwright](https://playwright.dev/): checkout/EPOS/KDS desktop and real mobile-viewport regression runs.
- [OpenTelemetry JS](https://github.com/open-telemetry/opentelemetry-js): server tracing for SumUp/marketplace callbacks, privacy-safe order correlation and error budgets.

## Mandatory operational evidence before “working” claims

Record results on the **actual deployed production SHA**: Apple Pay Safari charge, Google Pay Android charge, standard card entry and 3DS; payment cancel/decline/replay/partial refund; jury voucher claim, PIN rate limit, 12-week validity and legal consent; judge Friday settlement and tab over-limit; staff suspended/re-register attempt; Deliveroo/Just Eat accepted order exactly one KDS ticket; Uber Direct live create/cancel/status; own driver contention; safe dine-in/pickup deliveries; receipts and printing; RLS/MFA/secret audit; production backup restore and regression screenshots.

Missing credentials, supplier approval or real-world terminal evidence remain **unverified**, regardless of passing source-code tests.
