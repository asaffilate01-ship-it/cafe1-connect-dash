/**
 * Works out whether a line needs cooking when we can't match it to a menu item.
 * POS-typed names ("Lamb chops w ruce") never match our menu exactly, so the
 * kitchen was seeing hot food as cold. Normalise, then fall back to keywords.
 */
export function normaliseItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Words that almost always mean the line comes off the grill/fryer/hob. */
const COOKED_WORDS = [
  "lamb", "chop", "chops", "chicken", "curry", "rice", "biryani", "kebab",
  "burger", "steak", "grill", "grilled", "fried", "fry", "chips", "fish",
  "nugget", "nuggets", "sausage", "bacon", "egg", "eggs", "omelette", "beans",
  "breakfast", "toast", "toasted", "panini", "jacket", "potato", "wedges",
  "soup", "pasta", "pizza", "wrap", "hot", "roast", "mince", "keema", "karahi",
  "masala", "tikka", "kofta", "hash", "mushroom", "waffle", "pancake",
];

/**
 * Words that override the above — these are cold even if they share a token.
 * Matched on whole words only: substring matching used to turn "steak" cold
 * (it contains "tea"), and "americano"/"pecan" tripped the old "can" entry.
 */
const COLD_WORDS = [
  "coke", "pepsi", "water", "juice", "smoothie", "coffee", "latte", "tea",
  "cappuccino", "americano", "mocha", "cake", "muffin",
  "cookie", "crisps", "chocolate", "bottle", "can", "cans", "salad", "yoghurt",
  "yogurt", "fruit", "biscuit", "brownie", "flapjack", "croissant",
];

/** Multi-word phrases that are cold, checked as a whole phrase. */
const COLD_PHRASES = ["hot chocolate", "iced coffee", "iced latte", "iced tea", "cold drink"];

/** Crude singularise so "pancakes"/"paninis" match the singular keyword. */
const singular = (t: string) =>
  t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;

export function looksCooked(name: string): boolean {
  const n = normaliseItemName(name);
  if (!n) return false;
  if (COLD_PHRASES.some((p) => n.includes(p))) return false;
  const tokens = new Set(n.split(" ").flatMap((t) => [t, singular(t)]));
  if (COLD_WORDS.some((w) => tokens.has(w) || tokens.has(singular(w)))) return false;
  return COOKED_WORDS.some((w) => tokens.has(w) || tokens.has(singular(w)));
}

/**
 * Best-effort lookup of a POS line against our menu names: exact normalised
 * match first, then the menu name whose words overlap the line the most.
 * The overlap has to be strong: "chicken panini" and "chicken samosa" share a
 * word but are different dishes, so a single shared word is never enough.
 */
export function fuzzyMenuKey(name: string, keys: string[]): string | null {
  const n = normaliseItemName(name);
  if (!n) return null;
  const exact = keys.find((k) => normaliseItemName(k) === n);
  if (exact) return exact;
  const tokens = n.split(" ").filter((t) => t.length > 2);
  if (!tokens.length) return null;
  let best: { key: string; score: number } | null = null;
  for (const key of keys) {
    const keyTokens = normaliseItemName(key).split(" ").filter((t) => t.length > 2);
    if (!keyTokens.length) continue;
    const hits = keyTokens.filter((t) => tokens.includes(t)).length;
    // One shared word is only ever enough for single-word menu names ("Chips").
    // Otherwise "chicken panini" would happily match "chicken samosa".
    if (hits < 2 && keyTokens.length > 1) continue;
    const score = hits / Math.max(keyTokens.length, tokens.length);
    if (hits && (!best || score > best.score)) best = { key, score };
  }
  return best && best.score >= 0.6 ? best.key : null;
}

/**
 * Last-resort category for a POS line we couldn't match to the menu.
 * Every category here is a real Cafe1 menu category, so the kitchen board
 * groups POS-typed lines the same way the menu does instead of dumping them
 * into "Other items". Rules are checked in order: phrases first (they are the
 * most specific), then whole-word matches.
 */
const CATEGORY_RULES: Array<{ category: string; phrases?: string[]; words?: string[] }> = [
  // Iced drinks before hot drinks: "Iced Matcha Latte" mentions latte/matcha but
  // is never a hot drink, and the menu keeps them in their own category.
  {
    category: "Iced Drinks",
    phrases: ["iced coffee", "iced latte", "iced matcha", "iced matche", "iced tea", "iced mocha", "cold brew", "ice coffee", "ice latte"],
    words: ["iced", "frappe", "frappuccino"],
  },
  // Drinks first — a "chicken shawarma" never mentions coffee, but a
  // "chicken soup latte" style clash would otherwise land in food.
  { category: "Hot Drinks", phrases: ["hot chocolate", "flat white", "white americano"], words: ["tea", "coffee", "latte", "cappuccino", "capuccino", "cappucino", "americano", "mocha", "mochacciano", "espresso", "macchiato", "chai", "matcha", "hotchocolate"] },
  { category: "Milkshakes", phrases: ["caramel milkshake", "caramel shake"], words: ["milkshake", "shake", "oreo"] },
  // Bare ingredient lists ("Chicken, Mayo, Sweetcorn") come off the till with no
  // bread named. Cafe1 sells those as sandwiches unless the till says otherwise.
  { category: "Sandwiches", phrases: ["mayo sweetcorn", "mayo and sweetcorn", "cheese and tomato", "tuna mayo", "tuna and mayo", "cheese and onion", "cheese and beans", "chicken mayo", "chicken and mayo", "chicken and sweetcorn", "egg mayo", "egg and mayo", "ham and cheese", "cheese and pickle", "coronation chicken"] },
  { category: "Mocktails", phrases: ["redbull mojito"], words: ["mojito", "mocktail"] },
  { category: "Drinks", phrases: ["bottled drink", "energy drink", "soft drink", "red bull"], words: ["coke", "pepsi", "water", "juice", "can", "cans", "bottle", "lemonade", "fanta", "sprite", "smoothie", "redbull", "monster", "tango", "irnbru"] },
  // Food
  { category: "Samosas", words: ["samosa", "samosas"] },
  { category: "Burgers", words: ["burger", "cheeseburger"] },
  { category: "Hot Dogs", phrases: ["hot dog", "hotdog"] },
  { category: "Wraps", words: ["wrap", "shawarma", "shwarma", "kebab"] },
  { category: "Chips", phrases: ["w chips"], words: ["chips", "fries", "wedges"] },
  { category: "Naan Roll", phrases: ["naan roll", "in naan"] },
  { category: "Paratha", words: ["paratha"] },
  { category: "Jackets", phrases: ["jacket potato"], words: ["jacket"] },
  { category: "Panini", words: ["panini", "paninis"] },
  { category: "Toasties", words: ["toastie", "toasties"] },
  { category: "Baguettes", words: ["baguette"] },
  { category: "Rolls", words: ["roll", "rolls"] },
  { category: "Sandwiches", words: ["sandwich", "sandwiches", "sarnie"] },
  { category: "Omelettes", words: ["omelette", "omlette"] },
  { category: "Toast", words: ["toast"] },
  { category: "Croissant", words: ["croissant"] },
  { category: "Salads", words: ["salad"] },
  { category: "Fruit Pot", phrases: ["fruit pot"] },
  { category: "Cold Past Pot", phrases: ["pasta pot"] },
  { category: "Biscuits", words: ["biscuit", "biscuits", "cookie", "cookies", "flapjack"] },
  { category: "Desserts", words: ["cake", "muffin", "pie", "brownie", "doughnut", "donut", "pastry", "dessert"] },
  { category: "Snacks", phrases: ["chocolate bar", "chewing gum"], words: ["crisps", "chocolate", "gum"] },
  { category: "Extras", phrases: ["add milk", "oat milk", "butter only"], words: ["extra", "sauce", "dip", "egg", "eggs", "beans", "sausage", "bacon", "hash", "milk", "butter"] },
  { category: "Cafe 1 Classics", phrases: ["shepherds pie", "cottage pie", "chicken pie"], words: ["curry", "rice", "biryani", "karahi", "masala", "keema", "chana", "tikka", "shepherds", "lasagne", "lasagna", "flan", "quiche"] },
  { category: "Breakfast", words: ["breakfast"] },
];

/**
 * POS terminals stamp lines with catch-all labels ("Hot Food", "Misc",
 * "General"). Those tell the kitchen nothing, so we treat them as absent and
 * let the real menu category or keyword rules take over.
 */
const VAGUE_LABELS = new Set([
  "hot food",
  "cold food",
  "food",
  "misc",
  "miscellaneous",
  "other",
  "other items",
  "others",
  "general",
  "generic",
  "items",
  "item",
  "uncategorised",
  "uncategorized",
  "default",
  "sumup",
  "pos",
  "custom",
  "custom amount",
  "n/a",
  "none",
  "unknown",
]);

export function usefulLabel(label: string | null | undefined): string | null {
  const trimmed = (label ?? "").trim();
  if (!trimmed) return null;
  return VAGUE_LABELS.has(trimmed.toLowerCase()) ? null : trimmed;
}

export function guessCategory(name: string): string | null {
  const n = normaliseItemName(name);
  if (!n) return null;
  for (const rule of CATEGORY_RULES) {
    if (rule.phrases?.some((p) => n.includes(normaliseItemName(p)))) return rule.category;
  }
  const tokens = new Set(n.split(" ").flatMap((t) => [t, singular(t)]));
  for (const rule of CATEGORY_RULES) {
    if (rule.words?.some((w) => tokens.has(w) || tokens.has(singular(w)))) return rule.category;
  }
  return null;
}

/**
 * When one dish name lives in several menu categories, this decides which one
 * the kitchen sees. Cafe1 defaults a plain filling list to a sandwich; toasties,
 * baguettes and paninis are only used when the till names them.
 */
const CATEGORY_PREFERENCE = [
  "Sandwiches",
  "Rolls",
  "Baguettes",
  "Toasties",
  "Panini",
  "Wraps",
  "Jackets",
  "Salads",
  "Cold Past Pot",
];

/**
 * Categories that describe how the dish is *served* rather than what it is.
 * "Chicken Shawarma" exists as a panini, a salad and a grill item, so unless
 * the till actually says "panini"/"wrap"/"salad" the grill version wins.
 */
const SERVE_STYLE_CATEGORIES: Array<{ category: string; words: string[] }> = [
  { category: "Panini", words: ["panini", "paninis"] },
  { category: "Toasties", words: ["toastie", "toasties", "toasted"] },
  { category: "Baguettes", words: ["baguette", "baguettes"] },
  { category: "Rolls", words: ["roll", "rolls"] },
  { category: "Naan Roll", words: ["naan"] },
  { category: "Naan Rolls", words: ["naan"] },
  { category: "Wraps", words: ["wrap", "wraps"] },
  { category: "Jackets", words: ["jacket"] },
  { category: "Salads", words: ["salad", "salads"] },
  { category: "Sandwiches", words: ["sandwich", "sandwiches", "sarnie"] },
  { category: "Burgers", words: ["burger", "burgers"] },
  { category: "Chips", words: ["chips", "fries", "loaded"] },
  { category: "Cold Past Pot", words: ["pasta pot"] },
  { category: "Omelettes", words: ["omelette", "omlette"] },
  { category: "Paratha", words: ["paratha"] },
  { category: "Desi Parathas", words: ["paratha"] },
];

export function preferCategory(
  categories: Array<string | null>,
  name?: string,
): string | null {
  const present = categories.filter((c): c is string => !!c);
  if (!present.length) return null;
  const trimmedName = (name ?? "").trim();
  if (trimmedName) {
    const tokens = new Set(
      normaliseItemName(trimmedName)
        .split(" ")
        .flatMap((t) => [t, singular(t)]),
    );
    const normalised = normaliseItemName(trimmedName);
    const styleOf = (category: string) =>
      SERVE_STYLE_CATEGORIES.find(
        (s) => s.category.toLowerCase() === category.trim().toLowerCase(),
      );
    // The till named the serving style — honour it.
    const named = present.find((c) => {
      const style = styleOf(c);
      return (
        !!style &&
        style.words.some(
          (w) => tokens.has(w) || tokens.has(singular(w)) || normalised.includes(w),
        )
      );
    });
    if (named) return named;
    // Otherwise drop the serving-style categories and keep the plain dish.
    const plain = present.filter((c) => !styleOf(c));
    if (plain.length) return plain[0]!;
  }
  for (const wanted of CATEGORY_PREFERENCE) {
    const hit = present.find((c) => c.trim().toLowerCase() === wanted.toLowerCase());
    if (hit) return hit;
  }
  return present[0];
}

/** How a menu line is made: nothing to do, cold prep, or a hot cook. */
export type PrepType = "none" | "prep" | "hot";

export const PREP_LABEL: Record<PrepType, string> = {
  none: "No prep",
  prep: "Prep",
  hot: "Hot cook",
};

/** Normalises whatever the menu row holds into one of the three prep types. */
export function toPrepType(value: unknown, needsCooking?: boolean | null): PrepType {
  if (value === "none" || value === "prep" || value === "hot") return value;
  return needsCooking ? "hot" : "none";
}
