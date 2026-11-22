/**
 * Pure quiz logic: no DOM, no clock, no globals.
 * Sessions are immutable; every transition returns a new object.
 */

export const DEFAULT_PASS_MARK = 0.7;
export const CHOICES_PER_QUESTION = 4;

/** Returns a shuffled copy (Fisher–Yates). `random` must return a float in [0, 1). */
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Returns a list of human-readable problems with a quiz definition (empty when valid). */
export function validateQuiz(quiz) {
  const problems = [];
  if (!quiz?.id) problems.push('quiz is missing an id');
  if (!quiz?.title) problems.push('quiz is missing a title');
  if (!Array.isArray(quiz?.questions) || quiz.questions.length === 0) {
    problems.push('quiz has no questions');
    return problems;
  }
  quiz.questions.forEach((question, index) => {
    const label = `question ${index + 1}`;
    if (!question.prompt) problems.push(`${label} has no prompt`);
    if (!Array.isArray(question.choices) || question.choices.length !== CHOICES_PER_QUESTION) {
      problems.push(`${label} must have exactly ${CHOICES_PER_QUESTION} choices`);
      return;
    }
    if (new Set(question.choices).size !== question.choices.length) {
      problems.push(`${label} has duplicate choices`);
    }
    if (!Number.isInteger(question.answer) || !(question.answer in question.choices)) {
      problems.push(`${label} has an invalid answer index`);
    }
  });
  return problems;
}

/**
 * Starts a quiz: question order and choice order are both shuffled,
 * so `correctIndex` is recomputed for the shuffled choices.
 */
export function createSession(quiz, { now, random = Math.random } = {}) {
  const problems = validateQuiz(quiz);
  if (problems.length > 0) throw new Error(`Invalid quiz: ${problems.join('; ')}`);
  if (!Number.isFinite(now)) throw new TypeError('createSession needs a numeric `now` timestamp');

  const questions = shuffle(quiz.questions, random).map((question) => {
    const correctChoice = question.choices[question.answer];
    const choices = shuffle(question.choices, random);
    return {
      prompt: question.prompt,
      choices,
      correctIndex: choices.indexOf(correctChoice),
      explanation: question.explanation ?? '',
    };
  });

  return {
    quizId: quiz.id,
    title: quiz.title,
    passMark: quiz.passMark ?? DEFAULT_PASS_MARK,
    questions,
    answers: [],
    startedAt: now,
    finishedAt: null,
  };
}

export function isFinished(session) {
  return session.answers.length >= session.questions.length;
}

/** The question waiting for an answer, or `null` once the quiz is finished. */
export function currentQuestion(session) {
  return session.questions[session.answers.length] ?? null;
}

/** Records the answer to the current question and returns the next session state. */
export function answer(session, choiceIndex, now) {
  const question = currentQuestion(session);
  if (!question) throw new Error('The quiz is already finished');
  if (!Number.isInteger(choiceIndex) || !(choiceIndex in question.choices)) {
    throw new RangeError(`Invalid choice index: ${choiceIndex}`);
  }
  const answers = [...session.answers, choiceIndex];
  const done = answers.length === session.questions.length;
  return { ...session, answers, finishedAt: done ? now : null };
}

/** Final statistics for a finished session. */
export function summarize(session) {
  if (!isFinished(session)) throw new Error('The quiz is not finished yet');

  const review = session.questions.map((question, index) => {
    const chosenIndex = session.answers[index];
    return {
      prompt: question.prompt,
      chosen: question.choices[chosenIndex],
      expected: question.choices[question.correctIndex],
      isCorrect: chosenIndex === question.correctIndex,
      explanation: question.explanation,
    };
  });
  const total = review.length;
  const correct = review.filter((entry) => entry.isCorrect).length;

  return {
    quizId: session.quizId,
    title: session.title,
    total,
    correct,
    percent: Math.round((correct / total) * 100),
    passMark: session.passMark,
    passed: correct / total >= session.passMark,
    durationMs: session.finishedAt - session.startedAt,
    finishedAt: session.finishedAt,
    review,
  };
}

/** Formats milliseconds as `m:ss`, or `h:mm:ss` past the hour. */
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** One-line result, ready to be shared. */
export function shareText(summary) {
  const verdict = summary.passed ? 'passed' : 'took';
  const score = `${summary.correct}/${summary.total} (${summary.percent}%)`;
  return `I ${verdict} the “${summary.title}” quiz: ${score} in ${formatDuration(summary.durationMs)}. Can you beat me?`;
}
