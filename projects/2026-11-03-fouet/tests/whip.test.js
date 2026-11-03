import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWhip, WHIP_DEFAULTS } from '../src/whip.js';
import { createFlickDetector, createLashSnap } from '../src/crack.js';

const FRAME = 1 / 60;

function settled(x = 400, y = 300) {
  const whip = createWhip(x, y);
  for (let i = 0; i < 180; i++) whip.update(x, y, FRAME);
  return whip;
}

/** Drive whip + crack rule along `path(t)`; returns the crack events. */
function simulate(path, seconds) {
  const [x0, y0] = path(0);
  const whip = createWhip(x0, y0);
  const detector = createFlickDetector();
  const snap = createLashSnap();
  const cracks = [];
  let prev = [x0, y0];
  for (let f = 1; f <= Math.round(seconds / FRAME); f++) {
    const t = f * FRAME;
    const [x, y] = path(t);
    whip.update(x, y, FRAME);
    const flick = detector.update((x - prev[0]) / FRAME, (y - prev[1]) / FRAME, t * 1000);
    prev = [x, y];
    if (flick) snap.start(flick, t * 1000);
    if (snap.update(whip, t * 1000)) cracks.push({ t, hand: [x, y], tip: { ...whip.tip } });
  }
  return cracks;
}

/** Rest, swing right at `speed` px/s for 0.22 s, then stop dead or pull back. */
const swing = (after, speed = 2600) => (t) => {
  if (t < 0.5) return [300, 300];
  if (t < 0.72) return [300 + speed * (t - 0.5), 300];
  const end = 300 + speed * 0.22;
  return after === 'back' ? [end - 1200 * Math.min(t - 0.72, 0.08), 300] : [end, 300];
};

test('a new whip hangs straight down from its anchor with the configured length', () => {
  const whip = createWhip(100, 50);
  assert.equal(whip.points.length, WHIP_DEFAULTS.segments + 1);
  assert.equal(whip.length, WHIP_DEFAULTS.segments * WHIP_DEFAULTS.segmentLength);
  assert.deepEqual([whip.tip.x, whip.tip.y], [100, 50 + whip.length]);
});

test('the head stays pinned to the anchor', () => {
  const whip = settled();
  whip.update(520, 210, FRAME);
  assert.deepEqual([whip.points[0].x, whip.points[0].y], [520, 210]);
});

test('segments keep their exact length after violent motion', () => {
  const whip = settled();
  for (let i = 0; i < 60; i++) whip.update(400 + 300 * Math.sin(i / 2), 300 + 200 * Math.cos(i / 3), FRAME);
  for (let i = 0; i < whip.points.length - 1; i++) {
    const a = whip.points[i];
    const b = whip.points[i + 1];
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - WHIP_DEFAULTS.segmentLength) < 1e-6);
  }
});

test('the bend limit holds at every joint: the lash never folds onto itself', () => {
  const whip = settled();
  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let x = 400;
  let y = 300;
  for (let i = 0; i < 400; i++) {
    x += rand() * 60;
    y += rand() * 60;
    whip.update(x, y, FRAME);
    whip.jointAngles().forEach((a, j) => assert.ok(a <= whip.maxBend[j + 1] + 0.5, `joint ${j + 1}: ${a}°`));
  }
});

test('the root is stiffer than the tip', () => {
  const { maxBend } = createWhip(0, 0);
  assert.ok(maxBend[1] < maxBend[10] && maxBend[10] < maxBend[maxBend.length - 2]);
});

test('a resting whip stays at rest below its anchor', () => {
  const whip = settled(200, 100);
  assert.ok(Math.abs(whip.tip.x - 200) < 1);
  assert.ok(whip.tip.y > 100 + whip.length * 0.95);
  assert.ok(whip.update(200, 100, FRAME) < 5);
});

test('swing then stop dead: one crack, right after the stop, lash thrown ahead', () => {
  const cracks = simulate(swing('stop'), 1.6);
  assert.equal(cracks.length, 1);
  const [c] = cracks;
  assert.ok(c.t >= 0.72 && c.t <= 0.97, `crack at ${c.t}`);
  assert.ok(c.tip.x > c.hand[0] + 60, 'tip should be past the hand');
});

test('the crack lands where you aim, in every direction and at every speed', () => {
  for (let angle = 0; angle < 360; angle += 45) {
    const dx = Math.cos((angle * Math.PI) / 180);
    const dy = Math.sin((angle * Math.PI) / 180);
    for (const speed of [1800, 2600, 3700]) {
      const path = (t) => {
        const k = Math.min(Math.max(t - 0.5, 0), 300 / speed); // 300 px swing, then stop dead
        return [600 + dx * speed * k, 500 + dy * speed * k];
      };
      const cracks = simulate(path, 1.5);
      assert.equal(cracks.length, 1, `${angle}° @ ${speed}`);
      const { hand: [hx, hy], tip } = cracks[0];
      const ex = tip.x - hx;
      const ey = tip.y - hy;
      const off = (Math.atan2(ey * dx - ex * dy, ex * dx + ey * dy) * 180) / Math.PI;
      assert.ok(Math.abs(off) < 25, `${angle}° @ ${speed}: ${off.toFixed(1)}° off`);
      assert.ok(Math.hypot(ex, ey) > 180);
    }
  }
});

test('swing then pull back: cracks too', () => {
  const cracks = simulate(swing('back'), 1.6);
  assert.equal(cracks.length, 1);
  assert.ok(cracks[0].t >= 0.72);
});

test('slow dragging, lazy waving and moderate swings never crack', () => {
  assert.deepEqual(simulate((t) => [400 + 300 * t, 300], 2), []);
  assert.deepEqual(simulate((t) => [400 + 100 * Math.sin(t * 6), 300], 3), []);
  assert.deepEqual(simulate((t) => [600 + 1200 * Math.min(Math.max(t - 0.5, 0), 0.25), 500], 1.5), []);
});

test('shaking the mouse frantically cracks rarely, never twice within 0.6 s', () => {
  const cracks = simulate((t) => [600 + 250 * Math.sin(2 * Math.PI * 2.5 * t), 500], 3);
  assert.ok(cracks.length >= 1 && cracks.length <= 5, `${cracks.length} cracks`);
  for (let i = 1; i < cracks.length; i++) assert.ok(cracks[i].t - cracks[i - 1].t >= 0.6);
});

test('substeps are capped when a frame is very long', () => {
  const whip = settled();
  assert.doesNotThrow(() => whip.update(450, 300, 5));
  assert.ok(Number.isFinite(whip.tip.x) && Number.isFinite(whip.tip.y));
});

test('reset re-hangs the whip at a new position', () => {
  const whip = settled();
  whip.update(900, 100, FRAME);
  whip.reset(10, 20);
  assert.deepEqual([whip.points[0].x, whip.points[0].y], [10, 20]);
  assert.deepEqual([whip.tip.x, whip.tip.y], [10, 20 + whip.length]);
});
