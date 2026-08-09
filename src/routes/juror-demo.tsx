import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { money } from "@/lib/format";
import { PagePasswordGate } from "@/components/page-password-gate";
import {
  JUROR_DAILY_ALLOWANCE_CENTS,
  JUROR_FOOD_DISCOUNT_PERCENT,
  JUROR_EXTENDED_DAY_ALLOWANCE_CENTS,
} from "@/lib/juror";
import {
  ShieldCheck,
  Ticket,
  UtensilsCrossed,
  Printer,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Building2,
  Server,
} from "lucide-react";

export const Route = createFileRoute("/juror-demo")({
  head: () => ({
    meta: [
      { title: "Juror Voucher Scheme — Live Walkthrough for the Jury Officer" },
      {
        name: "description",
        content:
          "A step-by-step demonstration of the Café 1 Juror Voucher Scheme: activating HMCTS Juror IDs, opting in and issuing the one-time PIN, ordering, redeeming the £5.71 daily allowance and the nightly HMCTS claim report.",
      },
      { property: "og:title", content: "Juror Voucher Scheme — Live Walkthrough" },
      {
        property: "og:description",
        content:
          "Eight simulated screens showing the whole juror voucher journey end to end — printed juror sheets, opt-in, ordering, redemption, the nightly claim and system security — using demo data only.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GatedDemoPage,
});

function GatedDemoPage() {
  return (
    <PagePasswordGate storageKey="cafe1.juror-demo.gate" title="Juror Scheme Walkthrough">
      <DemoPage />
    </PagePasswordGate>
  );
}

const DEMO_CODE = "J-4821-7K9P";
const DEMO_PIN = "418 302";

type Step = {
  title: string;
  who: string;
  icon: typeof Ticket;
  say: string;
  screen: () => React.ReactNode;
};

const steps: Step[] = [
  {
    title: "1. The Jury Office sends us the Juror IDs",
    who: "Jury Officer",
    icon: Printer,
    say: "At least 24 hours before induction, the Jury Office sends us the HMCTS Juror IDs of the jurors attending, by an agreed secure method — a copy-and-paste list or CSV. No names, emails or phone numbers are sent. Each ID becomes that juror's voucher code for 12 weeks and cannot be used on weekends or public holidays. Only HMCTS can match an ID to a person. We also supply the information sheet and FAQs for the induction pack — it carries no PIN, so a mislaid sheet cannot be used without the assigned Juror ID, separate PIN and daily attendance check.",
    screen: () => (
      <div className="mx-auto max-w-sm rounded-2xl border-2 border-dashed border-border bg-white p-6 text-center shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Jury Office · secure Juror ID list
        </p>
        <div className="mt-4 space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-left font-mono text-sm">
          <p>{DEMO_CODE}</p>
          <p>J-4822-2M4T</p>
          <p>J-4823-9QX1</p>
          <p className="text-muted-foreground">…</p>
        </div>
        <p className="mt-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Juror ID = voucher code · valid 12 weeks
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Juror IDs only — no names, emails or phone numbers. Weekdays excluding public holidays ·{" "}
          {money(JUROR_DAILY_ALLOWANCE_CENTS)} each day.
        </p>
      </div>
    ),
  },
  {
    title: "2. The juror opts in and receives a one-time PIN",
    who: "Juror, on their phone or at the counter",
    icon: ShieldCheck,
    say: "The juror scans the QR code on their sheet, in the jury room or at the Café 1 counter. They enter their Juror ID — the one HMCTS already gave them — and confirm they want to opt in. The system then generates a unique six-digit PIN and shows it on screen for 60 seconds only. The juror writes it down and presses OK. From that moment the PIN exists nowhere in readable form: it is held solely as a cryptographic hash, so nobody — not Café 1, not an administrator, not HMCTS — can ever display it again. If a juror loses their PIN, a member of the Café 1 team issues a replacement, which is again shown once.",
    screen: () => (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-primary">
          Write this PIN down now
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Juror ID <span className="font-mono font-bold">{DEMO_CODE}</span>
        </p>
        <p className="mt-4 font-mono text-4xl font-black tracking-[0.3em] text-primary">
          {DEMO_PIN}
        </p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 text-xs font-bold">
          <Lock className="h-3.5 w-3.5" /> Hidden in 60s — shown once, then hashed
        </p>
        <div className="mt-4 flex h-11 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
          OK — I&apos;ve written it down
        </div>
      </div>
    ),
  },
  {
    title: "3. Juror ID and PIN are the login from then on",
    who: "Juror, on their phone",
    icon: Ticket,
    say: "From then on the Juror ID and the PIN together are the login for the scheme — both are needed, every single time, at the till and online. That keeps a mislaid sheet or an overheard ID useless on its own.",
    screen: () => (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          Your Juror ID
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_110px]">
          <div className="flex h-11 items-center rounded-xl border border-border px-3 font-mono text-sm">
            {DEMO_CODE}
          </div>
          <div className="flex h-11 items-center justify-center rounded-xl border border-border font-mono tracking-widest">
            ••••••
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Mini label="Allowance" value={money(JUROR_DAILY_ALLOWANCE_CENTS)} />
          <Mini label="Used today" value={money(0)} />
          <Mini label="Left today" value={money(JUROR_DAILY_ALLOWANCE_CENTS)} highlight />
        </div>
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> The Juror ID and PIN are never saved on the phone.
        </p>
      </div>
    ),
  },
  {
    title: "4. Opting in — one scheme or the other",
    who: "Juror",
    icon: ShieldCheck,
    say: "Opting in is a choice the juror makes once, on their first day, and it stays in place for the rest of their service. It means they take their food and drink through Café 1 and will not claim HMCTS subsistence expenses. It is one or the other — never both, never a mix. Opting in also unlocks the extra 10% off non-beverage items above the allowance.",
    screen: () => (
      <div className="mx-auto max-w-md space-y-3">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Please read before opting in.</strong> Joining the voucher scheme means you take
          your food and drink through Café 1 for the rest of your jury service and{" "}
          <strong>will not claim HMCTS subsistence expenses</strong> during that time.
        </div>
        <div className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground">
          <ShieldCheck className="h-4 w-4" /> Opt in — voucher scheme instead of expenses
        </div>
        <p className="text-center text-xs text-muted-foreground">
          The {JUROR_FOOD_DISCOUNT_PERCENT}% food discount is only ever given to opted-in members —
          the till, the website and the payment engine each re-check it.
        </p>
      </div>
    ),
  },
  {
    title: "5. The private JURY ONLY menu",
    who: "Juror",
    icon: Lock,
    say: "In the jury lounge and the jury rooms there's a poster with a QR code. Scanning it opens a menu nobody else can see: the juror keys in their Juror ID and PIN, and only then does the JURY ONLY menu unlock. It's a separate, dedicated menu — and orders from it can only be collected at Café 1 or delivered to the Jury Lounge at the Crown Court or the Jury Rooms at the Magistrates' Court. Never to a home or office address.",
    screen: () => (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-5 text-sm shadow-sm">
        <div className="rounded-xl bg-primary px-4 py-3 text-center text-primary-foreground">
          <p className="font-display text-lg font-black tracking-wide">JURY ONLY MENU</p>
          <p className="text-xs opacity-90">Unlocked with your Juror ID and PIN</p>
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            <Lock className="h-4 w-4 text-primary" />
            <span className="font-mono tracking-[0.3em]">JR-4K7Q</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            <Lock className="h-4 w-4 text-primary" />
            <span className="font-mono tracking-[0.3em]">••• •••</span>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
          <p className="inline-flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Collection at Café 1 · Jury Lounge (Crown Court) ·
            Jury Rooms (Magistrates')
          </p>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Judges have their own separate gated menu, charged to the weekly court tab.
        </p>
      </div>
    ),
  },
  {
    title: "6. Ordering from the Jury menu",
    who: "Juror",
    icon: UtensilsCrossed,
    say: "Every juror can use the menu, whether or not they opt in — jurors who stay on expenses just tap 'I haven't opted in' and pay by card, Apple or Google Pay or cash, with no allowance and no 10% discount. They can collect at the counter, or — if they're sitting in the Magistrates' Court — have it delivered to the jury room at a chosen time. Deliveries only ever go inside the court estate. Once the juror has their food it's theirs to enjoy wherever they like — they're welcome to take it off the premises and eat outside, provided the court has told them they're free to leave the building.",
    screen: () => (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-5 text-sm shadow-sm">
        <div className="mb-4 rounded-2xl border border-primary/40 bg-primary/5 p-4">
          <p className="font-display text-base font-black">How would you like your order?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            On the JURY ONLY menu this pop-up only ever offers the court options.
          </p>
          <div className="mt-3 grid gap-2">
            <div className="rounded-xl border border-border bg-background px-3 py-2 font-semibold">
              Collect at Café 1
            </div>
            <div className="rounded-xl border border-border bg-background px-3 py-2 font-semibold">
              Dine in at Café 1
            </div>
            <div className="rounded-xl border border-primary bg-background px-3 py-2 font-semibold">
              Deliver — Main Jury Lounge, Crown Court
            </div>
            <div className="rounded-xl border border-border bg-background px-3 py-2 font-semibold">
              Deliver — Jury Rooms, Crown Court
            </div>
            <div className="rounded-xl border border-border bg-background px-3 py-2 font-semibold">
              Deliver — Jury Rooms, Magistrates' Court
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            No postcode box, no home or office addresses — and a time slot of ASAP or a chosen time.
          </p>
        </div>
        <p className="font-display text-lg font-black">Your order</p>
        <Row label="Chicken & rice" value="£5.50" />
        <Row label="Side salad" value="£1.80" />
        <Row label="Bottled water" value="£1.20" />
        <div className="my-3 border-t border-border" />
        <Row label="Subtotal" value="£8.50" />
        <Row label={`Voucher (${money(JUROR_DAILY_ALLOWANCE_CENTS)})`} value="−£5.71" green />
        <Row label="Scheme member 10% off food" value="−£0.28" green />
        <div className="my-3 border-t border-border" />
        <Row label="You pay" value="£2.51" bold />
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" /> Collection at Café 1, or delivery to Jury Room 2.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Once collected, food can be taken away and eaten outside the court if the juror is
          permitted to leave the premises under the court's instructions.
        </p>
      </div>
    ),
  },
  {
    title: "7. At the till",
    who: "Café 1 counter",
    icon: Ticket,
    say: "Exactly the same at the counter. Staff key in the code and the juror types the PIN on the customer screen — staff never see it. The allowance comes off automatically and the juror pays only the difference.",
    screen: () => (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-neutral-900 p-5 font-mono text-sm text-white shadow-sm">
        <p className="text-xs uppercase tracking-widest text-white/60">Café 1 · Till 1 (Jury)</p>
        <div className="mt-3 space-y-1">
          <p className="flex justify-between">
            <span>Subtotal</span>
            <span>£8.50</span>
          </p>
          <p className="flex justify-between text-emerald-400">
            <span>Juror voucher</span>
            <span>−£5.71</span>
          </p>
          <p className="flex justify-between text-emerald-400">
            <span>Scheme 10% food</span>
            <span>−£0.28</span>
          </p>
          <p className="mt-2 flex justify-between border-t border-white/20 pt-2 text-lg font-black">
            <span>DUE</span>
            <span>£2.51</span>
          </p>
        </div>
      </div>
    ),
  },
  {
    title: "8. Use it or lose it",
    who: "The rules, automatically enforced",
    icon: CheckCircle2,
    say:
      "The allowance is per sitting day. Anything unused at close of business disappears — it can never be carried over, saved up or exchanged for cash. Weekends and bank holidays give no allowance at all. If the Jury Officer confirms attendance over 10 hours, a manager can raise that one day to " +
      "£12.17.",
    screen: () => (
      <div className="mx-auto grid max-w-md gap-2 text-sm">
        <Day label="Monday" used="£5.71 used" ok />
        <Day label="Tuesday" used="£3.10 used · £2.61 expired at 5pm" ok />
        <Day label="Saturday" used="No allowance — court not sitting" />
        <Day
          label="Wednesday"
          used={`Long day approved · ${money(JUROR_EXTENDED_DAY_ALLOWANCE_CENTS)}`}
          ok
        />
      </div>
    ),
  },
  {
    title: "9. The nightly HMCTS claim",
    who: "Café 1 → HMCTS",
    icon: FileSpreadsheet,
    say: "Every night the system produces one reconciled claim line per redemption: Juror ID, date, time, receipt number, amount redeemed and anything the juror paid themselves. We only ever claim what was actually spent. If HMCTS ever needs to trace a line back to a person, they match the Juror ID against their own HMCTS records — Café 1 never holds anything identifiable. We can provide one complete itemised report plus a filtered report per Juror ID, locked against editing.",
    screen: () => (
      <div className="mx-auto max-w-lg overflow-hidden rounded-2xl border border-border bg-card text-xs shadow-sm">
        <div className="grid grid-cols-4 bg-muted px-3 py-2 font-black uppercase tracking-widest">
          <span>Code</span>
          <span>Date</span>
          <span>Receipt</span>
          <span className="text-right">Claimed</span>
        </div>
        {[
          ["CV-DEMO-4821", "Mon 03", "#10241", "£5.71"],
          ["CV-DEMO-9134", "Mon 03", "#10247", "£4.20"],
          ["CV-DEMO-5502", "Mon 03", "#10250", "£5.71"],
        ].map((r) => (
          <div key={r[2]} className="grid grid-cols-4 border-t border-border px-3 py-2 font-mono">
            <span>{r[0]}</span>
            <span>{r[1]}</span>
            <span>{r[2]}</span>
            <span className="text-right font-bold">{r[3]}</span>
          </div>
        ))}
        <div className="grid grid-cols-4 border-t-2 border-primary bg-primary/5 px-3 py-2 font-black">
          <span className="col-span-3">Total claimed for the day</span>
          <span className="text-right">£15.62</span>
        </div>
      </div>
    ),
  },
  {
    title: "10. Security, hosting and payments",
    who: "Café 1 systems",
    icon: Server,
    say: "The whole system runs on AWS cloud infrastructure in the UK/EEA, with managed patching, encryption in transit and at rest, automated backups and row-level database access control. Card payments are taken through SumUp, an FCA-authorised, PCI DSS compliant payment gateway with 3-D Secure and tokenised Apple Pay and Google Pay — Café 1 never holds card details. Voucher PINs are stored only as cryptographic hashes, admin accounts require two-factor authentication, and every voucher action is written to an immutable audit log.",
    screen: () => (
      <div className="mx-auto grid max-w-lg gap-2 text-sm sm:grid-cols-2">
        <Fact icon={Server} title="AWS cloud hosting (UK/EEA)">
          Managed patching, TLS in transit, encryption at rest, automated backups.
        </Fact>
        <Fact icon={Lock} title="PCI DSS compliant payments">
          SumUp gateway, 3-D Secure/SCA, tokenised Apple &amp; Google Pay. No card data held by Café
          1.
        </Fact>
        <Fact icon={ShieldCheck} title="Access control">
          Two-factor authentication on admin accounts, named staff logins, PINs stored hashed with
          lock-out and rate limiting.
        </Fact>
        <Fact icon={FileSpreadsheet} title="Immutable audit log">
          Every issue, opt-in, redemption and adjustment recorded against the Juror ID only.
        </Fact>
      </div>
    ),
  },
];

function Fact({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Ticket;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-2 font-bold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function DemoPage() {
  const [i, setI] = useState(0);
  const step = steps[i];
  const Icon = step.icon;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-primary text-primary-foreground">
          <div className="mx-auto max-w-4xl px-4 py-10">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-black uppercase tracking-widest">
              <ShieldCheck className="h-4 w-4" /> Demonstration · no real data
            </span>
            <h1 className="mt-4 font-display text-3xl font-black sm:text-4xl">
              The whole process, start to finish
            </h1>
            <p className="mt-3 max-w-2xl text-primary-foreground/85">
              Eight screens showing exactly what the Jury Officer, the juror and Café 1 each see,
              from the printed juror sheet through to security and hosting. Everything below is
              simulated — no live voucher, order or claim is created.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-10">
          {/* progress */}
          <div className="flex flex-wrap gap-1.5">
            {steps.map((s, n) => (
              <button
                key={s.title}
                onClick={() => setI(n)}
                className={`h-2 flex-1 min-w-8 rounded-full transition-colors ${n <= i ? "bg-primary" : "bg-muted"}`}
                aria-label={s.title}
              />
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-lg sm:p-8">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              {step.who}
            </p>
            <h2 className="mt-1 inline-flex items-center gap-2 font-display text-2xl font-black">
              <Icon className="h-6 w-6 text-primary" /> {step.title}
            </h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">{step.say}</p>

            <div className="mt-6 rounded-2xl bg-muted/40 p-5 sm:p-8">{step.screen()}</div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={() => setI((n) => Math.max(0, n - 1))}
                disabled={i === 0}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 font-bold disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <span className="text-sm text-muted-foreground">
                Step {i + 1} of {steps.length}
              </span>
              {i < steps.length - 1 ? (
                <button
                  onClick={() => setI((n) => Math.min(steps.length - 1, n + 1))}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground"
                >
                  Next <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <Link
                  to="/juror"
                  search={{} as never}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground"
                >
                  Try it for real <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
            <p className="font-display text-base font-bold text-foreground">
              Want to try it hands-on?
            </p>
            <p className="mt-1">
              Ask Café 1 for a sample juror information sheet. Demo codes behave exactly like real
              ones but are marked <strong>DEMO</strong> in every report, so nothing is ever claimed
              from HMCTS.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/juror"
                search={{} as never}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary px-4 font-bold text-primary"
              >
                Juror portal
              </Link>
              <Link
                to="/jury-menu"
                search={{} as never}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 font-bold"
              >
                JURY ONLY menu
              </Link>
              <Link
                to="/juror-qr"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 font-bold"
              >
                Printable QR posters
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function Mini({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-2 ${highlight ? "border-primary bg-primary/5" : "border-border"}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`font-display text-base font-black ${highlight ? "text-primary" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  green,
  bold,
}: {
  label: string;
  value: string;
  green?: boolean;
  bold?: boolean;
}) {
  return (
    <p
      className={`flex justify-between py-0.5 ${green ? "text-emerald-700" : ""} ${bold ? "text-lg font-black" : ""}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </p>
  );
}

function Day({ label, used, ok }: { label: string; used: string; ok?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border p-3 ${ok ? "border-border bg-card" : "border-dashed border-border bg-muted/40 text-muted-foreground"}`}
    >
      <span className="font-bold">{label}</span>
      <span className="text-sm">{used}</span>
    </div>
  );
}
