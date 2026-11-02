import { normaliseItemName } from "./cooking";

export type SumupBasketProduct = {
  name?: string | null;
  quantity?: number;
  description?: string;
  price?: number;
  note?: string;
  [key: string]: unknown;
};

/**
 * A SumUp receipt and its payment detail do not necessarily contain the
 * same basket or the same ordering of products. Do not attach receipt item N
 * to detailed item N just because they have the same array index.
 *
 * Exact named matches can safely bring in missing notes/descriptions, while
 * the detailed transaction's own name ALWAYS wins. Conflicting receipt names
 * are reported but never silently converted into another dish.
 */
export function reconcileSumupReceiptBasket<T extends SumupBasketProduct>(
  detailed: T[] | null | undefined,
  receipt: T[] | null | undefined,
): { products: T[]; conflictingNames: string[] } {
  const base = detailed ?? [];
  const secondary = receipt ?? [];
  if (!base.length) return { products: [...secondary], conflictingNames: [] };
  if (!secondary.length) return { products: [...base], conflictingNames: [] };

  const used = new Set<number>();
  const conflicts: string[] = [];
  const result = base.map((line) => {
    const key = normaliseItemName(line.name ?? "");
    if (!key) return line;
    const index = secondary.findIndex(
      (other, i) => !used.has(i) && normaliseItemName(other.name ?? "") === key,
    );
    if (index < 0) return line;
    used.add(index);
    const matching = secondary[index];
    return {
      ...matching,
      ...line,
      name: line.name,
      description: line.description ?? matching.description,
      note: line.note ?? matching.note,
    } as T;
  });
  // If names are entirely different, do not assume that they denote the same
  // item. In particular a meal-upgrade option is never a Mix grill.
  const baseNames = base.map((line) => line.name?.trim()).filter((v): v is string => !!v);
  const receiptNames = secondary.map((line) => line.name?.trim()).filter((v): v is string => !!v);
  if (baseNames.length && receiptNames.length && used.size === 0) {
    conflicts.push(
      "Payment basket: " + baseNames.join(", ") + " / receipt: " + receiptNames.join(", "),
    );
  }
  return { products: result, conflictingNames: conflicts };
}

/** This is a *modifier/upgrade option*, not the identity of a main dish. */
export function isMealUpgradeOnlyName(name: string | null | undefined): boolean {
  const key = normaliseItemName(name ?? "");
  return /^(?:make it a meal|make it meal|meal upgrade|upgrade to a meal|meal deal upgrade)$/.test(key);
}

export type SumupKitchenLine = {
  name: string;
  qty: number;
  notes?: string | null;
  category_label?: string | null;
  menu_item_id?: string | null;
  unit_price_cents?: number;
};

/** Compare complete multisets, never merely "some matching names". */
export function sameSumupKitchenLines(
  existing: readonly SumupKitchenLine[],
  incoming: readonly SumupKitchenLine[],
): boolean {
  if (existing.length !== incoming.length) return false;
  const signature = (line: SumupKitchenLine) =>
    [
      normaliseItemName(line.name),
      Math.max(1, line.qty),
      (line.notes ?? "").trim(),
      (line.category_label ?? "").trim().toLowerCase(),
    ].join("\u001f");
  return existing.map(signature).sort().every((s, i) => s === incoming.map(signature).sort()[i]);
}

/** If a POS summary names only a modifier, a dish name cannot be inferred. */
export function sumupBasketNeedsManualReview(input: {
  summary?: string | null;
  productNames: string[];
  receiptConflicts?: string[];
}): boolean {
  if (input.receiptConflicts?.length) return true;
  const summary = (input.summary ?? "").trim();
  if (!summary) return false;
  const summaryOnlyUpgrade = isMealUpgradeOnlyName(summary);
  if (!input.productNames.length) return summaryOnlyUpgrade;
  const actual = input.productNames.map(normaliseItemName);
  if (summaryOnlyUpgrade && !actual.includes(normaliseItemName(summary))) return true;
  return false;
}

export const SUMUP_KDS_REVIEW_FLAG = "SUMUP ITEM CHECK REQUIRED";

/** Keep warnings terse, labelled and free of payment/card/customer data. */
export function sumupItemReviewNote(
  summary: string | null | undefined,
  originalNote: string | null | undefined,
): string {
  const text = (summary ?? "").trim().slice(0, 90).replace(/\s+/g, " ");
  const warning = SUMUP_KDS_REVIEW_FLAG +
    ": verify the product names against the SumUp till before preparing" +
    (text ? " (sale summary: " + text + ")" : "") + ".";
  return [warning, originalNote?.trim()].filter(Boolean).join("\n").slice(0, 600);
}
