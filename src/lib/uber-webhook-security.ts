import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_UBER_WEBHOOK_BYTES = 128 * 1024;

export class UberWebhookTooLarge extends Error {
  constructor() {
    super("Uber webhook exceeds configured maximum size");
    this.name = "UberWebhookTooLarge";
  }
}

/** Read a bounded body before parsing JSON. HMAC verification uses exact bytes. */
export async function readUberWebhookBytes(
  request: Request,
  maxBytes = MAX_UBER_WEBHOOK_BYTES,
): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw new UberWebhookTooLarge();
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new UberWebhookTooLarge();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}

/** Uber signs the unchanged raw bytes, not parsed/re-serialised JSON. */
export function verifyUberWebhookSignature(
  bytes: Uint8Array,
  header: string | null,
  signingKey: string,
): boolean {
  const signature = header?.trim() ?? "";
  if (!signingKey || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const actual = Buffer.from(signature, "hex");
  const expected = createHmac("sha256", signingKey).update(bytes).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type UberVerifiedEvent = {
  deliveryId: string;
  status: string | null;
  trackingUrl: string | null;
  courierName: string | null;
  location: { lat: number; lng: number } | null;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, limit: number): string | null {
  return typeof value === "string" && value.trim() && value.length <= limit
    ? value.trim()
    : null;
}

function location(value: unknown): UberVerifiedEvent["location"] {
  const point = object(value);
  const lat = point["lat"];
  const lng = point["lng"];
  if (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  ) {
    return { lat, lng };
  }
  return null;
}

function trackingUrl(value: unknown): string | null {
  const candidate = text(value, 1000);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== "https:" ||
      !(host === "uber.com" ||
        host.endsWith(".uber.com") ||
        host === "ubereats.com" ||
        host.endsWith(".ubereats.com"))
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function parseUberVerifiedEvent(payload: unknown): UberVerifiedEvent | null {
  const body = object(payload);
  const data = object(body["data"]);
  const courier = object(data["courier"]);
  const deliveryId = text(body["delivery_id"], 128) ?? text(data["id"], 128);
  if (!deliveryId) return null;
  const status = text(body["status"], 80) ?? text(data["status"], 80);
  return {
    deliveryId,
    status,
    trackingUrl: trackingUrl(body["tracking_url"] ?? data["tracking_url"]),
    courierName: text(courier["name"], 100),
    location: location(courier["location"] ?? body["location"]),
  };
}
