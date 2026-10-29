import { describe, it, expect } from "vitest";
import {
  calendarPeriod,
  filterShifts,
  reportCsv,
  staffTotals,
  type Shift,
} from "../attendance-report";
const shift = (overrides: Partial<Shift> = {}): Shift => ({
  id: "s1",
  staff_id: "a",
  staff_name: "Alex",
  clocked_in_at: "2026-10-26T08:00:00Z",
  clocked_out_at: "2026-10-26T16:00:00Z",
  break_minutes: 30,
  paid_minutes: 450,
  estimated_pay_cents: 9000,
  approved_pay_cents: null,
  approved_at: null,
  ...overrides,
});
describe("attendance reports", () => {
  it("separates people with identical names and keeps unapproved pay out of approved totals", () => {
    const rows = [
      shift(),
      shift({ id: "s2", approved_at: "2026-10-27", approved_pay_cents: 8500 }),
      shift({
        id: "s3",
        staff_id: "b",
        clocked_out_at: null,
        paid_minutes: null,
        estimated_pay_cents: null,
      }),
    ];
    expect(staffTotals(rows)).toEqual([
      {
        id: "a",
        name: "Alex",
        shifts: 2,
        minutes: 900,
        approved: 8500,
        pending: 1,
        open: 0,
        missingRates: 0,
      },
      {
        id: "b",
        name: "Alex",
        shifts: 1,
        minutes: 0,
        approved: 0,
        pending: 1,
        open: 1,
        missingRates: 0,
      },
    ]);
  });
  it("filters missing rates without counting open shifts as missing rates", () => {
    const rows = [
      shift({ estimated_pay_cents: null }),
      shift({ id: "open", clocked_out_at: null, estimated_pay_cents: null }),
      shift({ id: "other", staff_id: "b" }),
    ];
    expect(filterShifts(rows, "a", "missing_rate").map((r) => r.id)).toEqual(["s1"]);
    expect(filterShifts(rows, "", "open").map((r) => r.id)).toEqual(["open"]);
    expect(filterShifts(rows, "a", "pending")).toHaveLength(2);
  });
  it("quotes spreadsheet formulas, commas, quotes and line breaks", () => {
    expect(reportCsv([[" =SUM(A1)", 'Alex, "A"', "line\nnext", 0]])).toBe(
      '\uFEFF"\' =SUM(A1)","Alex, ""A""","line\nnext","0"',
    );
  });
  it("uses London dates during BST and Monday weeks across years", () => {
    expect(calendarPeriod("month", new Date("2026-06-30T23:30:00Z"))).toEqual({
      from: "2026-07-01",
      to: "2026-07-01",
    });
    expect(calendarPeriod("week", new Date("2026-01-01T12:00Z"))).toEqual({
      from: "2025-12-29",
      to: "2026-01-01",
    });
    expect(calendarPeriod("previous_week", new Date("2026-10-26T00:30Z"))).toEqual({
      from: "2026-10-19",
      to: "2026-10-25",
    });
  });
});
