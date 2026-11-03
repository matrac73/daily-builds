// Browser layer: overlay canvas, toggle button, rendering, sound and typing.
// Usable as a module on any page: `import { mount } from './src/fouet.js'`.

import { createWhip } from './whip.js';
import { createCrackDetector, crackIntensity } from './crack.js';
import { createCombo, createPhrasePicker, tierForCombo } from './phrases.js';
import { findWhippable, insertPhrase, spacedPhrase } from './text.js';

const HANDLE_LENGTH = 54;
const HANDLE_ANGLE = -Math.PI / 3; // resting handle points up-right
const LASH_WIDTH = [7, 1.4];
const ACTIVE_CLASS = 'fouet-active';
const TIER_COLORS = ['#ffd166', '#ff8c42', '#ff3b5c'];

const BUTTON_CSS = `
  :host { all: initial; }
  button {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
    width: 60px; height: 60px; border-radius: 50%; border: 0; padding: 0;
    display: grid; place-items: center; cursor: pointer;
    background: radial-gradient(circle at 30% 30%, #3a2a20, #120c09);
    color: #f4d6a8; box-shadow: 0 8px 24px rgba(0,0,0,.45), inset 0 0 0 2px rgba(244,214,168,.25);
    transition: transform .15s ease, box-shadow .2s ease;
  }
  button:hover { transform: scale(1.07); }
  button:focus-visible { outline: 3px solid #ffd166; outline-offset: 3px; }
  button[aria-pressed="true"] {
    background: radial-gradient(circle at 30% 30%, #ff6b3d, #9b1d20);
    color: #fff; animation: pulse 1.6s ease-in-out infinite;
  }
  svg { width: 32px; height: 32px; }
  .count {
    position: absolute; top: -4px; right: -4px; min-width: 22px; height: 22px; padding: 0 5px;
    border-radius: 11px; background: #ffd166; color: #1a0f08;
    font: 700 12px/22px system-ui, sans-serif; text-align: center; box-sizing: border-box;
  }
  .count:empty { display: none; }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 8px 24px rgba(0,0,0,.45), 0 0 0 0 rgba(255,107,61,.55); }
    50% { box-shadow: 0 8px 24px rgba(0,0,0,.45), 0 0 0 12px rgba(255,107,61,0); }
  }
  @media (prefers-reduced-motion: reduce) { button[aria-pressed="true"] { animation: none; } }
`;

const WHIP_ICON = `
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">
    <path d="M6 27 L12 19" stroke-width="4"/>
    <path d="M12 19 C 18 11, 27 14, 25 6 C 24 3, 20 4, 21 7" stroke-width="2"/>
    <path d="M21 7 l-2 -2 M21 7 l-3 0" stroke-width="1.2"/>
  </svg>`;

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Synthesised crack: a filtered noise burst with a very sharp attack. */
function createCrackSound() {
  let ctx = null;
  let noise = null;
  return {
    unlock() {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      ctx ??= new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      if (!noise) {
        noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
    },
    play(intensity) {
      if (!ctx || !noise) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.playbackRate.value = 0.9 + Math.random() * 0.3;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1400 + intensity * 1200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35 + intensity * 0.5, t + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09 + intensity * 0.08);
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start(t);
      src.stop(t + 0.25);
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
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const result = insertPhrase(el.value, start, end, phrase);
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

/**
 * Mount the whip on the current page. Idempotent: a second call returns the
 * existing instance (handy for the bookmarklet).
 */
export function mount({ threshold = 2400, sound = true } = {}) {
  if (window.__fouet) return window.__fouet;

  const style = document.createElement('style');
  style.textContent = `html.${ACTIVE_CLASS}, html.${ACTIVE_CLASS} * { cursor: none !important; }`;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100vw', height: '100vh',
    pointerEvents: 'none', zIndex: '2147483646', display: 'none',
  });
  const g = canvas.getContext('2d');

  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${BUTTON_CSS}</style>
    <button type="button" aria-pressed="false" title="Fouet — Alt+W">${WHIP_ICON}<span class="count"></span></button>`;
  const button = shadow.querySelector('button');
  const counter = shadow.querySelector('.count');

  document.head.append(style);
  document.body.append(canvas, host);

  const detector = createCrackDetector({ threshold });
  const combo = createCombo();
  const picker = createPhrasePicker();
  const audio = createCrackSound();
  const reducedMotion = prefersReducedMotion();

  let active = false;
  let whip = null;
  let frame = 0;
  let lastTime = 0;
  let hits = 0;
  const mouse = { x: 0, y: 0, seen: false };
  const handle = { angle: HANDLE_ANGLE, lastX: 0 };
  const sparks = [];
  const rings = [];
  const labels = [];
  const trail = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function handleEnd() {
    return {
      x: mouse.x + Math.cos(handle.angle) * HANDLE_LENGTH,
      y: mouse.y + Math.sin(handle.angle) * HANDLE_LENGTH,
    };
  }

  function onPointerMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (!mouse.seen) {
      mouse.seen = true;
      handle.lastX = mouse.x;
      if (whip) {
        const end = handleEnd();
        whip.reset(end.x, end.y);
      }
    }
  }

  function strike(x, y, speed, now) {
    const intensity = crackIntensity(speed, threshold);
    if (sound) audio.play(intensity);
    rings.push({ x, y, age: 0, life: 0.35, max: 34 + intensity * 40 });
    const count = 10 + Math.round(intensity * 14);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 140 + Math.random() * (260 + intensity * 420);
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.25 + Math.random() * 0.3 });
    }

    const target = findWhippable(document.elementFromPoint(x, y));
    if (!target) return;

    const tier = tierForCombo(combo.hit(now));
    const phrase = picker.pick(tier);
    typeInto(target, phrase);
    hits += 1;
    counter.textContent = String(hits);
    labels.push({
      text: phrase, x, y, age: 0, life: 1.1, color: TIER_COLORS[tier],
      size: 26 + tier * 8, tilt: (Math.random() - 0.5) * 0.35,
    });
    if (!reducedMotion) {
      target.animate(
        [
          { transform: 'translate(0,0)' },
          { transform: `translate(${-6 - tier * 3}px, 2px) rotate(-0.6deg)` },
          { transform: `translate(${5 + tier * 3}px, -2px) rotate(0.5deg)` },
          { transform: 'translate(0,0)' },
        ],
        { duration: 220, easing: 'ease-out' },
      );
    }
  }

  function drawHandle(end) {
    g.lineCap = 'round';
    g.strokeStyle = '#140b06';
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(mouse.x, mouse.y);
    g.lineTo(end.x, end.y);
    g.stroke();
    const grad = g.createLinearGradient(mouse.x, mouse.y, end.x, end.y);
    grad.addColorStop(0, '#5b3a22');
    grad.addColorStop(1, '#a8743f');
    g.strokeStyle = grad;
    g.lineWidth = 9;
    g.stroke();
    // Leather wraps on the grip.
    g.strokeStyle = 'rgba(20,11,6,.65)';
    g.lineWidth = 2;
    const nx = -Math.sin(handle.angle) * 5;
    const ny = Math.cos(handle.angle) * 5;
    for (let i = 1; i <= 4; i++) {
      const t = i / 6;
      const cx = mouse.x + (end.x - mouse.x) * t;
      const cy = mouse.y + (end.y - mouse.y) * t;
      g.beginPath();
      g.moveTo(cx - nx, cy - ny);
      g.lineTo(cx + nx + (end.x - mouse.x) * 0.04, cy + ny + (end.y - mouse.y) * 0.04);
      g.stroke();
    }
    g.fillStyle = '#d9a35b';
    g.beginPath();
    g.arc(end.x, end.y, 4, 0, Math.PI * 2);
    g.fill();
  }

  // Smooth lash: quadratic curves through segment midpoints, tapering width.
  function strokeLash(points, color, widthScale, offset) {
    const n = points.length - 1;
    g.strokeStyle = color;
    g.lineCap = 'round';
    for (let i = 1; i < n; i++) {
      const a = points[i - 1];
      const b = points[i];
      const c = points[i + 1];
      const t = i / n;
      g.lineWidth = (LASH_WIDTH[0] + (LASH_WIDTH[1] - LASH_WIDTH[0]) * t) * widthScale;
      g.beginPath();
      g.moveTo((a.x + b.x) / 2 + offset, (a.y + b.y) / 2 + offset);
      g.quadraticCurveTo(b.x + offset, b.y + offset, (b.x + c.x) / 2 + offset, (b.y + c.y) / 2 + offset);
      g.stroke();
    }
  }

  function drawWhip() {
    const pts = whip.points;
    strokeLash(pts, 'rgba(0,0,0,.22)', 1, 5);
    strokeLash(pts, '#1a0f08', 1.35, 0);
    strokeLash(pts, '#8a5a32', 1, 0);
    strokeLash(pts, 'rgba(255,214,160,.35)', 0.3, -0.8);

    // Frayed cracker at the very tip.
    const tip = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const a = Math.atan2(tip.y - prev.y, tip.x - prev.x);
    g.strokeStyle = '#e8d2b0';
    g.lineWidth = 1;
    for (const da of [-0.35, 0, 0.35]) {
      g.beginPath();
      g.moveTo(tip.x, tip.y);
      g.lineTo(tip.x + Math.cos(a + da) * 9, tip.y + Math.sin(a + da) * 9);
      g.stroke();
    }

    if (trail.length > 1) {
      g.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        g.strokeStyle = `rgba(255,236,200,${(i / trail.length) * 0.5})`;
        g.lineWidth = (i / trail.length) * 3;
        g.beginPath();
        g.moveTo(trail[i - 1].x, trail[i - 1].y);
        g.lineTo(trail[i].x, trail[i].y);
        g.stroke();
      }
    }
  }

  function drawEffects(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.age += dt;
      if (r.age >= r.life) { rings.splice(i, 1); continue; }
      const k = r.age / r.life;
      g.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.9})`;
      g.lineWidth = 3 * (1 - k) + 0.5;
      g.beginPath();
      g.arc(r.x, r.y, r.max * (1 - (1 - k) ** 3), 0, Math.PI * 2);
      g.stroke();
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      if (s.age >= s.life) { sparks.splice(i, 1); continue; }
      s.vx *= 0.9;
      s.vy = s.vy * 0.9 + 600 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const k = 1 - s.age / s.life;
      g.strokeStyle = `rgba(255,${180 + Math.round(75 * k)},90,${k})`;
      g.lineWidth = 2 * k + 0.3;
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
      g.stroke();
    }

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = labels.length - 1; i >= 0; i--) {
      const l = labels[i];
      l.age += dt;
      if (l.age >= l.life) { labels.splice(i, 1); continue; }
      const k = l.age / l.life;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : 1.15 - Math.min(0.15, (k - 0.15) * 0.5);
      g.save();
      g.translate(l.x, l.y - 30 - k * 60);
      g.rotate(l.tilt);
      g.scale(pop, pop);
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      g.font = `italic 900 ${l.size}px "Arial Black", system-ui, sans-serif`;
      g.lineJoin = 'round';
      g.lineWidth = 6;
      g.strokeStyle = '#1a0f08';
      g.strokeText(l.text, 0, 0);
      g.fillStyle = l.color;
      g.fillText(l.text, 0, 0);
      g.restore();
    }
  }

  function tick(now) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
    lastTime = now;
    g.clearRect(0, 0, innerWidth, innerHeight);
    if (!mouse.seen) return;

    // The handle leans with horizontal motion, like a real wrist flick.
    const vx = dt > 0 ? (mouse.x - handle.lastX) / dt : 0;
    handle.lastX = mouse.x;
    const lean = Math.max(-0.9, Math.min(0.9, vx * 0.0006));
    handle.angle += (HANDLE_ANGLE + lean - handle.angle) * Math.min(1, dt * 14);

    const end = handleEnd();
    const speed = whip.update(end.x, end.y, dt);
    const tip = whip.tip;
    // Motion streak behind the tip, only while it moves fast.
    if (speed >= threshold * 0.4) {
      trail.push({ x: tip.x, y: tip.y });
      if (trail.length > 8) trail.shift();
    } else {
      trail.length = 0;
    }

    if (detector.update(speed, now)) strike(tip.x, tip.y, speed, now);

    drawWhip();
    drawHandle(end);
    drawEffects(dt);
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
      const end = handleEnd();
      whip = createWhip(end.x, end.y);
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frame);
      sparks.length = rings.length = labels.length = trail.length = 0;
      g.clearRect(0, 0, innerWidth, innerHeight);
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
