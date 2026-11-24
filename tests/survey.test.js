import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LIMITS,
  STATUS,
  SurveyError,
  UNANSWERED,
  closeSurvey,
  createSurvey,
  hasResponded,
  openSurvey,
  submitResponse,
  tally,
  unansweredQuestions,
  validateDefinition,
} from '../src/survey.js';

const definition = () => ({
  title: 'Lunch',
  questions: [
    { text: 'Pizza or pasta?', choices: ['Pizza', 'Pasta'] },
    { text: 'When?', choices: ['Noon', '1 pm', '2 pm'] },
  ],
});

const meta = { id: 1, createdBy: 'ada', createdAt: '2026-01-01T00:00:00.000Z' };
const draftSurvey = () => createSurvey(definition(), meta);
const openedSurvey = () => openSurvey(draftSurvey());

describe('validateDefinition', () => {
  it('accepts a well-formed survey', () => {
    assert.deepEqual(validateDefinition(definition()), []);
  });

  it('requires a title', () => {
    assert.match(validateDefinition({ ...definition(), title: '   ' })[0], /title/);
  });

  it('requires between 1 and 10 questions', () => {
    const question = definition().questions[0];
    assert.match(validateDefinition({ title: 'T', questions: [] })[0], /between 1 and 10 questions/);
    assert.deepEqual(
      validateDefinition({ title: 'T', questions: Array(LIMITS.maxQuestions).fill(question) }),
      [],
    );
    assert.match(
      validateDefinition({ title: 'T', questions: Array(LIMITS.maxQuestions + 1).fill(question) })[0],
      /between 1 and 10 questions/,
    );
  });

  it('requires between 1 and 5 choices per question', () => {
    const withChoices = (choices) => ({ title: 'T', questions: [{ text: 'Q', choices }] });
    assert.match(validateDefinition(withChoices([]))[0], /Question 1 needs between 1 and 5 choices/);
    assert.deepEqual(validateDefinition(withChoices(['only'])), []);
    assert.deepEqual(validateDefinition(withChoices(['a', 'b', 'c', 'd', 'e'])), []);
    assert.match(validateDefinition(withChoices(['a', 'b', 'c', 'd', 'e', 'f']))[0], /between 1 and 5 choices/);
  });

  it('rejects blank question text, blank choices and duplicate choices', () => {
    const problems = validateDefinition({
      title: 'T',
      questions: [
        { text: '', choices: ['a'] },
        { text: 'Q2', choices: ['a', ' '] },
        { text: 'Q3', choices: ['Yes', ' yes '] },
      ],
    });
    assert.deepEqual(problems, [
      'Question 1 needs some text.',
      'Question 2 has an empty choice.',
      'Question 3 lists the same choice twice.',
    ]);
  });

  it('reports problems instead of crashing on malformed input', () => {
    assert.ok(validateDefinition(undefined).length > 0);
    assert.ok(validateDefinition({ title: 'T', questions: [null] }).length > 0);
  });
});

describe('createSurvey', () => {
  it('creates a draft with normalized text and no responses', () => {
    const survey = createSurvey(
      { title: '  Lunch   plans ', questions: [{ text: ' Where? ', choices: [' Here ', 'There'] }] },
      meta,
    );
    assert.deepEqual(survey, {
      id: 1,
      title: 'Lunch plans',
      questions: [{ text: 'Where?', choices: ['Here', 'There'] }],
      status: STATUS.DRAFT,
      createdBy: 'ada',
      createdAt: '2026-01-01T00:00:00.000Z',
      responses: [],
    });
  });

  it('throws a SurveyError carrying every problem', () => {
    assert.throws(
      () => createSurvey({ title: '', questions: [] }, meta),
      (error) => error instanceof SurveyError && error.problems.length === 2,
    );
  });
});

describe('lifecycle', () => {
  it('moves draft → open → closed without mutating the input', () => {
    const draft = draftSurvey();
    const open = openSurvey(draft);
    const closed = closeSurvey(open);
    assert.deepEqual([draft.status, open.status, closed.status], ['draft', 'open', 'closed']);
  });

  it('refuses every other transition', () => {
    const open = openedSurvey();
    const closed = closeSurvey(open);
    assert.throws(() => closeSurvey(draftSurvey()), SurveyError);
    assert.throws(() => openSurvey(open), SurveyError);
    assert.throws(() => openSurvey(closed), SurveyError);
    assert.throws(() => closeSurvey(closed), SurveyError);
  });
});

describe('submitResponse', () => {
  it('records a complete response', () => {
    const survey = submitResponse(openedSurvey(), 'bob', [1, 2], '2026-01-02T00:00:00.000Z');
    assert.deepEqual(survey.responses, [
      { respondent: 'bob', answers: [1, 2], submittedAt: '2026-01-02T00:00:00.000Z' },
    ]);
    assert.equal(hasResponded(survey, 'bob'), true);
    assert.equal(hasResponded(survey, 'eve'), false);
  });

  it('rejects incomplete responses and says which questions are missing', () => {
    assert.throws(
      () => submitResponse(openedSurvey(), 'bob', [0, UNANSWERED]),
      (error) =>
        error instanceof SurveyError &&
        /answer every question/.test(error.message) &&
        /missing: 2/.test(error.message) &&
        error.missing.length === 1 &&
        error.missing[0] === 1,
    );
  });

  it('treats out-of-range and non-integer answers as unanswered', () => {
    const survey = openedSurvey();
    assert.deepEqual(unansweredQuestions(survey, [2, -1]), [0, 1]);
    assert.deepEqual(unansweredQuestions(survey, ['0', 1.5]), [0, 1]);
    assert.deepEqual(unansweredQuestions(survey, []), [0, 1]);
    assert.deepEqual(unansweredQuestions(survey, [0, 2]), []);
  });

  it('lets each respondent answer only once', () => {
    const survey = submitResponse(openedSurvey(), 'bob', [0, 0]);
    assert.throws(() => submitResponse(survey, 'bob', [1, 1]), /already completed/);
    assert.equal(submitResponse(survey, 'eve', [1, 1]).responses.length, 2);
  });

  it('only accepts responses while the survey is open', () => {
    assert.throws(() => submitResponse(draftSurvey(), 'bob', [0, 0]), /not open/);
    assert.throws(() => submitResponse(closeSurvey(openedSurvey()), 'bob', [0, 0]), /not open/);
  });
});

describe('tally', () => {
  it('counts responses per choice and computes shares', () => {
    let survey = openedSurvey();
    survey = submitResponse(survey, 'a', [0, 0]);
    survey = submitResponse(survey, 'b', [0, 2]);
    survey = submitResponse(survey, 'c', [1, 2]);
    survey = submitResponse(survey, 'd', [0, 2]);

    assert.deepEqual(tally(closeSurvey(survey)), [
      {
        text: 'Pizza or pasta?',
        total: 4,
        choices: [
          { label: 'Pizza', count: 3, share: 0.75 },
          { label: 'Pasta', count: 1, share: 0.25 },
        ],
      },
      {
        text: 'When?',
        total: 4,
        choices: [
          { label: 'Noon', count: 1, share: 0.25 },
          { label: '1 pm', count: 0, share: 0 },
          { label: '2 pm', count: 3, share: 0.75 },
        ],
      },
    ]);
  });

  it('reports zero shares (not NaN) when nobody responded', () => {
    const [question] = tally(draftSurvey());
    assert.equal(question.total, 0);
    assert.deepEqual(question.choices.map((choice) => choice.share), [0, 0]);
  });
});
