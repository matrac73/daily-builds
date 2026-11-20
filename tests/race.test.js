import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LANE_COUNT, SPEED_RANGES, createRace, stepRace } from '../src/race.js';

/** Small deterministic PRNG (mulberry32) so races are reproducible. */
function seededRng(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runToFinish(race, rng, dt = 1 / 60) {
  let steps = 0;
  while (race.winner === null) {
    stepRace(race, dt, rng);
    steps += 1;
    assert.ok(steps < 100_000, 'race should finish');
  }
  return steps * dt;
}

test('speed ranges are ordered slow < normal < fast without overlap', () => {
  const { slow, normal, fast } = SPEED_RANGES;
  for (const range of [slow, normal, fast]) assert.ok(range.min < range.max);
  assert.ok(slow.max < normal.min);
  assert.ok(normal.max < fast.min);
});

test('createRace puts four bugs on the start line with distinct in-range speeds', () => {
  for (const speed of Object.keys(SPEED_RANGES)) {
    const race = createRace(speed, seededRng(42));
    const { min, max } = SPEED_RANGES[speed];

    assert.equal(race.runners.length, LANE_COUNT);
    assert.equal(race.winner, null);
    for (const runner of race.runners) {
      assert.equal(runner.position, 0);
      assert.ok(runner.baseSpeed >= min && runner.baseSpeed <= max);
    }
    assert.equal(new Set(race.runners.map((runner) => runner.baseSpeed)).size, LANE_COUNT);
  }
});

test('createRace rejects an unknown speed setting', () => {
  assert.throws(() => createRace('ludicrous'), RangeError);
});

test('bug speed stays inside the selected range for the whole race', () => {
  const rng = seededRng(7);
  const race = createRace('normal', rng);
  const { min, max } = SPEED_RANGES.normal;

  while (race.winner === null) {
    stepRace(race, 1 / 60, rng);
    for (const runner of race.runners) {
      assert.ok(runner.speed >= min && runner.speed <= max);
    }
  }
});

test('the race ends when the first bug reaches the finish line', () => {
  const rng = seededRng(123);
  const race = createRace('fast', rng);
  runToFinish(race, rng);

  const positions = race.runners.map((runner) => runner.position);
  assert.equal(positions[race.winner], 1);
  assert.ok(positions.every((position) => position <= 1));
  assert.equal(positions.filter((position) => position === 1).length, 1);
});

test('all bugs stop moving once there is a winner', () => {
  const rng = seededRng(99);
  const race = createRace('fast', rng);
  runToFinish(race, rng);

  const winner = race.winner;
  const frozen = race.runners.map((runner) => runner.position);
  stepRace(race, 5, rng);

  assert.equal(race.winner, winner);
  assert.deepEqual(race.runners.map((runner) => runner.position), frozen);
});

test('the bug that travelled furthest wins when several cross in one step', () => {
  const race = createRace('normal', () => 0.5);
  race.runners.forEach((runner, index) => {
    runner.position = 0.99;
    runner.speed = index === 2 ? 0.2 : 0.15;
    runner.paceLeft = 10;
  });

  stepRace(race, 0.1, () => 0.5);
  assert.equal(race.winner, 2);
});

test('a non-positive time step does not move anyone', () => {
  const race = createRace('slow', seededRng(1));
  stepRace(race, 0);
  stepRace(race, -1);
  assert.ok(race.runners.every((runner) => runner.position === 0));
});

test('faster settings produce shorter races', () => {
  const duration = (speed) => {
    const rng = seededRng(2024);
    return runToFinish(createRace(speed, rng), rng);
  };
  assert.ok(duration('slow') > duration('normal'));
  assert.ok(duration('normal') > duration('fast'));
});

test('the same seed replays the same race', () => {
  const play = () => {
    const rng = seededRng(555);
    const race = createRace('normal', rng);
    runToFinish(race, rng);
    return race;
  };
  assert.deepEqual(play(), play());
});
