// Results of a closed survey: one table per question, with the number of
// responses per choice, its share, and a bar drawn on a common 0–100% scale.

import { STATUS, SurveyError, tally } from '../survey.js';
import { h, plural } from './dom.js';

const percent = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 });

function questionTable(question, index) {
  return h(
    'section',
    { class: 'card result' },
    h(
      'table',
      {},
      h('caption', {}, h('span', { class: 'number' }, `${index + 1}.`), ` ${question.text}`),
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'col' }, 'Choice'),
          h('th', { scope: 'col', class: 'numeric' }, 'Responses'),
          h('th', { scope: 'col', class: 'numeric' }, 'Share'),
          h('th', { scope: 'col', class: 'chart-column' }, h('span', { class: 'visually-hidden' }, 'Chart')),
        ),
      ),
      h(
        'tbody',
        {},
        question.choices.map((choice) =>
          h(
            'tr',
            { title: `${choice.label}: ${plural(choice.count, 'response')} (${percent.format(choice.share)})` },
            h('th', { scope: 'row' }, choice.label),
            h('td', { class: 'numeric' }, String(choice.count)),
            h('td', { class: 'numeric' }, percent.format(choice.share)),
            h(
              'td',
              { class: 'chart-column', 'aria-hidden': 'true' },
              h('div', { class: 'bar-track' }, h('div', { class: 'bar', style: `width: ${choice.share * 100}%` })),
            ),
          ),
        ),
      ),
    ),
  );
}

export function resultsView({ store }, id) {
  const survey = store.getSurvey(id);
  if (survey.status !== STATUS.CLOSED) {
    throw new SurveyError('Results are published once the survey is closed.');
  }
  const total = survey.responses.length;

  return h(
    'div',
    { class: 'results' },
    h('p', { class: 'breadcrumb' }, h('a', { href: '#/' }, '← All surveys')),
    h('h1', {}, survey.title),
    h(
      'p',
      { class: 'lead' },
      total === 0
        ? 'This survey was closed before anyone responded.'
        : `Closed · ${plural(total, 'response')} · ${plural(survey.questions.length, 'question')}`,
    ),
    tally(survey).map(questionTable),
  );
}
