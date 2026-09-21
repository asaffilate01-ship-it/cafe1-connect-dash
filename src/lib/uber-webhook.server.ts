/** Applies Uber Direct delivery updates to our order + live tracking rows. */

export type UberUpdate = {
  deliveryId: string;
  status?: string | null;
  trackingUrl?: string | null;
  courierName?: string | null;
  location?: { lat: number; lng: number } | null;
};

/** Uber status → our own order status, when it should move the order on. */
function orderStatusFor(status: string | null | undefined) {
  switch ((status ?? "").toLowerCase()) {
    case "pickup_complete":
    case "dropoff":
      return "out_for_delivery" as const;
    case "delivered":
      return "delivered" as const;
    default:
      return null;
  }
}

export async function applyUberDeliveryUpdate(update: UberUpdate) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, status")
    .eq("courier_external_id", update.deliveryId)
    .maybeSingle();
  if (!order) return { ok: false as const, reason: "Unknown delivery" };

  const patch: Record<string, unknown> = {};
  if (update.status) patch["courier_status"] = update.status;
  if (update.trackingUrl) patch["courier_tracking_url"] = update.trackingUrl;
  const next = orderStatusFor(update.status);
  if (next && order.status !== "cancelled" && order.status !== "refunded") {
    patch["status"] = next;
    if (next === "delivered") patch["delivered_at"] = new Date().toISOString();
  }
  if (Object.keys(patch).length) {
    await supabaseAdmin.from("orders").update(patch).eq("id", order.id);
  }

  if (update.location) {
    await supabaseAdmin.from("driver_locations").upsert(
      {
        order_id: order.id,
        driver_id: null,
        courier_name: update.courierName ?? "Uber courier",
        lat: update.location.lat,
        lng: update.location.lng,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "order_id" },
    );
  }

  return { ok: true as const };
}
