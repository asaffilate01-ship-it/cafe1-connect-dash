import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminNav } from "@/components/admin-nav";
import { RequireRole } from "@/components/require-role";
import { EditUnpaidOrderDialog } from "@/components/edit-unpaid-order-dialog";
import { listEditableUnpaidOrders } from "@/lib/unpaid-order.functions";
import { money } from "@/lib/format";
import { AlertTriangle, Loader2, Pencil, RefreshCw, Search } from "lucide-react";

export const Route = createFileRoute("/admin/unpaid-orders")({
  head: () => ({
    meta: [
      { title: "Unpaid order corrections — Café 1 St Albans" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <RequireRole roles={["admin", "staff"]} next="/admin/unpaid-orders">
      <UnpaidOrdersPage />
    </RequireRole>
  ),
});

type UnpaidOrder = Awaited<ReturnType<typeof listEditableUnpaidOrders>>[number];
function UnpaidOrdersPage() {
  const list = useServerFn(listEditableUnpaidOrders);
  const [rows, setRows] = useState<UnpaidOrder[]>([]);
  const [query, setQuery] = useState("");
  const [completedOnly, setCompletedOnly] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const result = await list({ data: {
        q: query.trim() || undefined,
        finished_only: completedOnly,
      }});
      setRows(result);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not load unpaid orders";
      setError(message);
      toast.error(message);
    } finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
  }, [completedOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalDue = rows.reduce((total, row) => total + row.total_cents, 0);
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <header className="rounded-3xl bg-slate-950 p-7 text-white sm:p-9">
          <p className="text-xs font-bold uppercase tracking-widest text-white/60">
            Café 1 · Accounts and kitchen operations
          </p>
          <h1 className="mt-2 font-display text-3xl font-black sm:text-4xl">
            Edit unpaid and completed tab orders
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-200">
            Completion in the kitchen does not mean an invoice has been paid.
            Staff can correct unpaid item names, quantities, prices and notes while
            keeping the original order number, payment status and tab balance.
            Paid or refunded orders are protected from financial editing.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/admin/accounts"
              className="inline-flex h-10 items-center rounded-xl border border-white/30 px-4 text-xs font-semibold text-white hover:bg-white/10">
              House-tab accounts and payments
            </Link>
            <Link to="/admin/sumup-kds-audit" search={{order: undefined}}
              className="inline-flex h-10 items-center rounded-xl border border-white/30 px-4 text-xs font-semibold text-white hover:bg-white/10">
              SumUp item investigations
            </Link>
          </div>
        </header>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-end gap-3">
            <form className="flex flex-1 items-end gap-2"
              onSubmit={(e) => {e.preventDefault(); void load();}}>
              <label className="min-w-44 flex-1 text-sm font-semibold">
                Find a customer or order number
                <input value={query} maxLength={80}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. 6509, Jury, Judge"
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-4 text-sm"/>
              </label>
              <button type="submit" disabled={loading}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
                <Search className="h-4 w-4"/> Search
              </button>
            </form>
            <button type="button" onClick={() => {void load();}}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold">
              <RefreshCw className="h-4 w-4"/> Refresh
            </button>
          </div>
          <label className="mt-4 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={completedOnly}
              onChange={(e) => setCompletedOnly(e.target.checked)}
              className="h-4 w-4"/>
            Only completed, delivered or ready orders that are still unpaid
          </label>
          <p className="mt-3 text-xs text-muted-foreground">
            Last 45 days. Excludes paid, cancelled and refunded orders.
            SumUp POS and marketplace items are provider-owned and can only be
            changed in the original till/partner first.
          </p>
        </section>

        {error && <p className="mt-4 rounded-xl border border-destructive/30 bg-red-50 p-4 text-sm font-semibold text-red-900" role="alert">{error}</p>}
        <div className="mt-5 flex items-center justify-between gap-3 text-sm">
          <p><strong>{rows.length}</strong> visible unpaid orders ·
            Unpaid value <strong>{money(totalDue)}</strong></p>
          {loading && <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin"/> Refreshing
          </span>}
        </div>
        <div className="mt-3 grid gap-3">
          {!loading && !rows.length && <p className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
            No matching unpaid orders in this period.
          </p>}
          {rows.map((order) => {
            const external = ["sumup_pos","deliveroo","just_eat","uber_eats","tgtg"].includes(order.source);
            return (
              <article key={order.id}
                className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-black">#{order.order_number}</h2>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-900">
                      {order.payment_status === "on_account" ? "Unpaid tab" : "Payment pending"}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-bold uppercase">
                      Kitchen: {order.status.replaceAll("_"," ")}
                    </span>
                  </div>
                  <p className="mt-1 font-semibold">{order.customer_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {order.source} · {order.side ?? "general"} ·
                    {new Date(order.created_at).toLocaleString("en-GB", {timeZone:"Europe/London"})}
                  </p>
                  {external && <p className="mt-2 flex items-center gap-1 text-xs text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5"/> Edit in the source POS first
                  </p>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <strong className="font-display text-2xl tabular-nums">{money(order.total_cents)}</strong>
                  <button type="button" onClick={() => setEditId(order.id)}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary/40 px-4 text-sm font-bold text-primary hover:bg-primary/10">
                    <Pencil className="h-4 w-4"/> {external ? "View edit restriction" : "Edit unpaid order"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </main>
      <EditUnpaidOrderDialog orderId={editId}
        onClose={() => setEditId(null)} onSaved={() => {void load();}}/>
    </div>
  );
}
