import { describe, expect, it } from "vitest";
import { buildMenuIndex, matchSumupLine } from "@/lib/sumup-menu-match";

// Real Cafe1 menu rows that share names across categories.
const index = buildMenuIndex([
  { id: "toastie-sc", name: "Sausage & Cheese", category: "Toasties", priceCents: 450 },
  { id: "panini-sc", name: "Sausage & Cheese", category: "Panini", priceCents: 600 },
  { id: "sandwich-sc", name: "Sausage & Cheese", category: "Sandwiches", priceCents: 400 },
  { id: "toastie-cc", name: "Chicken & Cheese", category: "Toasties", priceCents: 450 },
  { id: "panini-cc", name: "Chicken & Cheese", category: "Panini", priceCents: 600 },
  { id: "omelette-cc", name: "Chicken & Cheese Omelette", category: "Omelettes", priceCents: 499 },
  { id: "toastie-co", name: "Cheese & Onion", category: "Toasties", priceCents: 400 },
  { id: "omelette-co", name: "Cheese and onion", category: "Omelettes", priceCents: 449 },
  { id: "shake-choc", name: "Chocolate", category: "Milkshakes", priceCents: 400 },
  { id: "pie", name: "Shepherds Pie", category: "Cafe 1 Classics", priceCents: 600 },
]);

describe("matchSumupLine", () => {
  it("puts a £4.50 Sausage & Cheese under Toasties, not Extras", () => {
    const m = matchSumupLine(index, { name: "Sausage & cheese ", priceCents: 450 });
    expect(m.item?.id).toBe("toastie-sc");
    expect(m.category).toBe("Toasties");
  });

  it("puts a £6.00 Chicken & Cheese under Panini", () => {
    expect(matchSumupLine(index, { name: "Chicken & cheese", priceCents: 600 }).item?.id).toBe(
      "panini-cc",
    );
  });

  it("treats '&' and 'and' as the same when the price picks the dish", () => {
    expect(matchSumupLine(index, { name: "Cheese & onion", priceCents: 449 }).item?.id).toBe(
      "omelette-co",
    );
    expect(matchSumupLine(index, { name: "Cheese and Onion", priceCents: 400 }).item?.id).toBe(
      "toastie-co",
    );
  });

  it("finds the £4.99 omelette when the till drops the word 'Omelette'", () => {
    const m = matchSumupLine(index, { name: "Chicken & cheese", priceCents: 499 });
    expect(m.item?.id).toBe("omelette-cc");
    expect(m.name).toBe("Chicken & Cheese Omelette");
  });

  it("matches the panini when the till adds the word 'panini' at a discounted price", () => {
    expect(
      matchSumupLine(index, { name: "Chicken & Cheese panini", priceCents: 540 }).item?.id,
    ).toBe("panini-cc");
    expect(
      matchSumupLine(index, { name: "Cheese and Onion omelette", priceCents: 0 }).item?.id,
    ).toBe("omelette-co");
  });

  it("ignores apostrophes and stray spaces", () => {
    expect(matchSumupLine(index, { name: "Shepherd's  Pie", priceCents: 600 }).item?.id).toBe("pie");
    expect(matchSumupLine(index, { name: "Chocolate ", priceCents: 400 }).category).toBe(
      "Milkshakes",
    );
  });

  it("recognises the 10% court staff price", () => {
    // £4.50 toastie less 10% = £4.05
    expect(matchSumupLine(index, { name: "Sausage & Cheese", priceCents: 405 }).item?.id).toBe(
      "toastie-sc",
    );
  });

  it("never files an ambiguous filling under Extras when the price is unknown", () => {
    const m = matchSumupLine(index, { name: "Sausage & cheese", priceCents: 525 });
    expect(m.item).toBeNull();
    expect(m.category).not.toBe("Extras");
  });
});
