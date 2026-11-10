// Pure countdown logic: input validation and time breakdown.
// Uses only the built-in Date object — no date libraries.

/** Largest day count the four-digit "days" display can show. */
export const MAX_DAYS = 9999;
export const MAX_NAME_LENGTH = 60;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Split a remaining duration into days, hours, minutes and seconds.
 * Seconds are rounded up so the display reaches 00:00:00:00 exactly
 * at the event moment, never a second early.
 * @param {number} remainingMs
 */
export function breakdown(remainingMs) {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  return {
    days: Math.floor(total / SECONDS_PER_DAY),
    hours: Math.floor((total % SECONDS_PER_DAY) / SECONDS_PER_HOUR),
    minutes: Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
    seconds: total % SECONDS_PER_MINUTE,
    done: total === 0,
  };
}

/**
 * Build a local-time Date from "YYYY-MM-DD" and an optional "HH:MM[:SS]".
 * A missing time means midnight. Returns an error for impossible dates
 * (e.g. 2026-02-30) and for wall-clock times skipped by a DST change.
 * @param {string} dateStr
 * @param {string} [timeStr]
 * @returns {{ ok: true, date: Date } | { ok: false, field: 'date' | 'time', message: string }}
 */
export function parseLocalDateTime(dateStr, timeStr = '') {
  const dateMatch = DATE_PATTERN.exec(dateStr.trim());
  if (!dateMatch) {
    return { ok: false, field: 'date', message: 'Enter a date in the format YYYY-MM-DD.' };
  }
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    return { ok: false, field: 'date', message: 'That date does not exist on the calendar.' };
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  const time = timeStr.trim();
  if (time) {
    const timeMatch = TIME_PATTERN.exec(time);
    if (!timeMatch) {
      return { ok: false, field: 'time', message: 'Enter a time in the format HH:MM (24-hour).' };
    }
    [hours, minutes, seconds] = timeMatch.slice(1).map((part) => Number(part ?? 0));
    if (hours > 23 || minutes > 59 || seconds > 59) {
      return { ok: false, field: 'time', message: 'That time is out of range (00:00 to 23:59).' };
    }
  }

  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  if (date.getHours() !== hours || date.getMinutes() !== minutes) {
    return {
      ok: false,
      field: 'time',
      message: 'That time is skipped by a daylight-saving change in your time zone.',
    };
  }
  return { ok: true, date };
}

/**
 * Validate raw form input and turn it into an event definition.
 * @param {{ name?: string, date?: string, time?: string }} input
 * @param {number} [now] current time in ms, injectable for tests
 * @returns {{ ok: true, event: { name: string, target: number } }
 *         | { ok: false, errors: Array<{ field: 'name' | 'date' | 'time', message: string }> }}
 */
export function validateEvent({ name = '', date = '', time = '' }, now = Date.now()) {
  const errors = [];
  const trimmedName = name.trim();

  if (!trimmedName) {
    errors.push({ field: 'name', message: 'Give your event a name.' });
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.push({ field: 'name', message: `Keep the name under ${MAX_NAME_LENGTH} characters.` });
  }

  const parsed = parseLocalDateTime(date, time);
  if (!parsed.ok) {
    errors.push({ field: parsed.field, message: parsed.message });
  } else {
    const target = parsed.date.getTime();
    const remaining = target - now;
    if (remaining <= 0) {
      errors.push({ field: 'date', message: 'That moment has already passed — pick a future date.' });
    } else if (breakdown(remaining).days > MAX_DAYS) {
      errors.push({
        field: 'date',
        message: `Too far away: the timer can show at most ${MAX_DAYS.toLocaleString('en-US')} days (about 27 years).`,
      });
    }
    if (errors.length === 0) {
      return { ok: true, event: { name: trimmedName, target } };
    }
  }
  return { ok: false, errors };
}
