import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FALLBACK_RATES, RATES_URL, loadRates, normalizeRates } from '../src/rates.js';

const PAYLOAD = { amount: 1, base: 'EUR', date: '2026-11-10', rates: { USD: 1.12, GBP: 0.83 } };

const respondWith = (body, ok = true, status = 200) => async () => ({
  ok,
  status,
  json: async () => body,
});

test('normalizeRates adds the base currency with a rate of 1', () => {
  assert.deepEqual(normalizeRates(PAYLOAD), {
    base: 'EUR',
    date: '2026-11-10',
    rates: { EUR: 1, USD: 1.12, GBP: 0.83 },
  });
});

test('normalizeRates drops unusable rates', () => {
  const payload = { ...PAYLOAD, rates: { USD: 1.12, BAD: 'x', ZERO: 0, NEG: -2 } };
  assert.deepEqual(normalizeRates(payload).rates, { EUR: 1, USD: 1.12 });
});

test('normalizeRates rejects malformed payloads', () => {
  assert.throws(() => normalizeRates(null), TypeError);
  assert.throws(() => normalizeRates({ base: 'EUR', date: '2026-11-10' }), TypeError);
  assert.throws(() => normalizeRates({ base: 'EUR', date: '2026-11-10', rates: {} }), TypeError);
});

test('loadRates returns live rates from the API', async () => {
  let requested;
  const fetchFn = async (url) => {
    requested = url;
    return respondWith(PAYLOAD)();
  };
  const result = await loadRates(fetchFn);
  assert.equal(requested, RATES_URL);
  assert.equal(result.live, true);
  assert.equal(result.date, '2026-11-10');
  assert.equal(result.rates.USD, 1.12);
});

test('loadRates falls back to the bundled snapshot on network failure', async () => {
  const result = await loadRates(async () => {
    throw new Error('offline');
  });
  assert.equal(result.live, false);
  assert.equal(result.rates, FALLBACK_RATES.rates);
});

test('loadRates falls back on HTTP errors and malformed payloads', async () => {
  assert.equal((await loadRates(respondWith({}, false, 500))).live, false);
  assert.equal((await loadRates(respondWith({ nope: true }))).live, false);
});

test('the bundled snapshot is a valid, base-inclusive rate table', () => {
  assert.equal(FALLBACK_RATES.rates[FALLBACK_RATES.base], 1);
  assert.ok(Object.keys(FALLBACK_RATES.rates).length >= 30);
  for (const rate of Object.values(FALLBACK_RATES.rates)) assert.ok(rate > 0);
});
