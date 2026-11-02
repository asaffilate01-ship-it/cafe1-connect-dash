import { createFileRoute } from "@tanstack/react-router";
import officialLogo from "@/assets/cafe1-logo.webp";
import { QrCode } from "@/components/qr-code";
import { CheckCircle2, Printer, ShieldCheck, UtensilsCrossed } from "lucide-react";

export const Route = createFileRoute("/juror-handout")({
  head: () => ({
    meta: [
      { title: "Juror meal voucher handout — Café 1 St Albans" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: JurorHandout,
});

const steps = [
  ["Ask our team", "Café 1 staff explain the scheme and give you this guide. You choose whether to use it on each sitting day."],
  ["Enter your Juror ID", "Go to cafe1stalbans.co.uk/juror on your phone or use the Jury Lounge tablet. Enter the Juror ID supplied by the court."],
  ["Check your daily allowance", "View today's £5.71 allowance, amount already used and remaining. Checking it does not opt you in."],
  ["Choose from the Juror Only Menu", "Enjoy special hot, cold and vegetarian meals, including choices priced around £5.71."],
  ["Redeem when you order", "Enter your private six-digit PIN to secure your voucher. Actual voucher use opts you in for that day only."],
  ["Pay any extra", "The voucher is used first. Pay any remaining charge; eligible non-beverage food above the allowance gets 10% off."],
] as const;

function JurorHandout() {
  return (
    <div className="min-h-screen bg-stone-100 px-3 py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <button type="button" onClick={() => window.print()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground">
          <Printer className="h-4 w-4" /> Print juror handout
        </button>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white text-stone-900 shadow-xl print:max-w-none print:shadow-none">
        <div className="border-b-8 border-red-700 px-8 pb-6 pt-8 sm:px-12">
          <div className="flex items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <img src={officialLogo} className="h-20 w-20 object-contain" alt="Official Café 1 logo" />
                <span className="text-xs font-bold uppercase tracking-[0.25em] text-stone-700">
                  St Albans
                </span>
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Your juror meal voucher
              </h1>
              <p className="mt-2 max-w-lg text-sm text-stone-700">
                Your £5.71 daily meal allowance at St Albans Crown Court and
                St Albans Magistrates' Court — with a choice every day.
              </p>
            </div>
            <div className="shrink-0 rounded-2xl border-4 border-red-700 bg-white p-2">
              <QrCode value="https://cafe1stalbans.co.uk/juror" size={126} alt="QR code to Café 1 juror menu and balance" />
            </div>
          </div>
          <p className="mt-3 break-all text-xs font-bold text-red-800">cafe1stalbans.co.uk/juror</p>
        </div>
        <div className="px-8 py-6 sm:px-12">
          <h2 className="text-xl font-black">Your six simple steps</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {steps.map(([heading,description],index) => (
              <section key={heading} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-700 text-base font-black text-white">
                    {index+1}
                  </span>
                  <div>
                    <h3 className="font-bold">{heading}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-stone-700">{description}</p>
                  </div>
                </div>
              </section>
            ))}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-red-700 p-5 text-white">
              <div className="flex items-center gap-2 text-lg font-black">
                <CheckCircle2 className="h-5 w-5" /> Your choice each day
              </div>
              <p className="mt-2 text-sm leading-relaxed">
                If you use your funded voucher, you participate on that day.
                If you don't use it, you have not opted in for that day and
                Café 1 claims nothing. No daily form is needed.
              </p>
            </div>
            <div className="rounded-xl bg-stone-900 p-5 text-white">
              <div className="flex items-center gap-2 text-lg font-black">
                <UtensilsCrossed className="h-5 w-5" /> Court jury areas only
              </div>
              <p className="mt-2 text-sm leading-relaxed">
                Meals are served or delivered exclusively to the Jury Lounges
                and Jury Rooms in St Albans Crown Court and St Albans
                Magistrates' Court.
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-stone-300 p-3 text-xs text-stone-700">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
            <p>
              Your Juror ID is registered for up to 12 weeks. Unused daily value
              cannot be carried over, paid as cash or claimed by Café 1. A PIN
              protects voucher spending; ID-only browsing is not a claim.
              Follow the Jury Office's approved guidance concerning any other
              HMCTS meal-expense claims for the same day.
            </p>
          </div>
          <p className="mt-3 text-center text-[10px] text-stone-500">
            Café 1 St Albans · Operating arrangement subject to Jury Office approval
          </p>
        </div>
      </article>
      <style>{'@media print { @page { size: A4 portrait; margin: 0; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }'}</style>
    </div>
  );
}
