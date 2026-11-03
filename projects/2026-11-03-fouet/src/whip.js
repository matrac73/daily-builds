// Verlet rope simulation of a whip lash. Pure logic: no DOM, fully testable.

export const WHIP_DEFAULTS = Object.freeze({
  segments: 24,
  segmentLength: 12,
  gravity: 1500, // px/s²
  damping: 0.995, // velocity kept per substep
  iterations: 16, // constraint relaxation passes per substep
  step: 1 / 120, // fixed physics timestep (s)
  maxSubsteps: 8, // cap per frame so a stalled tab does not spiral
});

/**
 * Create a whip whose first point is pinned to an anchor (the handle tip).
 * The anchor is interpolated across substeps, so fast mouse flicks transfer
 * smoothly along the lash and accelerate the tip — that is what makes it crack.
 */
export function createWhip(x, y, options = {}) {
  const o = { ...WHIP_DEFAULTS, ...options };
  const points = [];
  let anchor = { x, y };
  let target = { x, y };
  let accumulator = 0;

  function reset(nx, ny) {
    points.length = 0;
    for (let i = 0; i <= o.segments; i++) {
      const py = ny + i * o.segmentLength;
      points.push({ x: nx, y: py, px: nx, py });
    }
    anchor = { x: nx, y: ny };
    target = { x: nx, y: ny };
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

    for (let k = 0; k < o.iterations; k++) {
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        const diff = (dist - o.segmentLength) / dist;
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

    const tip = points[points.length - 1];
    return Math.hypot(tip.x - tip.px, tip.y - tip.py) / dt;
  }

  /**
   * Advance the simulation by `frameDt` seconds towards anchor (ax, ay).
   * Returns the peak tip speed (px/s) reached during this frame.
   */
  function update(ax, ay, frameDt) {
    target = { x: ax, y: ay };
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
      const speed = substep(
        from.x + (target.x - from.x) * t,
        from.y + (target.y - from.y) * t,
        o.step,
      );
      if (speed > peak) peak = speed;
    }
    if (steps > 0) anchor = target;
    return peak;
  }

  reset(x, y);

  return {
    points,
    reset,
    update,
    get tip() {
      return points[points.length - 1];
    },
    get length() {
      return o.segments * o.segmentLength;
    },
  };
}
