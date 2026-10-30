import { describe, it, expect } from "vitest";
import {
  calendarPeriod,
  londonDay,
  syncHealth,
  openShiftWarning,
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

describe("attendance attention indicators", () => {
  it("opens the London start date even across BST midnight", () => {
    expect(londonDay("2026-06-30T23:30:00Z")).toBe("2026-07-01");
    expect(londonDay("2026-10-25T01:30:00Z")).toBe("2026-10-25");
  });
  it("distinguishes absent, stale, fresh and invalid future sync evidence", () => {
    const now = Date.parse("2026-10-29T12:00:00Z");
    expect(syncHealth(null, now)).toBe("No confirmed sync");
    expect(syncHealth("invalid", now)).toBe("No confirmed sync");
    expect(syncHealth("2026-10-29T11:55:00Z", now)).toBe("Recently synced");
    expect(syncHealth("2026-10-29T11:54:59Z", now)).toBe("No sync in over 5 minutes");
    expect(syncHealth("2026-10-29T12:02:00Z", now)).toBe("Check phone/server time");
  });
  it("flags long open shifts without inventing a departure", () => {
    const now = Date.parse("2026-10-29T12:00:00Z");
    expect(openShiftWarning("2026-10-28T17:59:59Z", now)).toMatch(/correction needed/);
    expect(openShiftWarning("2026-10-29T08:00:00Z", now)).toMatch(/confirm arrival/);
    expect(openShiftWarning("2026-10-30T08:00:00Z", now)).toMatch(/Check recorded/);
  });
});
