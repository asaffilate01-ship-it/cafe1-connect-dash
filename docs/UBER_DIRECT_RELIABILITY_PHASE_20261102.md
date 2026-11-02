# Café 1 St Albans — Uber Direct booking safety and webhook acceptance

This phase hardens **existing Uber Direct** dispatch and status ingestion only. It does not grant access to Uber Eats Marketplace, Deliveroo Express or Just Eat Go.

## Core change: a durable single-writer claim

Prior implementation read `courier_external_id` and then called Uber, leaving a race when checkout confirmation, payment webhook and counter staff simultaneously tried to dispatch an order. The new implementation performs a conditional update on the order row *before* the provider call:

- The order must be paid/on-account, directly fulfilled, and in `paid`, `preparing` or `ready`.
- No other courier provider, provider status or external delivery ID may already be present.
- Only one request can transition `courier_provider=NULL, courier_status=NULL` to `courier_provider=uber_direct, courier_status=booking`.
- Rejected claims never send another provider booking.
- A confirmed provider response writes its ID, tracking URL, fee and status, conditional on the original `booking` claim.
- An exception after requesting a booking sets `booking_review` and **does not automatically retry**. A network failure may occur after Uber has already accepted/charged a delivery.

Staff can see courier exceptions on the admin order dashboard. The operator must check Uber Direct and obtain an actual delivery reference or independent confirmation of failure before a manager/database administrator reconciles the row. **Do not simply clear `courier_provider` to retry**. No UI is provided to bypass this gate.

## Webhook controls

- Validate exact-byte HMAC-SHA256 with `x-uber-signature` or `x-postmates-signature` using the configured signing key, before decoding JSON.
- Enforce 128 KiB request limit for declared and actual payload size.
- Reject malformed payloads, invalid coordinates and non-HTTPS/non-Uber tracking URLs.
- Ignore late status changes that would move a delivered, cancelled, refunded or completed order backwards.
- Use conditional database writes to detect concurrent updates and request retry instead of silently losing them.
- Preserve courier exceptions (`returned`, `cancelled`) for manager review.

See the official [Uber Direct webhook documentation](https://developer.uber.com/docs/deliveries/guides/webhooks) for its retry semantics and signature format.

## Acceptance tests to run before production enablement

1. Trigger 10 simultaneous API, webhook and staff dispatch attempts for **one test order** with enabled test credentials. Confirm one Uber booking and at most one charge; other attempts must return already-booked or in-progress.
2. Inject a provider timeout *after* successful booking. Ensure subsequent requests are blocked, a `booking_review` warning appears in Admin, and the Uber portal is checked before reconciliation.
3. Confirm own-delivery radius stays with Cafe 1's driver and marketplace-generated delivery tickets cannot book Uber Direct.
4. Verify exact HMAC passes for raw JSON containing escaped Unicode. Invalid signatures and changed body bytes must return 401.
5. Send oversized JSON, malformed JSON, invalid coordinates, spoofed tracking URLs and unknown delivery IDs.
6. Send `delivered` then delayed `pickup_complete`. Confirm order remains delivered, KDS does not revert, no later GPS update is misrepresented.
7. Cancel a courier and inject a stale pickup notification; verify staff can see an exception.
8. Confirm merchant rate limits, quote/fee reconciliation, courier fees and customer delivery charges, as well as notification privacy and consent.
9. Complete actual mobile and in-store device acceptance with real provider credentials; no claim is made of live activation by CI.

## Release restrictions

No automatic production deployment or provider key change. The last verified live-release-drift report found the public site behind the GitHub release; resolve that separately. Use the operational go-live gates and collect exact-SHA GitHub evidence before switching on real deliveries.
