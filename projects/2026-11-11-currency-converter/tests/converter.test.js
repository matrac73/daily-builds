import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AmountError,
  convert,
  formatAmount,
  formatRate,
  listCurrencies,
  parseAmount,
  roundToCents,
} from '../src/converter.js';

const RATES = { EUR: 1, USD: 1.25, GBP: 0.8, JPY: 160 };

test('parseAmount accepts integers and decimals', () => {
  assert.deepEqual(parseAmount('100'), { ok: true, value: 100 });
  assert.deepEqual(parseAmount(' 12.5 '), { ok: true, value: 12.5 });
  assert.deepEqual(parseAmount('.5'), { ok: true, value: 0.5 });
  assert.deepEqual(parseAmount('7.'), { ok: true, value: 7 });
});

test('parseAmount accepts a comma as decimal separator', () => {
  assert.deepEqual(parseAmount('3,75'), { ok: true, value: 3.75 });
});

test('parseAmount reports empty input separately from invalid input', () => {
  assert.deepEqual(parseAmount(''), { ok: false, error: AmountError.EMPTY });
  assert.deepEqual(parseAmount('   '), { ok: false, error: AmountError.EMPTY });
  assert.deepEqual(parseAmount(null), { ok: false, error: AmountError.EMPTY });
});

test('parseAmount rejects anything that is not a plain positive number', () => {
  for (const raw of ['abc', '12a', '1.2.3', '1,2,3', '-5', '1e3', '.', ',', '1 000', '$10']) {
    assert.deepEqual(parseAmount(raw), { ok: false, error: AmountError.NOT_A_NUMBER }, raw);
  }
});

test('parseAmount allows up to 9 digits and rejects more', () => {
  assert.deepEqual(parseAmount('123456789'), { ok: true, value: 123456789 });
  assert.deepEqual(parseAmount('1234567.89'), { ok: true, value: 1234567.89 });
  assert.deepEqual(parseAmount('1234567890'), { ok: false, error: AmountError.TOO_MANY_DIGITS });
  assert.deepEqual(parseAmount('12345678.90'), { ok: false, error: AmountError.TOO_MANY_DIGITS });
});

test('convert handles conversions from, to and across the base currency', () => {
  assert.equal(convert(100, 'EUR', 'USD', RATES), 125);
  assert.equal(convert(125, 'USD', 'EUR', RATES), 100);
  assert.equal(convert(100, 'USD', 'GBP', RATES), 64);
});

test('convert returns the same amount for identical currencies', () => {
  assert.equal(convert(42.42, 'JPY', 'JPY', RATES), 42.42);
});

test('convert throws on unknown currencies', () => {
  assert.throws(() => convert(1, 'XXX', 'USD', RATES), /Unknown currency: XXX/);
  assert.throws(() => convert(1, 'USD', 'XXX', RATES), /Unknown currency: XXX/);
});

test('roundToCents rounds to two decimals without float drift', () => {
  assert.equal(roundToCents(1.005), 1.01);
  assert.equal(roundToCents(2.675), 2.68);
  assert.equal(roundToCents(1.004), 1);
  assert.equal(roundToCents(0), 0);
  assert.equal(roundToCents(0.1 + 0.2), 0.3);
  assert.equal(roundToCents(0.0000001), 0);
  assert.equal(roundToCents(123456789 * 20255.34), 2500659236503.26);
});

test('formatAmount always shows two decimals with grouping', () => {
  assert.equal(formatAmount(1234.5), '1,234.50');
  assert.equal(formatAmount(0), '0.00');
  assert.equal(formatAmount(1.005), '1.01');
  assert.equal(formatAmount(1234.5, 'de-DE'), '1.234,50');
});

test('formatRate keeps six significant digits at any magnitude', () => {
  assert.equal(formatRate(1), '1');
  assert.equal(formatRate(0.891742134), '0.891742');
  assert.equal(formatRate(0.00563761), '0.00563761');
  assert.equal(formatRate(18063.44), '18,063.4');
  assert.equal(formatRate(1500), '1,500');
});

test('listCurrencies returns codes sorted alphabetically with readable names', () => {
  const currencies = listCurrencies(RATES);
  assert.deepEqual(currencies.map((c) => c.code), ['EUR', 'GBP', 'JPY', 'USD']);
  assert.equal(currencies[0].name, 'Euro');
  assert.equal(currencies[3].name, 'US Dollar');
});
