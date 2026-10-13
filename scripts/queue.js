#!/usr/bin/env node
/**
 * Manual fulfillment queue for the concierge test.
 * Prints demand signals from DATA_DIR (default ./data) so you can work the
 * requests by hand and compare numbers against the GO/KILL criteria in SIGNAL.md.
 *
 *   npm run queue                     show demand signals and open requests
 *   npm run queue -- done <email>     mark that email's open requests as done
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(here, '..', 'data');

async function readLines(file) {
  try {
    const text = await readFile(path.join(dataDir, file), 'utf8');
    return text
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

const [command, target] = process.argv.slice(2);

if (command === 'done') {
  if (!target) {
    console.error('Usage: npm run queue -- done <email>');
    process.exit(1);
  }
  const email = target.trim().toLowerCase();
  const requests = await readLines('concierge.jsonl');
  let changed = 0;
  for (const r of requests) {
    if (r.email === email && r.status === 'new') {
      r.status = 'done';
      changed++;
    }
  }
  await writeFile(path.join(dataDir, 'concierge.jsonl'), requests.map((r) => JSON.stringify(r)).join('\n') + (requests.length ? '\n' : ''));
  console.log(`Marked ${changed} request(s) from ${email} as done.`);
  process.exit(0);
}

const [events, waitlist, concierge] = await Promise.all([
  readLines('events.jsonl'),
  readLines('waitlist.jsonl'),
  readLines('concierge.jsonl'),
]);

const count = (arr, fn) => arr.filter(fn).length;
const checks = count(events, (e) => e.event === 'check_run');
const uniqueEmails = new Set(waitlist.map((w) => w.email));
const newRequests = concierge.filter((c) => c.status === 'new');

console.log(`Data directory: ${dataDir}\n`);
console.log('Demand signals');
const checksWithErrors = count(events, (e) => e.event === 'check_run' && e.errorRows > 0);
console.log(`  File checks run .............. ${checks}`);
console.log(`  ...of which had errors ....... ${checksWithErrors}${checks ? ` (${Math.round((100 * checksWithErrors) / checks)}%)` : ''}`);
console.log(`  Downloads of cleaned CSV ..... ${count(events, (e) => e.event === 'check_download')}`);
console.log(`  Upgrade prompts shown ........ ${count(events, (e) => e.event === 'upgrade_shown')}`);
console.log(`  Pro waitlist (unique emails) . ${uniqueEmails.size}`);
console.log(`  Concierge requests ........... ${concierge.length} (${newRequests.length} new)\n`);

if (newRequests.length === 0) {
  console.log('No open concierge requests.');
} else {
  console.log('Open concierge requests (fulfil by hand, then run: npm run queue -- done <email>):');
  for (const r of newRequests) {
    console.log(`  - ${r.at}  ${r.email}  listings: ${r.listingCount}`);
    if (r.note) console.log(`      note: ${r.note}`);
  }
}
