import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hashString, posterPalette } from '../src/lib/poster.js';
import { parseRoute, routeToHash } from '../src/lib/router.js';

test('parseRoute recognises the home route with or without a search', () => {
  assert.deepEqual(parseRoute(''), { name: 'home', query: '' });
  assert.deepEqual(parseRoute('#/'), { name: 'home', query: '' });
  assert.deepEqual(parseRoute('#/?q=dune+part'), { name: 'home', query: 'dune part' });
});

test('parseRoute recognises movie and watchlist routes', () => {
  assert.deepEqual(parseRoute('#/movie/dune-part-two'), { name: 'movie', id: 'dune-part-two' });
  assert.deepEqual(parseRoute('#/movie/693134'), { name: 'movie', id: '693134' });
  assert.deepEqual(parseRoute('#/watchlist'), { name: 'watchlist' });
});

test('parseRoute falls back to not-found, even for malformed escapes', () => {
  assert.deepEqual(parseRoute('#/nope'), { name: 'not-found' });
  assert.deepEqual(parseRoute('#/movie'), { name: 'not-found' });
  assert.deepEqual(parseRoute('#/movie/%E0%A4%A'), { name: 'movie', id: '%E0%A4%A' });
});

test('routeToHash is the inverse of parseRoute', () => {
  const routes = [
    { name: 'home', query: '' },
    { name: 'home', query: 'spider-man & co' },
    { name: 'movie', id: 'a b/c' },
    { name: 'watchlist' },
  ];
  for (const route of routes) {
    assert.deepEqual(parseRoute(routeToHash(route)), route);
  }
  assert.equal(routeToHash({ name: 'home', query: '  ' }), '#/');
});

test('hashString is stable and spreads similar inputs', () => {
  assert.equal(hashString(''), 0x811c9dc5);
  assert.equal(hashString('Dune'), hashString('Dune'));
  assert.notEqual(hashString('Dune'), hashString('Dune 2'));
});

test('posterPalette is deterministic and yields valid CSS values', () => {
  const palette = posterPalette('Past Lives');
  assert.deepEqual(palette, posterPalette('Past Lives'));
  assert.match(palette.from, /^hsl\(\d{1,3} 55% 34%\)$/);
  assert.match(palette.to, /^hsl\(\d{1,3} 60% 13%\)$/);
  assert.ok(palette.angle >= 120 && palette.angle < 220);
  assert.notDeepEqual(palette, posterPalette('Anora'));
});
