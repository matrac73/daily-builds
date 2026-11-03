// Turns a stream of tip speeds into discrete "crack" events.

/**
 * A crack fires on the rising edge above `threshold`. The detector then
 * disarms until the tip slows below `threshold * rearmRatio`, and never fires
 * twice within `cooldownMs` — so one flick gives exactly one crack.
 */
export function createCrackDetector({ threshold = 2800, rearmRatio = 0.45, cooldownMs = 140 } = {}) {
  let armed = true;
  let lastCrack = -Infinity;

  return {
    threshold,
    update(speed, now) {
      if (!armed) {
        if (speed < threshold * rearmRatio) armed = true;
        return false;
      }
      if (speed >= threshold && now - lastCrack >= cooldownMs) {
        armed = false;
        lastCrack = now;
        return true;
      }
      return false;
    },
  };
}

/** Map a crack speed to a 0..1 intensity used for sound and visual effects. */
export function crackIntensity(speed, threshold) {
  if (speed <= threshold) return 0;
  return Math.min(1, (speed - threshold) / (threshold * 1.5));
}
