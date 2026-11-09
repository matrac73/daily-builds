import { test } from 'node:test';
import assert from 'node:assert/strict';

import { escapeCell, parseMarkdownTable, toMarkdown } from '../src/markdown.js';
import { createTable, fromRows } from '../src/table.js';

const people = () =>
  fromRows(
    [
      ['Name', 'Age', 'City'],
      ['Ada', '36', 'London'],
      ['Linus', '54', 'Helsinki'],
    ],
    ['left', 'right', 'center'],
  );

test('escapeCell escapes pipes, converts line breaks and trims', () => {
  assert.equal(escapeCell('  a|b  '), 'a\\|b');
  assert.equal(escapeCell('line 1\nline 2\r\nline 3'), 'line 1<br>line 2<br>line 3');
});

test('toMarkdown pretty-prints aligned columns', () => {
  assert.equal(
    toMarkdown(people()),
    [
      '| Name  | Age |   City   |',
      '| :---- | --: | :------: |',
      '| Ada   |  36 |  London  |',
      '| Linus |  54 | Helsinki |',
    ].join('\n'),
  );
});

test('toMarkdown compact mode skips padding', () => {
  assert.equal(
    toMarkdown(people(), { pretty: false }),
    [
      '| Name | Age | City |',
      '| :-- | --: | :-: |',
      '| Ada | 36 | London |',
      '| Linus | 54 | Helsinki |',
    ].join('\n'),
  );
});

test('toMarkdown handles an empty table and a header-only table', () => {
  assert.equal(toMarkdown(createTable(1, 2)), '|     |     |\n| --- | --- |');
});

test('toMarkdown measures width in code points, not UTF-16 units', () => {
  const md = toMarkdown(fromRows([['🙂🙂🙂🙂'], ['x']]));
  assert.equal(md.split('\n')[2], '| x    |');
});

test('parseMarkdownTable reads cells and alignments', () => {
  const table = parseMarkdownTable(toMarkdown(people()));
  assert.deepEqual(table, people());
});

test('parseMarkdownTable round-trips escaped pipes', () => {
  const original = fromRows([['a|b', 'c\\|d'], ['|', '']]);
  assert.deepEqual(parseMarkdownTable(toMarkdown(original)), original);
});

test('parseMarkdownTable accepts tables without outer pipes and ragged rows', () => {
  const table = parseMarkdownTable('Some text\n\nA | B\n--- | :---:\n1\n2 | 3 | 4\n\nafter');
  assert.deepEqual(table, {
    rows: [
      ['A', 'B'],
      ['1', ''],
      ['2', '3'],
    ],
    aligns: ['none', 'center'],
  });
});

test('parseMarkdownTable returns null when there is no table', () => {
  assert.equal(parseMarkdownTable(''), null);
  assert.equal(parseMarkdownTable('just | text\nno delimiter'), null);
  assert.equal(parseMarkdownTable('| a | b |\n| --- |'), null);
});
