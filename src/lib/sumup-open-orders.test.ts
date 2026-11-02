import { describe, expect, it } from "vitest";
import { extractSumupOpenOrders, sumupOpenOrderSaleKey } from "./sumup-open-orders";

describe("sumup open orders", () => {
  it("normalises an open tab with line notes", () => {
    const [order] = extractSumupOpenOrders({
      items: [
        {
          id: "abc",
          customer_name: "Judge Khan",
          note: "TAB: Judge Khan",
          products: [
            { name: "Latte", quantity: 2, price: 3.2, comment: "extra hot" },
            { name: "Toast", quantity: 1, price: 2 },
          ],
        },
      ],
    });
    expect(order.id).toBe("abc");
    expect(order.name).toBe("Judge Khan");
    expect(order.totalCents).toBe(840);
    expect(order.note).toContain("Latte: extra hot");
    expect(order.products[0].note).toBe("extra hot");
  });

  it("keeps checkout order and item notes, including structured note fields", () => {
    const [order] = extractSumupOpenOrders({
      orders: [{
        id: "checkout-note-test",
        name: "Table 7",
        orderNote: { text: "ALLERGY - sesame" },
        products: [
          { name: "Toastie", quantity: 1, itemNote: { text: "No tomato" } },
          { name: "Tea", quantity: 1, specialInstructions: "No milk" },
        ],
      }],
    });
    expect(order.note).toContain("ALLERGY - sesame");
    expect(order.note).toContain("Toastie: No tomato");
    expect(order.products[0].note).toBe("No tomato");
    expect(order.products[1].note).toBe("No milk");
  });

  it("prefers the stated total and skips unusable rows", () => {
    const orders = extractSumupOpenOrders([{ id: "x", total_amount: 12.5 }, { foo: 1 }]);
    expect(orders).toHaveLength(1);
    expect(orders[0].totalCents).toBe(1250);
    expect(sumupOpenOrderSaleKey("x")).toBe("open:x");
  });
});
