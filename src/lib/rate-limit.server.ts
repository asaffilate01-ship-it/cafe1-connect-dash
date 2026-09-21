import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Throttling for public code-guessing endpoints (voucher / promo lookups).
 * Workers are stateless, so attempts are counted in the database.
 */
export type ThrottleKind = "voucher" | "promo" | "account" | "payment";

const LIMITS: Record<
  ThrottleKind,
  { window_s: number; max: number; lockout_s: number; lockout_after: number }
> = {
  // per identity: 8 tries a minute, and 20 failures in 15 min = 15 min lockout
  voucher: { window_s: 60, max: 8, lockout_s: 900, lockout_after: 20 },
  promo: { window_s: 60, max: 10, lockout_s: 900, lockout_after: 25 },
  account: { window_s: 60, max: 6, lockout_s: 1800, lockout_after: 15 },
  // A 3-D Secure payment can legitimately need several status checks while
  // the customer approves it. Keep this above the client's polling rate so
  // confirmation cannot throttle itself, while still bounding API traffic.
  payment: { window_s: 60, max: 40, lockout_s: 900, lockout_after: 40 },
};

export function requestIdentity(): string {
  const raw = getRequestHeader("cf-connecting-ip") || getRequestHeader("x-real-ip") || "unknown";
  return raw.trim().slice(0, 64) || "unknown";
}

export type ThrottleResult = { allowed: boolean; message?: string };

export async function checkThrottle(kind: ThrottleKind, ident: string): Promise<ThrottleResult> {
  const cfg = LIMITS[kind];
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - cfg.window_s * 1000).toISOString();
    const lockSince = new Date(Date.now() - cfg.lockout_s * 1000).toISOString();

    const [{ count: recent }, { count: failures }] = await Promise.all([
      supabaseAdmin
        .from("code_attempts")
        .select("id", { count: "exact", head: true })
        .eq("kind", kind)
        .eq("ident", ident)
        .gte("created_at", since),
      supabaseAdmin
        .from("code_attempts")
        .select("id", { count: "exact", head: true })
        .eq("kind", kind)
        .eq("ident", ident)
        .eq("ok", false)
        .gte("created_at", lockSince),
    ]);

    if ((failures ?? 0) >= cfg.lockout_after) {
      return {
        allowed: false,
        message: "Too many incorrect codes. Please try again later or ask a member of staff.",
      };
    }
    if ((recent ?? 0) >= cfg.max) {
      return { allowed: false, message: "Too many attempts — please wait a minute and try again." };
    }
    return { allowed: true };
  } catch (e) {
    // Code guessing and payment-probing endpoints fail closed when their
    // shared limiter is unavailable. Staff can still assist at the counter.
    console.error("[throttle] check failed", e);
    return {
      allowed: false,
      message: "We cannot verify that safely right now. Please try again shortly.",
    };
  }
}

export async function recordAttempt(kind: ThrottleKind, ident: string, ok: boolean) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("code_attempts").insert({ kind, ident, ok });
  } catch (e) {
    console.error("[throttle] record failed", e);
  }
}
