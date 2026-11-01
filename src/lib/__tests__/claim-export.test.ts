import { describe, expect, it } from "vitest";
import { csvClaimCell, escapeClaimHtml } from "@/lib/claim-export";

describe("court claim export encoding", () => {
  it("prevents spreadsheet formulas in voucher identifiers", () => {
    expect(csvClaimCell("=1+2")).toBe(`"'=1+2"`);
    expect(csvClaimCell(" +SUM(A1:A3)")).toBe(`"' +SUM(A1:A3)"`);
    expect(csvClaimCell("@cmd")).toBe(`"'@cmd"`);
    expect(csvClaimCell("-5")).toBe(`"'-5"`);
    expect(csvClaimCell("123456")).toBe('"123456"');
  });

  it("escapes quoted fields, newlines and commas without losing data", () => {
    expect(csvClaimCell('A,"B"')).toBe('"A,""B"""');
    expect(csvClaimCell("A\\nB")).toBe('"A\\nB"');
  });

  it("does not render injected markup in daily claim email", () => {
    expect(escapeClaimHtml('<img src=x onerror="x">&')).toBe(
      "&lt;img src=x onerror=&quot;x&quot;&gt;&amp;",
    );
  });
});
