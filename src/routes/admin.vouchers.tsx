import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdminNav } from "@/components/admin-nav";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useSession, useRoles } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { money } from "@/lib/format";
import { askAlert, askPrompt } from "@/lib/confirm";
import {
  Ticket,
  Download,
  CalendarPlus,
  Power,
  ShieldCheck,
  Clock3,
  KeyRound,
  ListPlus,
} from "lucide-react";
import {
  JUROR_DAILY_ALLOWANCE_CENTS,
  JUROR_EXTENDED_DAY_ALLOWANCE_CENTS,
  JUROR_VALIDITY_WEEKS,
  isoDate,
} from "@/lib/juror";
import {
  listJurorClaimRows,
  manageJurorVoucher,
  setJurorDailyAllowance,
  activateJurorIds,
  resetJurorPin,
  type ActivatedJurorId,
} from "@/lib/juror-admin.functions";

export const Route = createFileRoute("/admin/vouchers")({
  head: () => ({
    meta: [
      { title: "Juror vouchers — Cafe1 Admin" },
      {
        name: "description",
        content:
          "Activate HMCTS Juror IDs as vouchers, manage attendance controls and export weekly reimbursement reports for Cafe1.",
      },
      { property: "og:title", content: "Juror vouchers — Cafe1 Admin" },
      {
        property: "og:description",
        content:
          "Activate HMCTS Juror IDs as vouchers, manage attendance controls and export weekly reimbursement reports for Cafe1.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminVouchers,
});

type Holder = {
  id: string;
  code: string;
  batch: string | null;
  active: boolean;
  daily_amount_cents: number;
  valid_from: string;
  valid_until: string | null;
  opted_in_at: string | null;
  opt_in_source: string | null;
  jury_room: string | null;
  notes: string | null;
};
type Redemption = {
  id: string;
  holder_id: string;
  for_date: string;
  amount_cents: number;
  created_at: string;
  orders: { order_number: number } | null;
};
type VoucherEvent = {
  id: string;
  code: string;
  event: string;
  detail: string | null;
  amount_cents: number | null;
  created_at: string;
};

function today() {
  return isoDate(new Date());
}
function weekAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return isoDate(d);
}

function statusOf(h: Holder, day: string): { label: string; tone: string } {
  if (!h.active) return { label: "Deactivated", tone: "bg-muted text-muted-foreground" };
  if (day < h.valid_from) return { label: "Not started", tone: "bg-amber-100 text-amber-700" };
  if (h.valid_until && day > h.valid_until)
    return { label: "Expired", tone: "bg-muted text-muted-foreground" };
  if (h.opted_in_at) return { label: "Opted in", tone: "bg-emerald-100 text-emerald-700" };
  return { label: "Issued", tone: "bg-primary-soft text-primary" };
}

function AdminVouchers() {
  const { user, loading } = useSession();
  const { has, loading: rl } = useRoles(user);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const manageSecureVoucher = useServerFn(manageJurorVoucher);
  const setSecureAllowance = useServerFn(setJurorDailyAllowance);
  const fetchClaimRows = useServerFn(listJurorClaimRows);
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/admin/login", search: { next: "/admin/vouchers" } });
  }, [loading, user, navigate]);
  const allowed = has("admin") || has("staff");
  const manager = has("admin");

  const [date, setDate] = useState(today());
  const [from, setFrom] = useState(weekAgo());
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState("");

  const { data: holders } = useQuery({
    queryKey: ["voucher-holders"],
    enabled: !!user && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_holders")
        .select(
          "id, code, batch, active, daily_amount_cents, valid_from, valid_until, opted_in_at, opt_in_source, jury_room, notes",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Holder[];
    },
  });

  const { data: usedToday } = useQuery({
    queryKey: ["voucher-used", date],
    enabled: !!user && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_redemptions")
        .select("holder_id, amount_cents")
        .eq("for_date", date);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.holder_id] = (map[r.holder_id] ?? 0) + r.amount_cents;
      return map;
    },
  });

  const { data: report } = useQuery({
    queryKey: ["voucher-report", from, to],
    enabled: !!user && allowed,
    queryFn: async () => {
      const rows = await fetchClaimRows({ data: { from, to } });
      return rows
        .map((row) => ({
          id: row.redemption_id,
          holder_id: row.holder_id,
          for_date: row.for_date,
          amount_cents: row.amount_cents,
          created_at: row.redeemed_at,
          orders: { order_number: row.order_number },
        }))
        .reverse() satisfies Redemption[];
    },
  });

  const { data: events } = useQuery({
    queryKey: ["voucher-events"],
    enabled: !!user && allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_events")
        .select("id, code, event, detail, amount_cents, created_at")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as VoucherEvent[];
    },
  });

  const byId = useMemo(() => Object.fromEntries((holders ?? []).map((h) => [h.id, h])), [holders]);
  const reportTotal = (report ?? []).reduce((s, r) => s + r.amount_cents, 0);
  const visible = useMemo(() => {
    const q = search.trim().toUpperCase();
    return (holders ?? []).filter(
      (h) => !q || h.code.includes(q) || (h.batch ?? "").toUpperCase().includes(q),
    );
  }, [holders, search]);

  /* ------------- HMCTS Juror ID activation ------------- */
  const activateIds = useServerFn(activateJurorIds);
  const resetPin = useServerFn(resetJurorPin);
  const [idBatch, setIdBatch] = useState(`Jury Office ${today()}`);
  const [idFrom, setIdFrom] = useState(today());
  const [idText, setIdText] = useState("");
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState<ActivatedJurorId[]>([]);

  const parsedIds = useMemo(
    () =>
      Array.from(
        new Set(
          idText
            .split(/[\s,;]+/)
            .map((v) => v.replace(/[^A-Za-z0-9-]/g, "").toUpperCase())
            .filter((v) => v.length >= 3 && v.length <= 40),
        ),
      ),
    [idText],
  );

  async function activateBatch(e: React.FormEvent) {
    e.preventDefault();
    if (!parsedIds.length) {
      toast.error("Paste at least one Juror ID");
      return;
    }
    setActivating(true);
    try {
      const rows = await activateIds({
        data: {
          batch: idBatch,
          juror_ids: parsedIds.slice(0, 500),
          valid_from: idFrom,
        },
      });
      setActivated(rows);
      toast.success(`${rows.length} Juror IDs activated for ${JUROR_VALIDITY_WEEKS} weeks`);
      qc.invalidateQueries({ queryKey: ["voucher-holders"] });
      qc.invalidateQueries({ queryKey: ["voucher-events"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not activate those Juror IDs");
    } finally {
      setActivating(false);
    }
  }

  async function issueReplacementPin(h: Holder) {
    const reason = await askPrompt({
      title: "Issue replacement PIN",
      description: `Record why a replacement is required for ${h.code}. This action is added to the audit trail.`,
      label: "Reason",
      defaultValue: "Juror mislaid their PIN",
      confirmLabel: "Issue replacement",
    });
    if (!reason?.trim()) return;
    try {
      const result = await resetPin({ data: { holder_id: h.id, reason } });
      await askAlert({
        title: "Replacement PIN — shown once",
        description: `${result.code}: ${result.pin}\n\nRead it to the juror now. It is stored only as a hash and cannot be displayed again.`,
        confirmLabel: "I have recorded it",
      });
      qc.invalidateQueries({ queryKey: ["voucher-events"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reset that PIN");
    }
  }

  function downloadCsv(rows: (string | number)[][], filename: string) {
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------------- lifecycle ---------------- */
  async function extend(h: Holder, days: number) {
    const reason = await askPrompt({
      title: "Extend juror service",
      description: `Extend ${h.code} by ${days} working days and record the reason in the audit trail.`,
      label: "Reason",
      defaultValue: "Trial continuing",
      confirmLabel: "Extend service",
    });
    if (!reason?.trim()) return;
    try {
      const result = await manageSecureVoucher({
        data: { holder_id: h.id, action: "extend", working_days: days, reason },
      });
      toast.success(`${h.code} extended to ${result.valid_until}`);
      qc.invalidateQueries({ queryKey: ["voucher-holders"] });
      qc.invalidateQueries({ queryKey: ["voucher-events"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not extend this voucher");
    }
  }

  async function toggleActive(h: Holder) {
    const action = h.active ? "deactivate" : "reactivate";
    const reason = await askPrompt({
      title: h.active ? "Deactivate juror code" : "Reactivate juror code",
      description: `${h.code} will be ${h.active ? "blocked immediately" : "reactivated for five working days"}.`,
      label: "Reason",
      defaultValue: h.active ? "Jury service ended" : "Juror still in attendance",
      confirmLabel: h.active ? "Deactivate" : "Reactivate",
    });
    if (!reason?.trim()) return;
    try {
      await manageSecureVoucher({
        data: {
          holder_id: h.id,
          action,
          working_days: h.active ? 0 : 5,
          reason,
        },
      });
      toast.success(`${h.code} ${h.active ? "deactivated" : "reactivated for 5 working days"}`);
      qc.invalidateQueries({ queryKey: ["voucher-holders"] });
      qc.invalidateQueries({ queryKey: ["voucher-events"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change this voucher");
    }
  }

  async function approveLongDay(h: Holder) {
    const reason = await askPrompt({
      title: "Approve extended-day allowance",
      description: `Raise ${h.code} to ${money(JUROR_EXTENDED_DAY_ALLOWANCE_CENTS)} for ${date}.`,
      label: "Authorisation reason",
      defaultValue: "Jury Officer confirmed attendance exceeded 10 hours",
      confirmLabel: "Approve allowance",
    });
    if (!reason?.trim()) return;
    try {
      await setSecureAllowance({
        data: {
          holder_id: h.id,
          for_date: date,
          amount_cents: JUROR_EXTENDED_DAY_ALLOWANCE_CENTS,
          reason,
        },
      });
      toast.success(
        `${h.code} approved for ${money(JUROR_EXTENDED_DAY_ALLOWANCE_CENTS)} on ${date}`,
      );
      qc.invalidateQueries({ queryKey: ["voucher-used", date] });
      qc.invalidateQueries({ queryKey: ["voucher-events"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve the long-day rate");
    }
  }

  function exportReport() {
    downloadCsv(
      [
        ["Date", "Time", "Juror ID / voucher code", "Batch", "Order #", "Amount redeemed (GBP)"],
        ...(report ?? []).map((r) => {
          const h = byId[r.holder_id];
          return [
            r.for_date,
            new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            h?.code ?? "",
            h?.batch ?? "",
            r.orders?.order_number ? `#${r.orders.order_number}` : "",
            (r.amount_cents / 100).toFixed(2),
          ];
        }),
        ["", "", "", "", "TOTAL", (reportTotal / 100).toFixed(2)],
      ],
      `cafe1-juror-vouchers-${from}-to-${to}.csv`,
    );
  }

  function exportRegister() {
    downloadCsv(
      [
        [
          "Juror ID / voucher code",
          "Batch",
          "Status",
          "Valid from",
          "Valid until",
          "Daily allowance (GBP)",
          "Opted in",
        ],
        ...(holders ?? []).map((h) => [
          h.code,
          h.batch ?? "",
          statusOf(h, today()).label,
          h.valid_from,
          h.valid_until ?? "",
          (h.daily_amount_cents / 100).toFixed(2),
          h.opted_in_at ? new Date(h.opted_in_at).toLocaleString() : "",
        ]),
      ],
      `cafe1-juror-code-register-${today()}.csv`,
    );
  }

  if (loading || rl) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!allowed)
    return <div className="p-10 text-muted-foreground">You don't have access to this page.</div>;

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
            <Ticket className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-3xl font-bold">Juror voucher scheme</h1>
            <p className="text-sm text-muted-foreground">
              The HMCTS Juror ID is the voucher code — {money(JUROR_DAILY_ALLOWANCE_CENTS)} each
              sitting day, unused value expires nightly, and Cafe 1 only claims what is redeemed.
            </p>
          </div>
        </div>

        {/* Activate the Juror IDs supplied by the Jury Office */}
        {manager && (
          <form
            onSubmit={activateBatch}
            className="mt-8 rounded-2xl border border-primary/40 bg-primary/5 p-5"
          >
            <p className="flex items-center gap-2 font-semibold text-primary">
              <ListPlus className="h-4 w-4" /> Activate HMCTS Juror IDs
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Paste the Juror IDs sent by the Jury Office (one per line, or comma separated). No
              second voucher code is generated: each Juror ID is the voucher code for 12 weeks. Each
              juror creates a separate six-digit PIN when they opt in, shown once only.
            </p>
            <textarea
              value={idText}
              onChange={(e) => setIdText(e.target.value)}
              rows={5}
              placeholder={"J-4821-7K9P\nJ-4822-2M4T\nJ-4823-9QX1"}
              className="mt-3 w-full rounded-xl border border-border bg-background p-3 font-mono text-sm"
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Batch label
                </span>
                <input
                  value={idBatch}
                  onChange={(e) => setIdBatch(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Active from
                </span>
                <input
                  type="date"
                  value={idFrom}
                  onChange={(e) => setIdFrom(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </label>
              <div className="flex items-end">
                <button
                  disabled={activating || !parsedIds.length}
                  className="h-11 w-full rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
                >
                  {activating ? "Activating…" : `Activate ${parsedIds.length || ""} IDs`.trim()}
                </button>
              </div>
            </div>
            {activated.length > 0 && (
              <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
                <p className="font-semibold">
                  {activated.filter((r) => r.status === "activated").length} newly activated ·{" "}
                  {activated.filter((r) => r.status === "updated").length} already on the scheme
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Valid {activated[0]?.valid_from} → {activated[0]?.valid_until} (12 weeks). The
                  Juror ID is also the voucher code. It never works on weekends or configured bank
                  holidays; online use also requires that day's short-lived attendance QR.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      [
                        ["Juror ID", "Status", "Valid from", "Valid until"],
                        ...activated.map((r) => [
                          r.juror_id,
                          r.status,
                          r.valid_from,
                          r.valid_until,
                        ]),
                      ],
                      `cafe1-juror-ids-${idBatch.replace(/\W+/g, "-").toLowerCase()}.csv`,
                    )
                  }
                  className="mt-3 flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted"
                >
                  <Download className="h-4 w-4" /> Download activation record
                </button>
              </div>
            )}
          </form>
        )}

        {!manager && (
          <div className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">Staff read-only access</p>
            <p className="mt-1">
              A manager using MFA must activate, extend, reactivate or increase a juror allowance.
            </p>
          </div>
        )}

        {/* Register */}
        <div className="mt-8 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">Juror ID voucher register</p>
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Juror ID or batch"
                className="h-10 w-48 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <button
                onClick={exportRegister}
                className="flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted"
              >
                <Download className="h-4 w-4" /> Register
              </button>
            </div>
          </div>
          <div className="mt-4 divide-y divide-border">
            {visible.map((h) => {
              const used = usedToday?.[h.id] ?? 0;
              const st = statusOf(h, date);
              const grants =
                h.active && date >= h.valid_from && (!h.valid_until || date <= h.valid_until);
              const left = grants ? Math.max(0, h.daily_amount_cents - used) : 0;
              return (
                <div key={h.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-[200px] flex-1">
                    <p className="font-mono font-semibold">{h.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.batch ? `${h.batch} · ` : ""}
                      {h.valid_from} → {h.valid_until ?? "open"}
                      {h.jury_room ? ` · ${h.jury_room}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${st.tone}`}>
                    {st.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {money(h.daily_amount_cents)}/day · used {money(used)} · left{" "}
                    <span className="font-semibold text-primary">{money(left)}</span>
                  </span>
                  {manager && (
                    <>
                      <button
                        onClick={() => approveLongDay(h)}
                        className="rounded-lg p-2 text-muted-foreground hover:text-primary"
                        aria-label={`Approve over 10 hour allowance for ${h.code} on ${date}`}
                        title={`Approve ${money(JUROR_EXTENDED_DAY_ALLOWANCE_CENTS)} for selected date`}
                      >
                        <Clock3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => extend(h, 5)}
                        className="rounded-lg p-2 text-muted-foreground hover:text-primary"
                        aria-label={`Extend ${h.code} by 5 working days`}
                        title="Extend 5 working days"
                      >
                        <CalendarPlus className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => toggleActive(h)}
                        className={`rounded-lg p-2 ${h.active ? "text-muted-foreground hover:text-destructive" : "text-emerald-600"}`}
                        aria-label={`${h.active ? "Deactivate" : "Reactivate"} ${h.code}`}
                        title={h.active ? "Deactivate" : "Reactivate for 5 working days"}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => issueReplacementPin(h)}
                        className="rounded-lg p-2 text-muted-foreground hover:text-primary"
                        aria-label={`Issue a replacement PIN for ${h.code}`}
                        title="Issue a replacement one-time PIN"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            {!visible.length && (
              <p className="py-6 text-sm text-muted-foreground">
                No Juror IDs yet — activate a Jury Office list above.
              </p>
            )}
          </div>
        </div>

        {/* Reimbursement */}
        <div className="mt-8 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">HMCTS reimbursement claim</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <span className="text-muted-foreground">→</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <button
                onClick={exportReport}
                className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                <Download className="h-4 w-4" /> CSV
              </button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Date &amp; time</th>
                  <th>Code</th>
                  <th>Batch</th>
                  <th>Order</th>
                  <th className="text-right">Redeemed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(report ?? []).map((r) => {
                  const h = byId[r.holder_id];
                  return (
                    <tr key={r.id}>
                      <td className="py-2">
                        {r.for_date}{" "}
                        {new Date(r.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="font-mono">{h?.code ?? "—"}</td>
                      <td className="text-muted-foreground">{h?.batch ?? "—"}</td>
                      <td>{r.orders?.order_number ? `#${r.orders.order_number}` : "—"}</td>
                      <td className="text-right font-semibold">{money(r.amount_cents)}</td>
                    </tr>
                  );
                })}
                {!(report ?? []).length && (
                  <tr>
                    <td colSpan={5} className="py-6 text-muted-foreground">
                      No vouchers redeemed in this period.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-display text-base font-bold">
                  <td className="pt-3" colSpan={4}>
                    Total to reclaim
                  </td>
                  <td className="pt-3 text-right text-primary">{money(reportTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Audit trail */}
        <div className="mt-8 rounded-2xl border border-border bg-card p-5">
          <p className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> Audit trail
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Every activation, opt-in, redemption and extension — Juror IDs only, with no names or
            contact details.
          </p>
          <div className="mt-4 divide-y divide-border text-sm">
            {(events ?? []).map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-40 text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()}
                </span>
                <span className="font-mono">{e.code}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold uppercase">
                  {e.event}
                </span>
                {e.amount_cents != null && (
                  <span className="font-semibold text-primary">{money(e.amount_cents)}</span>
                )}
                {e.detail && <span className="text-xs text-muted-foreground">{e.detail}</span>}
              </div>
            ))}
            {!(events ?? []).length && (
              <p className="py-6 text-muted-foreground">No activity yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
