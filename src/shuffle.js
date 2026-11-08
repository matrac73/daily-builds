/**
 * Shuffle planning: a shuffle is a sequence of swaps between two table slots.
 * Slots are numbered 0 (left), 1 (middle) and 2 (right).
 */

export const SLOT_COUNT = 3;

/** Total length of a shuffle, as required by the game rules. */
export const SHUFFLE_DURATION_MS = 5000;

/** Duration of a single swap for each speed setting. */
export const SPEEDS = Object.freeze({
  relaxed: 700,
  classic: 450,
  hustler: 280,
});

/**
 * Pick two distinct slots uniformly at random.
 * @param {() => number} rng returns a float in [0, 1)
 * @returns {[number, number]}
 */
export function randomSwap(rng = Math.random) {
  const a = Math.floor(rng() * SLOT_COUNT);
  const b = (a + 1 + Math.floor(rng() * (SLOT_COUNT - 1))) % SLOT_COUNT;
  return [a, b];
}

/**
 * Number of swaps that fit in a shuffle of `durationMs` (at least one).
 */
export function swapCount(swapMs, durationMs = SHUFFLE_DURATION_MS) {
  if (!(swapMs > 0)) throw new RangeError(`swapMs must be positive, got ${swapMs}`);
  return Math.max(1, Math.round(durationMs / swapMs));
}

/**
 * Plan a full shuffle as a list of slot swaps.
 * @returns {Array<[number, number]>}
 */
export function planShuffle(swapMs, rng = Math.random, durationMs = SHUFFLE_DURATION_MS) {
  return Array.from({ length: swapCount(swapMs, durationMs) }, () => randomSwap(rng));
}

/**
 * Swap the contents of two slots. `order[slot]` is the id of the shell in that slot.
 * @returns {number[]} a new array
 */
export function applySwap(order, [a, b]) {
  const next = [...order];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** Apply a whole list of swaps, in sequence. */
export function applySwaps(order, swaps) {
  return swaps.reduce(applySwap, order);
}
