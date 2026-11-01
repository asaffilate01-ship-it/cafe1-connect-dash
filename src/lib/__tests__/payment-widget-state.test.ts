import { describe, expect, it } from "vitest";
import { paymentWidgetAction } from "@/lib/payment-widget-state";

describe("SumUp widget events", () => {
  it("never considers a client-side success event proof of payment", () => {
    expect(paymentWidgetAction("success")).toBe("verify");
    expect(paymentWidgetAction("auth-screen")).toBe("verify");
    expect(paymentWidgetAction("sent")).toBe("verify");
    expect(paymentWidgetAction("SUCCESS")).toBe("verify");
  });

  it("returns to retry mode on explicit widget failures", () => {
    expect(paymentWidgetAction("error")).toBe("failed");
    expect(paymentWidgetAction("invalid")).toBe("failed");
  });

  it("does not infer settlement from unknown callbacks", () => {
    expect(paymentWidgetAction("paid")).toBe("ignore");
    expect(paymentWidgetAction("unknown")).toBe("ignore");
  });
});
