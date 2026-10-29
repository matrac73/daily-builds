import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mean, std, solve, normalCdf } from '../src/stats.js';
import { sma, ema, rsi, logReturns, momentum, bollingerPercentB, macdHistogram } from '../src/indicators.js';
import { StandardScaler, Ridge, ZeroBaseline, DriftBaseline } from '../src/models.js';
import { syntheticBars, rng } from './helpers.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('mean / std / normalCdf', () => {
  close(mean([1, 2, 3, 4]), 2.5);
  close(std([2, 4, 4, 4, 5, 5, 7, 9]), 2.138089935299395);
  close(normalCdf(0), 0.5, 1e-7);
  close(normalCdf(1.96), 0.9750021, 1e-6);
  close(normalCdf(-1.96), 0.0249979, 1e-6);
});

test('solve handles pivoting and rejects singular systems', () => {
  const x = solve([[0, 2, 1], [1, 1, 1], [2, 1, 0]], [5, 4, 4]);
  [1, 2, 1].forEach((v, i) => close(x[i], v));
  assert.throws(() => solve([[1, 2], [2, 4]], [1, 2]), /Singular/);
});

test('moving averages and returns', () => {
  const v = [1, 2, 3, 4, 5];
  assert.deepEqual(sma(v, 3).slice(2), [2, 3, 4]);
  assert.ok(Number.isNaN(sma(v, 3)[1]));
  close(ema([10, 10, 10], 5)[2], 10);
  close(logReturns([100, 110])[1], Math.log(1.1));
  close(momentum(v, 2)[4], Math.log(5 / 3));
});

test('RSI is bounded and saturates on monotonic series', () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(rsi(up, 14).at(-1), 100);
  const bars = syntheticBars(200, { seed: 3 });
  for (const value of rsi(bars.map((b) => b.close)).filter(Number.isFinite)) {
    assert.ok(value >= 0 && value <= 100);
  }
});

test('indicators never look ahead', () => {
  const closes = syntheticBars(120, { seed: 4 }).map((b) => b.close);
  const shocked = [...closes.slice(0, 80), ...closes.slice(80).map((c) => c * 3)];
  for (const fn of [(x) => rsi(x), (x) => macdHistogram(x), (x) => bollingerPercentB(x), (x) => sma(x, 20)]) {
    const a = fn(closes).slice(0, 80);
    const b = fn(shocked).slice(0, 80);
    assert.deepEqual(a, b);
  }
});

test('StandardScaler uses training statistics and survives constant columns', () => {
  const s = new StandardScaler().fit([[1, 5], [3, 5]]);
  assert.deepEqual(s.transform([[2, 5], [5, 7]]), [[0, 0], [3 / Math.SQRT2, 2]]);
});

test('Ridge recovers a linear relationship and shrinks with lambda', () => {
  const rand = rng(7);
  const X = Array.from({ length: 300 }, () => [rand() - 0.5, rand() - 0.5]);
  const y = X.map(([a, b]) => 0.5 + 2 * a - 3 * b);
  const scaler = new StandardScaler().fit(X);
  const Xs = scaler.transform(X);
  const fitted = new Ridge(1e-6).fit(Xs, y);
  fitted.predict(Xs.slice(0, 5)).forEach((p, i) => close(p, y[i], 1e-6));
  const shrunk = new Ridge(1e4).fit(Xs, y);
  assert.ok(Math.abs(shrunk.weights[0]) < Math.abs(fitted.weights[0]) / 10);
  close(shrunk.intercept, mean(y));
});

test('baselines', () => {
  assert.deepEqual(new ZeroBaseline().fit().predict([[1], [2]]), [0, 0]);
  assert.deepEqual(new DriftBaseline().fit([[0], [0]], [0.01, 0.03]).predict([[9]]), [0.02]);
});
