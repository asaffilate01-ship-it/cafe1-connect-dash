# Cafe 1 phase 3 — KDS provider evidence, judges' sign-in and tab permissions

**Scope:** software-only hardening. No live payment activation, new database migration, marketplace partnership approval, production cutover or real court-data export.

## 1. Marketplace connectivity — what the signal really means

The KDS previously treated a Deliveroo Orders API event as permanent evidence of a live connection. In reality, a webhook arriving on Friday says nothing about whether an order on Monday will reach the shop. Both Deliveroo and Just Eat watchers also stored `healthy=true` even when a signed-out heartbeat said orders were not arriving.

This phase:
- stores a signed-out Hub watcher heartbeat with `healthy=false`;
- treats a **fresh, healthy watcher heartbeat within three minutes** as evidence that the local bridge is active;
- displays official API/webhook messages as **event observed**, never **connected** merely because `healthy=true`;
- reports expired/invalid watcher timestamps, explicit errors, missing signals and failed reads as needing manual verification;
- prioritises fresh Hub evidence over older API events, and describes an API event observed after an old Hub event without claiming liveness;
- shows status on full-screen/touch KDS and a read-only operations dashboard at `/admin/operations`.
  
Staff must still confirm whether a ticket exists on the provider tablet. A watcher heartbeat does **not** guarantee accepted orders have appeared, that all items/modifiers match, or that a payment is settled. Continue using manual KDS entry and record any missed order.

## 2. Judges' tabs and staff access

The public judges' sign-in previously called an unauthenticated server function after a failed password and attempted to create/confirm the shared judges' identity, even when the failure was simply an incorrect password.

- Failed sign-in now leaves the login unchanged; it does not provision or silently retry.
- Provisioning is a manager-only server action exposed from `Admin → Tab accounts → Judges' sign-in`; it checks a signed-in administrator role and uses only the existing server secret. No password is returned to the client.
- Existing shared judge credentials, individual tab codes, open tabs, weekly Friday billing and customer ordering remain unchanged.
- Account-list and statement server functions explicitly require an authenticated staff/admin role (they are also used by the till). Admin-only billing exports require an admin role. Similar-order checks and counter tab charging require staff/admin server checks, not just frontend gating. Database RLS remains a second line of defence.

**Limit:** the shared judges' password remains a shared credential; this is **not** individual judge identity or an MFA rollout. Replacing it with per-judge identities, account mappings and recovery requires a separate compatibility migration and court stakeholder agreement. Do not silently rotate credentials or orphan existing tabs.

**MFA truth:** `src/lib/elevated-auth.server.ts` currently describes manager step-up MFA as intentionally disabled at the owner's request. This phase does not change that policy or claim MFA is enforced. Any future decision to reinstate MFA should come with a complete enrolment and recovery rollout.

## 3. Verification before release

1. KDS: signed-out watcher with a fresh timestamp displays a warning; a recent healthy watcher displays active; old API events display **event seen**, never **online**; no events shows unverified; browser data errors show needs attention.
2. Delivery: accepted orders import once; placed/cancelled flow stays unchanged; print tickets and compare item/modifier totals to each provider.
3. Role matrix: anonymous/customer/driver must not access account lists, tab statements, duplicate-order checks or judge-account provisioning. Staff may view counter account summaries and charge approved accounts; managers may access billing.
4. Judges: existing user logs in normally; incorrect password does **not** call provisioning; manager provisioning succeeds only with configured secret and proper role; judge tab code and Friday settlement still work.
5. After GitHub CI, test in staging with site-specific accounts, real partner devices, network outages and clock skew.
6. The prior production smoke/live-release-drift failures still require exact-SHA deployment and independent evidence. GitHub merge does not prove what is deployed at `cafe1stalbans.co.uk`.

Do not commit customer PII, provider tokens, judge passwords or HMCTS voucher IDs in screenshots, logs or source fixtures.
