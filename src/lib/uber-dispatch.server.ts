/**
 * Books an Uber Direct courier for delivery orders that fall outside our own
 * driver's half-mile radius. Server only.
 */
import { NAP } from "./nap";
import type { UberAddress } from "./uber-direct.server";

export type DispatchResult =
  | { ok: true; delivery_id: string; tracking_url?: string | null; fee_cents?: number | null }
  | { ok: false; reason: string; retryable?: boolean };

const PICKUP_ADDRESS: UberAddress = {
  street_address: [NAP.streetAddress],
  city: NAP.addressLocality,
  state: NAP.addressRegion,
  zip_code: NAP.postalCode,
  country: "GB",
};

/**
 * Decides whether an order should be fulfilled by Uber and, when it should,
 * books the courier. Safe to call more than once — it no-ops when a courier
 * has already been booked.
 */
export async function dispatchUberForOrder(orderId: string): Promise<DispatchResult> {
  const { uberDirectConfigured, createDelivery } = await import("./uber-direct.server");
  if (!uberDirectConfigured()) return { ok: false, reason: "Uber Direct is not configured" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, type, status, payment_status, customer_name, customer_phone, address_line1, address_line2, city, postcode, company_name, delivery_notes, total_cents, courier_external_id",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, reason: "Order not found" };
  if (order.courier_external_id) {
    return { ok: true, delivery_id: order.courier_external_id };
  }
  if (order.type !== "delivery") return { ok: false, reason: "Not a delivery order" };
  if (order.payment_status !== "paid" && order.payment_status !== "on_account") {
    return { ok: false, reason: "Order is not paid", retryable: true };
  }
  if (!order.postcode) return { ok: false, reason: "No delivery postcode on the order" };

  const { data: settings } = await supabaseAdmin
    .from("business_settings")
    .select(
      "delivery_origin_postcode, delivery_radius_m, uber_direct_enabled, uber_direct_max_radius_m, uber_direct_test_mode, prep_minutes",
    )
    .limit(1)
    .maybeSingle();
  if (!settings?.uber_direct_enabled) return { ok: false, reason: "Uber fulfilment is switched off" };

  const { geocodePostcode, distanceMeters } = await import("./delivery.server");
  const [origin, dest] = await Promise.all([
    geocodePostcode(settings.delivery_origin_postcode),
    geocodePostcode(order.postcode),
  ]);
  if (!origin || !dest) return { ok: false, reason: "Could not locate the delivery postcode", retryable: true };
  const distance = Math.round(distanceMeters(origin, dest));
  const ownRadius = Math.min(settings.delivery_radius_m ?? 805, 805);
  if (distance <= ownRadius) return { ok: false, reason: "Inside our own delivery radius" };
  if (distance > (settings.uber_direct_max_radius_m ?? 8000)) {
    return { ok: false, reason: "Beyond the Uber delivery limit" };
  }

  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("name, qty, unit_price_cents")
    .eq("order_id", order.id);

  const dropoff: UberAddress = {
    street_address: [order.address_line1 ?? "", order.address_line2 ?? ""].filter(Boolean),
    city: order.city || "St Albans",
    state: "Hertfordshire",
    zip_code: order.postcode,
    country: "GB",
  };
  if (dropoff.street_address.length === 0) {
    return { ok: false, reason: "No street address on the order" };
  }

  const notes = [order.company_name ? `Company: ${order.company_name}` : "", order.delivery_notes ?? ""]
    .filter(Boolean)
    .join(" — ");

  try {
    const delivery = await createDelivery({
      externalId: `cafe1-${order.order_number}`,
      pickup: {
        name: NAP.name,
        address: PICKUP_ADDRESS,
        phone: NAP.telephone,
        notes: `Order #${order.order_number} — collect from the counter`,
      },
      dropoff: {
        name: order.customer_name,
        address: dropoff,
        phone: order.customer_phone,
        ...(notes ? { notes } : {}),
      },
      manifestItems: (items ?? []).map((i) => ({
        name: i.name,
        quantity: i.qty,
        price: i.unit_price_cents,
      })),
      totalCents: order.total_cents,
      pickupReadyAt: new Date(Date.now() + (settings.prep_minutes ?? 15) * 60_000),
      testMode: settings.uber_direct_test_mode ?? true,
    });

    await supabaseAdmin
      .from("orders")
      .update({
        courier_provider: "uber_direct",
        courier_external_id: delivery.id,
        courier_status: delivery.status,
        courier_tracking_url: delivery.tracking_url ?? null,
        courier_fee_cents: delivery.fee ?? null,
        courier_dispatched_at: new Date().toISOString(),
        courier_error: null,
      })
      .eq("id", order.id);

    return {
      ok: true,
      delivery_id: delivery.id,
      tracking_url: delivery.tracking_url ?? null,
      fee_cents: delivery.fee ?? null,
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Uber booking failed";
    await supabaseAdmin
      .from("orders")
      .update({ courier_provider: "uber_direct", courier_error: reason.slice(0, 500) })
      .eq("id", order.id);
    return { ok: false, reason, retryable: true };
  }
}
