/**
 * Uber Direct state machine. The "booking" state is a durable, single-writer
 * reservation; ambiguous provider failures require reconciliation, NOT retry.
 */
export type CourierOrderSnapshot = {
  type: string;
  source: string;
  status: string;
  payment_status: string;
  courier_provider: string | null;
  courier_external_id: string | null;
  courier_status: string | null;
};

export type CourierGate =
  | { action: "booked"; deliveryId: string }
  | { action: "eligible" }
  | { action: "blocked"; reason: string; retryable: boolean };

export const ELIGIBLE_COURIER_ORDER_STATES = [
  "paid",
  "preparing",
  "ready",
] as const;

/** The caller still checks distance, settings and the exact order server-side. */
export function courierDispatchGate(order: CourierOrderSnapshot): CourierGate {
  if (order.courier_external_id) {
    return { action: "booked", deliveryId: order.courier_external_id };
  }
  if (order.type !== "delivery") {
    return { action: "blocked", reason: "Not a delivery order", retryable: false };
  }
  if (["deliveroo", "just_eat", "uber_eats"].includes(order.source)) {
    return {
      action: "blocked",
      reason: "Marketplace delivery is managed by its own provider",
      retryable: false,
    };
  }
  if (!["paid", "on_account"].includes(order.payment_status)) {
    return { action: "blocked", reason: "Order is not paid", retryable: true };
  }
  if (!ELIGIBLE_COURIER_ORDER_STATES.some((state) => state === order.status)) {
    return {
      action: "blocked",
      reason: "Order is not available for courier dispatch",
      retryable: false,
    };
  }
  if (order.courier_provider || order.courier_status) {
    return {
      action: "blocked",
      reason: "Courier booking already started or requires manager reconciliation",
      retryable: false,
    };
  }
  return { action: "eligible" };
}

/** Late provider events may only advance an order, never reopen a terminal one. */
export type CourierOrderProgress =
  | "pending_payment"
  | "paid"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "completed"
  | "cancelled"
  | "refunded";

export function nextOrderStatusFromUber(
  current: CourierOrderProgress,
  courierStatus: string | null | undefined,
): "out_for_delivery" | "delivered" | null {
  if (["cancelled", "refunded", "completed", "delivered"].includes(current)) return null;
  const stage = (courierStatus ?? "").toLowerCase();
  if (["pickup_complete", "dropoff"].includes(stage)) {
    return current === "preparing" || current === "ready" ? "out_for_delivery" : null;
  }
  if (stage === "delivered") {
    return current === "preparing" || current === "ready" || current === "out_for_delivery"
      ? "delivered"
      : null;
  }
  return null;
}

/**
 * Ignore delayed/replayed provider statuses that would make a delivered
 * courier appear to be looking for pickup again.
 */
export function shouldAdvanceCourierStage(
  current: string | null | undefined,
  incoming: string | null | undefined,
): boolean {
  if (!incoming) return false;
  const stages: Record<string, number> = {
    booking: -1,
    booking_review: -1,
    pending: 0,
    pickup: 1,
    courier_imminent: 2,
    pickup_complete: 3,
    dropoff: 4,
    delivered: 5,
    canceled: 5,
    cancelled: 5,
    returned: 5,
  };
  const from = current?.toLowerCase() ?? "";
  const to = incoming.toLowerCase();
  if (["delivered", "canceled", "cancelled", "returned"].includes(from)) {
    return from === to;
  }
  const incomingRank = stages[to];
  if (incomingRank === undefined) return false;
  const currentRank = stages[from];
  return currentRank === undefined || incomingRank >= currentRank;
}
