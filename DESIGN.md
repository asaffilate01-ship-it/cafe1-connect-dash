# Cafe 1 Connect · Design system

## Product identity
Single-merchant Crown Court café storefront, till, kitchen display, juror vouchers, payments, dispatch and management SaaS.

## Existing style
Current src/styles.css uses white/near-black OKLCH surfaces, a restrained warm red primary (oklch 0.55 0.22 27), Fraunces for display and Inter for operations. Protect red warning states and existing court-specific information hierarchy.

## UX commitments
Different ordering modes for jurors, judges, public and staff must be clear. At the till and KDS, queue age, order numbers, preparation states, modifiers and voucher balances take priority over decoration. Large touch targets, rapid order recall, no hidden fees or invented payment confirmation.

- Public discovery: intentional layout, persuasive but verified copy, clear entry to real product functions; no generic AI template stacks.
- Staff/operations: legible, precise timestamp/actor/status, fast task resolution, confirmation of destructive and payment changes, recoverable forms.
- Preserve route navigation, business logic, permissions and integration states. New design is not evidence that a supplier/payment/booking is working.
- Responsive 360/390/768/1440px; visible keyboard focus, 200% zoom, screen readers, semantic headings, contrast, reduced motion and manageable touch targets.
- Render and assess loading, empty, validation, error, offline, status conflict and role-denied cases, not just successful screenshots.

## Design-source playbook
- [Taste Skill](https://github.com/Leonxlnx/taste-skill): define signature art direction for the brand and review real browser screenshots.
- [Impeccable](https://github.com/pbakaus/impeccable): use critique/audit/harden/polish; non-blocking source check `npx --yes impeccable@4.8.0 detect src/`.
- [Awesome DESIGN.md](https://github.com/VoltAgent/awesome-design-md): use as an example of documenting proprietary tokens and interaction patterns, not as a borrowed trademarked theme.

## Done
Pass existing lint/build/tests, real mobile/desktop and keyboard acceptance, content accuracy, role constraints and relevant transaction tests. Advisory detector findings must be triaged but do not override product judgement.
