// Responding to an open survey: one mutually exclusive choice per question.

import { STATUS, SurveyError, UNANSWERED, unansweredQuestions } from '../survey.js';
import { h } from './dom.js';

export function takeView({ store, navigate }, id) {
  const survey = store.getSurvey(id);
  if (survey.status !== STATUS.OPEN) {
    throw new SurveyError('This survey is not open for responses.');
  }
  if (!store.currentUser) {
    throw new SurveyError('Please sign in to respond to this survey.');
  }
  if (store.hasCompleted(survey)) {
    throw new SurveyError('You have already completed this survey.');
  }

  const answers = survey.questions.map(() => UNANSWERED);
  const total = survey.questions.length;

  const progress = h('p', { class: 'progress', 'aria-live': 'polite' });
  const error = h('p', { class: 'error', role: 'alert', hidden: true });

  const updateProgress = () => {
    const answered = total - unansweredQuestions(survey, answers).length;
    progress.textContent = `${answered} of ${total} answered`;
  };

  // Each question is a group of same-named radio inputs, drawn as checkboxes:
  // ticking one automatically unticks the previous selection.
  const fieldsets = survey.questions.map((question, questionIndex) =>
    h(
      'fieldset',
      { class: 'card question' },
      h('legend', {}, h('span', { class: 'number' }, `${questionIndex + 1}.`), ` ${question.text}`),
      question.choices.map((choice, choiceIndex) =>
        h(
          'label',
          { class: 'choice' },
          h('input', {
            type: 'radio',
            class: 'check',
            name: `question-${questionIndex}`,
            value: String(choiceIndex),
            onchange: () => {
              answers[questionIndex] = choiceIndex;
              fieldsets[questionIndex].classList.remove('missing');
              updateProgress();
            },
          }),
          h('span', {}, choice),
        ),
      ),
    ),
  );

  function submit(event) {
    event.preventDefault();
    try {
      store.submitResponse(survey.id, answers);
    } catch (failure) {
      if (!(failure instanceof SurveyError)) throw failure;
      error.textContent = failure.message;
      error.hidden = false;
      const missing = failure.missing ?? [];
      fieldsets.forEach((fieldset, index) => fieldset.classList.toggle('missing', missing.includes(index)));
      const first = fieldsets[missing[0]];
      if (first) {
        first.scrollIntoView({ block: 'center' });
        first.querySelector('input').focus({ preventScroll: true });
      }
      return;
    }
    navigate('/', `Thanks! Your response to "${survey.title}" was recorded.`);
  }

  updateProgress();

  return h(
    'form',
    { class: 'take', novalidate: true, onsubmit: submit },
    h('h1', {}, survey.title),
    h('p', { class: 'lead' }, 'Pick one answer per question. You can change your mind until you submit.'),
    fieldsets,
    error,
    h(
      'div',
      { class: 'form-actions sticky' },
      h('button', { type: 'submit', class: 'primary' }, 'Submit'),
      h('a', { class: 'button', href: '#/' }, 'Cancel'),
      progress,
    ),
  );
}
