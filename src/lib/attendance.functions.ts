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
