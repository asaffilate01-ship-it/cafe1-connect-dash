import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callOperationsRpc } from "./ops-rpc";
export type BoundaryPoint = { lat: number; lng: number };
export type AttendanceDashboard = {
  manager: boolean;
  config: {
    boundary: BoundaryPoint[];
    version: string;
    enabled: boolean;
    verified_note: string;
  } | null;
  devices: {
    id: string;
    staff_id: string;
    label: string;
    approved: boolean;
    last_seen_at: string | null;
  }[];
  staff: { id: string; name: string }[];
  rates: { staff_id: string; effective_from: string; hourly_cents: number }[];
  entries: {
    id: string;
    staff_id: string;
    staff_name: string;
    clocked_in_at: string;
    clocked_out_at: string | null;
    break_minutes: number;
    paid_minutes: number | null;
    estimated_pay_cents: number | null;
    approved_pay_cents: number | null;
    approved_at: string | null;
  }[];
  exceptions: {
    id: string;
    staff_id: string;
    captured_at: string;
    classification: string;
    outcome: string;
  }[];
};
export const attendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) =>
    z
      .object({
        action: z.enum([
          "dashboard",
          "boundary",
          "device",
          "rate",
          "approve",
          "correct",
          "create",
          "manual_in",
          "manual_out",
          "register",
          "sample",
        ]),
        data: z.record(z.string(), z.unknown()),
      })
      .parse(value),
  )
  .handler(({ data, context }) =>
    callOperationsRpc<AttendanceDashboard>(context.supabase, "cafe1_attendance", {
      _action: data.action,
      _data: data.data,
    }),
  );

// Independent of report dates: yesterday's missed departure must remain visible today.
// Uses the caller's authenticated client and existing self-or-admin SELECT policy.
export const openAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => z.object({ siteId: z.uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("staff_time_entries")
      .select("id,staff_id,clocked_in_at")
      .eq("site_id", data.siteId)
      .is("clocked_out_at", null)
      .order("clocked_in_at", { ascending: true })
      .limit(201);
    if (error) throw new Error(error.message);
    return { entries: (rows ?? []).slice(0, 200), truncated: (rows?.length ?? 0) > 200 };
  });
