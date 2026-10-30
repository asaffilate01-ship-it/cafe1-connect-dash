import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RequireRole } from "@/components/require-role";
import { AdminNav } from "@/components/admin-nav";
import { SiteSwitcher } from "@/components/site-switcher";
import { InstallAppButton } from "@/components/install-app-button";
import { AttendanceBoundary } from "@/components/attendance-boundary";
import { attendance, openAttendance, type BoundaryPoint } from "@/lib/attendance.functions";
import { useSession } from "@/hooks/use-auth";
import { AdminMfaCard } from "@/components/admin-mfa-card";
import { useSites } from "@/hooks/use-sites";
import { money } from "@/lib/format";
import {
  calendarPeriod,
  londonDay,
  syncHealth,
  openShiftWarning,
  filterShifts,
  reportCsv,
  staffTotals,
  type ReviewFilter,
} from "@/lib/attendance-report";
import { toast } from "sonner";
export const Route = createFileRoute("/staff-hours")({
  head: () => ({
    meta: [{ title: "My hours & pay | Café 1" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <RequireRole roles={["admin", "staff", "driver"]} next="/staff-hours">
      <Hours />
    </RequireRole>
  ),
});
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const input = "rounded-lg border p-2";
function Hours() {
  const sites = useSites();
  const { user } = useSession();
  const rpc = useServerFn(attendance);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [manualReason, setManualReason] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [busy, setBusy] = useState(false);
  const result = useQuery({
    queryKey: ["attendance", user?.id, sites.siteId, from, to],
    enabled: !!sites.siteId && !!user,
    gcTime: 0,
    refetchInterval: 60000,
    queryFn: () =>
      rpc({ data: { action: "dashboard", data: { site_id: sites.siteId, from, to } } }),
  });
  const openRpc = useServerFn(openAttendance);
  const openResult = useQuery({
    queryKey: ["attendance-open", user?.id, sites.siteId],
    enabled: !!sites.siteId && !!user,
    gcTime: 0,
    refetchInterval: 60000,
    queryFn: () => openRpc({ data: { siteId: sites.siteId } }),
  });
  const d = result.data;
  const [boundary, setBoundary] = useState<BoundaryPoint[] | null>(null);
  const [note, setNote] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [staff, setStaff] = useState("");
  const [rate, setRate] = useState("");
  const [effective, setEffective] = useState(today);
  const [edit, setEdit] = useState<{
    id: string;
    staffId?: string;
    start: string;
    end: string;
    breaks: string;
    reason: string;
  } | null>(null);
  async function save(
    action:
      | "boundary"
      | "device"
      | "rate"
      | "approve"
      | "correct"
      | "create"
      | "manual_in"
      | "manual_out",
    data: Record<string, unknown>,
  ) {
    setBusy(true);
    try {
      await rpc({ data: { action, data: { ...data, site_id: sites.siteId } } });
      const refreshed = await Promise.all([result.refetch(), openResult.refetch()]);
      if (refreshed.some((query) => query.isError))
        toast.warning(
          "Saved, but records could not refresh. Reconnect and refresh before reviewing totals.",
        );
      else toast.success("Saved");
      setEdit(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  const entries = filterShifts(d?.entries ?? [], staffFilter, reviewFilter);
  const summaries = staffTotals(entries);
  const approved = entries.reduce((s, e) => s + (e.approved_pay_cents ?? 0), 0);
  const minutes = entries.reduce((s, e) => s + (e.paid_minutes ?? 0), 0);
  function period(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - days + 1);
    setFrom(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date),
    );
    setTo(today());
  }
  function csv() {
    const rows = [
      [
        "Staff",
        "Clock in",
        "Clock out",
        "Break minutes",
        "Paid minutes",
        "Estimated gross GBP",
        "Approved gross GBP",
        "Approved at",
      ],
      ...entries.map((e) => [
        e.staff_name,
        e.clocked_in_at,
        e.clocked_out_at ?? "",
        e.break_minutes,
        e.paid_minutes ?? "",
        e.estimated_pay_cents === null ? "" : (e.estimated_pay_cents / 100).toFixed(2),
        e.approved_pay_cents === null ? "" : (e.approved_pay_cents / 100).toFixed(2),
        e.approved_at ?? "",
      ]),
    ];
    download(reportCsv(rows), `cafe1-hours-${from}-${to}.csv`);
  }
  function download(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(u);
  }
  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Hours & pay</h1>
            <p>Your attendance records and gross pay, before payroll deductions.</p>
          </div>
          <InstallAppButton manifest="/staff-hours.webmanifest" label="Install hours app" />
        </div>
        <SiteSwitcher
          {...{
            sites: sites.sites,
            siteId: sites.siteId,
            onChange: (id: string) => {
              sites.setSiteId(id);
              setBoundary(null);
              setNote("");
              setEnabled(false);
              setEdit(null);
              setStaffFilter("");
              setReviewFilter("all");
            },
            loading: sites.loading,
            error: sites.error,
          }}
        />
        <section className="rounded-xl border bg-muted/30 p-4">
          <strong>Automatic attendance uses the mobile companion app.</strong>
          <p>
            The installed web app shows your records. Background tracking needs the separately
            installed, approved phone companion. If tracking stops or accuracy is poor, your shift
            is not automatically closed. Tell your manager about a missing or incorrect record.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <label>
              Manual clocking reason{" "}
              <input
                className={input}
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                placeholder="For example: phone battery flat"
              />
            </label>
            <button
              className={input}
              disabled={busy || manualReason.trim().length < 5}
              onClick={() => save("manual_in", { reason: manualReason })}
            >
              Clock in now
            </button>
            <button
              className={input}
              disabled={busy || manualReason.trim().length < 5}
              onClick={() => save("manual_out", { reason: manualReason })}
            >
              Clock out now
            </button>
          </div>
        </section>
        <section
          className="space-y-3 rounded-xl border p-4"
          aria-label="Open shifts across all dates"
        >
          <h2 className="text-xl font-bold">Open shifts — all dates</h2>
          <p>
            These records ignore the report dates and filters below. Missing location does not clock
            anyone out.
          </p>
          {openResult.isPending ? (
            <p>Checking open shifts…</p>
          ) : openResult.isError ? (
            <p role="alert">
              Open shifts could not refresh. Reconnect and check again; this does not mean everyone
              has clocked out.
            </p>
          ) : (
            <>
              <p>Last checked: {new Date(openResult.dataUpdatedAt).toLocaleString("en-GB")}</p>
              {!openResult.data?.entries.length && <p>No open shifts recorded at this site.</p>}
              {openResult.data?.entries.map((entry) => (
                <div key={entry.id} className="rounded border p-3">
                  <strong>
                    {d?.staff.find((person) => person.id === entry.staff_id)?.name ??
                      (entry.staff_id === user?.id ? "Your shift" : "Staff shift")}
                  </strong>
                  <p>
                    Started {new Date(entry.clocked_in_at).toLocaleString("en-GB")} ·{" "}
                    {openShiftWarning(entry.clocked_in_at)}
                  </p>
                  <button
                    className={input}
                    onClick={() => {
                      const date = londonDay(entry.clocked_in_at);
                      setFrom(date);
                      setTo(date);
                      setStaffFilter(entry.staff_id);
                      setReviewFilter("open");
                    }}
                  >
                    View shift in report
                  </button>
                </div>
              ))}
              {openResult.data?.truncated && (
                <p role="alert">
                  Showing the oldest 200 open shifts. Review these first, then refresh for remaining
                  records.
                </p>
              )}
            </>
          )}
          <button
            className={input}
            disabled={openResult.isFetching}
            onClick={() => openResult.refetch()}
          >
            Refresh open shifts
          </button>
        </section>
        <div className="flex flex-wrap items-end gap-3">
          <label>
            From{" "}
            <input
              type="date"
              className={input}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To{" "}
            <input
              type="date"
              className={input}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button className={input} onClick={() => period(1)}>
            Today
          </button>
          <button className={input} onClick={() => period(7)}>
            Last 7 days
          </button>
          <button className={input} onClick={() => period(31)}>
            Last 31 days
          </button>
          {(
            [
              ["week", "This week"],
              ["previous_week", "Last week"],
              ["month", "This month"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={input}
              onClick={() => {
                const range = calendarPeriod(value);
                setFrom(range.from);
                setTo(range.to);
              }}
            >
              {label}
            </button>
          ))}
          {d?.manager && (
            <label>
              Staff{" "}
              <select
                className={input}
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
              >
                <option value="">All staff</option>
                {d.staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Show{" "}
            <select
              className={input}
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value as ReviewFilter)}
            >
              <option value="all">All shifts</option>
              <option value="open">Open shifts</option>
              <option value="pending">Awaiting review</option>
              <option value="approved">Approved</option>
              <option value="missing_rate">Missing rate</option>
            </select>
          </label>
          <button className={input} onClick={() => result.refetch()}>
            Refresh
          </button>
          <button
            disabled={!d || result.isError || result.isFetching}
            className={input}
            onClick={csv}
          >
            Export CSV
          </button>
        </div>
        {result.isPending ? (
          <p>Loading hours…</p>
        ) : result.isError ? (
          <p role="alert">
            Attendance could not refresh: {result.error.message}. Check your connection and sign-in,
            then retry. If this persists, ask your manager to check attendance setup.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border p-5">
                <p>Recorded hours</p>
                <strong className="text-2xl">{(minutes / 60).toFixed(2)}</strong>
              </div>
              <div className="rounded-xl border p-5">
                <p>Approved gross pay</p>
                <strong className="text-2xl">{money(approved)}</strong>
                <p>Approved does not mean payment has been sent.</p>
              </div>
              <div className="rounded-xl border p-5">
                <p>Awaiting review</p>
                <strong className="text-2xl">
                  {entries.filter((e) => !e.approved_at).length} shifts
                </strong>
              </div>
            </div>
            <p>
              Periods include shifts starting on the selected London dates. Open shifts are excluded
              from pay totals. Missing rates display “Rate needed”.
            </p>
            <section className="space-y-3" aria-label="Staff totals">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold">Totals by staff member</h2>
                <button
                  className={input}
                  disabled={!summaries.length}
                  onClick={() =>
                    download(
                      reportCsv([
                        [
                          "Staff ID",
                          "Staff",
                          "Shifts",
                          "Hours",
                          "Approved gross GBP",
                          "Awaiting review",
                          "Open shifts",
                          "Missing rates",
                        ],
                        ...summaries.map((r) => [
                          r.id,
                          r.name,
                          r.shifts,
                          (r.minutes / 60).toFixed(2),
                          (r.approved / 100).toFixed(2),
                          r.pending,
                          r.open,
                          r.missingRates,
                        ]),
                      ]),
                      `cafe1-staff-summary-${from}-${to}.csv`,
                    )
                  }
                >
                  Export staff totals
                </button>
              </div>
              <p>
                Totals and exports follow the selected dates, staff member and review filter.
                Approved gross is not confirmation of payment. Open shifts that started before this
                period are not included.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {summaries.map((r) => (
                  <article key={r.id} className="rounded-xl border p-4">
                    <h3 className="font-bold">{r.name}</h3>
                    <p>
                      {r.shifts} shifts · {(r.minutes / 60).toFixed(2)} hours
                    </p>
                    <p>Approved gross: {money(r.approved)}</p>
                    <p>
                      {r.pending} awaiting review · {r.open} open · {r.missingRates} missing rates
                    </p>
                  </article>
                ))}
              </div>
            </section>
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {[
                      "Staff",
                      "In (London)",
                      "Out (London)",
                      "Breaks",
                      "Hours",
                      "Estimated gross",
                      "Approved gross",
                      "Review",
                    ].map((h) => (
                      <th key={h} className="p-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="p-3">{e.staff_name}</td>
                      <td>
                        {new Date(e.clocked_in_at).toLocaleString("en-GB", {
                          timeZone: "Europe/London",
                        })}
                      </td>
                      <td>
                        {e.clocked_out_at
                          ? new Date(e.clocked_out_at).toLocaleString("en-GB", {
                              timeZone: "Europe/London",
                            })
                          : "Open — review if stale"}
                      </td>
                      <td>{e.break_minutes}m</td>
                      <td>{e.paid_minutes === null ? "—" : (e.paid_minutes / 60).toFixed(2)}</td>
                      <td>
                        {e.estimated_pay_cents === null
                          ? "Rate needed / open"
                          : money(e.estimated_pay_cents)}
                      </td>
                      <td>
                        {e.approved_pay_cents === null ? "Pending" : money(e.approved_pay_cents)}
                      </td>
                      <td>
                        {d?.manager && (
                          <div className="flex gap-2">
                            <button
                              disabled={busy || !e.clocked_out_at || !!e.approved_at}
                              onClick={() => save("approve", { entry_id: e.id })}
                              className={input}
                            >
                              Approve
                            </button>
                            <button
                              className={input}
                              onClick={() =>
                                setEdit({
                                  id: e.id,
                                  start: e.clocked_in_at,
                                  end: e.clocked_out_at ?? new Date().toISOString(),
                                  breaks: String(e.break_minutes),
                                  reason: "",
                                })
                              }
                            >
                              Correct
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!entries.length && <p className="p-4">No shifts recorded in this period.</p>}
            </div>
            {d?.manager && (
              <>
                <AdminMfaCard onAssuranceChange={() => void result.refetch()} />
                <button
                  className={input}
                  disabled={busy}
                  onClick={() =>
                    setEdit({ id: "", staffId: "", start: "", end: "", breaks: "0", reason: "" })
                  }
                >
                  Add missing shift
                </button>
              </>
            )}
            {edit && (
              <form
                className="space-y-3 rounded-xl border p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(edit.id ? "correct" : "create", {
                    staff_id: edit.staffId,
                    entry_id: edit.id,
                    clocked_in_at: edit.start,
                    clocked_out_at: edit.end,
                    break_minutes: Number(edit.breaks),
                    reason: edit.reason,
                  });
                }}
              >
                <h2 className="text-xl font-bold">
                  {edit.id ? "Correct shift" : "Add missing shift"}
                </h2>
                {!edit.id && (
                  <label className="block">
                    Staff member{" "}
                    <select
                      required
                      className={input}
                      value={edit.staffId ?? ""}
                      onChange={(e) => setEdit({ ...edit, staffId: e.target.value })}
                    >
                      <option value="">Choose staff</option>
                      {d?.staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <p>
                  Use ISO timestamps including timezone, e.g. 2026-10-29T08:30:00+00:00. Corrections
                  remove prior approval.
                </p>
                {(
                  [
                    ["start", "Clock in"],
                    ["end", "Clock out"],
                    ["breaks", "Unpaid break minutes"],
                    ["reason", "Reason"],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k} className="block">
                    {l}
                    <input
                      required
                      className={`${input} ml-2`}
                      value={edit[k]}
                      onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                    />
                  </label>
                ))}
                <button className={input} disabled={busy}>
                  Save correction
                </button>
                <button type="button" className={input} onClick={() => setEdit(null)}>
                  Cancel
                </button>
              </form>
            )}
            <section className="space-y-2">
              <h2 className="text-xl font-bold">Approved phones</h2>
              <p>
                A stale sync can mean tracking is paused, the phone is offline, or permissions are
                unavailable. It is not proof of departure; check with the staff member before
                correcting time.
              </p>
              {d?.devices.map((device) => (
                <div
                  key={device.id}
                  className="flex flex-wrap items-center gap-3 rounded border p-3"
                >
                  <strong>{device.label}</strong>
                  <span>{d.staff.find((s) => s.id === device.staff_id)?.name}</span>
                  <span>{device.approved ? "Approved" : "Awaiting approval / revoked"}</span>
                  <span>
                    {syncHealth(device.last_seen_at)} · Last sync:{" "}
                    {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "Never"}
                  </span>
                  {d.manager && (
                    <button
                      disabled={busy}
                      className={input}
                      onClick={() =>
                        save("device", { device_id: device.id, approved: !device.approved })
                      }
                    >
                      {device.approved ? "Revoke" : "Approve phone"}
                    </button>
                  )}
                </div>
              ))}
              {!d?.devices.length && (
                <p>Sign in to the companion app and register a phone to request approval.</p>
              )}
            </section>
            <section>
              <h2 className="text-xl font-bold">Sync exceptions — manager review</h2>
              <p>
                Delayed observations are evidence, not automatic payroll changes. Use the recorded
                times to review the shift.
              </p>
              {d?.exceptions.map((e) => (
                <p key={e.id} className="border-b py-2">
                  {d.staff.find((s) => s.id === e.staff_id)?.name ?? "Your phone"} ·{" "}
                  {new Date(e.captured_at).toLocaleString()} · {e.classification} ·{" "}
                  {e.outcome.replaceAll("_", " ")}
                </p>
              ))}
              {!d?.exceptions.length && <p>No sync exceptions in this period.</p>}
            </section>
            {d?.manager && (
              <>
                <form
                  className="space-y-3 rounded-xl border p-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save("rate", {
                      staff_id: staff,
                      effective_from: effective,
                      hourly_cents: Math.round(Number(rate) * 100),
                    });
                  }}
                >
                  <h2 className="text-xl font-bold">Hourly rates</h2>
                  <label>
                    Staff{" "}
                    <select
                      required
                      className={input}
                      value={staff}
                      onChange={(e) => setStaff(e.target.value)}
                    >
                      <option value="">Choose staff</option>
                      {d.staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {" "}
                    £ per hour{" "}
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0"
                      max="1000"
                      className={input}
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                    />
                  </label>
                  <label>
                    {" "}
                    Effective from{" "}
                    <input
                      required
                      type="date"
                      className={input}
                      value={effective}
                      onChange={(e) => setEffective(e.target.value)}
                    />
                  </label>
                  <button disabled={busy} className={input}>
                    Save rate
                  </button>
                  <p>
                    Rates are effective-dated. Approved pay stays fixed unless a manager corrects
                    and re-approves the shift.
                  </p>
                  {d.rates.map((r) => (
                    <p key={r.staff_id + r.effective_from}>
                      {d.staff.find((s) => s.id === r.staff_id)?.name} · {r.effective_from} ·{" "}
                      {money(r.hourly_cents)}/hour
                    </p>
                  ))}
                </form>
                <form
                  key={sites.siteId}
                  className="space-y-4 rounded-xl border p-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save("boundary", {
                      boundary: boundary ?? d.config?.boundary ?? [],
                      verified_note: note,
                      enabled,
                    });
                  }}
                >
                  <h2 className="text-xl font-bold">Workplace boundary · 5-metre buffer</h2>
                  <p>
                    Current automatic clocking: {d.config?.enabled ? "Enabled" : "Disabled"}. Saving
                    changes creates a new boundary version and resets pending arrival/departure
                    confirmation.
                  </p>
                  <AttendanceBoundary
                    points={boundary ?? d.config?.boundary ?? []}
                    onChange={setBoundary}
                  />
                  <label className="block">
                    On-site verification note
                    <textarea
                      required
                      minLength={10}
                      className={`${input} block w-full`}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Who walked and checked the whole boundary, when, and on which phones?"
                    />
                  </label>
                  <label className="block">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                    />{" "}
                    Enable automatic clocking after on-site verification
                  </label>
                  <button disabled={busy} className={input}>
                    Save boundary
                  </button>
                </form>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
