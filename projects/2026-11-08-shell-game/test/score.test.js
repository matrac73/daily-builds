import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, emptyScore, loadScore, saveScore, winRate } from '../src/score.js';

const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
};

test('loadScore returns an empty score when nothing is stored', () => {
  assert.deepEqual(loadScore(memoryStorage()), emptyScore());
  assert.deepEqual(loadScore(undefined), emptyScore());
});

test('saveScore and loadScore round-trip', () => {
  const storage = memoryStorage();
  saveScore(storage, { played: 7, wins: 3, extra: 'ignored' });
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), { played: 7, wins: 3 });
  assert.deepEqual(loadScore(storage), { played: 7, wins: 3 });
});

test('loadScore rejects corrupted or inconsistent data', () => {
  for (const raw of ['not json', '[]', '{"played":-1,"wins":0}', '{"played":2,"wins":5}', '{"played":1.5,"wins":0}']) {
    assert.deepEqual(loadScore(memoryStorage({ [STORAGE_KEY]: raw })), emptyScore(), raw);
  }
});

test('storage errors never throw', () => {
  const broken = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
  };
  assert.deepEqual(loadScore(broken), emptyScore());
  assert.doesNotThrow(() => saveScore(broken, { played: 1, wins: 1 }));
});

test('winRate is a rounded percentage', () => {
  assert.equal(winRate({ played: 0, wins: 0 }), null);
  assert.equal(winRate({ played: 3, wins: 1 }), 33);
  assert.equal(winRate({ played: 4, wins: 4 }), 100);
});
