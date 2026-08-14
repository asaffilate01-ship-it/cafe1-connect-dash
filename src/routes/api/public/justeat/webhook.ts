import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { IngestOrder } from "@/lib/deliveroo-ingest.server";
import {
  cancelPartnerOrder,
  ingestPartnerOrder,
  justEatIngestEnabled,
  partnerSecretMatches,
  readPartnerSecret,
} from "@/lib/partner-ingest.server";
import { recordIntegrationHeartbeat } from "@/lib/deliveroo-ingest.server";

const MAX_BYTES = 500_000;

const PayloadSchema = z.object({
  reference: z.string().trim().min(1).max(80),
  status: z.enum(["accepted", "placed", "cancelled", "rejected"]).default("placed"),
  type: z.enum(["delivery", "collection"]).default("delivery"),
  customer_name: z.string().trim().max(60).optional(),
  customer_phone: z.string().trim().max(40).optional(),
  total_cents: z.number().int().min(0).max(1_000_000).default(0),
  notes: z.string().trim().max(700).optional(),
  scheduled_for: z.string().datetime().optional(),
  address: z
    .object({
      line1: z.string().trim().max(120).optional(),
      line2: z.string().trim().max(120).optional(),
      city: z.string().trim().max(80).optional(),
      postcode: z.string().trim().max(20).optional(),
    })
    .optional(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        qty: z.number().int().min(1).max(50).default(1),
        unit_price_cents: z.number().int().min(0).max(100_000).optional(),
        notes: z.string().trim().max(300).optional(),
      }),
    )
    .max(100)
    .default([]),
});

export const Route = createFileRoute("/api/public/justeat/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!justEatIngestEnabled("webhook")) {
          return new Response("Just Eat webhook is disabled", { status: 503 });
        }
        if (!process.env["JUSTEAT_BRIDGE_SECRET"]) {
          return new Response("Just Eat ingest not configured", { status: 503 });
        }
        if (!partnerSecretMatches("just_eat", readPartnerSecret(request))) {
          return new Response("Invalid secret", { status: 401 });
        }
        const raw = await request.text();
        if (raw.length > MAX_BYTES) return new Response("Payload too large", { status: 413 });

        let parsed: z.infer<typeof PayloadSchema>;
        try {
          parsed = PayloadSchema.parse(JSON.parse(raw));
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        try {
          if (parsed.status === "cancelled" || parsed.status === "rejected") {
            await cancelPartnerOrder("just_eat", parsed.reference);
            await recordIntegrationHeartbeat(
              "just_eat_orders",
              `Cancelled ${parsed.reference}`,
            );
            return Response.json({ ok: true, cancelled: true });
          }

          const items = parsed.items.map((item) => ({
            name: item.name,
            qty: item.qty,
            unitPriceCents: item.unit_price_cents,
            notes: item.notes ?? null,
          }));
          const order: IngestOrder = {
            reference: parsed.reference,
            customerName: parsed.customer_name ?? null,
            customerPhone: parsed.customer_phone ?? null,
            type: parsed.type,
            totalCents: parsed.total_cents,
            notes: parsed.notes ?? null,
            scheduledFor: parsed.scheduled_for ?? null,
            address: {
              line1: parsed.address?.line1 ?? null,
              line2: parsed.address?.line2 ?? null,
              city: parsed.address?.city ?? null,
              postcode: parsed.address?.postcode ?? null,
            },
            items: items.length
              ? items
              : [
                  {
                    name: "Just Eat order — check device",
                    qty: 1,
                    unitPriceCents: parsed.total_cents,
                    notes: null,
                  },
                ],
          };
          const result = await ingestPartnerOrder("just_eat", order);
          return Response.json({ ok: true, ...result });
        } catch (err) {
          console.error("[justeat-webhook]", (err as Error).message);
          return new Response("Ingest failed", { status: 500 });
        }
      },
    },
  },
});
