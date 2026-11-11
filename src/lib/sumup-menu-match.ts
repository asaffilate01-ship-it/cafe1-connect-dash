import { guessCategory, normaliseItemName, preferCategory, usefulLabel } from "@/lib/cooking";

/**
 * Matches a SumUp till line to a Cafe1 menu item.
 *
 * The SumUp till only sends the button name and price — never its category —
 * and the same filling is sold as a sandwich, toastie and panini at different
 * prices ("Sausage & Cheese" is £4.00 / £4.50 / £6.00). Name alone can't pick
 * the right one, so the price breaks the tie. Till buttons also drop the dish
 * word ("Chicken & cheese" for the £4.99 omelette), so a menu name that is the
 * till name plus one extra word is accepted when the price agrees exactly.
 */
export type MenuCandidate = {
  id: string;
  name: string;
  category: string | null;
  priceCents: number | null;
};

export type MenuIndex = {
  byName: Map<string, MenuCandidate[]>;
  all: Array<MenuCandidate & { key: string }>;
};

export function buildMenuIndex(rows: MenuCandidate[]): MenuIndex {
  const byName = new Map<string, MenuCandidate[]>();
  const all: MenuIndex["all"] = [];
  for (const row of rows) {
    const key = normaliseItemName(row.name);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), row]);
    all.push({ ...row, key });
  }
  return { byName, all };
}

export type SumupLineMatch = {
  item: MenuCandidate | null;
  category: string | null;
  /** Name to show the kitchen: our menu name when matched, else the tidied till name. */
  name: string;
};

/** Collapses the till's stray double/trailing spaces ("Small  Snickers "). */
export function tidyTillName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s+/g, " ").trim();
}

/** A dish word the till sometimes adds to a button name, and the menu category it means. */
const DISH_WORDS: Record<string, string> = {
  omelette: "Omelettes",
  omlette: "Omelettes",
  panini: "Panini",
  toastie: "Toasties",
  toasted: "Toasties",
  baguette: "Baguettes",
  sandwich: "Sandwiches",
};

function sameCategory(a: string | null, b: string | null): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/** One winner, or several rows that all sit in the same category. */
function single(cands: MenuCandidate[]): MenuCandidate | undefined {
  if (cands.length === 1) return cands[0];
  if (cands.length > 1 && cands.every((c) => sameCategory(c.category, cands[0]!.category))) {
    return cands[0];
  }
  return undefined;
}

export function matchSumupLine(
  index: MenuIndex,
  line: { name: string | null | undefined; priceCents?: number | null; category?: string | null },
): SumupLineMatch {
  const tillName = tidyTillName(line.name);
  const key = normaliseItemName(tillName);
  const tillCategory = usefulLabel(line.category ?? null);
  const price =
    typeof line.priceCents === "number" && Number.isFinite(line.priceCents) && line.priceCents > 0
      ? Math.round(line.priceCents)
      : null;
  const found = (item: MenuCandidate): SumupLineMatch => ({
    item,
    category: item.category,
    name: item.name.trim(),
  });
  if (!key) return { item: null, category: tillCategory, name: tillName || "Item" };

  const exact = index.byName.get(key) ?? [];

  // 1. Exact name, and the till's own category agrees.
  if (tillCategory) {
    const hit = single(exact.filter((c) => sameCategory(c.category, tillCategory)));
    if (hit) return found(hit);
  }
  // 2. Exact name, unique (or every copy in one category).
  const only = single(exact);
  if (only) return found(only);
  // 3. Exact name, the price picks the category.
  if (price !== null && exact.length) {
    const priced = exact.filter((c) => c.priceCents === price);
    const hit = single(priced);
    if (hit) return found(hit);
    if (priced.length > 1) {
      const winner = preferCategory(priced.map((c) => c.category), tillName);
      const pick = priced.find((c) => sameCategory(c.category, winner));
      if (pick) return found(pick);
    }
  }
  // 4. Till dropped the dish word: menu name = till name + one more word, same price.
  if (price !== null) {
    const extended = index.all.filter((c) => {
      if (c.priceCents !== price || c.key === key) return false;
      if (!(c.key.startsWith(`${key} `) || c.key.endsWith(` ${key}`))) return false;
      return c.key.split(" ").length - key.split(" ").length === 1;
    });
    const hit = single(extended);
    if (hit) return found(hit);
  }
  // 4b. Till added the dish word ("Chicken & Cheese panini"): drop it and keep
  //     only the menu copy in that category.
  const words = key.split(" ");
  if (words.length > 1) {
    for (const [word, rest] of [
      [words[words.length - 1]!, words.slice(0, -1).join(" ")],
      [words[0]!, words.slice(1).join(" ")],
    ] as const) {
      const category = DISH_WORDS[word];
      if (!category) continue;
      const hit = single(
        (index.byName.get(rest) ?? []).filter((c) => sameCategory(c.category, category)),
      );
      if (hit) return found(hit);
    }
  }
  // 5. Same name in several categories and the price didn't settle it: use the
  //    house preference so a filling list never lands under "Extras".
  if (exact.length) {
    const winner = preferCategory(exact.map((c) => c.category), tillName);
    return { item: null, category: tillCategory ?? winner, name: tillName };
  }
  return {
    item: null,
    category: tillCategory ?? guessCategory(tillName),
    name: tillName,
  };
}
