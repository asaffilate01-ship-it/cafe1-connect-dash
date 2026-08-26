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
import { getAccountStatement, listAccounts, quickAddAccount } from "@/lib/accounts.functions";
import { chargeOrderToAccount, findSimilarAccountOrder } from "@/lib/judge-tab.functions";
import { QrCode } from "@/components/qr-code";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  QrCode as QrCodeIcon,
  Delete,
  ReceiptText,
  UtensilsCrossed,
  ChevronLeft,
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
  Leaf,
  StickyNote,
  Scale,
  BadgePercent,
  PanelLeftOpen,
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
  is_veg: boolean;
  is_beverage: boolean;
  barcode: string | null;
};
type Modifier = ModifierRule & {
  price_cents: number;
  category_id: string | null;
  item_id: string | null;
  is_veg: boolean;
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
/** Till-facing choices: judges room is a dine-in order routed to the judge side. */
type FulfilChoice = Fulfilment | "judges_room";
const FULFIL_CHOICES: { id: FulfilChoice; label: string; Icon: typeof ShoppingBag }[] = [
  { id: "dine_in", label: "Dine in", Icon: HandPlatter },
  { id: "collection", label: "Takeaway", Icon: ShoppingBag },
  { id: "judges_room", label: "Judges room", Icon: Scale },
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
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);
  /** One-off discount keyed in by the operator for this basket only. */
  const [manualDiscount, setManualDiscount] = useState<null | {
    type: "percent" | "fixed_amount";
    value: number;
    reason: string;
  }>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
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
  const [qrCast, setQrCast] = useState(false);
  const displayStatus = useCustomerDisplayStatus();
  const displayRelay = useCustomerDisplayRelay({ role: "till" });
  const deviceStatus = usePosDeviceStatus();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const basketRef = useRef<HTMLUListElement | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [noteKey, setNoteKey] = useState<string | null>(null);
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
            "id, name, price_cents, category_id, item_id, group_name, group_type, required, min_selections, max_selections, is_exclusive, is_veg",
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
    // Staff scan the grid by name, so keep every list A–Z on every till.
    const byName = (a: Item, b: Item) =>
      a.name.localeCompare(b.name, "en-GB", { sensitivity: "base", numeric: true });
    const term = q.trim().toLowerCase();
    if (term) {
      return items
        .filter(
          (item) => item.name.toLowerCase().includes(term) || item.barcode?.toLowerCase() === term,
        )
        .sort(byName)
        .slice(0, 80);
    }
    if (catId === FAVOURITES_CATEGORY) {
      const order = new Map(favourites.ids.map((id, index) => [id, index]));
      return items
        .filter((item) => order.has(item.id))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    return items.filter((i) => i.category_id === catId).sort(byName);
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
    manualDiscountType: manualDiscount?.type ?? null,
    manualDiscountValue: manualDiscount?.value ?? 0,
  });
  const voucherApplied = pricing.voucherCents;
  const jurorDiscount = pricing.discountCents;
  const manualDiscountCents = pricing.manualDiscountCents;
  const due = pricing.dueCents;
  /** Sent with every counter order so the discount is priced and audited server-side. */
  const manualDiscountArgs = manualDiscount
    ? {
        manual_discount_type: manualDiscount.type,
        manual_discount_value: manualDiscount.value,
        manual_discount_reason: manualDiscount.reason,
      }
    : {};

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
            discount_cents: jurorDiscount + manualDiscountCents,
            due,
            fulfilment: type,
          }
        : { type: "idle" },
    );
  }, [due, jurorDiscount, manualDiscountCents, lines, total, type, voucherApplied]);

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
      } else if (event.key === "Escape" && showOrder && !typing) {
        setShowOrder(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showOrder]);

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
  function setLineNote(key: string, note: string) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, notes: note.slice(0, 140) } : l)));
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
    setManualDiscount(null);
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
    setManualDiscount(null);
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
      setManualDiscount(null);
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
            ...manualDiscountArgs,
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
    [
      completeSale,
      create,
      lines,
      manualDiscountArgs,
      name,
      online,
      shift,
      side,
      table,
      type,
      voucher,
    ],
  );

  /**
   * House-account orders use the same account ledger as online and manual KDS
   * orders. Preparing once and then changing that order to on_account keeps a
   * tab sale as one KDS ticket.
   */
  const chargeAccountTab = useCallback(
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
            ...manualDiscountArgs,
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
      manualDiscountArgs,
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
    setManualDiscount(null);
    setPay(null);
    setTendered(0);
    setSide(next);
  }

  const fulfilChoice: FulfilChoice = side === "judge" ? "judges_room" : type;
  const fulfilLabel =
    FULFIL_CHOICES.find((item) => item.id === fulfilChoice)?.label ?? String(type);

  async function selectFulfilment(next: FulfilChoice) {
    if (next === "judges_room") {
      await changeSide("judge");
      setType("dine_in");
      return;
    }
    if (side === "judge") await changeSide("public");
    setType(next);
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
    <div className="isolate flex h-screen h-dvh w-full max-w-full flex-col overflow-hidden bg-slate-50 text-slate-950">
      {/* Keep the compact two-row header until there is enough room for the desktop split. */}
      <header
        data-pos-region="header"
        className="relative z-[80] grid w-full max-w-full shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 overflow-visible border-b border-slate-200 bg-white/98 px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] shadow-sm min-[380px]:gap-2 min-[380px]:px-2.5 min-[960px]:flex min-[960px]:gap-3 min-[960px]:px-4 min-[960px]:py-1.5"
      >
        <span className="inline-flex w-fit rounded-xl bg-primary px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-primary-foreground shadow-lg shadow-primary/25 xl:px-3 xl:text-xs xl:tracking-[0.2em]">
          Cafe 1 <span className="ml-1 hidden sm:inline">Till</span>
        </span>
        <div className="col-span-3 row-start-2 grid w-full grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 shadow-inner shadow-slate-300/60 min-[960px]:col-span-1 min-[960px]:row-auto min-[960px]:flex min-[960px]:w-auto min-[960px]:shrink-0">
          {(["jury", "public"] as const).map((s) => (
            <button
              key={s}
              onClick={() => changeSide(s)}
              className={`h-9 w-full rounded-lg px-2 text-center text-[11px] font-black uppercase tracking-wide transition active:scale-95 min-[960px]:h-8 min-[960px]:w-auto min-[960px]:px-3 ${side === s ? `${SIDE_TONE[s]} shadow-md` : "text-slate-500 hover:bg-white hover:text-slate-950"}`}
            >
              {SIDE_LABEL[s]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShiftPanel(shift ? "close" : "open")}
          className={`mx-auto min-w-0 max-w-full truncate rounded-full px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition hover:brightness-125 min-[380px]:px-3 min-[380px]:text-[11px] min-[960px]:mx-0 min-[960px]:shrink-0 ${shift ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
        >
          {shiftLoading ? "Loading shift…" : shift ? "Shift open" : "Open shift"}
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide lg:inline-flex">
            <StatusDot ok={online} label={online ? "Online" : "Offline"} />
            <StatusDot ok={readerReady} label="Card" />
            <StatusDot ok={deviceStatus.printerReady} label="Printer" />
            <StatusDot ok={displayConnected} label="Display" />
          </span>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Till menu"
            aria-expanded={menuOpen}
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-slate-100 transition hover:bg-slate-200 active:scale-95 lg:h-9 lg:w-9"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
        {menuOpen && (
          <>
            <button
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-[70] cursor-default bg-black/20"
            />
            <div
              data-pos-region="till-menu"
              className="absolute right-2 top-full z-[90] mt-1.5 max-h-[calc(100dvh-7rem-env(safe-area-inset-top))] w-[min(17rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-2xl border border-slate-300 bg-white p-1.5 text-slate-950 shadow-2xl shadow-slate-300/70 sm:right-3"
            >
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
              <TillMenuItem
                icon={QrCodeIcon}
                label="Show a QR on customer screen"
                onClick={() => {
                  setMenuOpen(false);
                  setQrCast(true);
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
              <div className="my-1 h-px bg-slate-200" />
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
        <p className="shrink-0 bg-red-100 px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-red-800">
          Offline — payments are blocked until the connection returns
        </p>
      )}

      <Sheet open={categoryDrawerOpen} onOpenChange={setCategoryDrawerOpen}>
        <SheetContent
          side="left"
          className="z-[100] w-[90vw] max-w-sm overflow-y-auto border-r-0 bg-slate-50 p-0 text-slate-950 shadow-2xl min-[960px]:hidden"
        >
          <SheetHeader className="border-b border-slate-200 bg-gradient-to-br from-primary/15 via-white to-white px-5 pb-5 pt-[calc(1.25rem+env(safe-area-inset-top))] text-left">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <PanelLeftOpen className="h-5 w-5" />
            </span>
            <SheetTitle className="font-display text-2xl font-black text-slate-950">
              Till categories
            </SheetTitle>
            <p className="text-sm text-slate-500">
              Choose a category and return straight to the product grid.
            </p>
          </SheetHeader>
          <nav aria-label="Till categories" className="space-y-1.5 p-3 pb-28">
            <button
              type="button"
              onClick={() => {
                setCatId(FAVOURITES_CATEGORY);
                setQ("");
                setCategoryDrawerOpen(false);
              }}
              aria-current={catId === FAVOURITES_CATEGORY && !q ? "true" : undefined}
              className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-black uppercase tracking-wide transition active:scale-[0.98] ${
                catId === FAVOURITES_CATEGORY && !q
                  ? "bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/25"
                  : "bg-white text-amber-700"
              }`}
            >
              <Star className="h-5 w-5 fill-current" />
              <span className="flex-1">Favourites</span>
              <span className="grid h-7 min-w-7 place-items-center rounded-full bg-black/10 px-2 text-xs">
                {favourites.ids.length}
              </span>
            </button>
            {cats.map((category) => {
              const active = catId === category.id && !q;
              const itemCount = items.filter((item) => item.category_id === category.id).length;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setCatId(category.id);
                    setQ("");
                    setCategoryDrawerOpen(false);
                  }}
                  aria-current={active ? "true" : undefined}
                  className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left text-sm font-black uppercase tracking-wide transition active:scale-[0.98] ${
                    active
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="truncate">{category.name}</span>
                  <span
                    className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs ${
                      active ? "bg-white/20" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {itemCount}
                  </span>
                </button>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <div
        data-pos-region="workspace"
        className="relative grid min-h-0 min-w-0 flex-1 overflow-hidden min-[960px]:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[172px_minmax(0,1fr)_392px] 2xl:grid-cols-[192px_minmax(0,1fr)_420px]"
      >
        {/* category rail (desktop) */}
        <nav className="hidden min-h-0 flex-col gap-1 overflow-y-auto border-r border-slate-200 bg-white p-2 xl:flex">
          <button
            onClick={() => {
              setCatId(FAVOURITES_CATEGORY);
              setQ("");
            }}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-3 text-left text-[11px] font-black uppercase leading-tight tracking-wide transition active:scale-[0.98] ${
              catId === FAVOURITES_CATEGORY && !q
                ? "bg-amber-400 text-neutral-950 shadow-lg shadow-amber-400/20"
                : "text-amber-700 hover:bg-amber-100 hover:text-amber-900"
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
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              {c.name}
            </button>
          ))}
        </nav>

        {/* products */}
        <section data-pos-region="catalogue" className="flex min-h-0 min-w-0 flex-col">
          <div
            data-pos-region="mobile-fulfilment"
            className="shrink-0 border-b border-slate-200 bg-white/95 px-2 py-1.5 min-[960px]:hidden"
          >
            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200 bg-white/95 p-1">
              {FULFIL_CHOICES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={fulfilChoice === id}
                  onClick={() => void selectFulfilment(id)}
                  className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg px-2 text-xs font-black uppercase tracking-wide transition active:scale-[0.98] ${fulfilChoice === id ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="shrink-0 space-y-2 border-b border-slate-200 p-2.5 min-[960px]:p-3 xl:space-y-0 xl:px-4 xl:py-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCategoryDrawerOpen(true)}
                aria-label="Open till categories"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm active:scale-95 sm:hidden"
              >
                <PanelLeftOpen className="h-5 w-5" />
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 shadow-inner shadow-slate-200 focus-within:border-primary/60">
                <Search className="h-4 w-4 shrink-0 text-slate-500" />
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && addBarcode(q)) event.preventDefault();
                  }}
                  placeholder="Search or scan…"
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 min-[960px]:h-10"
                  autoComplete="off"
                />
                {q && (
                  <button type="button" onClick={() => setQ("")} aria-label="Clear search">
                    <X className="h-4 w-4 text-slate-500" />
                  </button>
                )}
                <kbd className="hidden shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 xl:block">
                  /
                </kbd>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCatId(FAVOURITES_CATEGORY);
                  setQ("");
                }}
                aria-label="Show favourite menu items"
                aria-pressed={catId === FAVOURITES_CATEGORY && !q}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition active:scale-95 xl:hidden ${catId === FAVOURITES_CATEGORY && !q ? "border-amber-400 bg-amber-400 text-amber-950 shadow-md shadow-amber-400/20" : "border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:text-amber-700"}`}
              >
                <Star
                  className={`h-5 w-5 ${catId === FAVOURITES_CATEGORY && !q ? "fill-current" : ""}`}
                />
              </button>
            </div>
            {!q && (
              <div className="-mx-0.5 hidden snap-x snap-mandatory scroll-px-0.5 gap-1.5 overflow-x-auto overscroll-x-contain px-0.5 pb-0.5 sm:flex xl:hidden">
                {cats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCatId(c.id)}
                    className={`h-9 shrink-0 snap-start rounded-full px-3 text-[11px] font-bold uppercase tracking-wide transition active:scale-95 ${catId === c.id ? "bg-slate-900 text-white shadow-lg shadow-slate-300" : "border border-slate-200 bg-white text-slate-700"}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            ref={gridRef}
            className="min-h-0 flex-1 overflow-y-auto p-2 pb-24 min-[960px]:p-3 min-[960px]:pb-3"
          >
            <div
              data-pos-region="product-grid"
              className="grid min-w-0 grid-cols-3 items-stretch gap-2 min-[560px]:grid-cols-4 min-[800px]:grid-cols-5 min-[960px]:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-6"
            >
              {visible.map((i) => (
                <div
                  key={i.id}
                  data-pos-item
                  className="group relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-primary/70 hover:shadow-lg hover:shadow-primary/10"
                >
                  <button
                    onClick={() => add(i)}
                    className="flex h-full w-full flex-col text-left transition active:scale-[0.97]"
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
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
                        <div className="grid h-full w-full place-items-center bg-[radial-gradient(80%_80%_at_50%_20%,rgba(255,255,255,0.06),transparent)] text-slate-300">
                          <UtensilsCrossed className="h-5 w-5 sm:h-6 sm:w-6" />
                        </div>
                      )}
                    </div>
                    <div className="flex min-h-[52px] min-w-0 flex-1 flex-col justify-between gap-1 p-2 sm:min-h-[56px]">
                      <span className="line-clamp-2 min-h-[2.2em] text-[11px] font-bold leading-[1.15] min-[390px]:text-xs">
                        {i.name}
                      </span>
                      <span className="font-display text-xs font-black tabular-nums text-primary sm:text-sm">
                        {money(i.price_cents)}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => favourites.toggle(i.id)}
                    aria-label={`${favourites.has(i.id) ? "Remove" : "Add"} ${i.name} ${favourites.has(i.id) ? "from" : "to"} favourites`}
                    aria-pressed={favourites.has(i.id)}
                    className={`absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg border shadow-lg transition active:scale-90 ${favourites.has(i.id) ? "border-amber-300 bg-amber-400 text-neutral-950" : "border-white/80 bg-white/90 text-slate-600 hover:text-amber-600"}`}
                  >
                    <Star className={`h-3.5 w-3.5 ${favourites.has(i.id) ? "fill-current" : ""}`} />
                  </button>
                </div>
              ))}
              {!visible.length && (
                <p className="col-span-full rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  {catId === FAVOURITES_CATEGORY
                    ? "No favourites yet — tap the star on your fastest-selling items to create quick keys for this till."
                    : "No items in this category."}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* A scrim makes the tablet checkout sheet an explicit, dismissible task. */}
        {showOrder && (
          <button
            type="button"
            aria-label="Close current order"
            onClick={() => setShowOrder(false)}
            className="fixed inset-0 z-[84] bg-slate-950/45 backdrop-blur-[2px] min-[960px]:hidden"
          />
        )}

        {/* Phone checkout is full-screen; tablet checkout is a right sheet; desktop is split. */}
        <aside
          data-pos-region="order"
          className={`fixed inset-y-0 right-0 z-[85] flex h-dvh min-h-0 w-[min(31rem,94vw)] max-w-full min-w-0 flex-col overflow-hidden overscroll-contain border-l border-slate-200 bg-white shadow-[-18px_0_50px_-24px_rgba(15,23,42,0.75)] transition-[transform,visibility] duration-300 ease-out min-[960px]:pointer-events-auto min-[960px]:static min-[960px]:z-auto min-[960px]:h-auto min-[960px]:w-full min-[960px]:translate-x-0 min-[960px]:visible min-[960px]:border-l-0 min-[960px]:shadow-none ${showOrder ? "visible translate-x-0" : "invisible translate-x-full pointer-events-none"}`}
        >
          <div className="relative z-10 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-200 bg-white px-2.5 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] shadow-lg shadow-slate-200/70 min-[380px]:gap-3 min-[380px]:px-3 min-[960px]:hidden">
            <button
              type="button"
              data-pos-action="back-to-menu"
              onClick={() => setShowOrder(false)}
              aria-label="Back to menu"
              className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-2 text-xs font-black uppercase tracking-wide text-slate-700 active:scale-95 min-[360px]:px-3"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="hidden min-[360px]:inline">Menu</span>
            </button>
            <span className="min-w-0">
              <span className="block truncate font-display text-lg font-bold">Current order</span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {count} item{count === 1 ? "" : "s"} · {fulfilLabel}
              </span>
            </span>
            <span className="font-display text-xl font-black tabular-nums text-primary">
              {money(due)}
            </span>
          </div>
          <div className="relative z-10 shrink-0 space-y-1.5 border-b border-slate-200 bg-white p-2.5 shadow-md shadow-slate-200/70 md:p-2.5">
            <div
              data-pos-region="order-fulfilment"
              className="grid grid-cols-3 gap-1.5 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 md:gap-1 md:p-1"
            >
              {FULFIL_CHOICES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={fulfilChoice === id}
                  onClick={() => void selectFulfilment(id)}
                  className={`flex min-h-10 flex-row items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-bold uppercase tracking-wide transition active:scale-95 md:min-h-0 md:gap-0.5 md:py-1.5 ${fulfilChoice === id ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "text-slate-600 hover:bg-white hover:text-slate-950"}`}
                >
                  <Icon className="h-4 w-4 md:h-3.5 md:w-3.5" /> {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-100 p-1.5 md:p-1">
              <button
                onClick={() => setLaterTime("")}
                className={`h-9 flex-1 rounded-xl text-[11px] font-bold uppercase tracking-wide transition active:scale-95 md:h-8 ${laterTime ? "text-slate-600 hover:bg-white hover:text-slate-950" : "bg-primary text-primary-foreground shadow-md shadow-primary/25"}`}
              >
                ASAP
              </button>
              <label className="flex flex-1 items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Later
                </span>
                <input
                  type="time"
                  step={300}
                  value={laterTime}
                  onChange={(e) => setLaterTime(e.target.value)}
                  aria-label="Time this order is wanted for"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm tabular-nums outline-none focus:border-primary md:h-8"
                />
              </label>
            </div>
            {laterTime && (
              <p className="rounded-lg bg-violet-700/20 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-violet-200">
                Pre-order · kitchen will hold this until {laterTime}
              </p>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer name (optional)"
                className="h-9 min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 text-xs outline-none placeholder:text-slate-400 focus:border-primary"
              />
              {type === "dine_in" ? (
                <input
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                  placeholder="Table number"
                  className="h-9 min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 text-xs outline-none placeholder:text-slate-400 focus:border-primary"
                />
              ) : (
                <div className="hidden sm:block" />
              )}
            </div>
          </div>

          <div
            className={`min-h-0 flex-1 overflow-y-auto p-4 md:p-2.5 ${pay === "cash" ? "max-h-[28vh] min-[960px]:max-h-none" : ""}`}
          >
            <ul ref={basketRef} className="space-y-2 md:space-y-1.5">
              {lines.map((l) => (
                <li
                  key={l.key}
                  data-line={l.key}
                  className={`group grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 rounded-2xl border p-2.5 text-sm transition duration-200 ${
                    flashKey === l.key
                      ? "border-primary/70 bg-primary/15"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  <span className="min-w-0 self-center">
                    <span className="block truncate font-semibold">{l.name}</span>
                    {(l.modifier_names.length > 0 || l.notes) && (
                      <span className="block truncate text-[11px] text-slate-500">
                        {[...l.modifier_names, l.notes].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5 self-start">
                    <span className="font-semibold tabular-nums">
                      {money(l.price_cents * l.qty)}
                    </span>
                    <button
                      onClick={() => bump(l.key, -l.qty)}
                      aria-label={`Remove ${l.name} from the order`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-600 active:scale-90"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <div className="col-span-2 flex flex-wrap items-center gap-1.5">
                    <div className="flex w-fit items-center gap-1 rounded-xl border border-slate-200 bg-white p-0.5">
                      <button
                        onClick={() => bump(l.key, -1)}
                        aria-label={`Remove one ${l.name}`}
                        className="grid h-9 w-9 place-items-center rounded-lg transition hover:bg-white/10 active:scale-90"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-7 text-center font-bold tabular-nums">{l.qty}</span>
                      <button
                        onClick={() => bump(l.key, 1)}
                        aria-label={`Add one ${l.name}`}
                        className="grid h-9 w-9 place-items-center rounded-lg transition hover:bg-white/10 active:scale-90"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => setNoteKey((k) => (k === l.key ? null : l.key))}
                      aria-label={`Add a kitchen note for ${l.name}`}
                      className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-bold uppercase tracking-wide transition active:scale-95 ${
                        l.notes
                          ? "border-amber-400/50 bg-amber-400/15 text-amber-200"
                          : "border-slate-200 bg-white text-slate-500 hover:text-slate-950"
                      }`}
                    >
                      <StickyNote className="h-3.5 w-3.5" />
                      {l.notes ? "Note" : "Add note"}
                    </button>
                  </div>
                  {noteKey === l.key && (
                    <div className="col-span-2 hidden items-center gap-1.5 min-[960px]:flex">
                      <input
                        autoFocus
                        value={l.notes}
                        onChange={(e) => setLineNote(l.key, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") setNoteKey(null);
                        }}
                        maxLength={140}
                        placeholder="e.g. no butter, well done"
                        aria-label={`Kitchen note for ${l.name}`}
                        className="h-10 min-w-0 flex-1 rounded-xl border border-amber-400/40 bg-white px-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-amber-300"
                      />
                      {l.notes && (
                        <button
                          onClick={() => setLineNote(l.key, "")}
                          aria-label={`Clear note for ${l.name}`}
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setNoteKey(null)}
                        className="h-10 shrink-0 rounded-xl bg-amber-400 px-3 text-xs font-bold uppercase tracking-wide text-neutral-950 transition active:scale-95"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {!lines.length && (
                <li className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  Tap items to start an order
                  {lastOrder && (
                    <span className="mt-3 block text-xs text-slate-500">
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

          {/* Phones/tablets get a bottom sheet so the note field stays above the keyboard. */}
          {noteKey && lines.some((l) => l.key === noteKey) && (
            <div
              className="fixed inset-0 z-[130] flex items-end bg-black/70 backdrop-blur-sm min-[960px]:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Kitchen note"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setNoteKey(null);
              }}
            >
              <div className="w-full rounded-t-3xl border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
                {(() => {
                  const line = lines.find((l) => l.key === noteKey)!;
                  return (
                    <>
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                            Kitchen note
                          </p>
                          <p className="truncate font-display text-lg font-bold">{line.name}</p>
                        </div>
                        <button
                          onClick={() => setNoteKey(null)}
                          aria-label="Close note"
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <textarea
                        autoFocus
                        value={line.notes}
                        onChange={(e) => setLineNote(line.key, e.target.value)}
                        maxLength={140}
                        placeholder="e.g. no butter, well done"
                        aria-label={`Kitchen note for ${line.name}`}
                        className="min-h-20 w-full rounded-2xl border border-amber-400/40 bg-white p-3 text-base outline-none placeholder:text-slate-400 focus:border-amber-300"
                      />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {["No sauce", "Extra hot", "Well done", "Allergy", "To go"].map(
                          (preset) => (
                            <button
                              key={preset}
                              onClick={() =>
                                setLineNote(
                                  line.key,
                                  (line.notes ? `${line.notes}; ` : "")
                                    .concat(preset)
                                    .slice(0, 140),
                                )
                              }
                              className="h-9 rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-bold text-slate-700 active:scale-95"
                            >
                              {preset}
                            </button>
                          ),
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                        <button
                          onClick={() => setLineNote(line.key, "")}
                          className="h-12 rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-600 active:scale-95"
                        >
                          Clear
                        </button>
                        <button
                          onClick={() => setNoteKey(null)}
                          className="h-12 rounded-2xl bg-amber-400 text-sm font-black uppercase tracking-wide text-neutral-950 active:scale-95"
                        >
                          Save note
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {pay === "cash" && (
            <div className="min-h-0 shrink overflow-y-auto border-t border-slate-200 p-2.5 min-[380px]:p-3 md:shrink-0 md:p-2.5">
              <div className="mb-1.5 grid grid-cols-3 items-end gap-2 rounded-2xl border border-slate-100 bg-slate-100 px-3 py-2 md:mb-1.5 md:py-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Tendered
                  </p>
                  <p className="text-base font-bold tabular-nums">{money(tendered)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Change
                  </p>
                  <p
                    className={`text-base font-bold tabular-nums ${tendered - due < 0 ? "text-slate-400" : "text-emerald-600"}`}
                  >
                    {tendered === 0 || tendered - due < 0 ? "—" : money(tendered - due)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
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
                    className="h-11 min-[380px]:h-12 rounded-xl border border-slate-200 bg-slate-100 text-lg font-bold tabular-nums transition hover:bg-slate-200 active:scale-95 md:h-10"
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setTendered(due)}
                  className="h-11 min-[380px]:h-12 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-xs font-black uppercase tracking-wide text-emerald-300 transition hover:bg-emerald-500/20 active:scale-95 md:h-10"
                >
                  Exact
                </button>
                <button
                  onClick={() => setTendered((t) => Math.min(t * 10, 5_000_00))}
                  className="h-11 min-[380px]:h-12 rounded-xl border border-slate-200 bg-slate-100 text-lg font-bold tabular-nums transition hover:bg-slate-200 active:scale-95 md:h-10"
                >
                  0
                </button>
                <button
                  onClick={() => setTendered((t) => Math.floor(t / 10 / 100) * 100)}
                  aria-label="Delete last digit"
                  className="grid h-11 min-[380px]:h-12 place-items-center rounded-xl border border-slate-200 bg-slate-100 transition hover:bg-slate-200 active:scale-95 md:h-10"
                >
                  <Delete className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setTendered(0)}
                  className="h-11 min-[380px]:h-12 rounded-xl border border-slate-200 text-xs font-black uppercase tracking-wide text-slate-500 transition hover:bg-slate-100 active:scale-95 md:h-10"
                >
                  Clear
                </button>
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {[500, 1000, 2000, 5000].map((v) => (
                  <button
                    key={v}
                    onClick={() => setTendered(v)}
                    className="h-8 min-[380px]:h-9 rounded-xl border border-slate-200 text-xs font-bold tabular-nums text-slate-700 transition hover:bg-slate-100 active:scale-95 md:h-8"
                  >
                    {money(v)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(voucher || lines.length > 0) && (
            <div
              className={`shrink-0 space-y-1.5 border-t border-slate-200 px-3 pt-2 text-sm ${pay === "cash" ? "hidden min-[960px]:block" : ""}`}
            >
              {voucher ? (
                <>
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-300">
                      <Ticket className="h-3.5 w-3.5" /> Juror {voucher.code}
                    </span>
                    <button
                      onClick={() => setVoucher(null)}
                      className="text-xs font-semibold text-slate-500 underline"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="flex justify-between text-slate-700">
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
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/40 text-xs font-bold uppercase tracking-wide text-indigo-300 hover:border-indigo-400 md:h-9"
                >
                  <Ticket className="h-4 w-4" /> Juror voucher
                </button>
              )}

              {manualDiscount ? (
                <div className="flex items-center justify-between text-amber-300">
                  <span className="truncate">
                    Discount ·{" "}
                    {manualDiscount.type === "percent"
                      ? `${manualDiscount.value}%`
                      : money(manualDiscount.value)}{" "}
                    <span className="text-slate-500">({manualDiscount.reason})</span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="tabular-nums">−{money(manualDiscountCents)}</span>
                    <button
                      onClick={() => setManualDiscount(null)}
                      className="text-xs font-semibold text-slate-500 underline"
                    >
                      Remove
                    </button>
                  </span>
                </div>
              ) : (
                lines.length > 0 && (
                  <button
                    onClick={() => setDiscountOpen(true)}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 text-xs font-bold uppercase tracking-wide text-amber-300 hover:border-amber-400 md:h-9"
                  >
                    <BadgePercent className="h-4 w-4" /> Add discount
                  </button>
                )
              )}
            </div>
          )}
          {discountOpen && (
            <ManualDiscountModal
              dueCents={total - voucherApplied - jurorDiscount}
              onClose={() => setDiscountOpen(false)}
              onApply={(value) => {
                setManualDiscount(value);
                setDiscountOpen(false);
              }}
            />
          )}

          <div className="relative z-20 mt-auto shrink-0 space-y-2 border-t border-slate-200 bg-slate-100 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_28px_-24px_rgba(15,23,42,0.9)] md:space-y-1.5 md:p-2.5">
            {lines.length > 0 && pay !== "cash" && (
              <div className="flex items-baseline justify-between rounded-2xl bg-white/5 px-4 py-2.5 md:py-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
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
                  className="inline-flex h-14 items-center justify-between gap-2 rounded-2xl bg-emerald-600 px-5 text-base font-bold text-white shadow-lg shadow-emerald-600/25 transition active:scale-[0.99] disabled:opacity-40 md:h-12"
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
                  className="h-14 rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition hover:bg-white active:scale-95 md:h-12"
                >
                  Back
                </button>
              </div>
            ) : due > 0 ? (
              <button
                disabled={!lines.length || busy || !shift || !online}
                onClick={() => setPayOpen(true)}
                className="inline-flex h-14 w-full items-center justify-between gap-2 rounded-2xl bg-primary px-5 text-base font-bold text-primary-foreground shadow-lg shadow-primary/25 transition active:scale-[0.99] disabled:opacity-40 disabled:shadow-none md:h-12"
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
                className="inline-flex h-14 w-full items-center justify-between gap-2 rounded-2xl bg-indigo-500 px-5 text-base font-bold text-white shadow-lg shadow-indigo-500/25 transition active:scale-[0.99] disabled:opacity-40 disabled:shadow-none md:h-12"
              >
                <span className="inline-flex items-center gap-2">
                  <Ticket className="h-5 w-5" /> Complete voucher sale
                </span>
                <span className="font-display text-lg font-black tabular-nums">{money(0)}</span>
              </button>
            )}
            <div className="grid grid-cols-3 items-center gap-1 text-xs">
              <button
                disabled={!lines.length}
                onClick={() => {
                  setLines([]);
                  setTendered(0);
                  setPay(null);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 font-semibold text-slate-500 hover:text-slate-950 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear order
              </button>
              <button
                disabled={!lines.length}
                onClick={parkOrder}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 font-semibold text-slate-500 hover:text-slate-950 disabled:opacity-40"
              >
                <Pause className="h-3.5 w-3.5" /> Park
              </button>
              <button
                onClick={() => setHeldOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 font-semibold text-slate-500 hover:text-slate-950"
              >
                <FolderOpen className="h-3.5 w-3.5" /> Held {held.length ? `(${held.length})` : ""}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Native-style mobile till dock. */}
      <nav
        data-pos-region="mobile-order-bar"
        aria-label="Till tools"
        className="fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-30 grid h-[4.35rem] grid-cols-4 overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white/95 px-1 shadow-2xl shadow-slate-400/40 backdrop-blur min-[960px]:hidden"
      >
        <button
          type="button"
          onClick={() => {
            setShowOrder(false);
            setMenuOpen(false);
            setCategoryDrawerOpen(true);
          }}
          className="relative flex flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-black uppercase tracking-wide text-slate-600 active:scale-95"
        >
          <PanelLeftOpen className="h-5 w-5" />
          Categories
        </button>
        <button
          type="button"
          onClick={() => {
            setCategoryDrawerOpen(false);
            setShowOrder(false);
            setMenuOpen(false);
          }}
          aria-current={!showOrder && !categoryDrawerOpen && !menuOpen ? "page" : undefined}
          className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-black uppercase tracking-wide active:scale-95 ${
            !showOrder && !categoryDrawerOpen && !menuOpen
              ? "bg-primary/10 text-primary"
              : "text-slate-600"
          }`}
        >
          <UtensilsCrossed className="h-5 w-5" />
          Browse
          {!showOrder && !categoryDrawerOpen && !menuOpen && (
            <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setCategoryDrawerOpen(false);
            setMenuOpen(false);
            setShowOrder(true);
          }}
          aria-current={showOrder ? "page" : undefined}
          className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-black uppercase tracking-wide active:scale-95 ${
            showOrder ? "bg-primary/10 text-primary" : "text-slate-600"
          }`}
        >
          <span className="relative">
            <ReceiptText className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-2.5 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </span>
          Order · {money(due)}
        </button>
        <button
          type="button"
          onClick={() => {
            setCategoryDrawerOpen(false);
            setShowOrder(false);
            setMenuOpen((value) => !value);
          }}
          aria-expanded={menuOpen}
          className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-black uppercase tracking-wide active:scale-95 ${
            menuOpen ? "bg-slate-900 text-white" : "text-slate-600"
          }`}
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>

      {payOpen && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[90dvh] sm:rounded-3xl sm:pb-4">
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
              <PayChoice
                icon={ReceiptText}
                label="House tab"
                hint="Choose an account · bill now, settle later"
                onClick={() => {
                  setPayOpen(false);
                  setTabOpen(true);
                }}
              />
            </div>
            <button
              onClick={() => setPayOpen(false)}
              className="mt-3 h-12 w-full rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 transition hover:bg-slate-100 active:scale-[0.99]"
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
        <AccountTabModal
          total={due}
          busy={busy}
          canCreate={has("admin")}
          onClose={() => setTabOpen(false)}
          onConfirm={(account: { id: string; name: string }) => void chargeAccountTab(account)}
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
            ...manualDiscountArgs,
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
      {qrCast && <QrCastModal onClose={() => setQrCast(false)} />}
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

/* ------------------------------------------------- QR cast to 2nd screen */

const QR_PRESETS: { id: string; label: string; path: string; subtitle: string }[] = [
  {
    id: "juror",
    label: "Juror voucher scheme",
    path: "/juror?src=till",
    subtitle: "Scan to check your allowance and opt in",
  },
  {
    id: "judges",
    label: "Judges menu",
    path: "/judges-menu",
    subtitle: "Scan to order from chambers",
  },
  {
    id: "menu",
    label: "Order online",
    path: "/menu",
    subtitle: "Scan to order and pay from your phone",
  },
  {
    id: "feedback",
    label: "Leave feedback",
    path: "/contact",
    subtitle: "Tell us how we did today",
  },
];

/** Lets the counter throw a QR code (voucher, judges, menu…) onto /display. */
function QrCastModal({ onClose }: { onClose: () => void }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const [custom, setCustom] = useState("");

  function show(url: string, title: string, subtitle: string) {
    postToDisplay({ type: "qr", url, title, subtitle });
    toast.success("QR shown on the customer screen");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900 p-5 text-white">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-black">Show a QR on the customer screen</h2>
          <button onClick={onClose} aria-label="Close" className="text-white/60">
            ✕
          </button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {QR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => show(`${origin}${preset.path}`, preset.label, preset.subtitle)}
              className="rounded-xl border border-white/10 bg-neutral-800 p-3 text-left hover:border-primary"
            >
              <span className="block font-bold">{preset.label}</span>
              <span className="block text-xs text-white/50">{preset.subtitle}</span>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <label className="text-xs font-bold uppercase tracking-widest text-white/50">
            Custom link
          </label>
          <div className="mt-1 flex gap-2">
            <input
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder="https://…"
              className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-neutral-800 px-3 outline-none focus:border-primary"
            />
            <button
              disabled={!/^https:\/\//.test(custom.trim())}
              onClick={() => show(custom.trim(), "Scan this code", "")}
              className="h-11 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50"
            >
              Show
            </button>
          </div>
        </div>
        <button
          onClick={() => {
            postToDisplay({ type: "idle" });
            toast.success("Customer screen back to adverts");
            onClose();
          }}
          className="mt-4 h-11 w-full rounded-xl border border-white/15 font-bold"
        >
          Back to adverts
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- widgets */

/** Small status chip with a coloured dot for the till's hardware strip. */

/** One row in the till's overflow menu. */

/** One payment method row in the charge sheet. */
type TillTabAccount = Awaited<ReturnType<typeof listAccounts>>[number];
type TillTabStatement = Awaited<ReturnType<typeof getAccountStatement>>;

/** Account picker and ledger preview for both public and judge-side tills. */
/**
 * Ad-hoc discount at the till. A reason is required so every discount is
 * auditable, and the server re-prices it — this dialog is display only.
 */
function ManualDiscountModal({
  dueCents,
  onClose,
  onApply,
}: {
  dueCents: number;
  onClose: () => void;
  onApply: (value: { type: "percent" | "fixed_amount"; value: number; reason: string }) => void;
}) {
  const [type, setType] = useState<"percent" | "fixed_amount">("percent");
  const [percent, setPercent] = useState(10);
  const [pounds, setPounds] = useState("1.00");
  const [reason, setReason] = useState("");
  const preview =
    type === "percent"
      ? Math.round((Math.max(0, dueCents) * Math.min(100, Math.max(0, percent))) / 100)
      : Math.min(Math.max(0, dueCents), Math.round(parseFloat(pounds || "0") * 100) || 0);

  function apply() {
    if (reason.trim().length < 3) return toast.error("Add a short reason for this discount");
    if (type === "percent") {
      if (!(percent > 0 && percent <= 100)) return toast.error("Enter 1–100%");
      return onApply({ type, value: percent, reason: reason.trim() });
    }
    const cents = Math.round(parseFloat(pounds || "0") * 100);
    if (!cents || cents <= 0) return toast.error("Enter an amount off");
    onApply({ type, value: cents, reason: reason.trim() });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-4 text-white">
        <p className="font-display text-lg font-black">Discount this order</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(["percent", "fixed_amount"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`h-11 rounded-xl border text-sm font-bold ${
                type === t
                  ? "border-amber-400 bg-amber-400/10 text-amber-300"
                  : "border-white/10 text-white/60"
              }`}
            >
              {t === "percent" ? "% off" : "£ off"}
            </button>
          ))}
        </div>
        {type === "percent" ? (
          <input
            type="number"
            min={1}
            max={100}
            value={percent}
            onChange={(e) => setPercent(parseInt(e.target.value || "0", 10))}
            className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-lg tabular-nums"
            aria-label="Percent off"
          />
        ) : (
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={pounds}
            onChange={(e) => setPounds(e.target.value)}
            className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-lg tabular-nums"
            aria-label="Amount off in pounds"
          />
        )}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={120}
          placeholder="Reason (e.g. staff, goodwill, damaged item)"
          className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-sm"
        />
        <p className="mt-3 text-sm text-white/60">
          Comes off this order:{" "}
          <span className="tabular-nums text-amber-300">{money(preview)}</span>
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            className="h-12 rounded-xl border border-white/10 text-sm font-bold text-white/60"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            className="h-12 rounded-xl bg-amber-500 text-sm font-black text-black"
          >
            Apply discount
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountTabModal({
  total,
  busy,
  canCreate,
  onClose,
  onConfirm,
}: {
  total: number;
  busy: boolean;
  canCreate: boolean;
  onClose: () => void;
  onConfirm: (account: { id: string; name: string }) => void;
}) {
  const load = useServerFn(listAccounts);
  const add = useServerFn(quickAddAccount);
  const statement = useServerFn(getAccountStatement);
  const [accounts, setAccounts] = useState<TillTabAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<TillTabAccount | null>(null);
  const [details, setDetails] = useState<TillTabStatement | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    let live = true;
    void load()
      .then((rows) => {
        if (live) setAccounts(rows.filter((row) => row.active));
      })
      .catch(() => toast.error("Could not load house tabs"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [load]);

  const term = query.trim().toLowerCase();
  const shown = accounts.filter(
    (account) =>
      !term ||
      account.name.toLowerCase().includes(term) ||
      account.contact_name?.toLowerCase().includes(term) ||
      account.contact_phone?.toLowerCase().includes(term),
  );
  const exact = accounts.some((a) => a.name.toLowerCase() === term);

  async function choose(account: TillTabAccount) {
    setSelected(account);
    setDetails(null);
    setDetailsLoading(true);
    try {
      setDetails(await statement({ data: { account_id: account.id } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the tab history");
      setSelected(null);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function createAndCharge() {
    const name = query.trim();
    if (name.length < 2) return toast.error("Enter the account or customer name");
    setAdding(true);
    try {
      const account = await add({ data: { name } });
      // A counter-created account has no limit or contact details yet. Charge
      // it now; a manager can complete those details from Tab accounts.
      onConfirm({ id: account.id, name: account.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add that tab");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Modal title="Charge a house tab" onClose={onClose} wide>
      <div className="space-y-3">
        {!selected ? (
          <>
            <p className="text-sm text-white/60">
              Select the customer or business. {money(total)} is added to their running balance and
              this order is sent to the KDS once.
            </p>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, contact or phone"
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-base font-semibold outline-none focus:border-primary"
            />
            <div className="max-h-[min(24rem,48dvh)] space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
              {loading && <p className="text-sm text-white/40">Loading tabs…</p>}
              {!loading && !shown.length && (
                <p className="text-sm text-white/40">No matching active tab.</p>
              )}
              {shown.map((account) => {
                const projected = account.outstanding_cents + total;
                const overLimit =
                  account.credit_limit_cents !== null && projected > account.credit_limit_cents;
                return (
                  <button
                    key={account.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void choose(account)}
                    className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-left transition hover:border-primary/40 hover:bg-white/10 disabled:opacity-40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{account.name}</span>
                      <span className="block truncate text-[11px] text-white/45">
                        {account.contact_name || account.contact_phone || "House account"}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-black tabular-nums">
                        {money(account.outstanding_cents)} due
                      </span>
                      <span
                        className={`block text-[10px] font-bold uppercase tracking-wide ${overLimit ? "text-red-300" : "text-white/40"}`}
                      >
                        {overLimit
                          ? "Would exceed limit"
                          : account.credit_limit_cents === null
                            ? "View tab"
                            : `${money(account.credit_limit_cents)} limit`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {canCreate && term.length >= 2 && !exact && (
              <button
                disabled={adding || busy}
                onClick={() => void createAndCharge()}
                className="h-12 w-full rounded-2xl border border-primary/50 bg-primary/15 text-sm font-bold text-primary disabled:opacity-40"
              >
                {adding ? "Creating…" : `Create “${query.trim()}” and charge ${money(total)}`}
              </button>
            )}
            {!canCreate && term.length >= 2 && !exact && (
              <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/45">
                A manager must create a new tab. Staff can charge any active tab listed above.
              </p>
            )}
          </>
        ) : (
          <TabAccountPreview
            account={selected}
            details={details}
            loading={detailsLoading}
            total={total}
            busy={busy}
            onBack={() => {
              setSelected(null);
              setDetails(null);
            }}
            onConfirm={() => onConfirm({ id: selected.id, name: selected.name })}
          />
        )}
      </div>
    </Modal>
  );
}

function TabAccountPreview({
  account,
  details,
  loading,
  total,
  busy,
  onBack,
  onConfirm,
}: {
  account: TillTabAccount;
  details: TillTabStatement | null;
  loading: boolean;
  total: number;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const unpaid = details?.orders.filter((order) => order.payment_status === "on_account") ?? [];
  const paid = details?.orders.filter((order) => order.payment_status !== "on_account") ?? [];
  const unsettledPayments = details?.payments.filter((payment) => !payment.settled_at) ?? [];
  const charges = unpaid.reduce(
    (sum, order) => sum + Math.max(0, order.total_cents - order.refunded_cents),
    0,
  );
  const payments = unsettledPayments.reduce((sum, payment) => sum + payment.amount_cents, 0);
  const outstanding = details ? Math.max(0, charges - payments) : account.outstanding_cents;
  const projected = outstanding + total;
  const overLimit = account.credit_limit_cents !== null && projected > account.credit_limit_cents;
  const itemsByOrder = new Map<string, NonNullable<TillTabStatement>["items"]>();
  for (const item of details?.items ?? []) {
    const current = itemsByOrder.get(item.order_id) ?? [];
    current.push(item);
    itemsByOrder.set(item.order_id, current);
  }

  return (
    <div data-pos-region="tab-account-preview" className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/10 px-3 text-xs font-bold text-white/65 hover:bg-white/5 hover:text-white"
      >
        <ChevronLeft className="h-4 w-4" /> All tabs
      </button>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-xl font-black">{account.name}</h3>
            <p className="mt-0.5 text-xs text-white/50">
              {[account.contact_name, account.contact_phone].filter(Boolean).join(" · ") ||
                "House account"}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${outstanding > 0 ? "bg-amber-500/15 text-amber-200" : "bg-emerald-500/15 text-emerald-200"}`}
          >
            {outstanding > 0 ? "Payment due" : "Paid up"}
          </span>
        </div>
        {account.notes && (
          <p className="mt-3 rounded-xl bg-neutral-950/40 px-3 py-2 text-xs text-white/60">
            {account.notes}
          </p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <TabMetric label="Current" value={money(outstanding)} />
          <TabMetric label="This order" value={`+${money(total)}`} />
          <TabMetric label="New balance" value={money(projected)} important />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-white/45">
          <span>
            {unpaid.length} running order{unpaid.length === 1 ? "" : "s"}
            {payments > 0 ? ` · ${money(payments)} part-paid` : ""}
          </span>
          <span>
            {account.credit_limit_cents === null
              ? "No credit limit set"
              : `${money(account.credit_limit_cents)} credit limit`}
          </span>
        </div>
      </div>

      {loading && (
        <div
          aria-live="polite"
          className="rounded-2xl border border-white/10 p-5 text-sm text-white/45"
        >
          Loading running items and history…
        </div>
      )}

      {!loading && details && (
        <div className="grid gap-3 sm:grid-cols-2">
          <section className="min-w-0 rounded-2xl border border-white/10 bg-neutral-950/35 p-3">
            <h4 className="text-xs font-black uppercase tracking-widest text-white/55">
              Running items · not paid
            </h4>
            <div className="mt-2 max-h-44 space-y-2 overflow-y-auto overscroll-contain pr-1">
              {!unpaid.length && <p className="text-xs text-white/35">No unpaid orders.</p>}
              {unpaid.slice(0, 8).map((order) => (
                <div key={order.id} className="rounded-xl bg-white/5 px-3 py-2 text-xs">
                  <div className="flex justify-between gap-2 font-bold">
                    <span>
                      #{order.order_number} · {new Date(order.created_at).toLocaleDateString()}
                    </span>
                    <span className="shrink-0 tabular-nums text-amber-200">
                      {money(Math.max(0, order.total_cents - order.refunded_cents))}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-white/45">
                    {(itemsByOrder.get(order.id) ?? [])
                      .map((item) => `${item.qty}× ${item.name}`)
                      .join(" · ") || "Order details unavailable"}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="min-w-0 rounded-2xl border border-white/10 bg-neutral-950/35 p-3">
            <h4 className="text-xs font-black uppercase tracking-widest text-white/55">
              Payment &amp; order history
            </h4>
            <div className="mt-2 max-h-44 space-y-2 overflow-y-auto overscroll-contain pr-1">
              {!details.payments.length && !paid.length && (
                <p className="text-xs text-white/35">No settled history yet.</p>
              )}
              {details.payments.slice(0, 5).map((payment) => (
                <div
                  key={payment.id}
                  className="flex justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs"
                >
                  <span className="min-w-0 truncate text-white/55">
                    Payment · {payment.method.replaceAll("_", " ")} ·{" "}
                    {new Date(payment.created_at).toLocaleDateString()}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-emerald-200">
                    −{money(payment.amount_cents)}
                  </span>
                </div>
              ))}
              {paid.slice(0, 5).map((order) => (
                <div
                  key={order.id}
                  className="flex justify-between gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs"
                >
                  <span className="min-w-0 truncate text-white/55">
                    #{order.order_number} · Paid · {new Date(order.created_at).toLocaleDateString()}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">
                    {money(order.total_cents)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {overLimit && (
        <p
          role="alert"
          className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm font-semibold text-red-200"
        >
          This would take the tab to {money(projected)}, above its{" "}
          {money(account.credit_limit_cents ?? 0)} limit. Take payment or ask a manager to change
          the limit.
        </p>
      )}

      <button
        type="button"
        disabled={busy || loading || !details || overLimit}
        onClick={onConfirm}
        className="inline-flex h-14 w-full items-center justify-between rounded-2xl bg-primary px-5 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-40"
      >
        <span className="inline-flex items-center gap-2">
          <ReceiptText className="h-5 w-5" /> Charge house tab
        </span>
        <span className="font-display text-lg tabular-nums">{money(total)}</span>
      </button>
    </div>
  );
}

function TabMetric({
  label,
  value,
  important = false,
}: {
  label: string;
  value: string;
  important?: boolean;
}) {
  return (
    <span className="min-w-0 rounded-xl bg-neutral-950/45 px-2 py-2">
      <span className="block truncate text-[9px] font-black uppercase tracking-widest text-white/35">
        {label}
      </span>
      <span
        className={`mt-0.5 block truncate text-sm font-black tabular-nums ${important ? "text-primary" : "text-white"}`}
      >
        {value}
      </span>
    </span>
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
          ? "border-primary/50 bg-primary/10 hover:bg-primary/20"
          : "border-slate-200 bg-slate-50 hover:bg-slate-100"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{label}</span>
        {hint && <span className="block truncate text-[11px] text-slate-500">{hint}</span>}
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
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 active:scale-[0.99]"
    >
      <Icon className="h-4 w-4 shrink-0 text-slate-500" />
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
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
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
      className="fixed inset-0 z-[110] grid place-items-center bg-black/70 p-2 min-[380px]:p-4"
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
        className={`max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-3xl border border-white/10 bg-neutral-900 p-4 text-white shadow-2xl min-[380px]:max-h-[90vh] min-[380px]:p-6 ${wide ? "max-w-2xl" : "max-w-md"}`}
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
  const changesVegetarianItem = item.is_veg && chosen.some((modifier) => !modifier.is_veg);

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
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span>
                        {active ? "✓ " : ""}
                        {modifier.name}
                      </span>
                      {modifier.is_veg && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                          <Leaf className="h-3 w-3" /> Veg
                        </span>
                      )}
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
      {changesVegetarianItem && (
        <div className="mt-4 flex gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm font-semibold text-amber-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          Selected add-on is not marked vegetarian.
        </div>
      )}
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
    if (clean.length < 8 || clean.length > 9) {
      return toast.error(
        "SumUp pairing codes are 8–9 characters (e.g. A7KD9PQ2). On the Solo open Settings → Connections → Connect to POS to see the full code.",
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
          placeholder="8–9 char code e.g. A7KD9PQ2"
          maxLength={9}
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
