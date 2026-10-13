import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, stringifyCsv } from '../public/lib/csv.js';

test('parses quoted commas, escaped quotes and CRLF line endings', () => {
  const rows = parseCsv('a,b,c\r\n"x, y","say ""hi""",3\r\n');
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['x, y', 'say "hi"', '3'],
  ]);
});

test('strips a UTF-8 BOM and keeps newlines inside quoted fields', () => {
  const rows = parseCsv('\uFEFFtitle,desc\n"Mug","line1\nline2"\n');
  assert.deepEqual(rows, [
    ['title', 'desc'],
    ['Mug', 'line1\nline2'],
  ]);
});

test('drops blank lines', () => {
  assert.deepEqual(parseCsv('a,b\n\n1,2\n\n'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('handles a final row without a trailing newline', () => {
  assert.deepEqual(parseCsv('a,b\n1,2'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('stringify output parses back to the same rows', () => {
  const rows = [
    ['h1', 'h2'],
    ['a,b', 'c"d'],
    ['multi\nline', ''],
  ];
  assert.deepEqual(parseCsv(stringifyCsv(rows)), rows);
});

test('stringify quotes only fields that need it', () => {
  assert.equal(stringifyCsv([['plain', 'needs,quote']]), 'plain,"needs,quote"\r\n');
});
