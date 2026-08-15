# Phase 37 — current-main go-live convergence

Date: 2026-08-15. Candidate base: `e1896b0`.

## Outcome

This phase carries the previously tested dependency, CI and Just Eat hardening
onto the latest `main`, including the new direct-order content. It does not
rewrite Lovable history and it does not claim that physical acceptance tests
have happened.

## Code-controlled fixes

1. Synchronised the npm lockfile with Lovable Vite config 2.13.1 and retained
   the patched nanoid 3.3.18 resolution.
2. Made Just Eat ingestion fail closed unless `JUSTEAT_INGEST_MODE` explicitly
   enables the requested channel and a production bridge secret is valid.
3. Documented the Just Eat real-order-to-KDS check in the deployment sequence
   without rewriting the existing production evidence record.
4. Extended the exact-release production smoke to both Just Eat endpoints,
   both watcher ZIP packages, `/order-direct`, `/contact` and
   `/watcher-download`.
5. Added the new anonymous public pages to the five-minute edge cache allowlist
   while retaining no-store controls for POS, KDS, checkout and authenticated
   surfaces.
6. Prevented `/menu` hydration from immediately repeating the category, item
   and modifier queries that the SSR loader has just completed. The menu becomes
   stale after one minute, so normal availability refresh remains in place.
7. Kept the Google Pay release marker aligned with conditional merchant
   configuration and repaired the release-evidence/browser assertions.

## Deployment sequence

1. Merge this phase only after Production checks, Browser journeys and CodeQL
   pass for the exact head commit.
2. Apply any pending Supabase migrations using the Production checks workflow.
3. Configure `JUSTEAT_INGEST_MODE=hub_watcher` only when the watcher is installed
   on the authorised Windows device; use `dual` only if both approved channels
   are intentionally live. Configure a unique 32+ character
   `JUSTEAT_BRIDGE_SECRET` whenever a Just Eat channel is enabled.
4. Set `PUBLIC_RELEASE_SHA` to the exact merged `main` SHA and deploy that exact
   commit.
5. Run `Production smoke` with `EXPECTED_RELEASE_SHA` set to the deployed SHA.
6. Place one controlled Just Eat order and one Deliveroo order, confirm each
   appears once on KDS, and retain screenshots/order references without customer
   personal data.
7. Complete the remaining payment, hardware, MFA, restore, monitoring, legal and
   staff-rehearsal gates before production promotion.

## Decision boundary

Green CI proves the software candidate. It does not replace live SumUp,
printer, cash drawer, customer display, KDS, partner-order, backup/restore,
manager MFA or HMCTS acceptance evidence. Those gates remain fail closed.
