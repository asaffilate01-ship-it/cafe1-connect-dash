import { describe, expect, it } from "vitest";
import { sumupCheckoutMatchesOrder } from "@/lib/sumup-verification";

const order = {
  sumup_checkout_id: "checkout-1",
  sumup_reference: "cafe1-order-123",
  total_cents: 2499,
};
const provider = {
  id: "checkout-1",
  checkout_reference: "cafe1-order-123",
  amount: 24.99,
  currency: "GBP",
};

describe("SumUp settlement identity", () => {
  it("accepts only the exact provider checkout, reference, total and currency", () => {
    expect(sumupCheckoutMatchesOrder(order, provider)).toBe(true);
    expect(sumupCheckoutMatchesOrder(order, { ...provider, id: "checkout-2" })).toBe(false);
    expect(sumupCheckoutMatchesOrder(order, { ...provider, checkout_reference: "other" })).toBe(false);
    expect(sumupCheckoutMatchesOrder(order, { ...provider, amount: 2.49 })).toBe(false);
    expect(sumupCheckoutMatchesOrder(order, { ...provider, currency: "EUR" })).toBe(false);
  });
  it("rejects missing provider references and malformed amounts", () => {
    expect(sumupCheckoutMatchesOrder({ ...order, sumup_checkout_id: null }, provider)).toBe(false);
    expect(sumupCheckoutMatchesOrder({ ...order, sumup_reference: null }, provider)).toBe(false);
    expect(sumupCheckoutMatchesOrder(order, { ...provider, amount: Number.NaN })).toBe(false);
    expect(sumupCheckoutMatchesOrder(order, { ...provider, amount: Number.POSITIVE_INFINITY })).toBe(
      false,
    );
  });
});
