import { createFileRoute } from "@tanstack/react-router";

import { recordIntegrationHeartbeat } from "@/lib/deliveroo-ingest.server";
import { extractJustEatOrders, justEatOrderAction } from "@/lib/justeat-hub";
import {
  cancelPartnerOrder,
  ingestPartnerOrder,
  justEatIngestEnabled,
  partnerSecretMatches,
  readPartnerSecret,
} from "@/lib/partner-ingest.server";

/**
 * Ingest orders observed in the Just Eat Partner Centre.
 *
 * Mirrors the Deliveroo Hub bridge: a watcher on the cafe PC stays signed into
 * Partner Centre and forwards its own order payloads here verbatim, so all
 * interpretation happens server-side. The Just Eat tablet keeps accepting and
 * printing exactly as before; this only mirrors tickets onto the Cafe 1 KDS.
 *
 * Public prefix, so the handler authenticates the caller itself and returns no
 * customer data.
 */
export const Route = createFileRoute("/api/public/justeat/hub-ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!justEatIngestEnabled("hub_watcher")) {
          return Response.json({ error: "Just Eat Hub watcher is disabled" }, { status: 503 });
        }
        if (!process.env["JUSTEAT_BRIDGE_SECRET"]) {
          return Response.json({ error: "Bridge not configured" }, { status: 503 });
        }
        if (!partnerSecretMatches("just_eat", readPartnerSecret(request))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const raw = await request.text();
        if (!raw.trim()) return Response.json({ error: "Empty payload" }, { status: 400 });
        if (raw.length > 400_000)
          return Response.json({ error: "Payload too large" }, { status: 413 });

        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        // Every authenticated call proves the shop watcher is alive, even the
        // quiet ones carrying no orders, so a dead link is visible before an
        // order is missed rather than after.
        const beat = payload as {
          heartbeat?: boolean;
          signedOut?: boolean;
          payloadsSeen?: number;
        };
        const detail =
          beat && beat.heartbeat
            ? beat.signedOut
              ? "Signed out of Just Eat Partner Centre — orders are NOT arriving"
              : `Just Eat watcher connected · ${beat.payloadsSeen ?? 0} payloads seen`
            : "Just Eat watcher connected";
        await recordIntegrationHeartbeat("just_eat_hub", detail);

        const orders = extractJustEatOrders(payload);
        if (!orders.length) {
          return Response.json({ ok: true, created: 0, duplicates: 0, recognised: 0 });
        }

        let created = 0;
        let duplicates = 0;
        let cancelled = 0;
        let awaitingAcceptance = 0;
        const references: string[] = [];
        for (const order of orders) {
          try {
            const action = justEatOrderAction(order.status);
            if (action === "cancel") {
              await cancelPartnerOrder("just_eat", order.reference);
              cancelled += 1;
              continue;
            }
            if (action === "wait") {
              awaitingAcceptance += 1;
              continue;
            }
            const result = await ingestPartnerOrder("just_eat", {
              reference: order.reference,
              customerName: order.customerName,
              type: order.type,
              totalCents: order.totalCents,
              notes: order.notes,
              items: order.items,
            });
            if (result.duplicate) duplicates += 1;
            else {
              created += 1;
              references.push(result.reference);
            }
          } catch (err) {
            // Never log the payload: it carries customer names and addresses.
            console.error("Just Eat hub ingest failed", (err as Error).message);
          }
        }

        return Response.json({
          ok: true,
          created,
          duplicates,
          cancelled,
          awaiting_acceptance: awaitingAcceptance,
          recognised: orders.length,
          references,
        });
      },
    },
  },
});
