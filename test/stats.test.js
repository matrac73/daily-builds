import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATS_KEY, emptyStats, categoryStats, recordGame, loadStats, saveStats } from '../src/stats.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    data,
  };
}

test('categoryStats returns defaults for unknown categories', () => {
  assert.deepEqual(categoryStats(emptyStats(), 'x'), { played: 0, answered: 0, correct: 0, bestPct: 0, mistakes: [] });
});

test('recordGame accumulates totals and keeps the best score', () => {
  let stats = recordGame(emptyStats(), 'lc', { total: 9, correct: 6, pct: 67, missedCardIds: ['a'], masteredCardIds: ['b'] });
  stats = recordGame(stats, 'lc', { total: 9, correct: 3, pct: 33, missedCardIds: ['c'], masteredCardIds: [] });
  const lc = categoryStats(stats, 'lc');
  assert.equal(lc.played, 2);
  assert.equal(lc.answered, 18);
  assert.equal(lc.correct, 9);
  assert.equal(lc.bestPct, 67);
  assert.deepEqual(lc.mistakes.sort(), ['a', 'c']);
});

test('mastering a card removes it from the mistakes list', () => {
  let stats = recordGame(emptyStats(), 'cr', { total: 2, correct: 0, pct: 0, missedCardIds: ['a', 'b'], masteredCardIds: [] });
  stats = recordGame(stats, 'cr', { total: 1, correct: 1, pct: 100, missedCardIds: [], masteredCardIds: ['a'] });
  assert.deepEqual(categoryStats(stats, 'cr').mistakes, ['b']);
});

test('recordGame does not mutate the previous stats', () => {
  const before = emptyStats();
  recordGame(before, 'x', { total: 1, correct: 1, pct: 100, missedCardIds: [], masteredCardIds: ['a'] });
  assert.deepEqual(before, emptyStats());
});

test('save and load round-trip through storage', () => {
  const storage = memoryStorage();
  const stats = recordGame(emptyStats(), 'x', { total: 1, correct: 1, pct: 100, missedCardIds: [], masteredCardIds: ['a'] });
  assert.equal(saveStats(storage, stats), true);
  assert.deepEqual(loadStats(storage), stats);
});

test('loadStats falls back to empty stats on missing or corrupted data', () => {
  assert.deepEqual(loadStats(memoryStorage()), emptyStats());
  assert.deepEqual(loadStats(memoryStorage({ [STATS_KEY]: '{not json' })), emptyStats());
  assert.deepEqual(loadStats(memoryStorage({ [STATS_KEY]: '{"categories":null}' })), emptyStats());
  assert.deepEqual(loadStats(undefined), emptyStats());
});

test('saveStats reports failures instead of throwing', () => {
  const storage = { setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.equal(saveStats(storage, emptyStats()), false);
});
