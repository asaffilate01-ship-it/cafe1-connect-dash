/**
 * Shared ingest path for Deliveroo orders reaching Cafe1 by any route
 * (tablet print stream, Restaurant Hub watcher, future partner webhook).
 * Server-only: uses the service-role client to write kitchen tickets.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { deliverooCanonicalRef, deliverooReferenceKeys } from "@/lib/deliveroo.server";

export type IngestLine = {
  name: string;
  qty: number;
  notes: string | null;
  unitPriceCents?: number;
};

export type IngestOrder = {
  reference: string;
  alternateReferences?: string[];
  customerName: string | null;
  type: "delivery" | "collection";
  totalCents: number;
  notes: string | null;
  items: IngestLine[];
  customerPhone?: string | null;
  scheduledFor?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    postcode?: string | null;
  };
};

export type IngestResult = { order_id: string; reference: string; duplicate: boolean };

/**
 * Record that a bridge is alive. The kitchen display reads this so staff can
 * see at a glance that Deliveroo orders are arriving on their own, rather
 * than discovering a dead link only when a ticket never appears.
 */
export async function recordIntegrationHeartbeat(key: string, detail: string, healthy = true): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          upsert: (v: Record<string, unknown>, o: { onConflict: string }) => Promise<unknown>;
        };
      }
    )
      .from("integration_status")
      .upsert(
        {
          key,
          healthy,
          detail,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
  } catch (err) {
    // A missed heartbeat must never block an order reaching the kitchen.
    console.error("heartbeat failed", key, (err as Error).message);
  }
}

/**
 * Compare a caller-supplied secret against the configured one without
 * leaking length information through early exit.
 */
export function bridgeSecretMatches(provided: string): boolean {
  const secret = process.env["DELIVEROO_BRIDGE_SECRET"];
  if (!secret) return false;
  const suppliedHash = createHash("sha256").update(provided, "utf8").digest();
  const expectedHash = createHash("sha256").update(secret, "utf8").digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

/** Read the shared secret from either header style the bridges use. */
export function readBridgeSecret(request: Request): string {
  return (
    request.headers.get("x-bridge-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    ""
  );
}

/** Remove a cancelled/rejected Deliveroo ticket regardless of which ingest path created it. */
export async function cancelDeliverooOrder(reference: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("orders")
    .update({ status: "cancelled" })
    .in("deliveroo_order_id", deliverooReferenceKeys(reference));
  if (error) throw new Error(error.message);
}

/**
 * Create one KDS ticket. All ingestion paths share the same canonical key so
 * a webhook, Hub poll and receipt reprint can never create separate tickets.
 */
export async function ingestDeliverooOrder(
  order: IngestOrder,
  source: "print" | "hub" | "webhook",
): Promise<IngestResult> {
  const ref = deliverooCanonicalRef(order.reference);
  const legacyKeys = [order.reference, ...(order.alternateReferences ?? [])].flatMap(
    deliverooReferenceKeys,
  );
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("id")
    .in("deliveroo_order_id", legacyKeys)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { order_id: existing.id, reference: order.reference, duplicate: true };
  }

  const total = order.totalCents;
  const { data: inserted, error } = await supabaseAdmin
    .from("orders")
    .insert({
      customer_name: order.customerName || "Deliveroo customer",
      customer_phone: order.customerPhone ?? "",
      type: order.type,
      status: "preparing",
      payment_status: "paid",
      payment_method: "card",
      subtotal_cents: total,
      delivery_fee_cents: 0,
      discount_cents: 0,
      promo_discount_cents: 0,
      voucher_cents: 0,
      points_earned: 0,
      total_cents: total,
      schedule_mode: order.scheduledFor ? "scheduled" : "asap",
      scheduled_for: order.scheduledFor ?? null,
      source: "deliveroo",
      deliveroo_order_id: ref,
      delivery_notes: order.notes,
      address_line1: order.address?.line1 ?? null,
      address_line2: order.address?.line2 ?? null,
      city: order.address?.city ?? null,
      postcode: order.address?.postcode ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    // A concurrent webhook retry may win the unique-key race after our read.
    if (error?.code === "23505") {
      const { data: raced } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("deliveroo_order_id", ref)
        .maybeSingle();
      if (raced) return { order_id: raced.id, reference: order.reference, duplicate: true };
    }
    throw new Error(error?.message ?? "Could not create the ticket");
  }

  const units = order.items.reduce((sum, line) => sum + line.qty, 0);
  const unit = units > 0 ? Math.round(total / units) : 0;
  const { error: lineError } = await supabaseAdmin.from("order_items").insert(
    order.items.map((line) => ({
      order_id: inserted.id,
      name: line.name,
      qty: line.qty,
      unit_price_cents:
        typeof line.unitPriceCents === "number" ? Math.max(0, line.unitPriceCents) : unit,
      notes: line.notes,
    })),
  );
  if (lineError) {
    // Never acknowledge a kitchen ticket whose item lines were lost. Removing
    // the partial order lets Deliveroo retry the entire atomic-looking ingest.
    await supabaseAdmin.from("orders").delete().eq("id", inserted.id);
    throw new Error(`Deliveroo item ingest failed: ${lineError.message}`);
  }

  await recordIntegrationHeartbeat(
    source === "webhook" ? "deliveroo_orders_api" : "deliveroo_hub",
    `${source === "webhook" ? "Orders API" : "Hub watcher"} created ticket ${order.reference}`,
  );

  return { order_id: inserted.id, reference: order.reference, duplicate: false };
}
