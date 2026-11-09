import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_SIZE,
  createTable,
  deleteColumn,
  deleteRow,
  fromRows,
  insertColumn,
  insertRow,
  resizeTable,
  setCell,
  setColumnAlign,
  setTableAlign,
} from '../src/table.js';

const sample = () =>
  fromRows([
    ['Name', 'Age'],
    ['Ada', '36'],
    ['Linus', '54'],
  ]);

test('createTable builds an empty grid with default alignment', () => {
  assert.deepEqual(createTable(2, 3), {
    rows: [
      ['', '', ''],
      ['', '', ''],
    ],
    aligns: ['none', 'none', 'none'],
  });
});

test('createTable clamps invalid and out-of-range sizes', () => {
  const tiny = createTable(0, 'abc');
  assert.equal(tiny.rows.length, 1);
  assert.equal(tiny.aligns.length, 1);
  const huge = createTable(1000, 2.9);
  assert.equal(huge.rows.length, MAX_SIZE);
  assert.equal(huge.aligns.length, 2);
});

test('fromRows pads ragged rows and sanitises alignments', () => {
  const table = fromRows([['a'], ['b', 'c', 'd']], ['left', 'bogus']);
  assert.deepEqual(table.rows, [
    ['a', '', ''],
    ['b', 'c', 'd'],
  ]);
  assert.deepEqual(table.aligns, ['left', 'none', 'none']);
});

test('resizeTable keeps the content that still fits', () => {
  const resized = resizeTable(sample(), 2, 3);
  assert.deepEqual(resized.rows, [
    ['Name', 'Age', ''],
    ['Ada', '36', ''],
  ]);
  assert.deepEqual(resized.aligns, ['none', 'none', 'none']);
});

test('setCell updates a single cell without mutating the input', () => {
  const original = sample();
  const updated = setCell(original, 1, 1, '37');
  assert.equal(updated.rows[1][1], '37');
  assert.equal(original.rows[1][1], '36');
  assert.throws(() => setCell(original, 5, 0, 'x'), RangeError);
});

test('insertRow inserts an empty row at the given position', () => {
  const table = insertRow(sample(), 1);
  assert.deepEqual(table.rows[1], ['', '']);
  assert.deepEqual(table.rows[2], ['Ada', '36']);
  assert.equal(insertRow(sample(), 3).rows.length, 4, 'can append at the end');
  assert.throws(() => insertRow(sample(), 4), RangeError);
});

test('deleteRow removes a row but never the last one', () => {
  assert.deepEqual(deleteRow(sample(), 1).rows, [
    ['Name', 'Age'],
    ['Linus', '54'],
  ]);
  const single = createTable(1, 2);
  assert.equal(deleteRow(single, 0), single);
});

test('insertColumn inserts an empty column with default alignment', () => {
  const table = insertColumn(setTableAlign(sample(), 'right'), 1);
  assert.deepEqual(table.rows[0], ['Name', '', 'Age']);
  assert.deepEqual(table.aligns, ['right', 'none', 'right']);
});

test('deleteColumn removes a column and its alignment but never the last one', () => {
  const table = deleteColumn(setColumnAlign(sample(), 0, 'center'), 0);
  assert.deepEqual(table.rows, [['Age'], ['36'], ['54']]);
  assert.deepEqual(table.aligns, ['none']);
  assert.equal(deleteColumn(table, 0), table);
});

test('insertions stop at MAX_SIZE', () => {
  const full = createTable(MAX_SIZE, MAX_SIZE);
  assert.equal(insertRow(full, 0), full);
  assert.equal(insertColumn(full, 0), full);
});

test('alignment setters validate their input', () => {
  assert.deepEqual(setColumnAlign(sample(), 1, 'right').aligns, ['none', 'right']);
  assert.deepEqual(setTableAlign(sample(), 'center').aligns, ['center', 'center']);
  assert.throws(() => setTableAlign(sample(), 'justify'), TypeError);
  assert.throws(() => setColumnAlign(sample(), 2, 'left'), RangeError);
});
