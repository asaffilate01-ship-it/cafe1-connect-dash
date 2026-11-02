import { jurorIdsFromRows, parseCsv } from "./juror-claims";

const MAX_FILE_BYTES = 3_000_000;
const MAX_XML_BYTES = 4_000_000;

/** Files never leave the device; there is no public juror-list upload endpoint. */
export async function jurorIdsFromFile(file: File): Promise<string[]> {
  if (file.size > MAX_FILE_BYTES) throw new Error("The juror list is too large (3 MB maximum).");
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv" || extension === "txt" || extension === "tsv") {
    const raw = await file.text();
    const rows = extension === "tsv"
      ? raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((row) => row.split("\t"))
      : parseCsv(raw);
    return jurorIdsFromRows(rows);
  }
  if (extension !== "xlsx") {
    throw new Error("Please use an Excel .xlsx file, or export the worksheet as CSV.");
  }
  const files = await openXlsxZip(await file.arrayBuffer());
  const worksheetNames = [...files.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/sheet(\d+)/)?.[1] ?? "0") - Number(b.match(/sheet(\d+)/)?.[1] ?? "0"));
  const sheet = worksheetNames[0];
  if (!sheet) throw new Error("No supported worksheet found in the Excel file.");
  const sharedXml = files.has("xl/sharedStrings.xml")
    ? await readZipXml(files.get("xl/sharedStrings.xml")!)
    : "";
  const strings = sharedXml ? readXml(sharedXml).getElementsByTagName("si") : null;
  const shared: string[] = [];
  if (strings) for (const item of Array.from(strings)) {
    shared.push(Array.from(item.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
  }
  const doc = readXml(await readZipXml(files.get(sheet)!));
  const rows: string[][] = [];
  for (const row of Array.from(doc.getElementsByTagName("row"))) {
    const cols: string[] = [];
    for (const cell of Array.from(row.getElementsByTagName("c"))) {
      const ref = cell.getAttribute("r") ?? "";
      const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
      let index = 0;
      for (const char of letters) index = index * 26 + char.charCodeAt(0) - 64;
      index--;
      if (index > 100) continue;
      const type = cell.getAttribute("t") ?? "";
      const value = cell.getElementsByTagName("v")[0]?.textContent ?? "";
      const inline = cell.getElementsByTagName("is")[0]?.textContent ?? "";
      cols[index] = type === "s" ? (shared[Number(value)] ?? "") : type === "inlineStr" ? inline : value;
    }
    rows.push(cols);
    if (rows.length > 10000) throw new Error("Excel list has too many rows.");
  }
  return jurorIdsFromRows(rows);
}

function readXml(content: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(content)) throw new Error("External XML entities are not permitted.");
  const doc = new DOMParser().parseFromString(content, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("The Excel file contains invalid worksheet XML.");
  return doc;
}

type ZipEntry = { bytes: Uint8Array; method: number; expanded: number };
async function readZipXml(entry: ZipEntry): Promise<string> {
  if (entry.expanded > MAX_XML_BYTES) throw new Error("Excel worksheet is too large.");
  if (entry.method === 0) return new TextDecoder().decode(entry.bytes);
  if (entry.method !== 8) throw new Error("Unsupported Excel compression.");
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot open .xlsx directly. Save the Excel file as CSV instead.");
  }
  try {
    // All operations run locally inside the browser, not in a remote service.
    const stream = new Blob([Uint8Array.from(entry.bytes)]).stream().pipeThrough(
      new DecompressionStream("deflate-raw"),
    );
    const array = new Uint8Array(await new Response(stream).arrayBuffer());
    if (array.byteLength > MAX_XML_BYTES || array.byteLength !== entry.expanded) {
      throw new Error("Invalid Excel worksheet size.");
    }
    return new TextDecoder().decode(array);
  } catch {
    throw new Error("Cannot unpack this Excel file. Please export the worksheet as CSV.");
  }
}

/** ZIP central-directory reader: only text XML, no macros or arbitrary files. */
async function openXlsxZip(buffer: ArrayBuffer): Promise<Map<string, ZipEntry>> {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const result = new Map<string, ZipEntry>();
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("This is not a supported .xlsx file.");
  const entries = view.getUint16(end + 10, true);
  if (entries > 500) throw new Error("Excel file contains too many archive entries.");
  let offset = view.getUint32(end + 16, true);
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Invalid Excel archive directory.");
    }
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const expanded = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extra = view.getUint16(offset + 30, true);
    const comment = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    if (name.startsWith("xl/worksheets/") || name === "xl/sharedStrings.xml") {
      if (expanded > MAX_XML_BYTES || localOffset + 30 > bytes.length ||
          view.getUint32(localOffset, true) !== 0x04034b50) {
        throw new Error("Invalid or oversized Excel XML entry.");
      }
      const start = localOffset + 30 +
        view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      if (start + compressed > bytes.length) throw new Error("Truncated Excel archive.");
      result.set(name, {
        bytes: bytes.subarray(start, start + compressed), method, expanded,
      });
    }
    offset += 46 + nameLen + extra + comment;
  }
  return result;
}
