import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertOperator(context: { supabase: any; userId: string }) {
  const [{ data: isAdmin }, { data: isStaff }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "staff" }),
  ]);
  if (!isAdmin && !isStaff) throw new Error("Staff access is required");
}

/** Manually book (or re-try) an Uber courier for an order. */
export const dispatchUberCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOperator(context as any);
    const { dispatchUberForOrder } = await import("./uber-dispatch.server");
    return dispatchUberForOrder(data.order_id);
  });

/** Cancel a booked Uber courier (e.g. the order was cancelled). */
export const cancelUberCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOperator(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, courier_external_id")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!order?.courier_external_id) return { ok: false as const, reason: "No Uber courier booked" };
    const { cancelDelivery } = await import("./uber-direct.server");
    await cancelDelivery(order.courier_external_id);
    await supabaseAdmin.from("orders").update({ courier_status: "canceled" }).eq("id", order.id);
    return { ok: true as const };
  });

/** Refresh an order's courier status straight from Uber (fallback for webhooks). */
export const refreshUberCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOperator(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, courier_external_id")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!order?.courier_external_id) return { ok: false as const, reason: "No Uber courier booked" };
    const { getDelivery } = await import("./uber-direct.server");
    const delivery = await getDelivery(order.courier_external_id);
    const { applyUberDeliveryUpdate } = await import("./uber-webhook.server");
    await applyUberDeliveryUpdate({
      deliveryId: delivery.id,
      status: delivery.status,
      trackingUrl: delivery.tracking_url ?? null,
      courierName: delivery.courier?.name ?? null,
      location: delivery.courier?.location ?? null,
    });
    return { ok: true as const, status: delivery.status };
  });

/** Whether Uber Direct credentials are present (admin UI hint). */
export const uberDirectStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOperator(context as any);
    const { uberDirectConfigured } = await import("./uber-direct.server");
    return {
      configured: uberDirectConfigured(),
      webhook_secret_set: Boolean(process.env["UBER_DIRECT_WEBHOOK_SECRET"]),
    };
  });
