/**
 * Pure, immutable state machine for an honest shell game.
 *
 *   HIDING ──hidePea──▶ READY ──shuffle──▶ SHUFFLING ──endShuffle──▶ GUESSING
 *     ▲                                                                 │
 *     └───────────── hidePea ◀── WON ◀──── guess (pea found) ───────────┘
 *
 * Every transition returns a new game object. An action that is not allowed
 * in the current phase returns the very same object, so callers can detect
 * no-ops with a simple identity check.
 */
import { SLOT_COUNT, applySwaps } from './shuffle.js';

export const PHASE = Object.freeze({
  HIDING: 'hiding',
  READY: 'ready',
  SHUFFLING: 'shuffling',
  GUESSING: 'guessing',
  WON: 'won',
});

const isShell = (id) => Number.isInteger(id) && id >= 0 && id < SLOT_COUNT;

/**
 * @param {{played: number, wins: number}} [score]
 */
export function createGame(score = { played: 0, wins: 0 }) {
  return {
    phase: PHASE.HIDING,
    order: Array.from({ length: SLOT_COUNT }, (_, i) => i), // order[slot] = shell id
    peaShell: null,
    guesses: [],
    score: { ...score },
  };
}

/** Hide the pea under a shell. Starts a new round (and counts a game played). */
export function hidePea(game, shellId) {
  if (!isShell(shellId)) return game;
  if (game.phase !== PHASE.HIDING && game.phase !== PHASE.WON) return game;
  return {
    ...game,
    phase: PHASE.READY,
    peaShell: shellId,
    guesses: [],
    score: { ...game.score, played: game.score.played + 1 },
  };
}

/** Start shuffling. The final arrangement is known up front: the game is honest. */
export function shuffle(game, swaps) {
  if (game.phase !== PHASE.READY) return game;
  return { ...game, phase: PHASE.SHUFFLING, order: applySwaps(game.order, swaps) };
}

/** The shuffle animation is over: the player may now guess. */
export function endShuffle(game) {
  if (game.phase !== PHASE.SHUFFLING) return game;
  return { ...game, phase: PHASE.GUESSING };
}

/** Lift a shell. Each shell can only be lifted once per round. */
export function guess(game, shellId) {
  if (game.phase !== PHASE.GUESSING || !isShell(shellId)) return game;
  if (game.guesses.includes(shellId)) return game;

  const guesses = [...game.guesses, shellId];
  if (shellId !== game.peaShell) return { ...game, guesses };

  const firstTry = guesses.length === 1;
  return {
    ...game,
    phase: PHASE.WON,
    guesses,
    score: { ...game.score, wins: game.score.wins + (firstTry ? 1 : 0) },
  };
}

/** Slot (0 = left, 1 = middle, 2 = right) currently holding a shell. */
export function slotOf(game, shellId) {
  return game.order.indexOf(shellId);
}

/** Whether a shell has already been lifted this round. */
export function isRevealed(game, shellId) {
  return game.guesses.includes(shellId);
}
