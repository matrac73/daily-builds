// Deterministic synthetic market data for tests.

/** Mulberry32 seeded PRNG. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/** Weekday dates starting 2020-01-01. */
export function tradingDates(n) {
  const out = [];
  const d = new Date('2020-01-01T00:00:00Z');
  while (out.length < n) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Bars whose log returns follow an AR(1) process r_t = phi * r_{t-1} + noise.
 * phi = 0 gives a pure random walk (unpredictable); phi != 0 gives exploitable autocorrelation.
 */
export function syntheticBars(n, { phi = 0, sigma = 0.01, seed = 1 } = {}) {
  const rand = rng(seed);
  const dates = tradingDates(n);
  let close = 100;
  let prev = 0;
  return dates.map((date) => {
    const r = phi * prev + sigma * gaussian(rand);
    prev = r;
    const open = close * Math.exp(sigma * 0.2 * gaussian(rand));
    close *= Math.exp(r);
    const high = Math.max(open, close) * (1 + 0.005 * rand());
    const low = Math.min(open, close) * (1 - 0.005 * rand());
    return { date, open, high, low, close, volume: Math.round(1e6 * (1 + rand())) };
  });
}
