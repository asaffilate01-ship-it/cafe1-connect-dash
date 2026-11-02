import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { GatedMenuList } from "@/components/gated-menu-list";
import { OrderSetupGate } from "@/components/order-setup-gate";
import { verifyJurorIdForMenu } from "@/lib/vouchers.functions";
import { jurySession, useJurySession } from "@/lib/jury-session";
import { orderContext, useOrderContext } from "@/lib/order-context";
import { JUROR_DELIVERY_VENUES, JUROR_DAILY_ALLOWANCE_CENTS } from "@/lib/juror";
import { money } from "@/lib/format";
import { ShieldCheck, Lock, LogOut, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/jury-menu")({
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s.code === "string" ? s.code : undefined,
    room: typeof s.room === "string" ? s.room : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Jury Only Menu — Café 1, St Albans" },
      {
        name: "description",
        content:
          "Private Jury Only menu at Café 1. Verify your HMCTS Juror ID to browse, and enter your separate PIN if spending a voucher. Collection and approved court-room delivery.",
      },
      { property: "og:title", content: "Jury Only Menu — Café 1, St Albans" },
      {
        property: "og:description",
        content:
          "Gated juror menu — Juror ID to browse; ID and PIN to redeem any allowance. Collection or approved court-room delivery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JuryMenuPage,
});

const ROOMS = [
  {
    id: "crown-lounge",
    label: "Main Jury Lounge — St Albans Crown Court",
    venue: JUROR_DELIVERY_VENUES[0],
  },
  {
    id: "crown-rooms",
    label: "Jury Rooms — St Albans Crown Court",
    venue: JUROR_DELIVERY_VENUES[0],
  },
  {
    id: "magistrates-rooms",
    label: "Jury Rooms — St Albans Magistrates' Court",
    venue: JUROR_DELIVERY_VENUES[1],
  },
] as const;

function JuryMenuPage() {
  const { code: codeParam, room: roomParam } = Route.useSearch();
  const session = useJurySession();
  const verifyJurorId = useServerFn(verifyJurorIdForMenu);

  const [code, setCode] = useState((codeParam ?? "").toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctx = useOrderContext();
  const [gateOpen, setGateOpen] = useState(false);

  // As soon as the Jury Only menu unlocks, ask how they'd like their order.
  useEffect(() => {
    if (session && !ctx) setGateOpen(true);
  }, [session, ctx]);

  const jurorFilter = useCallback((item: { juror_menu: boolean }) => item.juror_menu, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await verifyJurorId({ data: { code: code.trim().toUpperCase() } });
      if (!res.ok || !res.code) {
        setError(res.message || "That Juror ID wasn't recognised. Please check it and try again.");
        return;
      }
      jurySession.set({
        code: res.code,
        juror_id: res.code,
        opted_in: res.opted_in,
        remaining_cents: 0,
        jury_room: roomParam ?? null,
        verified_at: Date.now(),
      });
      toast.success("Verified — this is the Jury Only menu");
    } catch {
      setError("We couldn't check that Juror ID just now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function chooseFulfilment(kind: "collection" | "lounge_counter" | (typeof ROOMS)[number]["id"]) {
    if (kind === "collection") {
      orderContext.set({ mode: "collection", schedule_mode: "asap" });
      toast.success("Collection from Café 1");
      return;
    }
    if (kind === "lounge_counter") {
      orderContext.set({
        mode: "dine_in",
        schedule_mode: "asap",
        jury_room: ROOMS[0].label,
      });
      toast.success("Eating in the Jury Lounge — pay at the counter");
      return;
    }
    const room = ROOMS.find((r) => r.id === kind)!;
    orderContext.set({
      mode: "delivery",
      schedule_mode: "asap",
      postcode: room.venue.postcode,
      jury_room: room.label,
    });
    toast.success(`Delivery to the ${room.label}`);
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-md px-4 py-14">
          <div className="rounded-3xl border border-border bg-card p-8 shadow-brand">
            <div className="mb-5 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground">
              <Lock className="h-6 w-6" />
            </div>
            <p className="text-xs font-black uppercase tracking-[.25em] text-primary">
              Jury only menu
            </p>
            <h1 className="mt-2 font-display text-3xl font-black">Confirm you're a juror</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You've scanned the Jury Lounge QR code. This menu is only for jurors serving at St
              Albans. Enter the HMCTS Juror ID on your summons or jury sheet to open it. We never
              see your name or any personal details — no PIN is needed just to browse and order.
            </p>
            <form onSubmit={verify} className="mt-6 space-y-3">
              <input
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="JUROR ID"
                className="h-14 w-full rounded-2xl border border-border bg-background px-4 text-center font-mono text-xl tracking-[0.3em]"
              />
              {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
              <button
                disabled={busy}
                className="h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground shadow-brand disabled:opacity-60"
              >
                {busy ? "Checking…" : "Open the Jury Only menu"}
              </button>
            </form>
            <p className="mt-5 text-center text-xs text-muted-foreground">
              Your Juror ID isn't on the scheme yet?{" "}
              <Link
                to="/juror"
                search={{ src: "jury_room", code: undefined, attendance: undefined }}
                className="font-semibold text-primary"
              >
                Opt in here
              </Link>{" "}
              for the £5.71 daily allowance and 10% off food. Ordering in the Jury Lounge? You can
              simply pay at the Café 1 counter.{" "}
              <Link to="/menu" className="font-semibold text-primary">
                Not a juror? Main menu
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="border-b border-border bg-primary px-4 py-8 text-primary-foreground">
        <div className="mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-black uppercase tracking-widest">
            <ShieldCheck className="h-4 w-4" /> Jury only menu
          </span>
          <h1 className="mt-3 font-display text-4xl font-black leading-tight">
            JURY ONLY MENU — Café 1
          </h1>
          <p className="mt-3 text-primary-foreground/85">
            Served or delivered <strong>only</strong> to the Jury Lounge at St Albans Crown Court or
            the Jury Rooms at St Albans Magistrates' Court — or collect at the Café 1 counter.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            {session.code ? (
              <span className="rounded-full bg-white/15 px-3 py-1 font-mono">{session.code}</span>
            ) : null}
            <span className="rounded-full bg-white/15 px-3 py-1 font-semibold">
              {session.opted_in
                ? "On the voucher scheme"
                : session.remaining_cents > 0
                  ? `${money(session.remaining_cents)} allowance left today`
                  : "Juror verified"}
            </span>
            <button
              type="button"
              onClick={() => {
                jurySession.clear();
                toast.message("Signed out of the Jury Only menu");
              }}
              className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 font-semibold hover:bg-white/25"
            >
              <LogOut className="h-3.5 w-3.5" /> Finish
            </button>
          </div>
          <p className="mt-3 text-xs text-primary-foreground/70">
            {session.opted_in
              ? `Daily allowance ${money(JUROR_DAILY_ALLOWANCE_CENTS)} on eligible sitting days, excluding weekends and bank holidays. Enter your Juror ID and PIN at checkout to apply it.`
              : "You're verified as a juror, so this menu is open. You're not on the voucher scheme yet, so there's no allowance or 10% food discount — opt in on the juror page, or simply pay at the counter."}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-5">
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          Where are you eating?
        </p>
        <button
          type="button"
          onClick={() => setGateOpen(true)}
          className="mt-2 inline-flex h-9 items-center rounded-full border border-primary px-4 text-xs font-bold text-primary hover:bg-primary/5"
        >
          {ctx ? "Change how you'd like your order" : "How would you like your order?"}
        </button>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => chooseFulfilment("lounge_counter")}
            className="rounded-2xl border-2 border-primary bg-primary/5 p-3 text-left text-sm font-semibold hover:bg-primary/10"
          >
            Eating in the Jury Lounge
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Order now, pay at the Café 1 counter
            </span>
          </button>
          <button
            type="button"
            onClick={() => chooseFulfilment("collection")}
            className="rounded-2xl border border-border bg-card p-3 text-left text-sm font-semibold hover:border-primary"
          >
            Collect at Café 1
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              St Albans Crown Court
            </span>
          </button>
          {ROOMS.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => chooseFulfilment(room.id)}
              className="rounded-2xl border border-border bg-card p-3 text-left text-sm font-semibold hover:border-primary"
            >
              <Building2 className="mb-1 h-4 w-4 text-primary" />
              {room.label}
            </button>
          ))}
        </div>
      </section>

      <GatedMenuList
        filter={jurorFilter}
        emptyMessage="The Jury Only menu is being updated. Please order at the Café 1 counter today."
      />

      <OrderSetupGate
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        dismissible={!!ctx}
        juryOnly
      />
    </div>
  );
}