import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Counter and kitchen account lookups must never depend solely on frontend
 * route gating. Every server function checks the signed-in operator's role,
 * while RLS still independently restricts which account rows can be read.
 */
export async function requireTabOperator(context: {
  userId: string;
  supabase: Pick<SupabaseClient<Database>, "rpc">;
}): Promise<void> {
  const [{ data: admin, error: adminError }, { data: staff, error: staffError }] =
    await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "staff" }),
    ]);
  if (adminError || staffError || (!admin && !staff)) {
    throw new Error("Kitchen staff or manager access required");
  }
}
