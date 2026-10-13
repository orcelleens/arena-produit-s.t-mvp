/**
 * Minimal RFC 4180-style CSV parser and serializer.
 * No dependencies. Runs unchanged in the browser and in Node.
 */

/**
 * Parse CSV text into an array of rows (each row is an array of strings).
 * - Handles quoted fields, escaped quotes ("") and newlines inside quotes.
 * - Accepts CRLF, LF, and a leading UTF-8 BOM.
 * - Drops completely blank lines.
 */
export function parseCsv(text) {
  let s = String(text ?? '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function escapeField(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize rows (arrays of values) to CSV text with CRLF line endings. */
export function stringifyCsv(rows) {
  return rows.map((r) => r.map(escapeField).join(',')).join('\r\n') + '\r\n';
}
