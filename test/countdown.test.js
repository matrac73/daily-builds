// Pin the time zone so DST cases are deterministic on every machine.
process.env.TZ = 'Europe/Paris';

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { breakdown, parseLocalDateTime, validateEvent, MAX_DAYS } from '../src/countdown.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('breakdown', () => {
  test('splits a duration into days, hours, minutes and seconds', () => {
    const ms = 3 * DAY + 4 * HOUR + 5 * MINUTE + 6 * SECOND;
    assert.deepEqual(breakdown(ms), { days: 3, hours: 4, minutes: 5, seconds: 6, done: false });
  });

  test('rolls seconds into minutes, minutes into hours, hours into days', () => {
    assert.deepEqual(breakdown(DAY), { days: 1, hours: 0, minutes: 0, seconds: 0, done: false });
    assert.deepEqual(breakdown(DAY - SECOND), { days: 0, hours: 23, minutes: 59, seconds: 59, done: false });
  });

  test('decrements across every boundary one second at a time', () => {
    const start = 2 * DAY;
    const next = breakdown(start - SECOND);
    assert.deepEqual(next, { days: 1, hours: 23, minutes: 59, seconds: 59, done: false });
  });

  test('rounds partial seconds up so zero is shown only when reached', () => {
    assert.equal(breakdown(1).seconds, 1);
    assert.equal(breakdown(1).done, false);
    assert.equal(breakdown(59_001).minutes, 1);
  });

  test('is done at or after the target', () => {
    assert.deepEqual(breakdown(0), { days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
    assert.equal(breakdown(-5 * HOUR).done, true);
    assert.equal(breakdown(-5 * HOUR).hours, 0);
  });
});

describe('parseLocalDateTime', () => {
  test('defaults to local midnight when time is omitted', () => {
    const result = parseLocalDateTime('2027-03-14');
    assert.equal(result.ok, true);
    const d = result.date;
    assert.deepEqual(
      [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()],
      [2027, 2, 14, 0, 0, 0],
    );
  });

  test('accepts HH:MM and HH:MM:SS', () => {
    assert.equal(parseLocalDateTime('2027-03-14', '18:30').date.getMinutes(), 30);
    assert.equal(parseLocalDateTime('2027-03-14', '18:30:15').date.getSeconds(), 15);
  });

  test('rejects malformed dates', () => {
    for (const bad of ['', '14/03/2027', '2027-3-14', 'tomorrow']) {
      const result = parseLocalDateTime(bad);
      assert.equal(result.ok, false, bad);
      assert.equal(result.field, 'date');
    }
  });

  test('rejects dates that do not exist', () => {
    assert.equal(parseLocalDateTime('2027-02-29').ok, false);
    assert.equal(parseLocalDateTime('2027-13-01').ok, false);
    assert.equal(parseLocalDateTime('2027-04-31').ok, false);
    assert.equal(parseLocalDateTime('2028-02-29').ok, true, 'leap day');
  });

  test('rejects malformed or out-of-range times', () => {
    for (const bad of ['7pm', '24:00', '12:60', '12:30:60', '1:30']) {
      const result = parseLocalDateTime('2027-03-14', bad);
      assert.equal(result.ok, false, bad);
      assert.equal(result.field, 'time');
    }
  });

  test('rejects wall-clock times skipped by a DST change', () => {
    // Clocks in Paris jump from 02:00 to 03:00 on 28 March 2027.
    const result = parseLocalDateTime('2027-03-28', '02:30');
    assert.equal(result.ok, false);
    assert.match(result.message, /daylight-saving/);
    assert.equal(parseLocalDateTime('2027-03-28', '03:30').ok, true);
  });
});

describe('validateEvent', () => {
  const now = new Date(2026, 10, 10, 12, 0, 0).getTime();

  test('returns a trimmed event with its target timestamp', () => {
    const result = validateEvent({ name: '  Birthday  ', date: '2026-11-12', time: '' }, now);
    assert.equal(result.ok, true);
    assert.equal(result.event.name, 'Birthday');
    assert.equal(result.event.target, new Date(2026, 10, 12).getTime());
  });

  test('warns when the name is blank', () => {
    const result = validateEvent({ name: '   ', date: '2026-12-25' }, now);
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors.map((e) => e.field), ['name']);
  });

  test('warns when the name is too long', () => {
    const result = validateEvent({ name: 'x'.repeat(61), date: '2026-12-25' }, now);
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].field, 'name');
  });

  test('reports name and date problems together', () => {
    const result = validateEvent({ name: '', date: 'nope' }, now);
    assert.deepEqual(result.errors.map((e) => e.field), ['name', 'date']);
  });

  test('reports invalid times on the time field', () => {
    const result = validateEvent({ name: 'Launch', date: '2026-12-25', time: '25:00' }, now);
    assert.deepEqual(result.errors.map((e) => e.field), ['time']);
  });

  test('rejects events in the past or right now', () => {
    assert.equal(validateEvent({ name: 'Old', date: '2026-11-09' }, now).ok, false);
    assert.equal(validateEvent({ name: 'Now', date: '2026-11-10', time: '12:00' }, now).ok, false);
    assert.equal(validateEvent({ name: 'Soon', date: '2026-11-10', time: '12:00:01' }, now).ok, true);
  });

  test('warns when the countdown would overflow the days display', () => {
    const atLimit = new Date(now + MAX_DAYS * DAY + 23 * HOUR);
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const ok = validateEvent({ name: 'Far', date: iso(atLimit), time: '00:00' }, now);
    assert.equal(ok.ok, true, 'last representable day is accepted');

    const tooFar = validateEvent({ name: 'Too far', date: '2060-01-01' }, now);
    assert.equal(tooFar.ok, false);
    assert.match(tooFar.errors[0].message, /9,999 days/);
  });
});
