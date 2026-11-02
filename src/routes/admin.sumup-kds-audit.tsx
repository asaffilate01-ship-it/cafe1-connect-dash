import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminNav } from "@/components/admin-nav";
import { RequireRole } from "@/components/require-role";
import { inspectSumupKdsOrder } from "@/lib/sumup-kds-diagnostics.functions";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/admin/sumup-kds-audit")({
  validateSearch: (s: Record<string, unknown>) => ({
    order: /^\d{1,9}$/.test(String(s.order ?? "")) ? Number(s.order) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "SumUp kitchen item audit | Café 1" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <RequireRole roles={["admin", "staff"]} next="/admin/sumup-kds-audit">
      <SumupKitchenItemAudit />
    </RequireRole>
  ),
});

type Investigation = Awaited<ReturnType<typeof inspectSumupKdsOrder>>;

function SumupKitchenItemAudit() {
  const { order } = Route.useSearch();
  const inspect = useServerFn(inspectSumupKdsOrder);
  const [orderNumber, setOrderNumber] = useState(String(order ?? ""));
  const [result, setResult] = useState<Investigation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(number: number) {
    if (!Number.isSafeInteger(number) || number <= 0) {
      setError("Enter a valid Café 1 order number.");
      return;
    }
    setBusy(true); setError(null); setResult(null);
    try {
      setResult(await inspect({ data: { order_number: number } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not investigate this order.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (order) void load(order);
    // One automatic load for a direct order-number URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <main className="mx-auto max-w-5xl px-4 py-9">
        <div className="rounded-3xl bg-slate-950 p-7 text-white sm:p-9">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-widest">
            <ClipboardCheck className="h-4 w-4" /> Staff-only · Read-only
          </div>
          <h1 className="mt-3 font-display text-3xl font-black">SumUp → KDS item investigator</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-200">
            Compare the item names stored on the Café 1 KDS ticket against the
            SumUp transaction and receipt. A modifier such as <strong>Make it a meal</strong>
            must never be silently shown as <strong>Mix grill</strong>. This page
            cannot issue refunds, change orders or expose card information.
          </p>
          <form className="mt-6 flex flex-wrap items-end gap-3"
            onSubmit={(event) => { event.preventDefault(); void load(Number(orderNumber)); }}>
            <label className="w-48 text-xs font-semibold uppercase tracking-wider">
              Order number
              <input type="number" min={1} max={999999999} required
                value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-white/40 bg-white px-4 text-lg font-bold text-slate-950"
              />
            </label>
            <button type="submit" disabled={busy}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 font-bold text-slate-950 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Investigate
            </button>
          </form>
        </div>

        {error && <p className="mt-5 rounded-xl border border-red-400 bg-red-50 p-4 font-semibold text-red-900" role="alert">{error}</p>}
        {result && !result.found && <p className="mt-5 rounded-xl border border-amber-400 bg-amber-50 p-4 font-semibold text-amber-900" role="status">{result.message}</p>}
        {result?.found && (
          <>
            <section className="mt-5 rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-xl font-bold">Order #{result.order.number}</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Meta label="Source" value={result.order.source ?? "—"} />
                <Meta label="POS side" value={result.order.side ?? "—"} />
                <Meta label="Status" value={result.order.status} />
                <Meta label="Payment" value={result.order.payment_status ?? "—"} />
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Placed {new Date(result.order.created_at).toLocaleString("en-GB", { timeZone: "Europe/London" })}
                {result.order.sale_reference ? " · Provider sale reference: " + result.order.sale_reference : ""}
              </p>
              {result.order.manual_kitchen_correction && (
                <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
                  Kitchen staff already edited this ticket. Automatic SumUp refresh must not overwrite it.
                </p>
              )}
              {result.order.kds_note && (
                <p className="mt-3 whitespace-pre-wrap rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  <strong>KDS note:</strong> {result.order.kds_note}
                </p>
              )}
            </section>

            <section className="mt-5 rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-xl font-bold">Items currently stored on KDS</h2>
              {result.lines.length ? (
                <div className="mt-4 space-y-2">
                  {result.lines.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border p-4">
                      <p className="text-lg font-bold">{item.qty}× {item.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Category: {item.category || "unknown"} · Menu item linked: {item.linked_menu_item ? "yes" : "no"}
                      </p>
                      {item.notes && <p className="mt-2 whitespace-pre-wrap text-sm font-semibold">{item.notes}</p>}
                    </div>
                  ))}
                </div>
              ) : <p className="mt-3 text-sm text-muted-foreground">No stored kitchen item rows.</p>}
            </section>

            <section className="mt-5 rounded-2xl border border-border bg-card p-6">
              <h2 className="font-display text-xl font-bold">Independent SumUp item evidence</h2>
              {result.provider.conflict
                ? <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-900">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    Item sources conflict. Check the physical POS sale before food preparation.
                  </p>
                : result.provider.available
                  ? <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="h-5 w-5" /> Provider response retrieved
                    </p>
                  : <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                      Provider item data was not available.
                    </p>}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <EvidenceList title="Payment transaction items" items={result.provider.detail_items} />
                <EvidenceList title="SumUp receipt items" items={result.provider.receipt_items} />
              </div>
              <p className="mt-4 rounded-xl bg-muted p-3 text-sm">
                <strong>SumUp transaction summary:</strong> {result.provider.product_summary || "Not supplied"}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">{result.provider.note}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                A receipt and transaction may omit POS modifiers or notes. Absence from an API response
                is not proof the till had no item; compare against the receipt and correct the KDS
                ticket using its Edit Ticket tool if needed.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Meta({ label, value }: {label:string; value:string}) {
  return <div><p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 font-semibold">{value}</p></div>;
}
function EvidenceList({title,items}:{title:string;items:Array<{name:string;quantity:number;note:string|null}>}) {
  return <div className="rounded-xl border border-border p-4">
    <h3 className="font-bold">{title}</h3>
    {items.length
      ? <ul className="mt-2 space-y-2 text-sm">{items.map((item,index) =>
        <li key={index} className="border-t border-border pt-2">
          <strong>{item.quantity}× {item.name}</strong>
          {item.note && <p className="mt-1 text-xs">{item.note}</p>}
        </li>
      )}</ul>
      : <p className="mt-2 text-sm text-muted-foreground">Not provided by SumUp API</p>}
  </div>;
}
