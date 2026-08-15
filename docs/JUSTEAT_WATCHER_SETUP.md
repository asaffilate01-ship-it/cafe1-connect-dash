# Just Eat → Cafe 1 KDS watcher

Mirrors the Deliveroo Restaurant Hub watcher. The Just Eat Orderpad tablet keeps
working exactly as it does today; the watcher only copies accepted orders onto
the kitchen display.

## How it works

1. A small Windows service on the cafe PC keeps a dedicated Microsoft Edge
   session signed into the **Just Eat Partner Centre** (`partner.just-eat.co.uk`).
   Cafe 1 never reads or stores the Just Eat username or password.
2. Partner Centre's own order payloads are forwarded verbatim to
   `POST /api/public/justeat/hub-ingest`, authenticated with the
   `x-bridge-secret` header (`JUSTEAT_BRIDGE_SECRET`).
3. The server parses them (`src/lib/justeat-hub.ts`), dedupes on
   `partner_order_id = just_eat:<reference>` and writes a KDS ticket.
4. A heartbeat every minute updates `integration_status.just_eat_hub`, which
   drives the "Just Eat auto / offline" badge on the KDS.

## Install on the cafe PC

1. Download `/downloads/cafe1-justeat-watcher-windows.zip` (linked from
   `/watcher-download`) and extract it.
2. Double-click `START-CAFE1-JUSTEAT.cmd`.
3. Setup generates a 64-character bridge key, protects it with Windows DPAPI and
   copies `JUSTEAT_INGEST_MODE=hub_watcher` and `JUSTEAT_BRIDGE_SECRET=…` to
   the clipboard. Save both as production settings and redeploy once.
4. Sign into Partner Centre in the Edge window that opens. Setup then registers
   an auto-restarting scheduled task and two desktop shortcuts:
   **Cafe 1 Just Eat Status** and **Repair Just Eat Login**.

## Checking it

- KDS header badge: `Just Eat auto` (green/orange) means heartbeats are current.
- `CHECK-JUSTEAT-STATUS.cmd` on the cafe PC prints CONNECTED / NOT CONNECTED and
  the last log lines.
- Logs: `%LOCALAPPDATA%\Cafe1\JustEatWatcher\logs\justeat-hub-watcher.log`.
- Bumping a Cafe 1 KDS ticket does not update Just Eat. Continue to use the
  Orderpad for ready-for-collection/customer/rider notifications.

Do not treat a green badge alone as go-live evidence. Complete the real order,
deduplication, cancellation, sign-out and restart checks in
`docs/GO_LIVE_CHECKLIST.md`, then record the result under
`just_eat_kds_integration`.

## Alternative

If Just Eat (or middleware such as HubRise/Checkmate) can push orders, the
webhook route `POST /api/public/justeat/webhook` accepts a structured payload
with the same shared secret. Both paths dedupe against each other.
