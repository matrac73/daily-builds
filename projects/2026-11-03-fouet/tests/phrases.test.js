import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHRASES, createCombo, createPhrasePicker, tierForCombo } from '../src/phrases.js';

test('the gentle tier contains the classics', () => {
  for (const p of ['faster', 'do it', 'make it']) assert.ok(PHRASES[0].includes(p));
});

test('tiers escalate every three hits and cap at the loudest', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 6, 7, 50].map((c) => tierForCombo(c)), [0, 0, 0, 0, 1, 1, 2, 2]);
});

test('picker never repeats the previous phrase', () => {
  const picker = createPhrasePicker({ random: () => 0 });
  let prev = picker.pick(0);
  for (let i = 0; i < 20; i++) {
    const next = picker.pick(0);
    assert.notEqual(next, prev);
    assert.ok(PHRASES[0].includes(next));
    prev = next;
  }
});

test('picker clamps the tier and copes with random() === 1 or single-phrase pools', () => {
  const picker = createPhrasePicker({ phrases: [['only']], random: () => 1 });
  assert.equal(picker.pick(5), 'only');
  assert.equal(picker.pick(-1), 'only');
  const top = createPhrasePicker({ random: () => 0.999999 });
  assert.ok(PHRASES.at(-1).includes(top.pick(99)));
});

test('combo grows within the window and resets after a pause', () => {
  const combo = createCombo({ windowMs: 1000 });
  assert.equal(combo.hit(0), 1);
  assert.equal(combo.hit(900), 2);
  assert.equal(combo.hit(1800), 3);
  assert.equal(combo.hit(3000), 1);
  assert.equal(combo.count, 1);
});
