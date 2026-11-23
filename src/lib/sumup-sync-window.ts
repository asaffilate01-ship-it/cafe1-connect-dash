/**
 * How far back the SumUp till sweep looks, and how late sales are filed.
 *
 * The sweep only runs while a kitchen screen is open. When no screen ran for
 * a day or more (shop closed early, screen signed out, database asleep), a
 * fixed 24-hour look-back silently lost those sales for good. The sweep now
 * resumes from the last fully completed sweep, within a hard cap.
 */

export const NORMAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
export const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
/** Overlap with the previous sweep so a sale on the boundary is never missed. */
export const RESUME_OVERLAP_MS = 10 * 60 * 1000;
/** A sale this old when first imported goes straight to the history, not the kitchen. */
export const LATE_SALE_MS = 3 * 60 * 60 * 1000;

export function sumupSyncSince(now: Date, lastCompletedAt: Date | null): Date {
  const normal = now.getTime() - NORMAL_LOOKBACK_MS;
  const floor = now.getTime() - MAX_LOOKBACK_MS;
  if (!lastCompletedAt || Number.isNaN(lastCompletedAt.getTime())) return new Date(normal);
  const resume = lastCompletedAt.getTime() - RESUME_OVERLAP_MS;
  return new Date(Math.max(floor, Math.min(normal, resume)));
}

/** Late sales were served long ago: file them as completed, dated when they were sold. */
export function isLateSumupSale(saleTimestamp: string | undefined, now: Date): boolean {
  if (!saleTimestamp) return false;
  const at = new Date(saleTimestamp).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at > LATE_SALE_MS;
}
