import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { usefulLabel } from "@/lib/cooking";
import { isPlaceholderLine, parseSumupProductSummary } from "@/lib/sumup-basket";
import { buildMenuIndex, matchSumupLine, tidyTillName, type MenuIndex } from "@/lib/sumup-menu-match";
import { parseSumupTabIntent } from "@/lib/sumup-tab";
import { readSumupPosSaleNotes } from "@/lib/sumup-pos-notes";
import {
  groupSumupSaleParts,
  normaliseSumupClientTransactionId,
  primarySumupSalePart,
  sumupSalePaymentMethod,
  sumupSaleTotalCents,
} from "@/lib/sumup-sale-grouping";

export type PosSide = "jury" | "judge" | "public";

type SumupTxn = {
  id: string;
  transaction_code?: string;
  amount: number;
  currency: string;
  status: string; // SUCCESSFUL, FAILED, PENDING, CANCELLED
  timestamp: string;
  product_summary?: string;
  payment_type?: string;
  entry_mode?: string;
  card?: { last_4_digits?: string; type?: string };
  products?: Array<{
    name: string;
    description?: string;
    quantity?: number;
    price?: number;
    /** Free-text note the till operator added to this line. Field name varies. */
    comment?: string;
    note?: string;
    notes?: string;
    item_note?: string;
    kitchen_note?: string;
    special_instructions?: string;
    remark?: string;
    modifiers?: Array<string | { name?: string; comment?: string }>;
    /** SumUp's product catalogue category; the field name varies by product. */
    category?: string;
    category_name?: string;
    categories?: Array<string | { name?: string }>;
  }>;
  internal_id?: string | number;
  /** Order-level note from the SumUp till. Field name varies by product. */
  description?: string;
  comment?: string;
  note?: string;
  notes?: string;
  order_note?: string;
  kitchen_note?: string;
  special_instructions?: string;
  /** A real POS sale id, when provided. Do not mistake a payment URN for it. */
  sale_id?: string | number;
  sale?: { id?: string | number };
  tip_amount?: number;
  // Terminal / reader identity varies by SumUp product; we probe a few shapes.
  reader_id?: string;
  device?: { identifier?: string; id?: string; model?: string };
  terminal?: { id?: string; name?: string };
  /** SumUp account signed in on the till that rang the sale up. */
  username?: string;
  /** e.g. urn:sumup:pos:sale:<merchant>:<pos-device-uuid>:<ts> */
  client_transaction_id?: string;
  local_time?: string;
  /** Amount already refunded against this payment (SumUp keeps status SUCCESSFUL). */
  refunded_amount?: number;
  /** PAYMENT | REFUND */
  type?: string;
};

/**
 * Reads whichever category field this SumUp basket line happens to carry.
 * Vague till labels ("Misc", "Other", "General") are dropped so the kitchen
 * card falls back to our own menu category instead of showing noise.
 */
function sumupCategory(p: NonNullable<SumupTxn["products"]>[number]): string | null {
  const first = p.categories?.[0];
  const fromList = typeof first === "string" ? first : first?.name;
  return usefulLabel(p.category ?? p.category_name ?? fromList ?? null);
}

/** Reads whichever note/comment field a SumUp basket line happens to carry. */
function sumupLineNote(p: NonNullable<SumupTxn["products"]>[number]): string | null {
  const scan = readSumupPosSaleNotes({ products: [p] });
  const notes = scan.indexedLineNotes[0]?.notes ?? scan.orderNotes;
  return notes.length ? notes.join(" · ") : null;
}

/**
 * Reads whichever order-level note the SumUp till sent with the sale. Kitchen
 * staff must never miss a till note, so when the sale has no order-level note
 * we roll the basket-line notes up into the ticket note strip as well.
 */
function sumupOrderNote(t: SumupTxn, products?: SumupTxn["products"]): string | null {
  const orderNotes = readSumupPosSaleNotes({ ...t, products: [] }).orderNotes;
  const lineNotes = (products ?? t.products ?? [])
    .map((p) => {
      const note = sumupLineNote(p);
      if (!note) return "";
      const name = (p.name ?? "").trim();
      return name ? `${name}: ${note}` : note;
    })
    .filter(Boolean);
  const seen = new Set<string>();
  const unique = [...orderNotes, ...lineNotes].filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.length ? unique.join(" · ") : null;
}

/** Fetches the detailed SumUp transaction and returns its kitchen note, if any. */
/**
 * Pulls the full sale from SumUp. The history listing carries no basket, and
 * the detailed transaction sometimes drops the line descriptions that hold the
 * till operator's note, so the receipt endpoint is used as a second source.
 */
async function loadSumupSale(
  t: SumupTxn,
  key: string,
): Promise<{ detailed: SumupTxn; products: SumupTxn["products"] }> {
  let detailed: SumupTxn = t;
  let products = t.products;
  const mid = merchantCode(t);
  // Prefer SumUp's documented merchant transaction endpoint, falling back to
  // older installations. Neither endpoint guarantees checkout notes.
  const detailUrls = [
    mid
      ? `https://api.sumup.com/v2.1/merchants/${encodeURIComponent(mid)}/transactions?id=${encodeURIComponent(t.id)}`
      : null,
    `https://api.sumup.com/v0.1/me/transactions?id=${encodeURIComponent(t.id)}`,
  ].filter((url): url is string => Boolean(url));
  for (const url of detailUrls) {
    try {
      const d = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
      if (!d.ok) continue;
      const dj = (await d.json()) as SumupTxn;
      detailed = { ...t, ...dj };
      if (dj.products?.length) products = dj.products;
      break;
    } catch {
      /* try the next supported transaction shape */
    }
  }

  const receiptProducts = await sumupReceiptProducts(detailed, key);
  if (receiptProducts?.length) {
    products = (products?.length ? products : receiptProducts).map((p, i) => {
      const match =
        receiptProducts.find(
          (r) => (r.name ?? "").trim().toLowerCase() === (p.name ?? "").trim().toLowerCase(),
        ) ?? receiptProducts[i];
      return match ? { ...match, ...p, description: p.description ?? match.description } : p;
    });
  }

  // Till notes live on the POS sale record, so merge them onto the sale/lines.
  const saleNotes = await sumupSaleNotes(detailed, key);
  if (saleNotes) {
    if (saleNotes.orderNotes.length) {
      detailed = { ...detailed, note: [detailed.note, ...saleNotes.orderNotes].filter(Boolean).join(" · ") };
    }
    if (saleNotes.lineNotesByName.size) {
      const appliedNames = new Set<string>();
      products = (products ?? []).map((p, i) => {
        const name = (p.name ?? "").trim().toLowerCase();
        // The same product can appear twice with different instructions.
        // Prefer its exact basket position; fall back to name only when unique.
        const atIndex = saleNotes.indexedLineNotes[i];
        const positioned = atIndex?.name.toLowerCase() === name ? atIndex : null;
        const named = saleNotes.indexedLineNotes.filter((line) => line.name.toLowerCase() === name);
        const extra = positioned ? positioned.notes : named.length === 1 ? named[0].notes : [];
        if (extra.length) appliedNames.add(name);
        return extra.length ? { ...p, note: [p.note, ...extra].filter(Boolean).join(" · ") } : p;
      });
      // If the provider has not supplied a matching basket yet, keep the
      // instructions on the order ticket rather than dropping them entirely.
      const unmatched = [...saleNotes.lineNotesByName.entries()]
        .filter(([name]) => !appliedNames.has(name))
        .map(([name, notes]) => name + ": " + notes.join(" · "));
      if (unmatched.length) {
        detailed = { ...detailed, note: [detailed.note, ...unmatched].filter(Boolean).join(" · ") };
      }
    }
  }
  return { detailed, products };
}

/** A split sale can attach the basket to only one payment part. */
async function loadSumupSaleGroup(parts: SumupTxn[], key: string) {
  const primary = primarySumupSalePart(parts);
  const ordered = [primary, ...parts.filter((part) => part.id !== primary.id)].sort(
    (a, b) => Number(Boolean(b.products?.length)) - Number(Boolean(a.products?.length)),
  );
  let fallback: Awaited<ReturnType<typeof loadSumupSale>> | null = null;
  for (const part of ordered) {
    const sale = await loadSumupSale(part, key);
    fallback ??= sale;
    if (sale.products?.length) return sale;
  }
  return fallback ?? { detailed: primary, products: primary.products };
}

/** Merchant code, needed by the receipt endpoint. Parsed off the sale itself. */
function merchantCode(t: SumupTxn): string | null {
  const parts = (t.client_transaction_id ?? "").split(":");
  const code = parts.length > 4 ? parts[4] : "";
  return code || process.env.SUMUP_MERCHANT_CODE || null;
}

/** Basket lines from the receipt endpoint, which keeps the operator's note. */
async function sumupReceiptProducts(t: SumupTxn, key: string): Promise<SumupTxn["products"]> {
  const code = t.transaction_code;
  const mid = merchantCode(t);
  if (!code || !mid) return undefined;
  try {
    const r = await fetch(
      `https://api.sumup.com/v1.1/receipts/${encodeURIComponent(code)}?mid=${encodeURIComponent(mid)}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!r.ok) return undefined;
    const j = (await r.json()) as { transaction_data?: { products?: SumupTxn["products"] } };
    return j.transaction_data?.products;
  } catch {
    return undefined;
  }
}

/**
 * Payment transaction/receipt responses are not guaranteed to expose POS
 * checkout notes. Some POS integrations also expose a separate sale payload,
 * which we parse when available. These optional sale lookups may be unavailable
 * for a merchant or POS product; never claim complete note coverage from the
 * payment API alone.
 */
type SumupNoteScan = ReturnType<typeof readSumupPosSaleNotes>;

async function sumupSaleNotes(t: SumupTxn, key: string): Promise<SumupNoteScan | null> {
  const mid = merchantCode(t);
  if (!mid) return null;
  const saleId = t.sale_id ?? t.sale?.id;
  const urls = [
    saleId ? `https://api.sumup.com/v0.1/merchants/${mid}/sales/${encodeURIComponent(String(saleId))}` : null,
    t.transaction_code
      ? `https://api.sumup.com/v0.1/merchants/${mid}/sales?transaction_code=${encodeURIComponent(t.transaction_code)}`
      : null,
  ].filter((u): u is string => Boolean(u));
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) continue;
      const json: unknown = await r.json();
      const out: SumupNoteScan = readSumupPosSaleNotes(json);
      if (out.orderNotes.length || out.lineNotesByName.size) return out;
    } catch {
      /* sale lookup is best-effort */
    }
  }
  return null;
}

/** A sale is void when SumUp cancelled/failed it, or the full amount was refunded. */
function isVoidTxn(
  t: Pick<SumupTxn, "status" | "amount" | "refunded_amount">,
): "refunded" | "cancelled" | null {
  const st = String(t.status ?? "").toUpperCase();
  if (st === "REFUNDED") return "refunded";
  if (st === "CANCELLED" || st === "CANCELED" || st === "FAILED") return "cancelled";
  const refunded = Number(t.refunded_amount ?? 0);
  if (refunded > 0 && refunded >= Number(t.amount) - 0.001) return "refunded";
  return null;
}

/** Anything that could identify which physical terminal took the sale. */
function deviceRefs(t: SumupTxn): string[] {
  return [
    t.reader_id,
    t.device?.identifier,
    t.device?.id,
    t.terminal?.id,
    t.terminal?.name,
    // The SumUp account signed in on that till — the reliable per-counter signal.
    t.username,
  ].filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

/**
 * Work out which counter (jury side or public side) rang the sale up:
 * first by the mapped terminal reference, then by any keyword the terminal
 * puts in the sale text. Null when we genuinely can't tell.
 */
function derivePosSide(
  t: SumupTxn,
  products: SumupTxn["products"],
  mapping: Map<string, PosSide>,
): PosSide | null {
  for (const ref of deviceRefs(t)) {
    const hit = mapping.get(ref.toLowerCase());
    if (hit) return hit;
  }
  const haystack = [
    t.product_summary ?? "",
    String(t.internal_id ?? ""),
    ...deviceRefs(t),
    ...(products ?? []).map((p) => p?.name ?? ""),
    ...(products ?? []).map((p) => p?.description ?? ""),
  ]
    .join(" | ")
    .toLowerCase();
  if (/\bjury\b/.test(haystack)) return "jury";
  if (/\bjudge(s)?\b/.test(haystack)) return "judge";
  if (/\bpublic\b/.test(haystack)) return "public";
  return null;
}

/**
 * Derive the fulfilment type for a SumUp POS sale from whatever the terminal sends
 * (product summary, line-item names, or the terminal's internal reference).
 * Falls back to collection (counter sale) when the terminal gives no hint.
 */
function deriveFulfilment(
  t: SumupTxn,
  products: SumupTxn["products"],
): {
  type: "dine_in" | "collection" | "delivery";
  table_number: string | null;
} {
  const haystack = [
    t.product_summary ?? "",
    String(t.internal_id ?? ""),
    ...(products ?? []).map((p) => p?.name ?? ""),
    // SumUp POS puts the chosen modifier (e.g. "Dine In" / "Takeaway") in the
    // line-item description, not the name.
    ...(products ?? []).map((p) => p?.description ?? ""),
  ]
    .join(" | ")
    .toLowerCase();

  const tableMatch = haystack.match(/\b(?:table|tbl)\s*#?\s*([a-z0-9-]{1,6})\b/i);
  // Terminals send the dine-in / takeaway choice as a modifier line or in the
  // product summary, e.g. "Latte (Takeaway)" or a "Take away" line item.
  const isTakeaway = /\b(take\s*-?\s*away|takeaway|to\s*go|take\s*out|takeout)\b/.test(haystack);
  const isDineIn =
    /\b(dine\s*-?\s*in|dinein|eat\s*-?\s*in|sit\s*-?\s*in|in\s*house|eat\s*here)\b/.test(
      haystack,
    ) ||
    (!!tableMatch && !isTakeaway);
  const isDelivery = /\b(delivery|deliver)\b/.test(haystack);

  if (isDineIn && !isTakeaway)
    return { type: "dine_in", table_number: tableMatch ? tableMatch[1].toUpperCase() : null };
  if (isTakeaway) return { type: "collection", table_number: null };
  if (isDelivery) return { type: "delivery", table_number: null };
  return { type: "collection", table_number: null };
}

/** Builds a UTC Date for a wall-clock time on a given day in Europe/London. */
function londonTimeToUtc(reference: Date, hours: number, minutes: number): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const y = get("year");
  const m = get("month");
  const d = get("day");
  // Guess UTC, then correct by the zone offset at that instant.
  const guess = Date.UTC(y, m - 1, d, hours, minutes, 0, 0);
  const asLondon = new Date(
    new Date(guess).toLocaleString("en-US", { timeZone: "Europe/London" }),
  ).getTime();
  const asUtc = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(guess - (asLondon - asUtc));
}

/**
 * Pre-orders from the SumUp till: the operator types the wanted time into the
 * sale note or a line description, e.g. "LATER 14:30", "FOR 2:30pm", "@ 14:30".
 * Times already passed roll over to the next day, matching the Till app.
 */
function deriveSchedule(
  t: SumupTxn,
  products: SumupTxn["products"],
): { schedule_mode: "asap" | "scheduled"; scheduled_for: string | null } {
  const haystack = [
    sumupOrderNote(t) ?? "",
    t.product_summary ?? "",
    ...(products ?? []).map((p) => sumupLineNote(p) ?? ""),
  ].join(" | ");

  const m = haystack.match(
    /\b(?:later|pre[-\s]?order|preorder|for|due|@|at)\s*:?\s*(\d{1,2})[:.\s]?(\d{2})?\s*(am|pm)?\b/i,
  );
  if (!m) return { schedule_mode: "asap", scheduled_for: null };

  let hh = Number(m[1]);
  const mm = Number(m[2] ?? "0");
  const suffix = (m[3] ?? "").toLowerCase();
  if (suffix === "pm" && hh < 12) hh += 12;
  if (suffix === "am" && hh === 12) hh = 0;
  if (hh > 23 || mm > 59) return { schedule_mode: "asap", scheduled_for: null };

  const placed = t.timestamp ? new Date(t.timestamp) : new Date();
  let when = londonTimeToUtc(placed, hh, mm);
  // Ignore near-immediate times; roll anything already gone to tomorrow.
  if (when.getTime() - placed.getTime() < 5 * 60 * 1000) {
    when = londonTimeToUtc(new Date(placed.getTime() + 24 * 60 * 60 * 1000), hh, mm);
  }
  return { schedule_mode: "scheduled", scheduled_for: when.toISOString() };
}

export const syncSumupPos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = process.env.SUMUP_API_KEY;
    if (!key) return { imported: 0, skipped: 0, error: "SUMUP_API_KEY not set" };

    // Housekeeping: drop website orders left unpaid for more than 5 minutes.
    try {
      const { purgeStaleUnpaidOrders } = await import("./order-cleanup.server");
      await purgeStaleUnpaidOrders();
    } catch (e) {
      console.error("[pos-sync] unpaid purge failed", e);
    }

    // Verify caller is staff/admin (RLS-scoped supabase from middleware)
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isStaff } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "staff",
    });
    if (!isAdmin && !isStaff) throw new Error("Forbidden");

    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

    // Every open kitchen display polls this. Without a shared brake, five
    // screens meant five full SumUp sweeps every 15s, which is what made
    // status updates and manual orders crawl. One sweep per 20s, shop-wide.
    const THROTTLE_MS = 20_000;
    const { data: gate } = await admin
      .from("integration_status")
      .select("last_seen_at")
      .eq("key", "sumup_pos_sync")
      .maybeSingle();
    const lastAt = gate?.last_seen_at ? new Date(gate.last_seen_at).getTime() : 0;
    if (Date.now() - lastAt < THROTTLE_MS) {
      return { imported: 0, skipped: 0, voided: 0, throttled: true, error: null };
    }
    await admin
      .from("integration_status")
      .upsert(
        {
          key: "sumup_pos_sync",
          healthy: true,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );

    // Pull the last 24h of transactions, NEWEST FIRST and paginated. SumUp
    // returns the oldest rows of the window by default, so a busy day pushes
    // the newest sales off the first page and they never reach the kitchen.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const base = "https://api.sumup.com/v0.1/me/transactions/history";
    const items: SumupTxn[] = [];
    let next: string | null =
      `?oldest_time=${encodeURIComponent(since)}&limit=100&order=descending`;
    for (let page = 0; page < 5 && next; page++) {
      const res: Response = await fetch(`${base}${next}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const body = await res.text();
        if (page === 0) {
          return { imported: 0, skipped: 0, error: `SumUp ${res.status}: ${body.slice(0, 200)}` };
        }
        break;
      }
      const payload = (await res.json()) as
        { items?: SumupTxn[]; links?: Array<{ href?: string; rel?: string }> } | SumupTxn[];
      if (Array.isArray(payload)) {
        items.push(...payload);
        next = null;
      } else {
        items.push(...(payload.items ?? []));
        const href = payload.links?.find((l) => l.rel === "next")?.href;
        next = href ? (href.startsWith("?") ? href : `?${href}`) : null;
      }
    }

    const supabaseAdmin = admin;

    // Our own menu is the fallback source of a category when SumUp's basket
    // doesn't carry one. Fetched once per sweep, not once per imported order.
    let menuIndex: MenuIndex | null = null;
    async function menuByNameIndex(): Promise<MenuIndex> {
      if (menuIndex) return menuIndex;
      const { data: menuRows } = await supabaseAdmin
        .from("menu_items")
        .select("id, name, price_cents, menu_categories(name)");
      menuIndex = buildMenuIndex(
        ((menuRows ?? []) as Array<{
          id: string;
          name: string;
          price_cents: number | null;
          menu_categories: { name: string } | null;
        }>).map((m) => ({
          id: m.id,
          name: m.name,
          category: m.menu_categories?.name ?? null,
          priceCents: m.price_cents,
        })),
      );
      return menuIndex;
    }
    const priceCents = (p: { price?: number }) => Math.round(Number(p.price ?? 0) * 100);

    // Terminal reference → jury/public mapping, configured by staff.
    const { data: devices } = await supabaseAdmin
      .from("pos_devices")
      .select("device_ref, side, active")
      .eq("active", true);
    const mapping = new Map<string, PosSide>(
      (devices ?? []).map((d) => [String(d.device_ref).toLowerCase(), d.side as PosSide]),
    );

    let imported = 0;
    let skipped = 0;
    let voided = 0;

    // Void lookup for everything SumUp returned in the window. SumUp keeps the
    // original PAYMENT row SUCCESSFUL and adds a separate REFUND row with the
    // same transaction_code, so both shapes have to be considered.
    const voidByRef = new Map<string, "refunded" | "cancelled">();
    for (const t of items) {
      const v = isVoidTxn(t);
      if (!v) continue;
      if (t.id) voidByRef.set(t.id, v);
      if (t.transaction_code) voidByRef.set(t.transaction_code, v);
    }

    const successful = items.filter((transaction) => {
      if (
        transaction.status !== "SUCCESSFUL" ||
        String(transaction.type ?? "PAYMENT").toUpperCase() === "REFUND"
      ) {
        skipped++;
        return false;
      }
      if (
        isVoidTxn(transaction) ||
        voidByRef.has(transaction.transaction_code ?? "") ||
        voidByRef.has(transaction.id)
      ) {
        skipped++;
        return false;
      }
      return true;
    });
    const saleGroups = groupSumupSaleParts(successful);
    const saleKeys = saleGroups.map((group) => group.saleKey);
    const transactionIds = successful.map((transaction) => transaction.id);
    const transactionRefs = successful
      .map((transaction) => transaction.transaction_code)
      .filter((value): value is string => Boolean(value));
    const existingFields =
      "id, delivery_notes, notes_manual, source, total_cents, payment_method, sumup_sale_key, sumup_transaction_id, sumup_order_ref";
    const [bySaleKey, byTransaction, byReference, recentAttempts] = await Promise.all([
      saleKeys.length
        ? supabaseAdmin.from("orders").select(existingFields).in("sumup_sale_key", saleKeys)
        : Promise.resolve({ data: [], error: null }),
      transactionIds.length
        ? supabaseAdmin
            .from("orders")
            .select(existingFields)
            .in("sumup_transaction_id", transactionIds)
        : Promise.resolve({ data: [], error: null }),
      transactionRefs.length
        ? supabaseAdmin.from("orders").select(existingFields).in("sumup_order_ref", transactionRefs)
        : Promise.resolve({ data: [], error: null }),
      supabaseAdmin
        .from("payment_attempts")
        .select("provider_transaction_id, client_transaction_id")
        .gte("created_at", since),
    ]);
    for (const result of [bySaleKey, byTransaction, byReference, recentAttempts]) {
      if (result.error) throw new Error(result.error.message);
    }

    type ExistingSumupOrder = NonNullable<typeof bySaleKey.data>[number];
    const existingByIdentity = new Map<string, ExistingSumupOrder>();
    for (const order of [
      ...(bySaleKey.data ?? []),
      ...(byTransaction.data ?? []),
      ...(byReference.data ?? []),
    ]) {
      if (order.sumup_sale_key) existingByIdentity.set(`sale:${order.sumup_sale_key}`, order);
      if (order.sumup_transaction_id)
        existingByIdentity.set(`transaction:${order.sumup_transaction_id}`, order);
      if (order.sumup_order_ref)
        existingByIdentity.set(`reference:${order.sumup_order_ref}`, order);
    }
    const readerTransactionIds = new Set(
      (recentAttempts.data ?? [])
        .map((attempt) => attempt.provider_transaction_id)
        .filter((value): value is string => Boolean(value)),
    );
    const readerSaleKeys = new Set(
      (recentAttempts.data ?? [])
        .map((attempt) => normaliseSumupClientTransactionId(attempt.client_transaction_id))
        .filter((value): value is string => Boolean(value)),
    );

    for (const { saleKey, paymentParts } of saleGroups) {
      // Cafe1's own Solo flow has already prepared one counter order. Never
      // re-import its provider payment as an unrelated SumUp POS ticket while
      // the till and KDS reconciliation jobs race each other.
      if (
        paymentParts.some((part) => readerTransactionIds.has(part.id)) ||
        readerSaleKeys.has(saleKey)
      ) {
        skipped += paymentParts.length;
        continue;
      }

      const primary = primarySumupSalePart(paymentParts);
      const ref = primary.transaction_code ?? primary.id;
      const existing =
        existingByIdentity.get(`sale:${saleKey}`) ??
        paymentParts
          .map(
            (part) =>
              existingByIdentity.get(`transaction:${part.id}`) ??
              (part.transaction_code
                ? existingByIdentity.get(`reference:${part.transaction_code}`)
                : undefined),
          )
          .find(Boolean);
      const totalCents = sumupSaleTotalCents(paymentParts);
      const paymentMethod = sumupSalePaymentMethod(paymentParts);
      if (existing) {
        // If the first payment part arrived before the remaining split parts,
        // keep the same order and expand it to the final sale total.
        if (
          existing.source === "sumup_pos" &&
          (existing.total_cents !== totalCents ||
            existing.payment_method !== paymentMethod ||
            existing.sumup_sale_key !== saleKey)
        ) {
          await supabaseAdmin
            .from("orders")
            .update({
              subtotal_cents: totalCents,
              total_cents: totalCents,
              payment_method: paymentMethod,
              sumup_sale_key: saleKey,
            })
            .eq("id", existing.id);
        }
        // The note is often only on the detailed transaction, which arrives
        // after the ticket was first created. Backfill both the ticket note and
        // any line notes so what the till operator typed always reaches the
        // kitchen card, not just on the very first sync.
        if (!existing.notes_manual) {
          const sale = await loadSumupSaleGroup(paymentParts, key);
          const backfill = sumupOrderNote(sale.detailed, sale.products);
          if (backfill && backfill !== existing.delivery_notes) {
            await supabaseAdmin
              .from("orders")
              .update({ delivery_notes: backfill })
              .eq("id", existing.id);
          }
          const { data: existingLines } = await supabaseAdmin
            .from("order_items")
            .select("id, name, notes, category_label, menu_item_id")
            .eq("order_id", existing.id);

          const menuByName = await menuByNameIndex();
          const basket = sale.products ?? [];
          const placeholderOnly =
            (existingLines ?? []).length > 0 &&
            (existingLines ?? []).every((line) => isPlaceholderLine(line));

          // The first sweep can land before SumUp exposes the basket, leaving a
          // single summary line. Once the real basket appears, rebuild the
          // ticket so the kitchen sees the proper items and categories.
          if (placeholderOnly && basket.length) {
            const rebuilt = basket.map((product) => {
              const m = matchSumupLine(menuByName, {
                name: product.name,
                priceCents: priceCents(product),
                category: sumupCategory(product),
              });
              return {
                order_id: existing.id,
                menu_item_id: m.item?.id ?? null,
                category_label: m.category,
                name: m.name || "Item",
                qty: Math.max(1, Number(product.quantity ?? 1)),
                unit_price_cents: Math.round(Number(product.price ?? 0) * 100),
                notes: sumupLineNote(product),
              };
            });
            await supabaseAdmin.from("order_items").delete().eq("order_id", existing.id);
            await supabaseAdmin.from("order_items").insert(rebuilt);
          } else {
            const lineNotes = basket
              .map((product) => {
                const m = matchSumupLine(menuByName, {
                  name: product.name,
                  priceCents: priceCents(product),
                  category: sumupCategory(product),
                });
                return {
                  name: tidyTillName(product.name).toLowerCase(),
                  menuName: m.name.toLowerCase(),
                  note: sumupLineNote(product),
                  menuItemId: m.item?.id ?? null,
                  category: m.category,
                };
              })
              .filter((line) => line.name && (line.note || line.category || line.menuItemId));
            for (const line of existingLines ?? []) {
              const stored = tidyTillName(line.name).toLowerCase();
              const match = lineNotes.find(
                (candidate) => candidate.name === stored || candidate.menuName === stored,
              );
              if (!match) continue;
              const patch: {
                notes?: string;
                category_label?: string;
                menu_item_id?: string;
              } = {};
              if (match.note && match.note !== line.notes) patch.notes = match.note;
              if (match.category && !usefulLabel(line.category_label))
                patch.category_label = match.category;
              if (match.menuItemId && !line.menu_item_id) patch.menu_item_id = match.menuItemId;
              if (Object.keys(patch).length) {
                await supabaseAdmin.from("order_items").update(patch).eq("id", line.id);
              }
            }
          }
        }

        skipped += paymentParts.length;
        continue;
      }

      // One payment part carries the sale basket; another can be cash/card only.
      const { detailed, products } = await loadSumupSaleGroup(paymentParts, key);

      const cardTail = detailed.card?.last_4_digits ? ` ••${detailed.card.last_4_digits}` : "";
      const fulfilment = deriveFulfilment(detailed, products);
      const posSide = derivePosSide(detailed, products, mapping);
      const schedule = deriveSchedule(detailed, products);
      const note = sumupOrderNote(detailed, products);
      const tab = parseSumupTabIntent(note);

      // "TAB PAID: <name>" on the till clears the outstanding tab tickets
      // instead of sending the same food to the kitchen a second time.
      if (tab?.kind === "settle") {
        await supabaseAdmin
          .from("orders")
          .update({ payment_status: "paid", payment_method: paymentMethod })
          .eq("payment_status", "on_account")
          .ilike("company_name", tab.name);
        skipped += paymentParts.length;
        continue;
      }

      // "TAB: <name>" keeps the ticket unpaid and on the named house account.
      let tabAccountId: string | null = null;
      if (tab?.kind === "open") {
        const { data: account } = await supabaseAdmin
          .from("accounts")
          .select("id")
          .ilike("name", tab.name)
          .eq("active", true)
          .maybeSingle();
        tabAccountId = account?.id ?? null;
      }

      // A settled SumUp open order already has a kitchen ticket; mark that one
      // paid rather than sending the same food through a second time.
      const { claimSettledOpenOrder } = await import("./sumup-open-orders.server");
      const claimed = await claimSettledOpenOrder(supabaseAdmin, {
        totalCents,
        name: tab?.kind === "open" ? tab.name : null,
        paymentMethod,
        saleKey,
        transactionId: primary.id,
        reference: primary.transaction_code ?? null,
      });
      if (claimed) {
        skipped += paymentParts.length;
        continue;
      }

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("orders")
        .insert({
          customer_name: tab?.kind === "open" ? tab.name : `SumUp POS${cardTail}`,
          company_name: tab?.kind === "open" ? tab.name : null,
          account_id: tabAccountId,
          customer_phone: "",
          type: fulfilment.type,
          table_number: fulfilment.table_number,
          pos_terminal: posSide,
          delivery_notes: note,
          status: "preparing",
          payment_status: tab?.kind === "open" ? "on_account" : "paid",
          payment_method: tab?.kind === "open" ? "account" : paymentMethod,
          subtotal_cents: totalCents,
          delivery_fee_cents: 0,
          discount_cents: 0,
          promo_discount_cents: 0,
          voucher_cents: 0,
          points_earned: 0,
          total_cents: totalCents,
          schedule_mode: schedule.schedule_mode,
          scheduled_for: schedule.scheduled_for,
          source: "sumup_pos",
          sumup_sale_key: saleKey,
          sumup_order_ref: ref,
          sumup_transaction_id: primary.id,
          sumup_reference: primary.transaction_code ?? null,
        })
        .select("id")
        .single();

      if (insErr || !inserted) {
        skipped++;
        continue;
      }

      const menuByName = await menuByNameIndex();


      const summaryText = detailed.product_summary || primary.product_summary || "";
      const summaryLines = parseSumupProductSummary(summaryText);
      const fallbackUnit = summaryLines.length
        ? Math.round(totalCents / summaryLines.reduce((sum, line) => sum + line.qty, 0))
        : totalCents;

      const lines =
        products && products.length > 0
          ? products.map((p) => {
              // Name + price pick the real menu item (the till sends no category).
              const m = matchSumupLine(menuByName, {
                name: p.name,
                priceCents: priceCents(p),
                category: sumupCategory(p),
              });
              return {
                order_id: inserted.id,
                menu_item_id: m.item?.id ?? null,
                category_label: m.category,
                name: m.name || "Item",
                qty: Math.max(1, Number(p.quantity ?? 1)),
                unit_price_cents: Math.round(Number(p.price ?? 0) * 100),
                notes: sumupLineNote(p),
              };
            })
          : summaryLines.length
            ? summaryLines.map((line) => {
                const m = matchSumupLine(menuByName, { name: line.name });
                return {
                  order_id: inserted.id,
                  menu_item_id: m.item?.id ?? null,
                  category_label: m.item ? m.category : (line.category_label ?? m.category),
                  name: m.name,
                  qty: line.qty,
                  unit_price_cents: fallbackUnit,
                  notes: null as string | null,
                };
              })
            : [
                {
                  order_id: inserted.id,
                  menu_item_id: null as string | null,
                  category_label: null as string | null,
                  name: summaryText || "SumUp POS sale",
                  qty: 1,
                  unit_price_cents: totalCents,
                  notes: null as string | null,
                },
              ];


      await supabaseAdmin.from("order_items").insert(lines);
      imported++;
    }

    // Reconcile: any live ticket (POS or website) whose SumUp transaction is no
    // longer successful (refunded / cancelled / failed) must come off the kitchen display.
    const { data: live } = await supabaseAdmin
      .from("orders")
      .select("id, sumup_transaction_id, sumup_order_ref")
      .or("sumup_transaction_id.not.is.null,sumup_order_ref.not.is.null")
      .in("status", ["paid", "preparing", "ready", "out_for_delivery", "delivered", "completed"]);

    let lookups = 0;
    for (const o of live ?? []) {
      const refKey = o.sumup_transaction_id ?? o.sumup_order_ref;
      if (!refKey) continue;
      let voided_as =
        voidByRef.get(o.sumup_transaction_id ?? "") ?? voidByRef.get(o.sumup_order_ref ?? "");
      const seen = items.some(
        (t) => t.id === o.sumup_transaction_id || t.transaction_code === o.sumup_order_ref,
      );
      // Cap the one-by-one SumUp lookups: they are the slowest part of the
      // sweep and older tickets get picked up on a later pass anyway.
      if (!voided_as && !seen && lookups < 10) {
        lookups++;
        // Not in the recent window — ask SumUp directly.
        try {
          const param = o.sumup_transaction_id
            ? `id=${encodeURIComponent(o.sumup_transaction_id)}`
            : `transaction_code=${encodeURIComponent(o.sumup_order_ref!)}`;
          const d = await fetch(`https://api.sumup.com/v0.1/me/transactions?${param}`, {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (d.ok) {
            const dj = (await d.json()) as SumupTxn;
            voided_as = isVoidTxn(dj) ?? undefined;
          }
        } catch {
          /* ignore */
        }
      }
      if (voided_as) {
        const refunded = voided_as === "refunded";
        await supabaseAdmin
          .from("orders")
          .update({
            status: refunded ? "refunded" : "cancelled",
            payment_status: refunded ? "refunded" : "failed",
          })
          .eq("id", o.id);
        voided++;
      }
    }

    // Unpaid POS tabs ("open orders") never appear in the transaction history,
    // so they are pulled separately and pushed to the kitchen straight away.
    let openImported = 0;
    try {
      const { importSumupOpenOrders } = await import("./sumup-open-orders.server");
      const openResult = await importSumupOpenOrders({
        key,
        merchantCode: items.map((t) => merchantCode(t)).find(Boolean) ?? null,
        supabaseAdmin,
        menuByNameIndex,
      });
      openImported = openResult.imported;
      imported += openResult.imported;
    } catch (e) {
      console.error("[pos-sync] open orders failed", e);
    }

    return { imported, skipped, voided, openImported, error: null };
  });
