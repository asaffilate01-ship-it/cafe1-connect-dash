import { isValidIsoDate } from "./juror-operations";

export type ClaimTransaction = {
  for_date: string;
  voucher_code: string;
  order_number: number;
  amount_cents: number;
  redeemed_at: string;
};

export type ClaimDailyTotal = {
  date: string;
  juror_id: string;
  transactions: number;
  total_cents: number;
};

/** Two orders by one juror on one day count as ONE daily funded claim. */
export function dailyClaimTotals(rows: ClaimTransaction[]): ClaimDailyTotal[] {
  const totals = new Map<string, ClaimDailyTotal>();
  for (const row of rows) {
    if (!isValidIsoDate(row.for_date) || !/^[a-z0-9-]{3,40}$/i.test(row.voucher_code)) {
      throw new Error("Claim rows have an invalid date or Juror ID");
    }
    if (!Number.isSafeInteger(row.amount_cents) || row.amount_cents <= 0) {
      throw new Error("Claim rows must include actual positive redemptions");
    }
    const id = row.voucher_code.trim().toUpperCase();
    const key = row.for_date + "\u0000" + id;
    const current = totals.get(key) ?? {
      date: row.for_date, juror_id: id, transactions: 0, total_cents: 0,
    };
    current.transactions++;
    current.total_cents += row.amount_cents;
    totals.set(key, current);
  }
  return [...totals.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.juror_id.localeCompare(b.juror_id),
  );
}

export function courtWeekForDate(isoDate: string): { from: string; to: string } {
  if (!isValidIsoDate(isoDate)) throw new Error("Select a valid date");
  const d = new Date(isoDate + "T12:00:00Z");
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  const from = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 4);
  return { from, to: d.toISOString().slice(0, 10) };
}

/** RFC 4180 CSV rows, supporting Excel quoted commas, escaped quotes and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') {
      if (cell !== "") throw new Error("Invalid quoted CSV");
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell); cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = []; cell = "";
    } else cell += ch;
  }
  if (inQuotes) throw new Error("Unterminated CSV quotation");
  if (row.length || cell.length) {
    row.push(cell);
    if (row.some((v) => v.length > 0)) rows.push(row);
  }
  if (rows.length > 10000) throw new Error("Too many CSV rows");
  return rows;
}

const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
const idHeaders = new Set(["jurorid", "jurornumber", "jurorreference", "jurorref", "vouchercode", "juroridvouchercode"]);
const dateHeaders = new Set(["date", "fordate", "claimdate", "attendancedate", "day"]);
const amountHeaders = new Set(["amount", "amountgbp", "amountredeemedgbp", "amountclaimedgbp", "claimamount", "claimedamount", "totalgbp"]);
const paidHeaders = new Set(["paid", "claimed", "paymentstatus", "status"]);

/** Extract IDs from a Jury Office worksheet, respecting an explicit Juror ID column. */
export function jurorIdsFromRows(rows: string[][]): string[] {
  if (!rows.length) return [];
  let headerRow = -1, column = 0;
  for (let j = 0; j < Math.min(rows.length, 12); j++) {
    const idx = rows[j].findIndex((v) => idHeaders.has(normalize(v)));
    if (idx >= 0) { headerRow = j; column = idx; break; }
  }
  const data = rows.slice(headerRow + 1);
  if (data.length > 10000) throw new Error("Too many Juror IDs in file");
  return data.map((cells) => (cells[column] ?? "").trim()).filter(Boolean);
}

export type ExternalPaidClaim = { juror_id: string; date: string; amount_cents?: number };
/** Court-provided expense-paid file, checked locally in the browser only. */
export function externalClaimsFromCsv(text: string): ExternalPaidClaim[] {
  const rows = parseCsv(text);
  const head = rows[0]?.map(normalize) ?? [];
  const col = (headers: Set<string>) => head.findIndex((h) => headers.has(h));
  const id = col(idHeaders), date = col(dateHeaders), amount = col(amountHeaders), paid = col(paidHeaders);
  if (id < 0 || date < 0) throw new Error("The comparison file requires Juror ID and Date columns.");
  const result: ExternalPaidClaim[] = [];
  for (const row of rows.slice(1)) {
    const code = (row[id] ?? "").trim().toUpperCase();
    const d = (row[date] ?? "").trim();
    if (!code || !d) continue;
    if (!/^[A-Z0-9-]{3,40}$/.test(code) || !isValidIsoDate(d)) {
      throw new Error("Invalid Juror ID or ISO date in comparison file.");
    }
    const paidStatus = paid >= 0 ? (row[paid] ?? "").toLowerCase().trim() : "";
    if (paidStatus && !["paid", "claimed", "approved", "yes", "true", "1"].includes(paidStatus)) continue;
    const amountNumber = amount >= 0 ? Number((row[amount] ?? "").replace(/[£,\s]/g, "")) : NaN;
    result.push({ juror_id: code, date: d,
      amount_cents: Number.isFinite(amountNumber) && amountNumber > 0 ? Math.round(amountNumber * 100) : undefined });
  }
  return result;
}

/** An overlap is NOT inferred from multiple Café 1 orders on one day. */
export function duplicateClaimsAgainstCourt(
  cafeDaily: ClaimDailyTotal[], courtPaid: ExternalPaidClaim[],
) {
  const paid = new Map<string, ExternalPaidClaim[]>();
  for (const row of courtPaid) {
    const key = row.date + "\u0000" + row.juror_id.toUpperCase();
    paid.set(key, [...(paid.get(key) ?? []), row]);
  }
  return cafeDaily.flatMap((row) => {
    const matches = paid.get(row.date + "\u0000" + row.juror_id);
    return matches?.length ? [{
      juror_id: row.juror_id, date: row.date, cafe_cents: row.total_cents,
      cafe_transactions: row.transactions, external_records: matches.length,
      external_cents: matches.reduce((a, v) => a + (v.amount_cents ?? 0), 0),
    }] : [];
  });
}


/** Accepts either the daily-summary export or the fully itemised transaction CSV. */
export function cafeClaimsFromCsv(text: string): ClaimDailyTotal[] {
  const rows = parseCsv(text);
  const head = rows[0]?.map(normalize) ?? [];
  const dateColumn = head.findIndex((h) => dateHeaders.has(h));
  const idColumn = head.findIndex((h) => idHeaders.has(h));
  const amountColumn = head.findIndex((h) => amountHeaders.has(h));
  const transactionsColumn = head.indexOf("transactions");
  if (dateColumn < 0 || idColumn < 0 || amountColumn < 0) {
    throw new Error("Café 1 file needs Date, Juror ID and Amount columns.");
  }
  const combined = new Map<string, ClaimDailyTotal>();
  for (const row of rows.slice(1)) {
    const date = (row[dateColumn] ?? "").trim();
    const jurorId = (row[idColumn] ?? "").trim().toUpperCase();
    if (!date && !jurorId) continue;
    if (!isValidIsoDate(date) || !/^[A-Z0-9-]{3,40}$/.test(jurorId)) {
      throw new Error("Café 1 claim file contains an invalid date or Juror ID.");
    }
    const pounds = Number((row[amountColumn] ?? "").replace(/[£,\s]/g, ""));
    const amountCents = Math.round(pounds * 100);
    if (!Number.isFinite(pounds) || amountCents <= 0) throw new Error("Invalid claim amount");
    const count = transactionsColumn >= 0 ? Number(row[transactionsColumn]) : 1;
    if (!Number.isSafeInteger(count) || count < 1) throw new Error("Invalid transaction count");
    const key = date + "\u0000" + jurorId;
    const current = combined.get(key) ?? {
      date, juror_id: jurorId, transactions: 0, total_cents: 0,
    };
    current.transactions += count;
    current.total_cents += amountCents;
    combined.set(key, current);
  }
  return [...combined.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.juror_id.localeCompare(b.juror_id),
  );
}
