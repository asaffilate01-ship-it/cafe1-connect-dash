import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { lookupVoucher, optInWithJurorId } from "@/lib/vouchers.functions";
import { verifyJurorAttendance } from "@/lib/juror-attendance.functions";
import {
  JUROR_CODE_KEY,
  JUROR_DAILY_ALLOWANCE_CENTS,
  JUROR_EXTENDED_DAY_ALLOWANCE_CENTS,
  JUROR_FOOD_DISCOUNT_PERCENT,
} from "@/lib/juror";
import { money } from "@/lib/format";
import { PagePasswordGate } from "@/components/page-password-gate";
import { toast } from "sonner";
import {
  ShieldCheck,
  Ticket,
  Clock,
  UtensilsCrossed,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Leaf,
  ArrowRight,
  Server,
  Lock,
  KeyRound,
  Eye,
} from "lucide-react";

export { JUROR_CODE_KEY };

function GatedJurorPage() {
  return (
    <PagePasswordGate storageKey="cafe1.juror.gate" title="Juror Voucher Scheme">
      <JurorPage />
    </PagePasswordGate>
  );
}

export const Route = createFileRoute("/juror")({
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s.code === "string" ? s.code : undefined,
    src: typeof s.src === "string" ? s.src : undefined,
    attendance:
      typeof s.attendance === "string" && /^[a-f0-9]{48}$/.test(s.attendance)
        ? s.attendance
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Juror Voucher Scheme — Café 1, St Albans Crown Court" },
      {
        name: "description",
        content:
          "Opt into the Café 1 Juror Voucher Scheme with your HMCTS Juror ID, get your one-time six-digit PIN, check today's £5.71 allowance and order from the dedicated Juror Menu for collection or jury room delivery.",
      },
      { property: "og:title", content: "Juror Voucher Scheme — Café 1, St Albans Crown Court" },
      {
        property: "og:description",
        content:
          "Opt in with your HMCTS Juror ID, receive a one-time six-digit PIN, and get a daily allowance plus 10% off food above it at Café 1.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GatedJurorPage,
});

type Balance = Extract<Awaited<ReturnType<typeof lookupVoucher>>, { found: true }>;

function JurorPage() {
  const { code: codeParam, src, attendance } = Route.useSearch();
  const lookup = useServerFn(lookupVoucher);
  const optIn = useServerFn(optInWithJurorId);
  const verifyAttendance = useServerFn(verifyJurorAttendance);

  const [mode, setMode] = useState<"opt-in" | "balance">("opt-in");
  const [optInId, setOptInId] = useState(codeParam ?? "");
  const [issuedPin, setIssuedPin] = useState<{ code: string; pin: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [input, setInput] = useState(codeParam ?? "");
  const [pin, setPin] = useState("");
  const [balance, setBalance] = useState<Balance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [optingIn, setOptingIn] = useState(false);
  const [attendanceResult, setAttendanceResult] = useState<{
    ok: boolean;
    message?: string;
    room?: string;
    verified_until?: string;
  } | null>(null);
  const attendanceAttempted = useRef(false);

  async function check(raw?: string) {
    const code = (raw ?? input).trim().toUpperCase();
    if (!code || !/^\d{6}$/.test(pin)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await lookup({ data: { code, pin } });
      if (!res.found) {
        setBalance(null);
        setError(
          ("message" in res && res.message) ||
            "Sorry, that Juror ID and PIN weren't recognised. Please double-check them, or ask the Café 1 team if you need your PIN reset.",
        );
      } else {
        setBalance(res);
        if (attendance && !attendanceAttempted.current) {
          attendanceAttempted.current = true;
          const verified = await verifyAttendance({
            data: { token: attendance, voucher_code: code, voucher_pin: pin },
          });
          setAttendanceResult(verified);
          if (verified.ok) {
            toast.success(`Attendance confirmed for ${verified.room ?? "this room"}`);
            const refreshed = await lookup({ data: { code, pin } });
            if (refreshed.found) setBalance(refreshed);
          } else toast.error(verified.message ?? "This attendance QR could not be verified");
        }
      }
    } catch {
      setError("We couldn't check that code just now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // One-time PIN reveal: 60 seconds on screen, then it is gone for good.
  useEffect(() => {
    if (!issuedPin) return;
    setSecondsLeft(60);
    const timer = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(timer);
          setIssuedPin(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [issuedPin]);

  // Fraud control: codes are never stored on the device. Only a code passed
  // in the scanned link is pre-filled; purge anything older builds saved.
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.removeItem(JUROR_CODE_KEY);
    if (codeParam) {
      setInput(codeParam.toUpperCase());
      setOptInId(codeParam.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function join() {
    const code = optInId.trim().toUpperCase();
    if (!code) return;
    setOptingIn(true);
    setError(null);
    try {
      const res = await optIn({
        data: {
          code,
          source: src === "till" ? "till" : src === "jury_room" ? "jury_room" : "online",
        },
      });
      if (res.ok && res.pin) {
        setIssuedPin({ code, pin: res.pin });
        setInput(code);
      } else if (res.ok && res.already) {
        toast.message(res.message ?? "You're already opted in.");
        setMode("balance");
        setInput(code);
      } else {
        const message = res.message ?? "That Juror ID could not be checked. Please try again.";
        setError(message);
        toast.error(message);
      }
    } finally {
      setOptingIn(false);
    }
  }

  function closePinReveal() {
    setIssuedPin(null);
    setMode("balance");
    toast.success("Keep your Juror ID and PIN safe — you'll need both to order.");
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        {/* hero */}
        <section className="border-b border-border bg-primary text-primary-foreground">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-black uppercase tracking-widest">
              <ShieldCheck className="h-4 w-4" /> HMCTS juror scheme
            </span>
            <h1 className="mt-4 font-display text-4xl font-black leading-tight sm:text-5xl">
              Café 1 Juror Voucher Scheme
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-primary-foreground/85">
              A {money(JUROR_DAILY_ALLOWANCE_CENTS)} allowance for every sitting day of your jury
              service, redeemable at Café 1 inside St Albans Crown Court. Your voucher is your HMCTS
              Juror ID — we never see your name, email or any other personal details.
            </p>
            <Link
              to="/juror-demo"
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-white/15 px-5 font-bold text-primary-foreground hover:bg-white/25"
            >
              See how the whole scheme works <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* code panel */}
        <section className="mx-auto -mt-8 max-w-3xl px-4">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-8">
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1 text-sm font-bold">
              <button
                type="button"
                onClick={() => setMode("opt-in")}
                className={`h-10 rounded-xl ${mode === "opt-in" ? "bg-card shadow" : "text-muted-foreground"}`}
              >
                Opt in with your Juror ID
              </button>
              <button
                type="button"
                onClick={() => setMode("balance")}
                className={`h-10 rounded-xl ${mode === "balance" ? "bg-card shadow" : "text-muted-foreground"}`}
              >
                Already opted in
              </button>
            </div>

            {mode === "opt-in" ? (
              <div>
                <label
                  htmlFor="juror-id"
                  className="text-xs font-black uppercase tracking-widest text-muted-foreground"
                >
                  Your HMCTS Juror ID
                </label>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enter the Juror ID the court gave you. We&apos;ll create a six-digit PIN for you
                  and show it once, for 60 seconds. Write it down — after that it is stored only as
                  a secure hash and nobody, including us, can read it back.
                </p>
                <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <strong>Please read before opting in.</strong> Joining the voucher scheme means
                  you take your food and drink through Café 1 for the rest of your jury service and{" "}
                  <strong>will not claim HMCTS subsistence expenses</strong> during that time. It is
                  one or the other — you cannot use both.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    id="juror-id"
                    value={optInId}
                    onChange={(e) => {
                      setOptInId(e.target.value.toUpperCase());
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void join();
                    }}
                    placeholder="JUROR ID"
                    className="h-12 rounded-xl border border-border bg-background px-4 font-mono text-lg uppercase tracking-wider outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => void join()}
                    disabled={optingIn || optInId.trim().length < 3}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-bold text-primary-foreground disabled:opacity-50"
                  >
                    {optingIn ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    Confirm opt in
                  </button>
                </div>
                {error && (
                  <p className="mt-3 inline-flex items-start gap-2 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                  </p>
                )}
              </div>
            ) : (
              <>
            <label
              htmlFor="juror-code"
              className="text-xs font-black uppercase tracking-widest text-muted-foreground"
            >
              Your Juror ID
            </label>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_150px_auto]">
              <input
                id="juror-code"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value.toUpperCase());
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void check();
                }}
                placeholder="JUROR ID"
                className="h-12 flex-1 rounded-xl border border-border bg-background px-4 font-mono text-lg uppercase tracking-wider outline-none focus:border-primary"
              />
              <input
                aria-label="Six-digit voucher PIN"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void check();
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6-digit PIN"
                className="h-12 rounded-xl border border-border bg-background px-4 text-center font-mono text-lg tracking-widest outline-none focus:border-primary"
              />
              <button
                onClick={() => void check()}
                disabled={busy || !input.trim() || pin.length !== 6}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Ticket className="h-4 w-4" />
                )}{" "}
                Check balance
              </button>
            </div>
            {error && (
              <p className="mt-3 inline-flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            )}
            {attendance && !balance && !error && (
              <p className="mt-3 text-sm text-muted-foreground">
                Enter your Juror ID and PIN to finish the one-time attendance check.
              </p>
            )}

            {attendanceResult && (
              <div
                className={`mt-4 rounded-xl border p-4 text-sm ${
                  attendanceResult.ok
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-amber-300 bg-amber-50 text-amber-900"
                }`}
                role="status"
              >
                <p className="font-semibold">
                  {attendanceResult.ok
                    ? `Attendance confirmed${attendanceResult.room ? ` · ${attendanceResult.room}` : ""}`
                    : "Attendance QR not accepted"}
                </p>
                <p className="mt-1">
                  {attendanceResult.ok
                    ? "Only your anonymous voucher reference and approved room are recorded."
                    : (attendanceResult.message ?? "Ask the Jury Officer to display a fresh QR.")}
                </p>
              </div>
            )}

            {balance && (
              <div className="mt-6 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat label="Today's allowance" value={money(balance.allocated_cents)} />
                  <Stat label="Used today" value={money(balance.used_cents)} />
                  <Stat label="Left today" value={money(balance.remaining_cents)} highlight />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1">
                    <Clock className="h-3.5 w-3.5" />
                    Valid until{" "}
                    {balance.valid_until
                      ? new Date(balance.valid_until).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                  {balance.jury_room && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1">
                      <Building2 className="h-3.5 w-3.5" /> {balance.jury_room}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${balance.opted_in ? "bg-emerald-100 text-emerald-800" : "bg-muted"}`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />{" "}
                    {balance.opted_in ? "Opted in" : "Not yet opted in"}
                  </span>
                  {balance.attendance_required && (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${balance.attendance_verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      {balance.attendance_verified
                        ? "Attendance confirmed today"
                        : "Attendance scan required for online use"}
                    </span>
                  )}
                </div>

                {balance.message && (
                  <p className="rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                    {balance.message}
                  </p>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                  <Link
                    to="/jury-menu"
                    search={{ code: balance.code } as never}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-primary font-bold text-primary hover:bg-primary/5"
                  >
                    <UtensilsCrossed className="h-4 w-4" /> Jury Only Menu
                  </Link>
                  <Link
                    to="/menu"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border font-bold hover:border-primary"
                  >
                    Order to my jury room <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your allowance is applied automatically at the checkout and at the till. Anything
                  above it is paid by you — with {JUROR_FOOD_DISCOUNT_PERCENT}% off food as a scheme
                  member.
                </p>
              </div>
            )}
              </>
            )}
          </div>
        </section>

        {issuedPin && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pin-reveal-title"
              className="w-full max-w-md rounded-3xl border border-border bg-card p-6 text-center shadow-2xl"
            >
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground">
                <KeyRound className="h-6 w-6" />
              </div>
              <h2 id="pin-reveal-title" className="mt-4 font-display text-2xl font-black">
                Write this PIN down now
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Juror ID <span className="font-mono font-bold">{issuedPin.code}</span>
              </p>
              <p className="mt-5 font-mono text-5xl font-black tracking-[0.35em] text-primary">
                {issuedPin.pin}
              </p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 text-sm font-bold">
                <Eye className="h-4 w-4" /> Hidden in {secondsLeft}s
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                This PIN is shown once and once only. From now on it is held as a cryptographic hash
                — it cannot be displayed again by anyone. If you lose it, a member of the Café 1
                team can issue you a replacement.
              </p>
              <button
                onClick={closePinReveal}
                className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground"
              >
                <CheckCircle2 className="h-4 w-4" /> OK — I&apos;ve written it down
              </button>
            </div>
          </div>
        )}

        {/* how it works */}
        <section className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="font-display text-3xl font-black">How the scheme works</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Card icon={Ticket} title="1. Your HMCTS Juror ID">
              The Jury Office sends us only the Juror IDs of the jurors attending — no names, emails
              or phone numbers. We activate each ID as its voucher code for exactly 12 weeks. It
              cannot be used on a weekend or public holiday. Your Juror ID is the one HMCTS already
              gave you, and only HMCTS can match it to you.
            </Card>
            <Card icon={KeyRound} title="2. Opt in and get your PIN">
              Scan the QR code on your information sheet, in the jury room, or at the Café 1
              counter. Enter your Juror ID and confirm you want to opt in. The system creates a
              six-digit PIN and shows it for 60 seconds — write it down, press OK, and it is never
              displayed again. Opting in means you take the voucher scheme instead of claiming HMCTS
              subsistence expenses for the rest of your service — one or the other, never both.
            </Card>
            <Card icon={UtensilsCrossed} title="3. Use it daily">
              {money(JUROR_DAILY_ALLOWANCE_CENTS)} each sitting day, usable across as many purchases
              as you like. Unused value expires at the end of the day and can&apos;t be carried over
              or exchanged for cash.
            </Card>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Card icon={Leaf} title="Dedicated Juror Menu">
              Hot meals, cold meals, sandwiches and baguettes, vegetarian options, snacks and hot
              and cold drinks — with daily and weekly Juror Offers that change regularly. The Juror
              Menu is open to all jurors, whether or not you join the scheme.
            </Card>
            <Card icon={Building2} title="Sitting in the Magistrates' Court?">
              Scan the QR code in the jury room to order online, enter your Juror ID and PIN, choose
              your jury room and a delivery time. We&apos;ll bring it to you.
            </Card>
            <Card icon={UtensilsCrossed} title="Dietary requirements & allergies">
              Tell us in the notes box when you order, or speak to us at the counter, and we&apos;ll
              make every reasonable effort to have suitable options available throughout your
              service.
            </Card>
            <Card icon={ShieldCheck} title="Fully auditable">
              Every redemption records the voucher reference, date, time, receipt number, amount
              redeemed and any balance you paid — so HMCTS receives a single, fully reconciled
              claim.
            </Card>
            <Card icon={Server} title="Secure hosting">
              The system runs on AWS cloud infrastructure in the UK/EEA with managed patching,
              encryption in transit and at rest, automated backups, row-level database access
              control and an immutable audit log. Admin accounts use two-factor authentication and
              your PIN is only ever stored as a cryptographic hash.
            </Card>
            <Card icon={Lock} title="Safe card payments">
              Anything above your allowance is taken through SumUp, an FCA-authorised, PCI DSS
              compliant payment gateway with 3-D Secure and tokenised Apple Pay and Google Pay.
              Café 1 never sees or stores your card details.
            </Card>
            <Card icon={Clock} title="Long court days">
              If the Jury Officer confirms that attendance exceeded 10 hours, a manager can raise
              that day&apos;s food-and-drink allowance to{" "}
              {money(JUROR_EXTENDED_DAY_ALLOWANCE_CENTS)}. It cannot be increased by the juror or
              ordinary till staff.
            </Card>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-4 ${highlight ? "border-primary bg-primary/5" : "border-border"}`}
    >
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-2xl font-black tabular-nums ${highlight ? "text-primary" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Ticket;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <Icon className="h-6 w-6 text-primary" />
      <h3 className="mt-3 font-display text-lg font-bold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
