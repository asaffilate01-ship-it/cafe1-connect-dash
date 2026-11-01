/**
 * Spreadsheet-safe and HTML-safe juror claim presentation. Voucher references
 * originate outside the email renderer and must be treated as untrusted text.
 */
export function csvClaimCell(value: string | number): string {
  const raw = String(value);
  // Excel/Sheets can evaluate formula cells even when the CSV field is quoted.
  // Prefix those values with a literal apostrophe before CSV escaping.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function escapeClaimHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
