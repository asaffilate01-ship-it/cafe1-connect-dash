import { describe, expect, it } from "vitest";
import {
  courtWeekForDate,
  cafeClaimsFromCsv,
  dailyClaimTotals,
  duplicateClaimsAgainstCourt,
  externalClaimsFromCsv,
  jurorIdsFromRows,
  parseCsv,
  normalizeCourtDate,
} from "@/lib/juror-claims";

describe("Cafe 1 daily juror claims", () => {
  const transactions = [
    { for_date:"2026-11-02",voucher_code:"J-123",order_number:10,amount_cents:300,redeemed_at:"2026-11-02T11:00:00Z" },
    { for_date:"2026-11-02",voucher_code:"j-123",order_number:11,amount_cents:271,redeemed_at:"2026-11-02T12:00:00Z" },
    { for_date:"2026-11-03",voucher_code:"J-123",order_number:12,amount_cents:250,redeemed_at:"2026-11-03T11:00:00Z" },
  ];
  it("groups two meals on one day into one actual £5.71 claim", () => {
    expect(dailyClaimTotals(transactions)).toEqual([
      { date:"2026-11-02",juror_id:"J-123",transactions:2,total_cents:571 },
      { date:"2026-11-03",juror_id:"J-123",transactions:1,total_cents:250 },
    ]);
  });
  it("reimports the actual daily lump-sum CSV including its TOTAL footer", () => {
    const csv = [
      "Date,Juror ID,Transactions,Amount claimed GBP",
      "2026-11-02,J-123,2,5.71",
      "2026-11-03,J-123,1,2.50",
      ",TOTAL,3,8.21",
    ].join("\n");
    expect(cafeClaimsFromCsv(csv)).toEqual([
      { date:"2026-11-02",juror_id:"J-123",transactions:2,total_cents:571 },
      { date:"2026-11-03",juror_id:"J-123",transactions:1,total_cents:250 },
    ]);
  });
  it("never includes an unused daily allowance", () => {
    expect(dailyClaimTotals([])).toEqual([]);
  });
  it("rejects zero or negative redemptions", () => {
    expect(() => dailyClaimTotals([{...transactions[0],amount_cents:0}])).toThrow();
  });
  it("derives Monday-Friday court week from weekday and Sunday dates", () => {
    expect(courtWeekForDate("2026-11-05")).toEqual({from:"2026-11-02",to:"2026-11-06"});
    expect(courtWeekForDate("2026-11-08")).toEqual({from:"2026-11-02",to:"2026-11-06"});
  });
  it("parses quoted Excel CSV values without losing IDs", () => {
    const rows=parseCsv('\uFEFF"Juror ID","Court"\r\n"J-001","St Albans, Crown"\r\n"J-002","St Albans Magistrates"\r\n');
    expect(jurorIdsFromRows(rows)).toEqual(["J-001","J-002"]);
  });
  it("selects the actual Juror ID column in an Excel worksheet", () => {
    expect(jurorIdsFromRows([["Scheduled","Juror ID","Name"],["Monday","J-001","A"],["Tuesday","J-002","B"]])).toEqual(["J-001","J-002"]);
  });
  it("does not accidentally import a name column as a Juror ID", () => {
    expect(() => jurorIdsFromRows([["Name","Juror number unknown"],["Alice","J-123"]]))
      .toThrow("Juror ID");
  });
  it("supports simple headerless one-column IDs", () => {
    expect(jurorIdsFromRows([["J-001"], ["J-002"]])).toEqual(["J-001", "J-002"]);
  });

  it("flags only cross-system paid-claim overlap, not two legitimate Cafe orders", () => {
    const cafe=dailyClaimTotals(transactions);
    expect(duplicateClaimsAgainstCourt(cafe, [
      {juror_id:"J-123",date:"2026-11-02",amount_cents:571},
    ])).toEqual([{
      juror_id:"J-123",date:"2026-11-02",cafe_cents:571,
      cafe_transactions:2,external_records:1,external_cents:571,
    }]);
  });
  it("stops unknown court payment states instead of silently reporting no duplicate", () => {
    expect(() => externalClaimsFromCsv(
      "Juror ID,Date,Status\\nJ-123,2026-11-02,mystery".replace("\\n", "\n"),
    )).toThrow("Unknown HMCTS payment status");
  });

  it("reads UK day-first court expense dates and rejects impossible dates", () => {
    expect(normalizeCourtDate("02/11/2026")).toBe("2026-11-02");
    expect(normalizeCourtDate("2-11-2026")).toBe("2026-11-02");
    expect(() => normalizeCourtDate("31/02/2026")).toThrow();
  });

  it("filters out pending expense records and accepts valid paid claim CSV", () => {
    expect(externalClaimsFromCsv('Juror ID,Date,Amount GBP,Status\nJ-123,2026-11-02,5.71,paid\nJ-124,2026-11-02,5.71,pending')).toEqual([
      { juror_id:"J-123",date:"2026-11-02",amount_cents:571 },
    ]);
  });
});
