import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Radio } from "lucide-react";
import { getIntegrationDiagnostics } from "@/lib/operations.functions";
import { providerSignalLabel, type ProviderSignal } from "@/lib/integration-health";

type Diagnostics = Awaited<ReturnType<typeof getIntegrationDiagnostics>>;

/** Read-only operational evidence, not a provider onboarding control. */
export function IntegrationDiagnosticsPanel() {
  const read = useServerFn(getIntegrationDiagnostics);
  const [result, setResult] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const response = await read();
      setResult(response);
      setError(null);
    } catch {
      setError("Unable to refresh marketplace links. Confirm directly on the provider tablet.");
    } finally {
      setBusy(false);
    }
  }, [read]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5" aria-label="Marketplace integration diagnostics">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <Radio className="h-5 w-5 text-primary" aria-hidden="true" />
            Kitchen partner links
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cafe 1-wide diagnostic signals. A recent webhook means an event arrived,
            not that future orders are guaranteed. Verify missing tickets on the partner tablet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:border-primary disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
          Check links
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/50 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {result?.signals.map((signal) => <SignalCard key={signal.provider} signal={signal} />) ??
          <p className="text-sm text-muted-foreground">
            {busy ? "Checking partner activity…" : "No integration diagnostics available."}
          </p>}
      </div>
      {result && (
        <p className="mt-3 text-xs text-muted-foreground">
          Diagnostic read: {new Date(result.checked_at).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/London",
          })} UK time.
        </p>
      )}
    </section>
  );
}

function SignalCard({ signal }: { signal: ProviderSignal }) {
  const isConnected = signal.state === "connected";
  const isObserved = signal.state === "observed";
  const status =
    isConnected ? "Watcher connected" : isObserved ? "Order event observed" : "Check provider device";
  const border = isConnected
    ? "border-emerald-500/40"
    : isObserved
      ? "border-border"
      : "border-amber-500/50";

  return (
    <article className={`rounded-xl border p-4 ${border}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{providerSignalLabel(signal)}</h3>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
          {status}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{signal.explanation}</p>
      <p className="mt-3 text-xs font-medium text-muted-foreground">
        {signal.lastSeenAt !== null
          ? `Last signal: ${new Date(signal.lastSeenAt).toLocaleString("en-GB", {
              timeZone: "Europe/London",
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })} UK`
          : "No trustworthy event timestamp recorded"}
      </p>
    </article>
  );
}
