import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const STATUS_MESSAGE: Record<string, string> = {
  inactive: "This voucher code has been deactivated. Please speak to the Jury Officer.",
  not_started: "This voucher code isn't active yet — it starts on your first day of service.",
  expired:
    "This voucher code has expired. The Jury Officer can arrange an extension for longer trials.",
  non_sitting_day:
    "The daily allowance only applies on court sitting days (Monday to Friday, excluding bank holidays).",
  locked:
    "This voucher is temporarily locked after several incorrect PIN attempts. Please wait 15 minutes or speak to the Jury Officer.",
};

export type VoucherLookup = Awaited<ReturnType<typeof lookupVoucher>>;

/** Anonymous balance check using the code and separately issued six-digit PIN. */
export const lookupVoucher = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        code: z.string().min(1).max(40),
        pin: z.string().regex(/^\d{6}$/, "Enter the six-digit PIN"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const code = (data.code ?? "").trim();
    if (!code) return { found: false as const };
    const { checkThrottle, recordAttempt, requestIdentity } = await import("./rate-limit.server");
    const ident = requestIdentity();
    const gate = await checkThrottle("voucher", ident);
    if (!gate.allowed)
      return { found: false as const, throttled: true as const, message: gate.message };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { callOperationsRpc } = await import("./ops-rpc");
    let rows: Array<{
      holder_id: string;
      holder_name: string | null;
      code: string;
      allocated_cents: number;
      used_cents: number;
      remaining_cents: number;
      valid_from: string;
      valid_until: string | null;
      opted_in: boolean;
      jury_room: string | null;
      attendance_required: boolean;
      attendance_verified: boolean;
      status: string;
    }>;
    try {
      rows = await callOperationsRpc(supabaseAdmin, "verify_juror_voucher_credentials", {
        _code: code,
        _pin: data.pin,
      });
    } catch (error) {
      console.error("[vouchers] lookup failed", error);
      await recordAttempt("voucher", ident, false);
      return { found: false as const };
    }
    const row = rows[0];
    await recordAttempt("voucher", ident, !!row);
    if (!row) return { found: false as const };
    return {
      found: true as const,
      holder_name: row.holder_name ?? "",
      code: row.code,
      allocated_cents: row.allocated_cents,
      used_cents: row.used_cents,
      remaining_cents: row.remaining_cents,
      valid_from: row.valid_from,
      valid_until: row.valid_until,
      opted_in: row.opted_in,
      jury_room: row.jury_room,
      attendance_required: row.attendance_required,
      attendance_verified: row.attendance_verified,
      status: row.status,
      usable: row.status === "ok",
      message: STATUS_MESSAGE[row.status] ?? null,
    };
  });

/** Legacy PIN verification; this no longer opts a juror into an entire service.
 * Participation is computed from successful voucher use separately each day.
 */
export const optInVoucher = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        code: z.string().min(1).max(40),
        pin: z.string().regex(/^\d{6}$/),
        source: z.enum(["till", "display", "online", "jury_room"]).default("online"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const code = data.code.trim();
    const { checkThrottle, recordAttempt, requestIdentity } = await import("./rate-limit.server");
    const ident = requestIdentity();
    const gate = await checkThrottle("voucher", ident);
    if (!gate.allowed) return { ok: false as const, message: gate.message, already: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { callOperationsRpc } = await import("./ops-rpc");
    let rows: Array<{ ok: boolean; message: string; already: boolean }>;
    try {
      rows = await callOperationsRpc(supabaseAdmin, "opt_in_voucher_secure", {
        _code: code,
        _pin: data.pin,
        _source: data.source,
      });
    } catch (error) {
      console.error("[vouchers] opt-in failed", error);
      await recordAttempt("voucher", ident, false);
      return {
        ok: false as const,
        message: "Could not record that opt-in. Please try again.",
        already: false,
      };
    }
    const row = rows[0];
    await recordAttempt("voucher", ident, !!row?.ok);
    return {
      ok: !!row?.ok,
      message: row?.message ?? "Code not recognised",
      already: !!row?.already,
    };
  });

/** Set up a private spending PIN. Does NOT constitute a daily scheme opt-in. */
export const optInWithJurorId = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        code: z.string().trim().min(3).max(40),
        source: z.enum(["till", "display", "online", "jury_room"]).default("online"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { checkThrottle, recordAttempt, requestIdentity } = await import("./rate-limit.server");
    const ident = requestIdentity();
    const gate = await checkThrottle("voucher", ident);
    if (!gate.allowed)
      return { ok: false as const, message: gate.message, pin: null, already: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { callOperationsRpc } = await import("./ops-rpc");
    let rows: Array<{
      ok: boolean;
      message: string;
      pin: string | null;
      already: boolean;
      valid_until: string | null;
    }>;
    try {
      rows = await callOperationsRpc(supabaseAdmin, "juror_opt_in_with_id", {
        _code: data.code,
        _source: data.source,
      });
    } catch (error) {
      console.error("[vouchers] juror PIN setup failed", error);
      await recordAttempt("voucher", ident, false);
      return {
        ok: false as const,
        message: "Could not set up your spending PIN. Please try again.",
        pin: null,
        already: false,
      };
    }
    const row = rows[0];
    await recordAttempt("voucher", ident, !!row?.ok);
    return {
      ok: !!row?.ok,
      message: row?.message ?? "That Juror ID is not recognised",
      pin: row?.pin ?? null,
      already: !!row?.already,
      valid_until: row?.valid_until ?? null,
    };
  });

/**
 * Gate for the Jury Only menu. A juror keys in the HMCTS Juror ID they were
 * issued (no PIN — that is only needed to spend the daily allowance). No name,
 * email or phone number is involved, and each unlock is written to the audit log.
 */
export const verifyJurorIdForMenu = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ code: z.string().trim().min(3).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { checkThrottle, recordAttempt, requestIdentity } = await import("./rate-limit.server");
    const ident = requestIdentity();
    const gate = await checkThrottle("voucher", ident);
    if (!gate.allowed)
      return { ok: false as const, message: gate.message, code: null, opted_in: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { callOperationsRpc } = await import("./ops-rpc");
    let rows: Array<{
      ok: boolean;
      message: string;
      code: string | null;
      opted_in: boolean;
      valid_until: string | null;
    }>;
    try {
      rows = await callOperationsRpc(supabaseAdmin, "cafe1_verify_juror_id", { _code: data.code });
    } catch (error) {
      console.error("[vouchers] juror id menu check failed", error);
      await recordAttempt("voucher", ident, false);
      return {
        ok: false as const,
        message: "We couldn't check that Juror ID just now. Please try again.",
        code: null,
        opted_in: false,
      };
    }
    const row = rows[0];
    let optedInToday = false;
    if (row?.ok && row.code) {
      try {
        const daily = await callOperationsRpc<Array<{ opted_in_today: boolean }>>(
          supabaseAdmin,
          "cafe1_juror_daily_status_by_id",
          { _code: row.code },
        );
        optedInToday = !!daily[0]?.opted_in_today;
      } catch {
        // Menu remains accessible; unknown daily status must never imply eligibility.
      }
    }
    await recordAttempt("voucher", ident, !!row?.ok);
    return {
      ok: !!row?.ok,
      message: row?.message ?? "That Juror ID is not recognised.",
      code: row?.code ?? null,
      opted_in: optedInToday,
    };
  });


/** Juror ID alone can read a pseudonymous daily balance/menu status, never spend it. */
export const getJurorDailyStatus = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z.object({ code: z.string().trim().regex(/^[A-Za-z0-9-]{3,40}$/) }).parse(value),
  )
  .handler(async ({ data }) => {
    const { checkThrottle, recordAttempt, requestIdentity } = await import("./rate-limit.server");
    const identity = requestIdentity();
    const throttle = await checkThrottle("voucher", identity);
    if (!throttle.allowed) {
      return { found: false as const, message: throttle.message ?? "Please try again shortly." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { callOperationsRpc } = await import("./ops-rpc");
    try {
      const rows = await callOperationsRpc<Array<{
        juror_code: string;
        for_date: string;
        allocated_cents: number;
        used_cents: number;
        held_cents: number;
        remaining_cents: number;
        opted_in_today: boolean;
        valid_until: string | null;
        status: string;
      }>>(supabaseAdmin, "cafe1_juror_daily_status_by_id", {
        _code: data.code.trim().toUpperCase(),
      });
      const row = rows[0];
      await recordAttempt("voucher", identity, !!row);
      if (!row) return { found: false as const, message: "Juror ID not recognised. Ask Café 1 staff." };
      return {
        found: true as const,
        code: row.juror_code,
        date: row.for_date,
        allocated_cents: row.allocated_cents,
        used_cents: row.used_cents,
        held_cents: row.held_cents,
        remaining_cents: row.remaining_cents,
        opted_in_today: row.opted_in_today,
        valid_until: row.valid_until,
        status: row.status,
      };
    } catch (error) {
      console.error("[vouchers] daily status failed", error);
      return { found: false as const, message: "Daily balance unavailable. Please try again." };
    }
  });
