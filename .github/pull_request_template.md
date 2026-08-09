## What changed

<!-- Describe the customer, till, database or operational change. -->

## Go-live impact

- [ ] No production behaviour changes
- [ ] Database migration included and forward-only
- [ ] Production secrets/configuration must change
- [ ] Till, payment, voucher, KDS or delivery behaviour changes
- [ ] Legal, privacy, retention or HMCTS review is required

## Validation

- [ ] `npm run release:guard`
- [ ] `npm run check`
- [ ] Supabase migration and pgTAP job
- [ ] Browser journeys where the UI changed
- [ ] No secrets, juror credentials or customer data added

## Release evidence

Final merged SHA: <!-- Set PUBLIC_RELEASE_SHA to this exact commit after merge. -->

Rollback commit/tag: <!-- Required before production promotion. -->

Operational evidence/reference: <!-- Real payment/hardware/recovery evidence, when applicable. -->
