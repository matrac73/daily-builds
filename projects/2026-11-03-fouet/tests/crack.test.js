import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlickDetector, createLashSnap, createVelocityTracker, crackIntensity } from '../src/crack.js';
import { createWhip } from '../src/whip.js';

const MS = 1000 / 60;

test('speeding up alone never cracks (the "cracks from the start" bug)', () => {
  const d = createFlickDetector({ minSpeed: 1000 });
  for (let i = 0; i < 20; i++) assert.equal(d.update(i * 200, 0, i * MS), null);
});

test('steady fast motion never cracks', () => {
  const d = createFlickDetector({ minSpeed: 1000 });
  for (let i = 0; i < 60; i++) assert.equal(d.update(2500, 0, i * MS), null);
});

test('stopping dead after a fast move cracks, in the direction of the swing', () => {
  const d = createFlickDetector({ minSpeed: 1000 });
  for (let i = 0; i < 10; i++) d.update(2000, 0, i * MS);
  assert.deepEqual(d.update(0, 0, 10 * MS), { speed: 2000, dx: 1, dy: 0 });
});

test('pulling back cracks even without fully stopping', () => {
  const d = createFlickDetector({ minSpeed: 1000 });
  for (let i = 0; i < 10; i++) d.update(0, -1800, i * MS);
  assert.notEqual(d.update(0, 600, 10 * MS), null);
});

test('a slow, gradual brake does not crack', () => {
  const d = createFlickDetector({ minSpeed: 1000, windowMs: 200 });
  for (let i = 0; i < 50; i++) assert.equal(d.update(2000 - i * 40, 0, i * MS), null);
});

test('slow moves never crack', () => {
  const d = createFlickDetector({ minSpeed: 1000 });
  for (let i = 0; i < 10; i++) d.update(700, 0, i * MS);
  assert.equal(d.update(0, 0, 10 * MS), null);
});

test('one flick gives one crack (cooldown)', () => {
  const d = createFlickDetector({ minSpeed: 1000, cooldownMs: 200 });
  for (let i = 0; i < 5; i++) d.update(2000, 0, i * MS);
  assert.notEqual(d.update(0, 0, 5 * MS), null);
  d.update(2500, 0, 6 * MS);
  assert.equal(d.update(0, 0, 7 * MS), null);
});

test('a stuttering mouse cracks once, at the real stop, not on empty frames', () => {
  const velocity = createVelocityTracker();
  const detector = createFlickDetector();
  const fires = [];
  for (let frame = 0; frame < 90; frame++) {
    const t = frame / 60;
    const posAt = (s) => 600 - 3000 * Math.min(Math.max(s - 0.5, 0), 0.12);
    // Mid-swing, odd frames see no new pointer event: the position is stale.
    const x = frame > 30 && frame < 40 && frame % 2 ? posAt((frame - 1) / 60) : posAt(t);
    const { vx, vy } = velocity.update(x, 500, t * 1000);
    if (detector.update(vx, vy, t * 1000)) fires.push(t);
  }
  assert.equal(fires.length, 1);
  assert.ok(fires[0] >= 0.62, `cracked at ${fires[0]}`);
});

test('the velocity tracker measures over its time span', () => {
  const v = createVelocityTracker({ spanMs: 35 });
  let out;
  for (let i = 0; i < 10; i++) out = v.update(i * 20, 0, i * MS);
  assert.ok(Math.abs(out.vx - 1200) < 1e-6);
  v.reset();
  assert.deepEqual(v.update(5, 5, 1000), { vx: 0, vy: 0 });
});

test('the smoothed velocity tail after a stop does not crack a second time', () => {
  const d = createFlickDetector({ minSpeed: 1000, cooldownMs: 220, windowMs: 200 });
  let v = 3750;
  for (let i = 0; i < 6; i++) d.update(v, 0, i * MS);
  let cracks = 0;
  for (let i = 6; i < 60; i++) {
    v *= 0.3; // EMA tail, then rest
    if (d.update(v, 0, i * MS)) cracks += 1;
  }
  assert.equal(cracks, 1);
});

test('the snap straightens the lash along the swing, then cracks', () => {
  const whip = createWhip(0, 0); // hanging straight down
  const snap = createLashSnap({ maxDelayMs: 10000 });
  const flick = { speed: 2000, dx: 1, dy: 0 }; // thrown to the right
  snap.start(flick, 0);
  let fired = null;
  let frames = 0;
  while (!fired && frames < 60) {
    frames += 1;
    whip.update(0, 0, 1 / 60);
    fired = snap.update(whip, frames * MS);
  }
  assert.equal(fired, flick);
  assert.equal(snap.pending, false);
  assert.ok(whip.reach(1, 0) >= 0.9 * whip.length);
  assert.ok(frames <= 20);
});

test('the snap unrolls as fast at 30 fps as at 60', () => {
  const timeToCrack = (fps) => {
    const whip = createWhip(0, 0);
    const snap = createLashSnap({ maxDelayMs: 10000 });
    snap.start({ speed: 2000, dx: 1, dy: 0 }, 0);
    for (let f = 1; f < 200; f++) {
      whip.update(0, 0, 1 / fps);
      if (snap.update(whip, (f * 1000) / fps)) return f / fps;
    }
    return Infinity;
  };
  const [t60, t30] = [timeToCrack(60), timeToCrack(30)];
  assert.ok(t60 < 0.4 && t30 < 0.4 && Math.abs(t60 - t30) < 0.07, `${t60} vs ${t30}`);
});
test('a snap that never extends fizzles without cracking, and an idle snap does nothing', () => {
  const whip = createWhip(0, 0);
  const before = JSON.stringify(whip.points);
  assert.equal(createLashSnap().update(whip, 1000), null);
  assert.equal(JSON.stringify(whip.points), before);
  const snap = createLashSnap({ pull: 0, maxDelayMs: 100 });
  snap.start({ speed: 2000, dx: 1, dy: 0 }, 0);
  const fired = Array.from({ length: 30 }, (_, i) => snap.update(whip, (i + 1) * MS));
  assert.ok(!fired.some(Boolean));
  assert.equal(snap.pending, false);
});

test('crack intensity is 0 at min speed and saturates at 1', () => {
  assert.equal(crackIntensity(800, 1000), 0);
  assert.equal(crackIntensity(1000, 1000), 0);
  assert.equal(crackIntensity(2000, 1000), 0.5);
  assert.equal(crackIntensity(99999, 1000), 1);
});
