import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversine, bearing, buildTrack, elevationGain, pointAt, resample, smoothAngle } from '../src/geo.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ±${tol}, got ${actual}`);

test('haversine matches a known distance (Paris → London ≈ 343.5 km)', () => {
  near(haversine({ lat: 48.8566, lon: 2.3522 }, { lat: 51.5074, lon: -0.1278 }), 343_500, 1500);
});

test('bearing gives cardinal directions', () => {
  const o = { lat: 0, lon: 0 };
  near(bearing(o, { lat: 1, lon: 0 }), 0, 1e-9, 'north');
  near(bearing(o, { lat: 0, lon: 1 }), 90, 1e-9, 'east');
  near(bearing(o, { lat: -1, lon: 0 }), 180, 1e-9, 'south');
  near(bearing(o, { lat: 0, lon: -1 }), 270, 1e-9, 'west');
});

const line = (n, step = 0.001) =>
  Array.from({ length: n }, (_, i) => ({ lat: 45 + i * step, lon: 6, ele: 1000 + i * 10, time: i * 1000 }));

test('buildTrack computes cumulative distance, stats and bounds', () => {
  const pts = line(5);
  pts.splice(2, 0, { ...pts[1] }); // duplicate position is dropped
  const t = buildTrack(pts);
  assert.equal(t.points.length, 5);
  near(t.total, 4 * 111.2 * 1000 * 0.001, 5);
  assert.equal(t.dist[0], 0);
  assert.ok(t.dist.every((d, i) => i === 0 || d > t.dist[i - 1]));
  assert.equal(t.elevationGain, 40);
  assert.equal(t.minEle, 1000);
  assert.equal(t.maxEle, 1040);
  assert.equal(t.duration, 4000);
  assert.deepEqual(t.bounds, [[6, 45], [6, 45.004]]);
});

test('buildTrack rejects degenerate tracks', () => {
  assert.throws(() => buildTrack([{ lat: 1, lon: 1 }, { lat: 1, lon: 1 }]), /trop courte/);
});

test('elevationGain filters noise below the threshold', () => {
  assert.equal(elevationGain([100, 101, 100, 102, 101, 100]), 0);
  assert.equal(elevationGain([100, 110, 105, 120, null, 118]), 25);
  assert.equal(elevationGain([null, null]), 0);
});

test('pointAt interpolates position, elevation and time, and clamps', () => {
  const t = buildTrack(line(3));
  const mid = pointAt(t, t.total / 4);
  near(mid.lat, 45.0005, 1e-6);
  near(mid.ele, 1005, 1e-6);
  near(mid.time, 500, 1e-6);
  assert.equal(pointAt(t, -10).lat, 45);
  assert.equal(pointAt(t, t.total + 10).lat, 45.002);
});

test('resample produces evenly spaced points with the same length', () => {
  const pts = [
    { lat: 45, lon: 6, ele: null, time: null },
    { lat: 45.0001, lon: 6, ele: null, time: null },
    { lat: 45.01, lon: 6, ele: null, time: null },
  ];
  const r = resample(buildTrack(pts), 11);
  assert.equal(r.points.length, 11);
  near(r.total, buildTrack(pts).total, 0.01);
  const steps = r.dist.slice(1).map((d, i) => d - r.dist[i]);
  steps.forEach((s) => near(s, r.total / 10, 0.01));
});

test('smoothAngle takes the shortest arc across north', () => {
  near(smoothAngle(350, 10, 0.5), 0, 1e-9);
  near(smoothAngle(10, 350, 0.5), 0, 1e-9);
  near(smoothAngle(90, 180, 1), 180, 1e-9);
  near(smoothAngle(90, 180, 0), 90, 1e-9);
});
