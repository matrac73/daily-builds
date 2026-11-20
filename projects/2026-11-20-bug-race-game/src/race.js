/**
 * Pure race simulation: no DOM, no timers. The UI feeds it elapsed time and
 * reads back positions, which keeps the whole thing deterministic under test.
 */

export const LANE_COUNT = 4;

/** Speeds are expressed in "track lengths per second". */
export const SPEED_RANGES = Object.freeze({
  slow: Object.freeze({ min: 0.08, max: 0.12 }),
  normal: Object.freeze({ min: 0.15, max: 0.23 }),
  fast: Object.freeze({ min: 0.3, max: 0.45 }),
});

/** How long (seconds) a bug keeps its current pace before changing it. */
const PACE_DURATION = Object.freeze({ min: 0.4, max: 1.1 });

const randomBetween = ({ min, max }, rng) => min + (max - min) * rng();

/**
 * Creates a race where every bug gets its own random base speed inside the
 * range of the chosen speed setting.
 *
 * @param {'slow'|'normal'|'fast'} speed
 * @param {() => number} [rng] returns a number in [0, 1)
 * @param {number} [laneCount]
 */
export function createRace(speed, rng = Math.random, laneCount = LANE_COUNT) {
  const range = SPEED_RANGES[speed];
  if (!range) throw new RangeError(`Unknown speed setting: ${speed}`);

  const runners = Array.from({ length: laneCount }, () => {
    const baseSpeed = randomBetween(range, rng);
    return {
      baseSpeed,
      speed: baseSpeed,
      position: 0,
      paceLeft: randomBetween(PACE_DURATION, rng),
    };
  });

  return { range, runners, winner: null };
}

/**
 * Advances the race by `dt` seconds (mutates and returns `race`).
 *
 * Bugs periodically change pace so the lead can swap, but their speed always
 * stays inside the selected range and remains biased toward their base speed.
 * As soon as one bug reaches the finish line (position 1) the race is over:
 * `race.winner` holds its lane index and further steps are no-ops.
 */
export function stepRace(race, dt, rng = Math.random) {
  if (race.winner !== null || dt <= 0) return race;

  for (const runner of race.runners) {
    runner.paceLeft -= dt;
    if (runner.paceLeft <= 0) {
      runner.speed = (runner.baseSpeed + randomBetween(race.range, rng)) / 2;
      runner.paceLeft = randomBetween(PACE_DURATION, rng);
    }
    runner.position += runner.speed * dt;
  }

  const lead = Math.max(...race.runners.map((runner) => runner.position));
  if (lead >= 1) {
    race.winner = race.runners.findIndex((runner) => runner.position === lead);
    for (const runner of race.runners) {
      runner.position = Math.min(runner.position, 1);
    }
  }

  return race;
}
