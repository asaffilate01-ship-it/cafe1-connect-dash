/** Applies authenticated Uber Direct updates without status regression. */

import {
  nextOrderStatusFromUber,
  shouldAdvanceCourierStage,
  type CourierOrderProgress,
} from "./courier-dispatch-policy";

export type UberUpdate = {
  deliveryId: string;
  status?: string | null;
  trackingUrl?: string | null;
  courierName?: string | null;
  location?: { lat: number; lng: number } | null;
};

export async function applyUberDeliveryUpdate(update: UberUpdate) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order, error: findError } = await supabaseAdmin
    .from("orders")
    .select("id, status, courier_status")
    .eq("courier_external_id", update.deliveryId)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (!order) return { ok: false as const, reason: "Unknown delivery" };

  // Never revive cancelled, refunded or terminal orders after a delayed
  // provider event. Courier milestones can arrive out of sequence.
  if (["cancelled", "refunded", "completed", "delivered"].includes(order.status)) {
    return { ok: true as const, ignored: true };
  }
  if (update.status && !shouldAdvanceCourierStage(order.courier_status, update.status)) {
    return { ok: true as const, ignored: true };
  }

  const next = nextOrderStatusFromUber(order.status as CourierOrderProgress, update.status);
  const patch: {
    courier_status?: string;
    courier_error?: string | null;
    courier_tracking_url?: string;
    status?: "out_for_delivery" | "delivered";
    delivered_at?: string;
  } = {};
  if (update.status) {
    patch.courier_status = update.status;
    if (["canceled", "cancelled", "returned"].includes(update.status.toLowerCase())) {
      patch.courier_error = "Uber courier could not complete delivery — staff review required";
    } else if (update.status.toLowerCase() === "delivered") {
      patch.courier_error = null;
    }
  }
  if (update.trackingUrl) patch.courier_tracking_url = update.trackingUrl;
  if (next) {
    patch.status = next;
    if (next === "delivered") patch.delivered_at = new Date().toISOString();
  }

  if (Object.keys(patch).length) {
    // Constrain by the prior courier state and eligible order states.
    // A delayed pickup webhook cannot move a delivered order backwards;
    // conflicting concurrent writes receive a retry rather than disappearing.
    let query = supabaseAdmin.from("orders").update(patch).eq("id", order.id);
    if (order.courier_status) {
      query = query.eq("courier_status", order.courier_status);
    } else {
      query = query.is("courier_status", null);
    }
    if (next === "out_for_delivery") {
      query = query.in("status", ["preparing", "ready"]);
    } else if (next === "delivered") {
      query = query.in("status", ["preparing", "ready", "out_for_delivery"]);
    } else {
      query = query.eq("status", order.status);
    }

    const { data: saved, error: saveError } = await query.select("id").maybeSingle();
    if (saveError) throw new Error(saveError.message);
    if (!saved) return { ok: false as const, reason: "Concurrent courier status update" };
  }

  const lat = update.location?.lat;
  const lng = update.location?.lng;
  if (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  ) {
    const { error: positionError } = await supabaseAdmin.from("driver_locations").upsert(
      {
        order_id: order.id,
        driver_id: null,
        courier_name: update.courierName ?? "Uber courier",
        lat,
        lng,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "order_id" },
    );
    if (positionError) throw new Error(positionError.message);
  }

  return { ok: true as const };
}
