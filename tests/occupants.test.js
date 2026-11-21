import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arrivalDelayMs, randomArrival } from '../src/occupants.js';

/** Deterministic stand-in for Math.random that replays the given values. */
const sequence = (...values) => {
  let index = 0;
  return () => values[index++ % values.length];
};

test('occupants on the ground floor always want to go up', () => {
  assert.deepEqual(randomArrival(4, sequence(0)), { floor: 1, direction: 'up' });
});

test('occupants on the top floor always want to go down', () => {
  assert.deepEqual(randomArrival(4, sequence(0.99)), { floor: 4, direction: 'down' });
});

test('occupants on middle floors go either way', () => {
  assert.deepEqual(randomArrival(4, sequence(0.3, 0.2)), { floor: 2, direction: 'up' });
  assert.deepEqual(randomArrival(4, sequence(0.6, 0.8)), { floor: 3, direction: 'down' });
});

test('random arrivals always match an existing call button', () => {
  for (let i = 0; i < 500; i += 1) {
    const { floor, direction } = randomArrival(4);
    assert.ok(floor >= 1 && floor <= 4);
    assert.notDeepEqual({ floor, direction }, { floor: 1, direction: 'down' });
    assert.notDeepEqual({ floor, direction }, { floor: 4, direction: 'up' });
  }
});

test('randomArrival rejects buildings without at least two floors', () => {
  assert.throws(() => randomArrival(1), RangeError);
});

test('arrivalDelayMs converts seconds and clamps to the allowed range', () => {
  assert.equal(arrivalDelayMs(8), 8000);
  assert.equal(arrivalDelayMs('2.5'), 2500);
  assert.equal(arrivalDelayMs(0.2), 1000);
  assert.equal(arrivalDelayMs(999), 120_000);
});

test('arrivalDelayMs switches arrivals off for zero, empty or invalid input', () => {
  assert.equal(arrivalDelayMs(0), null);
  assert.equal(arrivalDelayMs(''), null);
  assert.equal(arrivalDelayMs(-3), null);
  assert.equal(arrivalDelayMs('soon'), null);
});
