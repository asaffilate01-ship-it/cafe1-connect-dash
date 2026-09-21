import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sumup-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            id?: string;
            checkout_reference?: string;
          };
          const checkoutId = body.id;
          const reference = body.checkout_reference;
          if (!checkoutId && !reference) return new Response("bad", { status: 400 });

          const { getSumUpCheckout } = await import("@/lib/sumup.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Never trust the webhook body: always re-verify against SumUp.
          // Resolve the checkout id from our own record when it isn't supplied.
          let resolvedId = checkoutId;
          if (!resolvedId && reference) {
            const { data: ord } = await supabaseAdmin
              .from("orders")
              .select("sumup_checkout_id")
              .eq("sumup_reference", reference)
              .maybeSingle();
            resolvedId = ord?.sumup_checkout_id ?? undefined;
          }
          if (!resolvedId) return new Response("unknown checkout", { status: 404 });

          const c = await getSumUpCheckout(resolvedId);
          const paid = c.status === "PAID";
          const txId = c.transaction_id;
          // Only act on a confirmed PAID result; ignore anything else so a
          // spoofed call can never downgrade or cancel a real order.
          if (!paid) return Response.json({ ok: true, ignored: true });
          // Payment lands the order in "paid" (awaiting staff acceptance).
          // Staff accept from the Admin dashboard, which advances to "preparing".
          const patch = {
            payment_status: "paid" as const,
            // Auto-accept website orders straight into the kitchen
            status: "preparing" as const,
            sumup_transaction_id: txId ?? null,
          };
          const q = supabaseAdmin
            .from("orders")
            .update(patch)
            .eq("status", "pending_payment");
          const { error } = reference
            ? await q.eq("sumup_reference", reference).select("id")
            : await q.eq("sumup_checkout_id", resolvedId).select("id");
          if (error) console.error("[sumup-webhook] update", error);

          // Loyalty points/stamps are only granted on a confirmed payment.
          const { data: paidRows } = reference
            ? await supabaseAdmin.from("orders").select("id").eq("sumup_reference", reference)
            : await supabaseAdmin.from("orders").select("id").eq("sumup_checkout_id", resolvedId);
          const { awardLoyaltyForOrder } = await import("@/lib/loyalty.server");
          const { sendOrderReceipt } = await import("@/lib/order-receipt.server");
          const { dispatchUberForOrder } = await import("@/lib/uber-dispatch.server");
          for (const r of paidRows ?? []) {
            await awardLoyaltyForOrder(r.id);
            // Receipt is idempotent; a webhook retry never double-sends.
            await sendOrderReceipt(r.id);
            // Outside our own half-mile radius, Uber does the last mile.
            await dispatchUberForOrder(r.id).catch(() => null);
          }

          return Response.json({ ok: true });
        } catch (err) {
          console.error("[sumup-webhook]", err);
          return new Response("err", { status: 500 });
        }
      },
    },
  },
});