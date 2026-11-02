# Café 1 — juror voucher scheme: phase 4 workflow and operational acceptance (2 Nov 2026)

## The actual workflow (not a community juror or feedback scheme)

1. **Jury Office list**: Court-provided HMCTS Juror IDs are activated by an authorised manager in named batches. Juror ID is the voucher code. Batches have fixed 12-week validity.
2. **Juror enrolment**: Juror reads the opt-in terms, enters ID at /juror, and receives a one-time six-digit PIN shown for 60 seconds. The database stores a hash, not the readable PIN.
3. **Attendance**: Online voucher use may require a 90-second room QR challenge, then ID + PIN verification, subject to the court's attendance procedures.
4. **Ordering**: Jury Only Menu can be browsed with verified ID; voucher spending requires ID + PIN and server-side eligibility checks. Collection or approved court-room delivery only.
5. **Money**: Standard allowance £5.71 on eligible sitting days; unused value never carries forward. The extended £12.17 allowance requires confirmed over-10-hour attendance and manager authorisation. Voucher first, then 10% off eligible FOOD ONLY on any remainder (not drinks). Customer pays the final shortfall.
6. **HMCTS claim**: Report actual redemptions on paid/on-account, non-cancelled, non-refunded orders, not daily allocations. Export voucher reference, date, UK-local time, receipt and amount. Finance / Jury Office review before submission.

This is an operating design pending local HMCTS/Jury Office acceptance; a repository merge does not prove court approval, real wallet activation or a deployed public page.

## Corrected this phase

- **No silent ID truncation**: dashboard reports unique, duplicate and invalid IDs, does not alter malformed references and blocks submissions over 500 IDs.
- **Safe CSV exports**: activation, register and reimbursement CSVs share spreadsheet-safe escaping. Claim export is disabled on load, error or invalid date range; an error is not shown as a clean zero-value claim.
- **UK-local dates**: date selectors and nightly claim dates use Europe/London, including BST boundary. Claim times display London time. Weekends show no estimated sitting-day balance; bank holidays and eligibility remain server-authoritative.
- **Explicit manager role**: four sensitive management server functions now check admin role before invoking existing database RPCs. RLS/RPC checks remain critical.
- **Accurate public instructions**: printable QR posters point at the production URL, not localhost; differentiate ID-only menu access from PIN-secured voucher spending. Juror public content does not assert unverified cloud hosting, active Apple/Google Pay, or application-level MFA.
- **Unit tests**: input invalidity, duplicates, batch-limit visibility, calendar date validation and BST/UTC transitions.

## Current limitations

- Application helper requireManagerMfa is currently a no-op because the owner previously disabled step-up MFA. Do not claim app-level MFA is active. Historical SQL may enforce AAL2 independently for specific RPCs. Test the actual live database with a manager account; reinstatement requires owner approval, enrolment, recovery and end-to-end tests.
- The /juror page remains behind a courtesy shared-password gate. The printed QR leads there, and staff must distribute authorised access details. That gate is not financial authentication.
- No new SQL migration and no live deployment are included. Check migration status, production release drift, payment acceptance, approved court operating procedure and local device readiness separately.
- No real HMCTS Juror IDs, PINs, or trial information should be stored in source fixtures, issue comments or screenshots.

## Pre-launch acceptance matrix

| Area | Checks |
|---|---|
| Bulk activation | 1 / 500 / 501 IDs, malformed IDs, duplicates, missing date, manager vs staff |
| PIN | One-time reveal, retry lock, lost PIN, reset audit, expired or deactivated voucher |
| Attendance | Authorised QR creation, 90-second expiry, consumed or wrong-room challenge |
| Checkout | Split payments, multiple daily purchases, £5.71 or approved £12.17 ceiling, food-only extra 10% discount |
| Claims | Paid vs pending vs cancelled/refunded, duplicate prevention, correct London dates, spreadsheet formulas |
| Permissions | Anonymous, juror, staff and manager permissions, RLS and RPC independently |
| Delivery/KDS | Court-approved delivery only, collection, notes, queue and voucher receipt wording |
| Release | Tests and CI at exact SHA, deployed SHA, production smoke, Jury Office signoff |

## Proposed subsequent phases

- Replace the courtesy password gate with a court-approved induction flow while retaining ID+PIN for redemption.
- Add controlled exceptions for incorrectly activated ID, misplaced PIN, disputed attendance and failed orders.
- Match claim exports to externally accepted HMCTS reimbursement records.
- Test voucher/refund reversals with a real till, KDS and payment devices, then capture pilot acceptance.
