import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ConversionError, formatField, parseCsv } from '../src/csv.js';

const texts = (records) => records.map(({ fields }) => fields.map((field) => field.text));

test('parseCsv splits records and fields', () => {
  assert.deepEqual(texts(parseCsv('a,b,c\n1,2,3')), [
    ['a', 'b', 'c'],
    ['1', '2', '3'],
  ]);
});

test('parseCsv accepts CRLF line endings and a trailing newline', () => {
  assert.deepEqual(texts(parseCsv('a,b\r\n1,2\r\n')), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('parseCsv handles quoted delimiters, escaped quotes and line breaks', () => {
  const records = parseCsv('name,quote\n"Doe, Jane","She said ""hi""\nthen left"');
  assert.deepEqual(texts(records), [
    ['name', 'quote'],
    ['Doe, Jane', 'She said "hi"\nthen left'],
  ]);
});

test('parseCsv records whether a field was quoted', () => {
  const [{ fields }] = parseCsv('42,"42",""');
  assert.deepEqual(fields, [
    { text: '42', quoted: false },
    { text: '42', quoted: true },
    { text: '', quoted: true },
  ]);
});

test('parseCsv keeps empty fields, including a trailing one', () => {
  assert.deepEqual(texts(parseCsv('a,,c\n,,')), [
    ['a', '', 'c'],
    ['', '', ''],
  ]);
});

test('parseCsv skips blank lines and reports the source line of each record', () => {
  const records = parseCsv('a\n\n"multi\nline"\nlast');
  assert.deepEqual(
    records.map(({ line }) => line),
    [1, 3, 5],
  );
});

test('parseCsv supports other delimiters', () => {
  assert.deepEqual(texts(parseCsv('a;b\n"x;y";z', ';')), [
    ['a', 'b'],
    ['x;y', 'z'],
  ]);
  assert.deepEqual(texts(parseCsv('a\tb', '\t')), [['a', 'b']]);
});

test('parseCsv rejects an unterminated quoted field', () => {
  assert.throws(() => parseCsv('a,b\n1,"oops'), {
    name: 'ConversionError',
    message: /Line 2: a quoted field is never closed/,
  });
});

test('parseCsv rejects text after a closing quote', () => {
  assert.throws(() => parseCsv('"abc"def'), {
    name: 'ConversionError',
    message: /Line 1: unexpected character "d" after a closing quote/,
  });
});

test('parseCsv rejects a quote in the middle of an unquoted field', () => {
  assert.throws(() => parseCsv('a\n5" pipe'), ConversionError);
});

test('formatField quotes only when needed', () => {
  assert.equal(formatField('plain'), 'plain');
  assert.equal(formatField('a,b'), '"a,b"');
  assert.equal(formatField('say "hi"'), '"say ""hi"""');
  assert.equal(formatField('two\nlines'), '"two\nlines"');
  assert.equal(formatField(' padded '), '" padded "');
  assert.equal(formatField('a,b', ';'), 'a,b');
  assert.equal(formatField('a;b', ';'), '"a;b"');
  assert.equal(formatField('42', ',', true), '"42"');
});
