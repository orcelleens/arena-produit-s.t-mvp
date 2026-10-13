/**
 * Listing Preflight rules engine.
 *
 * Checks each row of a marketplace listing CSV against Etsy's published
 * listing limits (title: 140 characters; 13 tags, 20 characters each),
 * flags problems that would make a bulk upload fail or publish badly,
 * and applies only conservative, lossless fixes (trimming, price format,
 * duplicate tags). Anything ambiguous is reported, never silently changed.
 *
 * Pure functions, no DOM, no Node APIs. Shared by the browser UI and the tests.
 */

/** Rows checked per run on the free tier. */
export const FREE_ROW_LIMIT = 25;

/** Etsy listing limits used by the checks. Verify against Etsy's help pages before relying on them. */
export const LIMITS = Object.freeze({ TITLE_MAX: 140, TAGS_MAX: 13, TAG_MAX: 20 });

/**
 * Columns the checker understands. `aliases` are normalized header names
 * (lowercase, underscores and runs of spaces collapsed to one space).
 * The user can always override the auto-guessed mapping in the UI.
 */
export const FIELDS = Object.freeze([
  { key: 'title', label: 'Title', required: true, aliases: ['title', 'listing title', 'item name', 'product name'] },
  { key: 'description', label: 'Description', required: false, aliases: ['description', 'listing description', 'desc'] },
  { key: 'price', label: 'Price', required: true, aliases: ['price', 'item price'] },
  { key: 'quantity', label: 'Quantity', required: true, aliases: ['quantity', 'qty', 'stock', 'inventory'] },
  { key: 'tags', label: 'Tags', required: false, aliases: ['tags', 'tag', 'keywords'] },
  { key: 'sku', label: 'SKU', required: false, aliases: ['sku', 'item sku', 'listing sku'] },
  { key: 'image', label: 'Image URL', required: false, aliases: ['image1', 'image 1', 'image url', 'photo url', 'image'] },
]);

const LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

const normHeader = (s) => String(s ?? '').trim().toLowerCase().replace(/[_\s]+/g, ' ');

/**
 * Guess which column index holds each field.
 * Returns { key: columnIndex } where -1 means "not mapped".
 */
export function guessMapping(headers) {
  const mapping = {};
  const used = new Set();
  for (const f of FIELDS) {
    const idx = headers.findIndex((h, i) => !used.has(i) && f.aliases.includes(normHeader(h)));
    mapping[f.key] = idx;
    if (idx >= 0) used.add(idx);
  }
  return mapping;
}

/**
 * Normalize a price string such as "$1,234.50", "12,50" or "USD 9.99".
 * Returns { ok, value } where value is a plain decimal string ("1234.50").
 */
export function normalizePrice(raw) {
  let s = String(raw ?? '').replace(/[^\d.,-]/g, '');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s) || Number(s) <= 0) return { ok: false, value: null };
  return { ok: true, value: s };
}

function cell(record, mapping, key) {
  const idx = mapping[key];
  return idx >= 0 ? String(record[idx] ?? '') : null;
}

/**
 * Check a single record (array of raw cell strings).
 * Returns { issues, values } where values holds the cleaned value for each mapped field.
 * Issue levels:
 *   error   - will likely be rejected or published wrong; user must fix
 *   warning - worth a look, not blocking
 *   fix     - already corrected in the cleaned output
 */
export function checkRecord(record, mapping) {
  const issues = [];
  const values = {};
  const add = (level, field, message) => issues.push({ level, field, message });

  const trimmed = (key) => {
    const raw = cell(record, mapping, key);
    if (raw === null) return null;
    const t = raw.trim();
    if (t !== raw) add('fix', key, `${LABEL[key]}: removed extra spaces`);
    return t;
  };

  // Title
  const title = trimmed('title');
  if (title !== null) {
    values.title = title;
    if (!title) add('error', 'title', 'Title is empty');
    else if (title.length > LIMITS.TITLE_MAX) {
      add('error', 'title', `Title is ${title.length} characters (max ${LIMITS.TITLE_MAX})`);
    }
  }

  // Description
  const description = trimmed('description');
  if (description !== null) {
    values.description = description;
    if (!description) add('warning', 'description', 'Description is empty');
  }

  // Price
  const rawPrice = cell(record, mapping, 'price');
  if (rawPrice !== null) {
    const p = normalizePrice(rawPrice);
    if (!p.ok) {
      values.price = rawPrice.trim();
      add('error', 'price', `Price "${rawPrice.trim()}" is not a valid amount (e.g. 12.50)`);
    } else {
      values.price = p.value;
      if (p.value !== rawPrice.trim()) add('fix', 'price', `Price "${rawPrice.trim()}" normalized to ${p.value}`);
    }
  }

  // Quantity
  const rawQty = cell(record, mapping, 'quantity');
  if (rawQty !== null) {
    const q = rawQty.trim();
    if (/^\d+$/.test(q) && Number(q) >= 1) {
      values.quantity = q;
    } else if (/^\d+\.0*$/.test(q) && Number(q) >= 1) {
      values.quantity = String(parseInt(q, 10));
      add('fix', 'quantity', `Quantity "${q}" normalized to ${values.quantity}`);
    } else {
      values.quantity = q;
      add('error', 'quantity', `Quantity "${q}" must be a whole number, 1 or more`);
    }
  }

  // Tags: split on commas, collapse spaces, drop empties, remove case-insensitive duplicates
  const rawTags = cell(record, mapping, 'tags');
  if (rawTags !== null) {
    const parts = rawTags
      .split(',')
      .map((t) => t.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const seen = new Set();
    const unique = [];
    let dupes = 0;
    for (const t of parts) {
      const k = t.toLowerCase();
      if (seen.has(k)) {
        dupes++;
        continue;
      }
      seen.add(k);
      unique.push(t);
    }
    if (dupes) add('fix', 'tags', `Removed ${dupes} duplicate tag${dupes > 1 ? 's' : ''}`);
    for (const t of unique) {
      if (t.length > LIMITS.TAG_MAX) {
        add('error', 'tags', `Tag "${t}" is ${t.length} characters (max ${LIMITS.TAG_MAX})`);
      }
    }
    if (unique.length > LIMITS.TAGS_MAX) {
      add('error', 'tags', `${unique.length} tags (max ${LIMITS.TAGS_MAX}). Remove ${unique.length - LIMITS.TAGS_MAX}.`);
    }
    if (unique.length === 0) add('warning', 'tags', 'No tags. Listings without tags are harder to find.');
    values.tags = unique.join(', ');
  }

  // SKU
  const sku = trimmed('sku');
  if (sku !== null) values.sku = sku;

  // Image URL
  const image = trimmed('image');
  if (image !== null) {
    values.image = image;
    if (image && !/^https:\/\/\S+$/i.test(image)) {
      add('warning', 'image', 'Image URL should be a public https:// link');
    }
  }

  return { issues, values };
}

function statusOf(issues) {
  if (issues.some((i) => i.level === 'error')) return 'error';
  if (issues.some((i) => i.level === 'warning')) return 'warning';
  if (issues.some((i) => i.level === 'fix')) return 'fixed';
  return 'ok';
}

/**
 * Run the checker over a whole file.
 * @param {{headers: string[], rows: string[][], mapping: object}} input
 * @returns {{fileErrors: string[], results: object[], cleanRecords: string[][], summary: object|null}}
 */
export function preflight({ headers, rows, mapping }) {
  const fileErrors = FIELDS.filter((f) => f.required && !(mapping[f.key] >= 0)).map(
    (f) => `No column is selected for ${f.label}.`,
  );
  if (fileErrors.length) return { fileErrors, results: [], cleanRecords: [], summary: null };

  const results = [];
  const cleanRecords = [];
  let skipped = 0;

  rows.forEach((record, i) => {
    if (record.every((c) => String(c ?? '').trim() === '')) {
      skipped++;
      return;
    }
    const { issues, values } = checkRecord(record, mapping);

    const out = [...record];
    while (out.length < headers.length) out.push('');
    for (const key of Object.keys(values)) out[mapping[key]] = values[key];
    cleanRecords.push(out);

    results.push({
      row: i + 1,
      title: values.title ?? '',
      sku: values.sku ?? '',
      issues,
      status: 'ok',
    });
  });

  // Shared SKUs are a warning on every row that shares one
  const bySku = new Map();
  for (const r of results) {
    if (!r.sku) continue;
    const k = r.sku.toLowerCase();
    bySku.set(k, [...(bySku.get(k) ?? []), r]);
  }
  for (const group of bySku.values()) {
    if (group.length < 2) continue;
    for (const r of group) {
      r.issues.push({ level: 'warning', field: 'sku', message: `SKU is shared with ${group.length - 1} other row(s)` });
    }
  }

  const summary = { checked: results.length, skipped, ok: 0, fixed: 0, warning: 0, error: 0 };
  for (const r of results) {
    r.status = statusOf(r.issues);
    summary[r.status]++;
  }

  return { fileErrors: [], results, cleanRecords, summary };
}
