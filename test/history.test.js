import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_ATTEMPTS,
  clearHistory,
  loadHistory,
  memoryStorage,
  recordAttempt,
  statsFor,
} from '../src/history.js';

function summary(overrides = {}) {
  return {
    quizId: 'javascript',
    title: 'JavaScript',
    correct: 6,
    total: 8,
    percent: 75,
    passed: true,
    durationMs: 60_000,
    finishedAt: 1_000,
    review: [{ prompt: 'not persisted' }],
    ...overrides,
  };
}

test('history starts empty', () => {
  assert.deepEqual(loadHistory(memoryStorage()), []);
});

test('recordAttempt persists attempts in order, without the review', () => {
  const storage = memoryStorage();
  recordAttempt(storage, summary({ finishedAt: 1 }));
  const returned = recordAttempt(storage, summary({ quizId: 'css', finishedAt: 2 }));

  const history = loadHistory(storage);
  assert.deepEqual(history, returned);
  assert.deepEqual(
    history.map((attempt) => attempt.quizId),
    ['javascript', 'css'],
  );
  assert.equal('review' in history[0], false);
});

test('history is capped to the most recent attempts', () => {
  const storage = memoryStorage();
  for (let i = 0; i < MAX_ATTEMPTS + 5; i++) recordAttempt(storage, summary({ finishedAt: i }));

  const history = loadHistory(storage);
  assert.equal(history.length, MAX_ATTEMPTS);
  assert.equal(history[0].finishedAt, 5);
  assert.equal(history.at(-1).finishedAt, MAX_ATTEMPTS + 4);
});

test('corrupted or foreign data is ignored', () => {
  const storage = memoryStorage();
  const key = 'quiz-app:history:v1';

  storage.setItem(key, '{not json');
  assert.deepEqual(loadHistory(storage), []);

  storage.setItem(key, '{"quizId":"javascript"}');
  assert.deepEqual(loadHistory(storage), []);

  storage.setItem(key, JSON.stringify([{ quizId: 'broken' }, null, 3]));
  assert.deepEqual(loadHistory(storage), []);
  assert.equal(recordAttempt(storage, summary()).length, 1);
});

test('a failing storage does not break recording', () => {
  const storage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('quota exceeded');
    },
  };
  assert.equal(recordAttempt(storage, summary()).length, 1);
});

test('clearHistory wipes everything', () => {
  const storage = memoryStorage();
  recordAttempt(storage, summary());
  clearHistory(storage);
  assert.deepEqual(loadHistory(storage), []);
});

test('statsFor counts attempts and finds the personal best', () => {
  const history = [
    summary({ percent: 50, durationMs: 30_000 }),
    summary({ percent: 88, durationMs: 90_000 }),
    summary({ percent: 88, durationMs: 45_000 }),
    summary({ quizId: 'css', percent: 100, durationMs: 10_000 }),
  ];

  const stats = statsFor(history, 'javascript');
  assert.equal(stats.attempts, 3);
  assert.equal(stats.best.percent, 88);
  assert.equal(stats.best.durationMs, 45_000, 'ties go to the fastest attempt');

  assert.deepEqual(statsFor(history, 'git'), { attempts: 0, best: null });
});
