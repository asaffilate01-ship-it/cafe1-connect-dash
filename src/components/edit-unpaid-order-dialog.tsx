import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Trash2, X } from "lucide-react";
import { amendUnpaidOrder, getUnpaidOrderForEdit } from "@/lib/unpaid-order.functions";
import { money } from "@/lib/format";

type Data = Awaited<ReturnType<typeof getUnpaidOrderForEdit>>;
type EditLine = { id?: string; name: string; qty: string; price: string; notes: string };
const pounds = (cents: number) => (cents / 100).toFixed(2);
function pence(input: string): number | null {
  const match = /^(\d{1,5})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const amount = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount <= 100000 ? amount : null;
}

export function EditUnpaidOrderDialog({
  orderId, onClose, onSaved,
}: { orderId: string | null; onClose: () => void; onSaved: () => void }) {
  const get = useServerFn(getUnpaidOrderForEdit);
  const amend = useServerFn(amendUnpaidOrder);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [reopen, setReopen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!orderId) { setData(null); return; }
    let active = true;
    setLoading(true); setError(null);
    void get({ data: { order_id: orderId } }).then((result) => {
      if (!active) return;
      setData(result);
      setLines(result.lines.map((line) => ({
        id: line.id, name: line.name, qty: String(line.qty),
        price: pounds(line.unit_price_cents), notes: line.notes ?? "",
      })));
      setNotes(result.order.notes);
      setReason("");
      setReopen(false);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load this unpaid order");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orderId, get]);

  const totals = useMemo(() => {
    let subtotal = 0;
    for (const line of lines) {
      const unit = pence(line.price);
      const qty = Number(line.qty);
      if (!line.name.trim() || line.name.length > 120 ||
          !Number.isInteger(qty) || qty < 1 || qty > 50 ||
          unit === null || line.notes.length > 200) {
        return { valid: false, subtotal: 0, due: 0 };
      }
      subtotal += unit * qty;
    }
    const due = data ? data.order.total_cents + subtotal - data.order.subtotal_cents : 0;
    return {
      valid: lines.length >= 1 && lines.length <= 60 && subtotal <= 1000000 &&
        due >= 0 && due <= 1000000,
      subtotal, due,
    };
  }, [lines, data]);
  if (!orderId) return null;
  const order = data?.order;
  const completed = order?.status === "completed" || order?.status === "delivered";
  const field = "mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary";

  function updateLine(index: number, patch: Partial<EditLine>) {
    setLines((list) => list.map((line, i) => i === index ? {...line, ...patch} : line));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!order || !order.can_edit || !totals.valid || reason.trim().length < 4) return;
    setSaving(true); setError(null);
    try {
      const saved = await amend({ data: {
        order_id: order.id,
        expected_updated_at: order.updated_at,
        reason: reason.trim(), notes, reopen_kitchen: reopen,
        items: lines.map((line) => ({
          ...(line.id ? {id:line.id} : {}),
          name: line.name.trim(), qty: Number(line.qty),
          unit_price_cents: pence(line.price)!, notes: line.notes,
        })),
      }});
      toast.success("Unpaid order #" + saved.order_number +
        " amended; now due " + money(saved.total_cents));
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save amendment");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <form onSubmit={(event) => void submit(event)} role="dialog" aria-modal="true"
        aria-labelledby="unpaid-edit-title"
        className="max-h-[95dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:max-h-[90dvh] sm:rounded-3xl sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              Unpaid tab correction
            </p>
            <h2 id="unpaid-edit-title" className="mt-1 font-display text-2xl font-bold">
              {order ? "Edit order #" + order.number : "Open unpaid order"}
            </h2>
            {order && <p className="mt-1 text-sm text-muted-foreground">
              {order.customer_name} · Kitchen: {order.status.replaceAll("_", " ")} ·
              Payment: <strong>{order.payment_status.replaceAll("_", " ")}</strong>
            </p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close editor"
            className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5"/></button>
        </div>
        {loading && <p role="status" className="mt-5 flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin"/> Loading unpaid order…
        </p>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">
          {error}
        </p>}
        {order && !order.can_edit && <div role="alert"
          className="mt-5 rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-5 w-5"/> Locked for provider/payment reconciliation
          </p>
          <p className="mt-2">{order.reason_locked}</p>
        </div>}
        {order?.can_edit && <>
          <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-muted p-4 sm:grid-cols-4">
            <Summary label="Original due" value={money(order.total_cents)}/>
            <Summary label="New item subtotal" value={money(totals.subtotal)}/>
            <Summary label="New amount due" value={totals.valid ? money(totals.due) : "Check items"}/>
            <Summary label="Payment status" value="Still unpaid"/>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Item changes adjust the balance due; existing discounts and fees remain unchanged.
            This action never takes or reverses a payment.
          </p>
          <h3 className="mt-5 font-display text-lg font-bold">Edit items, quantities and prices</h3>
          <div className="mt-3 space-y-3">
            {lines.map((line, index) => <div key={line.id ?? "new-" + index}
              className="rounded-2xl border border-border p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_65px_95px_auto] gap-2">
                <label className="min-w-0 text-xs font-semibold">Item
                  <input required maxLength={120} value={line.name}
                    aria-label={"Item " + (index+1) + " name"}
                    onChange={(e)=>updateLine(index,{name:e.target.value})} className={field}/>
                </label>
                <label className="text-xs font-semibold">Qty
                  <input required type="number" min={1} max={50} value={line.qty}
                    aria-label={"Item " + (index+1) + " quantity"}
                    onChange={(e)=>updateLine(index,{qty:e.target.value})} className={field}/>
                </label>
                <label className="text-xs font-semibold">Unit £
                  <input required inputMode="decimal" value={line.price}
                    aria-label={"Item " + (index+1) + " price"}
                    onChange={(e)=>updateLine(index,{price:e.target.value})} className={field}/>
                </label>
                <button type="button" disabled={lines.length === 1}
                  aria-label={"Remove item " + (index+1)}
                  onClick={() => setLines((list)=>list.filter((_,i)=>i!==index))}
                  className="mt-5 h-10 w-10 rounded-xl border border-border text-muted-foreground hover:text-destructive disabled:opacity-30">
                  <Trash2 className="mx-auto h-4 w-4"/>
                </button>
              </div>
              <label className="mt-2 block text-xs font-semibold">Item preparation note
                <input maxLength={200} value={line.notes}
                  aria-label={"Item " + (index+1) + " note"}
                  onChange={(e)=>updateLine(index,{notes:e.target.value})} className={field}/>
              </label>
            </div>)}
          </div>
          <button type="button" disabled={lines.length >= 60}
            onClick={()=>setLines((list)=>[...list,{name:"",qty:"1",price:"0.00",notes:""}])}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-primary px-4 text-sm font-bold text-primary disabled:opacity-40">
            <Plus className="h-4 w-4"/> Add item
          </button>
          <label className="mt-5 block text-sm font-semibold">Kitchen/order note
            <textarea rows={2} maxLength={500} value={notes}
              onChange={(e)=>setNotes(e.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm"/>
          </label>
          <label className="mt-4 block text-sm font-semibold">Reason (required for audit)
            <input required minLength={4} maxLength={220} value={reason}
              onChange={(e)=>setReason(e.target.value)}
              placeholder="e.g. Added a drink after initial order"
              className={field}/>
          </label>
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
            <input type="checkbox" checked={reopen}
              onChange={(e)=>setReopen(e.target.checked)} className="mt-1 h-4 w-4"/>
            <span className="text-sm">
              <strong>Send amendment to kitchen again</strong>
              <span className="mt-1 block text-muted-foreground">
                {completed
                  ? "This order was completed. Leave unchecked for a billing-only correction. If checked, reopen the same KDS ticket with a CHANGED ITEMS ONLY instruction; do not prepare previously served food twice."
                  : "Mark the existing ticket preparing, without creating a duplicate order or collecting payment."}
              </span>
            </span>
          </label>
          <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={onClose}
              className="h-11 rounded-xl border border-border px-5 text-sm font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={saving || !totals.valid || reason.trim().length<4}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCircle2 className="h-4 w-4"/>}
              {saving ? "Saving…" : "Save unpaid order"}
            </button>
          </div>
        </>}
      </form>
    </div>
  );
}

function Summary({label,value}:{label:string;value:string}) {
  return <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 font-display text-lg font-black tabular-nums">{value}</p>
  </div>;
}
