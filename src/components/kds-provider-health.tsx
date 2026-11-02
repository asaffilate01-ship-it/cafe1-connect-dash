import { Bike } from "lucide-react";
import {
  providerSignalLabel,
  type ProviderName,
  type ProviderSignal,
} from "@/lib/integration-health";

type Props = {
  provider: ProviderName;
  signal: ProviderSignal | null;
  now: number;
  compact?: boolean;
};

/**
 * The signal is evidence, not a promise that a future marketplace order will
 * arrive. Source and last-event age are available even on narrow KDS screens.
 */
export function KdsProviderHealthPill({ provider, signal, now, compact = false }: Props) {
  const brand = provider === "deliveroo" ? "Deliveroo" : "Just Eat";
  const label = signal ? providerSignalLabel(signal) : `${brand} checking…`;
  const elapsed =
    signal?.lastSeenAt == null
      ? "No recorded heartbeat"
      : `Last recorded ${Math.max(0, Math.floor((now - signal.lastSeenAt) / 60_000))} minutes ago`;
  const note = signal
    ? `${signal.explanation} ${elapsed}.`
    : "Checking the latest available integration evidence.";
  const connected = signal?.state === "connected";
  const observed = signal?.state === "observed";
  const unavailable = signal?.state === "error" || signal?.state === "stale";
  const background = connected
    ? provider === "deliveroo"
      ? "bg-[#00CCBC] text-black"
      : "bg-[#FF8000] text-black"
    : unavailable
      ? "bg-red-600 text-white"
      : observed
        ? "bg-primary-foreground/15 text-primary-foreground"
        : "bg-primary-foreground/15 text-primary-foreground";

  return (
    <span
      role="status"
      aria-live="polite"
      title={note}
      aria-label={`${brand}: ${label}. ${note}`}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full font-bold ${background} ${
        compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-2 text-xs"
      }`}
    >
      <Bike className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
      {!connected && !compact && (
        <span className="sr-only">Check the provider tablet and enter missing orders manually.</span>
      )}
    </span>
  );
}
