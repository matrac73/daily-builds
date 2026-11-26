import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ConversionError, csvToJson, jsonToCsv, parseCsv } from '../src/converter.js';

const assertConversionError = (run, pattern) =>
  assert.throws(run, (error) => error instanceof ConversionError && pattern.test(error.message));

test('jsonToCsv converts an array of flat objects', () => {
  const json = '[{"name":"Ada","age":36},{"name":"Linus","age":54}]';
  assert.equal(jsonToCsv(json), 'name,age\nAda,36\nLinus,54');
});

test('jsonToCsv treats a single object as one row', () => {
  assert.equal(jsonToCsv('{"id":1,"ok":true}'), 'id,ok\n1,true');
});

test('jsonToCsv builds the header from the union of keys, in order of appearance', () => {
  const json = '[{"a":1},{"b":2,"a":3},{"c":4}]';
  assert.equal(jsonToCsv(json), 'a,b,c\n1,,\n3,2,\n,,4');
});

test('jsonToCsv escapes delimiters, quotes and line breaks', () => {
  const json = JSON.stringify([{ text: 'Hello, "world"', note: 'line 1\nline 2' }]);
  assert.equal(jsonToCsv(json), 'text,note\n"Hello, ""world""","line 1\nline 2"');
});

test('jsonToCsv writes null as an empty field and quotes ambiguous strings', () => {
  const json = JSON.stringify([{ nothing: null, empty: '', digits: '42', flag: 'true' }]);
  assert.equal(jsonToCsv(json), 'nothing,empty,digits,flag\n,"","42","true"');
});

test('jsonToCsv honours the delimiter and eol options', () => {
  const json = '[{"a":"x;y","b":"1,5"}]';
  assert.equal(jsonToCsv(json, { delimiter: ';', eol: '\r\n' }), 'a;b\r\n"x;y";1,5');
});

test('jsonToCsv ignores inherited property names when a key is missing', () => {
  assert.equal(jsonToCsv('[{"constructor":"x"},{"other":1}]'), 'constructor,other\nx,\n,1');
});

test('jsonToCsv rejects empty input', () => {
  assertConversionError(() => jsonToCsv('   \n'), /empty/);
});

test('jsonToCsv rejects invalid JSON', () => {
  assertConversionError(() => jsonToCsv('[{"a":1,}]'), /^Invalid JSON/);
});

test('jsonToCsv rejects empty arrays and property-less objects', () => {
  assertConversionError(() => jsonToCsv('[]'), /array is empty/);
  assertConversionError(() => jsonToCsv('[{}]'), /no properties/);
});

test('jsonToCsv rejects items that are not objects', () => {
  assertConversionError(() => jsonToCsv('[{"a":1},2]'), /Item 2 is not an object/);
  assertConversionError(() => jsonToCsv('"text"'), /Item 1 is not an object/);
  assertConversionError(() => jsonToCsv('[[1,2]]'), /Item 1 is not an object/);
});

test('jsonToCsv rejects nested structures and names the offending key', () => {
  assertConversionError(() => jsonToCsv('[{"a":1,"tags":["x"]}]'), /item 1 .* "tags"/);
  assertConversionError(() => jsonToCsv('[{"a":1},{"geo":{"lat":0}}]'), /item 2 .* "geo"/);
});

test('parseCsv handles quoted fields, escaped quotes and mixed line endings', () => {
  const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r"multi\nline",z\n');
  assert.deepEqual(
    rows.map((row) => row.map((field) => field.value)),
    [
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['multi\nline', 'z'],
    ],
  );
});

test('parseCsv skips blank lines, keeps trailing empty fields and strips the BOM', () => {
  const rows = parseCsv('﻿a,b\n\n1,\n\n');
  assert.deepEqual(
    rows.map((row) => row.map((field) => field.value)),
    [
      ['a', 'b'],
      ['1', ''],
    ],
  );
});

test('parseCsv rejects an unterminated quoted field', () => {
  assertConversionError(() => parseCsv('a\n"oops'), /never closed/);
});

test('csvToJson infers types for unquoted fields only', () => {
  const csv = 'n,f,t,s,q,e,z\n-1.5e2,false,true,hello,"42",,007';
  assert.deepEqual(JSON.parse(csvToJson(csv)), [
    { n: -150, f: false, t: true, s: 'hello', q: '42', e: null, z: '007' },
  ]);
});

test('csvToJson pads short rows with null and supports other delimiters', () => {
  assert.deepEqual(JSON.parse(csvToJson('a\tb\tc\n1\t2', { delimiter: '\t' })), [
    { a: 1, b: 2, c: null },
  ]);
});

test('csvToJson returns an empty array when there is only a header', () => {
  assert.equal(csvToJson('a,b'), '[]');
});

test('csvToJson rejects empty input, bad headers and overlong rows', () => {
  assertConversionError(() => csvToJson(' '), /empty/);
  assertConversionError(() => csvToJson('a,,c\n1,2,3'), /empty column name/);
  assertConversionError(() => csvToJson('a,b,a\n1,2,3'), /"a" appears more than once/);
  assertConversionError(() => csvToJson('a,b\n1,2\n1,2,3'), /row 3 has 3 fields/);
});

test('JSON -> CSV -> JSON round-trips flat data losslessly', () => {
  const records = [
    { id: 1, name: 'Ada "the countess" Lovelace', active: true, score: 9.5, note: null },
    { id: 2, name: 'comma, semi; tab\t', active: false, score: -0.25, note: '' },
    { id: 3, name: 'multi\r\nline', active: true, score: 1e21, note: 'null' },
    { id: 4, name: ' padded ', active: false, score: 0, note: '1e3' },
  ];
  for (const delimiter of [',', ';', '\t']) {
    const csv = jsonToCsv(JSON.stringify(records), { delimiter });
    assert.deepEqual(JSON.parse(csvToJson(csv, { delimiter })), records);
  }
});
