import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import {
  cancelCounterOrder,
  createCounterOrder,
  finalizeCounterCardPayment,
  prepareCounterOrder,
  setCounterOrderSchedule,
} from "@/lib/pos.functions";
import {
  closeTillShift,
  getTillShift,
  listPairedReaders,
  openTillShift,
  pairSumupReader,
  recordTillCashEvent,
  unpairSumupReader,
  startReaderPayment,
  checkReaderPayment,
  cancelReaderPayment,
} from "@/lib/till.functions";
import { openCashDrawer } from "@/lib/drawer";
import {
  iminPrintTickets,
  isIminDevice,
  openCustomerScreen,
  type Ticket as PrintTicket,
} from "@/lib/imin";
import { postToDisplay, subscribeToDisplay, type DisplayMessage } from "@/lib/customer-display";
import {
  checkDeviceBridge,
  getDeviceBridgeConfig,
  printViaDeviceBridge,
  setDeviceBridgeConfig,
} from "@/lib/device-bridge";
import { lookupVoucher } from "@/lib/vouchers.functions";
import { listAccounts, quickAddAccount } from "@/lib/accounts.functions";
import { chargeOrderToAccount, findSimilarAccountOrder } from "@/lib/judge-tab.functions";
import { QrCode } from "@/components/qr-code";
import {
  ReaderConnectionAlert,
  ReaderStatusPill,
  ReaderLinkGuide,
} from "@/components/reader-connection";
import { isReaderOnline } from "@/lib/reader-status";
import { JUROR_DAILY_ALLOWANCE_CENTS, JUROR_FOOD_DISCOUNT_PERCENT } from "@/lib/juror";
import { money } from "@/lib/format";
import { calculateCounterDue } from "@/lib/counter-pricing";
import { askConfirm, askPrompt } from "@/lib/confirm";
import { useCustomerDisplayStatus } from "@/hooks/use-customer-display-status";
import {
  useCustomerDisplayRelay,
  type CustomerDisplayRelay,
} from "@/hooks/use-customer-display-relay";
import { usePosDeviceStatus } from "@/hooks/use-pos-device-status";
import { useTillFavourites } from "@/hooks/use-till-favourites";
import { toast } from "sonner";
import { getStaffMenuItems } from "@/lib/menu-operations.functions";
import {
  groupModifierOptions,
  selectionInstruction,
  toggleModifierSelection,
  validateModifierSelection,
  type ModifierRule,
} from "@/lib/modifier-rules";
import {
  Banknote,
  CreditCard,
  MoreHorizontal,
  Minus,
  Plus,
  Search,
  Trash2,
  Lock,
  LogOut,
  Settings2,
  X,
  Smartphone,
  Loader2,
  Check,
  Printer,
  Inbox,
  ShoppingBag,
  HandPlatter,
  MonitorPlay,
  Delete,
  ReceiptText,
  UtensilsCrossed,
  ChevronDown,
  Ticket,
  ShieldCheck,
  Wifi,
  WifiOff,
  Pause,
  FolderOpen,
  CircleDollarSign,
  Star,
  Copy,
  RotateCw,
} from "lucide-react";

export const Route = createFileRoute("/till")({
  head: () => ({
    meta: [
      { title: "Till — Cafe 1 St Albans" },
      {
        name: "description",
        content:
          "Counter till for Cafe 1 at St Albans Crown Court: ring up cash and card sales, take payment on the SumUp Solo and open the cash drawer.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Till — Cafe 1 St Albans" },
      {
        property: "og:description",
        content: "Staff-only counter till for Cafe 1 at St Albans Crown Court.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TillPage,
});

type Cat = { id: string; name: string; sort_order: number };
type Item = {
  id: string;
  name: string;
  price_cents: number;
  category_id: string | null;
  sort_order: number;
  image_url: string | null;
  is_beverage: boolean;
  barcode: string | null;
};
type Modifier = ModifierRule & {
  price_cents: number;
  category_id: string | null;
  item_id: string | null;
};

type Line = {
  key: string;
  id: string;
  name: string;
  price_cents: number;
  qty: number;
  is_beverage: boolean;
  modifier_ids: string[];
  modifier_names: string[];
  notes: string;
};
type DraftBasket = {
  lines: Line[];
  name: string;
  type: Fulfilment;
  table: string;
};
type Side = "jury" | "judge" | "public";
type Fulfilment = "dine_in" | "collection";
type TillShift = {
  id: string;
  terminal: string;
  staff_id: string;
  opening_float_cents: number;
  opened_at: string;
  closed_at: string | null;
};
type AppliedVoucher = {
  code: string;
  pin: string;
  remaining_cents: number;
  allocated_cents: number;
  opted_in: boolean;
};
type HeldOrder = {
  id: string;
  label: string;
  saved_at: string;
  lines: Line[];
  name: string;
  type: Fulfilment;
  table: string;
  voucher: {
    code: string;
    remaining_cents: number;
    allocated_cents: number;
    opted_in: boolean;
  } | null;
};
type CounterResult = {
  order_id: string;
  order_number: number;
  total_cents: number;
  subtotal_cents: number;
  voucher_cents: number;
  voucher_code: string | null;
  juror_discount_cents: number;
  payment_status?: string;
};
type CounterBasketInput = {
  idempotency_key: string;
  shift_id: string;
  customer_name: string;
  type: Fulfilment;
  table_number?: string;
  pos_terminal: Side;
  voucher_code?: string;
  voucher_pin?: string;
  items: Array<{
    menu_item_id: string;
    qty: number;
    notes?: string;
    modifier_ids: string[];
  }>;
};

const SIDE_TONE: Record<Side, string> = {
  jury: "bg-indigo-600 text-white",
  judge: "bg-fuchsia-700 text-white",
  public: "bg-teal-600 text-white",
};
const SIDE_LABEL: Record<Side, string> = { jury: "Jury", judge: "Judge", public: "Public" };
const FAVOURITES_CATEGORY = "__favourites__";
const FULFIL: { id: Fulfilment; label: string; Icon: typeof ShoppingBag }[] = [
  { id: "dine_in", label: "Dine in", Icon: HandPlatter },
  { id: "collection", label: "Takeaway", Icon: ShoppingBag },
];

function loadDraftBasket(): DraftBasket {
  const empty: DraftBasket = { lines: [], name: "", type: "dine_in", table: "" };
  if (typeof window === "undefined") return empty;
  try {
    const saved = JSON.parse(
      window.localStorage.getItem("cafe1-active-basket") ?? "null",
    ) as Partial<DraftBasket> | null;
    if (!saved || !Array.isArray(saved.lines)) return empty;
    return {
      lines: saved.lines,
      name: typeof saved.name === "string" ? saved.name : "",
      type: saved.type === "collection" ? "collection" : "dine_in",
      table: typeof saved.table === "string" ? saved.table : "",
    };
  } catch {
    return empty;
  }
}

/**
 * Turns an "HH:MM" counter entry into an absolute time. A time that has
 * already passed today is treated as tomorrow so staff can take next-morning
 * pre-orders without picking a date.
 */
function laterTimeToIso(value: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const when = new Date();
  when.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (when.getTime() <= Date.now() + 5 * 60_000) when.setDate(when.getDate() + 1);
  return when.toISOString();
}

function TillPage() {
  const { user, loading } = useSession();
  const { has, loading: rolesLoading } = useRoles(user);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-neutral-950 text-white">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!user) return <TillLogin />;
  if (!rolesLoading && !has("admin") && !has("staff")) {
    return (
      <div className="grid min-h-screen place-items-center bg-neutral-950 px-6 text-center text-white">
        <div>
          <p className="font-display text-2xl font-bold">This login can&apos;t use the till</p>
          <p className="mt-2 text-sm text-white/60">Ask a manager for a staff account.</p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-5 rounded-full bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }
  return <Till />;
}

/* ---------------------------------------------------------------- login */

function TillLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) toast.error(error.message);
  }

  return (
    <div className="grid min-h-screen place-items-center bg-neutral-950 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-neutral-900 p-7 text-white shadow-2xl"
      >
        <div className="mb-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1 text-xs font-black uppercase tracking-widest text-primary-foreground">
            Cafe 1 · Till
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold">Counter sign in</h1>
          <p className="mt-1 text-sm text-white/50">
            Staff till login — separate from the kitchen display and admin.
          </p>
        </div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">
          Email
        </label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          autoComplete="username"
          className="mb-4 h-12 w-full rounded-xl border border-white/10 bg-neutral-800 px-4 text-base outline-none focus:border-primary"
        />
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">
          Password
        </label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          autoComplete="current-password"
          className="mb-6 h-12 w-full rounded-xl border border-white/10 bg-neutral-800 px-4 text-base outline-none focus:border-primary"
        />
        <button
          disabled={busy}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Open
          till
        </button>
      </form>
    </div>
  );
}

/* ----------------------------------------------------------------- till */

function Till() {
  const { user } = useSession();
  const { has } = useRoles(user);
  const create = useServerFn(createCounterOrder);
  const readersFn = useServerFn(listPairedReaders);
  const getShift = useServerFn(getTillShift);
  const openShift = useServerFn(openTillShift);
  const closeShift = useServerFn(closeTillShift);
  const cashEvent = useServerFn(recordTillCashEvent);
  const getMenuItems = useServerFn(getStaffMenuItems);
  const scheduleOrder = useServerFn(setCounterOrderSchedule);
  const prepareOrder = useServerFn(prepareCounterOrder);
  const chargeToAccount = useServerFn(chargeOrderToAccount);
  const findSimilar = useServerFn(findSimilarAccountOrder);

  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [catId, setCatId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const draft = useMemo(loadDraftBasket, []);
  const [lines, setLines] = useState<Line[]>(draft.lines);
  const [name, setName] = useState(draft.name);
  const [type, setType] = useState<Fulfilment>(draft.type);
  const [table, setTable] = useState(draft.table);
  // "Later" pre-orders taken at the counter — HH:MM for today, blank = ASAP.
  const [laterTime, setLaterTime] = useState("");
  const [side, setSide] = useState<Side>(() => {
    if (typeof window === "undefined") return "public";
    return (window.localStorage.getItem("cafe1-pos-side") as Side) || "public";
  });
  const [readers, setReaders] = useState<{ id: string; name: string; status: string }[]>([]);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [readerId, setReaderId] = useState<string>(() =>
    typeof window === "undefined" ? "" : (window.localStorage.getItem("cafe1-till-reader") ?? ""),
  );
  const [pay, setPay] = useState<null | "cash" | "reader" | "manual" | "split">(null);
  const [settings, setSettings] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [tabOpen, setTabOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ n: number; total: number; id: string } | null>(null);
  const [tendered, setTendered] = useState(0);
  const [showOrder, setShowOrder] = useState(false);
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [customize, setCustomize] = useState<Item | null>(null);
  const [shift, setShift] = useState<TillShift | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [shiftPanel, setShiftPanel] = useState<"open" | "close" | "cash" | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [held, setHeld] = useState<HeldOrder[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem("cafe1-held-orders") ?? "[]") as HeldOrder[];
    } catch {
      return [];
    }
  });
  const [heldOpen, setHeldOpen] = useState(false);
  const [readerSaleKey, setReaderSaleKey] = useState<string | null>(null);
  const [splitCash, setSplitCash] = useState(0);
  const favourites = useTillFavourites();
  const displayStatus = useCustomerDisplayStatus();
  const displayRelay = useCustomerDisplayRelay({ role: "till" });
  const deviceStatus = usePosDeviceStatus();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const basketRef = useRef<HTMLUListElement | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const selectedReader = readers.find((reader) => reader.id === readerId);
  const readerReady =
    online && !readerError && Boolean(selectedReader && isReaderOnline(selectedReader.status));
  const displayConnected = displayStatus.connected || displayRelay.connected;

  useEffect(() => {
    window.localStorage.setItem("cafe1-pos-side", side);
  }, [side]);
  useEffect(() => {
    if (readerId) window.localStorage.setItem("cafe1-till-reader", readerId);
  }, [readerId]);
  useEffect(() => {
    window.localStorage.setItem("cafe1-held-orders", JSON.stringify(held.slice(0, 20)));
  }, [held]);
  useEffect(() => {
    window.localStorage.setItem(
      "cafe1-active-basket",
      JSON.stringify({ lines, name, type, table } satisfies DraftBasket),
    );
  }, [lines, name, table, type]);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadMenu = async () => {
      const [{ data: c }, i, { data: m }] = await Promise.all([
        supabase
          .from("menu_categories")
          .select("id, name, sort_order")
          .eq("active", true)
          .order("sort_order"),
        getMenuItems(),
        supabase
          .from("menu_modifiers")
          .select(
            "id, name, price_cents, category_id, item_id, group_name, group_type, required, min_selections, max_selections, is_exclusive",
          )
          .eq("active", true)
          .order("sort_order"),
      ]);
      if (!active) return;
      setCats((c ?? []) as Cat[]);
      setItems((i ?? []).filter((item) => item.active) as Item[]);
      setModifiers((m ?? []) as Modifier[]);
      setCatId((current) =>
        current === FAVOURITES_CATEGORY ||
        (current && (c ?? []).some((category) => category.id === current))
          ? current
          : ((c ?? [])[0]?.id ?? null),
      );
    };
    void loadMenu();

    const channel = supabase
      .channel("till-live-menu")
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories" }, loadMenu)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_modifiers" }, loadMenu)
      .subscribe();
    const interval = window.setInterval(loadMenu, 60000);
    return () => {
      active = false;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [getMenuItems]);

  const loadShift = useCallback(async () => {
    setShiftLoading(true);
    try {
      setShift((await getShift({ data: { terminal: side } })) as TillShift | null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the till shift");
      setShift(null);
    } finally {
      setShiftLoading(false);
    }
  }, [getShift, side]);
  useEffect(() => {
    void loadShift();
  }, [loadShift]);
  useEffect(() => {
    if (!shiftLoading && !shift) setShiftPanel("open");
  }, [shift, shiftLoading]);

  const loadReaders = useCallback(async () => {
    try {
      const res = await readersFn({});
      if (res.ok) {
        setReaders(res.readers);
        setReaderError(null);
        setReaderId((prev) => prev || res.readers[0]?.id || "");
      } else {
        setReaders([]);
        setReaderError(res.error ?? "Could not reach SumUp");
      }
    } catch (e) {
      setReaderError(e instanceof Error ? e.message : "Could not reach SumUp");
    }
  }, [readersFn]);
  useEffect(() => {
    void loadReaders();
  }, [loadReaders]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term) {
      return items
        .filter(
          (item) => item.name.toLowerCase().includes(term) || item.barcode?.toLowerCase() === term,
        )
        .slice(0, 80);
    }
    if (catId === FAVOURITES_CATEGORY) {
      const order = new Map(favourites.ids.map((id, index) => [id, index]));
      return items
        .filter((item) => order.has(item.id))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    return items.filter((i) => i.category_id === catId);
  }, [items, catId, q, favourites.ids]);

  function addBarcode(value: string) {
    const barcode = value.trim().toLowerCase();
    if (!barcode) return false;
    const match = items.find((item) => item.barcode?.trim().toLowerCase() === barcode);
    if (!match) return false;
    add(match);
    setQ("");
    toast.success(`${match.name} added`);
    return true;
  }

  const total = lines.reduce((s, l) => s + l.price_cents * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const foodTotal = lines.reduce((s, l) => s + (l.is_beverage ? 0 : l.price_cents * l.qty), 0);
  const pricing = calculateCounterDue({
    subtotalCents: total,
    foodSubtotalCents: foodTotal,
    voucherRemainingCents: voucher?.remaining_cents,
    optedIn: voucher?.opted_in ?? false,
  });
  const voucherApplied = pricing.voucherCents;
  const jurorDiscount = pricing.discountCents;
  const due = pricing.dueCents;

  // mirror the basket onto the customer-facing second screen (/display)
  useEffect(() => {
    postToDisplay(
      lines.length
        ? {
            type: "order",
            lines: lines.map((l) => ({
              id: l.key,
              name: l.name,
              price_cents: l.price_cents,
              qty: l.qty,
            })),
            subtotal: total,
            voucher_cents: voucherApplied,
            discount_cents: jurorDiscount,
            due,
            fulfilment: type,
          }
        : { type: "idle" },
    );
  }, [due, jurorDiscount, lines, total, type, voucherApplied]);

  // Keep the grid at the top whenever the operator switches category or searches.
  useEffect(() => {
    gridRef.current?.scrollTo({ top: 0 });
  }, [catId, q]);

  // Briefly highlight the basket line that just changed and bring it into view.
  useEffect(() => {
    if (!flashKey) return;
    basketRef.current
      ?.querySelector(`[data-line="${flashKey}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const timer = window.setTimeout(() => setFlashKey(null), 700);
    return () => window.clearTimeout(timer);
  }, [flashKey]);

  // "/" jumps to search from anywhere on the till; Escape clears it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (event.key === "Escape" && target === searchRef.current) {
        setQ("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function add(i: Item) {
    const available = modifiers.filter(
      (modifier) =>
        modifier.item_id === i.id || (!modifier.item_id && modifier.category_id === i.category_id),
    );
    if (available.length) {
      setCustomize(i);
      return;
    }
    let touched = "";
    setLines((prev) => {
      const at = prev.findIndex(
        (line) => line.id === i.id && !line.modifier_ids.length && !line.notes,
      );
      if (at >= 0) {
        const next = [...prev];
        next[at] = { ...next[at], qty: next[at].qty + 1 };
        touched = next[at].key;
        return next;
      }
      const key = crypto.randomUUID();
      touched = key;
      return [
        ...prev,
        {
          key,
          id: i.id,
          name: i.name,
          price_cents: i.price_cents,
          qty: 1,
          is_beverage: i.is_beverage,
          modifier_ids: [],
          modifier_names: [],
          notes: "",
        },
      ];
    });
    setFlashKey(touched);
  }
  function bump(key: string, d: number) {
    setLines((prev) =>
      prev.flatMap((l) =>
        l.key === key ? (l.qty + d <= 0 ? [] : [{ ...l, qty: l.qty + d }]) : [l],
      ),
    );
    if (d > 0) setFlashKey(key);
  }

  function parkOrder() {
    if (!lines.length) return;
    const order: HeldOrder = {
      id: crypto.randomUUID(),
      label: name.trim() || table.trim() || `Order ${held.length + 1}`,
      saved_at: new Date().toISOString(),
      lines,
      name,
      type,
      table,
      // Never persist a PIN in localStorage. Keep only a marker so retrieval
      // can require the juror to present the code and PIN again.
      voucher: voucher
        ? {
            code: voucher.code,
            remaining_cents: voucher.remaining_cents,
            allocated_cents: voucher.allocated_cents,
            opted_in: voucher.opted_in,
          }
        : null,
    };
    setHeld((current) => [order, ...current].slice(0, 20));
    setLines([]);
    setName("");
    setTable("");
    setVoucher(null);
    setPay(null);
    setTendered(0);
    toast.success(`Parked ${order.label}`);
  }

  async function retrieveOrder(order: HeldOrder) {
    if (
      lines.length &&
      !(await askConfirm({
        title: "Replace the current order?",
        description:
          "The items currently in the basket will be cleared and replaced with this parked order.",
        confirmLabel: "Retrieve order",
        destructive: false,
      }))
    )
      return;
    setLines(order.lines);
    setName(order.name);
    setType(order.type);
    setTable(order.table);
    setVoucher(null);
    if (order.voucher) toast.info("Re-enter the juror code and PIN before completing this order");
    setHeld((current) => current.filter((item) => item.id !== order.id));
    setHeldOpen(false);
  }

  const completeSale = useCallback(
    async (res: CounterResult, paymentMethod: "cash" | "card" | "split" | "account") => {
      setLastOrder({ n: res.order_number, total: res.total_cents, id: res.order_id });
      const laterIso = laterTime ? laterTimeToIso(laterTime) : null;
      if (laterIso) {
        try {
          await scheduleOrder({ data: { order_id: res.order_id, scheduled_for: laterIso } });
          toast.success(
            `Order #${res.order_number} saved for ${new Date(laterIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          );
        } catch {
          toast.error("Order taken, but the later time could not be saved — tell the kitchen");
        }
      }
      postToDisplay({
        type: "paid",
        order_number: res.order_number,
        total: res.total_cents,
        method: paymentMethod,
      });
      toast.success(`Order #${res.order_number} sent to the kitchen · ${money(res.total_cents)}`);
      const tickets: PrintTicket[] = (["KITCHEN", "COUNTER"] as const).map((heading) => ({
        heading,
        order_number: res.order_number,
        fulfilment: `${FULFIL.find((f) => f.id === type)?.label ?? type}${
          laterIso
            ? ` · FOR ${new Date(laterIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : ""
        }`,
        terminal: SIDE_LABEL[side],
        lines: lines.map((line) => ({
          name: [line.name, ...line.modifier_names].join(" · "),
          qty: line.qty,
          price_cents: heading === "COUNTER" ? line.price_cents : undefined,
        })),
        total_cents: heading === "COUNTER" ? res.total_cents : undefined,
        footer: heading === "COUNTER" ? "Thank you — cafe1stalbans.co.uk" : undefined,
      }));
      let printed = iminPrintTickets(tickets);
      if (!printed) {
        const bridgePrint = await printViaDeviceBridge(tickets);
        printed = bridgePrint.ok;
        if (!printed) {
          window.open(`/print/${res.order_id}`, "_blank");
          toast.error(`Automatic printing failed: ${bridgePrint.message}. Print preview opened.`);
        }
      }
      if (paymentMethod === "cash" || paymentMethod === "split") {
        const drawer = await openCashDrawer();
        if (!drawer.ok) toast.error(drawer.message);
      }
      if (res.voucher_cents > 0) {
        toast.success(`Juror voucher — ${money(res.voucher_cents)} redeemed`);
      }
      setLines([]);
      setName("");
      setTable("");
      setLaterTime("");
      setPay(null);
      setTendered(0);
      setShowOrder(false);
      setVoucher(null);
      setSplitCash(0);
    },
    [lines, side, type, laterTime, scheduleOrder],
  );

  const finish = useCallback(
    async (payment_method: "cash" | "card", manualCardReference?: string) => {
      if (!shift) return toast.error("Open a till shift first");
      if (!online) return toast.error("The till is offline — reconnect before taking payment");
      setBusy(true);
      try {
        const res = await create({
          data: {
            idempotency_key: crypto.randomUUID(),
            shift_id: shift.id,
            customer_name: name.trim() || "Counter",
            type,
            table_number: table.trim() || undefined,
            payment_method,
            manual_card_reference: manualCardReference,
            pos_terminal: side,
            voucher_code: voucher?.code,
            voucher_pin: voucher?.pin,
            items: lines.map((line) => ({
              menu_item_id: line.id,
              qty: line.qty,
              notes: line.notes || undefined,
              modifier_ids: line.modifier_ids,
            })),
          },
        });
        await completeSale(res, payment_method);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not take that order");
      } finally {
        setBusy(false);
      }
    },
    [completeSale, create, lines, name, online, shift, side, table, type, voucher],
  );

  /**
   * Judge orders may go on that judge's tab. The judge list is the same house
   * account list the KDS manual ticket uses, so both routes bill one judge.
   */
  const chargeJudgeTab = useCallback(
    async (account: { id: string; name: string }) => {
      if (!shift) return toast.error("Open a till shift first");
      if (!online) return toast.error("The till is offline — reconnect before charging a tab");
      setBusy(true);
      try {
        const { match } = await findSimilar({
          data: {
            account_id: account.id,
            item_names: lines.flatMap((line) => Array(line.qty).fill(line.name) as string[]),
          },
        });
        if (match) {
          const when = new Date(match.created_at).toLocaleString([], {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
          const ok = await askConfirm({
            title: `Possible duplicate for ${match.account_name}`,
            description: `${match.account_name} had a ${match.identical ? "matching" : "similar"} order on ${when} (#${match.order_number}, ${money(match.total_cents)}) which is still unpaid. Is this a different order?`,
            confirmLabel: "Yes — different order",
            cancelLabel: "No — cancel",
            destructive: false,
          });
          if (!ok) return;
        }
        const res = await prepareOrder({
          data: {
            idempotency_key: crypto.randomUUID(),
            shift_id: shift.id,
            customer_name: account.name,
            type,
            table_number: table.trim() || undefined,
            pos_terminal: side,
            voucher_code: voucher?.code,
            voucher_pin: voucher?.pin,
            items: lines.map((line) => ({
              menu_item_id: line.id,
              qty: line.qty,
              notes: line.notes || undefined,
              modifier_ids: line.modifier_ids,
            })),
          },
        });
        await chargeToAccount({ data: { order_id: res.order_id, account_id: account.id } });
        setTabOpen(false);
        await completeSale(res, "account");
        toast.success(`Charged to ${account.name}'s tab`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not put that order on the tab");
      } finally {
        setBusy(false);
      }
    },
    [
      chargeToAccount,
      completeSale,
      findSimilar,
      lines,
      online,
      prepareOrder,
      shift,
      side,
      table,
      type,
      voucher,
    ],
  );

  async function changeSide(next: Side) {
    if (next === side) return;
    if (
      lines.length &&
      !(await askConfirm({
        title: `Switch to the ${SIDE_LABEL[next]} till?`,
        description: "Changing the till side clears the current basket and voucher.",
        confirmLabel: "Switch and clear",
      }))
    )
      return;
    setLines([]);
    setVoucher(null);
    setPay(null);
    setTendered(0);
    setSide(next);
  }

  async function manualDrawer() {
    if (!shift) return toast.error("Open a shift before using the cash drawer");
    const reason = (
      await askPrompt({
        title: "Open cash drawer",
        description: "A reason is required and will be added to the shift audit log.",
        label: "Reason",
        defaultValue: "Make change",
        confirmLabel: "Record and open",
      })
    )?.trim();
    if (!reason) return;
    try {
      await cashEvent({
        data: { shift_id: shift.id, event_type: "drawer_open", amount_cents: 0, reason },
      });
      const result = await openCashDrawer();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not audit drawer opening");
    }
  }

  async function startSplitPayment() {
    const raw = await askPrompt({
      title: "Split cash and card",
      description: `The order total is ${money(due)}. Enter the amount being paid in cash; the remainder will be sent to the card reader.`,
      label: "Cash amount (£)",
      placeholder: "0.00",
      inputMode: "decimal",
      confirmLabel: "Continue to card",
    });
    if (raw === null) return;
    const cents = poundsToCents(raw);
    if (cents === null || cents < 1 || cents >= due) {
      return toast.error("Cash portion must be between 1p and less than the amount due");
    }
    setSplitCash(cents);
    setReaderSaleKey(crypto.randomUUID());
    setPay("split");
  }

  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(120%_100%_at_50%_0%,#16181d_0%,#0a0a0b_60%)] text-white">
      {/* top bar — one row: who you are, shift state, everything else in one menu */}
      <header className="relative flex shrink-0 items-center gap-2 border-b border-white/10 bg-neutral-900/80 px-3 py-2 backdrop-blur sm:gap-3 sm:px-4 lg:py-1.5">
        <span className="hidden rounded-xl bg-primary px-3 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-primary-foreground shadow-lg shadow-primary/25 sm:inline">
          Cafe 1 Till
        </span>
        <div className="flex shrink-0 gap-1 rounded-xl border border-white/10 bg-neutral-950/60 p-1">
          {(["jury", "judge", "public"] as const).map((s) => (
            <button
              key={s}
              onClick={() => changeSide(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide transition active:scale-95 ${side === s ? `${SIDE_TONE[s]} shadow-md` : "text-white/50 hover:bg-white/5 hover:text-white"}`}
            >
              {SIDE_LABEL[s]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShiftPanel(shift ? "close" : "open")}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition hover:brightness-125 ${shift ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}
        >
          {shiftLoading ? "Loading shift…" : shift ? "Shift open" : "Open shift"}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-neutral-950/60 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide sm:inline-flex">
            <StatusDot ok={online} label={online ? "Online" : "Offline"} />
            <StatusDot ok={readerReady} label="Card" />
            <StatusDot ok={deviceStatus.printerReady} label="Printer" />
            <StatusDot ok={displayConnected} label="Display" />
          </span>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Till menu"
            aria-expanded={menuOpen}
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 transition hover:bg-white/10 active:scale-95 lg:h-9 lg:w-9"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
        {menuOpen && (
          <>
            <button
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div className="absolute right-3 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 p-1.5 shadow-2xl shadow-black/60">
              <TillMenuItem
                icon={Inbox}
                label="Open cash drawer"
                onClick={() => {
                  setMenuOpen(false);
                  void manualDrawer();
                }}
              />
              <TillMenuItem
                icon={FolderOpen}
                label={`Held orders${held.length ? ` (${held.length})` : ""}`}
                onClick={() => {
                  setMenuOpen(false);
                  setHeldOpen(true);
                }}
              />
              <TillMenuItem
                icon={MonitorPlay}
                label={displayConnected ? "Customer screen · on" : "Open customer screen"}
                onClick={() => {
                  setMenuOpen(false);
                  const result = openCustomerScreen(displayRelay.displayUrl || "/display");
                  if (result.ok) toast.success(result.message);
                  else toast.error(result.message);
                }}
              />
              {shift && (
                <TillMenuItem
                  icon={Banknote}
                  label="Cash in / out"
                  onClick={() => {
                    setMenuOpen(false);
                    setShiftPanel("cash");
                  }}
                />
              )}
              {lastOrder && (
                <TillMenuItem
                  icon={Printer}
                  label={`Reprint #${lastOrder.n}`}
                  onClick={() => {
                    setMenuOpen(false);
                    window.open(`/print/${lastOrder.id}`, "_blank");
                  }}
                />
              )}
              {has("admin") && (
                <TillMenuItem
                  icon={Settings2}
                  label="Till settings"
                  onClick={() => {
                    setMenuOpen(false);
                    setSettings(true);
                  }}
                />
              )}
              <div className="my-1 h-px bg-white/10" />
              <TillMenuItem
                icon={Lock}
                label="Lock till"
                onClick={() => {
                  setMenuOpen(false);
                  setLocked(true);
                }}
              />
              <TillMenuItem
                icon={LogOut}
                label="Sign out"
                onClick={() => {
                  setMenuOpen(false);
                  void supabase.auth.signOut();
                }}
              />
            </div>
          </>
        )}
      </header>
      {!online && (
        <p className="shrink-0 bg-red-500/15 px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-red-200">
          Offline — payments are blocked until the connection returns
        </p>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[148px_minmax(0,1fr)_408px]">
        {/* category rail (desktop) */}
        <nav className="hidden min-h-0 flex-col gap-1 overflow-y-auto border-r border-white/10 bg-neutral-900/40 p-2 lg:flex">
          <button
            onClick={() => {
              setCatId(FAVOURITES_CATEGORY);
              setQ("");
            }}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-3 text-left text-[11px] font-black uppercase leading-tight tracking-wide transition active:scale-[0.98] ${
              catId === FAVOURITES_CATEGORY && !q
                ? "bg-amber-400 text-neutral-950 shadow-lg shadow-amber-400/20"
                : "text-amber-200/80 hover:bg-amber-400/10 hover:text-amber-100"
            }`}
          >
            <Star className="h-4 w-4 fill-current" /> Favourites
          </button>
          {cats.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setCatId(c.id);
                setQ("");
              }}
              className={`shrink-0 rounded-xl px-3 py-3 text-left text-[11px] font-black uppercase leading-tight tracking-wide transition active:scale-[0.98] ${
                catId === c.id && !q
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              {c.name}
            </button>
          ))}
        </nav>

        {/* products */}
        <section className="flex min-h-0 flex-col">
          <div className="shrink-0 space-y-3 border-b border-white/10 p-3 sm:p-4 lg:space-y-0 lg:px-4 lg:py-2.5">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-neutral-900/80 px-4 shadow-inner shadow-black/40 focus-within:border-primary/60">
              <Search className="h-4 w-4 shrink-0 text-white/40" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && addBarcode(q)) event.preventDefault();
                }}
                placeholder="Search or scan a barcode…"
                className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/30 lg:h-10"
                autoComplete="off"
              />
              {q && (
                <button onClick={() => setQ("")} aria-label="Clear search">
                  <X className="h-4 w-4 text-white/40" />
                </button>
              )}
              <kbd className="hidden shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white/35 lg:block">
                /
              </kbd>
            </div>
            {!q && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
                <button
                  onClick={() => setCatId(FAVOURITES_CATEGORY)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold uppercase tracking-wide transition active:scale-95 ${catId === FAVOURITES_CATEGORY ? "bg-amber-400 text-neutral-950 shadow-lg shadow-amber-400/20" : "border border-amber-300/20 bg-neutral-900 text-amber-200"}`}
                >
                  <Star className="h-3.5 w-3.5 fill-current" /> Favourites
                </button>
                {cats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCatId(c.id)}
                    className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold uppercase tracking-wide transition active:scale-95 ${catId === c.id ? "bg-white text-neutral-950 shadow-lg shadow-black/40" : "border border-white/10 bg-neutral-900 text-white/70"}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div ref={gridRef} className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 sm:p-4 lg:p-3">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:gap-2 xl:grid-cols-5 2xl:grid-cols-6">
              {visible.map((i) => (
                <div
                  key={i.id}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/80 shadow-lg shadow-black/30 transition duration-150 hover:-translate-y-0.5 hover:border-primary/70 hover:bg-neutral-800 hover:shadow-xl hover:shadow-primary/10"
                >
                  <button
                    onClick={() => add(i)}
                    className="flex h-full w-full flex-col text-left transition active:scale-[0.97]"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-800 lg:aspect-[16/9]">
                      {i.image_url ? (
                        <>
                          <img
                            src={i.image_url}
                            alt={i.name}
                            loading="lazy"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-neutral-950/70 to-transparent" />
                        </>
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-[radial-gradient(80%_80%_at_50%_20%,rgba(255,255,255,0.06),transparent)] text-white/15">
                          <UtensilsCrossed className="h-7 w-7" />
                        </div>
                      )}
                    </div>
                    <div className="flex min-h-[64px] flex-1 flex-col justify-between gap-1 p-2.5 pr-10 lg:min-h-[54px] lg:p-2 lg:pr-9">
                      <span className="line-clamp-2 text-[13px] font-semibold leading-snug lg:text-xs">
                        {i.name}
                      </span>
                      <span className="font-display text-base font-black tabular-nums text-primary lg:text-sm">
                        {money(i.price_cents)}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => favourites.toggle(i.id)}
                    aria-label={`${favourites.has(i.id) ? "Remove" : "Add"} ${i.name} ${favourites.has(i.id) ? "from" : "to"} favourites`}
                    aria-pressed={favourites.has(i.id)}
                    className={`absolute bottom-2.5 right-2.5 grid h-9 w-9 place-items-center rounded-xl border shadow-lg transition active:scale-90 lg:bottom-2 lg:right-2 lg:h-7 lg:w-7 ${favourites.has(i.id) ? "border-amber-300 bg-amber-400 text-neutral-950" : "border-white/15 bg-neutral-950/80 text-white/55 hover:text-amber-300"}`}
                  >
                    <Star
                      className={`h-4 w-4 lg:h-3.5 lg:w-3.5 ${favourites.has(i.id) ? "fill-current" : ""}`}
                    />
                  </button>
                </div>
              ))}
              {!visible.length && (
                <p className="col-span-full rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/45">
                  {catId === FAVOURITES_CATEGORY
                    ? "No favourites yet — tap the star on your fastest-selling items to create quick keys for this till."
                    : "No items in this category."}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* order panel */}
        <aside
          className={`fixed inset-0 z-40 min-h-0 flex-col bg-neutral-900 shadow-[-12px_0_40px_-24px_rgba(0,0,0,0.9)] lg:static lg:z-auto lg:flex lg:border-l lg:border-white/10 ${showOrder ? "flex" : "hidden"}`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 lg:hidden">
            <span className="font-display text-lg font-bold">Current order</span>
            <button
              onClick={() => setShowOrder(false)}
              aria-label="Back to menu"
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/15"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
          <div className="shrink-0 space-y-2 border-b border-white/10 p-4 lg:space-y-1.5 lg:p-2.5">
            <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-neutral-950/50 p-1.5 lg:grid-cols-4 lg:gap-1 lg:p-1">
              {FULFIL.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setType(id)}
                  className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-bold uppercase tracking-wide transition active:scale-95 lg:gap-0.5 lg:py-1.5 lg:text-[10px] ${type === id ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
                >
                  <Icon className="h-4 w-4 lg:h-3.5 lg:w-3.5" /> {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-neutral-950/50 p-1.5 lg:p-1">
              <button
                onClick={() => setLaterTime("")}
                className={`h-9 flex-1 rounded-xl text-[11px] font-bold uppercase tracking-wide transition active:scale-95 lg:h-8 ${laterTime ? "text-white/55 hover:bg-white/5 hover:text-white" : "bg-primary text-primary-foreground shadow-md shadow-primary/25"}`}
              >
                ASAP
              </button>
              <label className="flex flex-1 items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-white/60">
                  Later
                </span>
                <input
                  type="time"
                  step={300}
                  value={laterTime}
                  onChange={(e) => setLaterTime(e.target.value)}
                  aria-label="Time this order is wanted for"
                  className="h-9 w-full rounded-lg border border-white/10 bg-neutral-900 px-2 text-sm tabular-nums outline-none focus:border-primary lg:h-8"
                />
              </label>
            </div>
            {laterTime && (
              <p className="rounded-lg bg-violet-700/20 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-violet-200">
                Pre-order · kitchen will hold this until {laterTime}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2 lg:gap-1.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer name (optional)"
                className="h-10 rounded-xl border border-white/10 bg-neutral-800 px-3 text-sm outline-none placeholder:text-white/30 focus:border-primary lg:h-9"
              />
              {type === "dine_in" ? (
                <input
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                  placeholder="Table number"
                  className="h-10 rounded-xl border border-white/10 bg-neutral-800 px-3 text-sm outline-none placeholder:text-white/30 focus:border-primary lg:h-9"
                />
              ) : (
                <div className="hidden sm:block" />
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-2.5">
            <ul ref={basketRef} className="space-y-2 lg:space-y-1.5">
              {lines.map((l) => (
                <li
                  key={l.key}
                  data-line={l.key}
                  className={`group flex items-center gap-2 rounded-2xl border p-2 text-sm transition duration-200 ${
                    flashKey === l.key
                      ? "border-primary/70 bg-primary/15"
                      : "border-white/5 bg-neutral-800/60 hover:border-white/15"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => bump(l.key, -1)}
                      aria-label={`Remove one ${l.name}`}
                      className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/5 transition hover:border-primary active:scale-90"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center font-bold tabular-nums">{l.qty}</span>
                    <button
                      onClick={() => bump(l.key, 1)}
                      aria-label={`Add one ${l.name}`}
                      className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/5 transition hover:border-primary active:scale-90"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.name}</span>
                    {(l.modifier_names.length > 0 || l.notes) && (
                      <span className="block truncate text-[11px] text-white/45">
                        {[...l.modifier_names, l.notes].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums">{money(l.price_cents * l.qty)}</span>
                  <button
                    onClick={() => bump(l.key, -l.qty)}
                    aria-label={`Remove ${l.name} from the order`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white/30 transition hover:bg-red-500/15 hover:text-red-300 active:scale-90"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              {!lines.length && (
                <li className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/40">
                  Tap items to start an order
                  {lastOrder && (
                    <span className="mt-3 block text-xs text-white/50">
                      Last: #{lastOrder.n} · {money(lastOrder.total)}
                      <button
                        onClick={() => window.open(`/print/${lastOrder.id}`, "_blank")}
                        className="ml-2 inline-flex items-center gap-1 underline"
                      >
                        <Printer className="h-3 w-3" /> reprint
                      </button>
                    </span>
                  )}
                </li>
              )}
            </ul>
          </div>

          {pay === "cash" && (
            <div className="shrink-0 border-t border-white/10 p-3 lg:p-2.5">
              <div className="mb-2 grid grid-cols-3 items-end gap-2 rounded-2xl border border-white/5 bg-neutral-800/70 px-3 py-2.5 lg:mb-1.5 lg:py-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                    Tendered
                  </p>
                  <p className="text-base font-bold tabular-nums">{money(tendered)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                    Change
                  </p>
                  <p
                    className={`text-base font-bold tabular-nums ${tendered - due < 0 ? "text-white/25" : "text-emerald-400"}`}
                  >
                    {tendered === 0 || tendered - due < 0 ? "—" : money(tendered - due)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                    Total
                  </p>
                  <p className="font-display text-xl font-black leading-none text-primary tabular-nums">
                    {money(due)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button
                    key={n}
                    onClick={() => setTendered((t) => Math.min(t * 10 + n * 100, 5_000_00))}
                    className="h-12 rounded-xl border border-white/10 bg-neutral-800/60 text-lg font-bold tabular-nums transition hover:bg-neutral-700/60 active:scale-95 lg:h-10"
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setTendered(due)}
                  className="h-12 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-xs font-black uppercase tracking-wide text-emerald-300 transition hover:bg-emerald-500/20 active:scale-95 lg:h-10"
                >
                  Exact
                </button>
                <button
                  onClick={() => setTendered((t) => Math.min(t * 10, 5_000_00))}
                  className="h-12 rounded-xl border border-white/10 bg-neutral-800/60 text-lg font-bold tabular-nums transition hover:bg-neutral-700/60 active:scale-95 lg:h-10"
                >
                  0
                </button>
                <button
                  onClick={() => setTendered((t) => Math.floor(t / 10 / 100) * 100)}
                  aria-label="Delete last digit"
                  className="grid h-12 place-items-center rounded-xl border border-white/10 bg-neutral-800/60 transition hover:bg-neutral-700/60 active:scale-95 lg:h-10"
                >
                  <Delete className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setTendered(0)}
                  className="h-12 rounded-xl border border-white/10 text-xs font-black uppercase tracking-wide text-white/50 transition hover:bg-white/5 active:scale-95 lg:h-10"
                >
                  Clear
                </button>
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {[500, 1000, 2000, 5000].map((v) => (
                  <button
                    key={v}
                    onClick={() => setTendered(v)}
                    className="h-9 rounded-xl border border-white/10 text-xs font-bold tabular-nums text-white/70 transition hover:bg-white/5 active:scale-95 lg:h-8"
                  >
                    {money(v)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(voucher || lines.length > 0) && (
            <div className="shrink-0 space-y-1.5 border-t border-white/10 px-3 pt-2 text-sm">
              {voucher ? (
                <>
                  <div className="flex items-center justify-between text-white/60">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-300">
                      <Ticket className="h-3.5 w-3.5" /> Juror {voucher.code}
                    </span>
                    <button
                      onClick={() => setVoucher(null)}
                      className="text-xs font-semibold text-white/40 underline"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="flex justify-between text-white/70">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{money(total)}</span>
                  </div>
                  <div className="flex justify-between text-indigo-300">
                    <span>Voucher allowance</span>
                    <span className="tabular-nums">−{money(voucherApplied)}</span>
                  </div>
                  {jurorDiscount > 0 && (
                    <div className="flex justify-between text-indigo-300">
                      <span>Juror {JUROR_FOOD_DISCOUNT_PERCENT}% off food</span>
                      <span className="tabular-nums">−{money(jurorDiscount)}</span>
                    </div>
                  )}
                </>
              ) : (
                <button
                  onClick={() => setVoucherOpen(true)}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/40 text-xs font-bold uppercase tracking-wide text-indigo-300 hover:border-indigo-400 lg:h-9"
                >
                  <Ticket className="h-4 w-4" /> Juror voucher
                </button>
              )}
            </div>
          )}

          <div className="shrink-0 space-y-2 border-t border-white/10 bg-neutral-950/40 p-3 lg:space-y-1.5 lg:p-2.5">
            {lines.length > 0 && pay !== "cash" && (
              <div className="flex items-baseline justify-between rounded-2xl bg-white/5 px-4 py-2.5 lg:py-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                  Due · {count} item{count === 1 ? "" : "s"}
                </span>
                <span className="font-display text-2xl font-black tabular-nums text-primary">
                  {money(due)}
                </span>
              </div>
            )}
            {pay === "cash" ? (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button
                  disabled={!lines.length || busy || !shift || !online}
                  onClick={() => {
                    if (tendered < due) return toast.error("Tendered is less than the amount due");
                    void finish("cash");
                  }}
                  className="inline-flex h-14 items-center justify-between gap-2 rounded-2xl bg-emerald-600 px-5 text-base font-bold text-white shadow-lg shadow-emerald-600/25 transition active:scale-[0.99] disabled:opacity-40 lg:h-12"
                >
                  <span className="inline-flex items-center gap-2">
                    <Banknote className="h-5 w-5" /> Take cash
                  </span>
                  <span className="font-display text-lg font-black tabular-nums">{money(due)}</span>
                </button>
                <button
                  onClick={() => {
                    setPay(null);
                    setTendered(0);
                  }}
                  className="h-14 rounded-2xl border border-white/10 px-4 text-sm font-bold text-white/60 transition hover:bg-white/5 active:scale-95 lg:h-12"
                >
                  Back
                </button>
              </div>
            ) : due > 0 ? (
              <button
                disabled={!lines.length || busy || !shift || !online}
                onClick={() => setPayOpen(true)}
                className="inline-flex h-14 w-full items-center justify-between gap-2 rounded-2xl bg-primary px-5 text-base font-bold text-primary-foreground shadow-lg shadow-primary/25 transition active:scale-[0.99] disabled:opacity-40 disabled:shadow-none lg:h-12"
              >
                <span className="inline-flex items-center gap-2">
                  <CreditCard className="h-5 w-5" /> Charge
                </span>
                <span className="font-display text-lg font-black tabular-nums">{money(due)}</span>
              </button>
            ) : (
              <button
                disabled={!lines.length || busy || !shift || !online}
                onClick={() => void finish("cash")}
                className="inline-flex h-14 w-full items-center justify-between gap-2 rounded-2xl bg-indigo-500 px-5 text-base font-bold text-white shadow-lg shadow-indigo-500/25 transition active:scale-[0.99] disabled:opacity-40 disabled:shadow-none lg:h-12"
              >
                <span className="inline-flex items-center gap-2">
                  <Ticket className="h-5 w-5" /> Complete voucher sale
                </span>
                <span className="font-display text-lg font-black tabular-nums">{money(0)}</span>
              </button>
            )}
            <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
              <button
                disabled={!lines.length}
                onClick={() => {
                  setLines([]);
                  setTendered(0);
                  setPay(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-semibold text-white/40 hover:text-white disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear order
              </button>
              <button
                disabled={!lines.length}
                onClick={parkOrder}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-semibold text-white/40 hover:text-white disabled:opacity-40"
              >
                <Pause className="h-3.5 w-3.5" /> Park
              </button>
              <button
                onClick={() => setHeldOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-semibold text-white/40 hover:text-white"
              >
                <FolderOpen className="h-3.5 w-3.5" /> Held {held.length ? `(${held.length})` : ""}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* mobile order bar */}
      {!showOrder && (
        <button
          onClick={() => setShowOrder(true)}
          className="fixed inset-x-3 bottom-3 z-30 flex h-14 items-center justify-between rounded-2xl bg-primary px-5 text-primary-foreground shadow-2xl shadow-primary/30 transition active:scale-[0.99] lg:hidden"
        >
          <span className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            <ReceiptText className="h-5 w-5" /> {count} item{count === 1 ? "" : "s"}
          </span>
          <span className="font-display text-xl font-black tabular-nums">{money(due)}</span>
        </button>
      )}

      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl border border-white/10 bg-neutral-900 p-4 shadow-2xl sm:rounded-3xl">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-lg font-black">How are they paying?</h2>
              <span className="font-display text-2xl font-black tabular-nums text-primary">
                {money(due)}
              </span>
            </div>
            <div className="grid gap-2">
              <PayChoice
                icon={Smartphone}
                label="Card — SumUp Solo"
                hint={readerReady ? "Reader online" : "Reader offline"}
                tone="primary"
                onClick={() => {
                  setPayOpen(false);
                  setReaderSaleKey(crypto.randomUUID());
                  setPay("reader");
                }}
              />
              <PayChoice
                icon={Banknote}
                label="Cash"
                hint="Opens the tender keypad"
                onClick={() => {
                  setPayOpen(false);
                  setPay("cash");
                  setTendered(0);
                }}
              />
              <PayChoice
                icon={CircleDollarSign}
                label="Split cash and card"
                disabled={due < 2}
                onClick={() => {
                  setPayOpen(false);
                  void startSplitPayment();
                }}
              />
              {has("admin") && (
                <PayChoice
                  icon={CreditCard}
                  label="Manual card terminal"
                  hint="Manager only — needs a receipt reference"
                  onClick={() => {
                    setPayOpen(false);
                    setPay("manual");
                  }}
                />
              )}
              {!voucher && (
                <PayChoice
                  icon={Ticket}
                  label="Apply juror voucher"
                  onClick={() => {
                    setPayOpen(false);
                    setVoucherOpen(true);
                  }}
                />
              )}
              {side === "judge" && (
                <PayChoice
                  icon={ReceiptText}
                  label="Put on a judge's tab"
                  hint="Billed to the judge's account, not paid now"
                  onClick={() => {
                    setPayOpen(false);
                    setTabOpen(true);
                  }}
                />
              )}
            </div>
            <button
              onClick={() => setPayOpen(false)}
              className="mt-3 h-12 w-full rounded-2xl border border-white/10 text-sm font-bold text-white/60 transition hover:bg-white/5 active:scale-[0.99]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {pay === "manual" && (
        <ManualCardModal
          total={due}
          busy={busy}
          onClose={() => setPay(null)}
          onConfirm={(reference) => void finish("card", reference)}
        />
      )}
      {tabOpen && (
        <JudgeTabModal
          total={due}
          busy={busy}
          onClose={() => setTabOpen(false)}
          onConfirm={(account: { id: string; name: string }) => void chargeJudgeTab(account)}
        />
      )}
      {(pay === "reader" || pay === "split") && shift && readerSaleKey && (
        <ReaderPay
          total={due - (pay === "split" ? splitCash : 0)}
          cashComponent={pay === "split" ? splitCash : 0}
          basket={{
            idempotency_key: readerSaleKey,
            shift_id: shift.id,
            customer_name: name.trim() || "Counter",
            type,
            table_number: table.trim() || undefined,
            pos_terminal: side,
            voucher_code: voucher?.code,
            voucher_pin: voucher?.pin,
            items: lines.map((line) => ({
              menu_item_id: line.id,
              qty: line.qty,
              notes: line.notes || undefined,
              modifier_ids: line.modifier_ids,
            })),
          }}
          readers={readers}
          readerId={readerId}
          setReaderId={setReaderId}
          readerError={readerError}
          reloadReaders={loadReaders}
          onClose={() => setPay(null)}
          onPaid={(result) => void completeSale(result, pay === "split" ? "split" : "card")}
          onSettings={() => {
            setPay(null);
            setSettings(true);
          }}
        />
      )}
      {voucherOpen && (
        <VoucherModal
          onClose={() => setVoucherOpen(false)}
          onApply={(v) => {
            setVoucher(v);
            setVoucherOpen(false);
          }}
        />
      )}
      {customize && (
        <ItemCustomizeModal
          item={customize}
          modifiers={modifiers.filter(
            (modifier) =>
              modifier.item_id === customize.id ||
              (!modifier.item_id && modifier.category_id === customize.category_id),
          )}
          onClose={() => setCustomize(null)}
          onAdd={(line) => {
            setLines((current) => [...current, line]);
            setCustomize(null);
          }}
        />
      )}
      {heldOpen && (
        <HeldOrdersModal
          orders={held}
          onClose={() => setHeldOpen(false)}
          onRetrieve={retrieveOrder}
          onDelete={(id) => setHeld((current) => current.filter((order) => order.id !== id))}
        />
      )}
      {shiftPanel && (
        <ShiftModal
          mode={shiftPanel}
          shift={shift}
          isAdmin={has("admin")}
          onClose={() => setShiftPanel(null)}
          onOpen={async (openingFloat) => {
            await openShift({ data: { terminal: side, opening_float_cents: openingFloat } });
            setShiftPanel(null);
            await loadShift();
          }}
          onCloseShift={async (counted, note) => {
            if (!shift) return;
            const result = await closeShift({
              data: { shift_id: shift.id, counted_cash_cents: counted, note },
            });
            toast.success(`Shift closed · variance ${money(result.discrepancy_cents ?? 0)}`);
            setShiftPanel(null);
            await loadShift();
          }}
          onCashEvent={async (eventType, amount, reason) => {
            if (!shift) return;
            await cashEvent({
              data: { shift_id: shift.id, event_type: eventType, amount_cents: amount, reason },
            });
            toast.success(eventType === "paid_in" ? "Cash paid in" : "Cash paid out");
            setShiftPanel(null);
          }}
        />
      )}
      {settings && (
        <TillSettings
          readers={readers}
          readerError={readerError}
          reload={loadReaders}
          online={online}
          readerReady={readerReady}
          printerReady={deviceStatus.printerReady}
          displayConnected={displayConnected}
          displayRelay={displayRelay}
          onClose={() => setSettings(false)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------- widgets */

/** Small status chip with a coloured dot for the till's hardware strip. */

/** One row in the till's overflow menu. */

/** One payment method row in the charge sheet. */
/** Judge tab picker — same house accounts the KDS manual judge ticket uses. */
function JudgeTabModal({
  total,
  busy,
  onClose,
  onConfirm,
}: {
  total: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (account: { id: string; name: string }) => void;
}) {
  const load = useServerFn(listAccounts);
  const add = useServerFn(quickAddAccount);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let live = true;
    void load()
      .then((rows) => {
        if (live) setAccounts(rows.map((r) => ({ id: r.id, name: r.name })));
      })
      .catch(() => toast.error("Could not load the judge tabs"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [load]);

  const term = query.trim().toLowerCase();
  const shown = accounts.filter((a) => !term || a.name.toLowerCase().includes(term));
  const exact = accounts.some((a) => a.name.toLowerCase() === term);

  async function createAndCharge() {
    const name = query.trim();
    if (name.length < 2) return toast.error("Enter the judge's name");
    setAdding(true);
    try {
      const account = await add({ data: { name } });
      setAccounts((current) =>
        current.some((a) => a.id === account.id)
          ? current
          : [{ id: account.id, name: account.name }, ...current],
      );
      onConfirm({ id: account.id, name: account.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add that judge");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Modal title="Put on a judge's tab" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-white/60">
          {money(total)} will be billed to the judge's account. Nothing is taken now.
        </p>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or type a judge's name"
          className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-base font-semibold outline-none focus:border-primary"
        />
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {loading && <p className="text-sm text-white/40">Loading tabs…</p>}
          {!loading && !shown.length && (
            <p className="text-sm text-white/40">No matching tab — add the judge below.</p>
          )}
          {shown.map((account) => (
            <button
              key={account.id}
              disabled={busy}
              onClick={() => onConfirm(account)}
              className="flex h-12 w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 text-left text-sm font-bold transition hover:bg-white/10 disabled:opacity-40"
            >
              <span className="truncate">{account.name}</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
                Charge tab
              </span>
            </button>
          ))}
        </div>
        {term.length >= 2 && !exact && (
          <button
            disabled={adding || busy}
            onClick={() => void createAndCharge()}
            className="h-12 w-full rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            Add “{query.trim()}” and charge tab
          </button>
        )}
      </div>
    </Modal>
  );
}

function PayChoice({
  icon: Icon,
  label,
  hint,
  tone,
  disabled,
  onClick,
}: {
  icon: typeof Banknote;
  label: string;
  hint?: string;
  tone?: "primary";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex h-16 w-full items-center gap-3 rounded-2xl border px-4 text-left transition active:scale-[0.99] disabled:opacity-40 ${
        tone === "primary"
          ? "border-primary/50 bg-primary/15 hover:bg-primary/25"
          : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{label}</span>
        {hint && <span className="block truncate text-[11px] text-white/45">{hint}</span>}
      </span>
    </button>
  );
}

function TillMenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Inbox;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white active:scale-[0.99]"
    >
      <Icon className="h-4 w-4 shrink-0 text-white/50" />
      {label}
    </button>
  );
}

function StatusDot({ ok, label, muted }: { ok: boolean; label: string; muted?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 ${
        ok
          ? "bg-emerald-500/10 text-emerald-300"
          : muted
            ? "text-white/45"
            : "bg-amber-500/10 text-amber-300"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : muted ? "bg-white/30" : "bg-amber-400"}`}
      />
      {label}
    </span>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    return () => prior?.focus();
  }, []);

  function handleKey(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panel.current) return;
    const focusable = Array.from(
      panel.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]",
      ),
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={handleKey}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-neutral-900 p-6 text-white shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-display text-xl font-bold">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/15 hover:border-white/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ManualCardModal({
  total,
  busy,
  onClose,
  onConfirm,
}: {
  total: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reference: string) => void;
}) {
  const [reference, setReference] = useState("");
  return (
    <Modal title="Manager manual card settlement" onClose={onClose}>
      <p className="text-sm text-white/60">
        Use only after an external terminal shows an approved payment. The receipt reference is
        stored in the audit log.
      </p>
      <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-white/50">
        Terminal receipt reference
      </label>
      <input
        value={reference}
        onChange={(event) => setReference(event.target.value)}
        placeholder="e.g. TXN-4821"
        className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-neutral-800 px-4 outline-none focus:border-primary"
      />
      <button
        disabled={busy || reference.trim().length < 4}
        onClick={() => onConfirm(reference.trim())}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50"
      >
        <Check className="h-4 w-4" /> Confirm {money(total)} paid
      </button>
    </Modal>
  );
}

function ItemCustomizeModal({
  item,
  modifiers,
  onClose,
  onAdd,
}: {
  item: Item;
  modifiers: Modifier[];
  onClose: () => void;
  onAdd: (line: Line) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState(1);
  const chosen = modifiers.filter((modifier) => selected.includes(modifier.id));
  const groups = useMemo(() => groupModifierOptions(modifiers), [modifiers]);
  const selectionErrors = useMemo(
    () => validateModifierSelection(modifiers, selected),
    [modifiers, selected],
  );
  const unitPrice =
    item.price_cents + chosen.reduce((sum, modifier) => sum + modifier.price_cents, 0);

  return (
    <Modal title={`Customise ${item.name}`} onClose={onClose}>
      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.name}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/70">
                  {group.name}
                </p>
                <p className="text-xs text-white/45">{selectionInstruction(group)}</p>
              </div>
              {group.required && (
                <span className="rounded-full bg-primary/20 px-2 py-1 text-[10px] font-bold uppercase text-primary">
                  Required
                </span>
              )}
            </div>
            <div className="space-y-2">
              {group.modifiers.map((modifier) => {
                const active = selected.includes(modifier.id);
                return (
                  <button
                    key={modifier.id}
                    onClick={() => {
                      const result = active
                        ? { selected: new Set(selected.filter((id) => id !== modifier.id)) }
                        : toggleModifierSelection(selected, group, modifier);
                      if (result.error) toast.error(result.error);
                      setSelected([...result.selected]);
                    }}
                    className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm font-semibold ${active ? "border-primary bg-primary/15 text-primary" : "border-white/10 text-white/75"}`}
                  >
                    <span>
                      {active ? "✓ " : ""}
                      {modifier.name}
                    </span>
                    <span>
                      {modifier.price_cents ? `+${money(modifier.price_cents)}` : "Included"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-white/50">
        Kitchen note / allergen alert
      </label>
      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value.slice(0, 200))}
        placeholder="e.g. allergy: no dairy; sauce on side"
        className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-neutral-800 p-3 text-sm outline-none focus:border-primary"
      />
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => setQty((value) => Math.max(1, value - 1))}
          className="grid h-11 w-11 place-items-center rounded-xl border border-white/15"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-8 text-center text-lg font-bold">{qty}</span>
        <button
          onClick={() => setQty((value) => Math.min(50, value + 1))}
          className="grid h-11 w-11 place-items-center rounded-xl border border-white/15"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            if (selectionErrors.length) {
              toast.error(selectionErrors[0]);
              return;
            }
            onAdd({
              key: crypto.randomUUID(),
              id: item.id,
              name: item.name,
              price_cents: unitPrice,
              qty,
              is_beverage: item.is_beverage,
              modifier_ids: selected,
              modifier_names: chosen.map((modifier) => modifier.name),
              notes: notes.trim(),
            });
          }}
          aria-disabled={selectionErrors.length > 0}
          className={`ml-auto min-h-11 rounded-xl px-5 font-bold ${selectionErrors.length ? "bg-white/10 text-white/45" : "bg-primary text-primary-foreground"}`}
        >
          {selectionErrors.length ? selectionErrors[0] : `Add · ${money(unitPrice * qty)}`}
        </button>
      </div>
    </Modal>
  );
}

function HeldOrdersModal({
  orders,
  onClose,
  onRetrieve,
  onDelete,
}: {
  orders: HeldOrder[];
  onClose: () => void;
  onRetrieve: (order: HeldOrder) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Modal title="Parked orders" onClose={onClose}>
      <div className="space-y-2">
        {orders.map((order) => (
          <div
            key={order.id}
            className="flex items-center gap-3 rounded-xl border border-white/10 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{order.label}</p>
              <p className="text-xs text-white/45">
                {order.lines.reduce((sum, line) => sum + line.qty, 0)} items ·{" "}
                {new Date(order.saved_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <button
              onClick={() => onRetrieve(order)}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
            >
              Retrieve
            </button>
            <button
              onClick={() => onDelete(order.id)}
              aria-label={`Delete ${order.label}`}
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/15"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {!orders.length && (
          <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/45">
            No parked orders.
          </p>
        )}
      </div>
    </Modal>
  );
}

function poundsToCents(value: string): number | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}

function ShiftModal({
  mode,
  shift,
  isAdmin,
  onClose,
  onOpen,
  onCloseShift,
  onCashEvent,
}: {
  mode: "open" | "close" | "cash";
  shift: TillShift | null;
  isAdmin: boolean;
  onClose: () => void;
  onOpen: (openingFloat: number) => Promise<void>;
  onCloseShift: (counted: number, note: string) => Promise<void>;
  onCashEvent: (event: "paid_in" | "paid_out", amount: number, reason: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [cashType, setCashType] = useState<"paid_in" | "paid_out">("paid_in");
  const [busy, setBusy] = useState(false);
  const title =
    mode === "open" ? "Open till shift" : mode === "close" ? "Close till shift" : "Cash movement";

  async function submit() {
    const cents = poundsToCents(amount);
    if (cents === null) return toast.error("Enter a valid amount");
    if (mode === "cash" && (!reason.trim() || reason.trim().length < 3)) {
      return toast.error("A reason is required");
    }
    setBusy(true);
    try {
      if (mode === "open") await onOpen(cents);
      else if (mode === "close") await onCloseShift(cents, reason.trim());
      else await onCashEvent(cashType, cents, reason.trim());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Shift action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      {shift && mode !== "open" && (
        <div className="mb-4 rounded-xl bg-neutral-800 p-3 text-sm text-white/65">
          Opened {new Date(shift.opened_at).toLocaleString()} · float{" "}
          {money(shift.opening_float_cents)}
        </div>
      )}
      {mode === "cash" && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setCashType("paid_in")}
            className={`h-11 rounded-xl border font-semibold ${cashType === "paid_in" ? "border-emerald-400 bg-emerald-500/15 text-emerald-300" : "border-white/10"}`}
          >
            Cash in
          </button>
          <button
            disabled={!isAdmin}
            onClick={() => setCashType("paid_out")}
            className={`h-11 rounded-xl border font-semibold disabled:opacity-35 ${cashType === "paid_out" ? "border-red-400 bg-red-500/15 text-red-300" : "border-white/10"}`}
          >
            Cash out · manager
          </button>
        </div>
      )}
      <label className="block text-xs font-bold uppercase tracking-widest text-white/50">
        {mode === "open" ? "Opening float" : mode === "close" ? "Counted cash in drawer" : "Amount"}
      </label>
      <div className="mt-2 flex items-center rounded-xl border border-white/10 bg-neutral-800 px-4 focus-within:border-primary">
        <span className="text-white/45">£</span>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          className="h-12 min-w-0 flex-1 bg-transparent px-2 text-lg font-bold outline-none"
        />
      </div>
      {mode !== "open" && (
        <>
          <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-white/50">
            {mode === "close" ? "Close note (optional)" : "Reason"}
          </label>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={mode === "cash" ? "e.g. petty cash milk purchase" : "Handover note"}
            className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-neutral-800 px-4 outline-none focus:border-primary"
          />
        </>
      )}
      <button
        disabled={busy || !amount}
        onClick={() => void submit()}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CircleDollarSign className="h-4 w-4" />
        )}
        {mode === "open" ? "Open shift" : mode === "close" ? "Count and close" : "Record movement"}
      </button>
    </Modal>
  );
}

function ReaderPay({
  total,
  cashComponent,
  basket,
  readers,
  readerId,
  setReaderId,
  readerError,
  reloadReaders,
  onClose,
  onPaid,
  onSettings,
}: {
  total: number;
  cashComponent: number;
  basket: CounterBasketInput;
  readers: { id: string; name: string; status: string }[];
  readerId: string;
  setReaderId: (v: string) => void;
  readerError?: string | null;
  reloadReaders: () => Promise<void>;
  onClose: () => void;
  onPaid: (result: CounterResult) => void;
  onSettings: () => void;
}) {
  const prepare = useServerFn(prepareCounterOrder);
  const finalize = useServerFn(finalizeCounterCardPayment);
  const cancelOrder = useServerFn(cancelCounterOrder);
  const start = useServerFn(startReaderPayment);
  const check = useServerFn(checkReaderPayment);
  const cancel = useServerFn(cancelReaderPayment);
  const [state, setState] = useState<"idle" | "waiting" | "failed">("idle");
  const [note, setNote] = useState("");
  const [prepared, setPrepared] = useState<CounterResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);
  const attemptId = useRef<string | null>(null);

  useEffect(
    () => () => {
      stopped.current = true;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function begin() {
    if (!readerId) return toast.error("Pick a card reader first");
    stopped.current = false;
    setState("waiting");
    setNote("Tap, insert or swipe on the Solo…");
    try {
      let order = prepared;
      if (!order) {
        const created = await prepare({ data: basket });
        order = created;
        setPrepared(created);
        if (created.total_cents < 1 || created.payment_status === "paid") {
          onPaid(created);
          return;
        }
      }
      const startedAttempt = await start({
        data: {
          reader_id: readerId,
          order_id: order.order_id,
          cash_component_cents: cashComponent,
        },
      });
      attemptId.current = startedAttempt.payment_attempt_id;
      const started = Date.now();
      const poll = async () => {
        if (stopped.current) return;
        try {
          const r = await check({
            data: { payment_attempt_id: startedAttempt.payment_attempt_id },
          });
          if (r.paid) {
            stopped.current = true;
            try {
              const completed = await finalize({
                data: {
                  order_id: order.order_id,
                  payment_attempt_id: startedAttempt.payment_attempt_id,
                },
              });
              onPaid(completed);
            } catch (error) {
              setState("failed");
              setNote(
                error instanceof Error
                  ? `Card was approved, but the order could not be finalised: ${error.message}`
                  : "Card was approved, but the order could not be finalised. Ask a manager to reconcile it.",
              );
            }
            return;
          } else if (r.failed) {
            stopped.current = true;
            setState("failed");
            setNote("Payment declined or cancelled on the reader");
            return;
          } else if (Date.now() - started > 3 * 60_000) {
            stopped.current = true;
            setState("failed");
            setNote("Timed out waiting for the reader");
            return;
          }
        } catch (error) {
          console.error("[till] reader poll", error);
        }
        if (!stopped.current) timer.current = setTimeout(() => void poll(), 2500);
      };
      timer.current = setTimeout(() => void poll(), 1500);
    } catch (e) {
      setState("failed");
      setNote(e instanceof Error ? e.message : "Could not reach the reader");
    }
  }

  async function abort() {
    stopped.current = true;
    if (timer.current) clearTimeout(timer.current);
    try {
      if (readerId) {
        await cancel({
          data: {
            reader_id: readerId,
            payment_attempt_id: attemptId.current ?? undefined,
          },
        });
      }
      if (prepared) {
        await cancelOrder({
          data: { order_id: prepared.order_id, reason: "Reader payment cancelled at till" },
        });
      }
      onClose();
    } catch (error) {
      setState("failed");
      setNote(error instanceof Error ? error.message : "Could not safely cancel payment");
    }
  }

  return (
    <Modal title="Card payment on SumUp Solo" onClose={abort}>
      <div className="rounded-2xl bg-neutral-800 p-4 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-white/40">Card amount</p>
        <p className="font-display text-4xl font-black text-primary">
          {money(prepared ? prepared.total_cents - cashComponent : total)}
        </p>
        {cashComponent > 0 && (
          <p className="mt-1 text-xs text-white/50">Plus {money(cashComponent)} cash</p>
        )}
      </div>

      {readers.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {readers.map((r) => (
            <button
              key={r.id}
              onClick={() => setReaderId(r.id)}
              disabled={state === "waiting"}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${readerId === r.id ? "bg-primary text-primary-foreground" : "border border-white/10 text-white/80 hover:border-white/40"}`}
            >
              <Smartphone className="h-4 w-4" /> {r.name}
              <span className="ml-auto">
                <ReaderStatusPill status={r.status} />
              </span>
            </button>
          ))}
        </div>
      )}

      <ReaderConnectionAlert
        readers={readers}
        readerId={readerId}
        error={readerError}
        onRetry={reloadReaders}
        onSettings={onSettings}
      />

      {state === "waiting" ? (
        <div className="mt-5 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="mt-2 text-sm font-semibold">{note}</p>
          <button onClick={abort} className="mt-3 text-xs font-semibold text-white/60 underline">
            Cancel payment
          </button>
        </div>
      ) : (
        <>
          {state === "failed" && (
            <p className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-300">{note}</p>
          )}
          <button
            disabled={
              !readers.length || !isReaderOnline(readers.find((r) => r.id === readerId)?.status)
            }
            onClick={begin}
            className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-40"
          >
            <CreditCard className="h-5 w-5" /> {prepared ? "Retry reader" : "Send to reader"}
          </button>
        </>
      )}
    </Modal>
  );
}

function TillSettings({
  readers,
  readerError,
  reload,
  online,
  readerReady,
  printerReady,
  displayConnected,
  displayRelay,
  onClose,
}: {
  readers: { id: string; name: string; status: string }[];
  readerError?: string | null;
  reload: () => Promise<void>;
  online: boolean;
  readerReady: boolean;
  printerReady: boolean;
  displayConnected: boolean;
  displayRelay: CustomerDisplayRelay;
  onClose: () => void;
}) {
  const pairFn = useServerFn(pairSumupReader);
  const unpairFn = useServerFn(unpairSumupReader);
  const [code, setCode] = useState("");
  const [name, setName] = useState("Counter Solo");
  const [bridgeUrl, setBridgeUrl] = useState(() => getDeviceBridgeConfig().baseUrl);
  const [bridgeToken, setBridgeToken] = useState(() => getDeviceBridgeConfig().token);
  const [bridgeMessage, setBridgeMessage] = useState<string | null>(null);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const readiness = [
    { label: "Internet", ok: online },
    { label: "Card reader", ok: readerReady },
    { label: "Printer", ok: printerReady },
    { label: "Customer display", ok: displayConnected },
  ];
  const readyCount = readiness.filter((item) => item.ok).length;

  async function pair() {
    const clean = code.trim().replace(/[\s-]/g, "").toUpperCase();
    if (!clean) return toast.error("Enter the pairing code shown on the Solo");
    if (clean.length !== 8) {
      return toast.error(
        "SumUp pairing codes are 8 characters (e.g. A7KD9PQ2). On the Solo open Settings → Connections → Connect to POS to see the full code.",
      );
    }
    setBusy(true);
    try {
      await pairFn({ data: { pairing_code: clean, name: name.trim() || "Solo" } });
      toast.success("Reader paired");
      setCode("");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pairing failed");
    } finally {
      setBusy(false);
    }
  }

  async function unpair(id: string) {
    try {
      await unpairFn({ data: { reader_id: id } });
      toast.success("Reader removed");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove reader");
    }
  }

  async function saveAndTestBridge() {
    setBridgeBusy(true);
    setBridgeMessage(null);
    try {
      setDeviceBridgeConfig({ baseUrl: bridgeUrl, token: bridgeToken });
      const result = await checkDeviceBridge();
      setBridgeMessage(result.message);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save Device Bridge";
      setBridgeMessage(message);
      toast.error(message);
    } finally {
      setBridgeBusy(false);
    }
  }

  return (
    <Modal title="Till settings" onClose={onClose}>
      <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-white/45">
              Hardware readiness
            </p>
            <p className="mt-1 text-sm font-semibold text-white/80">
              {readyCount}/4 devices responding now
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-black ${
              readyCount === readiness.length
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-amber-500/20 text-amber-200"
            }`}
          >
            {readyCount === readiness.length ? "Ready" : "Check devices"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {readiness.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-neutral-950/40 px-3 py-2 text-xs font-semibold"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${item.ok ? "bg-emerald-400" : "bg-amber-400"}`}
              />
              {item.label}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-white/35">
          Live status helps setup; complete the physical payment, print, drawer and display tests
          before recording operational acceptance.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-white/40">
          SumUp Solo readers
        </p>
        <button
          onClick={() => void reload()}
          className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-bold uppercase hover:border-primary"
        >
          Refresh
        </button>
      </div>
      {readerError && (
        <p className="mt-2 rounded-xl bg-red-500/15 p-3 text-xs text-red-300">
          SumUp connection problem: {readerError}
        </p>
      )}
      <div className="mt-2 space-y-1.5">
        {readers.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm"
          >
            <Smartphone className="h-4 w-4 text-white/50" />
            <span className="flex-1 truncate font-semibold">{r.name}</span>
            <ReaderStatusPill status={r.status} />
            <button
              onClick={() => unpair(r.id)}
              aria-label={`Remove ${r.name}`}
              className="grid h-7 w-7 place-items-center rounded-lg border border-white/15 hover:border-primary"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {!readers.length && <p className="text-sm text-white/50">None paired yet.</p>}
      </div>
      <div className="mt-3 rounded-xl border border-white/10 p-3">
        <p className="text-xs font-bold uppercase tracking-widest text-white/40">
          Connect the Solo through SumUp Cloud
        </p>
        <ReaderLinkGuide />
      </div>
      <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Reader name"
          className="h-10 rounded-xl border border-white/10 bg-neutral-800 px-3 text-sm outline-none focus:border-primary"
        />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="8-char code e.g. A7KD9PQ2"
          maxLength={8}
          className="h-10 rounded-xl border border-white/10 bg-neutral-800 px-3 font-mono text-sm outline-none focus:border-primary"
        />
        <button
          disabled={busy}
          onClick={pair}
          className="inline-flex h-10 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Pair
        </button>
      </div>

      <p className="mt-6 text-xs font-bold uppercase tracking-widest text-white/40">
        Receipt printer and cash drawer
      </p>
      <p className="mt-1 text-xs text-white/40">
        {isIminDevice()
          ? "iMin/Sunmi hardware detected — printing and drawer control are available natively."
          : "For USB, Bluetooth or Wi-Fi ESC/POS printers, run Cafe 1 Device Bridge on this till and pair it below. The drawer connects through the receipt printer."}
      </p>
      {!isIminDevice() && (
        <div className="mt-3 grid gap-2 rounded-xl border border-white/10 p-3">
          <label className="text-[11px] font-bold uppercase tracking-wide text-white/45">
            Device Bridge URL
          </label>
          <input
            value={bridgeUrl}
            onChange={(e) => setBridgeUrl(e.target.value)}
            placeholder="http://127.0.0.1:4782"
            inputMode="url"
            className="h-10 rounded-xl border border-white/10 bg-neutral-800 px-3 text-sm outline-none focus:border-primary"
          />
          <label className="text-[11px] font-bold uppercase tracking-wide text-white/45">
            Pairing token
          </label>
          <input
            value={bridgeToken}
            onChange={(e) => setBridgeToken(e.target.value)}
            placeholder="Long token configured on the bridge"
            type="password"
            autoComplete="off"
            className="h-10 rounded-xl border border-white/10 bg-neutral-800 px-3 text-sm outline-none focus:border-primary"
          />
          <button
            disabled={bridgeBusy || !bridgeUrl.trim() || !bridgeToken.trim()}
            onClick={() => void saveAndTestBridge()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 text-sm font-bold hover:border-primary disabled:opacity-40"
          >
            {bridgeBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wifi className="h-4 w-4" />
            )}
            Save and test connection
          </button>
          {bridgeMessage && (
            <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/60">{bridgeMessage}</p>
          )}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            void (async () => {
              const ticket: PrintTicket = {
                heading: "TEST TICKET",
                order_number: 0,
                fulfilment: "Dine in",
                terminal: "Counter",
                lines: [{ name: "Test print", qty: 1, price_cents: 0 }],
                total_cents: 0,
              };
              if (iminPrintTickets([ticket])) return toast.success("Test ticket printed");
              const result = await printViaDeviceBridge([ticket]);
              if (result.ok) toast.success(result.message);
              else {
                window.open("/print/test?paper=58", "_blank");
                toast.error(`${result.message}. Print preview opened.`);
              }
            })();
          }}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 text-sm font-bold hover:border-primary"
        >
          <Printer className="h-4 w-4" /> Test print
        </button>
        <button
          onClick={() =>
            void openCashDrawer().then((r) =>
              r.ok ? toast.success(r.message) : toast.error(r.message),
            )
          }
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 text-sm font-bold hover:border-primary"
        >
          <Inbox className="h-4 w-4" /> Test drawer
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/40">
              Customer display pairing
            </p>
            <p className="mt-1 text-xs text-white/45">
              Scan this on a separate Wi-Fi tablet, or open it on the till&apos;s second screen.
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
              displayConnected
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-amber-500/20 text-amber-200"
            }`}
          >
            {displayConnected ? "Display online" : "Waiting for display"}
          </span>
        </div>
        {displayRelay.displayUrl && (
          <div className="mt-3 grid gap-3 sm:grid-cols-[132px_1fr]">
            <div className="w-fit rounded-2xl bg-white p-2">
              <QrCode
                value={displayRelay.displayUrl}
                size={116}
                alt="Pair a Cafe 1 customer display"
              />
            </div>
            <div className="grid content-start gap-2">
              <button
                onClick={() => {
                  const result = openCustomerScreen(displayRelay.displayUrl);
                  if (result.ok) toast.success(result.message);
                  else toast.error(result.message);
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground"
              >
                <MonitorPlay className="h-4 w-4" /> Open second screen
              </button>
              <button
                onClick={() =>
                  void navigator.clipboard
                    .writeText(displayRelay.displayUrl)
                    .then(() => toast.success("Secure display link copied"))
                    .catch(() => toast.error("Could not copy the display link"))
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-bold hover:border-primary"
              >
                <Copy className="h-4 w-4" /> Copy pairing link
              </button>
              <button
                onClick={() =>
                  void (async () => {
                    const rotate = await askConfirm({
                      title: "Replace the display pairing?",
                      description:
                        "The current Wi-Fi display will disconnect. Scan the new code on the approved customer screen.",
                      confirmLabel: "Replace pairing",
                      destructive: true,
                    });
                    if (!rotate) return;
                    displayRelay.rotatePairing();
                    toast.success("Old display pairing revoked");
                  })()
                }
                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl text-xs font-bold text-white/55 hover:bg-white/5 hover:text-white"
              >
                <RotateCw className="h-3.5 w-3.5" /> Replace pairing
              </button>
            </div>
          </div>
        )}
        <p className="mt-3 rounded-xl bg-sky-400/10 px-3 py-2 text-[11px] text-sky-100/70">
          The 256-bit link signs every relayed message and stays out of server request logs. Only
          basket totals, payment confirmation and idle status can cross the relay; juror codes and
          PINs are blocked.
        </p>
      </div>
    </Modal>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      if (!email) throw new Error("Staff session expired. Sign in again.");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setPassword("");
      onUnlock();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not unlock till");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-neutral-950 text-white">
      <form
        onSubmit={unlock}
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-white/10 bg-neutral-900 px-8 py-12 shadow-2xl"
      >
        <Lock className="h-10 w-10 text-primary" />
        <span className="font-display text-2xl font-bold">Till locked</span>
        <span className="text-center text-sm text-white/50">
          Re-enter your staff password to carry on serving.
        </span>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
          autoFocus
          placeholder="Password"
          className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-neutral-800 px-4 outline-none focus:border-primary"
        />
        <button
          disabled={busy || !password}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}{" "}
          Unlock till
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------- juror voucher */

function VoucherModal({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (v: AppliedVoucher) => void;
}) {
  const lookup = useServerFn(lookupVoucher);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/juror?src=till`;

  useEffect(() => {
    if (url) postToDisplay({ type: "juror", url });
  }, [url]);

  /* The juror can key their own code + PIN on the customer screen — staff never see it. */
  useEffect(() => {
    return subscribeToDisplay(
      (msg: DisplayMessage) => {
        if (msg.type !== "juror_applied") return;
        onApply({
          code: msg.code,
          pin: msg.pin,
          remaining_cents: msg.remaining_cents,
          allocated_cents: msg.allocated_cents,
          opted_in: msg.opted_in,
        });
        toast.success(`${money(msg.remaining_cents)} allowance left today`);
      },
      { replay: false },
    );
  }, [onApply]);

  async function apply() {
    const c = code.trim().toUpperCase();
    if (!c || !/^\d{6}$/.test(pin)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await lookup({ data: { code: c, pin } });
      if (!res.found) {
        setError(("message" in res && res.message) || "That voucher code isn't recognised.");
      } else if (!res.usable) {
        setError(res.message ?? "That code can't be used today.");
      } else if (res.remaining_cents <= 0) {
        setError("Today's allowance has already been used on this code.");
      } else {
        onApply({
          code: res.code,
          pin,
          remaining_cents: res.remaining_cents,
          allocated_cents: res.allocated_cents,
          opted_in: res.opted_in,
        });
        toast.success(`${money(res.remaining_cents)} allowance left today`);
      }
    } catch {
      setError("Could not check that code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Juror voucher" onClose={onClose}>
      <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
        <div className="mx-auto w-fit rounded-2xl bg-white p-3">
          {url && <QrCode value={url} size={150} alt="Scan to open the juror voucher page" />}
        </div>
        <div className="text-sm text-white/60">
          <p className="font-semibold text-white">Ask the customer to scan</p>
          <p className="mt-1">
            The same QR is on the customer screen. Scanning opts them into the scheme and shows
            their remaining allowance after they enter their Juror ID and separate PIN —{" "}
            {money(JUROR_DAILY_ALLOWANCE_CENTS)} each sitting day, plus{" "}
            {JUROR_FOOD_DISCOUNT_PERCENT}% off food above it.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/40">
            <ShieldCheck className="h-3.5 w-3.5" /> Pseudonymous — Café 1 records no juror name.
          </p>
        </div>
      </div>

      <label className="mt-6 block text-xs font-bold uppercase tracking-widest text-white/50">
        Or key in the HMCTS Juror ID / voucher code and separate PIN
      </label>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_120px_auto]">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void apply();
          }}
          placeholder="Enter Juror ID"
          className="h-12 flex-1 rounded-xl border border-white/10 bg-neutral-800 px-4 font-mono text-base uppercase outline-none focus:border-primary"
        />
        <input
          aria-label="Six-digit voucher PIN"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void apply();
          }}
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          placeholder="PIN"
          className="h-12 rounded-xl border border-white/10 bg-neutral-800 px-4 text-center font-mono text-base tracking-widest outline-none focus:border-primary"
        />
        <button
          onClick={() => void apply()}
          disabled={busy || !code.trim() || pin.length !== 6}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}{" "}
          Apply
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </Modal>
  );
}
