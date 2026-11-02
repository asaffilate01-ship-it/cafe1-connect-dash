import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-auth";
import { verifyTabCode } from "@/lib/accounts.functions";
import { tab, useTab } from "@/lib/tab";
import { SiteHeader } from "@/components/site-header";
import { toast } from "sonner";
import { Scale, LogOut } from "lucide-react";

export const Route = createFileRoute("/judges")({
  head: () => ({
    meta: [
      { title: "Judges' ordering portal — Cafe1" },
      {
        name: "description",
        content: "Private ordering portal for HMCTS judges at Cafe1, St Albans Crown Court.",
      },
      { property: "og:title", content: "Judges' ordering portal — Cafe1" },
      {
        property: "og:description",
        content: "Private ordering portal for HMCTS judges at Cafe1, St Albans Crown Court.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JudgesPortal,
});

function JudgesPortal() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const current = useTab();
  const verify = useServerFn(verifyTabCode);

  const [email, setEmail] = useState("judge@cafe1stalbans.co.uk");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw new Error("Sign-in failed. Check the credentials provided by Cafe 1 or ask a manager to enable the judges' portal.");
      toast.success("Signed in");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await verify({ data: { code } });
      if (!res.ok) {
        toast.error("Sorry, that judge code isn't recognised. Please check and try again.");
        return;
      }
      tab.set({ account_id: res.account_id, name: res.name, code: res.code });
      toast.success(`Ordering on ${res.name}'s tab`);
      navigate({ to: "/menu" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check that code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-brand">
          <div className="mb-6 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground">
            <Scale className="h-6 w-6" />
          </div>
          <h1 className="font-display text-3xl font-bold">Judges' ordering portal</h1>

          {loading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : !user ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in with the shared judges' login provided by the court.
              </p>
              <form onSubmit={signIn} className="mt-6 space-y-3">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="judge@cafe1stalbans.co.uk"
                  className="h-12 w-full rounded-2xl border border-border bg-background px-4"
                />
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="h-12 w-full rounded-2xl border border-border bg-background px-4"
                />
                <button
                  disabled={busy}
                  className="h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground shadow-brand disabled:opacity-60"
                >
                  {busy ? "Signing in…" : "Sign in"}
                </button>
              </form>
            </>
          ) : current ? (
            <div className="mt-6 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm">
              <p className="font-semibold text-primary">Ordering on {current.name}'s tab</p>
              <p className="mt-1 text-muted-foreground">
                Code: <span className="font-mono">{current.code}</span>
              </p>
              <p className="mt-2 text-muted-foreground">
                Everything ordered this week is added to this tab and settled on Friday.
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  to="/judges-menu"
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
                >
                  Open the Judges' menu
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    tab.clear();
                    toast.message("Judge code cleared");
                  }}
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-full border border-border px-4 text-sm font-semibold hover:border-primary hover:text-primary"
                >
                  <LogOut className="h-4 w-4" /> Change code
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter your own personal judge code. Your orders are added to your tab and paid for
                on Friday.
              </p>
              <form onSubmit={submitCode} className="mt-6 space-y-3">
                <input
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="JUDGE CODE"
                  className="h-14 w-full rounded-2xl border border-border bg-background px-4 text-center font-mono text-2xl tracking-[0.3em]"
                />
                <button
                  disabled={busy}
                  className="h-12 w-full rounded-full bg-primary font-semibold text-primary-foreground shadow-brand disabled:opacity-60"
                >
                  {busy ? "Checking…" : "Continue"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
