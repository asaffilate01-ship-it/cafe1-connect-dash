/**
 * Normalise checkout instructions when a POS sale feed actually includes them.
 * SumUp's public payment/receipt endpoints do not guarantee order or item
 * notes; this parser must not invent instructions when the provider omits them.
 */
export type PosSaleNoteScan = {
  orderNotes: string[];
  lineNotesByName: Map<string, string[]>;
  indexedLineNotes: Array<{ name: string; notes: string[] }>;
};

type RecordValue = Record<string, unknown>;

const ORDER_NOTE_KEYS = [
  "order_note", "orderNote", "kitchen_note", "kitchenNote", "note", "notes",
  "comment", "comments", "remark", "remarks", "instructions",
  "special_instructions", "specialInstructions", "description",
];
const LINE_NOTE_KEYS = [
  "item_note", "itemNote", "kitchen_note", "kitchenNote", "note", "notes",
  "comment", "comments", "remark", "remarks", "instructions",
  "special_instructions", "specialInstructions", "description",
];
const LINE_ARRAY_KEYS = ["line_items", "lineItems", "order_items", "orderItems", "products", "items", "lines", "basket"];
const SALE_WRAPPER_KEYS = ["order", "sale", "data", "details", "result", "transaction_data", "transaction", "sales", "orders"];

function recordOf(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function stringOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueNotes(notes: string[]): string[] {
  const seen = new Set<string>();
  return notes.filter((note) => {
    const key = note.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Notes can be plain strings, arrays, or structured text/value objects. */
function noteValues(value: unknown, depth = 0): string[] {
  if (depth > 3) return [];
  const text = stringOf(value);
  if (text) return [text];
  if (Array.isArray(value)) return value.flatMap((entry) => noteValues(entry, depth + 1));
  const obj = recordOf(value);
  if (!obj) return [];
  return ["text", "value", "content", "message", "note"]
    .flatMap((key) => noteValues(obj[key], depth + 1));
}

function fieldNotes(record: RecordValue, keys: string[]): string[] {
  return uniqueNotes(keys.flatMap((key) => noteValues(record[key])));
}

function itemName(record: RecordValue): string | null {
  for (const key of ["product_name", "productName", "item_name", "itemName", "name", "title"]) {
    const name = stringOf(record[key]);
    if (name) return name;
  }
  for (const key of ["product", "item"]) {
    const obj = recordOf(record[key]);
    const name = obj && (stringOf(obj.name) ?? stringOf(obj.title));
    if (name) return name;
  }
  return null;
}

function lineNotes(record: RecordValue): string[] {
  const modifiers = record.modifiers;
  const modifierNotes = Array.isArray(modifiers)
    ? modifiers.flatMap((modifier) => {
        const text = stringOf(modifier);
        if (text) return [text];
        const obj = recordOf(modifier);
        if (!obj) return [];
        return uniqueNotes([
          ...noteValues(obj.name),
          ...fieldNotes(obj, LINE_NOTE_KEYS),
        ]);
      })
    : [];
  return uniqueNotes([...fieldNotes(record, LINE_NOTE_KEYS), ...modifierNotes]);
}

function looksLikeSale(record: RecordValue): boolean {
  return ["sale_id", "order_id", "payments", "transactions", "line_items", "order_items", "products", "basket"]
    .some((key) => record[key] !== undefined);
}

/**
 * Order notes are only taken from order/sale envelopes. Line notes are only
 * taken from basket lines, never from unrelated named customer/merchant nodes.
 * An unnamed line note is promoted to the order strip rather than discarded.
 */
export function readSumupPosSaleNotes(payload: unknown): PosSaleNoteScan {
  const out: PosSaleNoteScan = {
    orderNotes: [],
    lineNotesByName: new Map(),
    indexedLineNotes: [],
  };

  function scanSale(value: unknown, depth: number): void {
    if (depth > 5) return;
    if (Array.isArray(value)) {
      for (const entry of value) scanSale(entry, depth + 1);
      return;
    }
    const record = recordOf(value);
    if (!record) return;
    out.orderNotes.push(...fieldNotes(record, ORDER_NOTE_KEYS));

    for (const key of LINE_ARRAY_KEYS) {
      const candidate = record[key];
      const lines = Array.isArray(candidate) ? candidate : recordOf(candidate)?.items;
      if (!Array.isArray(lines)) continue;
      if (key === "items" && lines.some((entry) => {
        const obj = recordOf(entry);
        return obj ? looksLikeSale(obj) : false;
      })) {
        scanSale(lines, depth + 1);
        continue;
      }
      for (const rawLine of lines) {
        const line = recordOf(rawLine);
        if (!line) continue;
        const notes = lineNotes(line);
        const name = itemName(line);
        if (!name) {
          out.orderNotes.push(...notes);
          continue;
        }
        out.indexedLineNotes.push({ name, notes });
        if (!notes.length) continue;
        const key = name.toLowerCase();
        const prior = out.lineNotesByName.get(key) ?? [];
        out.lineNotesByName.set(key, uniqueNotes([...prior, ...notes]));
      }
    }
    for (const key of SALE_WRAPPER_KEYS) {
      if (record[key] !== undefined) scanSale(record[key], depth + 1);
    }
  }

  scanSale(payload, 0);
  out.orderNotes = uniqueNotes(out.orderNotes);
  return out;
}
