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
import { QrCode } from "@/components/qr-code";
import {
  JUROR_DAILY_ALLOWANCE_CENTS,
  JUROR_EXTENDED_DAY_ALLOWANCE_CENTS,
  JUROR_DEFAULT_SERVICE_DAYS,
  isoDate,
} from "@/lib/juror";
import {
  issueJurorBatch,
  listJurorClaimRows,
  manageJurorVoucher,
  setJurorDailyAllowance,
  activateJurorIds,
  resetJurorPin,
  type ActivatedJurorId,
  type IssuedJurorCredential,
} from "@/lib/juror-admin.functions";

export const Route = createFileRoute("/admin/vouchers")({
  head: () => ({
    meta: [
      { title: "Juror vouchers — Cafe1 Admin" },
      {
        name: "description",
        content:
          "Issue, extend and reconcile anonymous HMCTS juror voucher codes, and export weekly reimbursement reports for Cafe1.",
      },
      { property: "og:title", content: "Juror vouchers — Cafe1 Admin" },
      {
        property: "og:description",
        content:
          "Issue, extend and reconcile anonymous HMCTS juror voucher codes, and export weekly reimbursement reports for Cafe1.",
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
  const issueSecureBatch = useServerFn(issueJurorBatch);
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

  /* ---------------- issuing ---------------- */
  const [genCount, setGenCount] = useState("100");
  const [batch, setBatch] = useState(`Induction ${today()}`);
  const [validFrom, setValidFrom] = useState(today());
  const [serviceDays, setServiceDays] = useState(String(JUROR_DEFAULT_SERVICE_DAYS));
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedJurorCredential[]>([]);
  const [slips, setSlips] = useState<IssuedJurorCredential[]>([]);
  const [printMode, setPrintMode] = useState<"juror" | "officer">("juror");

  /* ------------- HMCTS Juror ID activation ------------- */
  const activateIds = useServerFn(activateJurorIds);
  const resetPin = useServerFn(resetJurorPin);
  const [idBatch, setIdBatch] = useState(`Jury Office ${today()}`);
  const [idServiceDays, setIdServiceDays] = useState(String(JUROR_DEFAULT_SERVICE_DAYS));
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
          service_days: Math.min(
            Math.max(
              parseInt(idServiceDays || "0", 10) || JUROR_DEFAULT_SERVICE_DAYS,
              1,
            ),
            60,
          ),
        },
      });
      setActivated(rows);
      toast.success(`${rows.length} Juror IDs activated for ${idServiceDays} court working days`);
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

  const slipUrl = (code: string) =>
    `https://cafe1stalbans.co.uk/juror?code=${encodeURIComponent(code)}&src=slip`;

  async function issueBatch(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.min(Math.max(parseInt(genCount || "0", 10) || 0, 1), 200);
    setBusy(true);
    try {
      const credentials = await issueSecureBatch({
        data: {
          batch,
          count: n,
          valid_from: validFrom,
          service_days: Math.min(Math.max(parseInt(serviceDays || "0", 10) || 0, 1), 60),
        },
      });
      setIssued(credentials);
      toast.success(`${credentials.length} secure juror codes issued`);
      qc.invalidateQueries({ queryKey: ["voucher-holders"] });
      qc.invalidateQueries({ queryKey: ["voucher-events"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not issue this batch");
    } finally {
      setBusy(false);
    }
  }

  function downloadIssued(credentials: IssuedJurorCredential[], label: string) {
    const rows = [
      [
        "Slip",
        "Voucher code",
        "Juror name (Jury Officer only)",
        "Valid from",
        "Valid until",
        "Daily allowance (GBP)",
        "Batch",
      ],
      ...credentials.map((credential, index) => [
        index + 1,
        credential.code,
        "",
        credential.valid_from,
        credential.valid_until,
        (JUROR_DAILY_ALLOWANCE_CENTS / 100).toFixed(2),
        batch,
      ]),
    ];
    downloadCsv(rows, `cafe1-juror-codes-${label}.csv`);
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
        ["Date", "Time", "Voucher code", "Batch", "Order #", "Amount redeemed (GBP)"],
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
          "Voucher code",
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
              Anonymous HMCTS codes — {money(JUROR_DAILY_ALLOWANCE_CENTS)} each sitting day, unused
              value expires nightly, and Cafe 1 only claims what is redeemed.
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
              PINs are created here — each juror generates their own six-digit PIN when they opt in,
              and it is shown to them once only.
            </p>
            <textarea
              value={idText}
              onChange={(e) => setIdText(e.target.value)}
              rows={5}
              placeholder={"J-4821-7K9P\nJ-4822-2M4T\nJ-4823-9QX1"}
              className="mt-3 w-full rounded-xl border border-border bg-background p-3 font-mono text-sm"
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              <label className="text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Court working days
                </span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={idServiceDays}
                  onChange={(e) => setIdServiceDays(e.target.value)}
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
                  Valid {activated[0]?.valid_from} → {activated[0]?.valid_until}. Jurors opt in
                  themselves with their Juror ID. Online use also requires that day's short-lived
                  jury-room attendance QR.
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

        {/* Legacy: issue anonymous codes when the court cannot supply Juror IDs */}
        {manager ? (
          <form onSubmit={issueBatch} className="mt-8 rounded-2xl border border-border bg-card p-5">
            <p className="font-semibold">Issue codes for an induction</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Manager MFA is required. Each anonymous code gets a separate six-digit PIN which is
              shown once and stored only as a one-way hash.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  How many
                </span>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={genCount}
                  onChange={(e) => setGenCount(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Batch label
                </span>
                <input
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Valid from
                </span>
                <input
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Service days
                </span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={serviceDays}
                  onChange={(e) => setServiceDays(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                disabled={busy}
                className="h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
              >
                Issue &amp; activate codes
              </button>
              <p className="text-xs text-muted-foreground">
                Starts {validFrom} for {serviceDays} court working days; weekends and configured
                bank holidays are excluded. Standard allowance {money(JUROR_DAILY_ALLOWANCE_CENTS)}.
                Only a manager can approve the {money(JUROR_EXTENDED_DAY_ALLOWANCE_CENTS)}
                over-10-hours rate for a specific day.
              </p>
            </div>
            {issued.length > 0 && (
              <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-primary">
                    {issued.length} codes ready for the Jury Officer
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      downloadIssued(issued, batch.replace(/\W+/g, "-").toLowerCase() || "batch")
                    }
                    className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
                  >
                    <Download className="h-4 w-4" /> Download list
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintMode("juror");
                      setSlips(issued);
                    }}
                    className="flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted"
                  >
                    <Ticket className="h-4 w-4" /> Print QR slips
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintMode("officer");
                      setSlips(issued);
                    }}
                    className="flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted"
                  >
                    <ShieldCheck className="h-4 w-4" /> Officer allocation sheet
                  </button>
                </div>
                <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-background p-3 font-mono text-xs">
                  {issued
                    .map((credential) => `${credential.code}  PIN ${credential.pin}`)
                    .join("\n")}
                </pre>
                <p className="mt-2 text-xs font-semibold text-destructive">
                  Print the slips now. PINs cannot be recovered or reprinted after leaving this
                  page; a lost slip must be deactivated and replaced.
                </p>
              </div>
            )}
          </form>
        ) : (
          <div className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">Staff read-only access</p>
            <p className="mt-1">
              A manager using MFA must issue, extend, reactivate or increase a voucher allowance.
            </p>
          </div>
        )}

        {/* Register */}
        <div className="mt-8 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">Voucher register</p>
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code or batch"
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
                No voucher codes yet — issue a batch above.
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
            Every issue, opt-in, redemption and extension — anonymous codes only, no personal data.
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

      {slips.length > 0 && (
        <div className="fixed inset-0 z-50 overflow-auto bg-background p-6 print:p-0">
          <style>{`@media print { .no-print { display: none !important; } }`}</style>
          <div className="no-print mx-auto mb-6 flex max-w-4xl flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">
              {printMode === "officer"
                ? `Jury Officer allocation register — ${slips.length} codes`
                : `${slips.length} juror security slip${slips.length === 1 ? "" : "s"}`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                Print
              </button>
              <button
                onClick={() => setSlips([])}
                className="h-10 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted"
              >
                Close
              </button>
            </div>
          </div>
          {printMode === "officer" ? (
            <div className="mx-auto max-w-5xl bg-white p-8 text-neutral-950">
              <h1 className="text-2xl font-black">Café 1 Juror Voucher Allocation Register</h1>
              <p className="mt-2 text-sm">
                Jury Officer copy. Write the juror&apos;s name against the code issued to them and
                keep this register securely within HMCTS. Café 1 receives the anonymous code only
                and does not receive this name list.
              </p>
              <p className="mt-2 text-sm font-semibold">
                Batch: {batch} · Slips 1–{slips.length} · {slips.length} code
                {slips.length === 1 ? "" : "s"} issued · Printed {new Date().toLocaleString()}
              </p>
              <p className="mt-2 text-sm">
                Hand the slips out in order, top to bottom. Jurors do not choose their code and Café
                1 does not choose who receives it — the next unused slip simply goes to the next
                juror. Tick each one off here as it is handed over so the number issued always
                reconciles with the number printed.
              </p>
              <table className="mt-4 w-full border-collapse text-sm">
                <tbody>
                  <tr>
                    <td className="border border-neutral-500 p-2 font-semibold">
                      Received by (Jury Officer)
                    </td>
                    <td className="h-10 w-1/4 border border-neutral-400 p-2">&nbsp;</td>
                    <td className="border border-neutral-500 p-2 font-semibold">Signature</td>
                    <td className="h-10 w-1/4 border border-neutral-400 p-2">&nbsp;</td>
                  </tr>
                  <tr>
                    <td className="border border-neutral-500 p-2 font-semibold">Date received</td>
                    <td className="h-10 border border-neutral-400 p-2">&nbsp;</td>
                    <td className="border border-neutral-500 p-2 font-semibold">
                      Slips returned unused
                    </td>
                    <td className="h-10 border border-neutral-400 p-2">&nbsp;</td>
                  </tr>
                </tbody>
              </table>
              <table className="mt-6 w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border border-neutral-500 p-2 text-left">Slip</th>
                    <th className="border border-neutral-500 p-2 text-left">Voucher code</th>
                    <th className="border border-neutral-500 p-2 text-left">Juror name</th>
                    <th className="border border-neutral-500 p-2 text-left">
                      Issued / replacement note
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {slips.map((credential, index) => (
                    <tr key={credential.code} className="break-inside-avoid">
                      <td className="border border-neutral-400 p-2 font-mono">{index + 1}</td>
                      <td className="border border-neutral-400 p-2 font-mono font-bold">
                        {credential.code}
                      </td>
                      <td className="h-10 border border-neutral-400 p-2">&nbsp;</td>
                      <td className="border border-neutral-400 p-2">&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-xs">
                Retention: keep this register only as long as HMCTS requires for audit, then destroy
                it securely. It is the only document anywhere that links a name to a code.
              </p>
            </div>
          ) : (
            <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3">
              {slips.map((credential) => (
                <div
                  key={credential.code}
                  className="break-inside-avoid rounded-xl border border-border p-4 text-center"
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                    Café 1 juror voucher
                  </p>
                  <div className="mt-2 flex justify-center">
                    <QrCode
                      value={slipUrl(credential.code)}
                      size={150}
                      alt={`QR code for juror voucher ${credential.code}`}
                    />
                  </div>
                  <p className="mt-2 font-mono text-sm font-bold">{credential.code}</p>
                  <p className="mt-1 rounded-lg bg-neutral-900 px-2 py-1.5 font-mono text-lg font-black tracking-[0.25em] text-white">
                    PIN {credential.pin}
                  </p>
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                    Keep both details private. Scan to order or present the code and PIN at the
                    till. {money(JUROR_DAILY_ALLOWANCE_CENTS)} each sitting day; unused value
                    expires nightly and has no cash value.
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
