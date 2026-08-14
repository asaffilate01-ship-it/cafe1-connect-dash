import { describe, expect, it } from "vitest";

import { justEatIngestEnabled, readJustEatIngestMode } from "@/lib/partner-ingest.server";

describe("Just Eat ingest mode", () => {
  it("is fail-closed when the mode is absent or unsupported", () => {
    expect(readJustEatIngestMode({})).toBe("disabled");
    expect(readJustEatIngestMode({ JUSTEAT_INGEST_MODE: "orders_api" })).toBe("disabled");
    expect(justEatIngestEnabled("hub_watcher", {})).toBe(false);
    expect(justEatIngestEnabled("webhook", {})).toBe(false);
  });

  it("enables only the configured channel unless dual mode is selected", () => {
    const watcher = { JUSTEAT_INGEST_MODE: "hub_watcher" };
    expect(justEatIngestEnabled("hub_watcher", watcher)).toBe(true);
    expect(justEatIngestEnabled("webhook", watcher)).toBe(false);

    const webhook = { JUSTEAT_INGEST_MODE: "webhook" };
    expect(justEatIngestEnabled("hub_watcher", webhook)).toBe(false);
    expect(justEatIngestEnabled("webhook", webhook)).toBe(true);

    const dual = { JUSTEAT_INGEST_MODE: " DUAL " };
    expect(justEatIngestEnabled("hub_watcher", dual)).toBe(true);
    expect(justEatIngestEnabled("webhook", dual)).toBe(true);
  });
});
