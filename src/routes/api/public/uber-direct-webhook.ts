import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Uber Direct delivery status + courier location webhook.
 * Uber signs the raw body with our webhook secret (X-Postmates-Signature).
 */
export const Route = createFileRoute("/api/public/uber-direct-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["UBER_DIRECT_WEBHOOK_SECRET"];
        if (!secret) return new Response("not configured", { status: 503 });

        const raw = await request.text();
        const signature =
          request.headers.get("x-postmates-signature") ??
          request.headers.get("x-uber-signature") ??
          "";
        const expected = createHmac("sha256", secret).update(raw).digest("hex");
        const sig = Buffer.from(signature.trim().toLowerCase());
        const exp = Buffer.from(expected);
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          return new Response("invalid signature", { status: 401 });
        }

        let body: {
          kind?: string;
          status?: string;
          delivery_id?: string;
          tracking_url?: string;
          data?: {
            id?: string;
            status?: string;
            tracking_url?: string;
            courier?: {
              name?: string;
              location?: { lat: number; lng: number };
            } | null;
          };
          location?: { lat: number; lng: number };
        };
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const deliveryId = body.delivery_id ?? body.data?.id;
        if (!deliveryId) return new Response("no delivery id", { status: 400 });

        const { applyUberDeliveryUpdate } = await import("@/lib/uber-webhook.server");
        const result = await applyUberDeliveryUpdate({
          deliveryId,
          status: body.status ?? body.data?.status ?? null,
          trackingUrl: body.tracking_url ?? body.data?.tracking_url ?? null,
          courierName: body.data?.courier?.name ?? null,
          location: body.data?.courier?.location ?? body.location ?? null,
        });

        return Response.json({ ok: result.ok });
      },
    },
  },
});
