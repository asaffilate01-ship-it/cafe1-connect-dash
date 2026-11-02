import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_UBER_WEBHOOK_BYTES,
  UberWebhookTooLarge,
  parseUberVerifiedEvent,
  readUberWebhookBytes,
  verifyUberWebhookSignature,
} from "@/lib/uber-webhook-security";

describe("Uber Direct webhook authentication", () => {
  it("verifies exact raw payload bytes and rejects mutations/invalid hex", () => {
    const secret = "server-only-secret";
    const body = new TextEncoder().encode('{"note":"\\u0026","delivery_id":"d_123"}');
    const valid = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyUberWebhookSignature(body, valid, secret)).toBe(true);
    expect(verifyUberWebhookSignature(body, valid.toUpperCase(), secret)).toBe(true);
    expect(verifyUberWebhookSignature(new TextEncoder().encode('{"note":"&","delivery_id":"d_123"}'), valid, secret)).toBe(false);
    expect(verifyUberWebhookSignature(body, "bad", secret)).toBe(false);
    expect(verifyUberWebhookSignature(body, valid, "")).toBe(false);
  });

  it("rejects oversized bodies even with a forged content-length", async () => {
    const declared = new Request("https://example.com", {
      method: "POST",
      headers: { "content-length": String(MAX_UBER_WEBHOOK_BYTES + 1) },
      body: "ok",
    });
    await expect(readUberWebhookBytes(declared)).rejects.toBeInstanceOf(UberWebhookTooLarge);
    const oversized = new Request("https://example.com", {
      method: "POST",
      body: "x".repeat(MAX_UBER_WEBHOOK_BYTES + 1),
    });
    await expect(readUberWebhookBytes(oversized)).rejects.toBeInstanceOf(UberWebhookTooLarge);
    const valid = new Request("https://example.com", { method: "POST", body: "{}" });
    expect(new TextDecoder().decode(await readUberWebhookBytes(valid))).toBe("{}");
  });
});

describe("Uber Direct event boundaries", () => {
  it("accepts only finite geographical coordinates and expected data shapes", () => {
    expect(parseUberVerifiedEvent({
      data: {
        id: "delivery-1",
        status: "delivered",
        tracking_url: "https://www.ubereats.com/orders/abc",
        courier: { name: "Courier", location: { lat: 51.7, lng: -0.3 } },
      },
    })).toEqual({
      deliveryId: "delivery-1",
      status: "delivered",
      trackingUrl: "https://www.ubereats.com/orders/abc",
      courierName: "Courier",
      location: { lat: 51.7, lng: -0.3 },
    });
    expect(parseUberVerifiedEvent({ delivery_id: "ok", location: { lat: 100, lng: 2 } })?.location)
      .toBeNull();
    expect(parseUberVerifiedEvent({ delivery_id: "ok", tracking_url: "javascript:alert(1)" })?.trackingUrl)
      .toBeNull();
    expect(parseUberVerifiedEvent({ delivery_id: "ok", tracking_url: "https://uber.com.evil.com/" })?.trackingUrl)
      .toBeNull();
    expect(parseUberVerifiedEvent({})).toBeNull();
  });
});
