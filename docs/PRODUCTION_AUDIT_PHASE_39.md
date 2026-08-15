# Production audit — Phase 39

Date: 2026-08-15

## Scope

Phase 39 closes the remaining PWA install and update-safety gap found after Phases 37–38. It changes repository-controlled behaviour only and does not deploy production or mark physical acceptance gates complete.

## Changes

- Added the dedicated Kitchen Display manifest to browser and CDN revalidation rules.
- Made service-worker update checks bypass intermediary HTTP caches.
- Extended service-worker exclusions to every private route family, including cart, checkout, printing and Lovable callbacks.
- Added a release-blocking PWA verifier covering both manifests, declared icon dimensions, maskable icons, app identity/scope/start URLs, navigation/cross-origin caching and private-route exclusions.
- Added PWA verification to the standard `npm run check` release path.
- Extended generated deployment-header verification to all three mutable PWA resources.

## Release position

- Repository `main` contains the extracted Phase 37–38 changes at `2a2915de60afe2fb2f55877299245df615ab64a0`.
- Production health still reports `47cf2c10c79de95a517b64e11df13958aac9ba3f`; this phase does not alter production.
- Operational acceptance remains 3/28 passed and 25 pending. Hardware, payments, partner orders, backup/restore, monitoring, legal approval and staff rehearsal still need genuine evidence.
