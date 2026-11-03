import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FONT, N4, PALETTE, circleCells, ditherKeep, iconCells, key, rasterLine, textCells, unkey, whipSprite,
} from '../src/pixel.js';
import { PHRASES } from '../src/phrases.js';
import { createWhip } from '../src/whip.js';
import { SAMPLE_RATE, mix, synthBlip, synthCrack } from '../src/sound.js';

test('raster lines are continuous and include both ends', () => {
  const cells = rasterLine(0, 0, 7, 3);
  assert.deepEqual(cells[0], [0, 0]);
  assert.deepEqual(cells.at(-1), [7, 3]);
  for (let i = 1; i < cells.length; i++) {
    const step = Math.max(Math.abs(cells[i][0] - cells[i - 1][0]), Math.abs(cells[i][1] - cells[i - 1][1]));
    assert.equal(step, 1);
  }
});

test('circle cells sit on the radius', () => {
  for (const [x, y] of circleCells(10, 10, 6)) assert.ok(Math.abs(Math.hypot(x - 10, y - 10) - 6) < 1);
});

test('the whip sprite is fully outlined and has a cracker at the tip', () => {
  const whip = createWhip(100, 100);
  const cells = whipSprite(whip.points, { x: 80, y: 140 }, { x: 100, y: 100 }, 4);
  const colors = new Set(cells.values());
  for (const c of [PALETTE.outline, PALETTE.cracker, PALETTE.handle]) assert.ok(colors.has(c), c);
  for (const [k, c] of cells) {
    if (c === PALETTE.outline) continue;
    const [x, y] = unkey(k);
    for (const [dx, dy] of N4) assert.ok(cells.has(key(x + dx, y + dy)), `hole next to ${k}`);
  }
});

test('font glyphs are 5×7 and every phrase is drawable', () => {
  for (const [ch, rows] of Object.entries(FONT)) {
    assert.equal(rows.length, 7, ch);
    for (const r of rows) assert.equal(r.length, 5, ch);
  }
  for (const phrase of PHRASES.flat()) {
    for (const ch of phrase.toUpperCase()) assert.ok(FONT[ch], `${ch} in ${phrase}`);
  }
});

test('text metrics account for spacing and scale', () => {
  const { cells, width, height } = textCells('Do it!', 2);
  assert.deepEqual([width, height], [(6 * 6 - 1) * 2, 14]);
  for (const [x, y] of cells) assert.ok(x >= 0 && x < width && y >= 0 && y < height);
});

test('dither dissolves progressively', () => {
  const alive = (f) => {
    let n = 0;
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) n += ditherKeep(x, y, f) ? 1 : 0;
    return n;
  };
  assert.deepEqual([alive(0), alive(0.5), alive(1)], [16, 8, 0]);
});

test('button icon fits 16×16 and changes when switched on', () => {
  const off = iconCells(false);
  const on = iconCells(true);
  for (const k of off.keys()) {
    const [x, y] = unkey(k);
    assert.ok(x >= 0 && x < 16 && y >= 0 && y < 16);
  }
  assert.notDeepEqual([...off.entries()], [...on.entries()]);
});

test('8-bit sounds: crack is deterministic, quantised and bounded; blips grow with tier', () => {
  const a = synthCrack(0.6);
  assert.deepEqual(a, synthCrack(0.6));
  assert.equal(a.length, Math.floor(SAMPLE_RATE * 0.14));
  for (const s of a) assert.ok(Math.abs(s) <= 1.5 && Number.isInteger(s * 8));
  assert.ok(synthBlip(2).length > synthBlip(0).length);
  const m = mix(new Float32Array([1, 1]), new Float32Array([1, 1, 1]), 1);
  assert.deepEqual([...m], [1, 2, 1, 1]);
});
