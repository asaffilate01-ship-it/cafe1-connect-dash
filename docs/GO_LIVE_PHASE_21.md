# Phase 21: confirmed trading rules, juror hardening and release unblock

## Implemented

- Removed the generated duplicate Phase 19 migration that blocked Production checks. The canonical descriptive migration remains unchanged.
- Enforced Monday-Friday 08:00-17:00 for dine-in, pickup and takeaway.
- Enforced Monday-Friday 08:30-16:30 delivery, from AL1 3JU, capped at 805 metres (half a mile).
- Closed Saturdays, Sundays and configured England/Wales bank holidays; published 2027 and 2028 dates are seeded.
- Recorded that Cafe 1 is not currently VAT registered and stopped customer terms from suggesting that VAT is charged.
- Restricted trading-rule edits to managers with an AAL2 session.
- Made the HMCTS Juror ID the voucher code, fixed activation at 12 calendar weeks and disabled separate generated-code batches.
- Rotated a reused Juror ID's PIN/opt-in state, required daily attendance proof for online redemption and retained manager+AAL2 controls for activation, extension and allowance uplift.
- Made server-side delivery validation fail closed when Maps or business settings are unavailable.
- Made the production environment validator require the exact email and Maps credentials used by the live application.

## Confirmed operating contract

| Service                      | Days                             | Hours         | Additional rule                                                |
| ---------------------------- | -------------------------------- | ------------- | -------------------------------------------------------------- |
| Dine-in, pickup and takeaway | Monday-Friday                    | 08:00-17:00   | Closed weekends and bank holidays                              |
| Delivery                     | Monday-Friday                    | 08:30-16:30   | Maximum 805 metres from AL1 3JU                                |
| Juror standard allowance     | Weekdays excluding bank holidays | Daily         | £5.71; no carry-over; Juror ID is voucher code; valid 12 weeks |
| Juror extended day           | Approved date only               | Over 10 hours | £12.17; manager MFA and audit reason required                  |

## Deployment sequence

1. Merge only after Production checks passes Application plus Supabase migrations/pgTAP.
2. Apply the new forward-only migration to production Supabase.
3. Configure every required production variable and set `PUBLIC_RELEASE_SHA` to the final merged commit, not the PR commit.
4. Deploy that exact commit and run Production smoke, browser journeys and Release candidate evidence.
5. Record real payment, hardware, restore, HMCTS/privacy and staff-rehearsal evidence. These cannot be completed by source code.

## Required host secrets

- Supabase public/server URLs and keys
- `PUBLIC_APP_URL` and exact `PUBLIC_RELEASE_SHA`
- SumUp API and merchant credentials
- Google Pay merchant ID
- `CRON_SECRET`
- `REQUIRE_ADMIN_MFA=true`
- Lovable connector, Resend and server-side Google Maps keys

Apple Pay domain verification remains a provider/domain step. The association file must be publicly reachable at `/.well-known/apple-developer-merchantid-domain-association` without a `.txt` suffix.
