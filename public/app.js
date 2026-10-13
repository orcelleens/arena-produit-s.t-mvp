import { parseCsv, stringifyCsv } from './lib/csv.js';
import { FIELDS, FREE_ROW_LIMIT, guessMapping, preflight } from './lib/preflight.js';

const MAX_TABLE_ROWS = 500;
const ISSUE_LABEL = { error: 'Fix', warning: 'Check', fix: 'Fixed' };
const STATUS_LABEL = { ok: 'Ready', fixed: 'Auto-fixed', warning: 'Check', error: 'Needs fix' };

const state = { fileName: '', headers: [], rows: [], mapping: {}, result: null };

const $ = (sel) => document.querySelector(sel);

/** Tiny DOM helper. Text is always set with textContent, never innerHTML. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

/** Fire-and-forget event for demand tracking. Never blocks the UI. */
function track(event, counts = {}) {
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, ...counts }),
    keepalive: true,
  }).catch(() => {});
}

function showFileNotice(message, kind = 'error') {
  const box = $('#file-notice');
  box.textContent = message;
  box.className = `notice ${kind}`;
  box.hidden = false;
}

function hideFileNotice() {
  $('#file-notice').hidden = true;
}

async function loadText(text, name) {
  const parsed = parseCsv(text);
  if (parsed.length < 2) {
    showFileNotice('That file needs a header row and at least one listing row.');
    return;
  }
  const [headers, ...rows] = parsed;
  state.fileName = name;
  state.headers = headers.map((h) => h.trim());
  state.rows = rows;
  state.mapping = guessMapping(state.headers);
  $('#file-name').textContent = `${name} · ${rows.length} rows`;
  hideFileNotice();
  renderMapping();
  $('#mapping-card').hidden = false;
  run();
  // Counts only: no listing content leaves the browser.
  const checked = state.rows.slice(0, FREE_ROW_LIMIT);
  const first = preflight({ headers: state.headers, rows: checked, mapping: state.mapping });
  track('check_run', { rows: checked.length, errorRows: first.summary ? first.summary.error : 0 });
}

function renderMapping() {
  const container = $('#mapping');
  container.replaceChildren();
  for (const field of FIELDS) {
    const select = el('select', { name: field.key });
    select.append(el('option', { value: '-1', text: '— not in this file —' }));
    state.headers.forEach((h, i) => {
      select.append(el('option', { value: String(i), text: h || `(column ${i + 1})` }));
    });
    select.value = String(state.mapping[field.key] ?? -1);
    select.addEventListener('change', () => {
      state.mapping[field.key] = Number(select.value);
      run();
    });
    container.append(
      el('label', {}, el('span', { text: field.required ? `${field.label} *` : field.label }), select),
    );
  }
}

function run() {
  if (!state.headers.length) return;
  const checkedRows = state.rows.slice(0, FREE_ROW_LIMIT);
  const result = preflight({ headers: state.headers, rows: checkedRows, mapping: state.mapping });
  state.result = result;

  const box = $('#results');
  box.hidden = false;

  if (result.fileErrors.length) {
    $('#summary').replaceChildren();
    $('#rows').replaceChildren();
    $('#row-cap').hidden = true;
    $('#upgrade').hidden = true;
    $('#download').disabled = true;
    showFileNotice(result.fileErrors.join(' '));
    return;
  }
  hideFileNotice();
  renderSummary(result.summary);
  renderUpgrade(state.rows.length);
  renderRows(result.results);
  $('#download').disabled = result.results.length === 0;
}

function renderSummary(s) {
  const stat = (cls, n, label) => el('div', { class: `stat ${cls}` }, el('span', { class: 'n', text: String(n) }), el('span', { class: 'l', text: label }));
  $('#summary').replaceChildren(
    stat('', s.checked, 'Rows checked'),
    stat('ok', s.ok, 'Ready'),
    stat('fixed', s.fixed, 'Auto-fixed'),
    stat('warning', s.warning, 'Worth a look'),
    stat('error', s.error, 'Need a fix'),
  );
}

function renderUpgrade(totalRows) {
  const hidden = totalRows <= FREE_ROW_LIMIT;
  $('#upgrade').hidden = hidden;
  if (!hidden) {
    $('#free-limit').textContent = String(FREE_ROW_LIMIT);
    $('#total-rows').textContent = String(totalRows);
    track('upgrade_shown', { rows: totalRows });
  }
}

function renderRows(results) {
  const tbody = $('#rows');
  tbody.replaceChildren();
  const shown = results.slice(0, MAX_TABLE_ROWS);
  for (const r of shown) {
    const issues = r.issues.length
      ? el(
          'ul',
          { class: 'issues' },
          ...r.issues.map((i) => el('li', { class: i.level, text: `${ISSUE_LABEL[i.level]}: ${i.message}` })),
        )
      : el('span', { class: 'muted', text: 'No issues' });
    tbody.append(
      el(
        'tr',
        {},
        el('td', { text: String(r.row) }),
        el('td', {}, el('span', { class: `badge ${r.status}`, text: STATUS_LABEL[r.status] })),
        el('td', { class: 'title', text: r.title.length > 90 ? `${r.title.slice(0, 90)}…` : r.title }),
        el('td', {}, issues),
      ),
    );
  }
  const cap = $('#row-cap');
  cap.hidden = results.length <= MAX_TABLE_ROWS;
  cap.textContent = `Showing the first ${MAX_TABLE_ROWS} of ${results.length} rows. The download includes all checked rows.`;
}

function downloadCleaned() {
  const result = state.result;
  if (!result || result.fileErrors.length) return;
  const csv = stringifyCsv([state.headers, ...result.cleanRecords]);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const base = state.fileName.replace(/\.csv$/i, '') || 'listings';
  const a = el('a', { href: url, download: `${base}-cleaned.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  track('check_download', { rows: result.cleanRecords.length });
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

function setMsg(id, text, ok) {
  const node = $(id);
  node.textContent = text;
  node.className = ok ? 'small form-msg-ok' : 'small form-msg-err';
}

function wire() {
  const input = $('#file-input');
  const dropzone = $('#dropzone');

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (file) await readFile(file);
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('drag');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag');
    }),
  );
  dropzone.addEventListener('drop', async (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) await readFile(file);
  });

  $('#download').addEventListener('click', downloadCleaned);

  $('#pro-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get('email');
    try {
      const data = await postJson('/api/waitlist', { email, plan: 'pro', source: 'pricing' });
      setMsg('#pro-msg', data.message, true);
      e.currentTarget.reset();
    } catch (err) {
      setMsg('#pro-msg', err.message, false);
    }
  });

  $('#concierge-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      const data = await postJson('/api/concierge', {
        email: form.get('email'),
        listingCount: Number(form.get('listingCount')),
        note: form.get('note') || '',
      });
      setMsg('#concierge-msg', data.message, true);
      e.currentTarget.reset();
    } catch (err) {
      setMsg('#concierge-msg', err.message, false);
    }
  });
}

async function readFile(file) {
  if (file.size > 5 * 1024 * 1024) {
    showFileNotice('That file is over 5 MB. Split it into smaller batches and check each one.');
    return;
  }
  const text = await file.text();
  await loadText(text, file.name);
}

wire();
