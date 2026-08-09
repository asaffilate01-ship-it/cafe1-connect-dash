/** Delivery-area + delivery-window helpers (server only). */

export type LatLng = { lat: number; lng: number };

const cache = new Map<string, LatLng | null>();

function normalise(pc: string) {
  return pc.replace(/\s+/g, "").toUpperCase();
}

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

/** Geocode a UK postcode/address via the Google Maps Platform gateway. */
export async function geocodePostcode(postcode: string): Promise<LatLng | null> {
  const key = normalise(postcode);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !gmKey) {
    // Connector not linked yet — don't block orders.
    cache.set(key, null);
    return null;
  }

  try {
    const address = `${postcode}, UK`;
    const url = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=uk&components=country:GB`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmKey,
      },
    });
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const json = (await res.json()) as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
    };
    const loc = json.results?.[0]?.geometry?.location;
    const out = loc ? { lat: loc.lat, lng: loc.lng } : null;
    cache.set(key, out);
    return out;
  } catch {
    return null;
  }
}

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type DeliverySettings = {
  delivery_origin_postcode: string;
  delivery_radius_m: number;
  delivery_open_time: string;
  delivery_close_time: string;
};

export type AreaCheck =
  | { ok: true; distance_m: number; radius_m: number }
  | { ok: false; reason: string; distance_m?: number; radius_m: number };

export async function checkDeliveryArea(
  postcode: string,
  settings: DeliverySettings,
): Promise<AreaCheck> {
  const radius = Math.min(settings.delivery_radius_m ?? 805, 805);
  const [origin, dest] = await Promise.all([
    geocodePostcode(settings.delivery_origin_postcode),
    geocodePostcode(postcode),
  ]);
  if (!dest) return { ok: false, reason: "We couldn't find that postcode — please check it.", radius_m: radius };
  if (!origin) {
    return {
      ok: false,
      reason:
        "Delivery availability is temporarily unavailable. Please choose Pickup or try again shortly.",
      radius_m: radius,
    };
  }
  const d = Math.round(distanceMeters(origin, dest));
  if (d > radius) {
    const miles = (d / 1609.34).toFixed(2);
    return {
      ok: false,
      reason: `Sorry, you're outside our delivery area — we only deliver within half a mile of ${settings.delivery_origin_postcode} (you're about ${miles} mi away). Please switch to Pickup or Dine-in instead.`,
      distance_m: d,
      radius_m: radius,
    };
  }
  return { ok: true, distance_m: d, radius_m: radius };
}

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** London-local minutes since midnight for a Date. */
function localMinutes(at: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

export function isWithinDeliveryWindow(settings: DeliverySettings, at: Date = new Date()) {
  const now = localMinutes(at);
  return now >= toMinutes(settings.delivery_open_time) && now <= toMinutes(settings.delivery_close_time);
}

export function formatWindow(settings: DeliverySettings) {
  const f = (t: string) => t.slice(0, 5);
  return `${f(settings.delivery_open_time)}–${f(settings.delivery_close_time)}`;
}
