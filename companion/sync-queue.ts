export type QueuedSample = { id: string; payload: string; captured: number };
export const RETRY_WARNING =
  "Events remain on this phone. Upload could not complete; reconnect and retry sync.";
export async function drainQueue(io: {
  next: () => Promise<QueuedSample[]>;
  upload: (payload: Record<string, unknown>) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  review: (id: string, reason: string) => Promise<unknown>;
  pause: () => Promise<unknown>;
  now: () => number;
  isCurrentOwner?: () => Promise<boolean>;
}): Promise<string | null> {
  // Bound background work while allowing recovery of more than one 200-reading batch.
  for (let batch = 0; batch < 5; batch++) {
    const rows = await io.next();
    if (!rows.length) return null;
    for (const row of rows) {
      if (io.isCurrentOwner && !(await io.isCurrentOwner()))
        return "Account changed. Saved events remain with their original account; sign back in to sync.";
      if (io.now() - row.captured > 7 * 86400000) {
        await io.review(row.id, "Older than 7 days; request a correction");
        continue;
      }
      try {
        const response = await io.upload(JSON.parse(row.payload));
        const status = (response as { status?: string } | null)?.status;
        if (status && ["offline_review", "out_of_order_review", "shift_review"].includes(status))
          await io.review(
            row.id,
            "Server requested " + status + "; ask your manager to correct missing time",
          );
        else if (status && ["observed", "clocked_in", "clocked_out", "duplicate"].includes(status))
          await io.remove(row.id);
        else
          // HTTP success is not proof that attendance evidence was accepted.
          // Preserve this and later readings so an idempotent retry remains possible.
          return RETRY_WARNING;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String((error as { message?: string } | null)?.message ?? error);
        if (/Boundary changed|Invalid location|approval required|not enabled/.test(message)) {
          await io.review(row.id, message);
          await io.pause();
          return (
            "Attendance paused: " +
            message +
            ". Refresh setup and ask your manager to review missing time."
          );
        }
        // Keep this and every later reading intact: sending later timestamps first
        // could cause the server to reject the retried earlier readings as stale.
        return RETRY_WARNING;
      }
    }
  }
  return (await io.next()).length
    ? "More events remain on this phone. Tap Sync to continue uploading."
    : null;
}
