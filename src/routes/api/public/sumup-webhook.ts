import { createFileRoute } from "@tanstack/react-router";
import { sumupCheckoutMatchesOrder } from "@/lib/sumup-verification";

const MAX_PAYLOAD_BYTES = 16_384;

export const Route = createFileRoute("/api/public/sumup-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const declaredLength = Number(request.headers.get("content-length") ?? 0);
          if (declaredLength > MAX_PAYLOAD_BYTES) {
            return new Response("payload too large", { status: 413 });
          }
          const raw = await request.text();
          if (new TextEncoder().encode(raw).byteLength > MAX_PAYLOAD_BYTES) {
            return new Response("payload too large", { status: 413 });
          }
          let body: { id?: unknown; checkout_reference?: unknown };
          try {
            body = JSON.parse(raw) as { id?: unknown; checkout_reference?: unknown };
          } catch {
            return new Response("invalid payload", { status: 400 });
          }
          const checkoutId =
            typeof body?.id === "string" && body.id.length <= 128 ? body.id.trim() : null;
          const reference =
            typeof body?.checkout_reference === "string" &&
            body.checkout_reference.length <= 160
              ? body.checkout_reference.trim()
              : null;
          if (!checkoutId && !reference) return new Response("bad request", { status: 400 });

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // Resolve exactly ONE order by the checkout ID we created, falling
          // back to our stored reference. Never use untrusted body fields to
          // select a different order after verifying some other transaction.
          const query = supabaseAdmin
            .from("orders")
            .select(
              "id, total_cents, sumup_checkout_id, sumup_reference, sumup_transaction_id, payment_status, status",
            );
          const { data: order, error: lookupError } = checkoutId
            ? await query.eq("sumup_checkout_id", checkoutId).maybeSingle()
            : await query.eq("sumup_reference", reference!).maybeSingle();
          if (lookupError) throw new Error(lookupError.message);
          if (!order) return new Response("unknown checkout", { status: 404 });
          if (
            (checkoutId && order.sumup_checkout_id !== checkoutId) ||
            (reference && order.sumup_reference !== reference) ||
            !order.sumup_checkout_id
          ) {
            return new Response("checkout mismatch", { status: 409 });
          }

          const { getSumUpCheckout } = await import("@/lib/sumup.server");
          const checkout = await getSumUpCheckout(order.sumup_checkout_id);
          if (!sumupCheckoutMatchesOrder(order, checkout)) {
            console.error("[sumup-webhook] provider/order identity mismatch", order.id);
            return new Response("checkout mismatch", { status: 409 });
          }
          if (checkout.status.trim().toUpperCase() !== "PAID") {
            return Response.json({ ok: true, ignored: true });
          }
          if (!checkout.transaction_id) {
            return new Response("missing transaction reference", { status: 503 });
          }

          if (order.payment_status === "pending") {
            // Update only a genuinely pending checkout; a webhook replay must
            // never revive a cancelled, refunded or already-fulfilled order.
            const { error: updateError } = await supabaseAdmin
              .from("orders")
              .update({
                payment_status: "paid",
                status: "preparing",
                sumup_transaction_id: checkout.transaction_id,
              })
              .eq("id", order.id)
              .eq("payment_status", "pending")
              .eq("status", "pending_payment");
            if (updateError) throw new Error(updateError.message);
          }

          // Refetch after the conditional update to detect competing callbacks
          // and refuse to issue a receipt for an unverified/local-only status.
          const { data: settled, error: settlementError } = await supabaseAdmin
            .from("orders")
            .select("id,payment_status,sumup_transaction_id")
            .eq("id", order.id)
            .maybeSingle();
          if (settlementError) throw new Error(settlementError.message);
          if (
            settled?.payment_status !== "paid" ||
            settled.sumup_transaction_id !== checkout.transaction_id
          ) {
            return new Response("settlement not applied", { status: 409 });
          }

          const { awardLoyaltyForOrder } = await import("@/lib/loyalty.server");
          const { sendOrderReceipt } = await import("@/lib/order-receipt.server");
          const { dispatchUberForOrder } = await import("@/lib/uber-dispatch.server");
          await awardLoyaltyForOrder(order.id);
          await sendOrderReceipt(order.id);
          // Dispatch failures are tracked against the order for staff review.
          await dispatchUberForOrder(order.id).catch((error) => {
            console.error("[sumup-webhook] courier dispatch failed", error);
          });
          return Response.json({ ok: true });
        } catch (err) {
          console.error("[sumup-webhook] processing failed", err);
          return new Response("temporary error", { status: 503 });
        }
      },
    },
  },
});
