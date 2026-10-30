import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPnl } from '../src/core/projection.js';
import { fetchKlines, parseKline, parseStreamKline } from '../src/data/binance.js';
import { parseIntraday } from '../src/data/alphavantage.js';
import { parseCsv } from '../src/data/csv.js';

test('projection of a constant return compounds deterministically', () => {
  const { stats, bands } = projectPnl([0.001], { horizon: 100, capital: 1000, paths: 50 });
  const expected = (1.001 ** 100 - 1) * 1000;
  assert.ok(Math.abs(stats.median - expected) < 1e-9);
  assert.equal(stats.probLoss, 0);
  assert.equal(bands.at(-1).step, 100);
  assert.ok(Math.abs(bands.at(-1).p50 - expected) < 1e-9);
});

test('projection bands are ordered and reproducible with a seed', () => {
  const returns = Array.from({ length: 500 }, (_, i) => Math.sin(i) * 0.002 + 0.0001);
  const a = projectPnl(returns, { horizon: 300, paths: 300, seed: 1 });
  const b = projectPnl(returns, { horizon: 300, paths: 300, seed: 1 });
  assert.deepEqual(a.stats, b.stats);
  for (const band of a.bands) {
    assert.ok(band.p05 <= band.p25 && band.p25 <= band.p50 && band.p50 <= band.p75 && band.p75 <= band.p95);
  }
  assert.ok(a.stats.expectedShortfall <= a.stats.p05);
});

test('projection rejects empty input', () => {
  assert.throws(() => projectPnl([], { horizon: 10 }));
});

const ROW = [1700000000000, '100.0', '101.5', '99.5', '101.0', '12.5', 1700000059999, '1262.5', 42, '7.5', '757.5', '0'];

test('parseKline maps the Binance REST row including taker-buy volume', () => {
  assert.deepEqual(parseKline(ROW), {
    time: 1700000000000,
    open: 100,
    high: 101.5,
    low: 99.5,
    close: 101,
    volume: 12.5,
    closeTime: 1700000059999,
    takerBuy: 7.5,
  });
});

test('parseStreamKline exposes the closed flag', () => {
  const msg = { e: 'kline', k: { t: 1, T: 2, o: '1', h: '2', l: '0.5', c: '1.5', v: '10', V: '6', x: true } };
  const { bar, closed } = parseStreamKline(msg);
  assert.equal(closed, true);
  assert.equal(bar.takerBuy, 6);
  assert.equal(bar.close, 1.5);
});

test('fetchKlines pages backwards and drops the still-open bar', async () => {
  const minute = 60_000;
  const now = 10_000 * minute + 30_000; // in the middle of bar #10000
  const calls = [];
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams;
    calls.push(params);
    const limit = Number(params.get('limit'));
    const end = params.has('endTime') ? Number(params.get('endTime')) : now;
    const lastOpen = Math.floor(end / minute) * minute;
    const rows = Array.from({ length: limit }, (_, i) => {
      const t = lastOpen - (limit - 1 - i) * minute;
      return [t, '1', '1', '1', '1', '1', t + minute - 1, '1', 1, '0.5', '0.5', '0'];
    });
    return { ok: true, json: async () => rows };
  };
  const bars = await fetchKlines('btcusdt', '1m', 1500, { fetchImpl, now });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].get('symbol'), 'BTCUSDT');
  assert.equal(bars.length, 1500);
  assert.ok(bars.every((b) => b.closeTime < now));
  for (let i = 1; i < bars.length; i++) assert.equal(bars[i].time - bars[i - 1].time, minute);
});

test('parseIntraday sorts bars and surfaces API errors', () => {
  const json = {
    'Meta Data': {},
    'Time Series (5min)': {
      '2026-10-29 10:05:00': { '1. open': '2', '2. high': '3', '3. low': '1', '4. close': '2.5', '5. volume': '100' },
      '2026-10-29 10:00:00': { '1. open': '1', '2. high': '2', '3. low': '1', '4. close': '2', '5. volume': '50' },
    },
  };
  const bars = parseIntraday(json);
  assert.equal(bars.length, 2);
  assert.ok(bars[0].time < bars[1].time);
  assert.equal(bars[1].close, 2.5);
  assert.throws(() => parseIntraday({ Information: 'rate limit' }), /rate limit/);
});

test('parseCsv handles aliases, separators and close-only files', () => {
  const full = 'Date;Open;High;Low;Close;Volume\n2026-01-02;2;3;1;2.5;10\n2026-01-01;1;2;1;2;5\n';
  const bars = parseCsv(full);
  assert.equal(bars.length, 2);
  assert.equal(bars[0].close, 2);
  assert.equal(bars[1].volume, 10);

  const closeOnly = parseCsv('timestamp,price\n1700000000,10\n1700000060,11');
  assert.equal(closeOnly[0].time, 1700000000000);
  assert.equal(closeOnly[1].high, 11);
  assert.equal(closeOnly[1].volume, 0);

  assert.throws(() => parseCsv('a,b\n1,2'), /requises/);
});
