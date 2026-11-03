// Verlet rope simulation of a whip lash. Pure logic: no DOM, fully testable.
// Mirrors the `Whip` class of fouet.py.

export const WHIP_DEFAULTS = Object.freeze({
  segments: 20,
  segmentLength: 13,
  gravity: 1500, // px/s²
  damping: 0.975, // velocity kept per substep
  iterations: 12, // distance relaxation passes per substep
  step: 1 / 120, // fixed physics timestep (s)
  maxSubsteps: 8, // cap per frame so a stalled tab does not spiral
  bendRoot: 14, // max bend (degrees) at the joint next to the handle…
  bendTip: 38, // …growing to this at the tip: stiff root, supple tip
});

/**
 * Create a whip whose first point is pinned to an anchor (the handle tip).
 * The anchor is interpolated across substeps, so fast mouse flicks transfer
 * smoothly along the lash. A bend limit at every joint keeps the lash from
 * folding onto itself, so it unrolls cleanly and cracks where you aim.
 */
export function createWhip(x, y, options = {}) {
  const o = { ...WHIP_DEFAULTS, ...options };
  const points = [];
  const maxBend = [0];
  for (let i = 1; i < o.segments; i++) {
    maxBend.push(o.bendRoot + (o.bendTip - o.bendRoot) * (i / o.segments) ** 1.5);
  }
  maxBend.push(0);
  const maxBendRad = maxBend.map((a) => (a * Math.PI) / 180);
  let anchor = { x, y };
  let accumulator = 0;

  function reset(nx, ny) {
    points.length = 0;
    for (let i = 0; i <= o.segments; i++) {
      const py = ny + i * o.segmentLength;
      points.push({ x: nx, y: py, px: nx, py });
    }
    anchor = { x: nx, y: ny };
    accumulator = 0;
  }

  function substep(ax, ay, dt) {
    const head = points[0];
    head.px = head.x;
    head.py = head.y;
    head.x = ax;
    head.y = ay;

    const g = o.gravity * dt * dt;
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const vx = (p.x - p.px) * o.damping;
      const vy = (p.y - p.py) * o.damping;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + g;
    }

    const last = points.length - 1;
    const L = o.segmentLength;
    for (let k = 0; k < o.iterations; k++) {
      for (let i = 0; i < last; i++) {
        const a = points[i];
        const b = points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        const diff = (dist - L) / dist;
        if (i === 0) {
          // The head is pinned: the neighbour takes the whole correction.
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
        }
      }
    }

    // Bend limit, root to tip: each segment is put back inside a cone of
    // ±maxBend around the previous one, at exactly its rest length. One pass is
    // exact because a segment only depends on the ones before it.
    for (let i = 0; i < last; i++) {
      const a = points[i];
      const b = points[i + 1];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      if (i >= 1) {
        const prev = points[i - 1];
        const rx = a.x - prev.x;
        const ry = a.y - prev.y;
        const bend = Math.atan2(rx * dy - ry * dx, rx * dx + ry * dy);
        const limit = maxBendRad[i];
        if (Math.abs(bend) > limit) {
          const heading = Math.atan2(ry, rx) + Math.sign(bend) * limit;
          dx = Math.cos(heading);
          dy = Math.sin(heading);
        }
      }
      const k = L / (Math.hypot(dx, dy) || 1e-6);
      b.x = a.x + dx * k;
      b.y = a.y + dy * k;
    }

    const tip = points[last];
    return Math.hypot(tip.x - tip.px, tip.y - tip.py) / dt;
  }

  /**
   * Advance the simulation by `frameDt` seconds towards anchor (ax, ay).
   * Returns the peak tip speed (px/s) reached during this frame.
   */
  function update(ax, ay, frameDt) {
    accumulator += Math.max(0, frameDt);
    let steps = Math.floor(accumulator / o.step);
    if (steps > o.maxSubsteps) {
      steps = o.maxSubsteps;
      accumulator = 0;
    } else {
      accumulator -= steps * o.step;
    }

    let peak = 0;
    const from = anchor;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const speed = substep(from.x + (ax - from.x) * t, from.y + (ay - from.y) * t, o.step);
      if (speed > peak) peak = speed;
    }
    if (steps > 0) anchor = { x: ax, y: ay };
    return peak;
  }

  /** How far the tip is thrown along direction (dx, dy), from the handle. */
  function reach(dx, dy) {
    const head = points[0];
    const tip = points[points.length - 1];
    return (tip.x - head.x) * dx + (tip.y - head.y) * dy;
  }

  /**
   * Pull every point towards the straight line leaving the handle along
   * (dx, dy); the tip is pulled hardest. Velocities follow (Verlet).
   */
  function steer(dx, dy, pull) {
    const head = points[0];
    const n = points.length - 1;
    for (let i = 1; i <= n; i++) {
      const p = points[i];
      const k = pull * (0.4 + (0.6 * i) / n);
      p.x += (head.x + dx * o.segmentLength * i - p.x) * k;
      p.y += (head.y + dy * o.segmentLength * i - p.y) * k;
    }
  }

  /** Deviation from straight (degrees) at every inner joint. */
  function jointAngles() {
    const out = [];
    for (let i = 1; i < points.length - 1; i++) {
      const ax = points[i].x - points[i - 1].x;
      const ay = points[i].y - points[i - 1].y;
      const bx = points[i + 1].x - points[i].x;
      const by = points[i + 1].y - points[i].y;
      out.push(Math.abs((Math.atan2(ax * by - ay * bx, ax * bx + ay * by) * 180) / Math.PI));
    }
    return out;
  }

  reset(x, y);

  return {
    points,
    maxBend,
    reset,
    update,
    reach,
    steer,
    jointAngles,
    get tip() {
      return points[points.length - 1];
    },
    get length() {
      return o.segments * o.segmentLength;
    },
  };
}
