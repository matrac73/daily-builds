import assert from 'node:assert/strict';
import { test } from 'node:test';

import { csvToJson, jsonToCsv } from '../src/converter.js';

const toRows = (csv, options) => JSON.parse(csvToJson(csv, options));

test('csvToJson turns each row into an object keyed by the header', () => {
  assert.deepEqual(toRows('name,city\nAda,London\nLinus,Helsinki'), [
    { name: 'Ada', city: 'London' },
    { name: 'Linus', city: 'Helsinki' },
  ]);
});

test('csvToJson pretty-prints with two spaces and keeps column order', () => {
  assert.equal(csvToJson('b,a\n1,2'), '[\n  {\n    "b": 1,\n    "a": 2\n  }\n]');
});

test('csvToJson infers numbers, booleans and null from unquoted fields', () => {
  assert.deepEqual(toRows('int,float,exp,yes,no,empty,nil\n42,-1.5,1e3,true,false,,null'), [
    { int: 42, float: -1.5, exp: 1000, yes: true, no: false, empty: null, nil: null },
  ]);
});

test('csvToJson keeps quoted fields and number look-alikes as strings', () => {
  assert.deepEqual(toRows('zip,quoted,blank,version,big\n01234,"42","",1.2.3,12345678901234567890'), [
    { zip: '01234', quoted: '42', blank: '', version: '1.2.3', big: '12345678901234567890' },
  ]);
});

test('csvToJson returns only strings when type inference is off', () => {
  assert.deepEqual(toRows('n,flag,empty\n42,true,', { inferTypes: false }), [
    { n: '42', flag: 'true', empty: '' },
  ]);
});

test('csvToJson honours the delimiter option and strips a byte order mark', () => {
  assert.deepEqual(toRows('﻿name;price\nTea;3,50', { delimiter: ';' }), [
    { name: 'Tea', price: '3,50' },
  ]);
});

test('csvToJson returns an empty array for a header without rows', () => {
  assert.equal(csvToJson('name,age\n'), '[]');
});

test('csvToJson handles a "__proto__" header as a plain key', () => {
  const [row] = toRows('__proto__\nx');
  assert.equal(Object.hasOwn(row, '__proto__'), true);
});

test('csvToJson warns about empty input', () => {
  for (const input of ['', '  \n\t ']) {
    assert.throws(() => csvToJson(input), { name: 'ConversionError', message: /CSV box is empty/ });
  }
});

test('csvToJson warns about rows that do not match the header', () => {
  assert.throws(() => csvToJson('a,b,c\n1,2,3\n4,5'), {
    name: 'ConversionError',
    message: /Line 3: expected 3 fields to match the header, but found 2/,
  });
});

test('csvToJson warns about missing or duplicate header names', () => {
  assert.throws(() => csvToJson('a,,c\n1,2,3'), /column 2 has no header name/);
  assert.throws(() => csvToJson('a,b,a\n1,2,3'), /header "a" appears more than once/);
});

test('csvToJson warns about malformed quoting', () => {
  assert.throws(() => csvToJson('a\n"never closed'), { name: 'ConversionError' });
});

test('jsonToCsv writes a header row followed by one line per object', () => {
  const json = '[{"name":"Ada","age":36},{"name":"Linus","age":28}]';
  assert.equal(jsonToCsv(json), 'name,age\nAda,36\nLinus,28');
});

test('jsonToCsv accepts a single object', () => {
  assert.equal(jsonToCsv('{"id":1,"ok":true}'), 'id,ok\n1,true');
});

test('jsonToCsv uses the union of keys and leaves missing or null values empty', () => {
  const json = '[{"a":1},{"b":2,"a":null},{"c":"x"}]';
  assert.equal(jsonToCsv(json), 'a,b,c\n1,,\n,2,\n,,x');
});

test('jsonToCsv quotes fields containing delimiters, quotes or line breaks', () => {
  const json = JSON.stringify([{ 'last, first': 'Doe, Jane', note: 'said "hi"\nbye' }]);
  assert.equal(jsonToCsv(json), '"last, first",note\n"Doe, Jane","said ""hi""\nbye"');
});

test('jsonToCsv quotes strings that look like other JSON types', () => {
  const json = JSON.stringify([{ a: '42', b: 'true', c: '', d: 'null', e: 'text' }]);
  assert.equal(jsonToCsv(json), 'a,b,c,d,e\n"42","true","","null",text');
});

test('jsonToCsv honours the delimiter option', () => {
  assert.equal(jsonToCsv('[{"a":"x;y","b":"1,5"}]', { delimiter: ';' }), 'a;b\n"x;y";1,5');
});

test('jsonToCsv warns about empty input', () => {
  assert.throws(() => jsonToCsv('   '), { name: 'ConversionError', message: /JSON box is empty/ });
});

test('jsonToCsv warns about invalid JSON', () => {
  assert.throws(() => jsonToCsv('[{"a":1,}]'), { name: 'ConversionError', message: /^Invalid JSON: / });
});

test('jsonToCsv warns about nested structures', () => {
  assert.throws(() => jsonToCsv('[{"a":1},{"tags":["x"]}]'), {
    name: 'ConversionError',
    message: /Item 2, "tags": nested objects and arrays are not supported/,
  });
  assert.throws(() => jsonToCsv('{"address":{"city":"Paris"}}'), /nested/);
});

test('jsonToCsv warns when the JSON is not made of objects', () => {
  assert.throws(() => jsonToCsv('[1,2]'), /Item 1 is not an object/);
  assert.throws(() => jsonToCsv('"hello"'), /Expected a JSON object or an array/);
  assert.throws(() => jsonToCsv('[]'), /no properties to convert/);
  assert.throws(() => jsonToCsv('[{}]'), /no properties to convert/);
});

test('JSON -> CSV -> JSON round-trips values and their types', () => {
  const rows = [
    { id: 1, name: 'Doe, Jane', score: -2.5, active: true, note: null, code: '007' },
    { id: 2, name: 'He said "no"', score: 0, active: false, note: '', code: 'true' },
    { id: 3, name: 'multi\nline', score: 1e21, active: true, note: ' padded ', code: '42' },
  ];
  for (const delimiter of [',', ';', '\t', '|']) {
    const csv = jsonToCsv(JSON.stringify(rows), { delimiter });
    assert.deepEqual(toRows(csv, { delimiter }), rows);
  }
});
