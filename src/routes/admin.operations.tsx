import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminNav } from "@/components/admin-nav";
import { RequireRole } from "@/components/require-role";
import { SiteSwitcher } from "@/components/site-switcher";
import { IntegrationDiagnosticsPanel } from "@/components/integration-diagnostics-panel";
import { useSites } from "@/hooks/use-sites";
import {
  completeOperationsChecklist,
  generateDailyControlSummary,
  getOperationsDashboard,
  type OperationsDashboard,
} from "@/lib/operations.functions";
import { money } from "@/lib/format";
import { askPrompt } from "@/lib/confirm";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarCheck2,
  Check,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/admin/operations")({
  head: () => ({
    meta: [{ title: "Operations controls — Cafe 1" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <RequireRole roles={["admin", "staff"]} next="/admin/operations">
      <OperationsPage />
    </RequireRole>
  ),
});

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function OperationsPage() {
  const sites = useSites();
  const getDashboard = useServerFn(getOperationsDashboard);
  const complete = useServerFn(completeOperationsChecklist);
  const generate = useServerFn(generateDailyControlSummary);
  const [date, setDate] = useState(isoToday());
  const [data, setData] = useState<OperationsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sites.siteId) return;
    setLoading(true);
    try {
      setData(await getDashboard({ data: { site_id: sites.siteId, business_date: date } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load operations");
    } finally {
      setLoading(false);
    }
  }, [date, getDashboard, sites.siteId]);
  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(
    () =>
      (data?.checklists ?? []).reduce<Record<string, OperationsDashboard["checklists"]>>(
        (groups, item) => {
          (groups[item.cadence] ??= []).push(item);
          return groups;
        },
        {},
      ),
    [data],
  );
  const completeCount = (data?.checklists ?? []).filter((item) => item.completed).length;

  async function tick(id: string) {
    const note =
      (await askPrompt({
        title: "Complete operational control",
        description: "Add an optional note to the immutable audit trail.",
        label: "Completion note",
        confirmLabel: "Mark complete",
      })) ?? "";
    setBusy(id);
    try {
      await complete({ data: { checklist_id: id, business_date: date, note } });
      toast.success("Control completed and added to the audit trail");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete control");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">
              Operations &amp; controls
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold">Today&apos;s control room</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Opening, closing, Friday accounts and month-end evidence in one place.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SiteSwitcher
              compact
              sites={sites.sites}
              siteId={sites.siteId}
              onChange={sites.setSiteId}
              loading={sites.loading}
              error={sites.error}
            />
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-10 rounded-xl border border-border bg-background px-3"
            />
            <button
              onClick={() => void load()}
              className="grid h-10 w-10 place-items-center rounded-xl border border-border"
              aria-label="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-64 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Net sales" value={money(data?.today.net_sales_cents ?? 0)} />
              <Metric label="Orders" value={String(data?.today.orders ?? 0)} />
              <Metric
                label="Refunds"
                value={money(data?.today.refunds_cents ?? 0)}
                warning={(data?.today.refunds_cents ?? 0) > 0}
              />
              <Metric
                label="Till variance"
                value={money(data?.today.cash_variance_cents ?? 0)}
                warning={Math.abs(data?.today.cash_variance_cents ?? 0) >= 500}
              />
              <Metric
                label="Low stock"
                value={String(data?.low_stock_count ?? 0)}
                warning={(data?.low_stock_count ?? 0) > 0}
              />
            </section>

            <IntegrationDiagnosticsPanel />

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
              <section className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl font-bold">Required controls</h2>
                    <p className="text-sm text-muted-foreground">
                      {completeCount} of {data?.checklists.length ?? 0} completed for {date}.
                    </p>
                  </div>
                  <CalendarCheck2 className="h-6 w-6 text-primary" />
                </div>
                <div className="mt-5 space-y-5">
                  {Object.entries(grouped).map(([cadence, items]) => (
                    <div key={cadence}>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {cadence.replaceAll("_", " ")}
                      </p>
                      <div className="space-y-2">
                        {(items ?? []).map((item) => (
                          <button
                            key={item.id}
                            disabled={item.completed || busy === item.id}
                            onClick={() => void tick(item.id)}
                            className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:border-primary disabled:cursor-default disabled:bg-muted/40"
                          >
                            <span
                              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${item.completed ? "bg-emerald-600 text-white" : "bg-primary-soft text-primary"}`}
                            >
                              {busy === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : item.completed ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <ClipboardCheck className="h-4 w-4" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold">{item.title}</span>
                              <span className="block text-xs text-muted-foreground">
                                {item.completed
                                  ? `Completed ${item.completed_at ? new Date(item.completed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}`
                                  : item.description}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <h2 className="font-display text-lg font-bold">Daily accounts snapshot</h2>
                  </div>
                  {data?.summary ? (
                    <Summary data={data.summary} />
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">
                      No signed accounts snapshot has been generated for this date.
                    </p>
                  )}
                  <button
                    onClick={async () => {
                      setBusy("summary");
                      try {
                        await generate({ data: { site_id: sites.siteId, business_date: date } });
                        toast.success("Daily accounts snapshot generated");
                        await load();
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "Could not generate snapshot",
                        );
                      } finally {
                        setBusy(null);
                      }
                    }}
                    disabled={busy === "summary"}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50"
                  >
                    {busy === "summary" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarCheck2 className="h-4 w-4" />
                    )}{" "}
                    Generate/reconcile snapshot
                  </button>
                </div>
                {(data?.unresolved_alerts ?? 0) > 0 && (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
                    <div className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-5 w-5" />
                      <div>
                        <p className="font-semibold">
                          {data?.unresolved_alerts} operational alert(s)
                        </p>
                        <p className="text-sm">
                          A manager should review the Security &amp; alerts screen.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="font-display text-lg font-bold">Open till shifts</h2>
                  <ul className="mt-3 space-y-2 text-sm">
                    {(data?.open_shifts ?? []).map((shift) => (
                      <li key={shift.id} className="flex justify-between rounded-xl bg-muted p-3">
                        <span className="font-semibold capitalize">{shift.terminal}</span>
                        <span className="text-muted-foreground">
                          Since{" "}
                          {new Date(shift.opened_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </li>
                    ))}
                    {!data?.open_shifts.length && (
                      <li className="text-muted-foreground">No open shifts.</li>
                    )}
                  </ul>
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${warning ? "border-amber-300 bg-amber-50" : "border-border bg-card"}`}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}
function Summary({ data }: { data: NonNullable<OperationsDashboard["summary"]> }) {
  const rows = [
    ["Cash", data.cash_sales_cents],
    ["Card", data.card_sales_cents],
    ["Accounts", data.account_sales_cents],
    ["Vouchers", data.voucher_cents],
    ["Discounts", data.discounts_cents],
    ["Refunds", data.refunds_cents],
    ["Waste", data.waste_value_cents],
    ["Till variance", data.till_variance_cents],
  ] as const;
  return (
    <dl className="mt-4 space-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-semibold tabular-nums">{money(value)}</dd>
        </div>
      ))}
      <div className="flex justify-between border-t border-border pt-2 text-base">
        <dt className="font-bold">Net sales</dt>
        <dd className="font-bold">{money(data.net_sales_cents)}</dd>
      </div>
    </dl>
  );
}
