import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE,
  createGame,
  endShuffle,
  guess,
  hidePea,
  isRevealed,
  shuffle,
  slotOf,
} from '../src/game.js';

/** A game where the pea sits under `shellId` and the shells were swapped by `swaps`. */
const readyToGuess = (shellId = 0, swaps = [[0, 2]]) =>
  endShuffle(shuffle(hidePea(createGame(), shellId), swaps));

test('a new game waits for the pea to be hidden', () => {
  const game = createGame();
  assert.equal(game.phase, PHASE.HIDING);
  assert.deepEqual(game.order, [0, 1, 2]);
  assert.equal(game.peaShell, null);
  assert.deepEqual(game.score, { played: 0, wins: 0 });
});

test('createGame copies the score it is given', () => {
  const score = { played: 4, wins: 2 };
  const game = createGame(score);
  assert.deepEqual(game.score, score);
  assert.notEqual(game.score, score);
});

test('hiding the pea starts a round and counts a game played', () => {
  const game = hidePea(createGame(), 1);
  assert.equal(game.phase, PHASE.READY);
  assert.equal(game.peaShell, 1);
  assert.equal(game.score.played, 1);
});

test('hidePea ignores invalid shells and wrong phases', () => {
  const fresh = createGame();
  assert.equal(hidePea(fresh, 3), fresh);
  assert.equal(hidePea(fresh, -1), fresh);
  assert.equal(hidePea(fresh, 0.5), fresh);

  const ready = hidePea(fresh, 0);
  assert.equal(hidePea(ready, 1), ready, 'cannot move the pea once hidden');
  const guessing = readyToGuess();
  assert.equal(hidePea(guessing, 1), guessing, 'cannot re-hide mid-round');
});

test('shuffle rearranges shells and the pea follows its shell', () => {
  const shuffling = shuffle(hidePea(createGame(), 0), [[0, 1], [1, 2]]);
  assert.equal(shuffling.phase, PHASE.SHUFFLING);
  assert.deepEqual(shuffling.order, [1, 2, 0]);
  assert.equal(shuffling.peaShell, 0, 'the pea stays under the same shell');
  assert.equal(slotOf(shuffling, 0), 2, '...which now sits on the right');
});

test('shuffle is only allowed once the pea is hidden', () => {
  const fresh = createGame();
  assert.equal(shuffle(fresh, [[0, 1]]), fresh);
  const guessing = readyToGuess();
  assert.equal(shuffle(guessing, [[0, 1]]), guessing);
});

test('endShuffle opens guessing only after a shuffle', () => {
  const fresh = createGame();
  assert.equal(endShuffle(fresh), fresh);
  assert.equal(readyToGuess().phase, PHASE.GUESSING);
});

test('guessing right on the first try wins and scores', () => {
  const game = guess(readyToGuess(2), 2);
  assert.equal(game.phase, PHASE.WON);
  assert.deepEqual(game.guesses, [2]);
  assert.deepEqual(game.score, { played: 1, wins: 1 });
});

test('the player keeps guessing until the pea is found', () => {
  let game = readyToGuess(2);
  game = guess(game, 0);
  assert.equal(game.phase, PHASE.GUESSING);
  assert.ok(isRevealed(game, 0));
  assert.ok(!isRevealed(game, 1));

  game = guess(game, 1);
  assert.equal(game.phase, PHASE.GUESSING);

  game = guess(game, 2);
  assert.equal(game.phase, PHASE.WON);
  assert.deepEqual(game.guesses, [0, 1, 2]);
  assert.deepEqual(game.score, { played: 1, wins: 0 }, 'only first-guess finds are wins');
});

test('guess ignores repeated shells, invalid shells and wrong phases', () => {
  const once = guess(readyToGuess(2), 0);
  assert.equal(guess(once, 0), once);
  assert.equal(guess(once, 7), once);

  const ready = hidePea(createGame(), 0);
  assert.equal(guess(ready, 0), ready, 'no guessing before the shuffle');

  const won = guess(readyToGuess(1), 1);
  assert.equal(guess(won, 0), won, 'no guessing after winning');
});

test('a new round can start from a won game, keeping the score', () => {
  const won = guess(readyToGuess(0), 0);
  const next = hidePea(won, 2);
  assert.equal(next.phase, PHASE.READY);
  assert.equal(next.peaShell, 2);
  assert.deepEqual(next.guesses, []);
  assert.deepEqual(next.order, won.order, 'shells stay where they are on the table');
  assert.deepEqual(next.score, { played: 2, wins: 1 });
});

test('transitions never mutate the previous state', () => {
  const before = readyToGuess(1);
  const snapshot = structuredClone(before);
  guess(before, 0);
  guess(before, 1);
  assert.deepEqual(before, snapshot);
});
