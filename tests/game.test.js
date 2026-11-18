import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BELL_POINTS,
  PHYSICS,
  POINT_BANDS,
  WIN_POINTS,
  bandFor,
  createScore,
  hasWon,
  launchPuck,
  meterPosition,
  meterPower,
  recordStrike,
  simulateStrike,
  stepPuck,
  strikeForce,
} from '../src/game.js';

const near = (actual, expected, tolerance) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );

/** Analytic peak height for launch speed v under gravity g and linear drag k. */
function analyticPeak(force) {
  const { gravity: g, drag: k, maxLaunchSpeed } = PHYSICS;
  const v = force * maxLaunchSpeed;
  return v / k - (g / k ** 2) * Math.log(1 + (k * v) / g);
}

test('meter needle sweeps from 0 to 1 and back each period', () => {
  near(meterPosition(0, 2000), 0, 1e-9);
  near(meterPosition(500, 2000), 0.5, 1e-9);
  near(meterPosition(1000, 2000), 1, 1e-9);
  near(meterPosition(1500, 2000), 0.5, 1e-9);
  near(meterPosition(2000, 2000), 0, 1e-9);
  near(meterPosition(4500, 2000), 0.5, 1e-9);
});

test('meter power peaks in the centre and vanishes at the edges', () => {
  assert.equal(meterPower(0.5), 1);
  assert.equal(meterPower(0), 0);
  assert.equal(meterPower(1), 0);
  near(meterPower(0.25), 0.5, 1e-9);
  near(meterPower(0.75), 0.5, 1e-9);
  assert.equal(meterPower(-3), 0);
  assert.equal(meterPower(7), 0);
});

test('strike force scales timing by luck and stays within 0..1', () => {
  near(strikeForce(1, () => 0), 0.85, 1e-9);
  assert.equal(strikeForce(1, () => 1), 1);
  near(strikeForce(0.5, () => 0.5), 0.475, 1e-9);
  assert.equal(strikeForce(0, () => 1), 0);
  assert.equal(strikeForce(5, () => 1), 1);
});

test('strike force uses the injected random source', () => {
  const rolls = [0.1, 0.9];
  const rng = () => rolls.shift();
  assert.ok(strikeForce(0.8, rng) < strikeForce(0.8, rng));
});

test('a puck with no force never leaves the lever', () => {
  const result = simulateStrike(0);
  assert.equal(result.peak, 0);
  assert.equal(result.rangBell, false);
});

test('simulated peak matches the closed-form solution below the bell', () => {
  for (const force of [0.2, 0.4, 0.6, 0.8]) {
    const { peak, rangBell } = simulateStrike(force);
    assert.equal(rangBell, false);
    near(peak, analyticPeak(force), 0.01);
  }
});

test('peak height grows with force', () => {
  let previous = -1;
  for (let force = 0; force <= 0.8; force += 0.05) {
    const { peak } = simulateStrike(force);
    assert.ok(peak >= previous, `peak dropped at force ${force}`);
    previous = peak;
  }
});

test('a full-force strike rings the bell and a weak one does not', () => {
  const strong = simulateStrike(1);
  assert.equal(strong.rangBell, true);
  assert.equal(strong.peak, 1);

  const weak = simulateStrike(0.8);
  assert.equal(weak.rangBell, false);
  assert.ok(weak.peak < 1);
});

test('a perfectly timed swing always rings the bell, whatever the luck', () => {
  assert.equal(simulateStrike(strikeForce(1, () => 0)).rangBell, true);
  assert.equal(simulateStrike(strikeForce(1, () => 1)).rangBell, true);
});

test('the puck bounces off the bell and comes back to rest on the lever', () => {
  let puck = launchPuck(1);
  let bounced = false;
  for (let i = 0; i < 100_000 && !puck.done; i += 1) {
    const next = stepPuck(puck);
    if (!puck.rangBell && next.rangBell) {
      bounced = true;
      assert.equal(next.height, 1);
      assert.ok(next.velocity < 0, 'puck should travel downwards after the bell');
    }
    assert.ok(next.height >= 0 && next.height <= 1);
    puck = next;
  }
  assert.ok(bounced);
  assert.equal(puck.done, true);
  assert.equal(puck.height, 0);
  assert.equal(puck.velocity, 0);
});

test('stepping a finished puck leaves it untouched', () => {
  let puck = launchPuck(0.3);
  while (!puck.done) puck = stepPuck(puck);
  assert.equal(stepPuck(puck), puck);
});

test('flights last a watchable amount of time', () => {
  const { duration } = simulateStrike(1);
  assert.ok(duration > 0.5 && duration < 4, `duration was ${duration}s`);
});

test('points follow the distance scale from the spec', () => {
  const cases = [
    [0, 0],
    [0.124, 0],
    [0.125, 1],
    [0.249, 1],
    [0.25, 2],
    [0.499, 2],
    [0.5, 3],
    [0.749, 3],
    [0.75, 4],
    [0.999, 4],
    [1, BELL_POINTS],
  ];
  for (const [peak, points] of cases) {
    assert.equal(bandFor(peak).points, points, `peak ${peak}`);
  }
});

test('point bands are sorted from the bell down and all have a title', () => {
  for (let i = 1; i < POINT_BANDS.length; i += 1) {
    assert.ok(POINT_BANDS[i - 1].min > POINT_BANDS[i].min);
    assert.ok(POINT_BANDS[i - 1].points > POINT_BANDS[i].points);
  }
  assert.ok(POINT_BANDS.every((band) => band.title.length > 0));
});

test('score counts attempts, bells and points without mutating the input', () => {
  const start = createScore();
  assert.deepEqual(start, { attempts: 0, bells: 0, points: 0 });

  const afterMiss = recordStrike(start, 0.05);
  assert.deepEqual(afterMiss, { attempts: 1, bells: 0, points: 0 });

  const afterMid = recordStrike(afterMiss, 0.6);
  assert.deepEqual(afterMid, { attempts: 2, bells: 0, points: 3 });

  const afterBell = recordStrike(afterMid, 1);
  assert.deepEqual(afterBell, { attempts: 3, bells: 1, points: 8 });

  assert.deepEqual(start, { attempts: 0, bells: 0, points: 0 });
});

test('the game is won once the points target is reached', () => {
  let score = createScore();
  assert.equal(hasWon(score), false);

  score = recordStrike(score, 1);
  assert.equal(hasWon(score), false);

  score = recordStrike(score, 1);
  assert.equal(score.points, WIN_POINTS);
  assert.equal(hasWon(score), true);
});
