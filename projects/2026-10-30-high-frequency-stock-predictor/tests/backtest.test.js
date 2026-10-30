import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Strategy, decidePosition, oneWayCost, runBacktest } from '../src/core/strategy.js';
import { computeMetrics, equityCurve, maxDrawdown } from '../src/core/metrics.js';
import { breakEvenCost, costLevelsFor, costSensitivity } from '../src/core/analysis.js';
import { calendar, inferIntervalMinutes } from '../src/core/markets.js';
import { generateSynthetic } from '../src/core/synthetic.js';

const YEAR = 98_280;

test('oneWayCost adds fee, half spread and slippage', () => {
  assert.equal(oneWayCost({ feeBps: 10, spreadBps: 2, slippageBps: 1 }), 0.0012);
  assert.equal(oneWayCost(), 0);
});

test('decidePosition: enter beyond the threshold, hold inside the band, exit when the edge flips', () => {
  assert.equal(decidePosition(0, 0.002, 0.001, true), 1);
  assert.equal(decidePosition(0, -0.002, 0.001, true), -1);
  assert.equal(decidePosition(0, -0.002, 0.001, false), 0);
  assert.equal(decidePosition(1, -0.002, 0.001, false), 0);
  assert.equal(decidePosition(1, 0.0005, 0.001, true), 1);
  assert.equal(decidePosition(-1, -0.0005, 0.001, true), -1);
  assert.equal(decidePosition(1, -0.0005, 0.001, true), 0);
  assert.equal(decidePosition(-1, 0, 0.001, true), 0);
});

test('equity curve and max drawdown', () => {
  const eq = equityCurve([0.1, -0.5, 0.2]);
  assert.ok(Math.abs(eq[2] - 0.66) < 1e-12);
  assert.ok(Math.abs(maxDrawdown([1, ...eq]) - 0.5) < 1e-12);
});

test('accounting: net = position(t-1) * return(t) - |trade| * cost', () => {
  const bars = generateSynthetic(400, { seed: 3 });
  const cost = oneWayCost({ feeBps: 1 });
  const { records } = runBacktest(bars, { costs: { feeBps: 1 }, warmup: 50 });
  for (let i = 1; i < records.length; i++) {
    const r = records[i];
    const prev = records[i - 1].position;
    const expectedBench = bars[i].close / bars[i - 1].close - 1;
    assert.ok(Math.abs(r.benchRet - expectedBench) < 1e-12);
    assert.ok(Math.abs(r.grossRet - prev * expectedBench) < 1e-15);
    assert.ok(Math.abs(r.cost - Math.abs(r.position - prev) * cost) < 1e-15);
    assert.ok(Math.abs(r.netRet - (r.grossRet - r.cost)) < 1e-15);
  }
  assert.ok(records.slice(0, 50).every((r) => r.position === 0));
});

test('no look-ahead: the decision at t is identical whatever happens after t', () => {
  const bars = generateSynthetic(600, { seed: 8 });
  const altered = bars.map((b, i) => (i > 400 ? { ...b, close: b.close * 1.5, high: b.high * 1.5 } : b));
  for (const horizon of [1, 5, 15]) {
    const a = runBacktest(bars, { horizon }).records.slice(0, 401);
    const b = runBacktest(altered, { horizon }).records.slice(0, 401);
    assert.deepEqual(
      a.map((r) => [r.position, r.pred]),
      b.map((r) => [r.position, r.pred]),
    );
  }
});

test('the online model extracts alpha from a market with a real signal', () => {
  const bars = generateSynthetic(6000, { seed: 7, signal: 0.2 });
  const { records } = runBacktest(bars, { costs: { feeBps: 0.5 } });
  const m = computeMetrics(records, { barsPerYear: YEAR });
  assert.ok(m.ic > 0.05, `IC = ${m.ic}`);
  assert.ok(m.alphaPerBar > 0 && m.alphaT > 2, `alpha t-stat = ${m.alphaT}`);
  assert.ok(m.totalReturn > 0);
});

test('higher costs mean fewer trades (cost-aware threshold)', () => {
  const bars = generateSynthetic(3000, { seed: 7 });
  const sweep = costSensitivity(bars, {}, [0, 2, 20], { barsPerYear: YEAR });
  assert.ok(sweep[0].trades > sweep[1].trades && sweep[1].trades >= sweep[2].trades);
  assert.ok(sweep[0].totalReturn > sweep[2].totalReturn);
});

test('costLevelsFor includes the current cost exactly once, sorted', () => {
  const levels = costLevelsFor({ feeBps: 10, spreadBps: 1, slippageBps: 1 });
  assert.ok(levels.includes(11.5));
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  assert.equal(new Set(levels).size, levels.length);
});

test('breakEvenCost interpolates the zero crossing of net return', () => {
  const sweep = [
    { bps: 0, totalReturn: 0.2 },
    { bps: 2, totalReturn: 0.1 },
    { bps: 4, totalReturn: -0.1 },
  ];
  assert.equal(breakEvenCost(sweep), 3);
  assert.equal(breakEvenCost([{ bps: 0, totalReturn: -0.01 }]), null);
  assert.equal(breakEvenCost([{ bps: 0, totalReturn: 0.1 }, { bps: 5, totalReturn: 0.05 }]), Infinity);
});

test('inferIntervalMinutes uses the median gap, robust to session breaks', () => {
  const t = [0, 5, 10, 15, 1000, 1005, 1010].map((m) => ({ time: m * 60_000 }));
  assert.equal(inferIntervalMinutes(t), 5);
  assert.equal(inferIntervalMinutes([{ time: 0 }]), 1);
});

test('computeMetrics returns null without enough tradable bars', () => {
  const s = new Strategy({ warmup: 1000 });
  const records = generateSynthetic(50).map((b) => s.step(b));
  assert.equal(computeMetrics(records, { barsPerYear: YEAR }), null);
});

test('calendar: crypto trades 24/7, stocks 6.5h x 5 days', () => {
  assert.equal(calendar('crypto', 1).barsPerWeek, 10_080);
  assert.equal(calendar('stock', 1).barsPerWeek, 1_950);
  assert.equal(calendar('stock', 5).barsPerYear, 19_656);
});
