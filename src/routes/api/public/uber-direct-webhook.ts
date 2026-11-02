import { createFileRoute } from "@tanstack/react-router";
import {
  UberWebhookTooLarge,
  parseUberVerifiedEvent,
  readUberWebhookBytes,
  verifyUberWebhookSignature,
} from "@/lib/uber-webhook-security";

/**
 * Uber Direct delivery + courier webhook: exact-byte HMAC, bounded request,
 * verified event shape. Never trust raw notification data without signature.
 */
export const Route = createFileRoute("/api/public/uber-direct-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["UBER_DIRECT_WEBHOOK_SECRET"];
        if (!secret) return new Response("not configured", { status: 503 });

        try {
          const rawBytes = await readUberWebhookBytes(request);
          const signature =
            request.headers.get("x-uber-signature") ??
            request.headers.get("x-postmates-signature");
          if (!verifyUberWebhookSignature(rawBytes, signature, secret)) {
            return new Response("invalid signature", { status: 401 });
          }

          let body: unknown;
          try {
            body = JSON.parse(new TextDecoder().decode(rawBytes));
          } catch {
            return new Response("bad json", { status: 400 });
          }
          const event = parseUberVerifiedEvent(body);
          if (!event) return new Response("invalid delivery event", { status: 400 });

          const { applyUberDeliveryUpdate } = await import("@/lib/uber-webhook.server");
          const result = await applyUberDeliveryUpdate(event);
          // A verified webhook can race the post-booking database write.
          // A transient 503 asks Uber to retry rather than losing its update.
          if (!result.ok) return new Response("delivery not yet linked", { status: 503 });
          return Response.json({ ok: true });
        } catch (error) {
          if (error instanceof UberWebhookTooLarge) {
            return new Response("payload too large", { status: 413 });
          }
          console.error("[uber-direct-webhook] processing failed", error);
          return new Response("temporary error", { status: 503 });
        }
      },
    },
  },
});
