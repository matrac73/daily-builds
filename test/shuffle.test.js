import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHUFFLE_DURATION_MS,
  SPEEDS,
  applySwap,
  applySwaps,
  planShuffle,
  randomSwap,
  swapCount,
} from '../src/shuffle.js';

/** Deterministic RNG cycling through the given values. */
const sequence = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('randomSwap always returns two distinct, valid slots', () => {
  const samples = [0, 0.2, 0.34, 0.5, 0.67, 0.99];
  for (const first of samples) {
    for (const second of samples) {
      const [a, b] = randomSwap(sequence(first, second));
      assert.notEqual(a, b);
      assert.ok([0, 1, 2].includes(a) && [0, 1, 2].includes(b));
    }
  }
});

test('randomSwap can produce every unordered pair of slots', () => {
  const pairs = new Set();
  for (const first of [0, 0.5, 0.9]) {
    for (const second of [0, 0.9]) {
      pairs.add(randomSwap(sequence(first, second)).sort().join('-'));
    }
  }
  assert.deepEqual([...pairs].sort(), ['0-1', '0-2', '1-2']);
});

test('swapCount fills the shuffle duration', () => {
  assert.equal(swapCount(500), SHUFFLE_DURATION_MS / 500);
  assert.equal(swapCount(450, 5000), 11);
  assert.equal(swapCount(10_000, 5000), 1, 'at least one swap');
  assert.throws(() => swapCount(0), RangeError);
});

test('every speed setting shuffles for about five seconds', () => {
  for (const ms of Object.values(SPEEDS)) {
    const total = swapCount(ms) * ms;
    assert.ok(Math.abs(total - SHUFFLE_DURATION_MS) <= ms / 2, `${ms}ms swaps -> ${total}ms`);
  }
});

test('planShuffle returns the right number of swaps', () => {
  const swaps = planShuffle(SPEEDS.classic, Math.random);
  assert.equal(swaps.length, swapCount(SPEEDS.classic));
  for (const [a, b] of swaps) assert.notEqual(a, b);
});

test('applySwap exchanges two slots without mutating the input', () => {
  const order = [0, 1, 2];
  assert.deepEqual(applySwap(order, [0, 2]), [2, 1, 0]);
  assert.deepEqual(order, [0, 1, 2]);
});

test('applySwaps applies swaps in sequence and keeps a permutation', () => {
  assert.deepEqual(applySwaps([0, 1, 2], [[0, 1], [1, 2]]), [1, 2, 0]);
  assert.deepEqual(applySwaps([0, 1, 2], []), [0, 1, 2]);

  const shuffled = applySwaps([0, 1, 2], planShuffle(100));
  assert.deepEqual([...shuffled].sort(), [0, 1, 2]);
});
