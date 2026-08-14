# Cafe 1 operational acceptance record

Release commit: ____________________ Date: __________ Release owner: ____________________

Production URL: `https://cafe1stalbans.co.uk`

Complete this record with real evidence. A code build cannot prove payment settlement, physical hardware, staff competence or recoverability.

## Repository and deployment

| Gate                                         | Result        | Evidence URL/reference | Checked by/date |
| -------------------------------------------- | ------------- | ---------------------- | --------------- |
| Production checks — Application              | ☐ Pass ☐ Fail |                        |                 |
| Production checks — Database                 | ☐ Pass ☐ Fail |                        |                 |
| CodeQL                                       | ☐ Pass ☐ Fail |                        |                 |
| Browser journeys — desktop and mobile        | ☐ Pass ☐ Fail |                        |                 |
| Production smoke                             | ☐ Pass ☐ Fail |                        |                 |
| Scheduled production smoke                   | ☐ Pass ☐ Fail |                        |                 |
| Release Candidate Evidence artifact retained | ☐ Yes ☐ No    |                        |                 |
| Release tag and rollback commit recorded     | ☐ Yes ☐ No    |                        |                 |

## Payments and reconciliation

| Scenario                       | Expected evidence                                | Result        | Reference/operator/date |
| ------------------------------ | ------------------------------------------------ | ------------- | ----------------------- |
| Low-value website SumUp charge | Order, provider transaction and receipt agree    | ☐ Pass ☐ Fail |                         |
| Physical reader charge         | Till order, reader and settlement agree          | ☐ Pass ☐ Fail |                         |
| Declined/cancelled charge      | No paid KDS ticket; reserved voucher released    | ☐ Pass ☐ Fail |                         |
| Cash, voucher and split tender | Till totals and tender report agree              | ☐ Pass ☐ Fail |                         |
| Partial and remaining refund   | Refund never exceeds captured amount             | ☐ Pass ☐ Fail |                         |
| Duplicate submit/retry         | One order, charge, refund and loyalty award only | ☐ Pass ☐ Fail |                         |
| End-of-day reconciliation      | Till, SumUp and settlement export agree          | ☐ Pass ☐ Fail |                         |

## Hardware and service flow

| Gate                                               | Result        | Evidence/reference | Checked by/date |
| -------------------------------------------------- | ------------- | ------------------ | --------------- |
| Receipt printer                                    | ☐ Pass ☐ Fail |                    |                 |
| Cash drawer                                        | ☐ Pass ☐ Fail |                    |                 |
| Customer display                                   | ☐ Pass ☐ Fail |                    |                 |
| KDS station routing and bump/recovery              | ☐ Pass ☐ Fail |                    |                 |
| Deliveroo accepted order → one KDS ticket + sync   | ☐ Pass ☐ Fail |                    |                 |
| Just Eat accepted order → one KDS ticket + sync    | ☐ Pass ☐ Fail |                    |                 |
| Two-driver claim race                              | ☐ Pass ☐ Fail |                    |                 |
| Delivery, collection, dine-in and jury-room orders | ☐ Pass ☐ Fail |                    |                 |

## Security, recovery and operations

| Gate                                      | Result        | Evidence/reference | Checked by/date |
| ----------------------------------------- | ------------- | ------------------ | --------------- |
| Named accounts and manager MFA/AAL2       | ☐ Pass ☐ Fail |                    |                 |
| Production environment validator          | ☐ Pass ☐ Fail |                    |                 |
| Google browser key rotated/restricted     | ☐ Pass ☐ Fail |                    |                 |
| Supabase backup restored to staging       | ☐ Pass ☐ Fail |                    |                 |
| Scheduler authentication and run history  | ☐ Pass ☐ Fail |                    |                 |
| Email delivery and bounce handling        | ☐ Pass ☐ Fail |                    |                 |
| 5xx, payment-failure and variance alerts  | ☐ Pass ☐ Fail |                    |                 |
| Staff rehearsal and monitored soft launch | ☐ Pass ☐ Fail |                    |                 |

## Approval

Known exceptions and expiry date: ____________________________________________________________

Go-live decision: ☐ Approved ☐ Rejected ☐ Time-limited soft launch only

Operations owner: ____________________ Signature/date: ____________________

Technical owner: _____________________ Signature/date: ____________________
