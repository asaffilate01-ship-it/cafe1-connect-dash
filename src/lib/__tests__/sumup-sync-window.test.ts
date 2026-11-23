import { describe, expect, it } from "vitest";
import { isLateSumupSale, sumupSyncSince } from "../sumup-sync-window";

const now = new Date("2026-11-23T09:30:00Z");

describe("sumupSyncSince", () => {
  it("looks back 24 hours when the sweep has been running normally", () => {
    const last = new Date("2026-11-23T09:29:40Z");
    expect(sumupSyncSince(now, last).toISOString()).toBe("2026-11-22T09:30:00.000Z");
  });

  it("looks back 24 hours when there is no record of a completed sweep", () => {
    expect(sumupSyncSince(now, null).toISOString()).toBe("2026-11-22T09:30:00.000Z");
  });

  it("resumes from the last completed sweep (minus 10 minutes) after a gap of days", () => {
    const last = new Date("2026-11-19T13:21:00Z");
    expect(sumupSyncSince(now, last).toISOString()).toBe("2026-11-19T13:11:00.000Z");
  });

  it("never looks back more than 7 days", () => {
    const last = new Date("2026-10-01T00:00:00Z");
    expect(sumupSyncSince(now, last).toISOString()).toBe("2026-11-16T09:30:00.000Z");
  });
});

describe("isLateSumupSale", () => {
  it("treats a sale from 20 November as late when imported on 23 November", () => {
    expect(isLateSumupSale("2026-11-20T13:57:20Z", now)).toBe(true);
  });

  it("sends a sale from 2 hours ago to the kitchen as normal", () => {
    expect(isLateSumupSale("2026-11-23T07:30:00Z", now)).toBe(false);
  });
});
