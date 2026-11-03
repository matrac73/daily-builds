// When does the whip crack? Not when you speed up — when you brake.
// Mirrors `FlickDetector` / `ApexTracker` of fouet.py.

/**
 * Hand velocity measured over the last `spanMs` of positions. Frame-to-frame
 * differences lie: a frame that received no pointer event reads as a dead stop
 * and would crack mid-swing. A short time window does not.
 */
export function createVelocityTracker({ spanMs = 35 } = {}) {
  let samples = [];
  return {
    reset() {
      samples = [];
    },
    update(x, y, now) {
      samples.push({ x, y, t: now });
      while (samples.length > 2 && now - samples[1].t >= spanMs) samples.shift();
      const o = samples[0];
      const dt = (now - o.t) / 1000;
      return dt > 0 ? { vx: (x - o.x) / dt, vy: (y - o.y) / dt } : { vx: 0, vy: 0 };
    },
  };
}

/**
 * Fires when the hand moved fast and then stops dead or pulls back: within
 * `windowMs` of a speed peak above `minSpeed`, the hand speed fell under
 * `stopRatio` × peak, or its velocity now points backwards (projection on the
 * peak direction below −`reverseRatio` × peak). Speeding up never fires.
 */
export function createFlickDetector({
  minSpeed = 1500, stopRatio = 0.2, reverseRatio = 0.2, windowMs = 200, cooldownMs = 600,
} = {}) {
  let history = [];
  let lastFire = -Infinity;

  return {
    minSpeed,
    reset() {
      history = [];
    },
    /** Feed the hand velocity (px/s); returns { speed, dx, dy } on a flick, else null. */
    update(vx, vy, now) {
      if (now - lastFire < cooldownMs) return null; // ignore the tail of the flick that just cracked
      history = history.filter((h) => now - h.t <= windowMs);
      if (history.length) {
        let peak = history[0];
        for (const h of history) if (h.vx * h.vx + h.vy * h.vy > peak.vx * peak.vx + peak.vy * peak.vy) peak = h;
        const peakSpeed = Math.hypot(peak.vx, peak.vy);
        if (peakSpeed >= minSpeed) {
          const speed = Math.hypot(vx, vy);
          const along = (vx * peak.vx + vy * peak.vy) / peakSpeed;
          if (speed <= peakSpeed * stopRatio || along <= -peakSpeed * reverseRatio) {
            lastFire = now;
            history = [];
            return { speed: peakSpeed, dx: peak.vx / peakSpeed, dy: peak.vy / peakSpeed };
          }
        }
      }
      history.push({ vx, vy, t: now });
      return null;
    },
  };
}

/**
 * After a flick, snap the lash straight along the swing direction and crack
 * once it is extended (`reach` × its length). If it is not extended after
 * `maxDelayMs` the flick fizzles: no crack without a real tip snap. This is the
 * "crack where I aim" part: a sharp brake throws the lash along the swing
 * line, instead of leaving the tip to a pendulum that can swing anywhere.
 */
export function createLashSnap({ pull = 0.25, reach = 0.9, maxDelayMs = 400 } = {}) {
  let flick = null;
  let started = 0;
  let last = 0;
  return {
    get pending() {
      return flick !== null;
    },
    start(f, now) {
      flick = f;
      started = now;
      last = now;
    },
    /** Call after `whip.update` each frame; returns the flick when it cracks. */
    update(whip, now) {
      if (!flick) return null;
      // `pull` is per 60 fps frame, scaled by the real frame time so the lash
      // unrolls at the same speed whatever the frame rate.
      const frames = Math.max(0, Math.min(100, now - last)) * 0.06;
      last = now;
      whip.steer(flick.dx, flick.dy, 1 - (1 - pull) ** Math.max(frames, 0.25));
      if (whip.reach(flick.dx, flick.dy) >= reach * whip.length) {
        const done = flick;
        flick = null;
        return done;
      }
      if (now - started >= maxDelayMs) flick = null; // fizzled: the tip never snapped
      return null;
    },
  };
}

/** 0..1 strength of a crack, from the hand speed of its flick. */
export function crackIntensity(speed, minSpeed) {
  if (speed <= minSpeed) return 0;
  return Math.min(1, (speed - minSpeed) / (minSpeed * 2));
}
