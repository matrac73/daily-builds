/**
 * Pure, DOM-free logic for the Christmas Lights display.
 * Everything here is deterministic so it can be unit-tested with `node --test`.
 */

export const BULB_COUNT = 7;

export const DEFAULT_COLORS = Object.freeze([
  '#ff3b3b', // red
  '#ff9f1c', // orange
  '#ffe14d', // yellow
  '#3ddc63', // green
  '#2ee6e6', // cyan
  '#3b82ff', // blue
  '#e040fb', // magenta
]);

export const LIMITS = Object.freeze({
  interval: { min: 50, max: 2000, default: 300 },
  intensity: { min: 0, max: 100, default: 80 },
  rows: { min: 1, max: 7, default: 1 },
  size: { min: 24, max: 96, default: 56 },
});

/** Opacity of a bulb that is not lit: the "normal intensity". */
export const IDLE_OPACITY = 0.35;

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Clamp `value` into [min, max]; non-numeric input falls back to `fallback`. */
export function clamp(value, min, max, fallback = min) {
  const n = Number(value);
  if (value === '' || value === null || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Clamp a value against one of the named LIMITS and round it to an integer. */
export function limit(name, value) {
  const { min, max, default: fallback } = LIMITS[name];
  return Math.round(clamp(value, min, max, fallback));
}

/**
 * Index of the lit bulb for a given tick and row.
 * Each row is shifted by one bulb so stacked rows form a diagonal ripple.
 */
export function activeIndex(step, row, count = BULB_COUNT) {
  if (count <= 0) return -1;
  return (((step + row) % count) + count) % count;
}

/** Expand a 3- or 6-digit hex colour to `{ r, g, b }`. Throws on invalid input. */
export function hexToRgb(hex) {
  if (!HEX_COLOR.test(hex)) throw new TypeError(`Invalid hex colour: ${hex}`);
  let digits = hex.slice(1);
  if (digits.length === 3) digits = [...digits].map((d) => d + d).join('');
  const n = parseInt(digits, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Visual style of one bulb.
 * An idle bulb sits at IDLE_OPACITY with no glow; a lit bulb's opacity and
 * halo grow with `intensity` (0-100).
 */
export function bulbAppearance({ color, size, intensity, active }) {
  const px = limit('size', size);
  if (!active) {
    return { size: px, color, opacity: IDLE_OPACITY, glow: 'none' };
  }
  const level = limit('intensity', intensity) / 100;
  const { r, g, b } = hexToRgb(color);
  const opacity = +(IDLE_OPACITY + (1 - IDLE_OPACITY) * level).toFixed(3);
  const blur = Math.round(px * level);
  const spread = Math.round((px / 4) * level);
  const alpha = +(0.4 + 0.6 * level).toFixed(3);
  return {
    size: px,
    color,
    opacity,
    glow: level === 0 ? 'none' : `0 0 ${blur}px ${spread}px rgba(${r}, ${g}, ${b}, ${alpha})`,
  };
}

/** Default per-bulb configuration: the seven rainbow colours at default size. */
export function defaultBulbs() {
  return DEFAULT_COLORS.map((color) => ({ color, size: LIMITS.size.default }));
}

/**
 * Start/stop controller around a repeating timer.
 * Timer functions are injectable so the behaviour can be tested without real time.
 */
export function createTicker(onTick, {
  interval = LIMITS.interval.default,
  setTimer = globalThis.setInterval.bind(globalThis),
  clearTimer = globalThis.clearInterval.bind(globalThis),
} = {}) {
  let handle = null;
  let step = 0;
  let delay = limit('interval', interval);

  const tick = () => {
    step += 1;
    onTick(step);
  };

  const ticker = {
    get running() { return handle !== null; },
    get step() { return step; },
    get interval() { return delay; },
    start() {
      if (handle === null) handle = setTimer(tick, delay);
      return ticker;
    },
    stop() {
      if (handle !== null) clearTimer(handle);
      handle = null;
      return ticker;
    },
    toggle() {
      return handle === null ? ticker.start() : ticker.stop();
    },
    /** Change the delay; a running ticker is restarted so the change applies immediately. */
    setInterval(value) {
      delay = limit('interval', value);
      if (handle !== null) {
        clearTimer(handle);
        handle = setTimer(tick, delay);
      }
      return ticker;
    },
  };
  return ticker;
}
