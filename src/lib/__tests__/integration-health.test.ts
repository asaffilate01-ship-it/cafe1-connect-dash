import { describe, expect, it } from "vitest";
import {
  assessProviderSignal,
  providerSignalLabel,
  type IntegrationHeartbeat,
} from "@/lib/integration-health";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const row = (key: string, agoMs: number, healthy = true, detail: string | null = null): IntegrationHeartbeat => ({
  key,
  healthy,
  detail,
  last_seen_at: new Date(NOW - agoMs).toISOString(),
});

describe("kitchen provider heartbeat evidence", () => {
  it("trusts a recent healthy watcher as evidence of the local bridge, not of order receipt", () => {
    const status = assessProviderSignal("deliveroo", [row("deliveroo_hub", 60_000)], NOW);
    expect(status.state).toBe("connected");
    expect(status.source).toBe("watcher");
    expect(providerSignalLabel(status)).toBe("Deliveroo watcher active");
  });

  it("never treats an old Orders API webhook as a live connection", () => {
    const status = assessProviderSignal(
      "deliveroo",
      [row("deliveroo_orders_api", 12 * 60 * 60_000)],
      NOW,
    );
    expect(status.state).toBe("observed");
    expect(status.source).toBe("webhook");
    expect(status.explanation).toContain("not prove");
  });

  it("prioritises an active watcher even when old official API events exist", () => {
    const status = assessProviderSignal(
      "deliveroo",
      [row("deliveroo_hub", 90_000), row("deliveroo_orders_api", 3600_000)],
      NOW,
    );
    expect(status.state).toBe("connected");
  });

  it("reports a stale watcher instead of treating it as online", () => {
    expect(assessProviderSignal("just_eat", [row("just_eat_hub", 240_000)], NOW).state)
      .toBe("stale");
    expect(assessProviderSignal("just_eat", [row("just_eat_hub", 180_000)], NOW).state)
      .toBe("connected");
  });

  it("recognises a signed-out watcher even with a fresh heartbeat", () => {
    const status = assessProviderSignal(
      "just_eat",
      [row("just_eat_hub", 30_000, false, "Signed out of Partner Centre")],
      NOW,
    );
    expect(status.state).toBe("error");
    expect(status.explanation).toContain("Signed out");
  });

  it("does not prefer a stale watcher over a newer webhook event", () => {
    const status = assessProviderSignal(
      "deliveroo",
      [row("deliveroo_hub", 600_000), row("deliveroo_orders_api", 30_000)],
      NOW,
    );
    expect(status.state).toBe("observed");
    expect(status.source).toBe("webhook");
  });

  it("fails safely for missing or impossible heartbeat timestamps", () => {
    expect(assessProviderSignal("just_eat", [], NOW).state).toBe("unverified");
    const future = row("just_eat_hub", -3600_000);
    expect(assessProviderSignal("just_eat", [future], NOW).state).toBe("stale");
    expect(
      assessProviderSignal(
        "deliveroo",
        [{ key: "deliveroo_hub", healthy: true, last_seen_at: "bad" }],
        NOW,
      ).state,
    ).toBe("stale");
  });

  it("does not mistake an event-only Just Eat bridge for a healthy watcher", () => {
    const status = assessProviderSignal("just_eat", [row("just_eat_orders", 8_000)], NOW);
    expect(status.state).toBe("observed");
  });
});
