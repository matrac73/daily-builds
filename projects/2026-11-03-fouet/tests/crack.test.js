import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCrackDetector, crackIntensity } from '../src/crack.js';

test('fires once on the rising edge above the threshold', () => {
  const d = createCrackDetector({ threshold: 1000 });
  assert.equal(d.update(500, 0), false);
  assert.equal(d.update(1200, 16), true);
  assert.equal(d.update(1500, 32), false);
  assert.equal(d.update(1100, 48), false);
});

test('re-arms only after the tip slows down', () => {
  const d = createCrackDetector({ threshold: 1000, rearmRatio: 0.5, cooldownMs: 0 });
  assert.equal(d.update(1200, 0), true);
  assert.equal(d.update(600, 16), false); // still above 500: not re-armed
  assert.equal(d.update(1200, 32), false);
  assert.equal(d.update(400, 48), false); // re-armed
  assert.equal(d.update(1200, 64), true);
});

test('respects the cooldown even when re-armed', () => {
  const d = createCrackDetector({ threshold: 1000, cooldownMs: 200 });
  assert.equal(d.update(1200, 0), true);
  d.update(0, 50);
  assert.equal(d.update(1200, 100), false);
  assert.equal(d.update(1200, 250), true);
});

test('crack intensity is 0 at threshold and saturates at 1', () => {
  assert.equal(crackIntensity(800, 1000), 0);
  assert.equal(crackIntensity(1000, 1000), 0);
  assert.equal(crackIntensity(1750, 1000), 0.5);
  assert.equal(crackIntensity(99999, 1000), 1);
});
