import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRng, shuffle, sample, toCard, shuffleStep, buildDeck, createGame,
  current, answer, next, isFinished, totalSteps, summarize, revealFor,
} from '../src/engine.js';

const leetcodeCategory = {
  id: 'lc',
  kind: 'leetcode',
  sessionSize: 2,
  items: [
    {
      id: 'p1', number: 1, title: 'Two Sum', difficulty: 'Easy', statement: 's', signature: 'def f(): ...',
      optimal: 'fast',
      solutions: {
        fast: { name: 'Hash map', time: 'O(n)', space: 'O(n)', code: 'fast' },
        slow: { name: 'Brute force', time: 'O(n²)', space: 'O(1)', code: 'slow' },
      },
      steps: [
        { kind: 'time', prompt: 't', answer: 0, choices: [{ label: 'O(n)' }, { label: 'O(n²)', solution: 'slow' }, { label: 'O(1)', note: 'nope' }, { label: 'O(log n)', note: 'no' }] },
        { kind: 'space', prompt: 's', answer: 0, choices: [{ label: 'O(n)' }, { label: 'O(1)', solution: 'slow' }, { label: 'O(n²)', note: 'x' }, { label: 'O(log n)', note: 'y' }] },
        { kind: 'trivia', prompt: 'q', answer: 2, choices: ['a', 'b', 'c', 'd'], explanation: 'e' },
      ],
    },
  ],
};

const mcqCategory = {
  id: 'mcq',
  kind: 'mcq',
  sessionSize: 3,
  items: ['a', 'b', 'c', 'd', 'e'].map((id) => ({
    id, topic: `T-${id}`, prompt: 'p', choices: ['w', 'x', 'y', 'z'], answer: 1, explanation: 'e',
  })),
};

test('createRng is deterministic and in [0, 1)', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
});

test('shuffle returns a permutation without mutating the input', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = shuffle(input, createRng(1));
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...out].sort(), input);
});

test('sample never returns more items than available', () => {
  assert.equal(sample([1, 2], 5, createRng(3)).length, 2);
  assert.equal(new Set(sample([1, 2, 3, 4], 3, createRng(3))).size, 3);
});

test('shuffleStep keeps the correct answer pointing to the same choice', () => {
  const step = { choices: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }], answer: 2 };
  for (let seed = 0; seed < 20; seed++) {
    const shuffled = shuffleStep(step, createRng(seed));
    assert.equal(shuffled.choices[shuffled.answer].label, 'C');
  }
});

test('toCard maps LeetCode problems to three chained steps', () => {
  const card = toCard(leetcodeCategory, leetcodeCategory.items[0]);
  assert.equal(card.title, '1. Two Sum');
  assert.deepEqual(card.steps.map((s) => s.kind), ['time', 'space', 'trivia']);
  assert.deepEqual(card.steps[2].choices[0], { label: 'a' });
});

test('toCard maps MCQ items to a single step', () => {
  const card = toCard(mcqCategory, mcqCategory.items[0]);
  assert.equal(card.steps.length, 1);
  assert.equal(card.steps[0].kind, 'mcq');
  assert.equal(card.title, 'T-a');
});

test('buildDeck respects the session size and the onlyIds filter', () => {
  assert.equal(buildDeck(mcqCategory, { rng: createRng(5) }).length, 3);
  const review = buildDeck(mcqCategory, { size: 10, onlyIds: ['b', 'd'], rng: createRng(5) });
  assert.deepEqual(review.map((c) => c.id).sort(), ['b', 'd']);
});

test('createGame rejects an empty deck', () => {
  assert.throws(() => createGame([]));
});

test('a full LeetCode game walks through time, space and trivia', () => {
  const deck = [toCard(leetcodeCategory, leetcodeCategory.items[0])];
  let game = createGame(deck);
  assert.equal(totalSteps(game), 3);

  game = answer(game, 0);
  assert.equal(game.pending.correct, true);
  assert.equal(game.pending.reveal.solution.name, 'Hash map');
  assert.throws(() => answer(game, 0), /already been answered/);
  game = next(game);

  assert.equal(current(game).step.kind, 'space');
  game = answer(game, 1);
  assert.equal(game.pending.correct, false);
  assert.equal(game.pending.correctIndex, 0);
  assert.equal(game.pending.reveal.solution.name, 'Brute force');
  game = next(game);

  game = answer(game, 2);
  assert.equal(game.pending.reveal, null);
  game = next(game);

  assert.ok(isFinished(game));
  assert.equal(current(game), null);
  assert.deepEqual(summarize(game), { total: 3, correct: 2, pct: 67, missedCardIds: ['p1'], masteredCardIds: [] });
});

test('answer validates the choice index and next requires an answer', () => {
  const game = createGame(buildDeck(mcqCategory, { rng: createRng(9) }));
  assert.throws(() => answer(game, 4), RangeError);
  assert.throws(() => answer(game, -1), RangeError);
  assert.throws(() => next(game), /Answer the current step/);
});

test('revealFor explains impossible complexities with a note', () => {
  const card = toCard(leetcodeCategory, leetcodeCategory.items[0]);
  const reveal = revealFor(card, card.steps[0], 2, false);
  assert.deepEqual(reveal, { type: 'note', heading: 'Pourquoi pas O(1) en temps ?', note: 'nope' });
});

test('summarize separates mastered and missed cards', () => {
  let game = createGame(buildDeck(mcqCategory, { size: 2, rng: createRng(2) }));
  const [first, second] = game.deck;
  game = next(answer(game, first.steps[0].answer));
  game = next(answer(game, (second.steps[0].answer + 1) % 4));
  const summary = summarize(game);
  assert.deepEqual(summary.masteredCardIds, [first.id]);
  assert.deepEqual(summary.missedCardIds, [second.id]);
  assert.equal(summary.pct, 50);
});
