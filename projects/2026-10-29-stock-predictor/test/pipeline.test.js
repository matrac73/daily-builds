import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset, FEATURE_NAMES } from '../src/features.js';
import { walkForwardSplits, forecastMetrics, backtest, alphaBeta } from '../src/validation.js';
import { hasEdge, clipReturn, position } from '../src/rules.js';
import { runPipeline, selectLambda } from '../src/pipeline.js';
import { syntheticBars } from './helpers.js';

test('dataset rows are point-in-time and targets are next-day log returns', () => {
  const bars = syntheticBars(200, { seed: 2 });
  const full = buildDataset(bars);
  assert.equal(full.names, FEATURE_NAMES);
  assert.equal(full.X[0].length, FEATURE_NAMES.length);
  assert.equal(full.y.at(-1), null);
  assert.equal(full.dates.at(-1), bars.at(-1).date);

  const i = 10;
  const t = bars.findIndex((b) => b.date === full.dates[i]);
  assert.ok(Math.abs(full.y[i] - Math.log(bars[t + 1].close / bars[t].close)) < 1e-12);

  // Features computed on a truncated history must equal those computed with the future present.
  const partial = buildDataset(bars.slice(0, 150));
  partial.X.forEach((row, k) => assert.deepEqual(row, full.X[k]));
});

test('market and sentiment inputs are aligned by date', () => {
  const bars = syntheticBars(120, { seed: 5 });
  const market = syntheticBars(120, { seed: 6 }).filter((_, i) => i % 7 !== 3); // missing days are forward-filled
  const sentiment = new Map([[bars[100].date, { score: 0.8, count: 3 }]]);
  const ds = buildDataset(bars, { market, sentiment });
  const col = (name) => ds.X.map((r) => r[FEATURE_NAMES.indexOf(name)]);
  const at = ds.dates.indexOf(bars[100].date);
  assert.equal(col('news_sentiment')[at], 0.4);
  assert.equal(col('news_sentiment')[at + 1], 0.2); // decays on news-free days
  assert.equal(col('news_sentiment')[at - 1], 0); // no leakage backwards
  assert.ok(col('mkt_ret_1d').some((v) => v !== 0));
});

test('walk-forward splits are ordered, contiguous and leak-free', () => {
  const splits = walkForwardSplits(100, { minTrain: 50, testSize: 20 });
  assert.deepEqual(splits, [
    { trainEnd: 50, testEnd: 70 },
    { trainEnd: 70, testEnd: 90 },
    { trainEnd: 90, testEnd: 100 },
  ]);
  assert.throws(() => walkForwardSplits(10, { minTrain: 0, testSize: 1 }));
});

test('forecast metrics', () => {
  const m = forecastMetrics([0.01, -0.02, 0.03, 0], [0.02, -0.01, -0.01, 0.01]);
  assert.equal(m.n, 4);
  assert.ok(Math.abs(m.mae - 0.0175) < 1e-12);
  assert.equal(m.hitRate, 2 / 3);
  const perfect = forecastMetrics([0.01, -0.02], [0.01, -0.02]);
  assert.equal(perfect.r2oos, 1);
});

test('backtest applies positions and costs', () => {
  const r = [0.01, -0.02, 0.03];
  const free = backtest(r, [1, -1, 0]);
  assert.ok(Math.abs(free.strategyReturn - Math.expm1(0.03)) < 1e-12);
  assert.equal(free.trades, 3);
  assert.ok(backtest(r, [1, -1, 0], 0.001).strategyReturn < free.strategyReturn);
  assert.ok(Math.abs(free.buyHoldReturn - Math.expm1(0.02)) < 1e-12);
  assert.ok(Math.abs(free.excessReturn - (free.strategyReturn - free.buyHoldReturn)) < 1e-12);
});

test('alphaBeta recovers Jensen alpha and beta', () => {
  const bench = [0.01, -0.02, 0.015, 0.003, -0.007, 0.012];
  const strat = bench.map((r) => 0.5 * r + 0.001);
  const { alpha, beta } = alphaBeta(strat, bench);
  assert.ok(Math.abs(beta - 0.5) < 1e-12);
  assert.ok(Math.abs(alpha - 0.001 * 252) < 1e-12);
  assert.deepEqual(alphaBeta([0.01], [0.02]), { alpha: 0, beta: 0 });
  assert.equal(alphaBeta([0.01, 0.01], [0, 0]).beta, 0); // flat benchmark: no beta, alpha = mean return
});

test('rules: edge gating, clipping and hurdle', () => {
  assert.equal(hasEdge({ n: 100, r2oos: 0.01, hitRate: 0.55 }).ok, true);
  const no = hasEdge({ n: 10, r2oos: -0.01, hitRate: 0.48 });
  assert.equal(no.ok, false);
  assert.equal(no.reasons.length, 3);
  assert.equal(clipReturn(0.1, 0.01), 0.02);
  assert.equal(clipReturn(-0.1, 0.01), -0.02);
  const opts = { threshold: 0.002, cost: 0.0005 };
  assert.equal(position(0.004, opts), 1);
  assert.equal(position(-0.004, opts), -1);
  assert.equal(position(0.0025, opts), 0);
});

test('selectLambda prefers heavy shrinkage on pure noise', () => {
  const ds = buildDataset(syntheticBars(400, { seed: 8 }));
  const { lambda, scores } = selectLambda(ds.X.slice(0, -1), ds.y.slice(0, -1), {
    lambdas: [0.01, 10000], innerFolds: 4, winsorize: 4,
  });
  assert.equal(scores.length, 2);
  assert.equal(lambda, 10000);
});

test('pipeline finds a real edge on autocorrelated returns', () => {
  const bars = syntheticBars(700, { phi: 0.35, seed: 11 });
  const result = runPipeline(bars);
  const { model, zero } = result.evaluation.metrics;
  assert.ok(model.r2oos > 0.05, `r2oos ${model.r2oos}`);
  assert.ok(model.rmse < zero.rmse);
  assert.ok(model.hitRate > 0.55);
  assert.equal(result.edge.ok, true);
  // Strong positive autocorrelation: the forecast follows the sign of the last return.
  const lastRet = Math.log(bars.at(-1).close / bars.at(-2).close);
  assert.equal(Math.sign(result.forecast.expectedReturn), Math.sign(lastRet));
  assert.equal(result.model.weights[0].name, 'ret_1d');
  const f = result.forecast;
  assert.ok(f.lower < f.predictedClose && f.predictedClose < f.upper);

  // 95% / 50% / 25% intervals are nested around the forecast, the 95% one matching lower/upper.
  assert.deepEqual(f.intervals.map((i) => i.level), [0.95, 0.5, 0.25]);
  assert.ok(Math.abs(f.intervals[0].lower - f.lower) / f.lower < 1e-5);
  for (let k = 1; k < f.intervals.length; k++) {
    assert.ok(f.intervals[k].lower > f.intervals[k - 1].lower && f.intervals[k].upper < f.intervals[k - 1].upper);
    assert.ok(f.intervals[k].lower < f.predictedClose && f.predictedClose < f.intervals[k].upper);
  }

  // Every algorithm gets an alpha; a real timing edge shows up as positive alpha for the model only.
  const s = result.evaluation.strategies;
  assert.equal(result.evaluation.backtest, s.model);
  assert.ok(s.model.alpha > 0.1, `alpha ${s.model.alpha}`);
  assert.ok(Math.abs(s.model.beta) < 0.3);
  assert.ok(Math.abs(s.buyHold.alpha) < 0.01 && Math.abs(s.buyHold.beta - 1) < 0.01); // only the entry cost differs
  assert.equal(s.zero.strategyReturn, 0);
  assert.equal(s.zero.trades, 0);
  assert.ok(Math.abs(s.zero.excessReturn + s.zero.buyHoldReturn) < 1e-12);
});

test('pipeline falls back to the random walk when there is no edge', () => {
  const result = runPipeline(syntheticBars(600, { phi: 0, seed: 21 }));
  assert.equal(result.edge.ok, false);
  assert.equal(result.forecast.expectedReturn, 0);
  assert.equal(result.forecast.signal, 'HOLD');
  assert.equal(result.forecast.predictedClose, result.lastClose);
  assert.ok(result.forecast.reasons.length > 0);
  assert.ok(Math.abs(result.evaluation.metrics.model.r2oos) < 0.05);
});

test('pipeline rejects too-short histories', () => {
  assert.throws(() => runPipeline(syntheticBars(200)), /Not enough history/);
});
