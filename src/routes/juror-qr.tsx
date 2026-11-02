import { createFileRoute } from "@tanstack/react-router";
import { QrCode } from "@/components/qr-code";
import { Printer } from "lucide-react";
import officialLogo from "@/assets/cafe1-logo.webp";

export const Route = createFileRoute("/juror-qr")({
  head: () => ({
    meta: [
      { title: "Printable Juror Voucher QR Posters — Café 1" },
      {
        name: "description",
        content:
          "Print-ready A4 posters with QR codes for the Café 1 Juror Voucher Scheme: jury-room poster, till poster and the guided walkthrough.",
      },
      { property: "og:title", content: "Printable Juror Voucher QR Posters" },
      {
        property: "og:description",
        content: "A4 QR posters for the jury room, the Café 1 counter and the demo walkthrough.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QrPostersPage,
});

const POSTERS = [
  {
    path: "/juror",
    eyebrow: "Jury room poster",
    title: "See your daily allowance",
    lines: [
      "Scan with your phone camera.",
      "Enter your Juror ID to view today’s allowance, amount used and balance.",
      "A private PIN is issued when you choose to set up secure voucher spending.",
      "£5.71 on eligible sitting days (excluding weekends and bank holidays).",
    ],
    foot: "Checking your balance is NOT a daily opt-in or reimbursement claim.",
  },
  {
    path: "/jury-menu",
    eyebrow: "Jury room poster",
    title: "JURY ONLY MENU",
    lines: [
      "Scan and enter your Juror ID to browse; no PIN needed to view the menu.",
      "Enter Juror ID and PIN when redeeming your daily allowance.",
      "Food is provided only inside the Jury Lounges and Jury Rooms at the two St Albans courts.",
    ],
    foot: "Menu access is not the same as voucher spending verification.",
  },
  {
    path: "/juror",
    eyebrow: "Counter / till poster",
    title: "Juror voucher — scan here",
    lines: [
      "Check your remaining allowance before you order.",
      "Enter your Juror ID and PIN privately to redeem the allowance.",
      "Use the voucher on a day to opt in for that day only.",
      "Pay the difference; eligible non-beverage food above the allowance gets 10% off.",
    ],
    foot: "Unused allowance expires after each eligible sitting day and cannot roll over.",
  },
  {
    path: "/juror-handout",
    eyebrow: "Printed guide for jurors",
    title: "Get your Café 1 guide",
    lines: [
      "Staff explain the scheme and provide this guide at court.",
      "Using the voucher opts you in for that day only.",
      "No use means no claim. Unused allowance never carries forward.",
    ],
    foot: "Juror IDs remain registered for up to 12 weeks. Court approval required.",
  },
];

const PRODUCTION_ORIGIN = "https://cafe1stalbans.co.uk";

function QrPostersPage() {
  const origin = PRODUCTION_ORIGIN;

  return (
    <div className="min-h-screen bg-muted/40 print:bg-white">
      <style>{`@media print{.no-print{display:none!important}.poster{page-break-after:always;box-shadow:none!important;border:none!important}}`}</style>

      <div className="no-print mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-3xl font-black">Printable QR posters</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Four A4 posters — jury room, the Juror Menu, the Café 1 counter and the Jury Officer
          printed juror guide. Print at A4, portrait, 100% scale. Codes point at{" "}
          <span className="font-mono">{origin}</span> (always the production address,
          including when opened from a preview). Confirm the page is deployed, and obtain Jury Office
          approval before distributing posters.
        </p>
        <button
          onClick={() => window.print()}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground"
        >
          <Printer className="h-4 w-4" /> Print all posters
        </button>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-4 pb-16 print:max-w-none print:space-y-0 print:p-0">
        {POSTERS.map((p, n) => (
          <article
            key={`${p.eyebrow}-${n}`}
            className="poster mx-auto flex aspect-[210/297] w-full flex-col items-center justify-between rounded-3xl border border-border bg-card p-10 text-center shadow-lg"
          >
            <div className="flex flex-col items-center">
              <div className="mb-4 rounded-2xl bg-white p-2">
                <img src={officialLogo} alt="Official Café 1 logo" className="h-24 w-24 object-contain" />
              </div>
              <p className="text-xs font-black uppercase tracking-[.25em] text-primary">
                {p.eyebrow}
              </p>
              <h2 className="mt-3 font-display text-4xl font-black leading-tight">{p.title}</h2>
            </div>

            <div className="rounded-3xl border-4 border-primary bg-white p-6">
              <QrCode value={`${origin}${p.path}`} size={300} alt={`QR code to ${p.path}`} />
            </div>

            <div>
              <ul className="space-y-1 text-lg font-semibold">
                {p.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <p className="mt-4 font-mono text-sm text-muted-foreground">
                {origin}
                {p.path}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">{p.foot}</p>
              <p className="mt-4 font-display text-lg font-black">Café 1 · St Albans Crown Court</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
