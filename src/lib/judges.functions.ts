import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Shared judges' login provisioning is a controlled management operation.
 * A failed public password attempt must never create/confirm an auth user.
 */
export const ensureJudgeLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !isAdmin) throw new Error("Manager access required");

    const { ensureJudgeLoginExists } = await import("./judge-login.server");
    await ensureJudgeLoginExists();
    return { ok: true as const };
  });
