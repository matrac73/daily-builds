import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PASS_MARK,
  answer,
  createSession,
  currentQuestion,
  formatDuration,
  isFinished,
  shareText,
  shuffle,
  summarize,
  validateQuiz,
} from '../src/quiz-engine.js';

/** Deterministic pseudo-random generator (mulberry32). */
function seeded(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeQuiz(questionCount = 4, extra = {}) {
  return {
    id: 'sample',
    title: 'Sample',
    questions: Array.from({ length: questionCount }, (_, i) => ({
      prompt: `Question ${i}`,
      choices: [`right ${i}`, `wrong ${i}a`, `wrong ${i}b`, `wrong ${i}c`],
      answer: 0,
      explanation: `Because ${i}`,
    })),
    ...extra,
  };
}

/** Plays a whole session, answering correctly for the first `correctCount` questions. */
function play(session, correctCount, endTime) {
  let state = session;
  while (!isFinished(state)) {
    const question = currentQuestion(state);
    const wantCorrect = state.answers.length < correctCount;
    const choice = wantCorrect ? question.correctIndex : (question.correctIndex + 1) % 4;
    state = answer(state, choice, endTime);
  }
  return state;
}

test('shuffle keeps every item and does not mutate its input', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const output = shuffle(input, seeded(1));
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...output].sort(), input);
  assert.notDeepEqual(output, input);
});

test('shuffle is deterministic for a given random source', () => {
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], seeded(42)), shuffle([1, 2, 3, 4, 5], seeded(42)));
});

test('validateQuiz accepts a well-formed quiz', () => {
  assert.deepEqual(validateQuiz(makeQuiz()), []);
});

test('validateQuiz reports structural problems', () => {
  assert.match(validateQuiz({ id: 'x', title: 'X', questions: [] }).join(), /no questions/);

  const quiz = makeQuiz(3);
  quiz.questions[0].choices = ['a', 'b', 'c'];
  quiz.questions[1].choices = ['a', 'a', 'b', 'c'];
  quiz.questions[2].answer = 4;
  const problems = validateQuiz(quiz).join('\n');
  assert.match(problems, /question 1 must have exactly 4 choices/);
  assert.match(problems, /question 2 has duplicate choices/);
  assert.match(problems, /question 3 has an invalid answer index/);
});

test('createSession rejects invalid quizzes and missing timestamps', () => {
  assert.throws(() => createSession({ id: 'x', title: 'X', questions: [] }, { now: 0 }), /Invalid quiz/);
  assert.throws(() => createSession(makeQuiz()), TypeError);
});

test('createSession shuffles questions and keeps the correct choice aligned', () => {
  const quiz = makeQuiz(8);
  const session = createSession(quiz, { now: 1000, random: seeded(7) });

  assert.equal(session.questions.length, 8);
  assert.equal(session.startedAt, 1000);
  assert.equal(session.finishedAt, null);
  assert.equal(session.passMark, DEFAULT_PASS_MARK);
  assert.notDeepEqual(
    session.questions.map((q) => q.prompt),
    quiz.questions.map((q) => q.prompt),
  );
  for (const question of session.questions) {
    assert.equal(question.choices.length, 4);
    assert.match(question.choices[question.correctIndex], /^right/);
  }
  assert.ok(session.questions.some((q) => q.correctIndex !== 0), 'choices should be shuffled');
});

test('answer advances through the quiz without mutating the previous state', () => {
  const start = createSession(makeQuiz(2), { now: 0, random: seeded(3) });
  const afterOne = answer(start, 0, 500);

  assert.equal(start.answers.length, 0);
  assert.equal(afterOne.answers.length, 1);
  assert.equal(afterOne.finishedAt, null);
  assert.equal(currentQuestion(afterOne), afterOne.questions[1]);
  assert.equal(isFinished(afterOne), false);

  const afterTwo = answer(afterOne, 3, 900);
  assert.equal(isFinished(afterTwo), true);
  assert.equal(afterTwo.finishedAt, 900);
  assert.equal(currentQuestion(afterTwo), null);
});

test('answer rejects invalid choices and answers after the end', () => {
  const start = createSession(makeQuiz(1), { now: 0 });
  assert.throws(() => answer(start, 4, 1), RangeError);
  assert.throws(() => answer(start, -1, 1), RangeError);
  assert.throws(() => answer(start, 1.5, 1), RangeError);
  assert.throws(() => answer(answer(start, 0, 1), 0, 2), /already finished/);
});

test('summarize refuses unfinished sessions', () => {
  assert.throws(() => summarize(createSession(makeQuiz(), { now: 0 })), /not finished/);
});

test('summarize reports score, time and a per-question review', () => {
  const session = createSession(makeQuiz(4), { now: 10_000, random: seeded(5) });
  const summary = summarize(play(session, 3, 75_000));

  assert.equal(summary.total, 4);
  assert.equal(summary.correct, 3);
  assert.equal(summary.percent, 75);
  assert.equal(summary.passed, true);
  assert.equal(summary.durationMs, 65_000);
  assert.deepEqual(
    summary.review.map((entry) => entry.isCorrect),
    [true, true, true, false],
  );
  const missed = summary.review[3];
  assert.match(missed.expected, /^right/);
  assert.match(missed.chosen, /^wrong/);
  assert.match(missed.explanation, /^Because/);
});

test('the pass mark decides between passed and failed', () => {
  const tenQuestions = makeQuiz(10);
  const score = (correct, quiz = tenQuestions) =>
    summarize(play(createSession(quiz, { now: 0, random: seeded(9) }), correct, 1)).passed;

  assert.equal(score(7), true, 'exactly at the default 70% mark');
  assert.equal(score(6), false);
  assert.equal(score(10, makeQuiz(10, { passMark: 1 })), true);
  assert.equal(score(9, makeQuiz(10, { passMark: 1 })), false);
});

test('formatDuration renders m:ss and h:mm:ss', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(999), '0:00');
  assert.equal(formatDuration(65_000), '1:05');
  assert.equal(formatDuration(600_000), '10:00');
  assert.equal(formatDuration(3_723_000), '1:02:03');
  assert.equal(formatDuration(-50), '0:00');
});

test('shareText summarises the result in one line', () => {
  const session = createSession(makeQuiz(4), { now: 0, random: seeded(2) });
  const passed = shareText(summarize(play(session, 4, 42_000)));
  const failed = shareText(summarize(play(session, 1, 42_000)));

  assert.equal(passed, 'I passed the “Sample” quiz: 4/4 (100%) in 0:42. Can you beat me?');
  assert.match(failed, /^I took the “Sample” quiz: 1\/4 \(25%\)/);
});
