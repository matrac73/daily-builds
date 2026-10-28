import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDelimiter, mapColumns, normalizeHeader, parseCsv, parseNumber, rowsToDeals, toCsv } from '../src/csv.js';

test('normalizeHeader strips accents, units and punctuation', () => {
  assert.equal(normalizeHeader("Chiffre d'affaires (M€)"), 'chiffredaffaires');
  assert.equal(normalizeHeader('Dette nette [M€]'), 'dettenette');
  assert.equal(normalizeHeader(' Activité '), 'activite');
});

test('detectDelimiter prefers semicolon for French Excel exports', () => {
  assert.equal(detectDelimiter('Nom;CA;EBITDA\nA;1,5;2'), ';');
  assert.equal(detectDelimiter('Name,Revenue\nA,1.5'), ',');
  assert.equal(detectDelimiter('Name\tRevenue\nA\t1'), '\t');
});

test('parseCsv handles quotes, escaped quotes, CRLF, BOM and blank lines', () => {
  const rows = parseCsv('﻿name,desc\r\n"Acme, Inc","He said ""hi"""\r\n\r\nBeta,"multi\nline"\n');
  assert.deepEqual(rows, [
    ['name', 'desc'],
    ['Acme, Inc', 'He said "hi"'],
    ['Beta', 'multi\nline'],
  ]);
});

test('parseNumber understands French and English formats', () => {
  assert.equal(parseNumber('1 234,5'), 1234.5);
  assert.equal(parseNumber('1,234.5'), 1234.5);
  assert.equal(parseNumber('1.234,5'), 1234.5);
  assert.equal(parseNumber('1.234.567'), 1234567);
  assert.equal(parseNumber('12 %'), 12);
  assert.equal(parseNumber('-4,0 M€'), -4);
  assert.equal(parseNumber('(3.5)'), -3.5);
  assert.equal(parseNumber('3.2x'), 3.2);
  assert.equal(parseNumber(7), 7);
  for (const empty of ['', 'n.a.', '-', 'NC', null, undefined, NaN]) assert.equal(parseNumber(empty), null);
});

test('mapColumns recognises French and English aliases', () => {
  const mapping = mapColumns(['Cible', 'Secteur', 'Pays', 'CA (M€)', 'EBE', 'Croissance CA', 'Dette nette', 'Commentaire']);
  assert.deepEqual(mapping, { name: 0, sector: 1, country: 2, revenue: 3, ebitda: 4, growth: 5, netDebt: 6, description: 7 });
  assert.equal(mapColumns(['Foo']).name, -1);
});

test('rowsToDeals builds deals and reports skipped rows', () => {
  const rows = parseCsv('Nom;CA;EBITDA;Croissance\nAlpha;45,2;6,1;12%\n;10;1;2\nGamma;n.a.;1;2\n');
  const { deals, warnings } = rowsToDeals(rows);
  assert.equal(deals.length, 1);
  assert.deepEqual(deals[0], {
    id: 'd1',
    name: 'Alpha',
    sector: '',
    country: '',
    revenue: 45.2,
    ebitda: 6.1,
    growth: 12,
    netDebt: null,
    description: '',
  });
  assert.equal(warnings.length, 2);
});

test('rowsToDeals refuses files without the required columns', () => {
  const { deals, warnings } = rowsToDeals([['Foo', 'Bar'], ['1', '2']]);
  assert.equal(deals.length, 0);
  assert.match(warnings.join(' '), /name/);
  assert.match(warnings.join(' '), /revenue/);
  assert.deepEqual(rowsToDeals([]).deals, []);
});

test('toCsv escapes separators and quotes, and round-trips through parseCsv', () => {
  const columns = [
    { label: 'Name', value: (r) => r.name },
    { label: 'Score', value: (r) => r.score },
  ];
  const csv = toCsv([{ name: 'A; "B"', score: 90 }, { name: 'C', score: null }], columns);
  assert.equal(csv, 'Name;Score\r\n"A; ""B""";90\r\nC;');
  assert.deepEqual(parseCsv(csv), [['Name', 'Score'], ['A; "B"', '90'], ['C', '']]);
});
