import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createOrder } from "@/lib/orders.functions";
import { lookupVoucher } from "@/lib/vouchers.functions";
import { checkDeliveryPostcode } from "@/lib/delivery.functions";
import { supabase } from "@/integrations/supabase/client";
import { getEmailDiscount, validatePromo } from "@/lib/checkout.functions";
import { cart, useCart } from "@/lib/cart";
import { money } from "@/lib/format";
import { SiteHeader } from "@/components/site-header";
import { useSession } from "@/hooks/use-auth";
import { tab, useTab } from "@/lib/tab";
import { toast } from "sonner";
import { useStoreStatus } from "@/hooks/use-store-status";
import { buildScheduleSlots } from "@/lib/business";
import { useOrderContext, describeContext } from "@/lib/order-context";
import { OrderSetupGate } from "@/components/order-setup-gate";
import { useJurySession } from "@/lib/jury-session";
import { Settings2 } from "lucide-react";
import {
  JUROR_CODE_KEY,
  JUROR_FOOD_DISCOUNT_PERCENT,
  jurorFoodDiscount,
  JUROR_DELIVERY_VENUES,
  isCourtDeliveryAddress,
} from "@/lib/juror";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Cafe1" },
      { name: "description", content: "Complete your Cafe1 order — pay securely with SumUp." },
      { property: "og:title", content: "Checkout — Cafe1" },
      {
        property: "og:description",
        content: "Complete your Cafe1 order — pay securely with SumUp.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Checkout,
});

type Mode = "delivery" | "collection" | "dine_in";
type ScheduleMode = "asap" | "scheduled";

function Checkout() {
  const c = useCart();
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const tabSession = useTab();
  const { status, settings, hours, holidays } = useStoreStatus();
  const place = useServerFn(createOrder);
  const findVoucher = useServerFn(lookupVoucher);
  const checkArea = useServerFn(checkDeliveryPostcode);
  const fetchEmailDiscount = useServerFn(getEmailDiscount);
  const checkPromo = useServerFn(validatePromo);
  const ctx = useOrderContext();
  const jurySessionActive = useJurySession();
  const [gateOpen, setGateOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(ctx?.mode ?? "collection");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(ctx?.schedule_mode ?? "asap");
  const [scheduledFor, setScheduledFor] = useState<string>(ctx?.scheduled_for ?? "");
  const timeSlots = useMemo(
    () => buildScheduleSlots({ hours, holidays, settings, mode }),
    [hours, holidays, settings, mode],
  );
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<null | {
    code: string;
    discount_cents: number;
    discount_type: string;
    message: string | null;
  }>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    company_name: "",
    address_line1: "",
    city: "",
    postcode: ctx?.postcode ?? "",
    delivery_notes: "",
    table_number: "",
  });
  const [busy, setBusy] = useState(false);
  const [area, setArea] = useState<null | { ok: boolean; message: string }>(
    ctx?.mode === "delivery" && ctx.postcode && ctx.distance_m != null
      ? {
          ok: true,
          message: `You're in our delivery area (${(ctx.distance_m / 1609.34).toFixed(2)} mi away).`,
        }
      : null,
  );
  const [areaBusy, setAreaBusy] = useState(false);

  // Clear a scheduled slot that no longer matches opening hours / delivery window.
  useEffect(() => {
    if (scheduledFor && timeSlots.length && !timeSlots.some((s) => s.value === scheduledFor)) {
      setScheduledFor("");
    }
  }, [timeSlots, scheduledFor]);

  // Keep local state in sync when the setup gate updates the shared context.
  useEffect(() => {
    if (!ctx) return;
    setMode(ctx.mode);
    setScheduleMode(ctx.schedule_mode);
    setScheduledFor(ctx.scheduled_for ?? "");
    if (ctx.mode === "delivery") {
      setForm((f) => ({ ...f, postcode: ctx.postcode ?? f.postcode }));
      if (ctx.distance_m != null) {
        setArea({
          ok: true,
          message: `You're in our delivery area (${(ctx.distance_m / 1609.34).toFixed(2)} mi away).`,
        });
      }
    }
  }, [ctx]);

  async function verifyPostcode(pc: string) {
    if (!pc.trim()) {
      setArea(null);
      return;
    }
    setAreaBusy(true);
    try {
      const res = await checkArea({ data: { postcode: pc } });
      setArea(
        res.ok
          ? {
              ok: true,
              message: `Great — you're in our delivery area (${((res.distance_m ?? 0) / 1609.34).toFixed(2)} miles away).`,
            }
          : { ok: false, message: res.reason },
      );
    } catch {
      setArea(null);
    } finally {
      setAreaBusy(false);
    }
  }

  useEffect(() => {
    if (user?.email && !form.customer_email)
      setForm((f) => ({ ...f, customer_email: user.email ?? "" }));
  }, [user, form.customer_email]);

  // Fixed per-customer discount, recognised from the email address.
  const [emailDiscount, setEmailDiscount] = useState<null | {
    percent: number;
    label: string | null;
  }>(null);
  const emailForDiscount = (form.customer_email || "").trim().toLowerCase();
  useEffect(() => {
    if (!emailForDiscount || !emailForDiscount.includes("@")) {
      setEmailDiscount(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const row = await fetchEmailDiscount({ data: { email: emailForDiscount } });
        if (cancelled) return;
        setEmailDiscount(row);
      } catch {
        if (!cancelled) setEmailDiscount(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [emailForDiscount, fetchEmailDiscount]);

  // Coffee/tea loyalty: stamps on the profile + which cart lines are eligible drinks.
  const [stamps, setStamps] = useState<{
    drink_stamps: number;
    free_drinks_available: number;
  } | null>(null);
  const [drinkItemIds, setDrinkItemIds] = useState<string[]>([]);
  const cartItemIds = c.items.map((i) => i.menu_item_id).join(",");
  useEffect(() => {
    if (!user) {
      setStamps(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("drink_stamps, free_drinks_available")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled)
          setStamps(
            data
              ? {
                  drink_stamps: data.drink_stamps ?? 0,
                  free_drinks_available: data.free_drinks_available ?? 0,
                }
              : null,
          );
      });
    return () => {
      cancelled = true;
    };
  }, [user]);
  useEffect(() => {
    const ids = cartItemIds ? cartItemIds.split(",") : [];
    if (!ids.length) {
      setDrinkItemIds([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("menu_items")
      .select("id")
      .in("id", ids)
      .eq("loyalty_drink", true)
      .then(({ data }) => {
        if (!cancelled) setDrinkItemIds((data ?? []).map((r) => r.id));
      });
    return () => {
      cancelled = true;
    };
  }, [cartItemIds]);

  useEffect(() => {
    const ids = cartItemIds ? cartItemIds.split(",") : [];
    if (!ids.length) {
      setBeverageIds([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("menu_items")
      .select("id")
      .in("id", ids)
      .eq("is_beverage", true)
      .then(({ data }) => {
        if (!cancelled) setBeverageIds((data ?? []).map((r) => r.id));
      });
    return () => {
      cancelled = true;
    };
  }, [cartItemIds]);

  const subtotal = c.items.reduce((s, i) => s + i.price_cents * i.qty, 0);
  const baseDelivery = settings?.delivery_fee_cents ?? 299;
  const freeThreshold = settings?.free_delivery_threshold_cents ?? null;
  const freeDeliveryByThreshold =
    mode === "delivery" && !!freeThreshold && subtotal >= (freeThreshold ?? 0);
  const freeDeliveryByPromo = promo?.discount_type === "free_delivery";
  const delivery =
    mode === "delivery" && !freeDeliveryByThreshold && !freeDeliveryByPromo ? baseDelivery : 0;
  const onTab = !!tabSession;
  // Discounts are only for approved members set up in the admin dashboard.
  const discountPercent = emailDiscount?.percent ?? 0;
  const loyaltyDiscount = Math.round(subtotal * (discountPercent / 100));
  const promoDiscount =
    promo && !freeDeliveryByPromo ? Math.min(promo.discount_cents, subtotal) : 0;
  // Free drinks earned (every 11th) auto-apply to the cheapest eligible drinks.
  const drinkUnitPrices = c.items
    .filter((i) => drinkItemIds.includes(i.menu_item_id))
    .flatMap((i) => Array.from({ length: i.qty }, () => i.base_price_cents))
    .sort((a, b) => a - b);
  const freeDrinksUsed = Math.min(stamps?.free_drinks_available ?? 0, drinkUnitPrices.length);
  const freeDrinkDiscount = drinkUnitPrices.slice(0, freeDrinksUsed).reduce((s, p) => s + p, 0);
  const stampsAfter =
    ((stamps?.drink_stamps ?? 0) + Math.max(0, drinkUnitPrices.length - freeDrinksUsed)) % 10;
  const discount = Math.min(subtotal, loyaltyDiscount + promoDiscount + freeDrinkDiscount);
  const grossTotal = Math.max(0, subtotal - discount) + delivery;
  // Court voucher: the juror's HMCTS Juror ID is also their voucher code.
  const [voucherInput, setVoucherInput] = useState("");
  const [voucherPin, setVoucherPin] = useState("");
  const [voucher, setVoucher] = useState<null | {
    code: string;
    pin: string;
    remaining_cents: number;
    allocated_cents: number;
    attendance_required: boolean;
    attendance_verified: boolean;
    opted_in: boolean;
  }>(null);
  const [beverageIds, setBeverageIds] = useState<string[]>([]);
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [juryRoom, setJuryRoom] = useState(ctx?.jury_room ?? "");
  const [voucherError, setVoucherError] = useState<string | null>(null);
  async function applyVoucher() {
    const code = voucherInput.trim().toUpperCase();
    if (!code || !/^\d{6}$/.test(voucherPin)) return;
    setVoucherBusy(true);
    setVoucherError(null);
    try {
      const res = await findVoucher({ data: { code, pin: voucherPin } });
      if (!res.found) {
        setVoucher(null);
        setVoucherError(
          ("message" in res && res.message) ||
            "Sorry, that voucher code isn't valid. Please double-check it and try again.",
        );
      } else if (!res.usable) {
        setVoucher(null);
        setVoucherError(
          res.message ??
            "Sorry, that voucher code can't be used today. Please check with the Jury Officer.",
        );
      } else if (res.remaining_cents <= 0) {
        setVoucher(null);
        setVoucherError("Sorry, this voucher has no allowance left for today.");
      } else if (res.attendance_required && !res.attendance_verified) {
        setVoucher(null);
        setVoucherError(
          "Scan today's rotating attendance QR in your jury room before using the voucher online.",
        );
      } else {
        setVoucher({
          code: res.code,
          pin: voucherPin,
          remaining_cents: res.remaining_cents,
          allocated_cents: res.allocated_cents,
          attendance_required: res.attendance_required,
          attendance_verified: res.attendance_verified,
          opted_in: res.opted_in,
        });
      }
    } catch {
      setVoucherError("Sorry, we couldn't check that voucher code just now. Please try again.");
    } finally {
      setVoucherBusy(false);
    }
  }
  // Fraud control: voucher codes are never remembered between orders — the
  // juror keys the code in every time. Purge anything stored by older builds.
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.removeItem(JUROR_CODE_KEY);
  }, []);

  const voucherApplied = voucher ? Math.min(voucher.remaining_cents, grossTotal) : 0;
  const foodSubtotal = c.items.reduce(
    (s, i) => s + (beverageIds.includes(i.menu_item_id) ? 0 : i.price_cents * i.qty),
    0,
  );
  const jurorDiscount = voucher?.opted_in
    ? jurorFoodDiscount(Math.max(0, grossTotal - voucherApplied), foodSubtotal)
    : 0;
  const total = Math.max(0, grossTotal - voucherApplied - jurorDiscount);
  const pointsEarn = user && !onTab ? Math.floor(Math.max(0, subtotal - discount) / 100) : 0;
  const minOrder = settings?.min_order_cents ?? 0;
  const belowMin = minOrder > 0 && subtotal < minOrder;
  const storeBlocks =
    !status.open && !(settings?.allow_preorder_when_closed && scheduleMode === "scheduled");
  // Prevent unused import warning when navigate not used
  void navigate;

  async function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoBusy(true);
    try {
      const row = await checkPromo({
        data: {
          code,
          subtotal_cents: subtotal,
          order_type: mode,
          email: emailForDiscount || undefined,
        },
      });
      if (!row.valid) {
        toast.error(
          row.message || "Sorry, that promo code isn't valid. Please check it and try again.",
        );
        setPromo(null);
        return;
      }
      setPromo({
        code: row.code,
        discount_cents: row.discount_cents,
        discount_type: row.discount_type,
        message: row.message,
      });
      toast.success(row.message || "Promo applied");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That code isn't valid.");
      setPromo(null);
    } finally {
      setPromoBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!c.items.length) return;
    if (
      voucher &&
      mode === "delivery" &&
      !isCourtDeliveryAddress(form.address_line1, form.postcode)
    ) {
      toast.error("Voucher deliveries must go to St Albans Crown Court or the Magistrates' Court.");
      return;
    }
    setBusy(true);
    try {
      const res = await place({
        data: {
          type: mode,
          customer_name: onTab ? tabSession!.name : form.customer_name,
          customer_phone: onTab ? "" : form.customer_phone,
          customer_email: onTab ? "" : form.customer_email,
          company_name: mode === "delivery" ? form.company_name || undefined : undefined,
          address_line1: mode === "delivery" ? form.address_line1 : undefined,
          city: mode === "delivery" ? form.city : undefined,
          postcode: mode === "delivery" ? form.postcode : undefined,
          delivery_notes: form.delivery_notes || undefined,
          table_number: mode === "dine_in" ? form.table_number || undefined : undefined,
          schedule_mode: scheduleMode,
          scheduled_for: scheduleMode === "scheduled" ? scheduledFor || undefined : undefined,
          items: c.items.map((i) => ({
            menu_item_id: i.menu_item_id,
            qty: i.qty,
            notes: i.notes,
            modifier_ids: i.modifiers?.map((m) => m.id),
          })),
          account_code: tabSession?.code,
          promo_code: promo?.code,
          voucher_code: voucher?.code,
          voucher_pin: voucher?.pin,
          jury_room: voucher && juryRoom.trim() ? juryRoom.trim() : undefined,
        },
      });
      cart.clear();
      if (res.on_tab) {
        toast.success(`Added to ${tabSession?.name}'s tab`);
        navigate({
          to: "/order/$orderId",
          params: { orderId: res.order_id },
          search: { token: res.tracking_token },
        });
      } else if (res.fully_covered) {
        toast.success(`Paid in full by court voucher (${money(res.voucher_cents)})`);
        navigate({
          to: "/order/$orderId",
          params: { orderId: res.order_id },
          search: { token: res.tracking_token },
        });
      } else {
        // Send them to the on-site card payment page.
        navigate({
          to: "/pay/$orderId",
          params: { orderId: res.order_id },
          search: { token: res.tracking_token },
        });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Order failed");
    } finally {
      setBusy(false);
    }
  }

  if (!c.items.length)
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-md px-4 py-24 text-center text-muted-foreground">
          Your basket is empty.
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto grid max-w-4xl gap-8 px-4 py-12 lg:grid-cols-[1fr_360px]">
        <form id="checkout-form" onSubmit={submit} className="space-y-6">
          <h1 className="font-display text-4xl font-bold">Checkout</h1>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Your order
              </p>
              <p className="mt-1 font-semibold">
                {describeContext(
                  ctx ?? {
                    mode,
                    schedule_mode: scheduleMode,
                    scheduled_for: scheduledFor,
                    postcode: form.postcode,
                  },
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              <Settings2 className="h-3.5 w-3.5" /> Change
            </button>
          </div>
          <OrderSetupGate
            open={gateOpen}
            onClose={() => setGateOpen(false)}
            juryOnly={!!jurySessionActive}
          />
          {!status.open && (
            <div
              className={`rounded-2xl border p-4 text-sm ${settings?.allow_preorder_when_closed ? "border-amber-500/40 bg-amber-500/10 text-amber-900" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
            >
              <p className="font-semibold">
                {settings?.closed_message || "We're currently closed."}
                {status.nextOpenLabel && (
                  <span className="ml-1 font-normal opacity-80">Opens {status.nextOpenLabel}.</span>
                )}
              </p>
              {settings?.allow_preorder_when_closed && (
                <p className="mt-1 opacity-90">
                  You can still pre-order — pick “Schedule for later” below.
                </p>
              )}
            </div>
          )}
          {tabSession && (
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm">
              <div>
                <p className="font-semibold text-primary">Charging to {tabSession.name}'s tab</p>
                <p className="mt-1 text-muted-foreground">
                  This order will be added to the running bill — no payment now.
                </p>
              </div>
              <button
                type="button"
                onClick={() => tab.clear()}
                className="rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
              >
                Leave tab
              </button>
            </div>
          )}
          {!user && !loading && !tabSession && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <p className="font-semibold text-primary">
                Earn loyalty points & get access to offers
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                <Link
                  to="/auth"
                  search={{ next: "/checkout" }}
                  className="font-semibold text-primary underline"
                >
                  Sign in or create an account
                </Link>{" "}
                to earn 1 point per £1 and save your details — or continue as guest below.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Got a business tab code?{" "}
                <Link to="/tab" className="font-semibold text-primary underline">
                  Sign in with your account code
                </Link>
                .
              </p>
            </div>
          )}
          {user && !tabSession && (
            <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm">
              <span className="font-semibold text-primary">
                {emailDiscount
                  ? `${emailDiscount.label || "Approved member discount"} applied`
                  : "Signed in"}
              </span>{" "}
              — {emailDiscount ? `${emailDiscount.percent}% off this order and ` : ""}you'll earn{" "}
              {pointsEarn} points.
            </div>
          )}
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="font-semibold">How would you like your order?</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["collection", "delivery", "dine_in"] as const).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setMode(m)}
                  className={`h-11 rounded-xl border text-sm font-semibold capitalize transition ${
                    mode === m
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary"
                  }`}
                >
                  {m === "collection" ? "Pickup" : m === "dine_in" ? "Dine in" : "Delivery"}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="font-semibold">When?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["asap", "scheduled"] as const).map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setScheduleMode(s)}
                  className={`h-11 rounded-xl border text-sm font-semibold transition ${
                    scheduleMode === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary"
                  }`}
                >
                  {s === "asap" ? "ASAP" : "Schedule for later"}
                </button>
              ))}
            </div>
            {scheduleMode === "scheduled" && (
              <select
                required
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="mt-3 h-11 w-full rounded-xl border border-border bg-background px-4"
              >
                <option value="">Select a time slot…</option>
                {timeSlots.length === 0 && <option disabled>No slots available</option>}
                {timeSlots.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
            {scheduleMode === "scheduled" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Slots follow our opening hours (Mon–Fri, closed weekends and bank holidays)
                {mode === "delivery" ? " and the delivery window." : "."}
              </p>
            )}
          </div>

          {onTab ? (
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="font-semibold">Your details</p>
              <p className="mt-2 text-sm text-muted-foreground">
                This order is charged to {tabSession!.name}'s tab — no contact details needed.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="font-semibold">Your details</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  required
                  placeholder="Contact person's name"
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  className="h-11 rounded-xl border border-border bg-background px-4"
                />
                <input
                  required={!voucher}
                  placeholder={voucher ? "Phone (optional)" : "Phone"}
                  value={form.customer_phone}
                  onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                  className="h-11 rounded-xl border border-border bg-background px-4"
                />
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={form.customer_email}
                  onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                  className="h-11 rounded-xl border border-border bg-background px-4 sm:col-span-2"
                />
                {voucher && (
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    With a court voucher code, only your name is required so we can label your
                    order. Phone and email are optional.
                  </p>
                )}
              </div>
            </div>
          )}

          {mode === "delivery" && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="font-semibold">Delivery address</p>
              {voucher ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Voucher orders are delivered inside the court only. Choose the building:
                  </p>
                  {JUROR_DELIVERY_VENUES.map((v) => {
                    const selected =
                      isCourtDeliveryAddress(form.address_line1, form.postcode) &&
                      form.address_line1 === v.address_line1;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setForm({
                            ...form,
                            address_line1: v.address_line1,
                            city: v.city,
                            postcode: v.postcode,
                          });
                          setArea(null);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm ${selected ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-background"}`}
                      >
                        <span>{v.label}</span>
                        <span className="text-xs text-muted-foreground">{v.postcode}</span>
                      </button>
                    );
                  })}
                  <textarea
                    placeholder="Jury room / court room and any notes (optional)"
                    value={form.delivery_notes}
                    onChange={(e) => setForm({ ...form, delivery_notes: e.target.value })}
                    className="min-h-20 w-full rounded-xl border border-border bg-background p-3"
                  />
                  {!isCourtDeliveryAddress(form.address_line1, form.postcode) && (
                    <p className="text-xs text-destructive">
                      Please pick a court building, or switch to collection.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input
                    required
                    placeholder="Postcode"
                    value={form.postcode}
                    onChange={(e) => {
                      setForm({ ...form, postcode: e.target.value });
                      setArea(null);
                    }}
                    onBlur={(e) => void verifyPostcode(e.target.value)}
                    className="h-11 rounded-xl border border-border bg-background px-4"
                  />
                  <input
                    placeholder="Office / company name (optional)"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    className="h-11 rounded-xl border border-border bg-background px-4"
                  />
                  <input
                    required
                    placeholder="Street address"
                    value={form.address_line1}
                    onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
                    className="h-11 rounded-xl border border-border bg-background px-4 sm:col-span-2"
                  />
                  <input
                    required
                    placeholder="City"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="h-11 rounded-xl border border-border bg-background px-4"
                  />
                  <textarea
                    placeholder="Delivery notes — buzzer, floor, gate code (optional)"
                    value={form.delivery_notes}
                    onChange={(e) => setForm({ ...form, delivery_notes: e.target.value })}
                    className="min-h-20 rounded-xl border border-border bg-background p-3 sm:col-span-2"
                  />
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                We deliver up to ½ mile from {settings?.delivery_origin_postcode ?? "AL1 3JU"},
                between {(settings?.delivery_open_time ?? "08:30").slice(0, 5)}–
                {(settings?.delivery_close_time ?? "16:30").slice(0, 5)}. Typical delivery time{" "}
                {settings?.delivery_minutes ?? 45} min.
              </p>
              {areaBusy && (
                <p className="mt-2 text-xs text-muted-foreground">Checking your postcode…</p>
              )}
              {area && (
                <p
                  className={`mt-2 rounded-xl px-3 py-2 text-xs font-medium ${area.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}
                >
                  {area.message}
                </p>
              )}
            </div>
          )}
        </form>

        <aside className="h-fit rounded-2xl border border-border bg-card p-5">
          <p className="font-semibold">Order summary</p>
          <ul className="mt-3 divide-y divide-border text-sm">
            {c.items.map((i) => (
              <li key={i.id} className="flex justify-between py-2">
                <span>
                  {i.qty} × {i.name}
                  {i.modifiers?.length > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      {i.modifiers.map((m) => m.name).join(" · ")}
                    </span>
                  )}
                </span>
                <span>{money(i.price_cents * i.qty)}</span>
              </li>
            ))}
          </ul>
          {!onTab && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Promo code
              </p>
              {promo ? (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 p-2 text-sm">
                  <div>
                    <span className="font-mono font-bold text-primary">{promo.code}</span>
                    <p className="text-xs text-muted-foreground">{promo.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPromo(null);
                      setPromoInput("");
                    }}
                    className="text-xs font-semibold text-primary underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <input
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                    className="h-10 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-sm uppercase"
                  />
                  <button
                    type="button"
                    onClick={applyPromo}
                    disabled={promoBusy || !promoInput.trim()}
                    className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          )}
          {!onTab && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                HMCTS Juror ID / voucher code
              </p>
              {voucher ? (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 p-2 text-sm">
                  <div>
                    <span className="font-mono font-bold text-primary">{voucher.code}</span>
                    <p className="text-xs text-muted-foreground">
                      {money(voucher.remaining_cents)} left today
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setVoucher(null);
                      setVoucherInput("");
                      setVoucherPin("");
                      setVoucherError(null);
                    }}
                    className="text-xs font-semibold text-primary underline"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
              {voucher && (
                <label className="mt-2 block">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Jury room / court room (for delivery)
                  </span>
                  <input
                    value={juryRoom}
                    onChange={(e) => setJuryRoom(e.target.value)}
                    placeholder="e.g. Jury Room 2"
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  />
                </label>
              )}
              {voucher ? null : (
                <>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_110px_auto]">
                    <input
                      value={voucherInput}
                      onChange={(e) => {
                        setVoucherInput(e.target.value.toUpperCase());
                        setVoucherError(null);
                      }}
                      placeholder="Enter Juror ID"
                      className="h-10 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-sm uppercase"
                    />
                    <input
                      aria-label="Six-digit voucher PIN"
                      value={voucherPin}
                      onChange={(e) => {
                        setVoucherPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                        setVoucherError(null);
                      }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="PIN"
                      className="h-10 rounded-lg border border-border bg-background px-3 text-center font-mono text-sm tracking-widest"
                    />
                    <button
                      type="button"
                      onClick={applyVoucher}
                      disabled={voucherBusy || !voucherInput.trim() || voucherPin.length !== 6}
                      className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                  {voucherError && <p className="mt-1 text-xs text-destructive">{voucherError}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your HMCTS Juror ID is your voucher code. Enter it with your separate six-digit
                    PIN. It is valid for 12 weeks but never on weekends or public holidays. Online
                    use also requires today&apos;s jury-room attendance QR.
                  </p>
                </>
              )}
            </div>
          )}
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            {user && (
              <div className="!mt-3 rounded-xl border border-dashed border-primary/50 bg-primary-soft/50 p-3">
                <div className="flex items-center justify-between text-xs font-semibold text-primary">
                  <span>Coffee &amp; tea card — buy 10, 11th free</span>
                  <span>{stampsAfter}/10</span>
                </div>
                <div className="mt-2 flex gap-1">
                  {Array.from({ length: 10 }, (_, n) => (
                    <span
                      key={n}
                      className={`h-2 flex-1 rounded-full ${n < stampsAfter ? "bg-primary" : "bg-primary/20"}`}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {freeDrinksUsed > 0
                    ? `${freeDrinksUsed} free drink${freeDrinksUsed > 1 ? "s" : ""} applied to this order.`
                    : (stamps?.free_drinks_available ?? 0) > 0
                      ? `You have ${stamps?.free_drinks_available} free drink${(stamps?.free_drinks_available ?? 0) > 1 ? "s" : ""} — add a hot drink to use ${(stamps?.free_drinks_available ?? 0) > 1 ? "one" : "it"}.`
                      : `${10 - stampsAfter} more drink${10 - stampsAfter === 1 ? "" : "s"} until your free one.`}
                </p>
              </div>
            )}
            {loyaltyDiscount > 0 && (
              <div className="flex justify-between text-primary">
                <span>
                  {`${emailDiscount?.label || "Approved member discount"} (${discountPercent}%)`}
                </span>
                <span>−{money(loyaltyDiscount)}</span>
              </div>
            )}
            {promoDiscount > 0 && (
              <div className="flex justify-between text-primary">
                <span>Promo {promo?.code}</span>
                <span>−{money(promoDiscount)}</span>
              </div>
            )}
            {freeDrinkDiscount > 0 && (
              <div className="flex justify-between text-primary">
                <span>Free drink{freeDrinksUsed > 1 ? `s × ${freeDrinksUsed}` : ""} (loyalty)</span>
                <span>−{money(freeDrinkDiscount)}</span>
              </div>
            )}
            {mode === "delivery" && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Delivery{freeDeliveryByPromo || freeDeliveryByThreshold ? " (free)" : ""}
                </span>
                <span>{money(delivery)}</span>
              </div>
            )}
            {voucher && (
              <div className="!mt-3 rounded-xl border border-primary/40 bg-primary/10 p-3 text-xs">
                <p className="font-semibold text-primary">Court voucher — {voucher.code}</p>
                <p className="mt-1 text-muted-foreground">
                  {voucher.remaining_cents > 0
                    ? `${money(voucher.remaining_cents)} of today's ${money(voucher.allocated_cents)} allowance left.${voucherApplied < grossTotal ? ` You'll pay the ${money(total)} difference by card.` : " This order is fully covered."}`
                    : `Today's ${money(voucher.allocated_cents)} allowance has already been used.`}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setVoucher(null);
                    setVoucherInput("");
                    setVoucherPin("");
                  }}
                  className="mt-2 text-xs font-semibold text-primary underline"
                >
                  Remove voucher
                </button>
              </div>
            )}
            {jurorDiscount > 0 && (
              <div className="flex justify-between text-primary">
                <span>Juror {JUROR_FOOD_DISCOUNT_PERCENT}% off food</span>
                <span>−{money(jurorDiscount)}</span>
              </div>
            )}
            {voucher && !voucher.opted_in && (
              <p className="text-xs text-muted-foreground">
                The {JUROR_FOOD_DISCOUNT_PERCENT}% food discount is for scheme members only — opt in
                on the juror page or by scanning the QR code in your jury room to qualify.
              </p>
            )}
            {voucherApplied > 0 && (
              <div className="flex justify-between text-primary">
                <span>Court voucher</span>
                <span>−{money(voucherApplied)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-border pt-2 font-display text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{money(total)}</span>
            </div>
            {belowMin && (
              <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-center text-xs font-semibold text-destructive">
                Minimum order £{(minOrder / 100).toFixed(2)} — add £
                {((minOrder - subtotal) / 100).toFixed(2)} more.
              </p>
            )}
          </div>
          <button
            type="submit"
            form="checkout-form"
            disabled={
              busy || belowMin || storeBlocks || (mode === "delivery" && area?.ok === false)
            }
            className="mt-4 h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground shadow-brand transition hover:bg-primary-hover disabled:opacity-60"
          >
            {busy
              ? "Placing…"
              : storeBlocks
                ? "Closed — try later"
                : mode === "delivery" && area?.ok === false
                  ? "Outside delivery area"
                  : belowMin
                    ? `Add £${((minOrder - subtotal) / 100).toFixed(2)} more`
                    : onTab
                      ? "Add to tab"
                      : "Place order & pay"}
          </button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {onTab
              ? "Billed to your account — settle later"
              : user
                ? "Secured by SumUp"
                : "Guest checkout · Secured by SumUp"}
          </p>
        </aside>
      </div>
    </div>
  );
}
