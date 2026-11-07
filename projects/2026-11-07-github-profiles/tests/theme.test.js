import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_STORAGE_KEY, loadTheme, saveTheme, toggleTheme } from '../src/theme.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

const brokenStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

describe('theme', () => {
  test('falls back to the OS preference when nothing is stored', () => {
    assert.equal(loadTheme(memoryStorage(), false), 'light');
    assert.equal(loadTheme(memoryStorage(), true), 'dark');
  });

  test('a stored choice wins over the OS preference', () => {
    assert.equal(loadTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'light' }), true), 'light');
    assert.equal(loadTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'dark' }), false), 'dark');
  });

  test('ignores unknown stored values', () => {
    assert.equal(loadTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'purple' }), false), 'light');
  });

  test('saveTheme persists the choice so it survives a reload', () => {
    const storage = memoryStorage();
    saveTheme(storage, 'dark');
    assert.equal(loadTheme(storage, false), 'dark');
  });

  test('saveTheme rejects unknown themes', () => {
    assert.throws(() => saveTheme(memoryStorage(), 'purple'), RangeError);
  });

  test('tolerates unavailable storage', () => {
    assert.equal(loadTheme(brokenStorage, true), 'dark');
    assert.doesNotThrow(() => saveTheme(brokenStorage, 'light'));
    assert.equal(loadTheme(undefined, false), 'light');
  });

  test('toggleTheme flips between light and dark', () => {
    assert.equal(toggleTheme('light'), 'dark');
    assert.equal(toggleTheme('dark'), 'light');
  });
});
