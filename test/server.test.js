import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../server.js';

let server;
let base;
let dataDir;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'listing-preflight-'));
  server = createServer({ dataDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

const post = (url, body, raw = false) =>
  fetch(`${base}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? body : JSON.stringify(body),
  });

const readLines = async (file) => {
  try {
    return (await readFile(path.join(dataDir, file), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
};

test('health endpoint responds', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('serves the app shell at /', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /Listing Preflight/);
});

test('serves JS modules with a JavaScript content type', async () => {
  const res = await fetch(`${base}/lib/preflight.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
});

test('does not serve files outside the public directory', async () => {
  for (const p of ['/../server.js', '/%2e%2e/package.json', '/..%2fserver.js', '/nope.txt']) {
    const res = await fetch(`${base}${p}`);
    assert.equal(res.status, 404, p);
    await res.arrayBuffer();
  }
});

test('unknown API routes and wrong methods are rejected', async () => {
  const notFound = await post('/api/does-not-exist', {});
  assert.equal(notFound.status, 404);
  await notFound.arrayBuffer();
  const wrong = await fetch(`${base}/api/events`);
  assert.equal(wrong.status, 405);
  await wrong.arrayBuffer();
});

test('events: accepts allowed events and stores them without any file contents', async () => {
  const bad = await post('/api/events', { event: 'csv_contents', rows: 3 });
  assert.equal(bad.status, 400);
  await bad.arrayBuffer();

  const ok = await post('/api/events', { event: 'check_run', rows: 25, errorRows: 7 });
  assert.equal(ok.status, 204);
  await ok.arrayBuffer();

  const events = await readLines('events.jsonl');
  const last = events.at(-1);
  assert.equal(last.event, 'check_run');
  assert.equal(last.rows, 25);
  assert.equal(last.errorRows, 7);
  assert.ok(last.at);
});

test('waitlist: rejects bad emails and unknown plans, stores valid signups', async () => {
  const bad = await post('/api/waitlist', { email: 'not-an-email', plan: 'pro' });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /valid email/);

  const badPlan = await post('/api/waitlist', { email: 'a@example.com', plan: 'enterprise' });
  assert.equal(badPlan.status, 400);
  await badPlan.arrayBuffer();

  const ok = await post('/api/waitlist', { email: '  Seller@Example.COM ', plan: 'pro', source: 'pricing' });
  assert.equal(ok.status, 201);
  const data = await ok.json();
  assert.match(data.message, /nothing has been charged/);

  const lines = await readLines('waitlist.jsonl');
  assert.equal(lines.at(-1).email, 'seller@example.com');
  assert.equal(lines.at(-1).plan, 'pro');
});

test('concierge: validates listing count and stores requests as new', async () => {
  const zero = await post('/api/concierge', { email: 'a@example.com', listingCount: 0 });
  assert.equal(zero.status, 400);
  await zero.arrayBuffer();

  const fraction = await post('/api/concierge', { email: 'a@example.com', listingCount: 2.5 });
  assert.equal(fraction.status, 400);
  await fraction.arrayBuffer();

  const ok = await post('/api/concierge', { email: 'a@example.com', listingCount: 40, note: 'Due Friday' });
  assert.equal(ok.status, 201);
  await ok.arrayBuffer();

  const lines = await readLines('concierge.jsonl');
  const last = lines.at(-1);
  assert.equal(last.listingCount, 40);
  assert.equal(last.note, 'Due Friday');
  assert.equal(last.status, 'new');
});

test('rejects invalid JSON and oversized bodies', async () => {
  const badJson = await post('/api/events', '{not json', true);
  assert.equal(badJson.status, 400);
  await badJson.arrayBuffer();

  const huge = await post('/api/events', JSON.stringify({ event: 'check_run', pad: 'x'.repeat(20000) }), true);
  assert.equal(huge.status, 413);
  await huge.arrayBuffer();
});
