import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTabOperator } from "./tab-authorization.server";
import { callOperationsRpc } from "./ops-rpc";

const UnpaidEditLine = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  qty: z.number().int().min(1).max(50),
  unit_price_cents: z.number().int().min(0).max(100000),
  notes: z.string().max(200).default(""),
});

export const getUnpaidOrderForEdit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => z.object({ order_id: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    await requireTabOperator(context);
    const { data: order, error } = await context.supabase.from("orders")
      .select(
        "id,order_number,created_at,updated_at,status,source,pos_terminal,customer_name,account_id,payment_status,payment_method,subtotal_cents,total_cents,delivery_notes,notes_manual,refunded_cents,voucher_cents,refunded_cents,sumup_transaction_id,sumup_checkout_id",
      )
      .eq("id", data.order_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Order not found or access not granted");
    if (order.payment_status !== "on_account" && order.payment_status !== "pending") {
      throw new Error("This order is already settled. Open its original receipt for a refund or formal correction.");
    }
    const { data: lines, error: linesError } = await context.supabase.from("order_items")
      .select("id,name,qty,notes,unit_price_cents,category_label")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });
    if (linesError) throw new Error(linesError.message);
    const external = ["sumup_pos", "deliveroo", "just_eat", "uber_eats", "tgtg"].includes(order.source);
    return {
      order: {
        id: order.id,
        number: order.order_number,
        created_at: order.created_at,
        updated_at: order.updated_at,
        status: order.status,
        source: order.source,
        side: order.pos_terminal,
        customer_name: order.customer_name,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        account_id: order.account_id,
        subtotal_cents: order.subtotal_cents,
        total_cents: order.total_cents,
        notes: order.delivery_notes ?? "",
        can_edit: !external && order.status !== "cancelled" &&
          order.status !== "refunded" && order.refunded_cents === 0 &&
          order.voucher_cents === 0 && !order.sumup_transaction_id &&
          !order.sumup_checkout_id,
        reason_locked: external
          ? "SumUp POS / marketplace orders must be changed in the original provider first. Do not rewrite the Café 1 tab amount independently."
          : "An existing payment, refund or voucher may prevent editing.",
      },
      lines: (lines ?? []).map((line) => ({
        id: line.id,
        name: line.name,
        qty: line.qty,
        notes: line.notes ?? "",
        unit_price_cents: line.unit_price_cents,
        category: line.category_label,
      })),
    };
  });

export const amendUnpaidOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => z.object({
    order_id: z.string().uuid(),
    expected_updated_at: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(4).max(220),
    notes: z.string().max(500),
    reopen_kitchen: z.boolean().default(false),
    items: z.array(UnpaidEditLine).min(1).max(60),
  }).parse(value))
  .handler(async ({ data, context }) => {
    await requireTabOperator(context);
    const result = await callOperationsRpc<{
      order_id: string;
      order_number: number;
      previous_total_cents: number;
      total_cents: number;
      payment_status: string;
      status: string;
      updated_at: string;
    }>(context.supabase, "cafe1_amend_unpaid_order", {
      _order_id: data.order_id,
      _expected_updated_at: data.expected_updated_at,
      _reason: data.reason,
      _items: data.items,
      _notes: data.notes,
      _reopen_kitchen: data.reopen_kitchen,
    });
    return result;
  });

/** Finance-side list includes *completed* unpaid orders hidden from the KDS. */
export const listEditableUnpaidOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => z.object({
    q: z.string().trim().max(80).optional(),
    finished_only: z.boolean().optional(),
  }).parse(value ?? {}))
  .handler(async ({ data, context }) => {
    await requireTabOperator(context);
    const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    let query = context.supabase.from("orders")
      .select("id,order_number,created_at,status,source,customer_name,payment_status,total_cents,account_id,pos_terminal")
      .in("payment_status", ["on_account", "pending"])
      .not("status", "in", '("cancelled","refunded")')
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(250);
    if (data.finished_only) query = query.in("status", ["completed", "delivered", "ready"]);
    const { data: orders, error } = await query;
    if (error) throw new Error(error.message);
    const term = (data.q ?? "").toLowerCase();
    return (orders ?? [])
      .filter((order) =>
        !term ||
        String(order.order_number).includes(term) ||
        order.customer_name.toLowerCase().includes(term),
      )
      .map((order) => ({
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        source: order.source,
        created_at: order.created_at,
        payment_status: order.payment_status,
        customer_name: order.customer_name,
        total_cents: order.total_cents,
        account_id: order.account_id,
        side: order.pos_terminal,
      }));
  });
