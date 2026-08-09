import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdminNav } from "@/components/admin-nav";
import { useEffect, useState } from "react";
import { PosDevicesCard } from "@/components/pos-devices-card";
import { useSession, useRoles } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings, Save } from "lucide-react";
import { DAY_NAMES, type BusinessSettings, type HourRow } from "@/lib/business";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Store settings — Cafe1 Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminSettings,
});

function AdminSettings() {
  const { user, loading } = useSession();
  const { has, loading: rl } = useRoles(user);
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => { if (!loading && !user) navigate({ to: "/admin/login", search: { next: "/admin/settings" } }); }, [loading, user, navigate]);
  const allowed = has("admin");

  const { data } = useQuery({
    queryKey: ["admin-settings"],
    enabled: !!user && allowed,
    queryFn: async () => {
      const [s, h] = await Promise.all([
        supabase.from("business_settings").select("*").limit(1).maybeSingle(),
        supabase.from("business_hours").select("*").order("day_of_week"),
      ]);
      return { settings: s.data as BusinessSettings | null, hours: (h.data ?? []) as HourRow[] };
    },
  });

  const [s, setS] = useState<BusinessSettings | null>(null);
  const [hours, setHours] = useState<HourRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (data?.settings) setS(data.settings); if (data?.hours) setHours(data.hours); }, [data]);

  async function save() {
    if (!s) return;
    setBusy(true);
    const upd = await supabase.from("business_settings").update({
      name: s.name,
      accepting_orders: s.accepting_orders,
      allow_preorder_when_closed: s.allow_preorder_when_closed,
      prep_minutes: s.prep_minutes,
      delivery_minutes: s.delivery_minutes,
      min_order_cents: s.min_order_cents,
      delivery_fee_cents: s.delivery_fee_cents,
      free_delivery_threshold_cents: s.free_delivery_threshold_cents,
      closed_message: s.closed_message,
      delivery_open_time: s.delivery_open_time,
      delivery_close_time: s.delivery_close_time,
      delivery_origin_postcode: s.delivery_origin_postcode,
      delivery_radius_m: s.delivery_radius_m,
      vat_registered: s.vat_registered ?? false,
      vat_number: s.vat_registered ? s.vat_number?.trim() || null : null,
    }).eq("id", s.id);
    if (upd.error) { setBusy(false); return toast.error(upd.error.message); }
    for (const h of hours) {
      const { error } = await supabase.from("business_hours").update({
        open_time: h.open_time, close_time: h.close_time, closed: h.closed,
      }).eq("day_of_week", h.day_of_week);
      if (error) { setBusy(false); return toast.error(error.message); }
    }
    setBusy(false);
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["store-status"] });
    qc.invalidateQueries({ queryKey: ["admin-settings"] });
  }

  if (loading || rl) return null;
  if (!allowed) return <div className="p-12 text-center text-muted-foreground">Manager access is required.</div>;
  if (!s) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary"><Settings className="h-5 w-5" /></span>
          <div>
            <h1 className="font-display text-3xl font-bold">Store settings</h1>
            <p className="text-sm text-muted-foreground">Manager-controlled opening hours, delivery limits, VAT treatment and fees.</p>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="font-semibold">Ordering</p>
            <div className="mt-3 space-y-3">
              <label className="flex items-center justify-between gap-3">
                <span>Accepting orders</span>
                <input type="checkbox" className="h-5 w-5" checked={s.accepting_orders} onChange={(e) => setS({ ...s, accepting_orders: e.target.checked })} />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Allow pre-orders when closed</span>
                <input type="checkbox" className="h-5 w-5" checked={s.allow_preorder_when_closed} onChange={(e) => setS({ ...s, allow_preorder_when_closed: e.target.checked })} />
              </label>
              <textarea
                placeholder="Message shown when closed (optional)"
                value={s.closed_message ?? ""}
                onChange={(e) => setS({ ...s, closed_message: e.target.value })}
                className="min-h-16 w-full rounded-xl border border-border bg-background p-3"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="font-semibold">Timings & fees</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <NumberField label="Prep time (minutes)" v={s.prep_minutes} on={(v) => setS({ ...s, prep_minutes: v })} />
              <NumberField label="Delivery time (minutes)" v={s.delivery_minutes} on={(v) => setS({ ...s, delivery_minutes: v })} />
              <NumberField label="Minimum order (pence)" v={s.min_order_cents} on={(v) => setS({ ...s, min_order_cents: v })} />
              <NumberField label="Delivery fee (pence)" v={s.delivery_fee_cents} on={(v) => setS({ ...s, delivery_fee_cents: v })} />
              <NumberField label="Free delivery over (pence, blank = never)" v={s.free_delivery_threshold_cents ?? 0} on={(v) => setS({ ...s, free_delivery_threshold_cents: v || null })} />
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="font-semibold">Delivery area & window</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-muted-foreground">Delivery from</span>
                <input type="time" value={(s.delivery_open_time ?? "08:30").slice(0,5)} onChange={(e) => setS({ ...s, delivery_open_time: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3" />
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground">Delivery until</span>
                <input type="time" value={(s.delivery_close_time ?? "16:30").slice(0,5)} onChange={(e) => setS({ ...s, delivery_close_time: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3" />
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground">Shop postcode (delivery origin)</span>
                <input value={s.delivery_origin_postcode ?? ""} onChange={(e) => setS({ ...s, delivery_origin_postcode: e.target.value.toUpperCase() })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3" />
              </label>
              <NumberField label="Max delivery distance (metres — 805 = ½ mile)" v={s.delivery_radius_m ?? 805} on={(v) => setS({ ...s, delivery_radius_m: Math.min(Math.max(v, 100), 805) })} />
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="font-semibold">VAT treatment</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cafe 1 is currently not VAT registered, so receipts must not show a VAT charge or VAT number.
            </p>
            <label className="mt-3 flex items-center justify-between gap-3">
              <span>VAT registered</span>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={s.vat_registered ?? false}
                onChange={(e) => setS({ ...s, vat_registered: e.target.checked, vat_number: e.target.checked ? s.vat_number : null })}
              />
            </label>
            {s.vat_registered && (
              <label className="mt-3 block text-sm">
                <span className="text-muted-foreground">VAT number</span>
                <input
                  value={s.vat_number ?? ""}
                  onChange={(e) => setS({ ...s, vat_number: e.target.value.toUpperCase() })}
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3"
                />
              </label>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="font-semibold">Opening hours</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Saturday, Sunday and configured England/Wales bank holidays remain closed.
            </p>
            <div className="mt-3 space-y-2">
              {hours.map((h, i) => (
                <div key={h.day_of_week} className="grid grid-cols-[6rem_1fr_1fr_auto] items-center gap-2">
                  <span className="text-sm font-medium">{DAY_NAMES[h.day_of_week]}</span>
                  <input type="time" disabled={h.closed} value={h.open_time.slice(0,5)} onChange={(e) => { const c = [...hours]; c[i] = { ...h, open_time: e.target.value }; setHours(c); }} className="h-10 rounded-lg border border-border bg-background px-3 disabled:opacity-50" />
                  <input type="time" disabled={h.closed} value={h.close_time.slice(0,5)} onChange={(e) => { const c = [...hours]; c[i] = { ...h, close_time: e.target.value }; setHours(c); }} className="h-10 rounded-lg border border-border bg-background px-3 disabled:opacity-50" />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input type="checkbox" checked={h.closed} onChange={(e) => { const c = [...hours]; c[i] = { ...h, closed: e.target.checked }; setHours(c); }} /> Closed
                  </label>
                </div>
              ))}
            </div>
          </section>

          <button disabled={busy} onClick={save} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground shadow-brand hover:bg-primary-hover disabled:opacity-60">
            <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save settings"}
          </button>

          <PosDevicesCard />
        </div>
      </div>
    </div>
  );
}

function NumberField({ label, v, on }: { label: string; v: number; on: (n: number) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input type="number" value={v} onChange={(e) => on(parseInt(e.target.value || "0", 10))} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3" />
    </label>
  );
}
