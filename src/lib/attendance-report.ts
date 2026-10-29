import type { AttendanceDashboard } from "./attendance.functions";
export type Shift = AttendanceDashboard["entries"][number];
export type ReviewFilter = "all" | "open" | "pending" | "approved" | "missing_rate";
export function filterShifts(rows: Shift[], staffId: string, review: ReviewFilter) {
  return rows.filter(
    (row) =>
      (!staffId || row.staff_id === staffId) &&
      (review === "all" ||
        (review === "open" && !row.clocked_out_at) ||
        (review === "pending" && !row.approved_at) ||
        (review === "approved" && !!row.approved_at) ||
        (review === "missing_rate" && !!row.clocked_out_at && row.estimated_pay_cents === null)),
  );
}
export function staffTotals(rows: Shift[]) {
  const totals = new Map<
    string,
    {
      id: string;
      name: string;
      shifts: number;
      minutes: number;
      approved: number;
      pending: number;
      open: number;
      missingRates: number;
    }
  >();
  for (const row of rows) {
    const total = totals.get(row.staff_id) ?? {
      id: row.staff_id,
      name: row.staff_name || "Unnamed staff",
      shifts: 0,
      minutes: 0,
      approved: 0,
      pending: 0,
      open: 0,
      missingRates: 0,
    };
    total.shifts++;
    if (row.clocked_out_at) total.minutes += row.paid_minutes ?? 0;
    else total.open++;
    if (row.approved_at) total.approved += row.approved_pay_cents ?? 0;
    else total.pending++;
    if (row.clocked_out_at && row.estimated_pay_cents === null) total.missingRates++;
    totals.set(row.staff_id, total);
  }
  return [...totals.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}
export function reportCsv(rows: (string | number)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map(
            (value) =>
              '"' +
              String(value)
                .replace(/^[\s]*[=+@-]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n")
  );
}
export function calendarPeriod(period: "week" | "previous_week" | "month", now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const date = new Date(day + "T12:00:00Z");
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (period === "month") return { from: day.slice(0, 8) + "01", to: day };
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  if (period === "week") return { from: iso(date), to: day };
  const end = new Date(date);
  end.setUTCDate(end.getUTCDate() - 1);
  date.setUTCDate(date.getUTCDate() - 7);
  return { from: iso(date), to: iso(end) };
}

export function londonDay(timestamp: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

export function syncHealth(lastSeen: string | null, now = Date.now()) {
  const captured = lastSeen ? Date.parse(lastSeen) : NaN;
  if (!Number.isFinite(captured)) return "No confirmed sync";
  if (captured > now + 60000) return "Check phone/server time";
  return now - captured > 5 * 60000 ? "No sync in over 5 minutes" : "Recently synced";
}

export function openShiftWarning(started: string, now = Date.now()) {
  const start = Date.parse(started);
  if (!Number.isFinite(start) || start > now) return "Check recorded start time";
  return now - start > 18 * 3600000
    ? "Open over 18 hours — manager correction needed"
    : "Open — confirm arrival and departure against your timesheet";
}
