import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { validateModifierSelection, type ModifierRule } from "./modifier-rules";

function createServerSupabase(bearer?: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        if (bearer) h.set("Authorization", `Bearer ${bearer}`);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** Default rate suggested when approving a member in the admin dashboard. */
export const LOYALTY_DISCOUNT_RATE = 0.1;
export const POINTS_PER_POUND = 1;

type OrderMenuRow = {
  id: string;
  name: string;
  price_cents: number;
  active: boolean;
  category_id: string | null;
  loyalty_drink: boolean;
  is_beverage: boolean;
};

type OrderModifierRow = ModifierRule & {
  price_cents: number;
  active: boolean;
  category_id: string | null;
  item_id: string | null;
};

const CartItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  qty: z.number().int().min(1).max(50),
  notes: z.string().max(200).optional(),
  modifier_ids: z.array(z.string().uuid()).max(20).optional(),
});

const CreateOrderSchema = z.object({
  type: z.enum(["delivery", "collection", "dine_in"]),
  customer_name: z.string().min(1).max(100),
  customer_phone: z.string().max(30).optional().default(""),
  customer_email: z.string().email().optional().or(z.literal("")),
  company_name: z.string().max(120).optional(),
  address_line1: z.string().max(200).optional(),
  address_line2: z.string().max(200).optional(),
  city: z.string().max(80).optional(),
  postcode: z.string().max(20).optional(),
  delivery_notes: z.string().max(500).optional(),
  table_number: z.string().max(20).optional(),
  schedule_mode: z.enum(["asap", "scheduled"]).default("asap"),
  scheduled_for: z.string().datetime().optional(),
  items: z.array(CartItemSchema).min(1).max(50),
  account_code: z.string().min(3).max(40).optional(),
  promo_code: z.string().min(1).max(40).optional(),
  voucher_code: z.string().min(1).max(40).optional(),
  voucher_pin: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  jury_room: z.string().max(60).optional(),
});

export const createOrder = createServerFn({ method: "POST" })
  .validator((d: unknown) => CreateOrderSchema.parse(d))
  .handler(async ({ data }) => {
    // Optional auth: signed-in customers get discount + points.
    // Clear out any baskets left unpaid for more than 5 minutes first.
    try {
      const { purgeStaleUnpaidOrders } = await import("./order-cleanup.server");
      await purgeStaleUnpaidOrders();
    } catch (e) {
      console.error("[orders] unpaid purge failed", e);
    }
    const req = getRequest();
    const authHeader = req?.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const validToken = token && token.split(".").length === 3 ? token : "";
    const supabase = createServerSupabase(validToken || undefined);
    let userId: string | null = null;
    let authEmail: string | null = null;
    if (validToken) {
      const { data: u } = await supabase.auth.getUser(validToken);
      userId = u.user?.id ?? null;
      authEmail = u.user?.email ?? null;
    }

    const ids = data.items.map((i) => i.menu_item_id);
    const { data: menu, error: menuErr } = await supabase
      .from("menu_items")
      .select("id,name,price_cents,active,category_id,loyalty_drink,is_beverage")
      .in("id", ids);
    if (menuErr) throw new Error(menuErr.message);
    const menuRows = (menu ?? []) as OrderMenuRow[];
    const categoryIds = [...new Set(menuRows.map((item) => item.category_id).filter(Boolean))] as string[];
    const [itemModifiers, categoryModifiers] = await Promise.all([
      supabase
        .from("menu_modifiers")
        .select("id,name,price_cents,active,category_id,item_id,group_name,group_type,required,min_selections,max_selections,is_exclusive")
        .eq("active", true)
        .in("item_id", ids),
      categoryIds.length
        ? supabase
            .from("menu_modifiers")
            .select("id,name,price_cents,active,category_id,item_id,group_name,group_type,required,min_selections,max_selections,is_exclusive")
            .eq("active", true)
            .in("category_id", categoryIds)
            .is("item_id", null)
        : Promise.resolve({ data: [], error: null } as const),
    ]);
    if (itemModifiers.error) throw new Error(itemModifiers.error.message);
    if (categoryModifiers.error) throw new Error(categoryModifiers.error.message);
    const modRows = [
      ...(itemModifiers.data ?? []),
      ...(categoryModifiers.data ?? []),
    ] as OrderModifierRow[];
    const byId = new Map(menuRows.map((m) => [m.id, m]));
    const modById = new Map(modRows.map((m) => [m.id, m]));

    let subtotal = 0;
    // Food (non-beverage) value — the juror scheme's 10% only applies to food.
    let food_subtotal = 0;
    // Base prices of every loyalty-eligible drink unit in this order (for "11th free").
    const drinkUnitPrices: number[] = [];
    const lines = data.items.map((i) => {
      const m = byId.get(i.menu_item_id);
      if (!m || !m.active) throw new Error(`Item unavailable`);
      const requestedIds = i.modifier_ids ?? [];
      if (new Set(requestedIds).size !== requestedIds.length) {
        throw new Error("The same add-on cannot be selected twice");
      }
      const applicable = modRows.filter(
        (mod) => mod.item_id === m.id || (!mod.item_id && mod.category_id === m.category_id),
      );
      const chosen = requestedIds.map((id) => {
        const mod = modById.get(id);
        if (
          !mod ||
          !mod.active ||
          !(mod.item_id === m.id || (!mod.item_id && mod.category_id === m.category_id))
        ) {
          throw new Error("An add-on you chose is no longer available");
        }
        return mod;
      });
      const modifierErrors = validateModifierSelection(
        applicable,
        requestedIds,
      );
      if (modifierErrors.length) throw new Error(modifierErrors[0]);
      const unit = m.price_cents + chosen.reduce((s, mod) => s + mod.price_cents, 0);
      subtotal += unit * i.qty;
      if (!m.is_beverage) food_subtotal += unit * i.qty;
      if (m.loyalty_drink) {
        for (let n = 0; n < i.qty; n++) drinkUnitPrices.push(m.price_cents);
      }
      const noteParts = [...chosen.map((mod) => mod.name), ...(i.notes ? [i.notes] : [])];
      return {
        menu_item_id: m.id,
        name: m.name,
        qty: i.qty,
        unit_price_cents: unit,
        notes: noteParts.length ? noteParts.join(" · ") : null,
      };
    });

    // Load business settings + hours for pricing + open/closed enforcement.
    const [{ data: settings }, { data: hoursRows }] = await Promise.all([
      supabase.from("business_settings").select("*").limit(1).maybeSingle(),
      supabase.from("business_hours").select("*").order("day_of_week"),
    ]);

    if (settings && !settings.accepting_orders) {
      throw new Error(settings.closed_message || "Sorry, we're not accepting orders right now.");
    }
    if (settings && subtotal < (settings.min_order_cents ?? 0)) {
      const min = (settings.min_order_cents / 100).toFixed(2);
      throw new Error(`Minimum order is £${min}.`);
    }
    // Enforce opening hours for ASAP orders. Scheduled pre-orders may be allowed even if closed now.
    if (data.schedule_mode === "asap" && hoursRows && settings) {
      const { computeStoreStatus } = await import("./business");
      const status = computeStoreStatus(hoursRows as never, settings as never);
      if (!status.open && !settings.allow_preorder_when_closed) {
        throw new Error("We're closed right now. Please try a scheduled order.");
      }
    }

    const baseDeliveryFee = settings?.delivery_fee_cents ?? 299;

    // Delivery-only rules: service window + half-mile radius from the shop.
    if (data.type === "delivery" && settings) {
      const ds = settings as unknown as import("./delivery.server").DeliverySettings;
      const { isWithinDeliveryWindow, formatWindow, checkDeliveryArea } =
        await import("./delivery.server");
      const when =
        data.schedule_mode === "scheduled" && data.scheduled_for
          ? new Date(data.scheduled_for)
          : new Date();
      if (!isWithinDeliveryWindow(ds, when)) {
        throw new Error(
          `We deliver between ${formatWindow(ds)}. Please pick a delivery time in that window, or choose collection.`,
        );
      }
      const area = await checkDeliveryArea(data.postcode ?? "", ds);
      if (!area.ok) throw new Error(area.reason);
    }

    // Fraud control: a juror voucher order may only be delivered inside the
    // court estate (Crown Court or Magistrates' Court) — never to a home or
    // office address.
    if (data.type === "delivery" && data.voucher_code) {
      const { isCourtDeliveryAddress, JUROR_DELIVERY_RULE_MESSAGE } = await import("./juror");
      if (!isCourtDeliveryAddress(data.address_line1, data.postcode)) {
        throw new Error(JUROR_DELIVERY_RULE_MESSAGE);
      }
    }

    const freeThreshold = settings?.free_delivery_threshold_cents ?? null;
    let delivery_fee =
      data.type === "delivery"
        ? freeThreshold && subtotal >= freeThreshold
          ? 0
          : baseDeliveryFee
        : 0;

    // Validate and apply promo code (public RPC).
    let promo_discount = 0;
    let applied_promo: string | null = null;
    let free_delivery_promo = false;
    if (data.promo_code) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows, error: pErr } = await supabaseAdmin.rpc("validate_promo_code", {
        _code: data.promo_code.trim().toUpperCase(),
        _subtotal_cents: subtotal,
        _order_type: data.type,
        _email: (data.customer_email || authEmail || "").trim() || undefined,
      });
      if (pErr) throw new Error(pErr.message);
      const row = (rows ?? [])[0];
      if (!row || !row.valid) throw new Error(row?.message || "That promo code isn't valid.");
      applied_promo = row.code;
      if (row.discount_type === "free_delivery") {
        free_delivery_promo = true;
        delivery_fee = 0;
      } else {
        promo_discount = Math.min(row.discount_cents ?? 0, subtotal);
      }
    }

    // Percentage discount: ONLY for approved members listed in the backend
    // (Admin → Approved members). Simply being signed in earns points, not a
    // discount.
    let discount_percent = 0;
    const discountEmail = (data.customer_email || authEmail || "").trim();
    if (discountEmail) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: dRows } = await supabaseAdmin.rpc("get_customer_discount", {
        _email: discountEmail,
      });
      const p = (dRows ?? [])[0]?.percent ?? 0;
      if (p > discount_percent) discount_percent = p;
    }
    const loyalty_discount = Math.round(subtotal * (discount_percent / 100));

    // Coffee/tea loyalty: every 10 drinks earns a free one, auto-redeemed on the
    // next order that contains an eligible drink. Registered customers only.
    let stamps_before = 0;
    let free_drinks_available = 0;
    let free_drinks_used = 0;
    let free_drink_discount = 0;
    if (userId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("drink_stamps, free_drinks_available")
        .eq("id", userId)
        .maybeSingle();
      stamps_before = prof?.drink_stamps ?? 0;
      free_drinks_available = prof?.free_drinks_available ?? 0;
      if (free_drinks_available > 0 && drinkUnitPrices.length > 0) {
        const cheapestFirst = [...drinkUnitPrices].sort((a, b) => a - b);
        free_drinks_used = Math.min(free_drinks_available, cheapestFirst.length);
        free_drink_discount = cheapestFirst.slice(0, free_drinks_used).reduce((s, p) => s + p, 0);
      }
    }

    const discount = Math.min(subtotal, loyalty_discount + promo_discount + free_drink_discount);
    // Drinks paid for on this order earn stamps (free ones don't).
    const stamps_earned = Math.max(0, drinkUnitPrices.length - free_drinks_used);
    const stamps_total = stamps_before + stamps_earned;
    const new_free_drinks = Math.floor(stamps_total / 10);
    const drink_stamps_after = stamps_total % 10;
    const free_drinks_after = free_drinks_available - free_drinks_used + new_free_drinks;
    const total = Math.max(0, subtotal - discount) + delivery_fee;
    const points_earned = userId
      ? Math.floor(Math.max(0, subtotal - discount) / 100) * POINTS_PER_POUND
      : 0;
    const reference = `WEBSITE-ORDER-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { randomBytes, randomUUID } = await import("node:crypto");
    const { hashTrackingToken } = await import("./order-access.server");
    const tracking_token = randomBytes(32).toString("base64url");
    const tracking_token_hash = hashTrackingToken(tracking_token);

    // Court vouchers: code + separately issued PIN, with a tokenised reservation
    // so one failed checkout can never release another concurrent order's hold.
    let voucher_cents = 0;
    let voucher_holder_id: string | null = null;
    let voucher_holder_name: string | null = null;
    let voucher_reservation_token: string | null = null;
    let voucher_opted_in = false;
    {
      const vCode = (data.voucher_code || "").trim();
      if (vCode) {
        if (!data.voucher_pin) throw new Error("Enter the six-digit voucher PIN.");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { callOperationsRpc } = await import("./ops-rpc");
        voucher_reservation_token = randomUUID();
        const reserved = await callOperationsRpc<
          Array<{
            holder_id: string;
            holder_name: string | null;
            voucher_code: string;
            reserved_cents: number;
            reservation_token: string;
          }>
        >(supabaseAdmin, "reserve_juror_voucher", {
          _code: vCode,
          _pin: data.voucher_pin,
          _amount_cents: total,
          _reservation_token: voucher_reservation_token,
          _channel: "online",
        });
        const v = reserved[0];
        if (!v) throw new Error("That voucher could not be reserved.");
        voucher_cents = v.reserved_cents;
        voucher_holder_id = v.holder_id;
        voucher_holder_name = v.holder_name ?? v.voucher_code;
        // The 10% food discount is a scheme member benefit: only jurors who
        // have opted into the scheme qualify. The voucher itself still works.
        const { data: holder } = await supabaseAdmin
          .from("voucher_holders")
          .select("opted_in_at")
          .eq("id", v.holder_id)
          .maybeSingle();
        voucher_opted_in = !!holder?.opted_in_at;
      }
    }

    async function releaseVoucher() {
      if (!voucher_reservation_token || voucher_cents <= 0) return;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { callOperationsRpc } = await import("./ops-rpc");
      await callOperationsRpc<boolean>(supabaseAdmin, "release_juror_voucher_reservation", {
        _reservation_token: voucher_reservation_token,
        _reason: "Online checkout did not complete",
      });
      voucher_reservation_token = null;
    }

    // Juror scheme benefit: 10% off food (drinks excluded) on anything payable
    // above the daily allowance. The voucher is always applied first.
    const { JUROR_FOOD_DISCOUNT_PERCENT } = await import("./juror");
    let juror_discount = 0;
    let payable = Math.max(0, total - voucher_cents);
    if (voucher_holder_id && voucher_opted_in && payable > 0 && food_subtotal > 0) {
      juror_discount = Math.round(
        (Math.min(food_subtotal, payable) * JUROR_FOOD_DISCOUNT_PERCENT) / 100,
      );
      payable = Math.max(0, payable - juror_discount);
    }

    // Charge to a house-account tab if a valid code is supplied.
    let account_id: string | null = null;
    if (data.account_code) {
      const { supabaseAdmin: sbAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows, error: acctErr } = await sbAdmin.rpc("verify_account_code", {
        _code: data.account_code.trim(),
      });
      if (acctErr) {
        await releaseVoucher();
        throw new Error(acctErr.message);
      }
      const row = (rows ?? [])[0];
      if (!row) {
        await releaseVoucher();
        throw new Error("That tab access code isn't valid or is no longer active.");
      }
      account_id = row.id;

      // Enforce the account's credit limit against the unsettled balance.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: acct } = await supabaseAdmin
        .from("accounts")
        .select("credit_limit_cents")
        .eq("id", account_id)
        .maybeSingle();
      if (acct?.credit_limit_cents) {
        const { data: openOrders } = await supabaseAdmin
          .from("orders")
          .select("total_cents")
          .eq("account_id", account_id)
          .eq("payment_status", "on_account");
        const outstanding = (openOrders ?? []).reduce((s, o) => s + o.total_cents, 0);
        if (outstanding + payable > acct.credit_limit_cents) {
          await releaseVoucher();
          throw new Error(
            `This tab has reached its credit limit of £${(acct.credit_limit_cents / 100).toFixed(2)}. Please settle the outstanding balance first.`,
          );
        }
      }
    }

    // Create SumUp checkout FIRST — if it fails, don't create a phantom unpaid order.
    let checkout_id: string | null = null;
    if (!account_id && payable > 0) {
      const { createSumUpCheckout } = await import("./sumup.server");
      const itemSummary = lines
        .map((l) => `${l.qty}x ${l.name}${l.notes ? ` (${l.notes})` : ""}`)
        .join("; ");
      const sumupDescription = `WEBSITE ORDER — ${data.customer_name} — ${itemSummary}`;
      const compactSumupDescription =
        sumupDescription.length > 500 ? `${sumupDescription.slice(0, 497)}...` : sumupDescription;
      try {
        const publicAppUrl = (
          process.env["PUBLIC_APP_URL"] ?? "https://cafe1stalbans.co.uk"
        ).replace(/\/+$/, "");
        const co = await createSumUpCheckout({
          reference,
          amount_cents: payable,
          description: compactSumupDescription,
          customer_email: data.customer_email || undefined,
          return_url: `${publicAppUrl}/api/public/sumup-webhook`,
        });
        checkout_id = co.id;
      } catch (e) {
        console.error("[SumUp] checkout create failed", e);
        await releaseVoucher();
        throw new Error(
          "We couldn't start the card payment. Please try again in a moment, or contact us if it keeps failing.",
        );
      }
    }

    // Voucher covers the whole order (and it isn't on a tab) — nothing to charge.
    const fully_covered = !account_id && payable === 0 && voucher_cents > 0;

    // Guest checkout: anon can INSERT but not SELECT orders (PII protection), so
    // the row is written with the privileged server client after all validation.
    const { supabaseAdmin: sbWrite } = await import("@/integrations/supabase/client.server");

    // Claim the promo use atomically BEFORE the order exists, so a limited code
    // can never go past max_uses when several people check out at once.
    if (applied_promo) {
      const { data: claimed, error: claimErr } = await sbWrite.rpc("consume_promo_use", {
        _code: applied_promo,
      });
      if (claimErr) throw new Error(claimErr.message);
      if (!claimed) throw new Error("That promo code has just reached its usage limit.");
    }

    const { data: order, error: orderErr } = await sbWrite
      .from("orders")
      .insert({
        customer_id: userId,
        account_id,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email || null,
        type: data.type,
        address_line1: data.address_line1 || null,
        address_line2: data.address_line2 || null,
        city: data.city || null,
        postcode: data.postcode || null,
        delivery_notes: data.delivery_notes || null,
        jury_room: data.jury_room || null,
        juror_discount_cents: juror_discount,
        company_name: data.company_name || null,
        table_number: data.table_number || null,
        schedule_mode: data.schedule_mode,
        scheduled_for: data.schedule_mode === "scheduled" ? (data.scheduled_for ?? null) : null,
        subtotal_cents: subtotal,
        delivery_fee_cents: delivery_fee,
        discount_cents: discount,
        voucher_cents,
        voucher_holder_id,
        points_earned,
        loyalty_stamps_pending: stamps_earned,
        total_cents: payable,
        sumup_reference: reference,
        sumup_checkout_id: checkout_id,
        tracking_token_hash,
        promo_code: applied_promo,
        promo_discount_cents: free_delivery_promo ? 0 : promo_discount,
        ...(account_id
          ? { payment_status: "on_account" as const, status: "preparing" as const }
          : {}),
        ...(fully_covered ? { payment_status: "paid" as const, status: "paid" as const } : {}),
        ...(account_id || fully_covered ? { loyalty_awarded: true } : {}),
      })
      .select()
      .single();
    if (orderErr) {
      await releaseVoucher();
      throw new Error(orderErr.message);
    }

    // Attach the reserved voucher redemption to this order for the court report.
    if (voucher_holder_id && voucher_cents > 0 && voucher_reservation_token) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { callOperationsRpc } = await import("./ops-rpc");
        const attached = await callOperationsRpc<boolean>(
          supabaseAdmin,
          "attach_juror_voucher_reservation",
          { _reservation_token: voucher_reservation_token, _order_id: order.id },
        );
        if (!attached) throw new Error("Voucher reservation was not attached");
      } catch (e) {
        console.error("[vouchers] could not attach redemption to order", e);
        throw new Error("The voucher could not be attached to this order. Please try again.");
      }
    }

    const { error: itemsErr } = await sbWrite
      .from("order_items")
      .insert(lines.map((l) => ({ ...l, order_id: order.id })));
    if (itemsErr) throw new Error(itemsErr.message);

    // Promo usage was already claimed atomically above (consume_promo_use).

    // Loyalty rewards are only granted once the order is actually paid.
    // Free drinks being redeemed are deducted immediately so the same free
    // drink can't be spent twice while a payment is in flight.
    const settled_now = !!account_id || fully_covered;
    if (userId && (settled_now || free_drinks_used > 0)) {
      const { data: prof } = await supabase
        .from("profiles")
        .select(
          "loyalty_points, lifetime_points, free_drinks_redeemed, drink_stamps, free_drinks_available",
        )
        .eq("id", userId)
        .maybeSingle();
      await supabase
        .from("profiles")
        .update(
          settled_now
            ? {
                loyalty_points: (prof?.loyalty_points ?? 0) + points_earned,
                lifetime_points: (prof?.lifetime_points ?? 0) + points_earned,
                drink_stamps: drink_stamps_after,
                free_drinks_available: free_drinks_after,
                free_drinks_redeemed: (prof?.free_drinks_redeemed ?? 0) + free_drinks_used,
              }
            : {
                // unpaid: no points, no new stamps — only the redemption is held
                free_drinks_available: Math.max(
                  0,
                  (prof?.free_drinks_available ?? 0) - free_drinks_used,
                ),
                free_drinks_redeemed: (prof?.free_drinks_redeemed ?? 0) + free_drinks_used,
              },
        )
        .eq("id", userId);
    }

    return {
      order_id: order.id,
      order_number: order.order_number,
      total_cents: payable,
      gross_total_cents: total,
      voucher_cents,
      voucher_holder_name,
      checkout_id,
      tracking_token,
      payment_configured: !!checkout_id || fully_covered,
      on_tab: !!account_id,
      fully_covered,
      free_drinks_used,
      drink_stamps: drink_stamps_after,
      free_drinks_available: free_drinks_after,
    };
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        status: z.enum([
          "paid",
          "preparing",
          "ready",
          "out_for_delivery",
          "delivered",
          "completed",
          "cancelled",
          "refunded",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const patch = {
      status: data.status,
      ...(data.status === "ready" ? { ready_at: now } : {}),
      ...(data.status === "out_for_delivery" ? { picked_up_at: now } : {}),
      ...(data.status === "delivered" || data.status === "completed" ? { delivered_at: now } : {}),
    };
    const { error } = await context.supabase.from("orders").update(patch).eq("id", data.order_id);
    if (error) throw new Error(error.message);

    // If this ticket originated on Deliveroo, mirror the status back to their
    // Orders API so the courier + customer app stay in sync.
    try {
      const { data: o } = await context.supabase
        .from("orders")
        .select("source, deliveroo_order_id")
        .eq("id", data.order_id)
        .maybeSingle();
      if (o?.source === "deliveroo" && o.deliveroo_order_id) {
        const { pushDeliverooStatus } = await import("./deliveroo-sync.server");
        await pushDeliverooStatus(o.deliveroo_order_id, data.status);
      }
    } catch (e) {
      console.error("[deliveroo] mirror status failed", e);
    }

    return { ok: true };
  });

export const setOrderFulfilment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        type: z.enum(["dine_in", "collection", "delivery"]),
        table_number: z.string().max(10).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("orders")
      .update({
        type: data.type,
        table_number: data.type === "dine_in" ? (data.table_number ?? null) : null,
      })
      .eq("id", data.order_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Move a ticket to a different area (jury / judges / public / web / a delivery
 * partner) when it landed on the wrong side. Staff cannot update orders
 * directly under RLS, so this goes through the audited database function.
 */
export const setOrderChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        channel: z.enum([
          "jury",
          "judge",
          "public",
          "web",
          "deliveroo",
          "just_eat",
          "uber_eats",
          "tgtg",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Call through the client object so the SDK retains its internal REST
    // context. Aliasing or binding `rpc` can leave that context undefined.
    const { error } = await context.supabase.rpc("cafe1_reassign_order_channel", {
      _order_id: data.order_id,
      _channel: data.channel,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markPaidManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ order_id: z.string().uuid(), sumup_transaction_id: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("orders")
      .update({
        payment_status: "paid",
        status: "paid",
        sumup_transaction_id: data.sumup_transaction_id ?? null,
      })
      .eq("id", data.order_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ order_id: z.string().uuid(), driver_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("orders")
      .update({
        driver_id: data.driver_id,
        status: "out_for_delivery",
        picked_up_at: new Date().toISOString(),
      })
      .eq("id", data.order_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDrivers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "driver");
    if (error) throw new Error(error.message);
    const ids = (roles ?? []).map((r) => r.user_id);
    if (!ids.length) return [] as { id: string; full_name: string | null; email: string | null }[];
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    return (profs ?? []) as { id: string; full_name: string | null; email: string | null }[];
  });

/**
 * A driver picks up an unassigned delivery job themselves (shift working).
 * Fails if another driver claimed it first.
 */
export const claimDeliveryJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: isDriver }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "driver" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    if (!isDriver && !isAdmin) throw new Error("Forbidden");

    const { data: rows, error } = await context.supabase
      .from("orders")
      .update({
        driver_id: context.userId,
        status: "out_for_delivery" as const,
        picked_up_at: new Date().toISOString(),
      })
      .eq("id", data.order_id)
      .is("driver_id", null)
      .eq("type", "delivery")
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Another driver already took that job.");
    return { ok: true };
  });
