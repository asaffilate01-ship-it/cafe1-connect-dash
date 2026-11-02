# SumUp POS checkout notes → Café 1 KDS

## What the kitchen must see

- **Add order note:** show the instruction prominently in the amber NOTE strip on the whole KDS ticket.
- **Item note:** show a high-contrast **ITEM NOTE** immediately underneath its item, with new lines preserved.
- Edits received after a ticket was first imported must update the same ticket (never create another one).
- The local KDS edit dialogue remains the fallback for urgent allergy or preparation instructions.

## Code path

1. `syncSumupPos` reads SumUp payment history, details, receipt products and (where supported) a separate POS sale response.
2. `readSumupPosSaleNotes` recognises order-level fields (`order_note`, `orderNote`, `note`, etc.) and basket-item fields (`item_note`, `itemNote`, `specialInstructions`, `modifiers`, etc.). A sale with a `name` is **not** mistaken for a basket item.
3. `orders.delivery_notes` and `order_items.notes` hold these instructions. Repeat imports backfill late-arriving notes without overriding an order that staff manually corrected (`notes_manual`).
4. `/kds` reads both columns and responds to order/item table changes. Order note updates apply to live ticket state even when the realtime event also carries a status.

## Provider limitation — must verify against the actual till

**SumUp's public payment transaction and receipt API schemas do not guarantee POS checkout order-note or item-note fields.** A sale can therefore import correctly, with its payment and basket, **while the POS-specific notes are absent from every response available to this integration**. A KDS UI change cannot recover data that SumUp has not supplied.

The optional POS sale endpoint is best effort and is not a documented substitute for a merchant's approved POS order-data integration. Do not assume a merchant API key or `transactions.read` automatically grants access to POS checkout notes. If a controlled live POS transaction has order/item notes but no notes reach the database, confirm with SumUp which *POS product and API/order feed* exposes those note fields for this merchant. A validated partner API feed or bridge is needed to provide full coverage; do not use unsupported endpoints or log complete order payloads in production.

## Acceptance test on staging

1. On the **actual SumUp POS** create a paid sale with two different food items. Set **Add order note** to `ALLERGY: sesame — ask chef` and **item note** on only the first item to `No tomato — separate board`.
2. Confirm the sale appears once on `/kds`. Check the **amber order NOTE** and the **ITEM NOTE** under the *first item only*, not under the second.
3. Amend a note while its ticket is active, if the POS exposes live amendments. Confirm it updates on the same card after sync, without manually refreshing. Verify the manual KDS correction survives the next POS sweep.
4. Test two lines of the **same named item with different notes**, split cash/card payment, open tabs, and delayed basket arrival. No note may be silently assigned to the wrong food line.
5. If either note is missing, check the provider response shape with authorised, redacted diagnostics. **Do not treat CI or a GitHub merge as proof of a live SumUp note feed.** Continue using the KDS edit dialogue to protect kitchen staff until the POS feed is confirmed.

Official references:
- https://developer.sumup.com/api/transactions/get/
- https://developer.sumup.com/api/receipts/get/
- https://help.sumup.com/en-GB/sections/7JoiWk5nzf9tdJsBxbkQeN-pos-lite
