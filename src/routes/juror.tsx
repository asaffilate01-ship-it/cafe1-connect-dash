import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getJurorDailyStatus, lookupVoucher, optInWithJurorId } from "@/lib/vouchers.functions";
import { verifyJurorAttendance } from "@/lib/juror-attendance.functions";
import { JUROR_CODE_KEY, JUROR_DAILY_ALLOWANCE_CENTS, JUROR_FOOD_DISCOUNT_PERCENT } from "@/lib/juror";
import { money } from "@/lib/format";
import officialLogo from "@/assets/cafe1-logo.webp";
import {
  AlertCircle, ArrowRight, CheckCircle2, Clock3, KeyRound, Loader2,
  ShieldCheck, Ticket, UtensilsCrossed, X,
} from "lucide-react";

export { JUROR_CODE_KEY };

export const Route = createFileRoute("/juror")({
  validateSearch: (query: Record<string, unknown>) => ({
    code: typeof query.code === "string" ? query.code : undefined,
    src: typeof query.src === "string" ? query.src : undefined,
    attendance: typeof query.attendance === "string" && /^[a-f0-9]{48}$/.test(query.attendance)
      ? query.attendance : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Your daily juror meal allowance | Café 1 St Albans" },
      { name: "description", content:
        "Enter your Juror ID to view today's available £5.71 allowance, amount used and juror-only menu. Choosing a meal voucher opts you in for that day only." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: JurorPage,
});

type Daily = Extract<Awaited<ReturnType<typeof getJurorDailyStatus>>, { found: true }>;

const STATUS_TEXT: Record<string, string> = {
  inactive: "This Juror ID is inactive. Ask the Café 1 team for help.",
  not_started: "This Juror ID is not active for today's sitting.",
  expired: "This Juror ID's activation has ended. Ask Café 1 staff.",
  non_sitting_day: "The allowance only applies on eligible court sitting days.",
};

function JurorPage() {
  const { code: queryCode, src, attendance } = Route.useSearch();
  const getDaily = useServerFn(getJurorDailyStatus);
  const setupPin = useServerFn(optInWithJurorId);
  const lookup = useServerFn(lookupVoucher);
  const verifyAttendance = useServerFn(verifyJurorAttendance);
  const [code, setCode] = useState((queryCode ?? "").toUpperCase());
  const [daily, setDaily] = useState<Daily | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pin, setPin] = useState("");
  const [issued, setIssued] = useState<{ code: string; pin: string } | null>(null);
  const [seconds, setSeconds] = useState(60);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [attendanceMessage, setAttendanceMessage] = useState<string | null>(null);
  const attendanceConsumed = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.removeItem(JUROR_CODE_KEY);
  }, []);

  useEffect(() => {
    if (!issued) return;
    setSeconds(60);
    const id = window.setInterval(() => {
      setSeconds((remaining) => {
        if (remaining <= 1) {
          window.clearInterval(id);
          setIssued(null);
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [issued]);

  async function checkBalance() {
    const id = code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,40}$/.test(id)) {
      setIssueError("Enter the Juror ID exactly as provided by the Jury Office.");
      return;
    }
    setBusy(true); setIssueError(null); setDaily(null); setPinMessage(null);
    try {
      const response = await getDaily({ data: { code: id } });
      if (!response.found) {
        setIssueError(response.message ?? "Juror ID could not be verified.");
      } else {
        setDaily(response);
      }
    } catch {
      setIssueError("We couldn't check today's balance. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function registerPin() {
    if (!daily) return;
    setPinBusy(true); setIssueError(null);
    try {
      const result = await setupPin({
        data: { code: daily.code,
          source: src === "till" ? "till" : src === "jury_room" ? "jury_room" : "online" },
      });
      if (result.ok && result.pin) {
        setIssued({ code: daily.code, pin: result.pin });
      } else if (result.ok && result.already) {
        setPinMessage("Your PIN is already set. Enter it below when you wish to redeem the allowance.");
      } else {
        setIssueError(result.message ?? "Could not set up the spending PIN.");
      }
    } catch {
      setIssueError("PIN setup is unavailable. Please ask Café 1 staff.");
    } finally {
      setPinBusy(false);
    }
  }

  async function confirmPinAndAttendance() {
    if (!daily || !/^\d{6}$/.test(pin)) return;
    setPinBusy(true); setIssueError(null); setPinMessage(null);
    try {
      const response = await lookup({ data: { code: daily.code, pin } });
      if (!response.found) {
        setIssueError("That PIN could not be verified. Ask Café 1 staff if you need a reset.");
        return;
      }
      setPinMessage(response.message ?? "PIN verified. You may use it at checkout.");
      if (attendance && !attendanceConsumed.current) {
        attendanceConsumed.current = true;
        const checked = await verifyAttendance({
          data: { token: attendance, voucher_code: daily.code, voucher_pin: pin },
        });
        setAttendanceMessage(checked.ok
          ? "Jury-room attendance verified for today's online voucher use."
          : checked.message ?? "This room's attendance QR could not be verified.");
      }
      const updated = await getDaily({ data: { code: daily.code } });
      if (updated.found) setDaily(updated);
    } catch {
      setIssueError("We couldn't check the PIN right now.");
    } finally {
      setPinBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-primary px-4 pb-16 pt-10 text-primary-foreground">
          <div className="mx-auto max-w-5xl">
            <div className="mb-5 inline-flex items-center rounded-2xl bg-white p-2">
              <img src={officialLogo} alt="Official Café 1 logo" className="h-20 w-20 object-contain" />
            </div>
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em]">
              <ShieldCheck className="h-4 w-4" /> Café 1 · St Albans courts
            </span>
            <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold sm:text-5xl">
              Your juror meal allowance
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-primary-foreground/90 sm:text-lg">
              Your Juror ID opens the juror-only menu and shows how much of today's
              { " " }{money(JUROR_DAILY_ALLOWANCE_CENTS)} allowance is available.
              <strong> You only participate on a day you actually use the meal voucher.</strong>
              Browsing the menu or checking a balance makes no claim.
            </p>
          </div>
        </section>

        <section className="mx-auto -mt-9 max-w-4xl px-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-xl sm:p-8">
            <h2 className="font-display text-2xl font-bold">1. Enter your Juror ID</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Café 1 staff will explain the scheme and provide a printed guide when you attend court.
              There is no daily opt-in or opt-out form.
            </p>
            <form onSubmit={(event) => { event.preventDefault(); void checkBalance(); }}
              className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="sr-only" htmlFor="juror-lookup-id">Juror ID</label>
              <input id="juror-lookup-id" value={code}
                autoComplete="off" autoCapitalize="characters" spellCheck={false}
                maxLength={40}
                onChange={(event) => { setCode(event.target.value.toUpperCase()); setDaily(null); setIssueError(null); }}
                placeholder="Your Juror ID"
                className="h-12 rounded-xl border border-border bg-background px-4 font-mono text-lg outline-none focus-visible:ring-2 focus-visible:ring-primary" />
              <button disabled={busy || code.trim().length < 3}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
                View daily allowance
              </button>
            </form>
            {issueError && <p role="alert" className="mt-4 flex items-start gap-2 text-sm font-semibold text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />{issueError}
            </p>}

            {daily && (
              <div className="mt-6 space-y-5" aria-live="polite">
                <div className="grid gap-3 sm:grid-cols-3">
                  <BalanceStat label="Today's allowance" value={money(daily.allocated_cents)} />
                  <BalanceStat label="Used today" value={money(daily.used_cents)} />
                  <BalanceStat label="Available now" value={money(daily.remaining_cents)} highlight />
                </div>
                {daily.held_cents > 0 && <p className="text-xs text-muted-foreground">
                  {money(daily.held_cents)} is temporarily reserved for orders awaiting payment.
                </p>}
                {daily.status !== "ok" ? (
                  <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                    {STATUS_TEXT[daily.status] ?? "The allowance is not currently available."}
                  </p>
                ) : (
                  <>
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {daily.opted_in_today
                        ? <><CheckCircle2 className="h-5 w-5 text-emerald-600" /> You have used the scheme today.</>
                        : <><Clock3 className="h-5 w-5 text-primary" /> You have not used the scheme today.</>}
                    </p>
                    <Link to="/jury-menu" search={{ code: daily.code, room: undefined }}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground hover:bg-primary-hover">
                      <UtensilsCrossed className="h-5 w-5" /> Open your juror-only meal menu <ArrowRight className="h-4 w-4" />
                    </Link>
                    <div className="rounded-2xl border border-border bg-muted/30 p-4 sm:p-5">
                      <h3 className="font-display text-lg font-bold">2. Private PIN for voucher redemption</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Your ID is all you need to view your menu and balance. For security, a
                        six-digit PIN is needed when spending the voucher online or at the till.
                        Setting up your PIN does <strong>not</strong> opt you in for the day.
                      </p>
                      <button type="button" disabled={pinBusy} onClick={() => void registerPin()}
                        className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-primary px-4 text-sm font-bold text-primary disabled:opacity-50">
                        <KeyRound className="h-4 w-4" /> Set up / check spending PIN
                      </button>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <label className="sr-only" htmlFor="juror-pin">Your six-digit PIN</label>
                        <input id="juror-pin" value={pin} inputMode="numeric" type="password"
                          autoComplete="off" maxLength={6}
                          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder="6-digit PIN"
                          className="h-11 w-48 rounded-xl border border-border bg-background px-4 text-center font-mono text-lg tracking-widest" />
                        <button type="button" disabled={pinBusy || pin.length !== 6}
                          onClick={() => void confirmPinAndAttendance()}
                          className="h-11 rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:opacity-50">
                          {pinBusy ? "Checking…" : attendance ? "Verify PIN & room QR" : "Verify PIN"}
                        </button>
                      </div>
                      {pinMessage && <p role="status" className="mt-3 text-sm text-emerald-700">{pinMessage}</p>}
                      {attendanceMessage && <p role="status" className="mt-3 rounded-xl border border-border bg-card p-3 text-sm">{attendanceMessage}</p>}
                      {attendance && <p className="mt-3 text-xs text-muted-foreground">
                        You scanned a rotating Jury Room attendance QR. Complete the PIN check before it expires.
                      </p>}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">How your daily meal works</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <GuideCard n="1" heading="Receive your guide">
              Café 1 staff explain the choice and hand you the juror guide at court.
            </GuideCard>
            <GuideCard n="2" heading="Browse with your Juror ID">
              On your phone, the website or a jury lounge tablet, view your balance and special menu.
            </GuideCard>
            <GuideCard n="3" heading="Choose your meal">
              Hot, cold and vegetarian options are available, with selected meals around £5.71.
            </GuideCard>
            <GuideCard n="4" heading="Use the voucher today">
              Redeeming a voucher is your choice to use the scheme for that day only.
              Nothing is claimed on days you do not use it.
            </GuideCard>
            <GuideCard n="5" heading="Pay any amount above £5.71">
              Your allowance is used first. Any remainder is payable by you;
              { " " }{JUROR_FOOD_DISCOUNT_PERCENT}% off applies to eligible non-beverage food.
            </GuideCard>
            <GuideCard n="6" heading="Eat in an approved jury area">
              Meals are provided only in Jury Lounges and Jury Rooms at St Albans Crown Court
              or St Albans Magistrates' Court.
            </GuideCard>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Unused daily allowance cannot be exchanged for cash, carried forward or claimed by Café 1.
            Please follow the Jury Officer's approved guidance about claiming HMCTS expenses on any
            day you use a Café 1 voucher. Court scheme arrangements require local approval.
          </p>
        </section>
      </main>
      <SiteFooter />
      {issued && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="new-juror-pin-title"
            className="w-full max-w-md rounded-3xl bg-card p-6 text-center shadow-2xl">
            <h2 id="new-juror-pin-title" className="font-display text-2xl font-bold">
              Your private spending PIN
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Write this PIN down. It is shown once, for 60 seconds.
            </p>
            <p className="mt-5 font-mono text-5xl font-bold tracking-[0.25em] text-primary">{issued.pin}</p>
            <p className="mt-3 text-sm font-bold">Hidden in {seconds}s</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Setting up a PIN does not claim today's allowance. Participation begins only
              when a funded meal voucher is successfully redeemed.
            </p>
            <button type="button" onClick={() => setIssued(null)}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground">
              <X className="h-4 w-4" /> I have noted my PIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BalanceStat({label,value,highlight=false}:{label:string;value:string;highlight?:boolean}) {
  return (
    <div className={highlight ? "rounded-2xl border border-primary bg-primary/5 p-4" : "rounded-2xl border border-border p-4"}>
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function GuideCard({n,heading,children}:{n:string;heading:string;children:React.ReactNode}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-primary font-bold text-primary-foreground">{n}</span>
      <h3 className="mt-4 font-display text-xl font-bold">{heading}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </article>
  );
}
