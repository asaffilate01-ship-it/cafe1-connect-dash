import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import {
  cafeClaimsFromCsv,
  duplicateClaimsAgainstCourt,
  externalClaimsFromCsv,
  type ClaimDailyTotal,
  type ExternalPaidClaim,
} from "@/lib/juror-claims";
import { csvClaimCell } from "@/lib/claim-export";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/jury-office-check")({
  head: () => ({
    meta: [
      { title: "Jury Office duplicate expense checker — Café 1 St Albans" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: JuryOfficeCheck,
});

function JuryOfficeCheck() {
  const [cafe, setCafe] = useState<ClaimDailyTotal[] | null>(null);
  const [court, setCourt] = useState<ExternalPaidClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const overlaps = useMemo(
    () => cafe && court ? duplicateClaimsAgainstCourt(cafe, court) : null,
    [cafe, court],
  );

  async function load(file: File | undefined, kind: "cafe" | "court") {
    if (!file) return;
    setError(null);
    try {
      if (!file.name.toLowerCase().endsWith(".csv") || file.size > 3_000_000) {
        throw new Error("Choose a CSV file exported from Excel (maximum 3 MB).");
      }
      const text = await file.text();
      if (kind === "cafe") setCafe(cafeClaimsFromCsv(text));
      else setCourt(externalClaimsFromCsv(text));
    } catch (cause) {
      if (kind === "cafe") setCafe(null);
      else setCourt(null);
      setError(cause instanceof Error ? cause.message : "File could not be read.");
    }
  }

  function downloadOverlaps() {
    if (!overlaps) return;
    const rows: Array<Array<string | number>> = [
      ["Date", "Juror ID", "Cafe 1 paid voucher GBP", "Cafe orders that day",
        "Matching court expense records", "Court expense GBP"],
      ...overlaps.map((row) => [
        row.date, row.juror_id, (row.cafe_cents / 100).toFixed(2),
        row.cafe_transactions, row.external_records, (row.external_cents / 100).toFixed(2),
      ]),
    ];
    const content = "\uFEFF" + rows.map((r) => r.map(csvClaimCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cafe1-jury-office-potential-duplicate-claims.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <div className="rounded-3xl bg-primary px-6 py-9 text-primary-foreground sm:px-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-widest">
            <ShieldCheck className="h-4 w-4" /> Jury Office reconciliation
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
            Duplicate expense checker
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-foreground/85 sm:text-base">
            Compare Café 1's weekly juror-day claim with expense payments already recorded by
            the court. Match by <strong>Juror ID + date</strong>, not by the number of food purchases.
            Multiple legitimate Café 1 meals on one day are one daily claim.
          </p>
        </div>
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm">
          <p className="flex items-start gap-2 font-semibold">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            Your files are checked on your device only.
          </p>
          <p className="mt-1 text-muted-foreground">
            No juror lists or expense records are uploaded, emailed or saved by this checker.
            Use pseudonymous Juror IDs only: do not include names, court case details or other
            confidential information. Your own official HMCTS processes remain authoritative.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-6">
            <FileSpreadsheet className="h-7 w-7 text-primary" />
            <h2 className="mt-3 font-display text-xl font-bold">1. Café 1 weekly claim</h2>
            <p className="mt-2 min-h-14 text-sm text-muted-foreground">
              Import the daily lump-sum CSV or fully itemised transaction CSV supplied by Café 1.
              The software groups transactions by Juror ID and date.
            </p>
            <label htmlFor="cafe-claim-file" className="mt-4 block text-sm font-semibold">Café 1 CSV</label>
            <input id="cafe-claim-file" type="file" accept=".csv,text/csv"
              className="mt-2 block min-h-11 w-full rounded-xl border border-border p-2 text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void load(file, "cafe");
              }}
            />
            {cafe && (
              <p role="status" className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> {cafe.length} funded juror-days in claim
              </p>
            )}
          </section>
          <section className="rounded-2xl border border-border bg-card p-6">
            <FileSpreadsheet className="h-7 w-7 text-primary" />
            <h2 className="mt-3 font-display text-xl font-bold">2. Existing HMCTS payments</h2>
            <p className="mt-2 min-h-14 text-sm text-muted-foreground">
              Export the court's expense-paid ledger from Excel as CSV, with columns
              <strong> Juror ID</strong> and <strong>Date</strong> (DD/MM/YYYY or YYYY-MM-DD). Optional: Amount GBP and Status.
            </p>
            <label htmlFor="court-claim-file" className="mt-4 block text-sm font-semibold">Court payments CSV</label>
            <input id="court-claim-file" type="file" accept=".csv,text/csv"
              className="mt-2 block min-h-11 w-full rounded-xl border border-border p-2 text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void load(file, "court");
              }}
            />
            {court && (
              <p role="status" className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> {court.length} eligible paid records loaded
              </p>
            )}
          </section>
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
        <section aria-live="polite" className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-2xl font-bold">Potential overlap report</h2>
          {overlaps === null ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Select both CSV files to check for the same Juror ID paid by HMCTS and Café 1 on the same day.
            </p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <p className={overlaps.length ? "inline-flex items-center gap-2 font-semibold text-amber-700" : "inline-flex items-center gap-2 font-semibold text-emerald-700"}>
                  {overlaps.length ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                  {overlaps.length} potential duplicate juror-days
                </p>
                <button type="button" onClick={downloadOverlaps}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary/5">
                  <Download className="h-4 w-4" /> Export review CSV
                </button>
              </div>
              {overlaps.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="bg-muted text-xs uppercase text-muted-foreground">
                      <tr><th className="p-3">Date</th><th className="p-3">Juror ID</th>
                        <th className="p-3 text-right">Café 1 claim</th><th className="p-3 text-right">Court paid</th></tr>
                    </thead>
                    <tbody>
                      {overlaps.map((row) => (
                        <tr key={row.date + "-" + row.juror_id} className="border-t border-border">
                          <td className="p-3">{row.date}</td><td className="p-3 font-mono">{row.juror_id}</td>
                          <td className="p-3 text-right">{"£" + (row.cafe_cents / 100).toFixed(2)}</td>
                          <td className="p-3 text-right">{row.external_cents > 0 ? "£" + (row.external_cents / 100).toFixed(2) : "Paid (amount not provided)"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Matches require human review; a match is not proof of an improper claim. No external
                record means only that the supplied file contains no matching paid entry.
              </p>
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
