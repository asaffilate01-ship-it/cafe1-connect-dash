import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTabOperator } from "./tab-authorization.server";

/** Strips add-on suffixes/casing so "Chips · extra salt" matches "chips". */
function normalise(name: string): string {
  return name.split("·")[0].trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Judges often re-order the same lunch, so the counter needs to know when a
 * matching unpaid tab charge already exists before adding a second one.
 */
export const findSimilarAccountOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        account_id: z.string().uuid(),
        item_names: z.array(z.string().min(1).max(200)).min(1).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireTabOperator(context);
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: account }, { data: orders }] = await Promise.all([
      context.supabase.from("accounts").select("id,name").eq("id", data.account_id).maybeSingle(),
      context.supabase
        .from("orders")
        .select("id,order_number,created_at,total_cents,payment_status")
        .eq("account_id", data.account_id)
        .eq("payment_status", "on_account")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);
    if (!orders?.length) return { match: null };

    const { data: lines } = await context.supabase
      .from("order_items")
      .select("order_id,name,qty")
      .in(
        "order_id",
        orders.map((o) => o.id),
      );

    const wanted = data.item_names.map(normalise).sort();
    for (const order of orders) {
      const theirs: string[] = [];
      for (const line of lines ?? []) {
        if (line.order_id !== order.id) continue;
        for (let i = 0; i < line.qty; i++) theirs.push(normalise(line.name));
      }
      if (!theirs.length) continue;
      const remaining = [...theirs].sort();
      let hits = 0;
      for (const name of wanted) {
        const at = remaining.indexOf(name);
        if (at >= 0) {
          remaining.splice(at, 1);
          hits++;
        }
      }
      const overlap = hits / Math.max(wanted.length, theirs.length);
      if (overlap >= 0.8) {
        return {
          match: {
            order_id: order.id,
            order_number: order.order_number,
            created_at: order.created_at,
            total_cents: order.total_cents,
            account_name: account?.name ?? "This tab",
            identical: overlap === 1,
          },
        };
      }
    }
    return { match: null };
  });

/** Puts a prepared counter order on a judge/advocate tab instead of taking payment. */
export const chargeOrderToAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ order_id: z.string().uuid(), account_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireTabOperator(context);
    const { data: order, error } = await context.supabase.rpc("cafe1_charge_order_to_account", {
      _order_id: data.order_id,
      _account_id: data.account_id,
    });
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Could not put that order on the tab");
    return { order_id: order.id, order_number: order.order_number, total_cents: order.total_cents };
  });