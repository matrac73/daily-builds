// Pure game logic for the High Striker: no DOM, no audio, fully testable.
// Distances are fractions of the track (0 = lever, 1 = bell), time is in seconds.

export const PHYSICS = Object.freeze({
  gravity: 2.2, // constant deceleration, track lengths / s²
  drag: 0.6, // rail friction, proportional to speed, 1 / s
  maxLaunchSpeed: 3, // launch speed of a full-force strike, track lengths / s
  restitution: 0.35, // share of speed kept when bouncing off the bell
  dt: 1 / 240, // fixed integration step
});

export const WIN_POINTS = 10;
export const BELL_POINTS = 5;

// Ordered from the top of the track down; `min` is the lowest peak that earns the band.
export const POINT_BANDS = Object.freeze([
  { min: 1, points: BELL_POINTS, title: 'DING! Champion' },
  { min: 0.75, points: 4, title: 'Mighty' },
  { min: 0.5, points: 3, title: 'Strong' },
  { min: 0.25, points: 2, title: 'Getting there' },
  { min: 0.125, points: 1, title: 'Feeble' },
  { min: 0, points: 0, title: 'Did you even swing?' },
]);

const METER_PERIOD_MS = 2000;
const LUCK_MIN = 0.85;
const LUCK_SPREAD = 0.2;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** Position (0..1) of the power-meter needle, sweeping back and forth over time. */
export function meterPosition(elapsedMs, periodMs = METER_PERIOD_MS) {
  const phase = (((elapsedMs % periodMs) + periodMs) % periodMs) / periodMs;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

/** Swing power (0..1) for a needle position: full power in the centre, none at the edges. */
export function meterPower(position) {
  return 1 - Math.abs(2 * clamp01(position) - 1);
}

/**
 * Force (0..1) actually delivered to the lever: the player's timing scaled by a
 * random "luck" factor between 85% and 105%, so even a perfect swing can vary.
 */
export function strikeForce(power, rng = Math.random) {
  return clamp01(clamp01(power) * (LUCK_MIN + LUCK_SPREAD * rng()));
}

/** A puck resting on the lever, launched upwards by a strike of the given force. */
export function launchPuck(force) {
  return {
    height: 0,
    velocity: clamp01(force) * PHYSICS.maxLaunchSpeed,
    peak: 0,
    rangBell: false,
    done: false,
  };
}

/** Advances the puck by one time step (semi-implicit Euler) and returns the new state. */
export function stepPuck(puck, dt = PHYSICS.dt) {
  if (puck.done) return puck;

  let velocity = puck.velocity - (PHYSICS.gravity + PHYSICS.drag * puck.velocity) * dt;
  let height = puck.height + velocity * dt;
  let { rangBell } = puck;
  let done = false;

  if (height >= 1 && velocity > 0) {
    height = 1;
    velocity = -velocity * PHYSICS.restitution;
    rangBell = true;
  } else if (height <= 0) {
    height = 0;
    velocity = 0;
    done = true;
  }

  return { height, velocity, peak: Math.max(puck.peak, height), rangBell, done };
}

/** Runs a whole flight and reports how high the puck got and how long it took. */
export function simulateStrike(force) {
  let puck = launchPuck(force);
  let steps = 0;
  while (!puck.done) {
    puck = stepPuck(puck);
    steps += 1;
  }
  return { peak: puck.peak, rangBell: puck.rangBell, duration: steps * PHYSICS.dt };
}

/** The scoring band reached by a puck that peaked at the given height. */
export function bandFor(peak) {
  return POINT_BANDS.find((band) => peak >= band.min) ?? POINT_BANDS.at(-1);
}

export function createScore() {
  return { attempts: 0, bells: 0, points: 0 };
}

/** Returns the score after one more strike that peaked at the given height. */
export function recordStrike(score, peak) {
  const { points } = bandFor(peak);
  return {
    attempts: score.attempts + 1,
    bells: score.bells + (points === BELL_POINTS ? 1 : 0),
    points: score.points + points,
  };
}

export function hasWon(score) {
  return score.points >= WIN_POINTS;
}
