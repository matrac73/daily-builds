// Survey domain model: definition rules, lifecycle and tabulation.
// Pure functions over plain objects — no DOM, no storage — so the same code
// runs in the browser and under `node --test`.

export const LIMITS = Object.freeze({
  minQuestions: 1,
  maxQuestions: 10,
  minChoices: 1,
  maxChoices: 5,
  maxTitleLength: 120,
  maxTextLength: 200,
});

export const STATUS = Object.freeze({
  DRAFT: 'draft',
  OPEN: 'open',
  CLOSED: 'closed',
});

/** Marks a question the respondent has not answered yet. */
export const UNANSWERED = null;

/** An error whose message is safe to show to the user as-is. */
export class SurveyError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SurveyError';
    Object.assign(this, details);
  }
}

const clean = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');

/** Trims and collapses whitespace in a raw definition coming from a form. */
export function normalizeDefinition(definition) {
  const questions = Array.isArray(definition?.questions) ? definition.questions : [];
  return {
    title: clean(definition?.title),
    questions: questions.map((question) => ({
      text: clean(question?.text),
      choices: (Array.isArray(question?.choices) ? question.choices : []).map(clean),
    })),
  };
}

/**
 * Checks a survey definition against the rules.
 * Returns a list of human-readable problems; an empty list means it is valid.
 */
export function validateDefinition(definition) {
  const { title, questions } = normalizeDefinition(definition);
  const problems = [];

  if (!title) {
    problems.push('The survey needs a title.');
  } else if (title.length > LIMITS.maxTitleLength) {
    problems.push(`The title must be at most ${LIMITS.maxTitleLength} characters.`);
  }

  if (questions.length < LIMITS.minQuestions || questions.length > LIMITS.maxQuestions) {
    problems.push(
      `A survey needs between ${LIMITS.minQuestions} and ${LIMITS.maxQuestions} questions.`,
    );
  }

  questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (!question.text) {
      problems.push(`${label} needs some text.`);
    } else if (question.text.length > LIMITS.maxTextLength) {
      problems.push(`${label} must be at most ${LIMITS.maxTextLength} characters.`);
    }

    const { choices } = question;
    if (choices.length < LIMITS.minChoices || choices.length > LIMITS.maxChoices) {
      problems.push(
        `${label} needs between ${LIMITS.minChoices} and ${LIMITS.maxChoices} choices.`,
      );
    }
    if (choices.some((choice) => !choice)) {
      problems.push(`${label} has an empty choice.`);
    }
    if (choices.some((choice) => choice.length > LIMITS.maxTextLength)) {
      problems.push(`${label} has a choice longer than ${LIMITS.maxTextLength} characters.`);
    }
    const distinct = new Set(choices.filter(Boolean).map((choice) => choice.toLowerCase()));
    if (distinct.size < choices.filter(Boolean).length) {
      problems.push(`${label} lists the same choice twice.`);
    }
  });

  return problems;
}

/** Builds a new draft survey, or throws a SurveyError listing what is wrong. */
export function createSurvey(definition, { id, createdBy, createdAt }) {
  const problems = validateDefinition(definition);
  if (problems.length > 0) {
    throw new SurveyError(problems[0], { problems });
  }
  return {
    id,
    ...normalizeDefinition(definition),
    status: STATUS.DRAFT,
    createdBy,
    createdAt,
    responses: [],
  };
}

/** Draft → open. Only drafts can be opened; a closed survey stays closed. */
export function openSurvey(survey) {
  if (survey.status !== STATUS.DRAFT) {
    throw new SurveyError(`Only a draft survey can be opened ("${survey.title}" is ${survey.status}).`);
  }
  return { ...survey, status: STATUS.OPEN };
}

/** Open → closed. */
export function closeSurvey(survey) {
  if (survey.status !== STATUS.OPEN) {
    throw new SurveyError(`Only an open survey can be closed ("${survey.title}" is ${survey.status}).`);
  }
  return { ...survey, status: STATUS.CLOSED };
}

export function hasResponded(survey, respondent) {
  return survey.responses.some((response) => response.respondent === respondent);
}

/** Indexes of the questions that have no (valid) answer yet. */
export function unansweredQuestions(survey, answers) {
  return survey.questions
    .map((question, index) => {
      const answer = answers?.[index];
      const valid = Number.isInteger(answer) && answer >= 0 && answer < question.choices.length;
      return valid ? -1 : index;
    })
    .filter((index) => index !== -1);
}

/**
 * Records one respondent's answers (one choice index per question).
 * Throws when the survey is not open, the respondent already answered,
 * or some questions are unanswered (`error.missing` lists their indexes).
 */
export function submitResponse(survey, respondent, answers, submittedAt) {
  if (survey.status !== STATUS.OPEN) {
    throw new SurveyError('This survey is not open for responses.');
  }
  if (hasResponded(survey, respondent)) {
    throw new SurveyError('You have already completed this survey.');
  }
  const missing = unansweredQuestions(survey, answers);
  if (missing.length > 0) {
    const list = missing.map((index) => index + 1).join(', ');
    throw new SurveyError(
      `Please answer every question before submitting (still missing: ${list}).`,
      { missing },
    );
  }
  const response = {
    respondent,
    answers: answers.slice(0, survey.questions.length),
    submittedAt,
  };
  return { ...survey, responses: [...survey.responses, response] };
}

/**
 * Tabulates the responses: for each question, how many respondents picked
 * each choice and what share of the total that represents (0..1).
 */
export function tally(survey) {
  const total = survey.responses.length;
  return survey.questions.map((question, questionIndex) => ({
    text: question.text,
    total,
    choices: question.choices.map((label, choiceIndex) => {
      const count = survey.responses.filter(
        (response) => response.answers[questionIndex] === choiceIndex,
      ).length;
      return { label, count, share: total === 0 ? 0 : count / total };
    }),
  }));
}
