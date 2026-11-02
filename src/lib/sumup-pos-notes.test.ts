import { describe, expect, it } from "vitest";
import { readSumupPosSaleNotes } from "./sumup-pos-notes";

describe("SumUp POS sale instructions", () => {
  it("keeps an order note on a named sale and item notes on the correct lines", () => {
    const notes = readSumupPosSaleNotes({
      sale: {
        id: "sale-123",
        name: "Table 7",
        order_note: "ALLERGY: sesame",
        line_items: [
          { name: "Panini", item_note: "No tomato", modifiers: ["Cut in half"] },
          { name: "Latte", note: { text: "Extra hot" } },
        ],
      },
      merchant: { name: "Café 1", note: "merchant settings, not an order note" },
    });
    expect(notes.orderNotes).toEqual(["ALLERGY: sesame"]);
    expect(notes.lineNotesByName.get("panini")).toEqual(["No tomato", "Cut in half"]);
    expect(notes.lineNotesByName.get("latte")).toEqual(["Extra hot"]);
    expect(notes.indexedLineNotes[0]).toEqual({
      name: "Panini", notes: ["No tomato", "Cut in half"],
    });
  });

  it("recognises alternate note field casing, structured notes, and nested payloads", () => {
    const notes = readSumupPosSaleNotes({
      data: {
        orderNote: [{ text: "Bring to jury room" }, { text: "Bring to jury room" }],
        products: [{ product: { name: "Wrap" }, specialInstructions: "No onion" }],
      },
    });
    expect(notes.orderNotes).toEqual(["Bring to jury room"]);
    expect(notes.lineNotesByName.get("wrap")).toEqual(["No onion"]);
  });

  it("does not turn a sale customer name into a line note or copy unrelated metadata", () => {
    const notes = readSumupPosSaleNotes({
      orders: [{ id: "abc", name: "Judge Smith", note: "Ready 12:30" }],
      customer: { name: "Judge Smith", note: "internal customer memo" },
    });
    expect(notes.orderNotes).toEqual(["Ready 12:30"]);
    expect(notes.lineNotesByName.size).toBe(0);
  });

  it("preserves unnamed item instructions as an order note instead of losing them", () => {
    const notes = readSumupPosSaleNotes({
      sale: { items: [{ itemNote: "Check allergen with chef" }] },
    });
    expect(notes.orderNotes).toEqual(["Check allergen with chef"]);
  });

  it("never fabricates checkout notes when the payment payload has none", () => {
    const notes = readSumupPosSaleNotes({
      transaction_code: "AB12", products: [{ name: "Coffee", price: 2.5 }],
    });
    expect(notes.orderNotes).toEqual([]);
    expect(notes.lineNotesByName.size).toBe(0);
  });
});
