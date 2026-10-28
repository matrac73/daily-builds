import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIKE, PASS, decide, emptyDeck, forget, remaining, restoreDeck, shortlist, undo } from '../src/deck.js';

const ranked = ['a', 'b', 'c'].map((id) => ({ deal: { id }, score: 0 }));

test('decide records verdicts without mutating the previous deck', () => {
  const start = emptyDeck();
  const deck = decide(decide(start, 'a', LIKE), 'b', PASS);
  assert.deepEqual(start, emptyDeck());
  assert.deepEqual(remaining(ranked, deck).map((e) => e.deal.id), ['c']);
  assert.deepEqual(shortlist(ranked, deck).map((e) => e.deal.id), ['a']);
  assert.throws(() => decide(start, 'a', 'maybe'), /Unknown verdict/);
});

test('undo cancels the latest decision only', () => {
  const deck = undo(decide(decide(emptyDeck(), 'a', LIKE), 'b', LIKE));
  assert.deepEqual(deck, { decisions: { a: LIKE }, history: ['a'] });
  assert.deepEqual(undo(emptyDeck()), emptyDeck());
});

test('forget removes one deal from decisions and history', () => {
  const deck = forget(decide(decide(emptyDeck(), 'a', LIKE), 'b', LIKE), 'a');
  assert.deepEqual(deck, { decisions: { b: LIKE }, history: ['b'] });
});

test('restoreDeck validates persisted data', () => {
  assert.deepEqual(restoreDeck(null), emptyDeck());
  assert.deepEqual(restoreDeck({ decisions: 'x', history: [] }), emptyDeck());
  assert.deepEqual(restoreDeck({ decisions: { a: LIKE }, history: ['a'] }), { decisions: { a: LIKE }, history: ['a'] });
});
