import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clip, corr, mean, ols, quantileSorted, std } from '../src/core/stats.js';
import { gaussian, mulberry32 } from '../src/core/rng.js';

test('mean and sample std', () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5);
  assert.ok(Math.abs(std([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 1e-3);
  assert.equal(std([5]), 0);
});

test('corr is 1, -1 and 0 for degenerate cases', () => {
  assert.ok(Math.abs(corr([1, 2, 3], [2, 4, 6]) - 1) < 1e-12);
  assert.ok(Math.abs(corr([1, 2, 3], [3, 2, 1]) + 1) < 1e-12);
  assert.equal(corr([1, 1, 1], [1, 2, 3]), 0);
});

test('ols recovers alpha and beta of a noiseless line', () => {
  const x = [0.01, -0.02, 0.005, 0.03, -0.01];
  const y = x.map((v) => 0.001 + 0.5 * v);
  const r = ols(y, x);
  assert.ok(Math.abs(r.alpha - 0.001) < 1e-12);
  assert.ok(Math.abs(r.beta - 0.5) < 1e-12);
  assert.ok(Math.abs(r.r2 - 1) < 1e-9);
});

test('quantileSorted interpolates linearly', () => {
  assert.equal(quantileSorted([0, 10], 0.5), 5);
  assert.equal(quantileSorted([1, 2, 3, 4, 5], 0), 1);
  assert.equal(quantileSorted([1, 2, 3, 4, 5], 1), 5);
});

test('clip bounds symmetrically', () => {
  assert.equal(clip(7, 5), 5);
  assert.equal(clip(-7, 5), -5);
  assert.equal(clip(2, 5), 2);
});

test('seeded rng is reproducible and gaussian is roughly standard', () => {
  const a = mulberry32(1);
  const b = mulberry32(1);
  assert.equal(a(), b());
  const rng = mulberry32(3);
  const draws = Array.from({ length: 20000 }, () => gaussian(rng));
  assert.ok(Math.abs(mean(draws)) < 0.03);
  assert.ok(Math.abs(std(draws) - 1) < 0.03);
});
