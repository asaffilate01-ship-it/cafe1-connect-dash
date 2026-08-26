import { createFileRoute } from "@tanstack/react-router";
import { AdminNav } from "@/components/admin-nav";
import { RequireRole } from "@/components/require-role";
import { signOutAndRedirect } from "@/lib/sign-out";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  updateOrderStatus,
  setOrderFulfilment,
  setOrderChannel,
  setOrderPreparedBy,
  cancelTabOrder,
  settleTabOrder,
} from "@/lib/orders.functions";
import { toast } from "sonner";
import { useSession, useRoles } from "@/hooks/use-auth";
import { useAlertOnIncrease, useNotificationPermission, playChime } from "@/hooks/use-order-alerts";
import {
  Bell,
  BellOff,
  RefreshCw,
  Sun,
  SunDim,
  ChevronsUp,
  ChevronsDown,
  ShoppingBag,
  HandPlatter,
  Bike,
  Scale,
  Users,
  Gavel,
  Globe,
  WifiOff,
  Wifi,
  Plus,
  Printer,
  Settings2,
  LayoutGrid,
  MoreHorizontal,
  Maximize2,
  Minimize2,
  Shuffle,
  Pencil,
  X,
} from "lucide-react";
import { ManualOrderDialog } from "@/components/manual-order-dialog";
import { EditOrderDialog } from "@/components/edit-order-dialog";
import { InstallAppButton } from "@/components/install-app-button";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { syncSumupPos } from "@/lib/sumup-pos.functions";
import { orderCode } from "@/lib/order-code";
import { getStaffMenuItems } from "@/lib/menu-operations.functions";
import {
  fuzzyMenuKey,
  guessCategory,
  looksCooked,
  toPrepType,
  PREP_LABEL,
  type PrepType,
  normaliseItemName,
  preferCategory,
  usefulLabel,
} from "@/lib/cooking";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { askConfirm, askPrompt } from "@/lib/confirm";

type Item = {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  name: string;
  qty: number;
  notes: string | null;
  category_label: string | null;
  cook?: boolean;
  /** How the line is made: no prep, cold prep, or hot cook. */
  prep?: PrepType;
  station_code?: string;
  prep_seconds?: number;
  category?: string | null;
};
type Order = {
  id: string;
  order_number: number;
  status: string;
  type: string;
  customer_name: string;
  created_at: string;
  schedule_mode: string | null;
  scheduled_for: string | null;
  table_number: string | null;
  source: string | null;
  payment_method: string | null;
  payment_status: string | null;
  customer_phone: string | null;
  company_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  delivery_notes: string | null;
  pos_terminal: string | null;
  prepared_by: string | null;
  jury_room: string | null;
  court_location: string | null;
};
type Ticket = Order & { items: Item[]; needsCooking: boolean };

const TYPE_LABEL: Record<string, string> = {
  dine_in: "DINE IN",
  collection: "PICKUP",
  delivery: "DELIVERY",
};
/** Fulfilment strip colours — sky blue / lime / grey, all with readable text. */
const TYPE_TONE: Record<string, string> = {
  dine_in: "bg-sky-400 text-slate-900",
  collection: "bg-lime-400 text-slate-900",
  delivery: "bg-slate-500 text-white",
};

/**
 * Where the order came from decides the card outline colour. The blue/yellow
 * banner on top stays reserved for cooked vs not cooked.
 */
type ChannelKey =
  "deliveroo" | "just_eat" | "uber_eats" | "tgtg" | "jury" | "public" | "judge" | "web";
const CHANNEL: Record<ChannelKey, { label: string; border: string; chip: string; ring: string }> = {
  deliveroo: {
    label: "Deliveroo",
    border: "border-green-600",
    chip: "bg-green-600 text-white",
    ring: "ring-green-600/20",
  },
  just_eat: {
    label: "Just Eat",
    border: "border-orange-500",
    chip: "bg-orange-500 text-white",
    ring: "ring-orange-500/20",
  },
  uber_eats: {
    label: "Uber Eats",
    border: "border-emerald-800",
    chip: "bg-emerald-800 text-white",
    ring: "ring-emerald-800/20",
  },
  tgtg: {
    label: "Too Good To Go",
    border: "border-cyan-600",
    chip: "bg-cyan-600 text-white",
    ring: "ring-cyan-600/20",
  },
  jury: {
    label: "Jury side",
    border: "border-red-600",
    chip: "bg-red-600 text-white",
    ring: "ring-red-600/20",
  },
  public: {
    label: "Public side",
    border: "border-pink-500",
    chip: "bg-pink-500 text-white",
    ring: "ring-pink-500/20",
  },
  judge: {
    label: "Judges",
    border: "border-slate-950",
    chip: "bg-slate-950 text-white",
    ring: "ring-slate-950/20",
  },
  web: {
    label: "Website",
    border: "border-[#7f1d1d]",
    chip: "bg-[#7f1d1d] text-white",
    ring: "ring-[#7f1d1d]/20",
  },
};

function channelOf(t: { source: string | null; pos_terminal: string | null }): ChannelKey {
  const src = (t.source ?? "").toLowerCase();
  if (src === "deliveroo") return "deliveroo";
  if (src === "just_eat" || src === "justeat") return "just_eat";
  if (src === "uber_eats" || src === "ubereats" || src === "uber") return "uber_eats";
  if (src === "tgtg" || src === "too_good_to_go") return "tgtg";
  const side = (t.pos_terminal ?? "").toLowerCase();
  if (side === "jury") return "jury";
  if (side === "judge") return "judge";
  if (side === "public") return "public";
  if (src === "sumup_pos" || src === "counter" || src === "till") return "public";
  return "web";
}
const STATIONS = ["ALL", "HOT", "SANDWICH", "DRINKS", "PASS"] as const;

/** Areas a ticket can be moved to by hand from the card. */
const REASSIGN_CHANNELS: ChannelKey[] = [
  "public",
  "jury",
  "judge",
  "web",
  "deliveroo",
  "just_eat",
  "uber_eats",
  "tgtg",
];

/**
 * Local mirror of what cafe1_reassign_order_channel writes, so a moved card
 * recolours immediately instead of waiting for the round trip.
 */
function channelFields(
  next: ChannelKey,
  currentSource: string | null,
): { source: string; pos_terminal: string | null } {
  if (next === "jury" || next === "judge" || next === "public") {
    const src = (currentSource ?? "").toLowerCase();
    const keepTill = src === "sumup_pos" || src === "counter" || src === "till";
    return { source: keepTill ? src : "counter", pos_terminal: next };
  }
  return { source: next, pos_terminal: null };
}

/**
 * Phone/tablet feed filter. "delivery" covers anything going out the door —
 * our own delivery orders plus the delivery-partner channels.
 */
type FeedKey = "all" | "jury" | "judge" | "public" | "delivery" | "web";

/** Shared order-source filters used by the desktop toolbar and mobile nav. */
const FEEDS = [
  { key: "all", label: "Live orders", Icon: LayoutGrid },
  { key: "jury", label: "Jury", Icon: Scale },
  { key: "judge", label: "Judges", Icon: Gavel },
  { key: "public", label: "Public", Icon: Users },
  { key: "delivery", label: "Delivery", Icon: Bike },
  { key: "web", label: "Web", Icon: Globe },
] as const satisfies ReadonlyArray<{ key: FeedKey; label: string; Icon: typeof LayoutGrid }>;
function matchesFeed(
  feed: FeedKey,
  t: { source: string | null; pos_terminal: string | null; type: string },
): boolean {
  if (feed === "all") return true;
  const channel = channelOf(t);
  if (feed === "delivery") {
    return (
      t.type === "delivery" ||
      channel === "deliveroo" ||
      channel === "just_eat" ||
      channel === "uber_eats" ||
      channel === "tgtg"
    );
  }
  if (feed === "jury") return channel === "jury";
  if (feed === "judge") return channel === "judge";
  if (feed === "public") return channel === "public";
  return channel === "web";
}
type Station = (typeof STATIONS)[number];

/**
 * Menu items rarely carry an explicit station code, so work one out from the
 * dish itself. Without this every station filter empties the whole board.
 */
/**
 * The same dish name can sit in several menu categories. When the till gives us
 * no category to disambiguate, pick the one Cafe1 sells it as by default — a
 * bare filling list is a sandwich unless the till says toastie or baguette.
 */
function preferMenuMeta<T extends { category: string | null }>(
  candidates: T[] | undefined,
  name?: string,
): T | undefined {
  if (!candidates?.length) return undefined;
  if (candidates.length === 1) return candidates[0];
  const winner = preferCategory(
    candidates.map((c) => c.category),
    name,
  );
  return candidates.find((c) => c.category === winner) ?? candidates[0];
}

function groupByCategory(items: Item[]): { category: string | null; items: Item[] }[] {
  const groups: { category: string | null; items: Item[] }[] = [];
  const index = new Map<string, number>();
  for (const item of items) {
    const category = item.category?.trim() || null;
    const key = (category ?? "").toLowerCase();
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, groups.length);
      groups.push({ category, items: [item] });
    } else {
      groups[at]!.items.push(item);
    }
  }
  return groups;
}

function inferStation(
  explicit: string | null | undefined,
  name: string,
  category: string | null | undefined,
  cooked: boolean,
): Station {
  const code = (explicit ?? "").trim().toUpperCase();
  if ((STATIONS as readonly string[]).includes(code)) return code as Station;
  const hay = `${category ?? ""} ${name}`.toLowerCase();
  if (
    /(drink|coffee|tea|juice|smoothie|latte|americano|cappuccino|mocha|water|can\b|bottle)/.test(
      hay,
    )
  )
    return "DRINKS";
  if (/(panini|sandwich|baguette|wrap|toastie|bagel|roll|sub)/.test(hay)) return "SANDWICH";
  if (cooked) return "HOT";
  return "PASS";
}

function whenLabel(o: { schedule_mode: string | null; scheduled_for: string | null }) {
  if (o.scheduled_for && o.schedule_mode !== "asap")
    return new Date(o.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return "ASAP";
}

/** Note strip text — later orders lead with the requested time. */
function noteText(o: {
  schedule_mode: string | null;
  scheduled_for: string | null;
  delivery_notes: string | null;
}) {
  const when = whenLabel(o);
  const parts: string[] = [];
  if (when !== "ASAP") parts.push(`ORDER FOR ${when}`);
  if (o.delivery_notes) parts.push(o.delivery_notes);
  return parts.join(" · ");
}

export const Route = createFileRoute("/kds")({
  head: () => ({
    meta: [
      { title: "Kitchen Display — Cafe1" },
      { name: "description", content: "Live kitchen tickets for Cafe1." },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "manifest", href: "/kds.webmanifest" }],
  }),
  component: KdsPage,
});

function KdsPage() {
  return (
    <RequireRole roles={["admin", "staff"]} next="/kds">
      <KDS />
    </RequireRole>
  );
}

function KDS() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  // Ids currently shown on the board — used to announce cancellations/refunds.
  const liveIds = useRef<Set<string>>(new Set());
  // Tickets the operator just cleared. A refetch that was already in flight can
  // come back with the pre-update row and put a completed ticket back on the
  // board, so we hide these ids for a short window until the server agrees.
  const clearedIds = useRef<Map<string, number>>(new Map());
  // Menu + categories change rarely; refetching them on every realtime event
  // was what made "mark ready" feel sluggish. Cache for a few minutes.
  const menuCache = useRef<{ at: number; menu: unknown; cats: unknown } | null>(null);
  const [kdsPaper, setKdsPaper] = useState<58 | 80>(80);
  // "Recall" pulls the last 15 orders of today back onto the board (any
  // status) so a mis-tapped ready/complete can be reversed — and so the
  // colour scheme can be checked against real tickets.
  const [recall, setRecall] = useState(false);
  const update = useServerFn(updateOrderStatus);
  const setFulfil = useServerFn(setOrderFulfilment);
  const setChannel = useServerFn(setOrderChannel);
  const allocate = useServerFn(setOrderPreparedBy);
  const cancelTab = useServerFn(cancelTabOrder);
  const settleTab = useServerFn(settleTabOrder);
  // Which ticket currently has its "move to another area" picker open.
  const [reassignFor, setReassignFor] = useState<string | null>(null);
  /** Per-ticket move state so the card itself shows progress and failures. */
  const [moveState, setMoveState] = useState<Record<string, "saving" | string>>({});
  // Ticket currently being corrected (wrong amount, name, room or items).
  const [editId, setEditId] = useState<string | null>(null);
  // True when the last read of the order feed failed, so the board is showing
  // the previous tickets rather than a real empty kitchen.
  const [feedStale, setFeedStale] = useState(false);
  const sync = useServerFn(syncSumupPos);
  const getMenuItems = useServerFn(getStaffMenuItems);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncOk, setSyncOk] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [station, setStation] = useState<Station>(() => {
    if (typeof window === "undefined") return "ALL";
    const saved = window.localStorage.getItem("cafe1-kds-station") as Station | null;
    return saved && STATIONS.includes(saved) ? saved : "ALL";
  });
  // Bottom-bar sheet on phones and tablets.
  const [sheet, setSheet] = useState<null | "stations" | "more">(null);
  // Phone/tablet feed filter — which side of the business the board shows.
  const [feed, setFeed] = useState<FeedKey>("all");
  const { user } = useSession();
  const { has } = useRoles(user);

  // Live kitchen timer — ticks every second
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("cafe1_kds_paper_mm");
    if (saved === "58") setKdsPaper(58);
  }, []);

  function pickPaper(w: 58 | 80) {
    setKdsPaper(w);
    window.localStorage.setItem("cafe1_kds_paper_mm", String(w));
  }

  useEffect(() => {
    async function load() {
      const COLUMNS =
        "id, order_number, status, type, customer_name, created_at, schedule_mode, scheduled_for, table_number, source, payment_method, payment_status, customer_phone, company_name, address_line1, address_line2, city, postcode, delivery_notes, pos_terminal, prepared_by, jury_room, court_location";
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select(COLUMNS)
        .in("status", ["preparing", "ready"])
        .order("created_at");
      // A dropped connection or a token refresh mid-request returns no rows.
      // Treat that as "we don't know", not "the kitchen is empty" — wiping the
      // board and showing "no active orders" is what forced a manual refresh.
      if (ordersError || !orders) {
        throw new Error(ordersError?.message ?? "Could not reach the order feed");
      }
      let rows = (orders ?? []) as Order[];
      if (recall) {
        // Rolling 24-hour window, not "since midnight": a late shift running
        // past midnight would otherwise recall nothing at all.
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const { data: recent } = await supabase
          .from("orders")
          .select(COLUMNS)
          .gte("created_at", since.toISOString())
          .in("status", [
            "paid",
            "preparing",
            "ready",
            "out_for_delivery",
            "delivered",
            "completed",
          ])
          .order("created_at", { ascending: false })
          .limit(15);
        const seen = new Set(rows.map((o) => o.id));
        rows = rows.concat(((recent ?? []) as Order[]).filter((o) => !seen.has(o.id)));
        if (!recent?.length) {
          toast.info("No orders in the last 24 hours to recall.");
        }
      }
      // Cancelled / refunded orders must never sit on the kitchen display.
      const CLEARED_MS = 90_000;
      for (const [id, at] of clearedIds.current) {
        if (Date.now() - at > CLEARED_MS) clearedIds.current.delete(id);
      }
      const live = rows.filter(
        (o) =>
          o.payment_status !== "refunded" &&
          o.payment_status !== "failed" &&
          o.status !== "cancelled" &&
          o.status !== "refunded" &&
          // Just cleared on this device — keep it off the board unless the
          // operator is deliberately recalling finished orders.
          (recall || !clearedIds.current.has(o.id)),
      );
      const ids = live.map((o) => o.id);
      const itemsRes = ids.length
        ? await supabase
            .from("order_items")
            .select("id, order_id, menu_item_id, name, qty, notes, category_label")
            .in("order_id", ids)
        : { data: [] as Item[], error: null };
      if (itemsRes.error) throw new Error(itemsRes.error.message);
      const items = itemsRes.data;
      const fresh =
        menuCache.current && Date.now() - menuCache.current.at < 300_000 ? menuCache.current : null;
      let menu: unknown;
      let cats: unknown;
      if (fresh) {
        menu = fresh.menu;
        cats = fresh.cats;
      } else {
        const [m, c] = await Promise.all([
          getMenuItems(),
          supabase.from("menu_categories").select("id, name"),
        ]);
        menu = m;
        cats = (c as { data: unknown }).data;
        menuCache.current = { at: Date.now(), menu, cats };
      }
      const catName = new Map<string, string>(
        ((cats ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
      );
      type MenuMeta = {
        needs_cooking: boolean;
        prep: PrepType;
        station_code: string;
        prep_seconds: number;
        category: string | null;
        /** True when the line was matched to a real menu item. */
        matched?: boolean;
      };
      const byId = new Map<string, MenuMeta>();
      // Several categories reuse the same item name ("Chicken, Mayo, Sweetcorn"
      // is a sandwich, a toastie and a baguette), and the till types punctuation
      // its own way, so match on the normalised name and keep every candidate.
      const byName = new Map<string, MenuMeta[]>();
      const byCatName = new Map<string, MenuMeta>();
      for (const m of (menu ?? []) as Array<{
        id: string;
        name: string;
        needs_cooking: boolean;
        prep_type?: string | null;
        station_code: string;
        prep_seconds: number;
        category_id: string | null;
      }>) {
        const prep = toPrepType(m.prep_type, m.needs_cooking);
        const meta: MenuMeta = {
          needs_cooking: prep === "hot",
          prep,
          station_code: m.station_code || "PASS",
          prep_seconds: Math.max(0, m.prep_seconds || 0),
          category: m.category_id ? (catName.get(m.category_id) ?? null) : null,
          matched: true,
        };
        byId.set(m.id, meta);
        const key = normaliseItemName(m.name);
        byName.set(key, [...(byName.get(key) ?? []), meta]);
        if (meta.category) byCatName.set(`${normaliseItemName(meta.category)}|${key}`, meta);
      }
      const nameKeys = Array.from(byName.keys());
      const metadata = (item: Item): MenuMeta => {
        const key = normaliseItemName(item.name);
        const label = usefulLabel(item.category_label);
        const withCategory = label
          ? byCatName.get(`${normaliseItemName(label)}|${key}`)
          : undefined;
        const byIdMeta = item.menu_item_id ? byId.get(item.menu_item_id) : undefined;
        const candidates = byName.get(key) ?? byName.get(fuzzyMenuKey(item.name, nameKeys) ?? "");
        const direct = byIdMeta ?? withCategory ?? preferMenuMeta(candidates, item.name);
        if (direct) return direct;
        // Nothing on the menu looks like it — fall back to keyword rules.
        const cooked = looksCooked(item.name);
        return {
          needs_cooking: cooked,
          prep: cooked ? ("hot" as PrepType) : ("none" as PrepType),
          station_code: cooked ? "HOT" : "PASS",
          prep_seconds: 0,
          category: null,
        };
      };
      const grouped: Ticket[] = live.map((o) => {
        const its = ((items ?? []) as Item[])
          .filter((i) => i.order_id === o.id)
          .map((item) => {
            const meta = metadata(item);
            // The menu's own category is the truth when we matched the line to a
            // real menu item; POS labels are often vague ("Hot Food", "Misc") or
            // just wrong, so they only fill the gaps.
            const posLabel = usefulLabel(item.category_label);
            const category =
              (meta.matched ? meta.category : null) ||
              posLabel ||
              meta.category ||
              guessCategory(item.name) ||
              (item.category_label ?? "").trim() ||
              "Other items";
            return {
              ...item,
              cook: meta.needs_cooking,
              prep: meta.prep,
              station_code: inferStation(
                meta.station_code === "PASS" ? null : meta.station_code,
                item.name,
                category,
                meta.needs_cooking,
              ),
              prep_seconds: meta.prep_seconds,
              // SumUp POS baskets bring their own category; ours is the fallback.
              category,
            };
          });
        return { ...o, items: its, needsCooking: its.some((i) => i.cook) };
      });
      liveIds.current = new Set(grouped.map((g) => g.id));
      setTickets(grouped);
    }
    // Realtime can fire several events per order change; coalesce them so the
    // board does at most one refetch per burst instead of one per row.
    let inFlight = false;
    let queued = false;
    let timer: number | undefined;
    let retry: number | undefined;
    let cancelled = false;
    async function run() {
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      try {
        await load();
        if (!cancelled) setFeedStale(false);
      } catch {
        // Keep whatever is already on screen and try again shortly. Blanking
        // the board on a wifi blip is what made orders "disappear".
        if (!cancelled) {
          setFeedStale(true);
          if (retry) window.clearTimeout(retry);
          retry = window.setTimeout(() => void run(), 3000);
        }
      } finally {
        inFlight = false;
        if (queued) {
          queued = false;
          void run();
        }
      }
    }
    function scheduleLoad() {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), 250);
    }
    void run();
    const ch = supabase
      .channel("kds")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        const o = (payload.new ?? null) as Partial<Order> | null;
        const removedRow = (payload.old ?? null) as Partial<Order> | null;
        const voided =
          !!o &&
          (o.status === "cancelled" ||
            o.status === "refunded" ||
            o.payment_status === "refunded" ||
            o.payment_status === "failed");
        const goneId =
          payload.eventType === "DELETE" ? (removedRow?.id as string | undefined) : undefined;
        const dropId = voided ? (o?.id as string) : goneId;
        if (dropId && liveIds.current.has(dropId)) {
          liveIds.current.delete(dropId);
          // Pull it off the screen immediately — don't wait for the refetch.
          setTickets((prev) => prev.filter((t) => t.id !== dropId));
          if (voided) {
            toast.error(
              `Order #${o?.order_number ?? ""} ${o?.status === "refunded" || o?.payment_status === "refunded" ? "refunded" : "cancelled"} — removed from the kitchen display`,
              { duration: 10000 },
            );
            playChime();
          }
        }
        // Status changes and chef allocation from another terminal apply straight
        // away so every connected screen shows the same board within a second.
        if (!dropId && o?.id && liveIds.current.has(o.id) && (o.status || "prepared_by" in o)) {
          const next = o.status ? (o.status as Order["status"]) : undefined;
          const prep = "prepared_by" in o ? ((o as Order).prepared_by ?? null) : undefined;
          const stillLive = next
            ? next === "preparing" || next === "ready" || next === "paid"
            : true;
          if (next && !stillLive && !recall) {
            liveIds.current.delete(o.id);
            clearedIds.current.set(o.id, Date.now());
            setTickets((prev) => prev.filter((t) => t.id !== o.id));
            return;
          }
          clearedIds.current.delete(o.id);
          setTickets((prev) =>
            prev.map((t) => {
              if (t.id !== o.id) return t;
              const patch: Partial<Ticket> = {};
              if (next) patch.status = next;
              if (prep !== undefined) patch.prepared_by = prep;
              return { ...t, ...patch };
            }),
          );
          if (next) return;
        }
        scheduleLoad();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () =>
        scheduleLoad(),
      )
      .subscribe();
    // Safety net: if the realtime socket drops (phone sleeps, wifi blips) the
    // board would silently freeze, so re-read it every 15s regardless.
    const poll = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      scheduleLoad();
    }, 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleLoad();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      if (retry) window.clearTimeout(retry);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(ch);
    };
  }, [getMenuItems, recall]);

  // Auto-poll SumUp POS every 30s while KDS is open (staff/admin only)
  useEffect(() => {
    if (!user || (!has("admin") && !has("staff"))) return;
    let cancelled = false;
    async function tick() {
      // Don't hammer SumUp while the screen is in the background.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const r = await sync({ data: undefined as never });
        if (!cancelled) {
          setLastSync(Date.now());
          setSyncOk(!r?.error);
        }
        if (!cancelled && r?.imported && r.imported > 0) {
          toast.success(
            `${r.imported} SumUp POS ${r.imported === 1 ? "order" : "orders"} imported`,
          );
        }
        if (!cancelled && r?.voided && r.voided > 0) {
          toast.warning(
            `${r.voided} SumUp ${r.voided === 1 ? "order" : "orders"} refunded/cancelled — removed`,
          );
        }
      } catch {
        if (!cancelled) setSyncOk(false);
      }
    }
    tick();
    const iv = window.setInterval(tick, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [user, has, sync]);

  async function manualSync() {
    setSyncing(true);
    try {
      const r = await sync({ data: undefined as never });
      setLastSync(Date.now());
      setSyncOk(!r?.error);
      if (r?.error) toast.error(`SumUp: ${r.error}`);
      else toast.success(`SumUp sync: ${r?.imported ?? 0} imported, ${r?.skipped ?? 0} skipped`);
    } catch (e) {
      setSyncOk(false);
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  type KdsStatus = "paid" | "preparing" | "ready" | "completed";

  async function set(id: string, status: KdsStatus, opts?: { undoTo?: KdsStatus }) {
    // Paint the change straight away; the realtime refetch reconciles after.
    const previous = tickets;
    setTickets((prev) =>
      status === "completed" && !recall
        ? prev.filter((t) => t.id !== id)
        : prev.map((t) => (t.id === id ? { ...t, status } : t)),
    );
    if (status === "completed" && !recall) clearedIds.current.set(id, Date.now());
    else clearedIds.current.delete(id);
    try {
      await update({ data: { order_id: id, status } });
      if (opts?.undoTo) {
        const back = opts.undoTo;
        const ticket = previous.find((t) => t.id === id);
        toast.success(`#${ticket?.order_number ?? ""} marked ${status.replace("_", " ")}`, {
          duration: 12000,
          action: {
            label: "Undo",
            onClick: () => void set(id, back),
          },
        });
      }
    } catch (e) {
      setTickets(previous);
      clearedIds.current.delete(id);
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function assignPrep(id: string, initials: string) {
    const previous = tickets;
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, prepared_by: initials || null } : t)),
    );
    try {
      await allocate({ data: { order_id: id, initials: initials || null } });
    } catch (e) {
      setTickets(previous);
      toast.error(e instanceof Error ? e.message : "Could not claim ticket");
    }
  }

  /** Cancel an unpaid house-tab ticket and take the charge off the tab. */
  async function cancelTabTicket(t: Ticket) {
    const reason = await askPrompt({
      title: `Cancel tab order #${t.order_number}?`,
      description: "The charge comes off the house tab and the ticket leaves the board.",
      label: "Reason",
      placeholder: "e.g. ordered by mistake",
      confirmLabel: "Cancel order",
    });
    if (!reason || reason.trim().length < 3) return;
    const previous = tickets;
    setTickets((prev) => prev.filter((x) => x.id !== t.id));
    try {
      await cancelTab({ data: { order_id: t.id, reason: reason.trim() } });
      clearedIds.current.set(t.id, Date.now());
      toast.success(`#${t.order_number} cancelled — removed from the tab`);
    } catch (e) {
      setTickets(previous);
      toast.error(e instanceof Error ? e.message : "Could not cancel that order");
    }
  }

  const [bulking, setBulking] = useState(false);
  /** Mark an unpaid house-tab ticket as paid instead of cancelling it. */
  async function settleTabTicket(t: Ticket, method: "cash" | "card") {
    const previous = tickets;
    setTickets((prev) =>
      prev.map((x) =>
        x.id === t.id ? { ...x, payment_status: "paid", payment_method: method } : x,
      ),
    );
    try {
      await settleTab({ data: { order_id: t.id, method } });
      toast.success(`#${t.order_number} marked paid by ${method}`);
    } catch (e) {
      setTickets(previous);
      toast.error(e instanceof Error ? e.message : "Could not mark that order paid");
    }
  }

  const [chromeHidden, setChromeHidden] = useState(false);
  // 10" Android tablet in landscape (e.g. 1280x800). Width alone can't tell it
  // apart from a laptop, so we look at a short landscape viewport plus touch
  // input — and the kitchen can force it from Tools if detection is wrong.
  const [tabletPref, setTabletPref] = useState<"auto" | "on" | "off">("auto");
  const [tabletAuto, setTabletAuto] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("layout");
    const stored =
      param === "tablet" ? "on" : param === "desktop" ? "off" : localStorage.getItem("kds-layout");
    if (stored === "on" || stored === "off") setTabletPref(stored);
    const detect = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const touch =
        (navigator.maxTouchPoints ?? 0) > 0 ||
        (window.matchMedia ? window.matchMedia("(pointer: coarse)").matches : false) ||
        "ontouchstart" in window;
      setTabletAuto(touch && w > h && w >= 760 && w <= 1500 && h <= 900);
    };
    detect();
    window.addEventListener("resize", detect);
    window.addEventListener("orientationchange", detect);
    return () => {
      window.removeEventListener("resize", detect);
      window.removeEventListener("orientationchange", detect);
    };
  }, []);
  const tabletKds = tabletPref === "on" || (tabletPref === "auto" && tabletAuto);
  const toggleTabletLayout = () => {
    const next = tabletKds ? "off" : "on";
    setTabletPref(next);
    try {
      localStorage.setItem("kds-layout", next);
    } catch {
      /* private mode */
    }
  };
  const [manualOpen, setManualOpen] = useState(false);
  // Prefer the official Orders API heartbeat; keep the Hub watcher as fallback.
  const [deliverooLive, setDeliverooLive] = useState<boolean | null>(null);
  const [deliverooSeenAt, setDeliverooSeenAt] = useState<number | null>(null);
  const [deliverooConnection, setDeliverooConnection] = useState<"orders_api" | "hub" | null>(null);
  // Just Eat has no official push for this site, so only the shop watcher can
  // prove tickets are still arriving.
  const [justEatLive, setJustEatLive] = useState<boolean | null>(null);
  const [justEatSeenAt, setJustEatSeenAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const { data } = await supabase
        .from("integration_status")
        .select("key, last_seen_at, healthy")
        .in("key", ["deliveroo_orders_api", "deliveroo_hub", "just_eat_hub", "just_eat_orders"])
        .order("last_seen_at", { ascending: false });
      if (cancelled) return;
      const api = data?.find((row) => row.key === "deliveroo_orders_api");
      const hub = data?.find((row) => row.key === "deliveroo_hub");
      const justEat =
        data?.find((row) => row.key === "just_eat_hub") ??
        data?.find((row) => row.key === "just_eat_orders") ??
        null;
      const justEatSeen = justEat?.last_seen_at ? new Date(justEat.last_seen_at).getTime() : 0;
      setJustEatSeenAt(justEatSeen || null);
      setJustEatLive(
        justEat ? Boolean(justEat.healthy) && justEatSeen > Date.now() - 180_000 : false,
      );
      const selected = api ?? hub ?? null;
      const seen = selected?.last_seen_at ? new Date(selected.last_seen_at).getTime() : 0;
      setDeliverooSeenAt(seen || null);
      setDeliverooConnection(api ? "orders_api" : hub ? "hub" : null);
      // Push webhooks are quiet between orders; watcher heartbeats arrive each minute.
      setDeliverooLive(
        api ? api.healthy : hub ? hub.healthy && seen > Date.now() - 180_000 : false,
      );
    }
    void check();
    const id = window.setInterval(() => void check(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setChromeHidden(window.localStorage.getItem("kds_chrome_hidden") === "1");
  }, []);

  function toggleChrome() {
    setChromeHidden((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("kds_chrome_hidden", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }
  async function setAll(from: string, status: "ready" | "completed") {
    // Only sweep what the operator can actually see, and never a ticket that
    // landed in the last minute — that is what made fresh orders vanish
    // moments after arriving on a busy board.
    const FRESH_MS = 60_000;
    const candidates = tickets.filter(
      (t) =>
        t.status === from &&
        (station === "ALL" ||
          station === "PASS" ||
          t.items.some((i) => i.station_code === station)),
    );
    const ids = candidates
      .filter((t) => Date.now() - new Date(t.created_at).getTime() >= FRESH_MS)
      .map((t) => t.id);
    const skipped = candidates.length - ids.length;
    if (!ids.length) {
      if (skipped) toast.info("Only just-arrived tickets are left — clear those individually.");
      return;
    }
    if (
      !(await askConfirm({
        title: `Mark ${ids.length} ticket${ids.length === 1 ? "" : "s"} as ${status}?`,
        description: skipped
          ? `${skipped} just arrived and will be left on the board.`
          : "Only the tickets currently visible in this station will be changed.",
        confirmLabel: status === "completed" ? "Complete tickets" : "Mark ready",
        destructive: false,
      }))
    )
      return;
    setBulking(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => update({ data: { order_id: id, status } })),
      );
      const succeeded = ids.filter((_, index) => results[index]?.status === "fulfilled");
      const failed = ids.filter((_, index) => results[index]?.status === "rejected");
      if (succeeded.length) {
        const changed = new Set(succeeded);
        setTickets((prev) =>
          status === "completed"
            ? prev.filter((ticket) => !changed.has(ticket.id))
            : prev.map((ticket) => (changed.has(ticket.id) ? { ...ticket, status } : ticket)),
        );
        if (status === "completed") {
          for (const id of succeeded) clearedIds.current.set(id, Date.now());
        }
      }
      if (failed.length) {
        toast.error(
          `${succeeded.length} updated; ${failed.length} could not be changed and remain on the board.`,
        );
      } else {
        toast.success(`${succeeded.length} marked ${status}`);
      }
    } finally {
      setBulking(false);
    }
  }

  /**
   * Move a ticket to another area when it came in on the wrong side — e.g. a
   * jury order rung up on the public till. Applied optimistically so the card
   * recolours instantly, then confirmed by the server.
   */
  async function reassignChannel(t: Ticket, next: ChannelKey) {
    const previous = tickets;
    setReassignFor(null);
    setMoveState((s) => ({ ...s, [t.id]: "saving" }));
    setTickets((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, ...channelFields(next, x.source) } : x)),
    );
    try {
      await setChannel({ data: { order_id: t.id, channel: next } });
      setMoveState((s) => {
        const { [t.id]: _drop, ...rest } = s;
        return rest;
      });
      toast.success(`#${t.order_number} moved to ${CHANNEL[next].label}`);
    } catch (e) {
      setTickets(previous);
      const message = e instanceof Error ? e.message : "Could not move this ticket";
      console.error("[kds] move area failed", e);
      setMoveState((s) => ({ ...s, [t.id]: message }));
      toast.error(`Move failed: ${message}`);
    }
  }

  async function markDineIn(id: string, current: string) {
    try {
      if (current === "dine_in") {
        await setFulfil({ data: { order_id: id, type: "collection", table_number: null } });
        toast.success("Marked as pickup");
      } else {
        const table =
          (await askPrompt({
            title: "Mark order as dine in",
            description: "Add the table number so the pass knows where to send it.",
            label: "Table number (optional)",
            placeholder: "e.g. 12",
            inputMode: "text",
            confirmLabel: "Mark dine in",
          })) ?? "";
        await setFulfil({
          data: { order_id: id, type: "dine_in", table_number: table.trim() || null },
        });
        toast.success("Marked as dine in");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const preparingCount = tickets.filter((t) => t.status === "preparing").length;
  useAlertOnIncrease(
    preparingCount,
    "New ticket · Kitchen",
    "A new order was accepted — start preparing.",
  );

  const visibleTickets = tickets
    .filter((ticket) => matchesFeed(feed, ticket))
    .map((ticket) => ({
      ...ticket,
      items:
        station === "ALL" || station === "PASS"
          ? ticket.items
          : ticket.items.filter((item) => item.station_code === station),
    }))
    .filter((ticket) => ticket.items.length > 0);
  const canCompleteOrders = station === "ALL" || station === "PASS";
  const conn = useConnectionStatus();
  const linkDown = conn.offline || conn.backendDown;

  // If the internet or backend drops out and comes back, reload the whole
  // screen once so a browser that woke from sleep never sits on a dead page.
  const downSince = useRef<number | null>(null);
  useEffect(() => {
    if (linkDown) {
      if (downSince.current === null) downSince.current = Date.now();
      return;
    }
    const since = downSince.current;
    downSince.current = null;
    if (since !== null && Date.now() - since > 20_000) window.location.reload();
  }, [linkDown]);

  if (user && !has("admin") && !has("staff"))
    return <div className="p-10 text-center text-muted-foreground">Not authorised.</div>;

  return (
    <div className={`kds-phone-feed min-h-screen bg-secondary${tabletKds ? " kds-tablet" : ""}`}>
      {!chromeHidden && (
        <div className="kds-adminnav min-[860px]:max-lg:hidden">
          <AdminNav />
        </div>
      )}
      {/* 10" tablet landscape: the tab bar is pinned to the top, so reserve its height */}
      <div aria-hidden="true" className="kds-tabbar-spacer hidden h-14 min-[860px]:max-lg:block" />
      {linkDown && (
        <div
          role="alert"
          className="sticky top-0 z-40 flex items-center justify-center gap-3 bg-red-600 px-4 py-2 text-center text-sm font-bold text-white"
        >
          <WifiOff className="h-5 w-5 shrink-0 animate-pulse" />
          <span>
            {conn.offline
              ? "No internet on this display — new orders are NOT coming through."
              : "Cannot reach the Cafe1 system — new orders are NOT coming through."}{" "}
            {conn.lastOkAt
              ? `Last connected ${Math.max(0, Math.round((now - conn.lastOkAt) / 60000))} min ago.`
              : ""}{" "}
            Check the internet, then this bar disappears on its own.
          </span>
        </div>
      )}
      <ManualOrderDialog open={manualOpen} onClose={() => setManualOpen(false)} />
      <EditOrderDialog
        order={(() => {
          const t = tickets.find((x) => x.id === editId);
          return t
            ? {
                id: t.id,
                order_number: t.order_number,
                customer_name: t.customer_name,
                customer_phone: t.customer_phone,
                table_number: t.table_number,
                jury_room: t.jury_room,
                company_name: t.company_name,
                address_line1: t.address_line1,
                address_line2: t.address_line2,
                postcode: t.postcode,
                delivery_notes: t.delivery_notes,
                payment_method: t.payment_method,
                payment_status: t.payment_status,
                items: t.items.map((i) => ({ name: i.name, qty: i.qty, notes: i.notes })),
              }
            : null;
        })()}
        onClose={() => setEditId(null)}
        onSaved={(patch) =>
          setTickets((prev) =>
            prev.map((t) =>
              t.id === patch.id
                ? {
                    ...t,
                    ...patch,
                    items: patch.items.map((line, index) => ({
                      ...(t.items[index] ?? t.items[0]),
                      id: `${t.id}-edit-${index}`,
                      name: line.name,
                      qty: line.qty,
                      notes: line.notes,
                    })),
                  }
                : t,
            ),
          )
        }
      />
      {chromeHidden ? (
        <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border bg-primary px-3 py-1.5 text-primary-foreground">
          <span className="text-xs font-bold uppercase tracking-wide opacity-90">
            {visibleTickets.length} active · {station}
          </span>
          <SyncPill lastSync={lastSync} ok={syncOk} now={now} compact />
          {linkDown && (
            <span className="flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-black text-white">
              <WifiOff className="h-3.5 w-3.5" /> Offline
            </span>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setManualOpen(true)}
              disabled={!canCompleteOrders}
              className="flex items-center gap-1 rounded-full bg-[#00CCBC] px-2.5 py-1 text-[11px] font-bold text-black disabled:opacity-40"
              title="Key in an order by hand"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
            <button
              onClick={() => setAll("preparing", "ready")}
              disabled={
                bulking || !canCompleteOrders || !tickets.some((t) => t.status === "preparing")
              }
              className="rounded-full bg-primary-foreground px-2.5 py-1 text-[11px] font-bold text-primary disabled:opacity-40"
            >
              All ready
            </button>
            <button
              onClick={() => setAll("ready", "completed")}
              disabled={bulking || !canCompleteOrders || !tickets.some((t) => t.status === "ready")}
              className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-40"
            >
              All complete
            </button>
            <button
              onClick={toggleChrome}
              className="flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[11px] font-semibold hover:bg-primary-foreground/25"
              title="Show toolbar"
              aria-label="Show toolbar"
            >
              <ChevronsDown className="h-3.5 w-3.5" /> Show bar
            </button>
          </div>
        </div>
      ) : (
        <header className="kds-header sticky top-0 z-30 border-b border-border bg-primary text-primary-foreground min-[860px]:max-lg:static lg:static">
          <div className="mx-auto grid max-w-[110rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4 lg:py-3">
            <h1 className="min-w-0 truncate font-display text-base font-bold sm:text-lg lg:text-2xl">
              <span className="kds-title-mobile lg:hidden">
                KDS · {visibleTickets.length} active
                <span className="ml-1 text-xs font-semibold opacity-70">{station}</span>
              </span>
              <span className="kds-title-desktop hidden lg:inline">Kitchen Display · Cafe1</span>
            </h1>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              <span className="hidden text-sm font-semibold opacity-80 sm:inline">
                {visibleTickets.length} active
              </span>
              <span
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  linkDown ? "bg-red-600 text-white" : "bg-emerald-500 text-black"
                }`}
                title={
                  linkDown
                    ? "This display has lost its connection — orders are not updating."
                    : "This display is connected and receiving orders."
                }
              >
                {linkDown ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
                {linkDown ? "Offline" : "Online"}
              </span>
              <div className="kds-desktop-controls hidden flex-wrap items-center justify-end gap-2 lg:flex">
                <span
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    deliverooLive
                      ? "bg-[#00CCBC] text-black"
                      : "bg-primary-foreground/15 text-primary-foreground"
                  }`}
                  title={
                    deliverooLive
                      ? deliverooConnection === "orders_api"
                        ? "Official Deliveroo Orders API is sending accepted orders directly to this KDS"
                        : "Deliveroo orders are arriving through the shop Hub watcher"
                      : deliverooSeenAt
                        ? `The Deliveroo link last checked in ${Math.round((Date.now() - deliverooSeenAt) / 60000)} min ago. Key tickets in manually until it is restored.`
                        : "No Deliveroo connection has completed a verified check-in yet."
                  }
                >
                  <Bike className="h-3.5 w-3.5" />
                  {deliverooLive === null
                    ? "Deliveroo…"
                    : deliverooLive
                      ? deliverooConnection === "orders_api"
                        ? "Deliveroo API"
                        : "Deliveroo auto"
                      : "Deliveroo offline"}
                </span>
                <span
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    justEatLive
                      ? "bg-[#FF8000] text-black"
                      : "bg-primary-foreground/15 text-primary-foreground"
                  }`}
                  title={
                    justEatLive
                      ? "Just Eat orders are arriving through the shop Partner Centre watcher"
                      : justEatSeenAt
                        ? `The Just Eat watcher last checked in ${Math.round((Date.now() - justEatSeenAt) / 60000)} min ago. Key tickets in manually until it is restored.`
                        : "No verified Just Eat check-in — key those tickets in by hand"
                  }
                >
                  <Bike className="h-3.5 w-3.5" />
                  {justEatLive === null
                    ? "Just Eat…"
                    : justEatLive
                      ? "Just Eat auto"
                      : "Just Eat offline"}
                </span>
                <SyncPill lastSync={lastSync} ok={syncOk} now={now} />
                <AlertsToggle />
                <WakeToggle />
                <button
                  onClick={() => setManualOpen(true)}
                  disabled={!canCompleteOrders}
                  className="flex items-center gap-1 rounded-full bg-[#00CCBC] px-3 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
                  title="Key in any order by hand — Deliveroo, Just Eat, Uber Eats, TGTG, jury, judge, counter or phone"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add order</span>
                  <span className="sm:hidden">Add</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="flex items-center gap-1 rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs font-semibold hover:bg-primary-foreground/20"
                  title="Reload the kitchen display — use this if the internet dropped or the screen looks stuck"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
                <details className="relative">
                  <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs font-semibold hover:bg-primary-foreground/20 [&::-webkit-details-marker]:hidden">
                    <Settings2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Tools</span>
                  </summary>
                  <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-border bg-card p-2 text-card-foreground shadow-xl">
                    <button
                      onClick={manualSync}
                      disabled={syncing}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-muted disabled:opacity-50"
                      title="Pull latest transactions from your SumUp terminal"
                    >
                      <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                      {syncing ? "Syncing…" : "Sync SumUp POS"}
                    </button>
                    <a
                      href={`/print/test?paper=${kdsPaper}&preview=1`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-muted"
                      title="Print a sample ticket on this device — no order is created"
                    >
                      <Printer className="h-4 w-4" /> Test print
                    </a>
                    <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
                      <span>Paper width</span>
                      <span className="flex items-center gap-1 rounded-full bg-muted p-1">
                        {([58, 80] as const).map((w) => (
                          <button
                            key={w}
                            onClick={() => pickPaper(w)}
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${kdsPaper === w ? "bg-primary text-primary-foreground" : "opacity-70"}`}
                            title="Kitchen printer paper width"
                          >
                            {w}mm
                          </button>
                        ))}
                      </span>
                    </div>
                    <div className="px-1 py-1">
                      <InstallAppButton
                        manifest="/kds.webmanifest"
                        label="Install KDS app"
                        className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold hover:bg-muted"
                      />
                    </div>
                    <button
                      onClick={() => setManualOpen(true)}
                      disabled={!canCompleteOrders}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-muted disabled:opacity-40"
                      title="Add a manual order"
                    >
                      <Plus className="h-4 w-4" /> Add order
                    </button>
                    <button
                      onClick={toggleChrome}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-muted"
                      title="Hide toolbar for more screen space"
                    >
                      <ChevronsUp className="h-4 w-4" /> Hide toolbar
                    </button>
                    <button
                      onClick={toggleTabletLayout}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-muted"
                      title="Force the 10-inch tablet layout: no top menu, tabs on top, 4 cards across"
                    >
                      <Maximize2 className="h-4 w-4" />
                      {tabletKds ? "Use desktop layout" : "Use tablet layout"}
                    </button>
                    <button
                      onClick={() => void signOutAndRedirect()}
                      className="mt-1 flex w-full items-center gap-2 rounded-xl bg-primary px-3 py-2 text-left text-sm font-bold text-primary-foreground hover:opacity-90"
                      title="Sign out of this device"
                    >
                      Sign out
                    </button>
                  </div>
                </details>
              </div>
            </div>
            {/* Phone / tablet: compact pill row — Deliveroo health + key in an order */}
            <div className="kds-pillrow col-span-2 -mx-0.5 flex items-center gap-2 overflow-x-auto pb-0.5 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                disabled={!canCompleteOrders}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary-foreground px-3 py-2 text-xs font-bold text-primary shadow-sm active:scale-[0.97] disabled:opacity-40"
                aria-label="Add a manual order"
              >
                <Plus className="h-4 w-4" /> Add order
              </button>
              <FullscreenToggle />
              <button
                type="button"
                onClick={toggleTabletLayout}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-2 text-xs font-bold text-primary-foreground active:scale-[0.97]"
                title="Switch between the tablet layout and the full desktop layout"
              >
                {tabletKds ? "Desktop layout" : "Tablet layout"}
              </button>
              <span
                role="status"
                aria-live="polite"
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold ${
                  deliverooLive === null
                    ? "bg-primary-foreground/15 text-primary-foreground"
                    : deliverooLive
                      ? "bg-[#00CCBC] text-black"
                      : "bg-red-600 text-white"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    deliverooLive === null
                      ? "bg-primary-foreground/60"
                      : deliverooLive
                        ? "animate-pulse bg-black/70"
                        : "bg-white"
                  }`}
                />
                <Bike className="h-4 w-4" />
                {deliverooLive === null
                  ? "Deliveroo…"
                  : deliverooLive
                    ? deliverooConnection === "orders_api"
                      ? "Deliveroo API"
                      : "Deliveroo online"
                    : "Deliveroo offline"}
              </span>
              {deliverooLive === false ? (
                <span className="shrink-0 rounded-full bg-primary-foreground/15 px-3 py-2 text-[11px] font-semibold text-primary-foreground">
                  {deliverooSeenAt
                    ? `Last seen ${Math.max(1, Math.round((now - deliverooSeenAt) / 60000))} min ago — key tickets in by hand`
                    : "No verified Deliveroo check-in — key tickets in by hand"}
                </span>
              ) : null}
              <span
                role="status"
                aria-live="polite"
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold ${
                  justEatLive === null
                    ? "bg-primary-foreground/15 text-primary-foreground"
                    : justEatLive
                      ? "bg-[#FF8000] text-black"
                      : "bg-red-600 text-white"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    justEatLive === null
                      ? "bg-primary-foreground/60"
                      : justEatLive
                        ? "animate-pulse bg-black/70"
                        : "bg-white"
                  }`}
                />
                <Bike className="h-4 w-4" />
                {justEatLive === null
                  ? "Just Eat…"
                  : justEatLive
                    ? "Just Eat online"
                    : "Just Eat offline"}
              </span>
              {justEatLive === false ? (
                <span className="shrink-0 rounded-full bg-primary-foreground/15 px-3 py-2 text-[11px] font-semibold text-primary-foreground">
                  {justEatSeenAt
                    ? `Just Eat last seen ${Math.max(1, Math.round((now - justEatSeenAt) / 60000))} min ago — key tickets in by hand`
                    : "No verified Just Eat check-in — key tickets in by hand"}
                </span>
              ) : null}
            </div>
          </div>
          <div className="mx-auto hidden max-w-[110rem] flex-wrap items-center gap-2 px-3 pb-3 text-xs font-semibold sm:gap-3 sm:px-4 lg:flex">
            <button
              onClick={() => setAll("preparing", "ready")}
              disabled={
                bulking || !canCompleteOrders || !tickets.some((t) => t.status === "preparing")
              }
              className="rounded-full bg-primary-foreground px-3 py-1.5 text-xs font-bold text-primary hover:opacity-90 disabled:opacity-40"
              title="Mark every preparing ticket as ready"
            >
              <span className="sm:hidden">All ready</span>
              <span className="hidden sm:inline">Mark all ready</span>
            </button>
            <button
              onClick={() => setAll("ready", "completed")}
              disabled={bulking || !canCompleteOrders || !tickets.some((t) => t.status === "ready")}
              className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
              title="Mark every ready ticket as complete"
            >
              <span className="sm:hidden">All complete</span>
              <span className="hidden sm:inline">Mark all complete</span>
            </button>
            <button
              onClick={() => setRecall(true)}
              disabled={recall}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                recall
                  ? "bg-primary-foreground text-primary opacity-70"
                  : "bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25"
              }`}
              title="Pull the last 15 orders of today back onto the board so you can reopen a mistake"
            >
              <span className="sm:hidden">Recall 15</span>
              <span className="hidden sm:inline">Recall last 15</span>
            </button>
            {recall && (
              <button
                onClick={() => setRecall(false)}
                className="rounded-full bg-primary-foreground/15 px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary-foreground/25"
                title="Clear the recalled orders and show only live tickets"
              >
                <span className="sm:hidden">Unrecall</span>
                <span className="hidden sm:inline">Unrecall last 15</span>
              </button>
            )}
            <span className="mx-1 hidden h-4 w-px bg-primary-foreground/30 sm:block" />
            <div
              className="hidden flex-wrap items-center gap-1 lg:flex"
              aria-label="Order source filter"
            >
              {FEEDS.map(({ key, label, Icon }) => {
                const count = tickets.filter((t) => matchesFeed(key, t)).length;
                const on = feed === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFeed(key)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide ${
                      on ? "bg-primary-foreground text-primary" : "bg-primary-foreground/10"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    <span
                      className={`rounded-full px-1 text-[9px] leading-4 ${
                        on ? "bg-primary text-primary-foreground" : "bg-primary-foreground/20"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="mx-1 hidden h-4 w-px bg-primary-foreground/30 lg:block" />
            <div className="flex flex-wrap items-center gap-1" aria-label="Kitchen station filter">
              {STATIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setStation(value);
                    window.localStorage.setItem("cafe1-kds-station", value);
                  }}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide ${
                    station === value
                      ? "bg-primary-foreground text-primary"
                      : "bg-primary-foreground/10"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            <span className="mx-1 hidden h-4 w-px bg-primary-foreground/30 xl:block" />
            <span className="hidden items-center gap-1.5 xl:inline-flex">
              <span className="h-3 w-3 rounded-full bg-blue-600 ring-2 ring-white/60" /> Cooked /
              hot food
            </span>
            <span className="hidden items-center gap-1.5 xl:inline-flex">
              <span className="h-3 w-3 rounded-full bg-amber-400 ring-2 ring-white/60" /> No cooking
              (drinks &amp; cold)
            </span>
            <span className="hidden items-center gap-1.5 xl:inline-flex">
              <span className="h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white/60" /> Ready →
              complete
            </span>
          </div>
        </header>
      )}
      <div className="kds-grid mx-auto grid max-w-[110rem] grid-cols-1 gap-2 p-2 pb-28 min-[860px]:max-lg:grid-cols-4 min-[860px]:max-lg:pb-2 lg:grid-cols-3 lg:gap-3 lg:p-3 lg:pb-3 xl:grid-cols-4 2xl:grid-cols-5">
        {feedStale && (
          <div
            role="status"
            className="col-span-full rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-2 text-center text-sm font-bold text-amber-900"
          >
            Connection dropped — showing the last known board and retrying. Orders are not being
            lost.
          </div>
        )}
        {visibleTickets.map((t) => {
          const elapsedSec = Math.max(
            0,
            Math.floor((now - new Date(t.created_at).getTime()) / 1000),
          );
          const mins = Math.floor(elapsedSec / 60);
          const clock = `${mins}:${String(elapsedSec % 60).padStart(2, "0")}`;
          const targetSeconds = Math.max(600, ...t.items.map((item) => item.prep_seconds ?? 0));
          const hot = elapsedSec >= targetSeconds;
          const timerTone =
            elapsedSec >= targetSeconds * 2
              ? "bg-red-600 text-white animate-pulse"
              : elapsedSec >= targetSeconds
                ? "bg-amber-500 text-white"
                : "bg-slate-800 text-white";
          const cook = t.needsCooking;
          // Ticket headline prep: hot beats prep beats nothing.
          const ticketPrep: PrepType = cook
            ? "hot"
            : t.items.some((i) => i.prep === "prep")
              ? "prep"
              : "none";
          const scheduledAt =
            t.scheduled_for && t.schedule_mode !== "asap" ? new Date(t.scheduled_for) : null;
          const minsUntilDue = scheduledAt
            ? Math.round((scheduledAt.getTime() - now) / 60000)
            : null;
          const channel = CHANNEL[channelOf(t)];
          return (
            <div
              key={t.id}
              className={`kds-card flex w-full min-w-0 snap-start scroll-mt-24 flex-col break-words rounded-2xl border-4 bg-white p-3 shadow-md ring-2 transition-shadow min-[860px]:max-lg:rounded-xl min-[860px]:max-lg:p-2 min-[860px]:max-lg:text-[13px] lg:rounded-xl lg:shadow-sm ${channel.border} ${channel.ring} ${hot ? "shadow-brand" : ""}`}
            >
              {/* Area + cook state share one strip so the ticket stays short */}
              <div className="-mx-3 -mt-3 mb-1.5 grid grid-cols-2 overflow-hidden rounded-t-xl text-[10px] font-black uppercase tracking-[0.12em] sm:-mx-3 sm:-mt-3">
                <span className={`truncate px-2 py-1 text-center ${channel.chip}`}>
                  {channel.label}
                </span>
                <span
                  className={`truncate px-2 py-1 text-center text-white ${cook ? "bg-blue-600" : ticketPrep === "prep" ? "bg-emerald-600" : "bg-amber-500"}`}
                >
                  {PREP_LABEL[ticketPrep]}
                </span>
              </div>
              <div className="mb-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setReassignFor(reassignFor === t.id ? null : t.id)}
                    className="flex items-center justify-center gap-1 rounded-full border border-border py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:border-primary hover:text-primary"
                    aria-expanded={reassignFor === t.id}
                    title="Move this ticket to a different area"
                  >
                    <Shuffle className="h-3 w-3" aria-hidden="true" />
                    Move area
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditId(t.id)}
                    className="flex items-center justify-center gap-1 rounded-full border border-border py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:border-primary hover:text-primary"
                    title="Correct the details, amount or items on this ticket"
                  >
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                    Edit ticket
                  </button>
                </div>
                {moveState[t.id] === "saving" && (
                  <p className="mt-1 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Moving…
                  </p>
                )}
                {moveState[t.id] && moveState[t.id] !== "saving" && (
                  <p className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-center text-[10px] font-bold text-red-700">
                    Move failed — {moveState[t.id]}
                  </p>
                )}
                {reassignFor === t.id && (
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-slate-50 p-2">
                    {REASSIGN_CHANNELS.map((key) => {
                      const target = CHANNEL[key];
                      const current = channelOf(t) === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={current}
                          onClick={() => reassignChannel(t, key)}
                          className={`h-9 rounded-lg px-2 text-[10px] font-black uppercase tracking-wide sm:h-8 ${
                            current
                              ? "cursor-default border border-dashed border-slate-400 bg-white text-slate-400"
                              : `${target.chip} active:scale-[0.98]`
                          }`}
                        >
                          {current ? `${target.label} ✓` : target.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {scheduledAt && (
                <div className="-mx-3 -mt-2 mb-2 bg-violet-700 px-3 py-1.5 text-center text-white sm:-mx-3">
                  <p className="font-display text-base font-black uppercase leading-none tracking-[0.14em]">
                    Later order · for{" "}
                    {scheduledAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide">
                    {minsUntilDue !== null && minsUntilDue > 0
                      ? `Do not start yet · due in ${minsUntilDue} min`
                      : "Due now · start this order"}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <p className="truncate font-display text-lg font-bold leading-none">
                  #{t.order_number}
                </p>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs font-black tabular-nums ${timerTone}`}
                    title={`Time in kitchen · target ${Math.ceil(targetSeconds / 60)} minutes`}
                  >
                    {clock}
                  </span>
                  <span
                    className="shrink-0 rounded-full bg-primary px-2 py-0.5 font-mono text-[11px] font-black tabular-nums text-white"
                    title="Current time"
                  >
                    <span className="sm:hidden">
                      {new Date(now).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </span>
                    <span className="hidden sm:inline">
                      {new Date(now).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })}
                    </span>
                  </span>
                </div>
                <div className="col-span-2 flex flex-wrap items-center gap-1">
                  {t.payment_method === "account" ||
                  t.payment_status === "on_account" ||
                  t.payment_status === "unpaid" ||
                  t.payment_status === "pending" ? (
                    <span className="rounded-full bg-amber-500 px-1.5 py-px text-[9px] font-black uppercase tracking-wide text-black">
                      {t.payment_method === "account" || t.payment_status === "on_account"
                        ? `Tab · Unpaid${t.company_name ? ` · ${t.company_name}` : ""}`
                        : "Unpaid"}
                    </span>
                  ) : (
                    <span
                      className={`rounded-full px-1.5 py-px text-[9px] font-black uppercase tracking-wide ${t.payment_method === "cash" ? "bg-emerald-600 text-white" : "bg-slate-800 text-white"}`}
                    >
                      {t.payment_method === "cash" ? "Cash" : "Card"}
                    </span>
                  )}
                  {(t.payment_method === "account" || t.payment_status === "on_account") && (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void settleTabTicket(t, "cash")}
                        className="rounded-full bg-emerald-600 px-1.5 py-px text-[9px] font-black uppercase tracking-wide text-white hover:bg-emerald-700"
                        title="Mark this tab order as paid in cash"
                      >
                        Paid cash
                      </button>
                      <button
                        type="button"
                        onClick={() => void settleTabTicket(t, "card")}
                        className="rounded-full bg-slate-800 px-1.5 py-px text-[9px] font-black uppercase tracking-wide text-white hover:bg-slate-900"
                        title="Mark this tab order as paid by card"
                      >
                        Paid card
                      </button>
                      <button
                        type="button"
                        onClick={() => void cancelTabTicket(t)}
                        className="rounded-full border border-red-600 px-1.5 py-px text-[9px] font-black uppercase tracking-wide text-red-700 hover:bg-red-600 hover:text-white"
                        title="Cancel this unpaid tab order and take it off the house tab"
                      >
                        Cancel
                      </button>
                    </span>
                  )}
                  {t.payment_method !== "account" && t.payment_status !== "on_account" && (
                    <button
                      type="button"
                      onClick={() => void cancelTabTicket(t)}
                      className="rounded-full border border-red-600 px-1.5 py-px text-[9px] font-black uppercase tracking-wide text-red-700 hover:bg-red-600 hover:text-white"
                      title="Cancel this ticket and take it off the board"
                    >
                      Cancel
                    </button>
                  )}
                  <span className="truncate text-[10px] font-semibold text-muted-foreground">
                    {new Date(t.created_at).toLocaleString([], {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
              <div
                className={`mt-1 rounded-lg px-2 py-1 ${TYPE_TONE[t.type] ?? "bg-slate-500 text-white"}`}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <p className="flex min-w-0 items-center gap-1 truncate font-display text-xs font-black uppercase leading-none tracking-wide">
                    {(() => {
                      const Icon =
                        t.type === "dine_in"
                          ? HandPlatter
                          : t.type === "delivery"
                            ? Bike
                            : ShoppingBag;
                      return <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
                    })()}
                    <span className="truncate">
                      {t.source === "sumup_pos" && t.type === "collection"
                        ? "TAKEAWAY"
                        : (TYPE_LABEL[t.type] ?? t.type.replace("_", " ").toUpperCase())}
                    </span>
                  </p>
                  <p className="shrink-0 text-[11px] font-black leading-none">
                    {whenLabel(t) === "ASAP" ? "ASAP" : `FOR ${whenLabel(t)}`}
                  </p>
                </div>
                {t.type === "dine_in" && t.table_number && (
                  <p className="mt-0.5 text-[11px] font-bold">TABLE {t.table_number}</p>
                )}
                <button
                  onClick={() => markDineIn(t.id, t.type)}
                  className="kds-hide-tablet mt-1 rounded-full bg-black/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide hover:bg-black/25"
                  title="Switch this ticket between dine in and pickup"
                >
                  {t.type === "dine_in" ? "Change to pickup" : "Mark as dine in"}
                </button>
              </div>
              <p className="mt-1.5 text-xs font-black uppercase tracking-wide text-foreground">
                {t.customer_name}
              </p>
              {t.status !== "preparing" && t.status !== "ready" && (
                <p className="mt-1.5 rounded-lg bg-slate-200 px-2 py-1 text-center text-[10px] font-black uppercase tracking-widest text-slate-700">
                  Recalled · {t.status.replace(/_/g, " ")}
                </p>
              )}
              {t.pos_terminal && (
                <p
                  className={`kds-hide-tablet mt-1.5 rounded-lg px-2 py-1 text-center font-display text-sm font-black uppercase tracking-wide ${channel.chip}`}
                >
                  {t.pos_terminal === "public" ? "Public side" : `${t.pos_terminal} side`}
                </p>
              )}
              {t.source === "deliveroo" && (
                <p className="mt-1.5 rounded-lg border border-[#00CCBC] bg-[#00CCBC]/10 px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#007e75]">
                  Attach the Deliveroo receipt printed on the tablet to this order
                </p>
              )}
              <p className="mt-1 inline-block self-start rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-black tracking-widest text-white">
                {orderCode(t)}
              </p>
              {(t.jury_room ?? t.court_location) &&
                (t.type === "delivery" || t.type === "dine_in") && (
                  <div className="mt-1.5 rounded-lg border-2 border-red-600 bg-red-50 p-1.5 text-red-900">
                    <p className="text-[9px] font-black uppercase tracking-widest">
                      {t.type === "delivery" ? "Deliver to (court)" : "Serve at (court)"}
                    </p>
                    <p className="font-display text-base font-black uppercase leading-tight">
                      {t.jury_room ?? t.court_location}
                    </p>
                  </div>
                )}
              {!t.jury_room &&
                !t.court_location &&
                (t.type === "delivery" || t.postcode || t.address_line1 || t.company_name) && (
                  <div className="mt-1.5 rounded-lg border border-slate-900 bg-white p-1.5 text-xs">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                      Deliver to
                    </p>
                    {t.postcode && (
                      <p className="font-display text-base font-black uppercase leading-none">
                        {t.postcode}
                      </p>
                    )}
                    {t.company_name && <p className="mt-0.5 font-bold">{t.company_name}</p>}
                    {t.address_line1 && <p className="font-semibold">{t.address_line1}</p>}
                    {t.address_line2 && <p className="font-semibold">{t.address_line2}</p>}
                    {t.city && <p className="text-muted-foreground">{t.city}</p>}
                    {!t.postcode && !t.address_line1 && !t.company_name && (
                      <p className="font-bold text-red-600">
                        No address on this order — check the till
                      </p>
                    )}
                    {t.customer_phone && <p className="mt-0.5 font-bold">☎ {t.customer_phone}</p>}
                  </div>
                )}
              {(t.delivery_notes || whenLabel(t) !== "ASAP") && (
                <p className="mt-1.5 rounded-lg border-2 border-amber-400 bg-amber-100 px-2 py-1 text-[11px] font-black uppercase leading-tight text-amber-900">
                  NOTE: {noteText(t)}
                </p>
              )}
              <ul
                className={`kds-items mt-2 flex-1 space-y-1.5 rounded-lg p-2.5 text-base ${cook ? "bg-blue-50" : "bg-amber-50"}`}
              >
                {groupByCategory(t.items).map((group) => (
                  <li key={group.category ?? "uncategorised"}>
                    <span className="block rounded bg-slate-200/70 px-1.5 py-0.5 text-xs font-black uppercase tracking-wide text-slate-700">
                      {group.category ?? "Other items"}
                    </span>
                    <ul className="mt-1 space-y-1.5">
                      {group.items.map((i) => (
                        <li key={i.id} className="flex items-start gap-2 leading-tight">
                          <span
                            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${i.cook ? "bg-blue-600" : "bg-amber-400"}`}
                          />
                          <span className="min-w-0 flex-1 font-semibold">
                            <span className="font-black text-primary">{i.qty}×</span> {i.name}
                            {station === "ALL" && i.station_code && (
                              <span className="ml-1 align-middle rounded bg-slate-200 px-1 py-px text-[10px] font-bold text-slate-700">
                                {i.station_code}
                              </span>
                            )}
                            {i.notes ? (
                              <em className="block text-[11px] font-medium text-muted-foreground">
                                — {i.notes}
                              </em>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              {/* Chef self-allocation: KS / SD / SA / OT — compact, prominent, inside the card */}
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Prep by
                </span>
                {["KS", "SD", "SA", "OT"].map((initials) => {
                  const active = t.prepared_by === initials;
                  return (
                    <button
                      key={initials}
                      type="button"
                      onClick={() => assignPrep(t.id, active ? "" : initials)}
                      className={`h-9 flex-1 rounded-full text-xs font-black uppercase tracking-wide active:scale-[0.98] sm:h-8 ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "border-2 border-slate-300 bg-white text-slate-700 hover:border-primary hover:text-primary"
                      }`}
                      title={active ? "Tap to clear" : `I am preparing this order (${initials})`}
                    >
                      {initials}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.status === "ready" && t.type === "delivery" && (
                  <p className="w-full rounded-lg bg-slate-900 px-2 py-1 text-center text-[11px] font-black uppercase tracking-widest text-white">
                    Ready for delivery
                  </p>
                )}
                {canCompleteOrders && t.status === "preparing" && (
                  <button
                    onClick={() => set(t.id, "ready", { undoTo: "preparing" })}
                    className={`h-10 min-w-[7rem] flex-1 rounded-full text-xs font-bold active:scale-[0.98] sm:h-8 ${cook ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-amber-400 text-amber-950 hover:bg-amber-500"}`}
                  >
                    Mark ready
                  </button>
                )}
                {canCompleteOrders && t.status === "ready" && (
                  <>
                    <button
                      onClick={() => set(t.id, "completed", { undoTo: "ready" })}
                      className="h-10 min-w-[7rem] flex-1 rounded-full bg-emerald-600 text-xs font-bold text-white active:scale-[0.98] hover:bg-emerald-700 sm:h-8 sm:font-semibold"
                    >
                      Mark complete
                    </button>
                    <button
                      onClick={() => set(t.id, "preparing")}
                      className="h-10 rounded-full border border-border px-3 text-xs font-semibold hover:border-primary hover:text-primary sm:h-8"
                      title="Sent to ready by mistake — put it back in preparing"
                    >
                      ↩ Undo ready
                    </button>
                  </>
                )}
                {canCompleteOrders &&
                  (t.status === "completed" ||
                    t.status === "delivered" ||
                    t.status === "out_for_delivery" ||
                    t.status === "paid") && (
                    <button
                      onClick={() => set(t.id, "preparing")}
                      className="h-10 min-w-[7rem] flex-1 rounded-full bg-amber-500 text-xs font-bold text-white active:scale-[0.98] hover:bg-amber-600 sm:h-8"
                      title="Reopen this ticket back into the kitchen"
                    >
                      ↩ Reopen ticket
                    </button>
                  )}
                <a
                  href={`/print/${t.id}?paper=${kdsPaper}&preview=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="kds-iconbtn grid h-10 w-10 place-items-center rounded-full border border-border text-sm hover:border-primary hover:text-primary sm:h-8 sm:w-8 sm:text-xs"
                  aria-label="Print preview"
                  title="Preview then print"
                >
                  👁
                </a>
                <a
                  href={`/print/${t.id}?paper=${kdsPaper}`}
                  target="_blank"
                  rel="noreferrer"
                  className="kds-iconbtn grid h-10 w-10 place-items-center rounded-full border border-border text-sm hover:border-primary hover:text-primary sm:h-8 sm:w-8 sm:text-xs"
                  aria-label="Print"
                  title="Print now"
                >
                  🖨
                </a>
              </div>
            </div>
          );
        })}
        {!visibleTickets.length && (
          <div className="col-span-full p-16 text-center text-muted-foreground">
            <p>No active tickets for {station === "ALL" ? "the kitchen" : station}.</p>
            {station !== "ALL" && tickets.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setStation("ALL");
                  window.localStorage.setItem("cafe1-kds-station", "ALL");
                }}
                className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground"
              >
                {tickets.length} ticket{tickets.length === 1 ? "" : "s"} hidden by this station —
                show all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Phone / tablet: native-style bottom bar so the whole board stays thumb-reachable */}
      {sheet && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSheet(null)}
          aria-hidden="true"
        />
      )}
      {sheet && (
        <div
          role="dialog"
          aria-label={sheet === "stations" ? "Kitchen stations" : "Display tools"}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-card-foreground shadow-2xl lg:hidden"
        >
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" />
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">
              {sheet === "stations" ? "Station" : "Tools"}
            </h2>
            <button
              onClick={() => setSheet(null)}
              className="grid h-9 w-9 place-items-center rounded-full bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {sheet === "stations" ? (
            <div className="grid grid-cols-2 gap-2">
              {STATIONS.map((value) => (
                <button
                  key={value}
                  onClick={() => {
                    setStation(value);
                    window.localStorage.setItem("cafe1-kds-station", value);
                    setSheet(null);
                  }}
                  className={`rounded-2xl px-4 py-3 text-sm font-black tracking-wide ${
                    station === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Station
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {STATIONS.map((value) => (
                    <button
                      key={value}
                      onClick={() => {
                        setStation(value);
                        window.localStorage.setItem("cafe1-kds-station", value);
                      }}
                      className={`rounded-2xl px-3 py-3 text-sm font-black tracking-wide ${
                        station === value
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setAll("preparing", "ready");
                    setSheet(null);
                  }}
                  disabled={
                    bulking || !canCompleteOrders || !tickets.some((t) => t.status === "preparing")
                  }
                  className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
                >
                  Mark all ready
                </button>
                <button
                  onClick={() => {
                    setAll("ready", "completed");
                    setSheet(null);
                  }}
                  disabled={
                    bulking || !canCompleteOrders || !tickets.some((t) => t.status === "ready")
                  }
                  className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
                >
                  Mark all complete
                </button>
              </div>
              <button
                onClick={() => {
                  setSheet(null);
                  setManualOpen(true);
                }}
                disabled={!canCompleteOrders}
                className="flex w-full items-center gap-2 rounded-2xl bg-[#00CCBC] px-4 py-3 text-left text-sm font-bold text-black disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> Add order by hand
              </button>
              <button
                onClick={() => {
                  setRecall(!recall);
                  setSheet(null);
                }}
                className="w-full rounded-2xl bg-muted px-4 py-3 text-left text-sm font-bold"
              >
                {recall ? "Unrecall last 15 orders" : "Recall last 15 orders"}
              </button>
              <button
                onClick={manualSync}
                disabled={syncing}
                className="flex w-full items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-left text-sm font-semibold disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync SumUp POS"}
              </button>
              <a
                href={`/print/test?paper=${kdsPaper}&preview=1`}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm font-semibold"
              >
                <Printer className="h-4 w-4" /> Test print
              </a>
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-muted px-4 py-3 text-sm font-semibold">
                <span>Paper width</span>
                <span className="flex items-center gap-1 rounded-full bg-background p-1">
                  {([58, 80] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => pickPaper(w)}
                      className={`rounded-full px-3 py-1 text-xs font-bold ${kdsPaper === w ? "bg-primary text-primary-foreground" : "opacity-70"}`}
                    >
                      {w}mm
                    </button>
                  ))}
                </span>
              </div>
              <div className="rounded-2xl bg-muted px-2 py-1">
                <InstallAppButton
                  manifest="/kds.webmanifest"
                  label="Install KDS app"
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold"
                />
              </div>
              <button
                onClick={() => window.location.reload()}
                className="flex w-full items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-left text-sm font-semibold"
              >
                <RefreshCw className="h-4 w-4" /> Refresh screen
              </button>
              <button
                onClick={() => void signOutAndRedirect()}
                className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
      {/* Phone / tablet: always-available add-order action */}
      <button
        type="button"
        onClick={() => setManualOpen(true)}
        disabled={!canCompleteOrders}
        aria-label="Add a manual order"
        className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[45] flex items-center gap-2 rounded-full bg-[#00CCBC] px-4 py-3 text-sm font-black text-black shadow-lg active:scale-[0.97] disabled:opacity-40 min-[860px]:max-lg:bottom-6 lg:hidden"
      >
        <Plus className="h-5 w-5" /> Add order
      </button>
      <nav
        aria-label="Kitchen display navigation"
        className="kds-tabbar fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 gap-0.5 border-t border-border bg-primary px-1 pb-[env(safe-area-inset-bottom)] pt-1.5 text-primary-foreground min-[860px]:max-lg:bottom-auto min-[860px]:max-lg:top-0 min-[860px]:max-lg:z-50 min-[860px]:max-lg:border-b min-[860px]:max-lg:border-t-0 min-[860px]:max-lg:pb-1.5 lg:hidden"
      >
        {FEEDS.map(({ key, label, Icon }) => {
          const count = tickets.filter((t) => matchesFeed(key, t)).length;
          const on = feed === key;
          return (
            <button
              key={key}
              onClick={() => {
                setFeed(key);
                setSheet(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              aria-pressed={on}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[9px] font-bold leading-tight ${
                on ? "bg-primary-foreground text-primary" : ""
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {count > 0 && (
                  <span
                    className={`absolute -right-2 -top-1.5 min-w-[15px] rounded-full px-1 text-[9px] font-black leading-[15px] ${
                      on
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary-foreground text-primary"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </span>
              {label}
            </button>
          );
        })}
        <button
          onClick={() => setSheet(sheet === "more" ? null : "more")}
          className={`flex flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[9px] font-bold leading-tight ${
            sheet === "more" ? "bg-primary-foreground text-primary" : ""
          }`}
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>
    </div>
  );
}

function AlertsToggle() {
  return <AlertsToggleInner />;
}

/** Lets the kitchen tablet go edge-to-edge so Chrome's address bar is hidden. */
function FullscreenToggle() {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    onChange();
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.().catch(() => {});
      }}
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-2 text-xs font-bold text-primary-foreground active:scale-[0.97]"
      title="Hide the browser address bar and use the whole screen"
    >
      {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      {full ? "Exit full screen" : "Full screen"}
    </button>
  );
}

function SyncPill({
  lastSync,
  ok,
  now,
  compact,
}: {
  lastSync: number | null;
  ok: boolean;
  now: number;
  compact?: boolean;
}) {
  const secs = lastSync ? Math.max(0, Math.round((now - lastSync) / 1000)) : null;
  const stale = secs === null || secs > 60 || !ok;
  const label =
    secs === null ? "waiting…" : secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`;
  return (
    <span
      title={ok ? "Last successful SumUp POS sync" : "Last SumUp POS sync failed"}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${
        compact ? "text-[10px]" : "text-xs"
      } ${stale ? "bg-amber-500/90 text-white" : "bg-primary-foreground/10"}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${stale ? "bg-white" : "bg-emerald-400 animate-pulse"}`}
      />
      POS {label}
    </span>
  );
}

function AlertsToggleInner() {
  const { perm, request } = useNotificationPermission();
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={request}
        className="flex items-center gap-1 rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs font-semibold hover:bg-primary-foreground/20"
        title={perm === "granted" ? "Alerts on" : "Enable alerts"}
      >
        {perm === "granted" ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        <span>
          {perm === "granted"
            ? "Alerts on"
            : perm === "unsupported"
              ? "No alerts"
              : "Enable alerts"}
        </span>
      </button>
      <button
        onClick={() => playChime()}
        className="rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs font-semibold hover:bg-primary-foreground/20"
        title="Play the new-order chime"
      >
        Test sound
      </button>
    </div>
  );
}
function WakeToggle() {
  const { supported, enabled, active, toggle } = useWakeLock();
  if (!supported) return null;
  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${enabled ? "bg-primary-foreground text-primary" : "bg-primary-foreground/10 hover:bg-primary-foreground/20"}`}
      title={
        enabled
          ? active
            ? "Screen kept awake"
            : "Keep awake on — will re-arm when tab is visible"
          : "Keep this screen awake during service"
      }
    >
      {enabled ? <Sun className="h-4 w-4" /> : <SunDim className="h-4 w-4" />}
      <span>{enabled ? "Screen awake" : "Keep awake"}</span>
    </button>
  );
}
