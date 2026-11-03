// 8-bit sound synthesis, as plain sample arrays (mirrors fouet.py).

export const SAMPLE_RATE = 22050;
export const TIER_NOTES = Object.freeze([[988, 1319], [988, 1319, 1568], [1319, 1568, 2093, 2637]]);

const square = (phase, duty = 0.5) => ((phase % 1) < duty ? 1 : -1);

/** Small seeded PRNG so the crack sounds the same every time. */
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Crunchy crack: sample-and-hold noise snap plus a falling square chirp, 4-bit. */
export function synthCrack(intensity = 0.5, rate = SAMPLE_RATE, random = mulberry32(7)) {
  const n = Math.floor(rate * 0.14);
  const out = new Float32Array(n);
  let held = 0;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    if (i % 3 === 0) held = random() * 2 - 1;
    const noise = held * Math.exp(-t / (0.012 + 0.01 * intensity));
    phase += (2600 - 2200 * Math.min(1, t / 0.05)) / rate;
    const chirp = square(phase) * 0.4 * Math.exp(-t / 0.03);
    out[i] = Math.round((noise * (0.75 + 0.25 * intensity) + chirp) * 0.7 * 8) / 8;
  }
  return out;
}

/** Coin-like square arpeggio, longer and higher with the combo tier. */
export function synthBlip(tier, rate = SAMPLE_RATE) {
  const notes = TIER_NOTES[Math.max(0, Math.min(TIER_NOTES.length - 1, tier))];
  const per = Math.floor(rate * 0.055);
  const out = new Float32Array(per * notes.length);
  let phase = 0;
  notes.forEach((freq, j) => {
    for (let i = 0; i < per; i++) {
      phase += freq / rate;
      out[j * per + i] = square(phase, 0.25) * 0.35 * Math.sqrt(1 - i / per);
    }
  });
  return out;
}

/** Add `b` into a copy of `a`, starting at sample `offset`. */
export function mix(a, b, offset) {
  const out = new Float32Array(Math.max(a.length, offset + b.length));
  out.set(a);
  b.forEach((s, i) => { out[offset + i] += s; });
  return out;
}
