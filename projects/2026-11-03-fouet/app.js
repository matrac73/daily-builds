import { createEffects, mount } from './src/fouet.js';
import { bookmarkletHref } from './src/bookmarklet.js';
import { createWhip } from './src/whip.js';
import { createFlickDetector, createLashSnap, crackIntensity } from './src/crack.js';
import { PALETTE, unkey, whipSprite } from './src/pixel.js';
import { PHRASES } from './src/phrases.js';

mount();

const link = document.getElementById('bookmarklet');
try {
  link.href = bookmarkletHref(new URL('./src/fouet.js', location.href).href);
  // Clicking it here would only toggle the whip already on this page: nudge instead.
  link.addEventListener('click', (e) => {
    e.preventDefault();
    link.classList.add('nudge');
    link.addEventListener('animationend', () => link.classList.remove('nudge'), { once: true });
  });
} catch {
  link.replaceWith(Object.assign(document.createElement('p'), {
    className: 'note',
    textContent: 'Serve this page over http(s) to get the bookmarklet (see README).',
  }));
}

// Hero demo: a scripted hand swings and stops dead; the real crack rule decides.
const demo = document.getElementById('demo');
const ctx = demo.getContext('2d');
const CELL = 4;
const W = demo.width * CELL;
const MOVES = [
  { to: [420, 170], dur: 0.2, hold: 0.9 },
  { to: [170, 230], dur: 0.22, hold: 0.9 },
  { to: [440, 260], dur: 0.18, hold: 1.0 },
];
const LOOP = MOVES.reduce((s, m) => s + m.dur + m.hold, 0);
const START = [170, 230];

function handAt(t) {
  let from = START;
  let time = t % LOOP;
  for (const m of MOVES) {
    if (time < m.dur) {
      const k = time / m.dur;
      const e = k * k * (3 - 2 * k) * 0.25 + k * 0.75; // fast swing, hard stop
      return [from[0] + (m.to[0] - from[0]) * e, from[1] + (m.to[1] - from[1]) * e];
    }
    time -= m.dur;
    if (time < m.hold) return m.to;
    time -= m.hold;
    from = m.to;
  }
  return from;
}

const hilt = ([x, y]) => ({ x: x + 20, y: y - 36 });
const whip = createWhip(hilt(START).x, hilt(START).y, { segments: 16, segmentLength: 13 });
const detector = createFlickDetector({ minSpeed: 900 });
const snap = createLashSnap();
const effects = createEffects();
let crackCount = 0;
let prev = START;
let last = 0;
let clock = 0;

function render(hand) {
  ctx.fillStyle = PALETTE.outline;
  ctx.fillRect(0, 0, demo.width, demo.height);
  const cells = whipSprite(whip.points, { x: hand[0], y: hand[1] }, hilt(hand), CELL);
  effects.draw(cells);
  for (const [k, color] of cells) {
    const [x, y] = unkey(k);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  if (dt <= 0 || document.hidden) return;
  clock += dt;
  const hand = handAt(clock);
  const h = hilt(hand);
  whip.update(h.x, h.y, dt);
  const flick = detector.update((hand[0] - prev[0]) / dt, (hand[1] - prev[1]) / dt, now);
  prev = hand;
  if (flick) snap.start(flick, now);
  const done = snap.update(whip, now);
  if (done) {
    const tip = whip.tip;
    const tier = Math.floor(crackCount / 2) % PHRASES.length;
    const pool = PHRASES[tier];
    effects.burst(tip.x, tip.y, crackIntensity(done.speed, 900));
    effects.label(pool[crackCount % pool.length], Math.min(W - 120, Math.max(120, tip.x)), tip.y, PALETTE.tiers[tier], 1);
    crackCount += 1;
  }
  effects.step(dt);
  render(hand);
}

if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  for (let i = 0; i < 60; i++) whip.update(hilt(START).x, hilt(START).y, 1 / 60);
  render(START);
} else {
  requestAnimationFrame(frame);
}
