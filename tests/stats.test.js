import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BUGS, findBug } from '../src/bugs.js';
import { LANE_COUNT } from '../src/race.js';
import { createStats, recordRace } from '../src/stats.js';

test('a new session starts with empty metrics', () => {
  assert.deepEqual(createStats(2), {
    races: 0,
    correctGuesses: 0,
    lanes: [
      { races: 0, wins: 0, losses: 0 },
      { races: 0, wins: 0, losses: 0 },
    ],
  });
});

test('recordRace counts the race, the winner and the losers', () => {
  const stats = recordRace(createStats(4), 2, 0);
  assert.equal(stats.races, 1);
  assert.equal(stats.correctGuesses, 0);
  assert.deepEqual(stats.lanes[2], { races: 1, wins: 1, losses: 0 });
  for (const index of [0, 1, 3]) {
    assert.deepEqual(stats.lanes[index], { races: 1, wins: 0, losses: 1 });
  }
});

test('recordRace accumulates over a session and tracks correct guesses', () => {
  let stats = createStats(4);
  stats = recordRace(stats, 1, 1);
  stats = recordRace(stats, 1, 3);
  stats = recordRace(stats, 3, 3);

  assert.equal(stats.races, 3);
  assert.equal(stats.correctGuesses, 2);
  assert.deepEqual(stats.lanes[1], { races: 3, wins: 2, losses: 1 });
  assert.deepEqual(stats.lanes[3], { races: 3, wins: 1, losses: 2 });
  for (const lane of stats.lanes) assert.equal(lane.wins + lane.losses, lane.races);
});

test('recordRace does not mutate the previous stats', () => {
  const before = createStats(4);
  recordRace(before, 0, 0);
  assert.deepEqual(before, createStats(4));
});

test('recordRace rejects an invalid winner', () => {
  assert.throws(() => recordRace(createStats(4), 4, 0), RangeError);
  assert.throws(() => recordRace(createStats(4), null, 0), RangeError);
});

test('the roster offers a unique, drawable bug for every lane', () => {
  assert.ok(BUGS.length >= LANE_COUNT);
  assert.equal(new Set(BUGS.map((bug) => bug.id)).size, BUGS.length);
  assert.equal(new Set(BUGS.map((bug) => bug.svg)).size, BUGS.length);
  for (const bug of BUGS) {
    assert.match(bug.svg, /^<svg[\s\S]*<\/svg>$/);
    assert.equal(findBug(bug.id), bug);
  }
});
