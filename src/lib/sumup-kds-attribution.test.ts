import { describe, expect, it } from "vitest";
import {
  isMealUpgradeOnlyName,
  reconcileSumupReceiptBasket,
  sameSumupKitchenLines,
  sumupBasketNeedsManualReview,
  sumupItemReviewNote,
} from "./sumup-kds-attribution";

describe("SumUp POS → KDS line attribution / jury order 6509 regression", () => {
  it("never substitutes Mix grill for Make it a meal by receipt array position", () => {
    const result = reconcileSumupReceiptBasket(
      [{ name: "Make it a meal", quantity: 1, price: 2.5 }],
      [{ name: "Mix grill", quantity: 1, price: 9.99 }],
    );
    expect(result.products).toEqual([
      { name: "Make it a meal", quantity: 1, price: 2.5 },
    ]);
    expect(result.conflictingNames).toHaveLength(1);
    expect(sumupBasketNeedsManualReview({
      summary: "Make it a meal",
      productNames: result.products.map((v) => v.name),
      receiptConflicts: result.conflictingNames,
    })).toBe(true);
  });

  it("does not attach the wrong item notes to different receipt lines", () => {
    const result = reconcileSumupReceiptBasket(
      [
        { name: "Bacon Bap", quantity: 1 },
        { name: "Make it a meal", quantity: 1 },
      ],
      [
        { name: "Mix grill", note: "NO ALLERGENS" },
        { name: "Bacon Bap", note: "No sauce", description: "with bacon" },
      ],
    );
    expect(result.products[0]).toMatchObject({ name: "Bacon Bap", note: "No sauce" });
    expect(result.products[1]).toEqual({ name: "Make it a meal", quantity: 1 });
    expect(result.conflictingNames).toEqual([]);
  });

  it("preserves duplicate named lines by matching each receipt line only once", () => {
    const result = reconcileSumupReceiptBasket(
      [{ name: "Burger" }, { name: "Burger" }],
      [{ name: "Burger", note: "No onion" }, { name: "Burger", note: "Extra pickle" }],
    );
    expect(result.products.map((p) => p.note)).toEqual(["No onion", "Extra pickle"]);
  });

  it("distinguishes an upgrade choice from an independently named dish", () => {
    expect(isMealUpgradeOnlyName("Make It A Meal")).toBe(true);
    expect(isMealUpgradeOnlyName("Meal upgrade")).toBe(true);
    expect(isMealUpgradeOnlyName("Mix grill")).toBe(false);
    expect(isMealUpgradeOnlyName("Chicken burger meal")).toBe(false);
    expect(sumupBasketNeedsManualReview({
      summary: "Make it a meal",
      productNames: ["Mix grill"],
    })).toBe(true);
    expect(sumupBasketNeedsManualReview({
      summary: "Make it a meal",
      productNames: ["Make it a meal"],
    })).toBe(false);
  });

  it("detects a real basket correction even when previous line has a menu item id", () => {
    expect(sameSumupKitchenLines(
      [{ name: "Mix grill", qty: 1, menu_item_id: "matched-mixed-grill", category_label: "Grill & Kebabs" }],
      [{ name: "Chicken burger", qty: 1, menu_item_id: "burger", category_label: "Burgers" }],
    )).toBe(false);
  });

  it("compares duplicate lines and item notes without losing their identity", () => {
    const lines = [
      { name: "Latte", qty: 1, notes: "Oat milk" },
      { name: "Latte", qty: 1, notes: "Cow's milk" },
    ];
    expect(sameSumupKitchenLines(lines, lines.slice().reverse())).toBe(true);
    expect(sameSumupKitchenLines(lines, [
      { name: "Latte", qty: 1, notes: "Oat milk" },
      { name: "Latte", qty: 1, notes: "Oat milk" },
    ])).toBe(false);
  });

  it("raises a kitchen review flag rather than claiming the wrong meal is verified", () => {
    const note = sumupItemReviewNote("Make it a meal", "ALLERGY: check with chef");
    expect(note).toContain("SUMUP ITEM CHECK REQUIRED");
    expect(note).toContain("Make it a meal");
    expect(note).toContain("ALLERGY: check with chef");
    expect(note).not.toContain("Mix grill");
  });
});
