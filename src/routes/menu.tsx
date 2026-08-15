import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-auth";
import { getCustomerFavourites, toggleFavourite } from "@/lib/customer-experience.functions";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { PromoBanner } from "@/components/promo-banner";
import { PromoCarousel } from "@/components/promo-carousel";
import { StoreStatus } from "@/components/store-status";
import { cart, useCart, type CartModifier } from "@/lib/cart";
import { money } from "@/lib/format";
import {
  Plus,
  Minus,
  Search,
  Leaf,
  ShoppingBag,
  X,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Snowflake,
  Tag,
  ShieldCheck,
  Heart,
} from "lucide-react";
import { toast } from "sonner";
import { OrderSetupGate } from "@/components/order-setup-gate";
import { useJurySession } from "@/lib/jury-session";
import { describeContext, useOrderContext } from "@/lib/order-context";
import { hasMenuBrowsingIntent, setMenuBrowsingIntent } from "@/lib/menu-intent";
import {
  groupModifierOptions,
  selectionInstruction,
  toggleModifierSelection,
  validateModifierSelection,
  type ModifierRule,
} from "@/lib/modifier-rules";
import { formatCount, matchesMenuQuery } from "@/lib/menu-discovery";
import { localBusinessJsonLd } from "@/lib/nap";
import { breadcrumbJsonLd, canonicalLink, jsonLdScript, seoMeta, webPageJsonLd } from "@/lib/seo";

const title = "Halal Breakfast, Lunch & Café Menu in St Albans | Café 1";
const description =
  "Browse Café 1's St Albans menu: halal breakfast, Desi dishes, omelettes, curries, sandwiches, paninis, jackets, coffee and more. Order online.";
const PUBLIC_MENU_STALE_TIME_MS = 60_000;

async function loadPublicMenu() {
  const [cats, items, mods] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("id,name,description,sort_order")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("menu_items")
      .select(
        "id,category_id,name,description,price_cents,image_url,is_veg,needs_cooking,juror_menu,group_label,allergens,dietary_tags,sort_order",
      )
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("menu_modifiers")
      .select(
        "id,item_id,category_id,name,description,price_cents,is_veg,group_name,group_type,required,min_selections,max_selections,is_exclusive,sort_order",
      )
      .eq("active", true)
      .order("sort_order"),
  ]);
  return { cats: cats.data ?? [], items: items.data ?? [], mods: mods.data ?? [] };
}

type PublicMenu = Awaited<ReturnType<typeof loadPublicMenu>>;

export const Route = createFileRoute("/menu")({
  loader: loadPublicMenu,
  validateSearch: (s: { juror?: unknown }): { juror?: boolean } => ({
    juror: s.juror === true || s.juror === "true" ? true : undefined,
  }),
  head: () => ({
    meta: seoMeta({ title, description, path: "/menu" }),
    links: [canonicalLink("/menu")],
    scripts: [
      jsonLdScript(localBusinessJsonLd("https://cafe1stalbans.co.uk/icon-512.png")),
      jsonLdScript(webPageJsonLd({ name: title, description, path: "/menu" })),
      jsonLdScript(
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Menu", path: "/menu" },
        ]),
      ),
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const initialMenu = Route.useLoaderData() as PublicMenu;
  const { juror: jurorParam } = Route.useSearch();
  const ctx = useOrderContext();
  const [gateOpen, setGateOpen] = useState(false);
  const [intentReady, setIntentReady] = useState(false);
  const [browsingOnly, setBrowsingOnly] = useState(false);
  const jurySessionActive = useJurySession();
  useEffect(() => {
    setBrowsingOnly(hasMenuBrowsingIntent());
    setIntentReady(true);
  }, []);
  useEffect(() => {
    if (!intentReady) return;
    if (ctx) {
      setBrowsingOnly(false);
      setMenuBrowsingIntent(false);
      return;
    }
    if (!browsingOnly) setGateOpen(true);
  }, [browsingOnly, ctx, intentReady]);
  const { data, isLoading } = useQuery<PublicMenu>({
    queryKey: ["menu"],
    queryFn: loadPublicMenu,
    initialData: initialMenu,
    // The SSR loader has just fetched this exact menu. Treat it as fresh long
    // enough to avoid immediately repeating all three Supabase queries during
    // hydration; normal focus/refetch behaviour resumes after one minute.
    staleTime: PUBLIC_MENU_STALE_TIME_MS,
  });

  const [q, setQ] = useState("");
  const [vegOnly, setVegOnly] = useState(false);
  const [temp, setTemp] = useState<"any" | "hot" | "cold">("any");
  const [under5, setUnder5] = useState(false);
  const [jurorOnly, setJurorOnly] = useState(!!jurorParam);
  const [excludedAllergen, setExcludedAllergen] = useState("");
  const [dietaryTag, setDietaryTag] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const { user } = useSession();
  const loadFavourites = useServerFn(getCustomerFavourites);
  const saveFavourite = useServerFn(toggleFavourite);
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const cartState = useCart();
  const cartCount = cartState.items.reduce((a, i) => a + i.qty, 0);
  const cartTotal = cartState.items.reduce((a, i) => a + i.qty * i.price_cents, 0);

  function browseMenuOnly() {
    setMenuBrowsingIntent(true);
    setBrowsingOnly(true);
    setGateOpen(false);
  }

  function openOrderSetup() {
    setMenuBrowsingIntent(false);
    setBrowsingOnly(false);
    setGateOpen(true);
  }

  useEffect(() => {
    if (!user) {
      setFavourites(new Set());
      return;
    }
    void loadFavourites({ data: undefined as never })
      .then((ids) => setFavourites(new Set(ids)))
      .catch(() => setFavourites(new Set()));
  }, [loadFavourites, user]);

  const filterOptions = useMemo(() => {
    const allergens = new Set<string>();
    const dietary = new Set<string>();
    for (const item of data?.items ?? []) {
      for (const value of item.allergens ?? []) allergens.add(value);
      for (const value of item.dietary_tags ?? []) dietary.add(value);
    }
    return {
      allergens: [...allergens].sort((a, b) => a.localeCompare(b)),
      dietary: [...dietary].sort((a, b) => a.localeCompare(b)),
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return null;
    const categoryNames = new Map(data.cats.map((category) => [category.id, category.name]));
    const items = data.items.filter((i) => {
      if (vegOnly && !i.is_veg) return false;
      // Juror Menu is only visible to verified jurors arriving from /juror.
      if (!jurorParam && i.juror_menu) return false;
      if (jurorOnly && !i.juror_menu) return false;
      if (temp === "hot" && !i.needs_cooking) return false;
      if (temp === "cold" && i.needs_cooking) return false;
      if (under5 && i.price_cents >= 500) return false;
      if (
        excludedAllergen &&
        (i.allergens ?? []).some((value) => value.toLowerCase() === excludedAllergen.toLowerCase())
      )
        return false;
      if (
        dietaryTag &&
        !(i.dietary_tags ?? []).some((value) => value.toLowerCase() === dietaryTag.toLowerCase())
      )
        return false;
      return matchesMenuQuery(i, q, i.category_id ? (categoryNames.get(i.category_id) ?? "") : "");
    });
    const cats = data.cats.filter((c) => items.some((i) => i.category_id === c.id));
    return { cats, items, mods: data.mods };
  }, [data, q, vegOnly, temp, under5, jurorOnly, jurorParam, excludedAllergen, dietaryTag]);

  const filtersOn =
    vegOnly || under5 || jurorOnly || temp !== "any" || !!excludedAllergen || !!dietaryTag;
  function clearFilters() {
    setQ("");
    setVegOnly(false);
    setUnder5(false);
    setJurorOnly(false);
    setTemp("any");
    setExcludedAllergen("");
    setDietaryTag("");
  }

  async function changeFavourite(itemId: string) {
    if (!user) {
      toast.info("Sign in to save favourites", {
        description: "Your favourites will then be available on every device.",
      });
      return;
    }
    const wasSaved = favourites.has(itemId);
    setFavourites((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
    try {
      const saved = await saveFavourite({ data: { menu_item_id: itemId } });
      setFavourites((current) => {
        const next = new Set(current);
        if (saved) next.add(itemId);
        else next.delete(itemId);
        return next;
      });
    } catch (error) {
      setFavourites((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(itemId);
        else next.delete(itemId);
        return next;
      });
      toast.error(error instanceof Error ? error.message : "Could not save favourite");
    }
  }

  // Scrollspy: watch section headers to update active pill.
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const pillsRef = useRef<HTMLDivElement | null>(null);
  const stickyBarRef = useRef<HTMLDivElement | null>(null);
  const [stickyH, setStickyH] = useState(160);
  const lockRef = useRef(0);
  useEffect(() => {
    const measure = () => {
      const r = stickyBarRef.current?.getBoundingClientRect();
      if (!r) return;
      // Distance from viewport top to the bottom of the sticky bar, once pinned.
      const pinnedTop = Math.min(r.top, 80);
      setStickyH(Math.max(0, pinnedTop) + r.height + 8);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [filtered?.cats.length]);
  const catIds = filtered?.cats.map((c) => c.id).join(",") ?? "";
  useEffect(() => {
    const ids = catIds ? catIds.split(",") : [];
    if (!ids.length) return;
    setActiveCat((prev) => (prev && ids.includes(prev) ? prev : ids[0]));
    // Deterministic scrollspy: the active category is the last section whose
    // top has passed just under the sticky bar. (An IntersectionObserver ties
    // when a section header sits exactly on the boundary line.)
    const onScroll = () => {
      if (Date.now() < lockRef.current) return; // ignore while a pill jump animates
      const line = stickyH + 8;
      let current = ids[0];
      for (const id of ids) {
        const el = sectionRefs.current[id];
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActiveCat(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [catIds, stickyH]);

  // Auto-scroll pill row to active.
  // NOTE: never use scrollIntoView here — it also scrolls the window, which
  // fights with (and cancels) the vertical jump triggered by tapping a pill.
  useEffect(() => {
    const row = pillsRef.current;
    if (!activeCat || !row) return;
    const el = row.querySelector<HTMLButtonElement>(`[data-cat="${activeCat}"]`);
    if (!el) return;
    const target = el.offsetLeft - row.clientWidth / 2 + el.offsetWidth / 2;
    const left = Math.max(0, Math.min(target, row.scrollWidth - row.clientWidth));
    if (Math.abs(left - row.scrollLeft) > 2) row.scrollTo({ left, behavior: "smooth" });
  }, [activeCat]);

  // Track whether the pill row can scroll further, to show fades/arrows.
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  useEffect(() => {
    const row = pillsRef.current;
    if (!row) return;
    const update = () => {
      setCanScroll({
        left: row.scrollLeft > 4,
        right: row.scrollLeft + row.clientWidth < row.scrollWidth - 4,
      });
    };
    update();
    row.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      row.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [catIds]);

  function nudgePills(dir: 1 | -1) {
    const row = pillsRef.current;
    if (!row) return;
    row.scrollBy({ left: dir * Math.max(200, row.clientWidth * 0.7), behavior: "smooth" });
  }

  function scrollToCat(id: string) {
    setActiveCat(id);
    lockRef.current = Date.now() + 1200;

    const jump = (behavior: ScrollBehavior) => {
      const el = sectionRefs.current[id];
      if (!el) return false;
      const bar = stickyBarRef.current?.getBoundingClientRect();
      const offset = bar ? Math.max(0, Math.min(bar.top, 80)) + bar.height + 8 : stickyH;
      const y = Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset);
      if (Math.abs(y - window.scrollY) < 2) return true;
      window.scrollTo({ top: y, behavior });
      return true;
    };

    if (!jump("smooth")) return;
    // Images finishing loading can shift the page mid-animation: re-correct after it settles.
    const t1 = window.setTimeout(() => jump("auto"), 450);
    const t2 = window.setTimeout(() => {
      jump("auto");
      lockRef.current = 0;
    }, 750);
    void t1;
    void t2;
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <SiteHeader />
      <PromoBanner />

      {/* Restaurant hero */}
      <div className="bg-gradient-to-b from-primary-soft/40 to-transparent">
        <div className="mx-auto max-w-6xl px-4 pt-4 pb-3 sm:pt-10 sm:pb-4">
          <PromoCarousel />
          <p className="text-[11px] font-medium uppercase tracking-widest text-primary sm:text-xs">
            Cafe1 · St Albans
          </p>
          <h1 className="mt-0.5 font-display text-2xl font-bold sm:mt-1 sm:text-5xl">Menu</h1>
          <p className="mt-1 hidden max-w-xl text-sm text-muted-foreground sm:mt-2 sm:block">
            Freshly made all day. Delivery, collection or dine-in.
          </p>
          <div className="mt-2 sm:mt-3">
            <StoreStatus />
          </div>
          <button
            type="button"
            onClick={openOrderSetup}
            className="mt-2 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20 sm:mt-3"
          >
            <Settings2 className="h-4 w-4" />
            {ctx ? describeContext(ctx) : browsingOnly ? "Just browsing" : "Set up order"}
            <span className="text-xs font-medium opacity-70">
              {ctx ? "Change" : browsingOnly ? "Order now" : "Choose"}
            </span>
          </button>
        </div>
      </div>
      <OrderSetupGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        onBrowse={!ctx ? browseMenuOnly : undefined}
        dismissible={!!ctx}
        juryOnly={!!jurySessionActive}
      />

      {/* Sticky search + category pills */}
      <div
        ref={stickyBarRef}
        className="sticky top-20 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center gap-2 lg:max-w-md">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="Search the menu"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search the menu"
                className="h-11 w-full rounded-full border border-border bg-card pl-10 pr-10 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>
            {filtered && (
              <span
                className="hidden shrink-0 text-xs font-medium text-muted-foreground sm:inline"
                aria-live="polite"
              >
                {formatCount(filtered.items.length, "match", "matches")}
              </span>
            )}
          </div>

          {/* Dietary & quick filters */}
          <div className="mt-2.5 flex items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-widest text-muted-foreground lg:inline">
              Filters
            </span>
            {jurorParam && (
              <FilterChip
                active={jurorOnly}
                onClick={() => setJurorOnly((v) => !v)}
                icon={<ShieldCheck className="h-4 w-4" />}
              >
                Juror Menu
              </FilterChip>
            )}
            <FilterChip
              active={vegOnly}
              onClick={() => setVegOnly((v) => !v)}
              icon={<Leaf className="h-4 w-4" />}
            >
              Vegetarian
            </FilterChip>
            <FilterChip
              active={temp === "hot"}
              onClick={() => setTemp((t) => (t === "hot" ? "any" : "hot"))}
              icon={<Flame className="h-4 w-4" />}
            >
              Hot food
            </FilterChip>
            <FilterChip
              active={temp === "cold"}
              onClick={() => setTemp((t) => (t === "cold" ? "any" : "cold"))}
              icon={<Snowflake className="h-4 w-4" />}
            >
              Cold & drinks
            </FilterChip>
            <FilterChip
              active={under5}
              onClick={() => setUnder5((v) => !v)}
              icon={<Tag className="h-4 w-4" />}
            >
              Under £5
            </FilterChip>
            {filterOptions.allergens.length > 0 && (
              <select
                value={excludedAllergen}
                onChange={(event) => setExcludedAllergen(event.target.value)}
                className="h-10 shrink-0 rounded-full border border-border bg-card px-3 text-sm font-semibold text-muted-foreground outline-none focus:border-primary"
                aria-label="Exclude an allergen"
              >
                <option value="">All allergens</option>
                {filterOptions.allergens.map((value) => (
                  <option key={value} value={value}>
                    Exclude {value}
                  </option>
                ))}
              </select>
            )}
            {filterOptions.dietary.length > 0 && (
              <select
                value={dietaryTag}
                onChange={(event) => setDietaryTag(event.target.value)}
                className="h-10 shrink-0 rounded-full border border-border bg-card px-3 text-sm font-semibold text-muted-foreground outline-none focus:border-primary"
                aria-label="Dietary preference"
              >
                <option value="">All dietary options</option>
                {filterOptions.dietary.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            )}
            {(filtersOn || q) && (
              <button
                onClick={clearFilters}
                className="ml-1 shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category pills (mobile/tablet — desktop uses the sidebar) */}
          {filtered && filtered.cats.length > 0 && (
            <div className="relative mt-3 lg:hidden">
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent transition-opacity ${canScroll.left ? "opacity-100" : "opacity-0"}`}
              />
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent transition-opacity ${canScroll.right ? "opacity-100" : "opacity-0"}`}
              />
              <button
                type="button"
                aria-label="Scroll categories left"
                onClick={() => nudgePills(-1)}
                disabled={!canScroll.left}
                className="absolute -left-3 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-card shadow-sm transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-0 md:grid"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Scroll categories right"
                onClick={() => nudgePills(1)}
                disabled={!canScroll.right}
                className="absolute -right-3 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-card shadow-sm transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-0 md:grid"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div
                ref={pillsRef}
                role="tablist"
                aria-label="Menu categories"
                className="flex snap-x gap-2 overflow-x-auto scroll-smooth pb-1.5 [-ms-overflow-style:none] [scrollbar-width:none] md:px-1 [&::-webkit-scrollbar]:hidden"
              >
                {filtered.cats.map((c) => {
                  const active = c.id === activeCat;
                  return (
                    <button
                      key={c.id}
                      data-cat={c.id}
                      role="tab"
                      aria-selected={active}
                      onClick={() => scrollToCat(c.id)}
                      className={`shrink-0 snap-start whitespace-nowrap rounded-full border-2 px-4 py-2.5 text-[15px] font-semibold transition ${
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-brand"
                          : "border-border bg-card text-foreground hover:border-primary/60 hover:bg-primary-soft/40"
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl gap-10 px-4 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        {/* Desktop category sidebar */}
        <aside className="sticky top-[11.5rem] hidden max-h-[calc(100vh-13rem)] overflow-y-auto pt-8 pr-2 lg:block">
          <p className="px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Categories
          </p>
          <nav aria-label="Menu categories" className="mt-3 flex flex-col gap-1">
            {filtered?.cats.map((c) => {
              const active = c.id === activeCat;
              const count = filtered.items.filter((i) => i.category_id === c.id).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => scrollToCat(c.id)}
                  className={`flex items-center justify-between gap-2 rounded-xl border-l-4 px-3 py-2.5 text-left text-[15px] font-semibold transition ${
                    active
                      ? "border-primary bg-primary-soft/50 text-primary"
                      : "border-transparent text-foreground hover:border-primary/40 hover:bg-muted"
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <span
                    className={`shrink-0 text-xs font-medium ${active ? "text-primary/70" : "text-muted-foreground"}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          {isLoading && (
            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-2xl border border-border bg-card"
                />
              ))}
            </div>
          )}

          {filtered && filtered.cats.length === 0 && !isLoading && (
            <div className="mt-16 rounded-2xl border border-dashed border-border p-10 text-center">
              <p className="font-display text-xl font-semibold">No matches</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nothing matches “{q}”{vegOnly ? " with veg filter on" : ""}.
              </p>
              <button
                onClick={clearFilters}
                className="mt-4 rounded-full border border-border px-4 py-1.5 text-sm font-medium hover:border-primary hover:text-primary"
              >
                Clear filters
              </button>
            </div>
          )}

          {filtered?.cats.map((cat) => {
            const items = filtered.items.filter((i) => i.category_id === cat.id);
            if (!items.length) return null;
            const groups = new Map<string, typeof items>();
            for (const it of items) {
              const key = it.group_label ?? "";
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(it);
            }
            return (
              <section
                key={cat.id}
                id={`cat-${cat.id}`}
                ref={(el) => {
                  sectionRefs.current[cat.id] = el;
                }}
                className="scroll-mt-40 pt-8"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-display text-2xl font-bold sm:text-3xl">{cat.name}</h2>
                  <span className="text-xs text-muted-foreground">
                    {formatCount(items.length, "item")}
                  </span>
                </div>
                {cat.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{cat.description}</p>
                )}

                {[...groups.entries()].map(([label, gItems]) => (
                  <div key={label} className="mt-4">
                    {label && (
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        {label}
                      </p>
                    )}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {gItems.map((i) => (
                        <ItemCard
                          key={i.id}
                          item={i}
                          favourite={favourites.has(i.id)}
                          onFavourite={() => void changeFavourite(i.id)}
                          mods={filtered.mods.filter(
                            (m) => m.item_id === i.id || (!m.item_id && m.category_id === cat.id),
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </div>

      {/* Floating basket bar */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md justify-center px-4 md:bottom-4">
          <Link
            to="/cart"
            className="group flex w-full items-center justify-between gap-3 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-brand transition hover:bg-primary-hover"
          >
            <span className="inline-flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-foreground/15 text-sm font-bold">
                {cartCount}
              </span>
              <span className="font-semibold">View basket</span>
            </span>
            <span className="inline-flex items-center gap-1 font-semibold">
              {money(cartTotal)}
              <ShoppingBag className="h-4 w-4 opacity-80" />
            </span>
          </Link>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-brand"
          : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_veg: boolean;
  allergens: string[] | null;
  dietary_tags: string[] | null;
};

type Modifier = ModifierRule & {
  description: string | null;
  price_cents: number;
  is_veg: boolean;
};

function ItemCard({
  item,
  mods,
  favourite,
  onFavourite,
}: {
  item: MenuItem;
  mods: Modifier[];
  favourite: boolean;
  onFavourite: () => void;
}) {
  const cartState = useCart();
  const [open, setOpen] = useState(false);
  const lines = cartState.items.filter((i) => i.menu_item_id === item.id);
  const qty = lines.reduce((a, i) => a + i.qty, 0);
  const hasMods = mods.length > 0;

  function quickAdd() {
    if (hasMods) {
      setOpen(true);
      return;
    }
    cart.add({ menu_item_id: item.id, name: item.name, base_price_cents: item.price_cents });
    toast.success(`Added ${item.name}`);
  }

  function decrement() {
    const last = lines[lines.length - 1];
    if (last) cart.setQty(last.id, last.qty - 1);
  }

  return (
    <>
      <div className="group relative flex gap-3 overflow-hidden rounded-2xl border border-border bg-card p-3 transition hover:border-primary/40 hover:shadow-brand">
        <button
          type="button"
          onClick={onFavourite}
          aria-label={favourite ? `Remove ${item.name} from favourites` : `Save ${item.name}`}
          aria-pressed={favourite}
          className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-sm backdrop-blur hover:text-primary"
        >
          <Heart className={`h-4 w-4 ${favourite ? "fill-primary text-primary" : ""}`} />
        </button>
        <button
          type="button"
          onClick={() => (hasMods ? setOpen(true) : quickAdd())}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-start gap-2">
            {item.is_veg && (
              <span
                className="mt-1.5 grid h-4 w-4 shrink-0 place-items-center rounded-sm border border-green-600"
                title="Vegetarian"
                aria-label="Vegetarian"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
              </span>
            )}
            <p className="line-clamp-2 font-semibold">{item.name}</p>
          </div>
          {item.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
          )}
          {Boolean(item.dietary_tags?.length || item.allergens?.length) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.dietary_tags?.map((value) => (
                <span
                  key={`diet-${value}`}
                  className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
                >
                  {value}
                </span>
              ))}
              {item.allergens?.map((value) => (
                <span
                  key={`allergen-${value}`}
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900"
                >
                  Contains {value}
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 font-display text-lg font-bold text-primary">
            {money(item.price_cents)}
          </p>
          {hasMods && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary/80">
              <Settings2 className="h-3 w-3" /> Customise · {formatCount(mods.length, "add-on")}
            </p>
          )}
        </button>

        <div className="relative h-24 w-24 shrink-0 sm:h-28 sm:w-28">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name}
              loading="lazy"
              className="h-full w-full rounded-xl object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center rounded-xl bg-muted text-muted-foreground">
              <ShoppingBag className="h-6 w-6 opacity-40" />
            </div>
          )}

          {qty === 0 ? (
            <button
              onClick={quickAdd}
              className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-brand transition hover:bg-primary-hover"
              aria-label={`Add ${item.name}`}
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : (
            <div className="absolute -bottom-2 -right-2 flex items-center gap-1 rounded-full border-2 border-background bg-primary px-1 py-0.5 text-primary-foreground shadow-brand">
              <button
                onClick={decrement}
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-primary-hover"
                aria-label="Decrease"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[1ch] text-center text-sm font-bold">{qty}</span>
              <button
                onClick={quickAdd}
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-primary-hover"
                aria-label="Increase"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {open && <CustomiseSheet item={item} mods={mods} onClose={() => setOpen(false)} />}
    </>
  );
}

function CustomiseSheet({
  item,
  mods,
  onClose,
}: {
  item: MenuItem;
  mods: Modifier[];
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [qty, setQty] = useState(1);

  const groups = useMemo(() => groupModifierOptions(mods), [mods]);
  const selectedIds = useMemo(() => Object.keys(chosen).filter((id) => chosen[id]), [chosen]);
  const selectionErrors = useMemo(
    () => validateModifierSelection(mods, selectedIds),
    [mods, selectedIds],
  );

  function pick(group: (typeof groups)[number], modifier: Modifier, on: boolean) {
    setChosen((c) => {
      const current = Object.keys(c).filter((id) => c[id]);
      const result = on
        ? toggleModifierSelection(current, group, modifier)
        : { selected: new Set(current.filter((id) => id !== modifier.id)) };
      if (result.error) toast.error(result.error);
      const next: Record<string, boolean> = {};
      for (const id of result.selected) next[id] = true;
      return next;
    });
  }

  const selected: CartModifier[] = mods
    .filter((m) => chosen[m.id])
    .map((m) => ({
      id: m.id,
      name: m.name,
      price_cents: m.price_cents,
      is_veg: m.is_veg,
    }));
  const unit = item.price_cents + selected.reduce((s, m) => s + m.price_cents, 0);
  const changesVegetarianItem = item.is_veg && selected.some((modifier) => !modifier.is_veg);

  function add() {
    if (selectionErrors.length) {
      toast.error(selectionErrors[0]);
      return;
    }
    cart.add(
      {
        menu_item_id: item.id,
        name: item.name,
        base_price_cents: item.price_cents,
        modifiers: selected,
        notes: note.trim() || undefined,
      },
      qty,
    );
    toast.success(`Added ${qty} × ${item.name}`);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <button className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-card sm:max-h-[88dvh] sm:rounded-3xl">
        <div className="flex items-start gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl font-bold">{item.name}</h3>
            {item.description && (
              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {groups.map((g) => {
            const chosenCount = g.modifiers.filter((m) => chosen[m.id]).length;
            const needs = chosenCount < g.min;
            return (
              <section key={g.name} className="mb-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {g.name}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                      g.required
                        ? needs
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary-soft text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {g.required ? "Required" : "Optional"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{selectionInstruction(g)}</p>
                <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
                  {g.modifiers.map((m) => {
                    const on = !!chosen[m.id];
                    return (
                      <li key={m.id}>
                        <label className="flex cursor-pointer items-center gap-3 p-3">
                          <input
                            type={g.single ? "radio" : "checkbox"}
                            name={g.single ? `${item.id}-${g.name}` : undefined}
                            checked={on}
                            onChange={(e) => pick(g, m, e.target.checked)}
                            onClick={() => {
                              // Radios in an optional group can be unpicked by re-clicking.
                              if (g.single && !g.required && chosen[m.id]) pick(g, m, false);
                            }}
                            className="h-5 w-5 accent-[var(--color-primary,red)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5 font-medium">
                              {m.name}
                              {m.is_veg && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                                  <Leaf className="h-3 w-3" /> Veg
                                </span>
                              )}
                            </span>
                            {m.description && (
                              <span className="block text-xs text-muted-foreground">
                                {m.description}
                              </span>
                            )}
                          </span>
                          <span className="text-sm font-semibold text-primary">
                            {m.price_cents ? `+${money(m.price_cents)}` : "Free"}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {changesVegetarianItem && (
            <div
              role="status"
              className="mb-4 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-950"
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />A selected add-on is not marked
              vegetarian, so this customised item will not be labelled vegetarian.
            </div>
          )}

          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Special instructions
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="e.g. no butter, extra crispy"
              className="mt-2 min-h-16 w-full rounded-xl border border-border bg-background p-3 text-sm"
            />
          </label>
        </div>

        <div
          className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-card p-4"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-1 rounded-full border border-border">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted"
              aria-label="Decrease quantity"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center font-bold">{qty}</span>
            <button
              onClick={() => setQty((q) => Math.min(50, q + 1))}
              className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted"
              aria-label="Increase quantity"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={add}
            aria-disabled={selectionErrors.length > 0}
            className={`h-12 flex-1 rounded-full font-semibold shadow-brand transition ${
              selectionErrors.length
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary-hover"
            }`}
          >
            {selectionErrors.length ? selectionErrors[0] : `Add to basket · ${money(unit * qty)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
