import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, publicClient } from "./court-staff-helpers";

/** Court delivery points (CC Floor 1, MAG Room 1, …) shown at order setup. */
export const listCourtLocations = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await publicClient()
    .from("court_delivery_locations")
    .select("id,label,building,postcode,sort_order")
    .eq("active", true)
    .order("sort_order");
  return { locations: data ?? [] };
});

/**
 * Returns the caller's court staff membership, auto-approving a first-time
 * registration when the email is verified AND on an allowlisted court domain.
 */
export const getMyCourtStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { canClaimCourtStaffRecord } = await import("./court-staff-eligibility");
    // Auth provider identity is authoritative. User metadata is editable and
    // must never be used to obtain court staff discounts or claim a record.
    const { data: identity, error: identityError } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    if (identityError || !identity?.user) throw new Error("Could not verify staff identity");
    const email = identity.user.email?.trim().toLowerCase() ?? "";
    const verified = !!identity.user.email_confirmed_at;
    if (!email || !verified) return { member: null, discount_percent: 0 };

    let { data: member } = await supabaseAdmin
      .from("court_staff_members")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();

    // Never grant a discount to a membership linked to a different email.
    if (member && member.email.trim().toLowerCase() !== email) {
      return { member: null, discount_percent: 0 };
    }

    // An admin-preapproved record may be claimed only by the verified owner.
    // Recheck the row is unclaimed during the update to avoid racing a link.
    if (!member) {
      const { data: byEmail } = await supabaseAdmin
        .from("court_staff_members")
        .select("*")
        .eq("email", email)
        .maybeSingle();
      if (
        byEmail &&
        canClaimCourtStaffRecord(byEmail, {
          email,
          userId: context.userId,
          emailVerified: verified,
        })
      ) {
        if (byEmail.user_id === context.userId) {
          member = byEmail;
        } else {
          const { data: linked } = await supabaseAdmin
            .from("court_staff_members")
            .update({ user_id: context.userId })
            .eq("id", byEmail.id)
            .is("user_id", null)
            .select("*")
            .maybeSingle();
          member = linked;
        }
      }
    }

    // Verified allowlisted domain → approve automatically.
    if (member && member.status === "pending" && verified && email) {
      const domain = email.split("@")[1] ?? "";
      const { data: allowed } = await supabaseAdmin
        .from("court_staff_domains")
        .select("id")
        .eq("domain", domain)
        .eq("active", true)
        .maybeSingle();
      if (allowed) {
        const { data: approved } = await supabaseAdmin
          .from("court_staff_members")
          .update({ status: "approved", approved_at: new Date().toISOString() })
          .eq("id", member.id)
          .select("*")
          .maybeSingle();
        member = approved ?? member;
      }
    }

    if (!member) return { member: null, discount_percent: 0 };
    const { data: settings } = await supabaseAdmin
      .from("business_settings")
      .select("court_staff_discount_percent")
      .limit(1)
      .maybeSingle();
    return {
      member: {
        id: member.id,
        full_name: member.full_name,
        email: member.email,
        phone: member.phone,
        status: member.status,
      },
      discount_percent:
        member.status === "approved"
          ? Number(member.discount_percent ?? settings?.court_staff_discount_percent ?? 10)
          : 0,
    };
  });

/** Court staff self-registration (a signed-in user claims scheme membership). */
export const registerCourtStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        full_name: z.string().trim().min(2).max(100),
        phone: z
          .string()
          .trim()
          .min(7)
          .max(30)
          .regex(/^[0-9+()\s-]+$/, "Enter a valid phone number"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { nextCourtStaffStatus } = await import("./court-staff-eligibility");
    const { data: identity, error: identityError } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    if (identityError || !identity?.user) throw new Error("Could not verify staff identity");
    const email = identity.user.email?.trim().toLowerCase() ?? "";
    if (!email || !identity.user.email_confirmed_at) {
      throw new Error("Verify your email address before joining the court staff scheme.");
    }
    const domain = email.split("@")[1] ?? "";
    const verified = true;
    const { data: allowed } = await supabaseAdmin
      .from("court_staff_domains")
      .select("id")
      .eq("domain", domain)
      .eq("active", true)
      .maybeSingle();
    const autoApprove = !!allowed && verified;
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("court_staff_members")
      .select("id,user_id,status,approved_at")
      .eq("email", email)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing?.user_id && existing.user_id !== context.userId) {
      throw new Error("This staff membership is already linked to another account.");
    }
    // A member suspended by management may update contact information, but
    // may never self-approve again by re-registering a verified email.
    const nextStatus = nextCourtStaffStatus(
      existing?.status as "pending" | "approved" | "suspended" | undefined,
      autoApprove,
    );

    const { data: member, error } = await supabaseAdmin
      .from("court_staff_members")
      .upsert(
        {
          user_id: context.userId,
          email,
          full_name: data.full_name,
          phone: data.phone,
          status: nextStatus,
          approved_at:
            nextStatus === "approved" ? existing?.approved_at ?? new Date().toISOString() : null,
        },
        { onConflict: "email" },
      )
      .select("id,status")
      .single();
    if (error) throw new Error(error.message);
    return { status: member.status as "pending" | "approved" | "suspended" };
  });

/* ---------------------------- admin management ---------------------------- */

export const adminListCourtStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [members, domains, locations, settings] = await Promise.all([
      supabaseAdmin
        .from("court_staff_members")
        .select("id,full_name,email,phone,status,discount_percent,notes,created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("court_staff_domains").select("id,domain,active").order("domain"),
      supabaseAdmin
        .from("court_delivery_locations")
        .select("id,label,building,postcode,sort_order,active")
        .order("sort_order"),
      supabaseAdmin.from("business_settings").select("id,court_staff_discount_percent").limit(1),
    ]);
    return {
      members: members.data ?? [],
      domains: domains.data ?? [],
      locations: locations.data ?? [],
      default_discount_percent: Number(
        settings.data?.[0]?.court_staff_discount_percent ?? 10,
      ),
    };
  });

export const adminSaveCourtStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        email: z.string().trim().toLowerCase().email().max(200),
        full_name: z.string().trim().min(2).max(100),
        phone: z.string().trim().max(30).default(""),
        status: z.enum(["pending", "approved", "suspended"]),
        discount_percent: z.number().min(0).max(100).nullable().optional(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      email: data.email,
      full_name: data.full_name,
      phone: data.phone,
      status: data.status,
      discount_percent: data.discount_percent ?? null,
      notes: data.notes ?? null,
      approved_by: data.status === "approved" ? context.userId : null,
      approved_at: data.status === "approved" ? new Date().toISOString() : null,
    };
    const { error } = data.id
      ? await supabaseAdmin.from("court_staff_members").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("court_staff_members").upsert(payload, { onConflict: "email" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminDeleteCourtStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("court_staff_members").delete().eq("id", data.id);
    return { ok: true as const };
  });

export const adminSaveCourtLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        label: z.string().trim().min(2).max(60),
        building: z.string().trim().max(80).default(""),
        postcode: z.string().trim().max(12).default("AL1 3JU"),
        sort_order: z.number().int().min(0).max(999).default(0),
        active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...payload } = data;
    const { error } = id
      ? await supabaseAdmin.from("court_delivery_locations").update(payload).eq("id", id)
      : await supabaseAdmin.from("court_delivery_locations").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminDeleteCourtLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("court_delivery_locations").delete().eq("id", data.id);
    return { ok: true as const };
  });

export const adminSaveCourtDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        domain: z
          .string()
          .trim()
          .toLowerCase()
          .min(3)
          .max(100)
          .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a domain like justice.gov.uk"),
        active: z.boolean().default(true),
        remove: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.remove && data.id) {
      await supabaseAdmin.from("court_staff_domains").delete().eq("id", data.id);
      return { ok: true as const };
    }
    const { error } = data.id
      ? await supabaseAdmin
          .from("court_staff_domains")
          .update({ domain: data.domain, active: data.active })
          .eq("id", data.id)
      : await supabaseAdmin
          .from("court_staff_domains")
          .upsert({ domain: data.domain, active: data.active }, { onConflict: "domain" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminSetStaffDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ percent: z.number().min(0).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("business_settings").select("id").limit(1).maybeSingle();
    if (!row) throw new Error("Business settings not found");
    const { error } = await supabaseAdmin
      .from("business_settings")
      .update({ court_staff_discount_percent: data.percent })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
