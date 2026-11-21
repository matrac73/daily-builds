import { Direction } from './elevator.js';

/**
 * Pick where the next occupant shows up and which way they want to travel.
 * `random` must return a number in [0, 1), like `Math.random`.
 * @returns {{floor: number, direction: 'up' | 'down'}}
 */
export function randomArrival(floors, random = Math.random) {
  if (!Number.isInteger(floors) || floors < 2) {
    throw new RangeError('floors must be an integer of at least 2');
  }
  const floor = 1 + Math.floor(random() * floors);
  if (floor === 1) return { floor, direction: Direction.UP };
  if (floor === floors) return { floor, direction: Direction.DOWN };
  return { floor, direction: random() < 0.5 ? Direction.UP : Direction.DOWN };
}

/**
 * Turn the "seconds between occupants" setting into a timer delay.
 * Returns `null` when arrivals are switched off (0, empty or invalid input).
 */
export function arrivalDelayMs(seconds, { min = 1, max = 120 } = {}) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(max, Math.max(min, value)) * 1000;
}
