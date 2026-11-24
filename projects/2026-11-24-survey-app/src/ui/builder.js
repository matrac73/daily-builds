// Survey builder (coordinators only): a title plus 1–10 questions, each with
// 1–5 mutually exclusive choices.

import { LIMITS, SurveyError, validateDefinition } from '../survey.js';
import { h } from './dom.js';

const blankQuestion = () => ({ text: '', choices: ['', ''] });

export function builderView({ store, navigate }) {
  if (!store.isCoordinator) {
    throw new SurveyError('Only survey coordinators can define surveys.');
  }

  // The form's model. Inputs write into it as the user types; adding or
  // removing a question or choice re-renders the question list from it.
  const draft = { title: '', questions: [blankQuestion()] };

  const errors = h('div', { class: 'error', role: 'alert', hidden: true });
  const questionList = h('div', { class: 'question-list' });
  const addQuestion = h(
    'button',
    {
      type: 'button',
      onclick: () => {
        draft.questions.push(blankQuestion());
        renderQuestions();
        questionList.querySelector('.question:last-child input')?.focus();
      },
    },
    '+ Add question',
  );

  function choiceRow(question, questionIndex, choiceIndex) {
    const label = `Question ${questionIndex + 1}, choice ${choiceIndex + 1}`;
    return h(
      'li',
      { class: 'choice-row' },
      h('span', { class: 'fake-check', 'aria-hidden': 'true' }),
      h('input', {
        value: question.choices[choiceIndex],
        placeholder: `Choice ${choiceIndex + 1}`,
        'aria-label': label,
        maxlength: LIMITS.maxTextLength,
        oninput: (event) => {
          question.choices[choiceIndex] = event.target.value;
        },
      }),
      h(
        'button',
        {
          type: 'button',
          class: 'icon',
          'aria-label': `Remove ${label.toLowerCase()}`,
          title: 'Remove choice',
          disabled: question.choices.length <= LIMITS.minChoices,
          onclick: () => {
            question.choices.splice(choiceIndex, 1);
            renderQuestions();
          },
        },
        '×',
      ),
    );
  }

  function questionCard(question, questionIndex) {
    return h(
      'fieldset',
      { class: 'card question' },
      h('legend', {}, `Question ${questionIndex + 1}`),
      h('input', {
        class: 'question-text',
        value: question.text,
        placeholder: 'What do you want to ask?',
        'aria-label': `Question ${questionIndex + 1} text`,
        maxlength: LIMITS.maxTextLength,
        oninput: (event) => {
          question.text = event.target.value;
        },
      }),
      h('ul', { class: 'choice-list' }, question.choices.map((_, choiceIndex) => choiceRow(question, questionIndex, choiceIndex))),
      h(
        'div',
        { class: 'question-actions' },
        h(
          'button',
          {
            type: 'button',
            disabled: question.choices.length >= LIMITS.maxChoices,
            onclick: () => {
              question.choices.push('');
              renderQuestions();
              questionList.children[questionIndex].querySelector('.choice-row:last-child input')?.focus();
            },
          },
          '+ Add choice',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'danger',
            disabled: draft.questions.length <= LIMITS.minQuestions,
            onclick: () => {
              draft.questions.splice(questionIndex, 1);
              renderQuestions();
            },
          },
          'Remove question',
        ),
      ),
    );
  }

  function renderQuestions() {
    questionList.replaceChildren(...draft.questions.map(questionCard));
    addQuestion.disabled = draft.questions.length >= LIMITS.maxQuestions;
  }

  function save(event) {
    event.preventDefault();
    const problems = validateDefinition(draft);
    if (problems.length > 0) {
      errors.replaceChildren(
        h('strong', {}, 'This survey cannot be saved yet:'),
        h('ul', {}, problems.map((problem) => h('li', {}, problem))),
      );
      errors.hidden = false;
      errors.scrollIntoView({ block: 'center' });
      return;
    }
    const survey = store.createSurvey(draft);
    navigate('/', `"${survey.title}" was saved as a draft. Open it when you are ready to collect responses.`);
  }

  renderQuestions();

  return h(
    'form',
    { class: 'builder', novalidate: true, onsubmit: save },
    h('h1', {}, 'New survey'),
    h(
      'p',
      { class: 'lead' },
      `Up to ${LIMITS.maxQuestions} multiple-choice questions, each with up to ${LIMITS.maxChoices} choices. Respondents pick exactly one choice per question.`,
    ),
    errors,
    h(
      'div',
      { class: 'card form' },
      h('label', { for: 'survey-title' }, 'Survey title'),
      h('input', {
        id: 'survey-title',
        placeholder: 'e.g. Team offsite planning',
        maxlength: LIMITS.maxTitleLength,
        oninput: (event) => {
          draft.title = event.target.value;
        },
      }),
    ),
    questionList,
    addQuestion,
    h(
      'div',
      { class: 'form-actions sticky' },
      h('button', { type: 'submit', class: 'primary' }, 'Save'),
      h('a', { class: 'button', href: '#/' }, 'Cancel'),
    ),
  );
}
