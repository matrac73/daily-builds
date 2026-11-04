import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, buildStyle, progressGradient } from '../src/map-styles.js';
import { formatDistance, formatDuration, formatElevation, formatPace } from '../src/format.js';

test('every theme builds a valid 3D style with terrain and sky', () => {
  for (const key of Object.keys(THEMES)) {
    const style = buildStyle(key);
    assert.equal(style.version, 8);
    assert.equal(style.terrain.source, 'dem');
    assert.equal(style.sources.dem.type, 'raster-dem');
    assert.notEqual(style.sources.dem, style.sources.hillshadeDem, 'terrain and hillshade use separate sources');
    assert.deepEqual(style.layers.map((l) => l.id), [`imagery-${key}`, `hillshade-${key}`]);
    assert.match(style.sky['sky-color'], /^#/);
  }
});

test('winter desaturates and brightens the imagery', () => {
  const paint = buildStyle('winter').layers[0].paint;
  assert.ok(paint['raster-saturation'] < -0.5);
  assert.ok(paint['raster-brightness-min'] > 0.3);
});

test('unknown theme falls back to summer', () => {
  assert.deepEqual(buildStyle('nope'), buildStyle('summer'));
});

test('progressGradient stops are strictly increasing for any progress', () => {
  for (const p of [-1, 0, 1e-9, 0.25, 0.999999, 1, 2]) {
    const expr = progressGradient(p, THEMES.summer.route);
    const stops = expr.slice(3).filter((_, i) => i % 2 === 0);
    assert.equal(stops.length, 4);
    for (let i = 1; i < stops.length; i++) assert.ok(stops[i] > stops[i - 1], `p=${p}`);
    assert.ok(stops.at(-1) <= 1);
  }
});

test('formatters produce French-friendly strings', () => {
  assert.equal(formatDistance(850.4), '850 m');
  assert.equal(formatDistance(5234), '5,23 km');
  assert.equal(formatDistance(42195), '42,2 km');
  assert.equal(formatDuration(65_000), '1:05');
  assert.equal(formatDuration(3_725_000), '1h02');
  assert.equal(formatElevation(1234.6), '1235 m');
  assert.equal(formatElevation(null), '–');
  assert.equal(formatPace(10_000, 3_000_000), '5:00 /km');
  assert.equal(formatPace(0, 1000), '–');
});
