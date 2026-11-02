import { readSumupPosSaleNotes } from "./sumup-pos-notes";

/**
 * SumUp POS "open orders" (unpaid tabs held open on the till) never produce a
 * payment transaction until they are settled, so the transaction-history sweep
 * used for paid sales can never see them. The kitchen still has to cook them,
 * so they are pulled separately and normalised into the same shape the paid
 * importer already understands.
 */

export type SumupOpenOrderLine = {
  name: string;
  quantity: number;
  price: number;
  note: string | null;
  category: string | null;
};

export type SumupOpenOrder = {
  id: string;
  name: string | null;
  totalCents: number;
  note: string | null;
  placedAt: string | null;
  products: SumupOpenOrderLine[];
};

const NOTE_KEYS = [
  "order_note",
  "orderNote",
  "item_note",
  "itemNote",
  "kitchen_note",
  "kitchenNote",
  "specialInstructions",
  "note",
  "notes",
  "comment",
  "comments",
  "remark",
  "remarks",
  "description",
  "instructions",
  "special_instructions",
  "kitchen_note",
];

const NAME_KEYS = [
  "customer_name",
  "customer",
  "tab_name",
  "table_name",
  "reference",
  "order_name",
  "title",
  "name",
];

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;
}

function firstString(record: Rec, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    const nested = asRecord(value);
    if (nested) {
      const inner = firstString(nested, ["name", "title", "value"]);
      if (inner) return inner;
    }
  }
  return null;
}

function joinNotes(parts: Array<string | null | undefined>): string | null {
  const seen = new Set<string>();
  const unique = parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return unique.length ? unique.join(" · ") : null;
}

function noteStrings(value: unknown, depth = 0): string[] {
  if (depth > 3) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((part) => noteStrings(part, depth + 1));
  const obj = asRecord(value);
  if (!obj) return [];
  return ["text", "value", "content", "note"].flatMap((key) =>
    noteStrings(obj[key], depth + 1),
  );
}

function collectNotes(record: Rec): string | null {
  const direct = NOTE_KEYS.flatMap((key) => noteStrings(record[key]));
  const modifiers = Array.isArray(record.modifiers)
    ? (record.modifiers as unknown[]).map((mod) =>
        typeof mod === "string" ? mod : (asRecord(mod)?.name as string | undefined) ?? null,
      )
    : [];
  return joinNotes([...direct, ...modifiers]);
}

function lineCategory(record: Rec): string | null {
  const list = Array.isArray(record.categories) ? (record.categories as unknown[])[0] : null;
  const fromList = typeof list === "string" ? list : (asRecord(list)?.name as string | undefined);
  const label = (
    (record.category as string | undefined) ??
    (record.category_name as string | undefined) ??
    fromList ??
    ""
  )
    .toString()
    .trim();
  return label || null;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normaliseLine(raw: unknown): SumupOpenOrderLine | null {
  const record = asRecord(raw);
  if (!record) return null;
  const name =
    firstString(record, ["name", "product_name", "title", "item_name", "product", "item"]) ?? "";
  const quantity = Math.max(1, Math.round(toNumber(record.quantity ?? record.qty ?? 1)));
  const priceRaw =
    record.price ?? record.unit_price ?? record.amount ?? record.total_price ?? record.total ?? 0;
  const price = toNumber(asRecord(priceRaw)?.amount ?? priceRaw);
  return {
    name: name || "Item",
    quantity,
    price,
    note: collectNotes(record),
    category: lineCategory(record),
  };
}

/** Reads whichever line-item array shape the SumUp POS open order carries. */
function rawLines(record: Rec): unknown[] {
  for (const key of ["products", "items", "line_items", "order_items", "lines", "basket"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    const nested = asRecord(value)?.items;
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

/** Normalises one raw SumUp open order; returns null when it isn't usable. */
export function normaliseSumupOpenOrder(raw: unknown): SumupOpenOrder | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = firstString(record, ["id", "order_id", "sale_id", "uuid", "reference_id"]);
  if (!id) return null;

  const products = rawLines(record)
    .map(normaliseLine)
    .filter((line): line is SumupOpenOrderLine => Boolean(line));

  const totalFromRecord = toNumber(
    asRecord(record.total_amount)?.amount ??
      record.total_amount ??
      record.amount ??
      asRecord(record.total)?.amount ??
      record.total ??
      0,
  );
  const totalFromLines = products.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const total = totalFromRecord > 0 ? totalFromRecord : totalFromLines;

  const lineNotes = products
    .map((line) => (line.note ? `${line.name}: ${line.note}` : null))
    .filter(Boolean) as string[];

  const checkoutNotes = readSumupPosSaleNotes(record);
  return {
    id,
    name: firstString(record, NAME_KEYS),
    totalCents: Math.max(0, Math.round(total * 100)),
    note: joinNotes([collectNotes(record), ...checkoutNotes.orderNotes, ...lineNotes]),
    placedAt:
      firstString(record, ["created_at", "timestamp", "opened_at", "date", "local_time"]) ?? null,
    products,
  };
}

/** Pulls the open-order array out of whatever envelope SumUp responded with. */
export function extractSumupOpenOrders(payload: unknown): SumupOpenOrder[] {
  const list = Array.isArray(payload)
    ? payload
    : ((asRecord(payload)?.items ??
        asRecord(payload)?.orders ??
        asRecord(payload)?.sales ??
        asRecord(payload)?.data) as unknown[] | undefined) ?? [];
  if (!Array.isArray(list)) return [];
  return list
    .map(normaliseSumupOpenOrder)
    .filter((order): order is SumupOpenOrder => Boolean(order));
}

/** Stable identity so an open order only ever creates one kitchen ticket. */
export function sumupOpenOrderSaleKey(id: string) {
  return `open:${id}`;
}

export function isSumupOpenOrderSaleKey(key: string | null | undefined) {
  return Boolean(key?.startsWith("open:"));
}


/** Only a provider-confirmed sale identity may settle an existing open KDS ticket. */
export function confirmedOpenOrderSaleKey(providerSaleId: string | number | null | undefined): string | null {
  const raw = String(providerSaleId ?? "").trim();
  if (!raw || raw.length > 200 || /[\r\n\x00-\x1f]/.test(raw)) return null;
  return sumupOpenOrderSaleKey(raw);
}
