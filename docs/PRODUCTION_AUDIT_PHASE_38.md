# Production audit — Phase 38

Date: 2026-08-15

## Scope

This phase continues the Phase 37 release candidate with code-controlled launch improvements only. It does not deploy production or mark physical operational acceptance gates as passed.

## Changes

- Reduced the iTechLounge footer image source from 1,080,078 bytes at 1254×1254 to a 112×112 optimized source, with a 3.3 KiB WebP used by the site.
- Added explicit image dimensions, lazy loading and asynchronous decoding to the footer credit image.
- Extended the bundle budget to reject any generated image over 200 KiB and to inspect the full public build tree.
- Added revalidation headers for `/sw.js` and `/manifest.webmanifest` so browsers and CDNs discover release updates at their stable URLs.
- Extended build-output tests to require those mutable PWA headers in the generated deployment configuration.

## Release position

- Software changes remain reviewable on the Phase 37 pull request branch.
- Production remains unchanged until the candidate is reviewed, merged and deliberately deployed.
- Hardware, payment, printer, drawer, kitchen, staff-training and supplier acceptance gates still require real-world evidence.
