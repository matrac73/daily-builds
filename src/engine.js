// Pure quiz logic: deck building, choice shuffling and the game state machine.
// No DOM access here so everything can be unit-tested with `node --test`.

/** Small deterministic PRNG (mulberry32) so tests and shared seeds are reproducible. */
export function createRng(seed = Date.now()) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle returning a new array. */
export function shuffle(items, rng = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sample(items, count, rng = Math.random) {
  return shuffle(items, rng).slice(0, Math.min(count, items.length));
}

const normalizeChoice = (choice) => (typeof choice === 'string' ? { label: choice } : { ...choice });

/**
 * Turns a raw bank item into a "card": a context (title, statement, code) plus
 * one or more chained steps. LeetCode problems have 3 steps (time, space, trivia),
 * every other rubric has a single multiple-choice step.
 */
export function toCard(category, item) {
  if (category.kind === 'leetcode') {
    return {
      id: item.id,
      categoryId: category.id,
      title: `${item.number}. ${item.title}`,
      tag: item.difficulty,
      statement: item.statement,
      code: item.signature,
      solutions: item.solutions,
      optimal: item.optimal,
      steps: item.steps.map((step) => ({ ...step, choices: step.choices.map(normalizeChoice) })),
    };
  }
  return {
    id: item.id,
    categoryId: category.id,
    title: item.topic,
    tag: null,
    statement: null,
    code: item.code ?? null,
    steps: [
      {
        kind: 'mcq',
        prompt: item.prompt,
        choices: item.choices.map(normalizeChoice),
        answer: item.answer,
        explanation: item.explanation,
        fixedCode: item.fixedCode ?? null,
        source: item.source ?? null,
      },
    ],
  };
}

/** Shuffles the choices of a step while keeping track of the correct one. */
export function shuffleStep(step, rng = Math.random) {
  const order = shuffle(step.choices.map((_, i) => i), rng);
  return { ...step, choices: order.map((i) => step.choices[i]), answer: order.indexOf(step.answer) };
}

/** Draws a random deck of cards for a category (optionally restricted to some ids). */
export function buildDeck(category, { size = category.sessionSize, rng = Math.random, onlyIds = null } = {}) {
  const pool = onlyIds ? category.items.filter((item) => onlyIds.includes(item.id)) : category.items;
  return sample(pool, size, rng).map((item) => {
    const card = toCard(category, item);
    return { ...card, steps: card.steps.map((step) => shuffleStep(step, rng)) };
  });
}

export function createGame(deck) {
  if (!deck.length) throw new Error('Cannot start a game with an empty deck');
  return { deck, cardIndex: 0, stepIndex: 0, answers: [], pending: null };
}

export function isFinished(game) {
  return game.cardIndex >= game.deck.length;
}

export function totalSteps(game) {
  return game.deck.reduce((sum, card) => sum + card.steps.length, 0);
}

export function current(game) {
  if (isFinished(game)) return null;
  const card = game.deck[game.cardIndex];
  return { card, step: card.steps[game.stepIndex], stepIndex: game.stepIndex, stepCount: card.steps.length };
}

/**
 * What to show after an answer on a complexity step: the optimal algorithm when
 * the player is right, otherwise an algorithm that has the (non-optimal)
 * complexity they picked — or a note explaining why no sensible one exists.
 */
export function revealFor(card, step, choiceIndex, correct) {
  if (step.kind !== 'time' && step.kind !== 'space') return null;
  if (correct) return { type: 'solution', heading: 'Solution optimale', solution: card.solutions[card.optimal] };
  const choice = step.choices[choiceIndex];
  const axis = step.kind === 'time' ? 'en temps' : 'en espace';
  if (choice.solution) {
    return { type: 'solution', heading: `Un algorithme en ${choice.label} ${axis}`, solution: card.solutions[choice.solution] };
  }
  return { type: 'note', heading: `Pourquoi pas ${choice.label} ${axis} ?`, note: choice.note };
}

export function answer(game, choiceIndex) {
  if (isFinished(game)) throw new Error('The game is already finished');
  if (game.pending) throw new Error('This step has already been answered');
  const { card, step } = current(game);
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= step.choices.length) {
    throw new RangeError(`Invalid choice index: ${choiceIndex}`);
  }
  const correct = choiceIndex === step.answer;
  const record = { cardId: card.id, cardTitle: card.title, stepKind: step.kind, prompt: step.prompt, correct };
  return {
    ...game,
    answers: [...game.answers, record],
    pending: { choiceIndex, correct, correctIndex: step.answer, reveal: revealFor(card, step, choiceIndex, correct) },
  };
}

export function next(game) {
  if (!game.pending) throw new Error('Answer the current step before moving on');
  const card = game.deck[game.cardIndex];
  const lastStep = game.stepIndex + 1 >= card.steps.length;
  return {
    ...game,
    cardIndex: lastStep ? game.cardIndex + 1 : game.cardIndex,
    stepIndex: lastStep ? 0 : game.stepIndex + 1,
    pending: null,
  };
}

/** A card is "missed" as soon as one of its steps was answered wrong. */
export function summarize(game) {
  const total = game.answers.length;
  const correct = game.answers.filter((a) => a.correct).length;
  const perCard = new Map();
  for (const a of game.answers) perCard.set(a.cardId, (perCard.get(a.cardId) ?? true) && a.correct);
  const ids = (ok) => [...perCard].filter(([, value]) => value === ok).map(([id]) => id);
  return {
    total,
    correct,
    pct: total ? Math.round((100 * correct) / total) : 0,
    missedCardIds: ids(false),
    masteredCardIds: ids(true),
  };
}
