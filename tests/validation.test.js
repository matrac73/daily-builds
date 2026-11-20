import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findDuplicates, formatLaneList, validateSetup, validateStart } from '../src/validation.js';

const lanes = (overrides = {}) =>
  [
    { icon: 'ladybug', name: 'Dot' },
    { icon: 'beetle', name: 'Sprout' },
    { icon: 'bee', name: 'Buzz' },
    { icon: 'firefly', name: 'Flicker' },
  ].map((lane, index) => ({ ...lane, ...overrides[index] }));

test('findDuplicates groups indices of repeated values only', () => {
  assert.deepEqual(findDuplicates(['a', 'b', 'c']), []);
  assert.deepEqual(findDuplicates(['a', 'b', 'a', 'b', 'c']), [[0, 2], [1, 3]]);
  assert.deepEqual(findDuplicates(['x', 'x', 'x']), [[0, 1, 2]]);
});

test('formatLaneList uses 1-based lane numbers', () => {
  assert.equal(formatLaneList([0]), '1');
  assert.equal(formatLaneList([0, 2]), '1 and 3');
  assert.equal(formatLaneList([0, 2, 3]), '1, 3 and 4');
});

test('a unique setup has no warnings and no errors', () => {
  assert.deepEqual(validateSetup(lanes()), { warnings: [], errors: [] });
});

test('a shared icon is a warning, not an error', () => {
  const { warnings, errors } = validateSetup(lanes({ 3: { icon: 'ladybug' } }));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Lanes 1 and 4/);
  assert.deepEqual(errors, []);
});

test('each group of shared icons gets its own warning', () => {
  const { warnings } = validateSetup(lanes({ 1: { icon: 'ladybug' }, 3: { icon: 'bee' } }));
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /Lanes 1 and 2/);
  assert.match(warnings[1], /Lanes 3 and 4/);
});

test('a repeated name is an error, ignoring case and surrounding spaces', () => {
  const { errors } = validateSetup(lanes({ 2: { name: '  dOT ' } }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Lanes 1 and 3/);
  assert.match(errors[0], /“Dot”/);
});

test('blank names are reported per lane and not as duplicates of each other', () => {
  const { errors } = validateSetup(lanes({ 0: { name: '' }, 1: { name: '   ' } }));
  assert.deepEqual(errors, ['Lane 1 needs a name.', 'Lane 2 needs a name.']);
});

test('starting requires a predicted winner', () => {
  const { errors } = validateStart(lanes(), null);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Pick the bug/);
});

test('starting rejects a pick outside the lanes', () => {
  assert.equal(validateStart(lanes(), 4).errors.length, 1);
  assert.equal(validateStart(lanes(), -1).errors.length, 1);
});

test('a valid setup with a pick can start, even with icon warnings', () => {
  const { warnings, errors } = validateStart(lanes({ 1: { icon: 'bee' } }), 0);
  assert.equal(warnings.length, 1);
  assert.deepEqual(errors, []);
});

test('starting reports setup errors together with the missing pick', () => {
  const { errors } = validateStart(lanes({ 1: { name: 'Dot' } }), null);
  assert.equal(errors.length, 2);
});
