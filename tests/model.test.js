import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_NAMES, FeatureEngine } from '../src/core/features.js';
import { HedgeEnsemble, LinearExpert, RLS, ZeroExpert } from '../src/core/models.js';
import { gaussian, mulberry32 } from '../src/core/rng.js';
import { generateSynthetic } from '../src/core/synthetic.js';

test('RLS converges to the true coefficients of a linear model', () => {
  const rng = mulberry32(11);
  const rls = new RLS(3, { lambda: 1, delta: 100 });
  for (let i = 0; i < 2000; i++) {
    const x = [1, gaussian(rng), gaussian(rng)];
    rls.update(x, 0.5 + 2 * x[1] - 1 * x[2] + 0.01 * gaussian(rng));
  }
  assert.ok(Math.abs(rls.w[0] - 0.5) < 0.01);
  assert.ok(Math.abs(rls.w[1] - 2) < 0.01);
  assert.ok(Math.abs(rls.w[2] + 1) < 0.01);
});

test('RLS with forgetting tracks a coefficient that changes sign', () => {
  const rng = mulberry32(5);
  const rls = new RLS(1, { lambda: 0.98, delta: 10 });
  for (let i = 0; i < 1000; i++) {
    const x = [gaussian(rng)];
    rls.update(x, (i < 500 ? 1 : -1) * x[0]);
  }
  assert.ok(Math.abs(rls.w[0] + 1) < 0.05);
});

test('FeatureEngine is causal: features at t ignore future bars', () => {
  const bars = generateSynthetic(60, { seed: 2 });
  const truncated = new FeatureEngine();
  const full = new FeatureEngine();
  const xTruncated = bars.slice(0, 40).map((bar) => truncated.push(bar).x);
  const xFull = bars.map((bar) => full.push(bar).x);
  assert.equal(xTruncated[39].length, FEATURE_NAMES.length);
  assert.deepEqual(Array.from(xTruncated[39]), Array.from(xFull[39]));
});

test('FeatureEngine warms up, then returns bounded finite features', () => {
  const engine = new FeatureEngine({ window: 20 });
  const outputs = generateSynthetic(100, { seed: 4 }).map((bar) => engine.push(bar));
  assert.equal(outputs[0].x, null);
  assert.equal(outputs[0].logRet, null);
  assert.ok(outputs[19].x === null && outputs[20].x !== null);
  for (const o of outputs.slice(20)) {
    assert.ok(o.sigma > 0);
    for (const v of o.x) assert.ok(Number.isFinite(v) && Math.abs(v) <= 5);
  }
});

test('Hedge ensemble shifts weight to the expert that predicts well', () => {
  const rng = mulberry32(9);
  const good = new LinearExpert('good', ['ret_0']);
  const ensemble = new HedgeEnsemble([good, new ZeroExpert('zero')], { eta: 1, discount: 0.99 });
  for (let i = 0; i < 800; i++) {
    const x = new Float64Array(FEATURE_NAMES.length);
    x[0] = gaussian(rng);
    ensemble.update(x, 0.8 * x[0] + 0.3 * gaussian(rng));
  }
  const [wGood, wZero] = ensemble.weights();
  assert.ok(wGood > 0.99, `weight of good expert = ${wGood}`);
  assert.ok(Math.abs(wGood + wZero - 1) < 1e-12);
});
