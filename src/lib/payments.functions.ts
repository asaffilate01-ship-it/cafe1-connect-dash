import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Re-verifies a checkout with SumUp. Calls are rate-limited and every amount,
 * currency and checkout reference must match our immutable order record.
 */
export const confirmPayment = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        tracking_token: z.string().min(32).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { checkThrottle, recordAttempt, requestIdentity } = await import("./rate-limit.server");
    const identity = requestIdentity();
    const gate = await checkThrottle("payment", identity);
    if (!gate.allowed) throw new Error(gate.message ?? "Too many payment checks");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, customer_id, tracking_token_hash, created_at, payment_status, total_cents, sumup_checkout_id, sumup_reference, sumup_transaction_id",
      )
      .eq("id", data.order_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) {
      await recordAttempt("payment", identity, false);
      throw new Error("Order not found");
    }
    const { canAccessPublicOrder } = await import("./order-access.server");
    if (!(await canAccessPublicOrder(order, data.tracking_token))) {
      await recordAttempt("payment", identity, false);
      throw new Error("Order not found");
    }
    if (order.payment_status === "paid" || order.payment_status === "on_account") {
      await recordAttempt("payment", identity, true);
      return { paid: true, status: order.payment_status };
    }
    if (!order.sumup_checkout_id) {
      await recordAttempt("payment", identity, false);
      return { paid: false, status: order.payment_status };
    }

    const { getSumUpCheckout } = await import("./sumup.server");
    const checkout = await getSumUpCheckout(order.sumup_checkout_id);
    const matches =
      checkout.id === order.sumup_checkout_id &&
      checkout.checkout_reference === order.sumup_reference &&
      checkout.currency === "GBP" &&
      Math.round(Number(checkout.amount) * 100) === order.total_cents;
    if (!matches) {
      await recordAttempt("payment", identity, false);
      throw new Error("Payment verification did not match this order");
    }
    const providerStatus = checkout.status.trim().toUpperCase();
    if (providerStatus === "FAILED") {
      await recordAttempt("payment", identity, true);
      return { paid: false, status: "failed" as const, provider_status: providerStatus };
    }
    if (providerStatus !== "PAID") {
      await recordAttempt("payment", identity, true);
      return { paid: false, status: "pending" as const, provider_status: providerStatus };
    }
    if (!checkout.transaction_id) throw new Error("SumUp transaction ID is missing");

    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "paid",
        status: "preparing",
        sumup_transaction_id: checkout.transaction_id,
      })
      .eq("id", order.id)
      .eq("payment_status", "pending");
    if (updateError) throw new Error(updateError.message);
    const { awardLoyaltyForOrder } = await import("./loyalty.server");
    await awardLoyaltyForOrder(order.id);
    await recordAttempt("payment", identity, true);
    return { paid: true, status: "preparing" as const, provider_status: providerStatus };
  });

/**
 * Manager-only refund ledger with partial-refund accounting and idempotency.
 * Provider calls happen once; the database then atomically posts the result.
 */
export const refundOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        amount_cents: z.number().int().positive().optional(),
        reason: z.string().min(5).max(300),
        idempotency_key: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Manager approval required");
    const { requireManagerMfa } = await import("./elevated-auth.server");
    requireManagerMfa(context.claims);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prior } = await supabaseAdmin
      .from("order_refunds")
      .select("id, amount_cents, status")
      .eq("idempotency_key", data.idempotency_key)
      .maybeSingle();
    if (prior?.status === "succeeded") {
      return { ok: true, amount_cents: prior.amount_cents, note: "Refund already processed" };
    }
    if (prior?.status === "pending") throw new Error("That refund is already processing");

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, total_cents, refunded_cents, payment_status, payment_method, source, sumup_checkout_id, sumup_transaction_id",
      )
      .eq("id", data.order_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Order not found");
    if (!["paid", "refunded", "on_account"].includes(order.payment_status)) {
      throw new Error("Only a settled order can be refunded");
    }
    const remaining = order.total_cents - order.refunded_cents;
    if (remaining <= 0) throw new Error("Order is already fully refunded");
    const amount = data.amount_cents ?? remaining;
    if (amount > remaining) throw new Error("Refund exceeds the remaining paid amount");

    const [{ data: attempt }, { data: tenders }, { data: previousRefunds }] = await Promise.all([
      supabaseAdmin
        .from("payment_attempts")
        .select("provider_transaction_id")
        .eq("order_id", order.id)
        .in("status", ["paid", "used"])
        .limit(1)
        .maybeSingle(),
      supabaseAdmin.from("order_payments").select("method, amount_cents").eq("order_id", order.id),
      supabaseAdmin
        .from("order_refunds")
        .select("card_amount_cents, cash_amount_cents")
        .eq("order_id", order.id)
        .eq("status", "succeeded"),
    ]);
    const providerTransactionId =
      attempt?.provider_transaction_id ??
      (order.sumup_checkout_id || order.source === "sumup_pos" ? order.sumup_transaction_id : null);

    let paidCard = (tenders ?? [])
      .filter((payment) => payment.method === "card")
      .reduce((sum, payment) => sum + payment.amount_cents, 0);
    let paidCash = (tenders ?? [])
      .filter((payment) => payment.method === "cash")
      .reduce((sum, payment) => sum + payment.amount_cents, 0);
    if (paidCard === 0 && paidCash === 0) {
      if (order.payment_method === "cash") paidCash = order.total_cents;
      else if (order.payment_method === "card") paidCard = order.total_cents;
    }
    const refundedCard = (previousRefunds ?? []).reduce(
      (sum, refund) => sum + refund.card_amount_cents,
      0,
    );
    const refundedCash = (previousRefunds ?? []).reduce(
      (sum, refund) => sum + refund.cash_amount_cents,
      0,
    );
    const { allocateRefund } = await import("./refund-allocation");
    const { cardCents: cardAmount, cashCents: cashAmount } = allocateRefund({
      amountCents: amount,
      paidCardCents: paidCard,
      paidCashCents: paidCash,
      refundedCardCents: refundedCard,
      refundedCashCents: refundedCash,
    });

    const { data: refundRow, error: reserveError } = await supabaseAdmin.rpc(
      "reserve_order_refund",
      {
        _order_id: order.id,
        _idempotency_key: data.idempotency_key,
        _amount_cents: amount,
        _card_amount_cents: cardAmount,
        _cash_amount_cents: cashAmount,
        _reason: data.reason,
        _requested_by: context.userId,
        _provider: (providerTransactionId && cardAmount > 0 ? "sumup" : null) as unknown as string,
        _provider_transaction_id: (providerTransactionId && cardAmount > 0
          ? providerTransactionId
          : null) as unknown as string,
      },
    );
    if (reserveError) throw new Error(reserveError.message);
    if (!refundRow) throw new Error("Could not reserve that refund");
    if (refundRow.status === "failed") {
      throw new Error("That refund attempt failed previously; start a new refund");
    }

    let note = "Refund recorded for manual settlement";
    let providerRefunded = false;
    try {
      if (providerTransactionId && cardAmount > 0) {
        const { refundSumUpTransaction } = await import("./sumup.server");
        await refundSumUpTransaction(
          providerTransactionId,
          refundedCard === 0 && cardAmount === paidCard ? undefined : cardAmount,
        );
        providerRefunded = true;
        note =
          cashAmount > 0
            ? `Refunded ${cardAmount}p to SumUp and allocated ${cashAmount}p to cash`
            : amount < remaining
              ? "Partial refund sent to SumUp"
              : "Full refund sent to SumUp";
      } else if (cashAmount > 0) {
        note = "Cash refund posted to the till ledger";
      }
      const { error: completeError } = await supabaseAdmin.rpc("complete_order_refund", {
        _refund_id: refundRow.id,
      });
      if (completeError) throw new Error(completeError.message);
      return { ok: true, amount_cents: amount, note };
    } catch (refundError) {
      await supabaseAdmin
        .from("order_refunds")
        .update({
          // A successful provider call must remain pending for reconciliation;
          // marking it failed would allow a second external refund.
          status: providerRefunded ? "pending" : "failed",
          failure_reason:
            refundError instanceof Error ? refundError.message.slice(0, 500) : "Refund failed",
        })
        .eq("id", refundRow.id);
      throw refundError;
    }
  });

/**
 * Public wallet config. The Google Pay merchant ID is not a secret (it is sent
 * to the browser by design) but is stored server-side so it can be set without
 * a rebuild.
 */
export const getWalletConfig = createServerFn({ method: "GET" }).handler(async () => {
  return {
    googlePayMerchantId: (process.env["GOOGLE_PAY_MERCHANT_ID"] ?? "").trim() || null,
  };
});
