# Production audit Phase 41 — response budgets and smoke telemetry

Phase 41 makes the existing exact-release production smoke report useful as a deployment
performance baseline. It does not deploy production or replace browser performance testing.

## Added controls

- Every production check now records response duration, the applicable duration budget,
  response size when observable, and the applicable size budget.
- A response taking more than 10 seconds fails the production smoke before the existing
  15-second hard timeout. Set `PRODUCTION_MAX_DURATION_MS` to a lower positive value when a
  stricter release SLO is approved.
- Payload ceilings are selected by surface: 64 KiB for manifests and release health,
  128 KiB for robots, 512 KiB for the service worker, 2 MiB for pages/icons/sitemap, and
  100 MiB for signed watcher packages.
- The JSON report includes maximum and p95 response duration plus response-size coverage and
  the largest observed payload. Chunked, uninspected responses without `Content-Length` are
  recorded as `null`; the smoke does not download large binary packages solely to measure them.
- Unit coverage proves oversized responses fail closed and invalid timing configuration is
  rejected.
- An additive migration removes the accidental `menu_items.barcode` column grant introduced
  on `main`; the existing pgTAP contract continues to require operational barcode lookup to
  stay behind staff-authorised server paths. Published migration history remains unchanged.

## Operator use

Run the normal exact-release command after deployment:

```sh
EXPECTED_RELEASE_SHA=<40-character-merged-main-sha> \
  npm run smoke:production -- https://cafe1stalbans.co.uk --json release/production-smoke.json
```

Only the exact merged `main` SHA is valid for `EXPECTED_RELEASE_SHA` and `PUBLIC_RELEASE_SHA`.
Physical payments, KDS, printer, watcher and staff drills remain separate operational gates.
