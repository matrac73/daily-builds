// Browser layer: pixel overlay, toggle button, 8-bit sound and typing.
// Usable as a module on any page: `import { mount } from './src/fouet.js'`.

import { createWhip } from './whip.js';
import { createFlickDetector, createLashSnap, createVelocityTracker, crackIntensity } from './crack.js';
import { createCombo, createPhrasePicker, tierForCombo } from './phrases.js';
import { findWhippable, insertPhrase, spacedPhrase } from './text.js';
import {
  N8, PALETTE, addOutline, circleCells, ditherKeep, iconCells, key, textCells, unkey, whipSprite,
} from './pixel.js';
import { SAMPLE_RATE, TIER_NOTES, mix, synthBlip, synthCrack } from './sound.js';

const CELL = 4; // CSS px per art pixel
const HANDLE_LENGTH = 44;
const HANDLE_ANGLE = -Math.PI / 3; // resting handle points up-right
const ICON_SCALE = 4;
const ACTIVE_CLASS = 'fouet-active';

const BUTTON_CSS = `
  :host { all: initial; }
  button {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
    width: 64px; height: 64px; border: 0; padding: 0; background: none; cursor: pointer;
    filter: drop-shadow(4px 4px 0 rgba(36,12,0,.35));
    transition: transform .08s steps(2);
  }
  button:hover { transform: translate(-2px, -2px); }
  button:active { transform: translate(2px, 2px); filter: none; }
  button:focus-visible { outline: 4px solid #ff5a0a; outline-offset: 4px; }
  canvas { width: 64px; height: 64px; image-rendering: pixelated; display: block; }
`;

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 8-bit crack and coin blips, synthesised once into AudioBuffers. */
function createSounds() {
  let ctx = null;
  const buffers = {};
  return {
    unlock() {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx ??= new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      if (buffers.miss) return;
      const crack = synthCrack(0.6);
      const bank = { miss: crack };
      TIER_NOTES.forEach((_, tier) => {
        bank[`hit${tier}`] = mix(crack, synthBlip(tier), Math.floor(SAMPLE_RATE * 0.05));
      });
      for (const [name, samples] of Object.entries(bank)) {
        const buf = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
        buf.copyToChannel(samples, 0);
        buffers[name] = buf;
      }
    },
    play(name) {
      if (!ctx || !buffers[name]) return;
      const src = ctx.createBufferSource();
      src.buffer = buffers[name];
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      src.connect(gain).connect(ctx.destination);
      src.start();
    },
  };
}

/** Type `phrase` into an input, textarea or contenteditable element. */
function typeInto(el, phrase) {
  const isField = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
  const wasFocused = document.activeElement === el;
  el.focus({ preventScroll: true });
  const selection = getSelection();

  if (isField) {
    if (!wasFocused) el.setSelectionRange(el.value.length, el.value.length);
  } else if (!wasFocused || !selection.rangeCount || !el.contains(selection.anchorNode)) {
    selection.selectAllChildren(el);
    selection.collapseToEnd();
  }

  if (isField) {
    const result = insertPhrase(el.value, el.selectionStart, el.selectionEnd, phrase);
    // execCommand keeps native undo and framework state (React, Vue…) in sync.
    if (!document.execCommand('insertText', false, result.text)) {
      el.value = result.value;
      el.setSelectionRange(result.caret, result.caret);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: result.text }));
    }
    return;
  }

  const range = selection.getRangeAt(0);
  const beforeRange = range.cloneRange();
  beforeRange.selectNodeContents(el);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  const afterRange = range.cloneRange();
  afterRange.selectNodeContents(el);
  afterRange.setStart(range.endContainer, range.endOffset);
  const text = spacedPhrase(beforeRange.toString(), afterRange.toString(), phrase);
  if (!document.execCommand('insertText', false, text)) {
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    selection.collapse(node, text.length);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }
}

/** Sparks, embers, shock rings, flashes and floating pixel labels (CSS px). */
export function createEffects() {
  const sparks = [];
  const rings = [];
  const flashes = [];
  const labels = [];

  const age = (list, dt, alive) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      it.age += dt;
      if (!alive(it)) list.splice(i, 1);
    }
  };

  return {
    burst(x, y, intensity) {
      rings.push({ x, y, age: 0, life: 0.3, max: 30 + 40 * intensity });
      flashes.push({ x, y, age: 0 });
      const count = 10 + Math.round(14 * intensity);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 150 + Math.random() * (150 + 450 * intensity);
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.25 + Math.random() * 0.3, g: 900 });
      }
    },
    ember(x, y) {
      sparks.push({
        x, y, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 80,
        age: 0, life: 0.2 + Math.random() * 0.25, g: -60,
      });
    },
    label(text, x, y, color, scale, life = 1.1) {
      labels.push({ text, x, y, color, scale, age: 0, life });
    },
    step(dt) {
      for (const s of sparks) {
        s.vx *= 0.9;
        s.vy = s.vy * 0.9 + s.g * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      age(sparks, dt, (s) => s.age < s.life);
      age(rings, dt, (r) => r.age < r.life);
      age(flashes, dt, (f) => f.age < 0.09);
      age(labels, dt, (l) => l.age < l.life);
    },
    clear() {
      sparks.length = rings.length = flashes.length = labels.length = 0;
    },
    draw(cells) {
      const { fire } = PALETTE;
      const cellOf = (x, y) => [Math.floor(x / CELL), Math.floor(y / CELL)];
      for (const s of sparks) {
        const k = s.age / s.life;
        cells.set(key(...cellOf(s.x, s.y)), fire[Math.min(fire.length - 1, Math.floor(k * fire.length))]);
      }
      for (const r of rings) {
        const k = r.age / r.life;
        const radius = Math.floor((r.max * (1 - (1 - k) ** 3)) / CELL);
        const color = fire[Math.min(fire.length - 1, Math.floor(k * 4))];
        for (const [cx, cy] of circleCells(...cellOf(r.x, r.y), radius)) {
          if (ditherKeep(cx, cy, k)) cells.set(key(cx, cy), color);
        }
      }
      for (const f of flashes) {
        const [cx, cy] = cellOf(f.x, f.y);
        const reach = 2 + Math.floor(f.age * 40);
        for (let d = -reach; d <= reach; d++) {
          cells.set(key(cx + d, cy), PALETTE.cracker);
          cells.set(key(cx, cy + d), PALETTE.cracker);
        }
      }
      for (const l of labels) {
        const k = l.age / l.life;
        const { cells: glyphs, width, height } = textCells(l.text, l.scale);
        const [lx, ly] = cellOf(l.x, l.y);
        const ox = lx - Math.floor(width / 2);
        const oy = ly - height - 4 - Math.floor(k * 14);
        const fade = Math.max(0, (k - 0.55) / 0.45);
        const lit = new Map();
        for (const [gx, gy] of glyphs) {
          if (ditherKeep(ox + gx, oy + gy, fade)) lit.set(key(ox + gx, oy + gy), l.color);
        }
        addOutline(lit, PALETTE.outline, N8);
        for (const [k2, c] of lit) cells.set(k2, c);
      }
    },
  };
}

/**
 * Mount the whip on the current page. Idempotent: a second call returns the
 * existing instance (handy for the bookmarklet).
 */
export function mount({ minSpeed = 1100, sound = true } = {}) {
  if (window.__fouet) return window.__fouet;

  const style = document.createElement('style');
  style.textContent = `html.${ACTIVE_CLASS}, html.${ACTIVE_CLASS} * { cursor: none !important; }`;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '2147483646',
    display: 'none', imageRendering: 'pixelated',
  });
  const g = canvas.getContext('2d');

  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${BUTTON_CSS}</style>
    <button type="button" aria-pressed="false" title="Fouet — Alt+W"><canvas width="16" height="16"></canvas></button>`;
  const button = shadow.querySelector('button');
  const iconCtx = shadow.querySelector('canvas').getContext('2d');

  document.head.append(style);
  document.body.append(canvas, host);

  const detector = createFlickDetector({ minSpeed });
  const snap = createLashSnap();
  const combo = createCombo();
  const picker = createPhrasePicker();
  const audio = createSounds();
  const effects = createEffects();
  const reducedMotion = prefersReducedMotion();

  let active = false;
  let whip = null;
  let frame = 0;
  let lastTime = 0;
  let hits = 0;
  let iconState = '';
  const mouse = { x: 0, y: 0, seen: false };
  const hand = { vx: 0, vy: 0, angle: HANDLE_ANGLE };
  const velocity = createVelocityTracker();

  function resize() {
    canvas.width = Math.ceil(innerWidth / CELL);
    canvas.height = Math.ceil(innerHeight / CELL);
    canvas.style.width = `${canvas.width * CELL}px`;
    canvas.style.height = `${canvas.height * CELL}px`;
  }

  function drawCells(ctx, cells) {
    for (const [k, color] of cells) {
      const [x, y] = unkey(k);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  function drawIcon(now) {
    const spark = !active || reducedMotion || Math.floor(now / 125) % 2 === 0;
    const state = `${active}|${spark}|${hits}`;
    if (state === iconState) return;
    iconState = state;
    const cells = iconCells(active, spark);
    if (hits) {
      const { cells: digits, width, height } = textCells(String(Math.min(hits, 99)));
      const badge = new Map(digits.map(([x, y]) => [key(15 - width + x, 15 - height + y), PALETTE.cracker]));
      addOutline(badge, PALETTE.outline);
      for (const [k, c] of badge) {
        const [x, y] = unkey(k);
        if (x >= 0 && x < 16 && y >= 0 && y < 16) cells.set(k, c);
      }
    }
    iconCtx.clearRect(0, 0, 16, 16);
    drawCells(iconCtx, cells);
  }

  function hilt() {
    return {
      x: mouse.x + Math.cos(hand.angle) * HANDLE_LENGTH,
      y: mouse.y + Math.sin(hand.angle) * HANDLE_LENGTH,
    };
  }

  function onPointerMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (!mouse.seen) {
      mouse.seen = true;
      velocity.reset();
      if (whip) {
        const h = hilt();
        whip.reset(h.x, h.y);
      }
    }
  }

  function crack(flick, now) {
    const tip = whip.tip;
    effects.burst(tip.x, tip.y, crackIntensity(flick.speed, minSpeed));
    const target = findWhippable(document.elementFromPoint(tip.x, tip.y));
    if (!target) {
      effects.label('CLAC!', tip.x, tip.y, PALETTE.miss, 1, 0.45);
      if (sound) audio.play('miss');
      return;
    }
    const tier = tierForCombo(combo.hit(now));
    const phrase = picker.pick(tier);
    typeInto(target, phrase);
    hits += 1;
    effects.label(phrase, tip.x, tip.y, PALETTE.tiers[tier], tier === 2 ? 2 : 1);
    if (sound) audio.play(`hit${tier}`);
    if (!reducedMotion) {
      const s = 4 + tier * 4;
      target.animate(
        [
          { transform: 'translate(0,0)' },
          { transform: `translate(${-s}px, ${s / 2}px)` },
          { transform: `translate(${s}px, ${-s / 2}px)` },
          { transform: 'translate(0,0)' },
        ],
        { duration: 200, easing: 'steps(4)' },
      );
    }
  }

  function tick(now) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
    lastTime = now;
    drawIcon(now);
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (!mouse.seen || dt <= 0) return;

    // Hand velocity over a short time window: this is what the crack rule listens to.
    ({ vx: hand.vx, vy: hand.vy } = velocity.update(mouse.x, mouse.y, now));
    // The handle leans with horizontal motion, like a real wrist flick.
    const lean = Math.max(-0.9, Math.min(0.9, hand.vx * 0.0006));
    hand.angle += (HANDLE_ANGLE + lean - hand.angle) * Math.min(1, dt * 14);

    const h = hilt();
    const tipSpeed = whip.update(h.x, h.y, dt);
    const flick = detector.update(hand.vx, hand.vy, now);
    if (flick) snap.start(flick, now);
    const done = snap.update(whip, now);
    if (done) crack(done, now);
    if (tipSpeed > minSpeed * 1.5 && !reducedMotion) effects.ember(whip.tip.x, whip.tip.y);
    effects.step(dt);

    const cells = whipSprite(whip.points, mouse, h, CELL);
    effects.draw(cells);
    drawCells(g, cells);
  }

  function setActive(on) {
    if (on === active) return;
    active = on;
    button.setAttribute('aria-pressed', String(on));
    document.documentElement.classList.toggle(ACTIVE_CLASS, on);
    canvas.style.display = on ? 'block' : 'none';
    if (on) {
      if (sound) audio.unlock();
      resize();
      hand.angle = HANDLE_ANGLE;
      const h = hilt();
      whip = createWhip(h.x, h.y);
      detector.reset();
      velocity.reset();
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frame);
      effects.clear();
      g.clearRect(0, 0, canvas.width, canvas.height);
      drawIcon(performance.now());
    }
  }

  function onKeyDown(e) {
    if (e.altKey && e.code === 'KeyW') {
      e.preventDefault();
      setActive(!active);
    } else if (e.key === 'Escape' && active) {
      setActive(false);
    }
  }

  const onClick = () => setActive(!active);

  button.addEventListener('click', onClick);
  window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', resize);
  drawIcon(0);

  const api = {
    get active() {
      return active;
    },
    toggle() {
      setActive(!active);
    },
    destroy() {
      setActive(false);
      button.removeEventListener('click', onClick);
      window.removeEventListener('pointermove', onPointerMove, { capture: true });
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', resize);
      style.remove();
      canvas.remove();
      host.remove();
      delete window.__fouet;
    },
  };
  window.__fouet = api;
  return api;
}
