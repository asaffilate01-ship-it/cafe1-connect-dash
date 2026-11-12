import { matchSumupLine, type MenuIndex } from "@/lib/sumup-menu-match";
import { parseSumupTabIntent } from "@/lib/sumup-tab";
import {
  extractSumupOpenOrders,
  normaliseSumupOpenOrder,
  sumupOpenOrderSaleKey,
  type SumupOpenOrder,
} from "@/lib/sumup-open-orders";

type Admin = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

/**
 * SumUp exposes open (unpaid) POS orders under a couple of different paths
 * depending on the account's POS product, so each candidate is probed until one
 * answers with rows. Failures are silent: a shop without the POS open-order
 * feature simply has none.
 */
export async function fetchSumupOpenOrders(
  key: string,
  merchantCode: string | null,
): Promise<SumupOpenOrder[]> {
  const urls = [
    merchantCode
      ? `https://api.sumup.com/v0.1/merchants/${encodeURIComponent(merchantCode)}/orders?status=open`
      : null,
    merchantCode
      ? `https://api.sumup.com/v0.1/merchants/${encodeURIComponent(merchantCode)}/sales?status=open`
      : null,
    "https://api.sumup.com/v0.1/me/orders?status=open",
  ].filter((url): url is string => Boolean(url));

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) continue;
      const orders = extractSumupOpenOrders(await res.json());
      if (orders.length) return withBaskets(orders, key, merchantCode);
    } catch {
      /* best effort — the paid sweep still runs */
    }
  }
  return [];
}

/**
 * The sales list only carries a summary; the basket lives on the single-sale
 * record. Load it so the kitchen gets real items instead of a blank ticket.
 */
async function withBaskets(
  orders: SumupOpenOrder[],
  key: string,
  merchantCode: string | null,
): Promise<SumupOpenOrder[]> {
  if (!merchantCode) return orders;
  return Promise.all(
    orders.map(async (order) => {
      if (order.products.length) return order;
      try {
        const res = await fetch(
          `https://api.sumup.com/v0.1/merchants/${encodeURIComponent(merchantCode)}/sales/${encodeURIComponent(order.id)}`,
          { headers: { Authorization: `Bearer ${key}` } },
        );
        if (!res.ok) return order;
        const detailed = normaliseSumupOpenOrder(await res.json());
        if (!detailed) return null; // settled or cancelled in the meantime
        return {
          ...detailed,
          name: detailed.name ?? order.name,
          totalCents: detailed.totalCents || order.totalCents,
        };
      } catch {
        return order;
      }
    }),
  ).then((list) => list.filter((order): order is SumupOpenOrder => Boolean(order)));
}

/**
 * Turns SumUp POS open orders into kitchen tickets. They ride on the house-tab
 * flow: unpaid, on account, and visible on the KDS the moment they are rung up.
 * Notes typed on the till (order level and per line) always travel with them.
 */
export async function importSumupOpenOrders({
  key,
  merchantCode,
  supabaseAdmin,
  menuByNameIndex,
}: {
  key: string;
  merchantCode: string | null;
  supabaseAdmin: Admin;
  menuByNameIndex: () => Promise<MenuIndex>;
}): Promise<{ imported: number; updated: number }> {
  // An open sale with no items and no value gives the kitchen nothing to cook.
  const orders = (await fetchSumupOpenOrders(key, merchantCode)).filter(
    (order) => order.products.length > 0 || order.totalCents > 0,
  );
  if (!orders.length) return { imported: 0, updated: 0 };

  const saleKeys = orders.map((order) => sumupOpenOrderSaleKey(order.id));
  const { data: existingRows } = await supabaseAdmin
    .from("orders")
    .select("id, delivery_notes, notes_manual, total_cents, sumup_sale_key, status")
    .in("sumup_sale_key", saleKeys);
  const existing = new Map((existingRows ?? []).map((row) => [row.sumup_sale_key as string, row]));

  let imported = 0;
  let updated = 0;

  for (const order of orders) {
    const saleKey = sumupOpenOrderSaleKey(order.id);
    const prior = existing.get(saleKey);
    const tab = parseSumupTabIntent(order.note);
    const tabName = tab?.kind === "open" ? tab.name : order.name;

    if (prior) {
      // The operator can keep adding to an open order; keep the ticket and its
      // note in step with the till instead of creating a second one.
      const patch: {
        delivery_notes?: string;
        subtotal_cents?: number;
        total_cents?: number;
      } = {};
      // A note typed on the KDS wins — otherwise the next sweep (seconds later)
      // would overwrite it with whatever the till holds.
      if (!prior.notes_manual && order.note && order.note !== prior.delivery_notes) {
        patch.delivery_notes = order.note;
      }
      if (order.totalCents && order.totalCents !== prior.total_cents) {
        patch.subtotal_cents = order.totalCents;
        patch.total_cents = order.totalCents;
      }
      if (Object.keys(patch).length) {
        await supabaseAdmin.from("orders").update(patch).eq("id", prior.id);
        updated++;
      }
      if (!prior.notes_manual) {
        await syncOpenOrderLines(supabaseAdmin, prior.id as string, order, menuByNameIndex);
      }
      continue;
    }

    let accountId: string | null = null;
    if (tabName) {
      const { data: account } = await supabaseAdmin
        .from("accounts")
        .select("id")
        .ilike("name", tabName)
        .eq("active", true)
        .maybeSingle();
      accountId = account?.id ?? null;
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_name: tabName ?? "SumUp open order",
        company_name: tabName ?? null,
        account_id: accountId,
        customer_phone: "",
        type: "collection",
        delivery_notes: order.note,
        status: "preparing",
        payment_status: "on_account",
        payment_method: "account",
        subtotal_cents: order.totalCents,
        delivery_fee_cents: 0,
        discount_cents: 0,
        promo_discount_cents: 0,
        voucher_cents: 0,
        points_earned: 0,
        total_cents: order.totalCents,
        schedule_mode: "asap",
        source: "sumup_pos",
        sumup_sale_key: saleKey,
        sumup_order_ref: saleKey,
      })
      .select("id")
      .single();
    if (error || !inserted) continue;

    await syncOpenOrderLines(supabaseAdmin, inserted.id, order, menuByNameIndex);
    imported++;
  }

  return { imported, updated };
}

async function syncOpenOrderLines(
  supabaseAdmin: Admin,
  orderId: string,
  order: SumupOpenOrder,
  menuByNameIndex: () => Promise<MenuIndex>,
) {
  if (!order.products.length) {
    const { count } = await supabaseAdmin
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);
    if (!count) {
      await supabaseAdmin.from("order_items").insert([
        {
          order_id: orderId,
          menu_item_id: null,
          category_label: null,
          name: "SumUp open order",
          qty: 1,
          unit_price_cents: order.totalCents,
          notes: order.note,
        },
      ]);
    }
    return;
  }

  const menu = await menuByNameIndex();
  const lines = order.products.map((product) => {
    const m = matchSumupLine(menu, {
      name: product.name,
      priceCents: Math.round(product.price * 100),
      category: product.category ?? null,
    });
    return {
      order_id: orderId,
      menu_item_id: m.item?.id ?? null,
      category_label: m.category,
      name: m.name,
      qty: product.quantity,
      unit_price_cents: Math.round(product.price * 100),
      notes: product.note,
    };
  });

  const { data: current } = await supabaseAdmin
    .from("order_items")
    .select("id, name, qty, notes")
    .eq("order_id", orderId);

  const sameShape =
    (current ?? []).length === lines.length &&
    lines.every((line) =>
      (current ?? []).some(
        (row) =>
          (row.name ?? "").trim().toLowerCase() === line.name.trim().toLowerCase() &&
          row.qty === line.qty &&
          (row.notes ?? null) === (line.notes ?? null),
      ),
    );
  if (sameShape) return;

  await supabaseAdmin.from("order_items").delete().eq("order_id", orderId);
  await supabaseAdmin.from("order_items").insert(lines);
}

/**
 * When an open order is finally settled, SumUp emits a normal payment
 * transaction. Reuse the ticket the kitchen already has instead of printing the
 * same food twice.
 */
export async function claimSettledOpenOrder(
  supabaseAdmin: Admin,
  input: {
    totalCents: number;
    name: string | null;
    paymentMethod: string;
    saleKey: string;
    transactionId: string;
    reference: string | null;
  },
): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let query = supabaseAdmin
    .from("orders")
    .select("id, company_name")
    .eq("source", "sumup_pos")
    .eq("payment_status", "on_account")
    .eq("total_cents", input.totalCents)
    .like("sumup_sale_key", "open:%")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5);
  if (input.name) query = query.ilike("company_name", input.name);
  const { data: candidates } = await query;
  const match = candidates?.[0];
  if (!match) return false;

  await supabaseAdmin
    .from("orders")
    .update({
      payment_status: "paid",
      payment_method: input.paymentMethod,
      sumup_sale_key: input.saleKey,
      sumup_transaction_id: input.transactionId,
      sumup_reference: input.reference,
    })
    .eq("id", match.id);
  return true;
}
