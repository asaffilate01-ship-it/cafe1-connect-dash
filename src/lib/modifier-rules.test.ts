import { describe, expect, it } from "vitest";
import {
  groupModifierOptions,
  toggleModifierSelection,
  validateModifierSelection,
} from "./modifier-rules";

const dips = [
  { id: "k", name: "Ketchup", group_name: "Select dips", group_type: "multi", required: false, min_selections: 0, max_selections: 2 },
  { id: "m", name: "Mayo", group_name: "Select dips", group_type: "multi", required: false, min_selections: 0, max_selections: 2 },
  { id: "g", name: "Garlic mayo", group_name: "Select dips", group_type: "multi", required: false, min_selections: 0, max_selections: 2 },
  { id: "n", name: "No sauce", group_name: "Select dips", group_type: "multi", required: false, min_selections: 0, max_selections: 2, is_exclusive: true },
];

describe("modifier rules", () => {
  it("enforces a maximum of two dips", () => {
    const group = groupModifierOptions(dips)[0];
    const result = toggleModifierSelection(new Set(["k", "m"]), group, dips[2]);
    expect([...result.selected]).toEqual(["k", "m"]);
    expect(result.error).toContain("no more than 2");
  });

  it("makes No sauce exclusive", () => {
    const group = groupModifierOptions(dips)[0];
    expect([...toggleModifierSelection(new Set(["k"]), group, dips[3]).selected]).toEqual(["n"]);
    expect([...toggleModifierSelection(new Set(["n"]), group, dips[0]).selected]).toEqual(["k"]);
  });

  it("reports missing required choices", () => {
    const sides = [{ id: "r", name: "Rice", group_name: "Choose a side", group_type: "single", required: true, min_selections: 1, max_selections: 1 }];
    expect(validateModifierSelection(sides, [])).toEqual(["Choose a side: choose at least 1"]);
    expect(validateModifierSelection(sides, ["r"])).toEqual([]);
  });
});
