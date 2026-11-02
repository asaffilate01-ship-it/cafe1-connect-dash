import { describe, expect, it } from "vitest";
import {
  isValidIsoDate,
  isWeekdayIsoDate,
  londonIsoDate,
  londonVoucherTime,
  MAX_JUROR_IDS_PER_BATCH,
  parseJurorIdBatch,
} from "@/lib/juror-operations";

describe("juror operations safeguards", () => {
  it("keeps real Juror IDs intact and deduplicates case-insensitively", () => {
    expect(parseJurorIdBatch("j-123, J-123\nABC9;ABC9\nZ-999")).toEqual({
      ids: ["J-123", "ABC9", "Z-999"],
      invalid: [],
      duplicateCount: 2,
    });
  });

  it("flags malformed IDs rather than silently changing them", () => {
    expect(parseJurorIdBatch("J/ABC\n=SUM(A1)\nVALID-9")).toEqual({
      ids: ["VALID-9"],
      invalid: ["J/ABC", "=SUM(A1)"],
      duplicateCount: 0,
    });
  });

  it("does not impose a hidden batch truncation", () => {
    const entries = Array.from({ length: MAX_JUROR_IDS_PER_BATCH + 1 }, (_, i) => "J" + String(i).padStart(4, "0"));
    expect(parseJurorIdBatch(entries.join("\n")).ids).toHaveLength(501);
  });

  it("validates calendar dates, not just the YYYY-MM-DD shape", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-11-02")).toBe(true);
  });

  it("does not treat a weekend as a sitting day", () => {
    expect(isWeekdayIsoDate("2026-11-02")).toBe(true);
    expect(isWeekdayIsoDate("2026-11-01")).toBe(false);
    expect(isWeekdayIsoDate("2026-11-07")).toBe(false);
  });

  it("uses the court's UK calendar day around BST/UTC transitions", () => {
    expect(londonIsoDate(new Date("2026-07-01T23:30:00.000Z"))).toBe("2026-07-02");
    expect(londonIsoDate(new Date("2026-11-01T00:30:00.000Z"))).toBe("2026-11-01");
  });

  it("prints London court-local timestamps in both seasons", () => {
    expect(londonVoucherTime("2026-07-01T11:30:00Z")).toBe("12:30");
    expect(londonVoucherTime("2026-11-02T11:30:00Z")).toBe("11:30");
    expect(londonVoucherTime("not-a-date")).toBe("—");
  });
});
