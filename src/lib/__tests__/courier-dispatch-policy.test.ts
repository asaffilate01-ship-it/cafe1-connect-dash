import { describe, expect, it } from "vitest";
import { courierDispatchGate, nextOrderStatusFromUber } from "@/lib/courier-dispatch-policy";

const order = {
  type: "delivery",
  source: "website",
  status: "preparing",
  payment_status: "paid",
  courier_provider: null,
  courier_external_id: null,
  courier_status: null,
};

describe("Uber Direct booking gate", () => {
  it("accepts only a paid direct delivery not already claimed", () => {
    expect(courierDispatchGate(order)).toEqual({ action: "eligible" });
    expect(courierDispatchGate({ ...order, payment_status: "pending" }).action).toBe("blocked");
    expect(courierDispatchGate({ ...order, type: "collection" }).action).toBe("blocked");
    expect(courierDispatchGate({ ...order, status: "cancelled" }).action).toBe("blocked");
    expect(courierDispatchGate({ ...order, status: "completed" }).action).toBe("blocked");
    expect(courierDispatchGate({ ...order, status: "out_for_delivery" }).action).toBe("blocked");
  });

  it("never books a second courier after a dispatch claim or provider response", () => {
    expect(courierDispatchGate({ ...order, courier_provider: "uber_direct", courier_status: "booking" }))
      .toEqual({
        action: "blocked",
        reason: "Courier booking already started or requires manager reconciliation",
        retryable: false,
      });
    expect(courierDispatchGate({ ...order, courier_provider: "uber_direct", courier_status: "booking_review" }).action)
      .toBe("blocked");
    expect(courierDispatchGate({ ...order, courier_external_id: "d_123" })).toEqual({
      action: "booked",
      deliveryId: "d_123",
    });
  });

  it("does not dispatch aggregators' own courier orders", () => {
    for (const source of ["deliveroo", "just_eat", "uber_eats"]) {
      expect(courierDispatchGate({ ...order, source }).action).toBe("blocked");
    }
  });
});

describe("Uber Direct webhook progress", () => {
  it("advances without downgrading delivered or terminal orders", () => {
    expect(nextOrderStatusFromUber("preparing", "pickup_complete")).toBe("out_for_delivery");
    expect(nextOrderStatusFromUber("ready", "dropoff")).toBe("out_for_delivery");
    expect(nextOrderStatusFromUber("out_for_delivery", "delivered")).toBe("delivered");
    expect(nextOrderStatusFromUber("delivered", "pickup_complete")).toBeNull();
    expect(nextOrderStatusFromUber("cancelled", "delivered")).toBeNull();
    expect(nextOrderStatusFromUber("refunded", "delivered")).toBeNull();
    expect(nextOrderStatusFromUber("completed", "pickup_complete")).toBeNull();
    expect(nextOrderStatusFromUber("pending_payment", "delivered")).toBeNull();
    expect(nextOrderStatusFromUber("ready", "pending")).toBeNull();
  });
});
