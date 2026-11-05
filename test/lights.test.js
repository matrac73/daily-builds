import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BULB_COUNT, DEFAULT_COLORS, IDLE_OPACITY, LIMITS,
  activeIndex, bulbAppearance, clamp, createTicker, defaultBulbs, hexToRgb, limit,
} from '../src/lights.js';

/** Fake timer pair that records calls and lets tests fire ticks manually. */
function fakeTimers() {
  const timers = new Map();
  let nextId = 1;
  return {
    timers,
    setTimer(fn, delay) {
      const id = nextId++;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    fire(times = 1) {
      for (let i = 0; i < times; i++) [...timers.values()].forEach((t) => t.fn());
    },
  };
}

describe('clamp / limit', () => {
  test('clamps into range', () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-3, 0, 10), 0);
    assert.equal(clamp(42, 0, 10), 10);
  });

  test('accepts numeric strings and falls back on garbage', () => {
    assert.equal(clamp('7', 0, 10), 7);
    assert.equal(clamp('abc', 0, 10, 4), 4);
    assert.equal(clamp('', 0, 10, 4), 4);
    assert.equal(clamp(null, 0, 10, 4), 4);
    assert.equal(clamp(undefined, 0, 10, 4), 4);
  });

  test('limit uses named bounds, rounds and defaults', () => {
    assert.equal(limit('rows', 0), 1);
    assert.equal(limit('rows', 9), 7);
    assert.equal(limit('rows', 3.6), 4);
    assert.equal(limit('interval', 'nope'), LIMITS.interval.default);
    assert.equal(limit('intensity', 150), 100);
  });
});

describe('activeIndex', () => {
  test('walks along the row and wraps around', () => {
    const seen = Array.from({ length: 9 }, (_, step) => activeIndex(step, 0));
    assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 6, 0, 1]);
  });

  test('each row is offset by one bulb', () => {
    assert.equal(activeIndex(0, 1), 1);
    assert.equal(activeIndex(0, 6), 6);
    assert.equal(activeIndex(2, 6), 1);
  });

  test('only one bulb per row is lit, so the predecessor returns to normal', () => {
    for (let step = 0; step < 20; step++) {
      const lit = Array.from({ length: BULB_COUNT }, (_, i) => i === activeIndex(step, 0));
      assert.equal(lit.filter(Boolean).length, 1);
    }
  });

  test('handles negative steps and empty rows', () => {
    assert.equal(activeIndex(-1, 0), 6);
    assert.equal(activeIndex(3, 0, 0), -1);
  });
});

describe('hexToRgb', () => {
  test('parses 6- and 3-digit colours', () => {
    assert.deepEqual(hexToRgb('#ff9f1c'), { r: 255, g: 159, b: 28 });
    assert.deepEqual(hexToRgb('#0F0'), { r: 0, g: 255, b: 0 });
  });

  test('rejects invalid colours', () => {
    assert.throws(() => hexToRgb('red'), TypeError);
    assert.throws(() => hexToRgb('#12345'), TypeError);
  });
});

describe('bulbAppearance', () => {
  test('idle bulbs sit at normal intensity with no glow', () => {
    const look = bulbAppearance({ color: '#ff0000', size: 56, intensity: 100, active: false });
    assert.deepEqual(look, { size: 56, color: '#ff0000', opacity: IDLE_OPACITY, glow: 'none' });
  });

  test('a fully bright bulb is opaque with a glow sized to the bulb', () => {
    const look = bulbAppearance({ color: '#ff0000', size: 40, intensity: 100, active: true });
    assert.equal(look.opacity, 1);
    assert.equal(look.glow, '0 0 40px 10px rgba(255, 0, 0, 1)');
  });

  test('brightness grows with intensity', () => {
    const at = (intensity) => bulbAppearance({ color: '#00ff00', size: 56, intensity, active: true }).opacity;
    assert.ok(at(20) < at(50));
    assert.ok(at(50) < at(90));
  });

  test('zero intensity looks like an idle bulb', () => {
    const look = bulbAppearance({ color: '#00ff00', size: 56, intensity: 0, active: true });
    assert.equal(look.opacity, IDLE_OPACITY);
    assert.equal(look.glow, 'none');
  });

  test('size is clamped to the allowed range', () => {
    assert.equal(bulbAppearance({ color: '#000', size: 1, intensity: 50, active: false }).size, LIMITS.size.min);
    assert.equal(bulbAppearance({ color: '#000', size: 999, intensity: 50, active: false }).size, LIMITS.size.max);
  });
});

test('defaultBulbs returns seven fresh rainbow bulbs', () => {
  const a = defaultBulbs();
  assert.equal(a.length, BULB_COUNT);
  assert.deepEqual(a.map((b) => b.color), [...DEFAULT_COLORS]);
  a[0].color = '#000000';
  assert.equal(defaultBulbs()[0].color, DEFAULT_COLORS[0]);
});

describe('createTicker', () => {
  test('starts, ticks and stops', () => {
    const t = fakeTimers();
    const steps = [];
    const ticker = createTicker((s) => steps.push(s), { interval: 200, ...t });

    assert.equal(ticker.running, false);
    ticker.start();
    assert.equal(ticker.running, true);
    assert.equal([...t.timers.values()][0].delay, 200);

    t.fire(3);
    assert.deepEqual(steps, [1, 2, 3]);

    ticker.stop();
    assert.equal(ticker.running, false);
    assert.equal(t.timers.size, 0);
    t.fire();
    assert.deepEqual(steps, [1, 2, 3]);
  });

  test('start is idempotent and toggle flips the state', () => {
    const t = fakeTimers();
    const ticker = createTicker(() => {}, t);
    ticker.start().start();
    assert.equal(t.timers.size, 1);
    ticker.toggle();
    assert.equal(ticker.running, false);
    ticker.toggle();
    assert.equal(ticker.running, true);
  });

  test('step survives stop/start so the ripple resumes where it paused', () => {
    const t = fakeTimers();
    const ticker = createTicker(() => {}, t).start();
    t.fire(4);
    ticker.stop().start();
    t.fire();
    assert.equal(ticker.step, 5);
  });

  test('changing the interval restarts a running timer with the new delay', () => {
    const t = fakeTimers();
    const ticker = createTicker(() => {}, { interval: 300, ...t }).start();
    ticker.setInterval(120);
    assert.equal(ticker.interval, 120);
    assert.equal(t.timers.size, 1);
    assert.equal([...t.timers.values()][0].delay, 120);
  });

  test('changing the interval while stopped does not start it', () => {
    const t = fakeTimers();
    const ticker = createTicker(() => {}, t);
    ticker.setInterval(10);
    assert.equal(ticker.running, false);
    assert.equal(ticker.interval, LIMITS.interval.min);
    ticker.start();
    assert.equal([...t.timers.values()][0].delay, LIMITS.interval.min);
  });
});
