/**
 * Uber Direct (Uber Eats delivery-as-a-service) client — server only.
 *
 * Uber Direct lets us hand an order to an Uber courier for the last mile while
 * the customer stays on our own site. We use it for deliveries outside the
 * half-mile radius our own driver covers.
 *
 * Required secrets:
 *   UBER_DIRECT_CUSTOMER_ID  — the organisation/customer id from Uber Direct
 *   UBER_DIRECT_CLIENT_ID    — OAuth app client id
 *   UBER_DIRECT_CLIENT_SECRET— OAuth app client secret
 *   UBER_DIRECT_WEBHOOK_SECRET — signing key for delivery status webhooks
 */

const AUTH_URL = "https://auth.uber.com/oauth/v2/token";
const API_BASE = "https://api.uber.com/v1/customers";

export type UberCreds = {
  customerId: string;
  clientId: string;
  clientSecret: string;
};

export function uberCreds(): UberCreds | null {
  const customerId = process.env["UBER_DIRECT_CUSTOMER_ID"];
  const clientId = process.env["UBER_DIRECT_CLIENT_ID"];
  const clientSecret = process.env["UBER_DIRECT_CLIENT_SECRET"];
  if (!customerId || !clientId || !clientSecret) return null;
  return { customerId, clientId, clientSecret };
}

export function uberDirectConfigured() {
  return uberCreds() !== null;
}

/** Cached bearer token (tokens last 30 days; we refresh well before that). */
let tokenCache: { token: string; expires: number } | null = null;

async function getToken(creds: UberCreds): Promise<string> {
  if (tokenCache && tokenCache.expires > Date.now() + 60_000) return tokenCache.token;
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "client_credentials",
    scope: "eats.deliveries",
  });
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Uber auth failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache = {
    token: json.access_token,
    expires: Date.now() + Math.min((json.expires_in ?? 2592000) * 1000, 3600_000),
  };
  return json.access_token;
}

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const creds = uberCreds();
  if (!creds) throw new Error("Uber Direct is not configured");
  const token = await getToken(creds);
  const res = await fetch(`${API_BASE}/${creds.customerId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    ...(init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: string; code?: string };
      message = parsed.message ?? parsed.code ?? text;
    } catch {
      /* raw text */
    }
    throw new Error(`Uber Direct ${res.status}: ${message.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export type UberAddress = {
  street_address: string[];
  city: string;
  state?: string;
  zip_code: string;
  country: string;
};

export type UberQuote = {
  id: string;
  fee: number;
  currency: string;
  dropoff_eta?: string;
  duration?: number;
};

export type UberDelivery = {
  id: string;
  status: string;
  tracking_url?: string;
  fee?: number;
  courier?: {
    name?: string;
    phone_number?: string;
    location?: { lat: number; lng: number };
    vehicle_type?: string;
  } | null;
  dropoff_eta?: string;
};

export function formatUberAddress(a: UberAddress) {
  return JSON.stringify(a);
}

export async function createQuote(input: {
  pickup: UberAddress;
  dropoff: UberAddress;
  pickupReadyAt?: Date;
}): Promise<UberQuote> {
  return call<UberQuote>("/delivery_quotes", {
    method: "POST",
    json: {
      pickup_address: formatUberAddress(input.pickup),
      dropoff_address: formatUberAddress(input.dropoff),
      ...(input.pickupReadyAt ? { pickup_ready_dt: input.pickupReadyAt.toISOString() } : {}),
    },
  });
}

export async function createDelivery(input: {
  quoteId?: string;
  externalId: string;
  pickup: {
    name: string;
    address: UberAddress;
    phone: string;
    notes?: string;
  };
  dropoff: {
    name: string;
    address: UberAddress;
    phone: string;
    notes?: string;
  };
  manifestItems: Array<{ name: string; quantity: number; price?: number }>;
  totalCents: number;
  pickupReadyAt?: Date;
  testMode?: boolean;
}): Promise<UberDelivery> {
  return call<UberDelivery>("/deliveries", {
    method: "POST",
    json: {
      ...(input.quoteId ? { quote_id: input.quoteId } : {}),
      external_id: input.externalId,
      pickup_name: input.pickup.name,
      pickup_address: formatUberAddress(input.pickup.address),
      pickup_phone_number: input.pickup.phone,
      ...(input.pickup.notes ? { pickup_notes: input.pickup.notes.slice(0, 280) } : {}),
      dropoff_name: input.dropoff.name,
      dropoff_address: formatUberAddress(input.dropoff.address),
      dropoff_phone_number: input.dropoff.phone,
      ...(input.dropoff.notes ? { dropoff_notes: input.dropoff.notes.slice(0, 280) } : {}),
      manifest_items: input.manifestItems.map((i) => ({
        name: i.name.slice(0, 60),
        quantity: i.quantity,
        size: "small",
        ...(i.price != null ? { price: i.price } : {}),
      })),
      manifest_total_value: input.totalCents,
      ...(input.pickupReadyAt ? { pickup_ready_dt: input.pickupReadyAt.toISOString() } : {}),
      ...(input.testMode ? { test_specifications: { robo_courier_specification: { mode: "auto" } } } : {}),
    },
  });
}

export async function getDelivery(id: string): Promise<UberDelivery> {
  return call<UberDelivery>(`/deliveries/${encodeURIComponent(id)}`);
}

export async function cancelDelivery(id: string): Promise<UberDelivery> {
  return call<UberDelivery>(`/deliveries/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

/** Maps an Uber delivery status onto a short, customer-friendly label. */
export function courierStatusLabel(status: string | null | undefined): string {
  switch ((status ?? "").toLowerCase()) {
    case "pending":
      return "Finding an Uber courier";
    case "pickup":
    case "courier_imminent":
      return "Courier heading to the café";
    case "pickup_complete":
    case "dropoff":
      return "Courier on the way to you";
    case "delivered":
      return "Delivered";
    case "canceled":
    case "cancelled":
      return "Courier cancelled";
    case "returned":
      return "Returned to the café";
    default:
      return "Uber delivery booked";
  }
}
