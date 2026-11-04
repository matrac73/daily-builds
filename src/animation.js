// Fly-over timeline and camera maths (pure functions).
import { bearing, pointAt } from './geo.js';

/**
 * Trapezoidal velocity profile: accelerate during the first `ramp` fraction,
 * cruise at constant speed, decelerate during the last `ramp` fraction.
 * Constant cruise speed keeps the motion readable; soft ends avoid jolts.
 * @param {number} t normalised time in [0, 1]
 * @param {number} [ramp=0.08]
 * @returns {number} normalised progress along the track in [0, 1]
 */
export function progressAt(t, ramp = 0.08) {
  const x = Math.min(1, Math.max(0, t));
  const a = Math.min(0.5, Math.max(1e-6, ramp));
  const vmax = 1 / (1 - a);
  if (x < a) return (vmax * x * x) / (2 * a);
  if (x > 1 - a) return 1 - (vmax * (1 - x) ** 2) / (2 * a);
  return vmax * (x - a / 2);
}

/** Camera zoom adapted to the track length: tight on short runs, wider on long rides. */
export function zoomForDistance(totalMeters) {
  const km = Math.max(0.5, totalMeters / 1000);
  return clamp(15.6 - 0.55 * Math.log2(km), 12.2, 15.6);
}

/**
 * Where the camera should look at a given progress.
 * Heading is measured over a window around the current position so GPS jitter
 * and hairpins do not make the camera spin.
 */
export function cameraTarget(track, progress) {
  const d = clamp(progress, 0, 1) * track.total;
  const look = Math.max(120, track.total * 0.025);
  const here = pointAt(track, d);
  const from = pointAt(track, Math.max(0, d - look * 0.5));
  const to = pointAt(track, Math.min(track.total, d + look));
  const heading = from.lat === to.lat && from.lon === to.lon ? 0 : bearing(from, to);
  return { position: here, distance: d, heading };
}

/** Frame-rate independent smoothing factor for a time constant `tau` (seconds). */
export function smoothingFactor(dtSeconds, tau) {
  if (tau <= 0) return 1;
  return 1 - Math.exp(-Math.max(0, dtSeconds) / tau);
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
