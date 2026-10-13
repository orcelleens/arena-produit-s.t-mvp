/**
 * Listing Preflight server.
 *
 * - Serves the static app from ./public (the CSV check itself runs in the browser).
 * - Stores only what the MVP needs to validate demand, as JSON lines in DATA_DIR:
 *     events.jsonl     anonymous event counts (check_run, upgrade_shown, check_download)
 *     waitlist.jsonl   emails for the fake-door Pro plan (nothing is charged)
 *     concierge.jsonl  manual "fix it for me" requests (fulfilled by hand, see scripts/queue.js)
 * - No database, no auth, no dependencies.
 */
import http from 'node:http';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const MAX_BODY_BYTES = 16 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ALLOWED_EVENTS = new Set(['check_run', 'check_download', 'upgrade_shown']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

function cleanEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    throw new HttpError(400, 'Please enter a valid email address');
  }
  return email;
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Build the HTTP server. Options exist so tests can use temp directories.
 */
export function createServer({
  dataDir = process.env.DATA_DIR || path.join(here, 'data'),
  publicDir = path.join(here, 'public'),
} = {}) {
  async function store(file, record) {
    await mkdir(dataDir, { recursive: true });
    const line = JSON.stringify({ ...record, at: new Date().toISOString() }) + '\n';
    await appendFile(path.join(dataDir, file), line, 'utf8');
  }

  async function serveStatic(pathname, res) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      throw new HttpError(400, 'Bad request path');
    }
    const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
    const filePath = path.resolve(publicDir, relative);
    if (filePath !== publicDir && !filePath.startsWith(publicDir + path.sep)) {
      throw new HttpError(404, 'Not found');
    }
    let data;
    try {
      data = await readFile(filePath);
    } catch {
      throw new HttpError(404, 'Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  }

  async function route(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;

    if (pathname.startsWith('/api/')) {
      if (req.method === 'GET' && pathname === '/api/health') {
        return sendJson(res, 200, { ok: true });
      }

      if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

      const body = await readJson(req);

      if (pathname === '/api/events') {
        if (!ALLOWED_EVENTS.has(body.event)) throw new HttpError(400, 'Unknown event');
        const countOf = (v) => (Number.isInteger(v) && v >= 0 && v <= 1_000_000 ? v : null);
        await store('events.jsonl', {
          event: body.event,
          rows: countOf(body.rows),
          errorRows: countOf(body.errorRows),
        });
        res.writeHead(204).end();
        return;
      }

      if (pathname === '/api/waitlist') {
        const email = cleanEmail(body.email);
        if (body.plan !== 'pro') throw new HttpError(400, 'Unknown plan');
        await store('waitlist.jsonl', { email, plan: 'pro', source: cleanText(body.source, 50) });
        return sendJson(res, 201, {
          ok: true,
          message: "You're on the list. Pro isn't live yet, and nothing has been charged.",
        });
      }

      if (pathname === '/api/concierge') {
        const email = cleanEmail(body.email);
        const listingCount = Number(body.listingCount);
        if (!Number.isInteger(listingCount) || listingCount < 1 || listingCount > 10000) {
          throw new HttpError(400, 'Listing count must be a whole number between 1 and 10,000');
        }
        const note = cleanText(body.note, 500);
        await store('concierge.jsonl', { email, listingCount, note, status: 'new' });
        return sendJson(res, 201, {
          ok: true,
          message: "Thanks! We'll reply within one business day with a secure way to send your file.",
        });
      }

      throw new HttpError(404, 'Not found');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    return serveStatic(pathname, res);
  }

  return http.createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
      } else {
        console.error(err);
        sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
      }
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, '0.0.0.0', () => {
    console.log(`Listing Preflight running at http://0.0.0.0:${port}`);
  });
}
