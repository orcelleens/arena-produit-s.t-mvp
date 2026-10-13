import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCsv } from '../public/lib/csv.js';
import { checkRecord, guessMapping, normalizePrice, preflight, LIMITS } from '../public/lib/preflight.js';

const HEADERS = ['Title', 'Description', 'Price', 'Quantity', 'Tags', 'SKU', 'Image1'];
const MAPPING = guessMapping(HEADERS);

function rec(overrides = {}) {
  const base = {
    title: 'Ceramic Mug',
    description: 'Hand thrown.',
    price: '24.00',
    quantity: '5',
    tags: 'mug, coffee mug',
    sku: 'MUG-1',
    image: 'https://example.com/a.jpg',
  };
  const merged = { ...base, ...overrides };
  return HEADERS.map((h) => merged[{ Title: 'title', Description: 'description', Price: 'price', Quantity: 'quantity', Tags: 'tags', SKU: 'sku', Image1: 'image' }[h]]);
}

const levels = (issues) => issues.map((i) => i.level);

test('guessMapping finds common Etsy-style headers, including variants', () => {
  assert.deepEqual(MAPPING, { title: 0, description: 1, price: 2, quantity: 3, tags: 4, sku: 5, image: 6 });
  const alt = guessMapping(['Listing Title', 'Item Price', 'QTY', 'keywords', 'image_1']);
  assert.equal(alt.title, 0);
  assert.equal(alt.price, 1);
  assert.equal(alt.quantity, 2);
  assert.equal(alt.tags, 3);
  assert.equal(alt.image, 4);
  assert.equal(alt.description, -1);
});

test('normalizePrice accepts common formats and rejects bad ones', () => {
  assert.deepEqual(normalizePrice('$12.50'), { ok: true, value: '12.50' });
  assert.deepEqual(normalizePrice('1,234.50'), { ok: true, value: '1234.50' });
  assert.deepEqual(normalizePrice('12,50'), { ok: true, value: '12.50' });
  assert.deepEqual(normalizePrice('USD 9.99'), { ok: true, value: '9.99' });
  assert.equal(normalizePrice('0').ok, false);
  assert.equal(normalizePrice('-3').ok, false);
  assert.equal(normalizePrice('free').ok, false);
  assert.equal(normalizePrice('12.555').ok, false);
  assert.equal(normalizePrice('').ok, false);
});

test('a clean row produces no issues', () => {
  const { issues, values } = checkRecord(rec(), MAPPING);
  assert.deepEqual(issues, []);
  assert.equal(values.tags, 'mug, coffee mug');
});

test('title length limit is enforced at exactly 140 characters', () => {
  const ok = checkRecord(rec({ title: 'a'.repeat(LIMITS.TITLE_MAX) }), MAPPING);
  assert.equal(ok.issues.filter((i) => i.field === 'title').length, 0);
  const bad = checkRecord(rec({ title: 'a'.repeat(LIMITS.TITLE_MAX + 1) }), MAPPING);
  assert.deepEqual(levels(bad.issues), ['error']);
  assert.match(bad.issues[0].message, /141 characters \(max 140\)/);
});

test('empty title is an error', () => {
  const { issues } = checkRecord(rec({ title: '   ' }), MAPPING);
  assert.ok(issues.some((i) => i.level === 'error' && i.field === 'title'));
});

test('more than 13 tags is an error and gives the count to remove', () => {
  const tags = Array.from({ length: 15 }, (_, i) => `tag${i}`).join(', ');
  const { issues } = checkRecord(rec({ tags }), MAPPING);
  const err = issues.find((i) => i.level === 'error' && i.field === 'tags');
  assert.ok(err);
  assert.match(err.message, /15 tags \(max 13\)\. Remove 2\./);
});

test('exactly 13 tags is allowed', () => {
  const tags = Array.from({ length: 13 }, (_, i) => `tag${i}`).join(', ');
  const { issues } = checkRecord(rec({ tags }), MAPPING);
  assert.equal(issues.filter((i) => i.field === 'tags').length, 0);
});

test('a tag over 20 characters is an error', () => {
  const long = 'x'.repeat(21);
  const { issues } = checkRecord(rec({ tags: `ok tag, ${long}` }), MAPPING);
  const err = issues.find((i) => i.level === 'error' && i.field === 'tags');
  assert.ok(err);
  assert.match(err.message, /21 characters \(max 20\)/);
});

test('duplicate tags are removed case-insensitively and reported as a fix', () => {
  const { issues, values } = checkRecord(rec({ tags: 'Mug, mug ,  MUG, cup,,' }), MAPPING);
  assert.equal(values.tags, 'Mug, cup');
  assert.ok(issues.some((i) => i.level === 'fix' && /Removed 2 duplicate tags/.test(i.message)));
});

test('no tags is a warning, not an error', () => {
  const { issues } = checkRecord(rec({ tags: '' }), MAPPING);
  assert.deepEqual(levels(issues.filter((i) => i.field === 'tags')), ['warning']);
});

test('price is normalized and reported as a fix', () => {
  const { issues, values } = checkRecord(rec({ price: '$24.00' }), MAPPING);
  assert.equal(values.price, '24.00');
  assert.ok(issues.some((i) => i.level === 'fix' && i.field === 'price'));
});

test('an unparseable price is an error and is left unchanged', () => {
  const { issues, values } = checkRecord(rec({ price: 'call me' }), MAPPING);
  assert.equal(values.price, 'call me');
  assert.ok(issues.some((i) => i.level === 'error' && i.field === 'price'));
});

test('quantity must be a whole number of at least 1; "3.0" is fixed to 3', () => {
  assert.ok(checkRecord(rec({ quantity: '0' }), MAPPING).issues.some((i) => i.level === 'error' && i.field === 'quantity'));
  assert.ok(checkRecord(rec({ quantity: 'lots' }), MAPPING).issues.some((i) => i.level === 'error'));
  const fixed = checkRecord(rec({ quantity: '3.0' }), MAPPING);
  assert.equal(fixed.values.quantity, '3');
  assert.ok(fixed.issues.some((i) => i.level === 'fix'));
});

test('a non-https image URL is a warning', () => {
  const { issues } = checkRecord(rec({ image: 'http://example.com/a.jpg' }), MAPPING);
  assert.deepEqual(levels(issues.filter((i) => i.field === 'image')), ['warning']);
});

test('preflight blocks the run when a required column is not mapped', () => {
  const mapping = { ...MAPPING, price: -1 };
  const res = preflight({ headers: HEADERS, rows: [rec()], mapping });
  assert.deepEqual(res.fileErrors, ['No column is selected for Price.']);
  assert.equal(res.summary, null);
});

test('preflight skips blank rows and keeps row numbers for the rest', () => {
  const rows = [rec(), HEADERS.map(() => ''), rec({ title: '' })];
  const res = preflight({ headers: HEADERS, rows, mapping: MAPPING });
  assert.equal(res.summary.skipped, 1);
  assert.equal(res.results.length, 2);
  assert.deepEqual(res.results.map((r) => r.row), [1, 3]);
});

test('shared SKUs get a warning on every row that shares one', () => {
  const rows = [rec({ sku: 'A-1' }), rec({ sku: 'a-1' }), rec({ sku: 'B-2' })];
  const res = preflight({ headers: HEADERS, rows, mapping: MAPPING });
  assert.equal(res.results[0].status, 'warning');
  assert.equal(res.results[1].status, 'warning');
  assert.equal(res.results[2].status, 'ok');
});

test('cleaned records keep column order and unmapped columns, and include rows with errors', () => {
  const headers = ['Notes', 'Title', 'Price', 'Quantity', 'Tags'];
  const mapping = guessMapping(headers);
  const rows = [
    ['keep me', ' Mug ', '$9.50', '2', 'a, A, b'],
    ['keep me too', '', 'abc', '2', 'x'],
  ];
  const res = preflight({ headers, rows, mapping });
  assert.deepEqual(res.cleanRecords[0], ['keep me', 'Mug', '9.50', '2', 'a, b']);
  assert.equal(res.cleanRecords.length, 2);
  assert.equal(res.summary.error, 1);
});

test('the bundled sample file surfaces the errors it was built to show', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const text = await readFile(path.join(here, '..', 'public', 'sample-listings.csv'), 'utf8');
  const [headers, ...rows] = parseCsv(text);
  const res = preflight({ headers, rows, mapping: guessMapping(headers) });
  const all = res.results.flatMap((r) => r.issues.map((i) => i.message));
  assert.ok(all.some((m) => /Title is \d+ characters \(max 140\)/.test(m)), 'long title');
  assert.ok(all.some((m) => /14 tags \(max 13\)/.test(m)), 'too many tags');
  assert.ok(all.some((m) => /Quantity "0"/.test(m)), 'zero quantity');
  assert.ok(all.some((m) => /Price "\$24\.00" normalized to 24\.00/.test(m)), 'currency symbol price fixed');
  assert.ok(all.some((m) => /Removed 1 duplicate tag/.test(m)), 'duplicate tag removed');
  assert.ok(all.some((m) => /public https:\/\//.test(m)), 'http image warning');
  assert.equal(res.summary.error, 4);
  assert.equal(res.summary.checked, 5);
});
