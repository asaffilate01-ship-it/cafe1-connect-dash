# Production audit — Phase 40

Date: 2026-08-15

## Scope

Phase 40 extends exact-release production smoke to the installable customer and Kitchen Display apps plus the remaining public legal/help surfaces. It does not deploy production or mark real-world acceptance evidence complete.

## Changes

- Added deployed checks for the customer manifest, KDS manifest, service worker and both required install icons.
- Validates deployed manifest JSON, app identity, scope, start URL, standalone display, 192/512 icons and maskable icon support.
- Validates that the deployed service worker keeps navigation and critical private route families out of its cache.
- Requires browser, shared-CDN and Cloudflare revalidation headers on every mutable PWA resource and rejects stale cache states or positive cache age.
- Added production-smoke coverage for Terms, GDPR, Complaints and FAQ pages.
- Added regression tests for stale PWA resources and malformed deployed manifests.

## Release position

- Repository `main` was `f8c770cfc2bb7c575595c9658fd05912ae7ce89f` when this phase began and already contained Phases 37–39 plus subsequent Lovable promo-code security work.
- Production health still reports `47cf2c10c79de95a517b64e11df13958aac9ba3f`; this phase does not change production.
- Operational acceptance remains 3/28 passed and 25 pending. The remaining real payment, partner, hardware, backup/restore, monitoring, legal and staff gates require genuine evidence.
