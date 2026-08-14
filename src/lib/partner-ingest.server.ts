/**
 * Ingest path for marketplace partners other than Deliveroo (currently Just
 * Eat). Server-only: writes kitchen tickets with the service-role client.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import {
  recordIntegrationHeartbeat,
  type IngestOrder,
  type IngestResult,
} from "@/lib/deliveroo-ingest.server";

export type PartnerKey = "just_eat";
export type JustEatIngestChannel = "hub_watcher" | "webhook";
export type JustEatIngestMode = "disabled" | JustEatIngestChannel | "dual";
type JustEatEnvironment = Readonly<Record<string, string | undefined>>;

export const PARTNER_LABEL: Record<PartnerKey, string> = { just_eat: "Just Eat" };

export function readJustEatIngestMode(
  env: JustEatEnvironment = process.env,
): JustEatIngestMode {
  const configured = env.JUSTEAT_INGEST_MODE?.trim().toLowerCase();
  return configured === "hub_watcher" ||
    configured === "webhook" ||
    configured === "dual"
    ? configured
    : "disabled";
}

export function justEatIngestEnabled(
  channel: JustEatIngestChannel,
  env: JustEatEnvironment = process.env,
): boolean {
  const mode = readJustEatIngestMode(env);
  return mode === "dual" || mode === channel;
}

/** Canonical dedupe key so retries and reprints never double-ticket. */
export function partnerRef(partner: PartnerKey, reference: string): string {
  return `${partner}:${reference.trim().toLowerCase()}`.slice(0, 120);
}

/** Timing-safe compare of the caller's shared secret. */
export function partnerSecretMatches(partner: PartnerKey, provided: string): boolean {
  const secret =
    partner === "just_eat" ? process.env["JUSTEAT_BRIDGE_SECRET"] : undefined;
  if (!secret || !provided) return false;
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(secret, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function readPartnerSecret(request: Request): string {
  return (
    request.headers.get("x-bridge-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    ""
  );
}

export async function cancelPartnerOrder(partner: PartnerKey, reference: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("orders")
    .update({ status: "cancelled" })
    .eq("partner_order_id", partnerRef(partner, reference));
  if (error) throw new Error(error.message);
}

export async function ingestPartnerOrder(
  partner: PartnerKey,
  order: IngestOrder,
): Promise<IngestResult> {
  const ref = partnerRef(partner, order.reference);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("id")
    .eq("partner_order_id", ref)
    .maybeSingle();
  if (existing) return { order_id: existing.id, reference: order.reference, duplicate: true };

  const total = order.totalCents;
  const { data: inserted, error } = await supabaseAdmin
    .from("orders")
    .insert({
      customer_name: order.customerName || `${PARTNER_LABEL[partner]} customer`,
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
      source: partner,
      partner_order_id: ref,
      delivery_notes: order.notes,
      address_line1: order.address?.line1 ?? null,
      address_line2: order.address?.line2 ?? null,
      city: order.address?.city ?? null,
      postcode: order.address?.postcode ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    // A concurrent retry may win the unique-key race after our read.
    if (error?.code === "23505") {
      const { data: raced } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("partner_order_id", ref)
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
    // Never acknowledge a ticket whose item lines were lost.
    await supabaseAdmin.from("orders").delete().eq("id", inserted.id);
    throw new Error(`${PARTNER_LABEL[partner]} item ingest failed: ${lineError.message}`);
  }

  await recordIntegrationHeartbeat(
    `${partner}_orders`,
    `${PARTNER_LABEL[partner]} created ticket ${order.reference}`,
  );

  return { order_id: inserted.id, reference: order.reference, duplicate: false };
}
