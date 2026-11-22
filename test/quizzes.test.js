import { test } from 'node:test';
import assert from 'node:assert/strict';

import { quizzes } from '../src/quizzes.js';
import { createSession, validateQuiz } from '../src/quiz-engine.js';

test('there are several quizzes with unique ids', () => {
  assert.ok(quizzes.length >= 2);
  assert.equal(new Set(quizzes.map((quiz) => quiz.id)).size, quizzes.length);
});

for (const quiz of quizzes) {
  test(`bundled quiz "${quiz.title}" is valid and playable`, () => {
    assert.deepEqual(validateQuiz(quiz), []);
    assert.ok(quiz.description, 'has a description');
    assert.ok(quiz.icon, 'has an icon');
    assert.equal(new Set(quiz.questions.map((q) => q.prompt)).size, quiz.questions.length);

    for (const question of quiz.questions) {
      assert.ok(question.explanation, `"${question.prompt}" has an explanation`);
      for (const text of [question.prompt, question.explanation, ...question.choices]) {
        assert.equal(text.split('`').length % 2, 1, `unbalanced backticks in: ${text}`);
      }
    }

    const session = createSession(quiz, { now: 0 });
    assert.equal(session.questions.length, quiz.questions.length);
  });
}
