// Pure helpers for the list of saved events and its JSON persistence format.

import { MAX_NAME_LENGTH } from './countdown.js';

export const STORAGE_KEY = 'nixie-countdown.events.v1';

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Return a new list sorted so the soonest event comes first. */
export function sortByTarget(events) {
  return [...events].sort((a, b) => a.target - b.target);
}

/**
 * Add an event (without mutating the input list).
 * @param {Array<{ id: string, name: string, target: number }>} events
 * @param {{ name: string, target: number }} event
 * @param {string} [id]
 */
export function addEvent(events, { name, target }, id = makeId()) {
  return sortByTarget([...events, { id, name, target }]);
}

/** Remove the event with the given id (without mutating the input list). */
export function removeEvent(events, id) {
  return events.filter((event) => event.id !== id);
}

export function serialize(events) {
  return JSON.stringify(events.map(({ id, name, target }) => ({ id, name, target })));
}

function isValidEvent(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    value.name.length <= MAX_NAME_LENGTH &&
    Number.isFinite(value.target)
  );
}

/**
 * Parse stored JSON back into an event list. Never throws: corrupt data
 * yields an empty list and malformed entries are dropped.
 * @param {string | null} raw
 */
export function deserialize(raw) {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return sortByTarget(
      data.filter(isValidEvent).map(({ id, name, target }) => ({ id, name, target })),
    );
  } catch {
    return [];
  }
}
