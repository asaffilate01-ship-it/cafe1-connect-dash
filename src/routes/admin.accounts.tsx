import { createFileRoute, Link } from "@tanstack/react-router";
import { askConfirm } from "@/lib/confirm";
import { AdminNav } from "@/components/admin-nav";
import { RequireRole } from "@/components/require-role";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listAccounts,
  createAccount,
  updateAccount,
  regenerateAccountCode,
  getAccountStatement,
  recordAccountPayment,
  deleteAccountPayment,
  listTabOrders,
} from "@/lib/accounts.functions";
import { money } from "@/lib/format";
import { buildStatementPdf } from "@/lib/account-statement-pdf";
import { ensureJudgeLogin } from "@/lib/judges.functions";
import { toast } from "sonner";
import {
  ArrowLeft,
  RefreshCw,
  Printer,
  CheckCircle2,
  Plus,
  FileDown,
  Trash2,
  Banknote,
  Scale,
} from "lucide-react";

export const Route = createFileRoute("/admin/accounts")({
  head: () => ({
    meta: [
      { title: "Tab accounts — Cafe1" },
      { name: "description", content: "Manage business tabs, access codes and settlements." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountsAdmin,
});

type Account = Awaited<ReturnType<typeof listAccounts>>[number];
type Statement = Awaited<ReturnType<typeof getAccountStatement>>;

function AccountsAdmin() {
  return (
    <RequireRole roles={["admin"]} next="/admin/accounts">
      <AccountsManager />
    </RequireRole>
  );
}

function AccountsManager() {
  const list = useServerFn(listAccounts);
  const create = useServerFn(createAccount);
  const update = useServerFn(updateAccount);
  const regen = useServerFn(regenerateAccountCode);
  const provisionJudge = useServerFn(ensureJudgeLogin);
  const [provisionBusy, setProvisionBusy] = useState(false);
  const [rows, setRows] = useState<Account[]>([]);
  const [selected, setSelected] = useState<Account | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function refresh() {
    try {
      setRows(await list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    }
  }
  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-secondary/40">
      <AdminNav />
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/staff" className="text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="font-display text-xl font-bold">Tab accounts</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={provisionBusy}
              onClick={async () => {
                const confirmed = await askConfirm({
                  title: "Provision the shared judges' sign-in?",
                  description:
                    "This manager-only operation ensures the existing shared login exists. It does not create a personal judge identity or show the server-stored password.",
                  confirmLabel: "Provision sign-in",
                });
                if (!confirmed) return;
                setProvisionBusy(true);
                try {
                  await provisionJudge();
                  toast.success("Judges' sign-in is provisioned.");
                } catch {
                  toast.error("Could not provision judges' access. Check the server secret and manager role.");
                } finally {
                  setProvisionBusy(false);
                }
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:border-primary disabled:opacity-60"
            >
              <Scale className="h-4 w-4" aria-hidden="true" />
              {provisionBusy ? "Provisioning…" : "Judges' sign-in"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-brand"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> New account
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Account</th>
                <th className="p-3">Code</th>
                <th className="p-3">Contact</th>
                <th className="p-3 text-right">Outstanding</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No tab accounts yet. Create one to get started.
                  </td>
                </tr>
              )}
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-secondary/30">
                  <td className="p-3 font-semibold">
                    {a.name}
                    {a.contact_name && (
                      <div className="text-xs font-normal text-muted-foreground">
                        {a.contact_name}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-mono text-sm text-muted-foreground"
                        title="Codes are stored hashed and shown once when generated"
                      >
                        •••• hidden
                      </span>
                      <button
                        onClick={async () => {
                          if (
                            !(await askConfirm(
                              "Generate a new code? The old one will stop working immediately.",
                            ))
                          )
                            return;
                          const res = await regen({ data: { id: a.id } });
                          toast.success(`New code: ${res.code}`);
                          void refresh();
                        }}
                        className="text-muted-foreground hover:text-primary"
                        title="Regenerate"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {a.contact_email && <div>{a.contact_email}</div>}
                    {a.contact_phone && <div>{a.contact_phone}</div>}
                  </td>
                  <td className="p-3 text-right font-semibold">{money(a.outstanding_cents)}</td>
                  <td className="p-3">
                    <button
                      onClick={async () => {
                        await update({ data: { id: a.id, active: !a.active } });
                        void refresh();
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${a.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                    >
                      {a.active ? "Active" : "Disabled"}
                    </button>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => setSelected(a)}
                      className="font-semibold text-primary hover:underline"
                    >
                      View bill →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TabOrdersPanel
          onOpenAccount={(accountId) => {
            const account = rows.find((row) => row.id === accountId);
            if (account) setSelected(account);
            else toast.error("That tab account is no longer available");
          }}
        />
      </div>

      {showCreate && (
        <CreateAccountModal
          onClose={() => setShowCreate(false)}
          onCreated={(a) => {
            setShowCreate(false);
            toast.success(`Tab created — code ${a.access_code}`);
            void refresh();
          }}
          create={create}
        />
      )}
      {selected && (
        <StatementModal
          account={selected}
          onClose={() => setSelected(null)}
          onSettled={() => {
            setSelected(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

type TabOrder = Awaited<ReturnType<typeof listTabOrders>>["rows"][number];

function TabOrdersPanel({
  onOpenAccount,
}: {
  onOpenAccount: (accountId: string) => void;
}) {
  const load = useServerFn(listTabOrders);
  const [status, setStatus] = useState<"unpaid" | "paid" | "all">("unpaid");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TabOrder[]>([]);
  const [totalDue, setTotalDue] = useState(0);

  async function refresh() {
    try {
      const res = await load({ data: { status, q: q.trim() || undefined } });
      setRows(res.rows);
      setTotalDue(res.total_due_cents);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    }
  }
  useEffect(() => {
    void refresh();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Tab orders</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-border bg-card p-1">
            {(["unpaid", "paid", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void refresh();
            }}
            className="flex items-center gap-2"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or order #"
              className="h-9 w-56 rounded-full border border-border bg-background px-4 text-sm"
            />
            <button className="h-9 rounded-full border border-border px-3 text-sm font-semibold">
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <span>
          <strong>{rows.length}</strong> orders · Total due{" "}
          <span className="font-display text-lg font-bold text-primary">{money(totalDue)}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          Open an account to record a referenced payment or settle its exact balance.
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Date &amp; time</th>
              <th className="p-3">Order details</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No tab orders match this filter.
                </td>
              </tr>
            )}
            {rows.map((o) => (
              <tr key={o.id} className="align-top hover:bg-secondary/30">
                <td className="p-3 font-semibold">
                  {o.account_name ?? o.customer_name}
                  <div className="text-xs font-normal text-muted-foreground">
                    #{o.order_number} · {o.customer_name}
                    {o.company_name ? ` · ${o.company_name}` : ""}
                  </div>
                </td>
                <td className="p-3 text-muted-foreground">
                  {new Date(o.created_at).toLocaleString()}
                </td>
                <td className="p-3">
                  <ul className="space-y-0.5 text-xs">
                    {o.items.map((it, i) => (
                      <li key={i} className="flex justify-between gap-4">
                        <span>
                          {it.qty} × {it.name}
                          {it.notes ? (
                            <span className="text-muted-foreground"> · {it.notes}</span>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground">
                          {money(it.qty * it.unit_price_cents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="p-3 text-right font-semibold">{money(o.due_cents)}</td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${o.payment_status === "on_account" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}
                  >
                    {o.payment_status === "on_account" ? "Unpaid" : "Paid"}
                  </span>
                </td>
                <td className="p-3 text-right">
                  {o.payment_status === "on_account" && o.account_id && (
                    <button
                      onClick={() => onOpenAccount(o.account_id!)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      View tab →
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </section>
  );
}

function CreateAccountModal({
  onClose,
  onCreated,
  create,
}: {
  onClose: () => void;
  onCreated: (a: { access_code: string }) => void;
  create: ReturnType<typeof useServerFn<typeof createAccount>>;
}) {
  const [form, setForm] = useState({
    name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    credit_limit: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const limit = form.credit_limit ? Math.round(parseFloat(form.credit_limit) * 100) : undefined;
      const acc = await create({
        data: {
          name: form.name,
          contact_name: form.contact_name || undefined,
          contact_email: form.contact_email || undefined,
          contact_phone: form.contact_phone || undefined,
          credit_limit_cents: limit,
          notes: form.notes || undefined,
        },
      });
      onCreated(acc as { access_code: string });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg space-y-3 rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <h2 className="font-display text-xl font-bold">New tab account</h2>
        <input
          required
          placeholder="Business / account name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="h-11 w-full rounded-xl border border-border bg-background px-4"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Contact person"
            value={form.contact_name}
            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
            className="h-11 rounded-xl border border-border bg-background px-4"
          />
          <input
            placeholder="Phone"
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            className="h-11 rounded-xl border border-border bg-background px-4"
          />
          <input
            type="email"
            placeholder="Email"
            value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            className="h-11 rounded-xl border border-border bg-background px-4 sm:col-span-2"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Credit limit £ (optional)"
            value={form.credit_limit}
            onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
            className="h-11 rounded-xl border border-border bg-background px-4 sm:col-span-2"
          />
          <textarea
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="min-h-20 rounded-xl border border-border bg-background p-3 sm:col-span-2"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full border border-border px-4 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-brand disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create tab"}
          </button>
        </div>
      </form>
    </div>
  );
}

function StatementModal({
  account,
  onClose,
  onSettled,
}: {
  account: Account;
  onClose: () => void;
  onSettled: () => void;
}) {
  const load = useServerFn(getAccountStatement);
  const pay = useServerFn(recordAccountPayment);
  const delPay = useServerFn(deleteAccountPayment);
  const [data, setData] = useState<Statement | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", method: "bank_transfer", reference: "" });
  const [busy, setBusy] = useState(false);

  async function reload() {
    setData(await load({ data: { account_id: account.id } }));
  }
  useEffect(() => {
    void reload();
  }, [account.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data)
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
        <div className="rounded-2xl bg-card p-8">Loading…</div>
      </div>
    );

  const onTab = data.orders.filter((o) => o.payment_status === "on_account");
  const paid = data.orders.filter((o) => o.payment_status !== "on_account");
  const charges = onTab.reduce((s, o) => s + o.total_cents, 0);
  const unsettledPayments = data.payments.filter((p) => !p.settled_at);
  const paidOff = unsettledPayments.reduce((s, p) => s + p.amount_cents, 0);
  const outstanding = Math.max(charges - paidOff, 0);
  const itemsByOrder = new Map<string, typeof data.items>();
  for (const it of data.items) {
    const arr = itemsByOrder.get(it.order_id) ?? [];
    arr.push(it);
    itemsByOrder.set(it.order_id, arr);
  }

  function prepareFullSettlement() {
    setPayForm({
      amount: (outstanding / 100).toFixed(2),
      method: "bank_transfer",
      reference: "",
    });
    setPayOpen(true);
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    const cents = Math.round(parseFloat(payForm.amount || "0") * 100);
    if (!cents || cents <= 0) {
      toast.error("Enter an amount");
      return;
    }
    setBusy(true);
    try {
      const result = await pay({
        data: {
          account_id: account.id,
          amount_cents: cents,
          method: payForm.method as "cash" | "card" | "bank_transfer" | "other",
          reference: payForm.reference || undefined,
        },
      });
      toast.success(
        result.fully_settled
          ? `Tab paid in full · ${result.paid_orders} order${result.paid_orders === 1 ? "" : "s"} settled`
          : `Part-payment of ${money(cents)} recorded · ${money(result.balance_after_cents)} remains`,
      );
      setPayForm({ amount: "", method: "bank_transfer", reference: "" });
      setPayOpen(false);
      await reload();
      if (result.fully_settled) onSettled();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record payment");
    } finally {
      setBusy(false);
    }
  }

  function downloadPdf() {
    buildStatementPdf({
      account,
      orders: data!.orders,
      items: data!.items,
      payments: data!.payments,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 print:static print:bg-white"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-border bg-card p-8 shadow-2xl print:max-h-none print:w-full print:overflow-visible print:border-0 print:shadow-none"
      >
        <div className="flex items-start justify-between gap-4 print:block">
          <div>
            <p className="font-display text-2xl font-bold">Cafe1 · Tab statement</p>
            <p className="mt-1 font-semibold">{account.name}</p>
            {account.contact_name && (
              <p className="text-sm text-muted-foreground">{account.contact_name}</p>
            )}
            {account.contact_email && (
              <p className="text-sm text-muted-foreground">{account.contact_email}</p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">{new Date().toLocaleDateString()}</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              onClick={downloadPdf}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:border-primary hover:text-primary"
            >
              <FileDown className="h-4 w-4" />
              PDF
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:border-primary hover:text-primary"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            {outstanding > 0 && (
              <button
                onClick={() => setPayOpen((v) => !v)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold hover:border-primary hover:text-primary"
              >
                <Banknote className="h-4 w-4" />
                Record payment
              </button>
            )}
            {outstanding > 0 && (
              <button
                onClick={prepareFullSettlement}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-brand"
              >
                <CheckCircle2 className="h-4 w-4" />
                Settle {money(outstanding)}
              </button>
            )}
          </div>
        </div>

        {payOpen && (
          <form
            onSubmit={submitPayment}
            className="mt-4 grid gap-2 rounded-xl border border-border bg-secondary/40 p-4 sm:grid-cols-4 print:hidden"
          >
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              autoFocus
              placeholder="Amount £"
              value={payForm.amount}
              onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
            />
            <select
              value={payForm.method}
              onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
            <input
              placeholder="Reference (optional)"
              value={payForm.reference}
              onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
            />
            <button
              disabled={busy}
              className="h-10 rounded-full bg-foreground text-sm font-semibold text-background disabled:opacity-60"
            >
              {busy ? "Saving…" : "Add part-payment"}
            </button>
          </form>
        )}

        <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Charges on tab</span>
            <span>{money(charges)}</span>
          </div>
          {paidOff > 0 && (
            <div className="mt-1 flex justify-between text-muted-foreground">
              <span>Payments received</span>
              <span>− {money(paidOff)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-primary/20 pt-2">
            <span className="font-semibold">Balance due</span>
            <span className="font-display text-xl font-bold text-primary">
              {money(outstanding)}
            </span>
          </div>
          <div className="mt-1 flex justify-between text-muted-foreground">
            <span>{onTab.length} unsettled orders</span>
            {account.credit_limit_cents ? (
              <span>Credit limit {money(account.credit_limit_cents)}</span>
            ) : null}
          </div>
        </div>

        {data.payments.length > 0 && (
          <section className="mt-6">
            <h3 className="font-display text-lg font-bold">Payment history</h3>
            <ul className="mt-2 divide-y divide-border text-sm">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span>
                    {new Date(p.created_at).toLocaleDateString()} · {p.method.replace("_", " ")}
                    {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
                    <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      {p.settled_at ? "Settled" : "Part payment"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-semibold">− {money(p.amount_cents)}</span>
                    {!p.settled_at && (
                      <button
                        className="text-muted-foreground hover:text-primary print:hidden"
                        title="Remove part-payment"
                        onClick={async () => {
                          if (!(await askConfirm("Remove this part-payment record?"))) return;
                          try {
                            await delPay({ data: { id: p.id } });
                            await reload();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Delete failed");
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6">
          <h3 className="font-display text-lg font-bold">Unsettled charges</h3>
          {onTab.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">Nothing outstanding.</p>
          )}
          {onTab.map((o) => (
            <div key={o.id} className="mt-3 rounded-xl border border-border p-4 text-sm">
              <div className="flex justify-between font-semibold">
                <span>
                  #{o.order_number} · {new Date(o.created_at).toLocaleString()}
                </span>
                <span>{money(o.total_cents)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {o.customer_name} · {o.type}
              </div>
              <ul className="mt-2 divide-y divide-border text-xs">
                {(itemsByOrder.get(o.id) ?? []).map((it, idx) => (
                  <li key={idx} className="flex justify-between py-1">
                    <span>
                      {it.qty} × {it.name}
                    </span>
                    <span>{money(it.qty * it.unit_price_cents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {paid.length > 0 && (
          <section className="mt-6">
            <h3 className="font-display text-lg font-bold">Previously settled</h3>
            <ul className="mt-2 divide-y divide-border text-sm">
              {paid.map((o) => (
                <li key={o.id} className="flex justify-between py-2">
                  <span>
                    #{o.order_number} · {new Date(o.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-muted-foreground">
                    {money(o.total_cents)} · {o.payment_status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
