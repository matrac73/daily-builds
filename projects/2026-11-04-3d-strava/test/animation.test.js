import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressAt, zoomForDistance, cameraTarget, smoothingFactor } from '../src/animation.js';
import { buildTrack } from '../src/geo.js';

test('progressAt starts at 0, ends at 1 and is monotonic and continuous', () => {
  assert.equal(progressAt(0), 0);
  assert.ok(Math.abs(progressAt(1) - 1) < 1e-12);
  assert.equal(progressAt(-1), 0);
  assert.equal(progressAt(2), 1);
  let prev = 0;
  for (let i = 1; i <= 1000; i++) {
    const p = progressAt(i / 1000);
    assert.ok(p >= prev, `monotonic at ${i}`);
    assert.ok(p - prev < 0.0015, `no jump at ${i}`);
    prev = p;
  }
});

test('progressAt cruises at constant speed in the middle and is symmetric', () => {
  const v1 = progressAt(0.3) - progressAt(0.29);
  const v2 = progressAt(0.7) - progressAt(0.69);
  assert.ok(Math.abs(v1 - v2) < 1e-12);
  assert.ok(Math.abs(progressAt(0.5) - 0.5) < 1e-12);
  assert.ok(Math.abs(progressAt(0.03) + progressAt(0.97) - 1) < 1e-12);
});

test('zoomForDistance zooms out for longer activities within bounds', () => {
  assert.ok(zoomForDistance(5000) > zoomForDistance(42195));
  assert.ok(zoomForDistance(42195) > zoomForDistance(200_000));
  assert.equal(zoomForDistance(10), 15.6);
  assert.equal(zoomForDistance(5_000_000), 12.2);
});

test('cameraTarget heads along the track', () => {
  const north = buildTrack(
    Array.from({ length: 50 }, (_, i) => ({ lat: 45 + i * 0.001, lon: 6, ele: null, time: null })),
  );
  const t = cameraTarget(north, 0.5);
  assert.ok(Math.abs(t.distance - north.total / 2) < 1e-6);
  assert.ok(t.heading < 1 || t.heading > 359, `heading ${t.heading}`);

  const east = buildTrack(
    Array.from({ length: 50 }, (_, i) => ({ lat: 45, lon: 6 + i * 0.001, ele: null, time: null })),
  );
  assert.ok(Math.abs(cameraTarget(east, 0).heading - 90) < 1);
  assert.equal(cameraTarget(east, 1).position.lon, 6.049);
});

test('smoothingFactor is frame-rate independent', () => {
  const twoHalfSteps = 1 - (1 - smoothingFactor(1 / 120, 0.5)) ** 2;
  assert.ok(Math.abs(twoHalfSteps - smoothingFactor(1 / 60, 0.5)) < 1e-12);
  assert.equal(smoothingFactor(0.016, 0), 1);
  assert.equal(smoothingFactor(-1, 1), 0);
});
