/**
 * Pure, display-safe helpers for the Café 1 court juror scheme.
 * These are UI safeguards; authoritative eligibility and balance checks
 * remain with the server/database RPCs.
 */
export const MAX_JUROR_IDS_PER_BATCH = 500;

export type ParsedJurorIdBatch = {
  ids: string[];
  invalid: string[];
  duplicateCount: number;
};

export function parseJurorIdBatch(text: string): ParsedJurorIdBatch {
  const ids: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;

  for (const source of text.split(/[\s,;]+/).filter(Boolean)) {
    const code = source.trim().toUpperCase();
    // Do not silently mutate IDs supplied by the Jury Office. A malformed
    // reference must be corrected before activating a real voucher.
    if (!/^[A-Z0-9-]{3,40}$/.test(code)) {
      invalid.push(source);
      continue;
    }
    if (seen.has(code)) {
      duplicateCount++;
      continue;
    }
    seen.add(code);
    ids.push(code);
  }

  return { ids, invalid, duplicateCount };
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Calendar date at the court, including BST near UTC midnight. */
export function londonIsoDate(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (name: string) => parts.find((p) => p.type === name)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}

export function isWeekdayIsoDate(value: string): boolean {
  if (!isValidIsoDate(value)) return false;
  const day = new Date(value + "T12:00:00.000Z").getUTCDay();
  return day >= 1 && day <= 5;
}

export function londonVoucherTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
