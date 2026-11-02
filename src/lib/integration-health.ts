/**
 * A fresh watcher heartbeat proves the local bridge is currently running.
 * A webhook only proves that a provider event arrived at one point in time:
 * it cannot certify an always-on connection during quiet periods.
 */
export type IntegrationHeartbeat = {
  key: string;
  healthy: boolean;
  last_seen_at: string | null;
  detail?: string | null;
};

export type ProviderName = "deliveroo" | "just_eat";
export type ProviderSignal = {
  provider: ProviderName;
  state: "connected" | "observed" | "stale" | "error" | "unverified";
  source: "watcher" | "webhook" | "none";
  lastSeenAt: number | null;
  explanation: string;
};

const WATCHER_STALE_MS = 180_000;

function observedAt(row: IntegrationHeartbeat | undefined, now: number): number | null {
  if (!row?.last_seen_at) return null;
  const ms = Date.parse(row.last_seen_at);
  // A clock set in the far future must not keep an offline watcher "alive".
  if (!Number.isFinite(ms) || ms > now + 60_000) return null;
  return ms;
}

export function assessProviderSignal(
  provider: ProviderName,
  rows: readonly IntegrationHeartbeat[],
  now = Date.now(),
): ProviderSignal {
  const watcherKey = provider === "deliveroo" ? "deliveroo_hub" : "just_eat_hub";
  const webhookKey = provider === "deliveroo" ? "deliveroo_orders_api" : "just_eat_orders";
  const watcher = rows.find((row) => row.key === watcherKey);
  const webhook = rows.find((row) => row.key === webhookKey);
  const watcherAt = observedAt(watcher, now);
  const eventAt = observedAt(webhook, now);
  const base = { provider };

  if (watcher && watcherAt !== null && !watcher.healthy) {
    return {
      ...base,
      state: "error",
      source: "watcher",
      lastSeenAt: watcherAt,
      explanation: watcher.detail || "The shop watcher reports an error or signed-out session.",
    };
  }
  if (watcher?.healthy && watcherAt !== null && now - watcherAt <= WATCHER_STALE_MS) {
    return {
      ...base,
      state: "connected",
      source: "watcher",
      lastSeenAt: watcherAt,
      explanation: "Shop watcher heartbeat received within three minutes. Confirm orders on the provider device.",
    };
  }

  // A newer official webhook event is informative even if the fallback Hub
  // watcher is stale. Its timestamp must never be described as 'live'.
  if (webhook?.healthy && eventAt !== null && (watcherAt === null || eventAt > watcherAt)) {
    return {
      ...base,
      state: "observed",
      source: "webhook",
      lastSeenAt: eventAt,
      explanation: "A signed provider order event was received. This does not prove the webhook is currently connected.",
    };
  }
  if (watcher) {
    return {
      ...base,
      state: watcher.healthy ? "stale" : "error",
      source: "watcher",
      lastSeenAt: watcherAt,
      explanation: watcher.healthy
        ? "Shop watcher has not checked in within three minutes. Verify the tablet and key missing tickets manually."
        : watcher.detail || "Shop watcher reported a fault. Verify the provider tablet.",
    };
  }
  if (webhook) {
    return {
      ...base,
      state: webhook.healthy && eventAt !== null ? "observed" : "error",
      source: "webhook",
      lastSeenAt: eventAt,
      explanation: webhook.healthy
        ? "Provider webhook event recorded; current connectivity is not verified."
        : "Provider webhook status indicates a fault or an invalid timestamp.",
    };
  }
  return {
    ...base,
    state: "unverified",
    source: "none",
    lastSeenAt: null,
    explanation: "No integration activity has been recorded. Check the provider tablet before relying on automatic KDS tickets.",
  };
}

export function providerSignalLabel(signal: ProviderSignal): string {
  const label = signal.provider === "deliveroo" ? "Deliveroo" : "Just Eat";
  switch (signal.state) {
    case "connected":
      return `${label} watcher active`;
    case "observed":
      return `${label} event seen`;
    case "stale":
      return `${label} watcher stale`;
    case "error":
      return `${label} needs attention`;
    default:
      return `${label} unverified`;
  }
}
