import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  reconcileSumupReceiptBasket,
  sumupBasketNeedsManualReview,
  isMealUpgradeOnlyName,
} from "./sumup-kds-attribution";

type ProviderLine = { name: string; quantity: number; note: string | null };
type ProviderEvidence = {
  available: boolean;
  detail_items: ProviderLine[];
  receipt_items: ProviderLine[];
  product_summary: string | null;
  conflict: boolean;
  note: string;
};

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function providerLines(raw: unknown): ProviderLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).flatMap((p) => {
    const row = recordOf(p);
    const name = typeof row?.name === "string" ? row.name.trim() : "";
    if (!name) return [];
    const quantity = Number(row?.quantity ?? 1);
    return [{
      name: name.slice(0, 140),
      quantity: Number.isFinite(quantity) ? Math.min(99, Math.max(1, Math.round(quantity))) : 1,
      note: typeof row?.note === "string" ? row.note.slice(0, 200) : null,
    }];
  });
}

/** Do not cache or log full payment payloads. This reads only redacted item evidence. */
async function retrieveProviderEvidence(transactionId: string | null, code: string | null): Promise<ProviderEvidence> {
  const apiKey = process.env.SUMUP_API_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;
  const evidence: ProviderEvidence = {
    available: false, detail_items: [], receipt_items: [],
    product_summary: null, conflict: false, note: "",
  };
  if (!apiKey || !transactionId) {
    evidence.note = "No live SumUp transaction access configured; compare with the physical till receipt.";
    return evidence;
  }
  const urls = [
    merchantCode
      ? "https://api.sumup.com/v2.1/merchants/" +
        encodeURIComponent(merchantCode) + "/transactions?id=" + encodeURIComponent(transactionId)
      : null,
    "https://api.sumup.com/v0.1/me/transactions?id=" + encodeURIComponent(transactionId),
  ].filter((v): v is string => !!v);
  for (const url of urls) {
    try {
      const result = await fetch(url, {
        headers: { Authorization: "Bearer " + apiKey },
        signal: AbortSignal.timeout(6500),
      });
      if (!result.ok) continue;
      const obj = recordOf(await result.json());
      if (!obj) continue;
      evidence.available = true;
      evidence.product_summary = typeof obj.product_summary === "string"
        ? obj.product_summary.slice(0, 250) : null;
      evidence.detail_items = providerLines(obj.products);
      break;
    } catch {
      // The merchant's SumUp product may not permit transaction-detail reads.
    }
  }
  if (merchantCode && code) {
    try {
      const result = await fetch(
        "https://api.sumup.com/v1.1/receipts/" + encodeURIComponent(code) +
        "?mid=" + encodeURIComponent(merchantCode),
        { headers: { Authorization: "Bearer " + apiKey }, signal: AbortSignal.timeout(6500) },
      );
      if (result.ok) {
        const json = recordOf(await result.json());
        const transaction = recordOf(json?.transaction_data);
        evidence.available = true;
        evidence.receipt_items = providerLines(transaction?.products);
      }
    } catch {
      // A receipt may not contain a POS line-item basket.
    }
  }
  if (!evidence.available) {
    evidence.note = "SumUp has not returned item details to this integration. Check the source POS.";
    return evidence;
  }
  const disagreement = reconcileSumupReceiptBasket(
    evidence.detail_items, evidence.receipt_items,
  );
  evidence.conflict = sumupBasketNeedsManualReview({
    summary: evidence.product_summary,
    productNames: disagreement.products.map((item) => item.name),
    receiptConflicts: disagreement.conflictingNames,
  }) ||
    (evidence.detail_items.length > 0 && evidence.detail_items.every((p) => isMealUpgradeOnlyName(p.name)));
  evidence.note = evidence.conflict
    ? "Provider item sources do not agree. Do not interpret Mix grill as Make it a meal without till confirmation."
    : "Provider names are reference evidence; verify the original till order before correcting a kitchen item.";
  return evidence;
}

/**
 * This staff-only, read-only action allows order #6509 (and future incidents)
 * to be investigated without giving the browser a SumUp key, Supabase service
 * key, card information, or customers' personal details.
 */
export const inspectSumupKdsOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ order_number: z.number().int().min(1).max(999999999) }).parse(raw))
  .handler(async ({ data, context }) => {
    const [admin, staff] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "staff" }),
    ]);
    if (!admin.data && !staff.data) throw new Error("Café 1 kitchen or manager login required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: matches, error } = await supabaseAdmin.from("orders")
      .select("id, order_number, source, created_at, pos_terminal, status, payment_status, delivery_notes, notes_manual, sumup_transaction_id, sumup_reference, sumup_order_ref, sumup_sale_key")
      .eq("order_number", data.order_number)
      .order("created_at", { ascending: false })
      .limit(2);
    if (error) throw new Error("Could not inspect the Café 1 kitchen order");
    if (!matches?.length) return { found: false as const, message: "Order number not found in this Café 1 database." };
    if (matches.length > 1) {
      return { found: false as const, message: "Order number is ambiguous across sites; contact an administrator." };
    }
    const order = matches[0];
    const { data: items, error: itemsError } = await supabaseAdmin.from("order_items")
      .select("id, name, qty, notes, category_label, menu_item_id, unit_price_cents")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });
    if (itemsError) throw new Error("Order item history could not be read");
    const ref = order.sumup_reference || order.sumup_order_ref || null;
    const provider = order.source === "sumup_pos"
      ? await retrieveProviderEvidence(order.sumup_transaction_id, ref)
      : {
          available: false, detail_items: [], receipt_items: [], product_summary: null,
          conflict: false, note: "Not a SumUp POS imported order.",
        };
    return {
      found: true as const,
      order: {
        number: order.order_number,
        created_at: order.created_at,
        source: order.source,
        side: order.pos_terminal,
        status: order.status,
        payment_status: order.payment_status,
        manual_kitchen_correction: !!order.notes_manual,
        kds_note: order.delivery_notes,
        sale_reference: order.sumup_sale_key ?? null,
      },
      lines: (items ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        qty: i.qty,
        notes: i.notes,
        category: i.category_label,
        linked_menu_item: !!i.menu_item_id,
      })),
      provider,
    };
  });
