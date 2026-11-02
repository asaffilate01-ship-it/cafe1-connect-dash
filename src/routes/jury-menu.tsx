import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { GatedMenuList } from "@/components/gated-menu-list";
import { OrderSetupGate } from "@/components/order-setup-gate";
import { getJurorDailyStatus, verifyJurorIdForMenu } from "@/lib/vouchers.functions";
import { jurySession, useJurySession } from "@/lib/jury-session";
import { orderContext, useOrderContext } from "@/lib/order-context";
import { JUROR_APPROVED_ROOMS, JUROR_DAILY_ALLOWANCE_CENTS } from "@/lib/juror";
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
          "Juror ID unlocks the private Jury Only menu at Café 1; a private PIN is needed to spend a voucher. Meals are provided in approved court jury areas only.",
      },
      { property: "og:title", content: "Jury Only Menu — Café 1, St Albans" },
      {
        property: "og:description",
        content:
          "Juror ID to browse, ID and PIN to redeem. Jury Lounges and Jury Rooms at St Albans courts only.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JuryMenuPage,
});

const ROOMS = JUROR_APPROVED_ROOMS;

function JuryMenuPage() {
  const { code: codeParam, room: roomParam } = Route.useSearch();
  const session = useJurySession();
  const verifyJurorId = useServerFn(verifyJurorIdForMenu);
  const dailyStatus = useServerFn(getJurorDailyStatus);
  const [todayBalance, setTodayBalance] = useState<null | { used_cents: number; remaining_cents: number; opted_in_today: boolean }>(null);

  const [code, setCode] = useState((codeParam ?? "").toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctx = useOrderContext();
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    if (!session?.code) { setTodayBalance(null); return; }
    let cancelled = false;
    void dailyStatus({ data: { code: session.code } }).then((result) => {
      if (!cancelled && result.found) setTodayBalance(result);
    }).catch(() => { if (!cancelled) setTodayBalance(null); });
    return () => { cancelled = true; };
  }, [session?.code, dailyStatus]);

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

  function chooseFulfilment(kind: "lounge_counter" | (typeof ROOMS)[number]["id"]) {
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
              Need your daily allowance or spending PIN?{" "}
              <Link
                to="/juror"
                search={{ src: "jury_room", code: undefined, attendance: undefined }}
                className="font-semibold text-primary"
              >
                View today's balance
              </Link>{" "}
              or set up your PIN. Viewing this menu does not opt you in for today.{" "}
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
            Meals are provided <strong>only</strong> in the Jury Lounges and Jury Rooms at
            St Albans Crown Court and St Albans Magistrates' Court.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            {session.code ? (
              <span className="rounded-full bg-white/15 px-3 py-1 font-mono">{session.code}</span>
            ) : null}
            <span className="rounded-full bg-white/15 px-3 py-1 font-semibold">
              {todayBalance
                ? (todayBalance.opted_in_today ? "Used scheme today · " : "Not used today · ") +
                  money(todayBalance.remaining_cents) + " available"
                : "Juror ID verified"}
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
            Entering your Juror ID or viewing the menu does not opt you in. Use your
            allowance on an eligible sitting day and you participate for that day only.
            You can see used and available amounts on the juror page. The standard daily
            allowance is {money(JUROR_DAILY_ALLOWANCE_CENTS)}; a separate PIN is used to secure redemption.
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
              Order for the Jury Lounge; ask Café 1 staff about payment
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