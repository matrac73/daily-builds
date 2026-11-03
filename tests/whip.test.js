import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWhip, WHIP_DEFAULTS } from '../src/whip.js';
import { createCrackDetector } from '../src/crack.js';

const FRAME = 1 / 60;

function settled(x = 400, y = 300) {
  const whip = createWhip(x, y);
  for (let i = 0; i < 180; i++) whip.update(x, y, FRAME);
  return whip;
}

/** Drive the anchor along `path(t)` for `seconds`; return per-frame peak tip speeds. */
function drive(whip, path, seconds = 1.5) {
  const speeds = [];
  for (let f = 0; f * FRAME < seconds; f++) {
    const [x, y] = path(f * FRAME);
    speeds.push(whip.update(x, y, FRAME));
  }
  return speeds;
}

/** A wrist flick: quick out-and-back stroke at `v` px/s, then hold still. */
const flick = (v) => (t) => {
  if (t < 0.12) return [400 + v * t, 300 - (v * t) / 2];
  if (t < 0.2) return [400 + v * 0.12 - v * (t - 0.12), 300 - v * 0.06];
  return [400 + v * 0.04, 300 - v * 0.06];
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

test('segments keep their length (inextensible lash) after violent motion', () => {
  const whip = settled();
  drive(whip, flick(3000), 0.3);
  for (let i = 0; i < whip.points.length - 1; i++) {
    const a = whip.points[i];
    const b = whip.points[i + 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    assert.ok(Math.abs(d - WHIP_DEFAULTS.segmentLength) < WHIP_DEFAULTS.segmentLength * 0.25, `segment ${i}: ${d}`);
  }
});

test('a resting whip comes to rest below its anchor', () => {
  const whip = settled(200, 100);
  assert.ok(Math.abs(whip.tip.x - 200) < 1);
  assert.ok(whip.tip.y > 100 + whip.length * 0.95);
  assert.ok(whip.update(200, 100, FRAME) < 5);
});

test('the tip amplifies hand speed: a 1600 px/s flick cracks', () => {
  const detector = createCrackDetector();
  const speeds = drive(settled(), flick(1600));
  assert.ok(Math.max(...speeds) > 1600 * 1.5);
  const cracks = speeds.filter((s, i) => detector.update(s, i * FRAME * 1000));
  assert.equal(cracks.length, 1);
});

test('slow dragging and lazy waving never crack', () => {
  const detector = createCrackDetector();
  const drag = drive(settled(), (t) => [400 + 300 * t, 300]);
  const wave = drive(settled(), (t) => [400 + 100 * Math.sin(t * 6), 300], 3);
  for (const [i, s] of [...drag, ...wave].entries()) {
    assert.equal(detector.update(s, i * 16), false);
  }
});

test('substeps are capped when a frame is very long', () => {
  const whip = settled();
  assert.doesNotThrow(() => whip.update(450, 300, 5));
  assert.ok(Number.isFinite(whip.tip.x) && Number.isFinite(whip.tip.y));
});

test('reset re-hangs the whip at a new position', () => {
  const whip = settled();
  drive(whip, flick(2000), 0.2);
  whip.reset(10, 20);
  assert.deepEqual([whip.points[0].x, whip.points[0].y], [10, 20]);
  assert.deepEqual([whip.tip.x, whip.tip.y], [10, 20 + whip.length]);
});
