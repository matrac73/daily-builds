// Integrity checks on the question banks, so new content can't break the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, findCategory } from '../src/data/index.js';
import { buildDeck, createGame, answer, next, isFinished, summarize, createRng } from '../src/engine.js';

const label = (choice) => (typeof choice === 'string' ? choice : choice.label);

function assertChoices(where, choices, answerIndex) {
  assert.equal(choices.length, 4, `${where}: needs exactly 4 choices`);
  assert.ok(Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < 4, `${where}: invalid answer`);
  const labels = choices.map(label);
  assert.equal(new Set(labels).size, 4, `${where}: duplicate choices`);
  labels.forEach((text) => assert.ok(text.trim(), `${where}: empty choice`));
}

test('categories have unique ids, a positive session size and enough items', () => {
  assert.equal(CATEGORIES.length, 4);
  assert.equal(new Set(CATEGORIES.map((c) => c.id)).size, 4);
  for (const category of CATEGORIES) {
    assert.ok(category.sessionSize > 0);
    assert.ok(category.items.length >= category.sessionSize, `${category.id}: not enough items`);
  }
  assert.equal(findCategory('agent-stack').name, 'AI agent stack');
  assert.equal(findCategory('nope'), null);
});

test('item ids are unique across the whole game', () => {
  const ids = CATEGORIES.flatMap((c) => c.items.map((item) => item.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('LeetCode problems chain time, space and trivia steps with consistent solutions', () => {
  for (const problem of findCategory('leetcode').items) {
    const where = problem.id;
    assert.ok(problem.statement && problem.signature.startsWith('def '), `${where}: statement/signature`);
    assert.ok(problem.solutions[problem.optimal], `${where}: optimal solution missing`);
    assert.deepEqual(problem.steps.map((s) => s.kind), ['time', 'space', 'trivia'], where);

    const used = new Set([problem.optimal]);
    const optimal = problem.solutions[problem.optimal];
    for (const step of problem.steps) {
      assertChoices(`${where}/${step.kind}`, step.choices, step.answer);
      assert.ok(step.prompt && step.explanation, `${where}/${step.kind}: prompt/explanation`);
      if (step.kind === 'trivia') continue;

      assert.equal(label(step.choices[step.answer]), optimal[step.kind], `${where}/${step.kind}: answer != optimal complexity`);
      step.choices.forEach((choice, i) => {
        if (i === step.answer) return;
        assert.ok(Boolean(choice.solution) !== Boolean(choice.note), `${where}/${step.kind}: wrong choice needs a solution XOR a note`);
        if (choice.solution) {
          const solution = problem.solutions[choice.solution];
          assert.ok(solution, `${where}: unknown solution ${choice.solution}`);
          assert.equal(solution[step.kind], choice.label, `${where}: ${choice.solution} does not have ${step.kind} ${choice.label}`);
          used.add(choice.solution);
        }
      });
    }
    assert.deepEqual([...used].sort(), Object.keys(problem.solutions).sort(), `${where}: unused solutions`);
    for (const solution of Object.values(problem.solutions)) {
      assert.ok(solution.name && solution.explanation, `${where}: solution metadata`);
      assert.match(solution.code, /def \w+\(/, `${where}: solution code`);
    }
  }
});

test('multiple-choice items have a topic, prompt, explanation and valid sources', () => {
  for (const category of CATEGORIES.filter((c) => c.kind === 'mcq')) {
    for (const item of category.items) {
      const where = `${category.id}/${item.id}`;
      assert.ok(item.topic && item.prompt && item.explanation, `${where}: missing text`);
      assertChoices(where, item.choices, item.answer);
      if (item.source) assert.match(item.source.url, /^https:\/\//, `${where}: source url`);
    }
  }
});

test('code review items always show the code and a fix', () => {
  for (const item of findCategory('code-review').items) {
    assert.ok(item.code && item.fixedCode, item.id);
    assert.notEqual(item.code, item.fixedCode, item.id);
  }
});

test('the transformers and agent stack rubrics cite their sources', () => {
  for (const id of ['transformers', 'agent-stack']) {
    for (const item of findCategory(id).items) assert.ok(item.source, `${id}/${item.id}: no source`);
  }
});

test('code blocks are dedented and free of template artefacts', () => {
  const blocks = CATEGORIES.flatMap((c) => c.items.flatMap((item) => [
    item.code, item.fixedCode, item.signature,
    ...Object.values(item.solutions ?? {}).map((s) => s.code),
  ])).filter(Boolean);
  for (const code of blocks) {
    assert.doesNotMatch(code, /^\s/, 'leading whitespace');
    assert.doesNotMatch(code, /\\`|\$\{/, 'escaped backtick or interpolation');
    assert.doesNotMatch(code, /\t/, 'tabs');
  }
});

test('every category can be played end-to-end with perfect answers', () => {
  for (const category of CATEGORIES) {
    let game = createGame(buildDeck(category, { rng: createRng(7) }));
    while (!isFinished(game)) {
      const card = game.deck[game.cardIndex];
      game = next(answer(game, card.steps[game.stepIndex].answer));
    }
    const summary = summarize(game);
    assert.equal(summary.pct, 100, category.id);
    assert.equal(summary.missedCardIds.length, 0);
  }
});

test('correct answers land on varied positions once shuffled', () => {
  const positions = new Set();
  for (let seed = 0; seed < 10; seed++) {
    for (const card of buildDeck(findCategory('transformers'), { rng: createRng(seed) })) positions.add(card.steps[0].answer);
  }
  assert.equal(positions.size, 4);
});
