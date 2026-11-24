// Home page: the three survey lists (drafts, open, closed) with the actions
// each role can take on them.

import { STATUS } from '../survey.js';
import { h, plural } from './dom.js';

function surveyCard(survey, actions) {
  return h(
    'li',
    { class: 'card survey-card' },
    h(
      'div',
      {},
      h('h3', {}, survey.title),
      h(
        'p',
        { class: 'meta' },
        `${plural(survey.questions.length, 'question')} · ${plural(survey.responses.length, 'response')}`,
      ),
    ),
    h('div', { class: 'actions' }, actions),
  );
}

function section(title, hint, surveys, emptyText, actionsFor) {
  return h(
    'section',
    { class: 'survey-section' },
    h('h2', {}, title, h('span', { class: 'count' }, String(surveys.length))),
    h('p', { class: 'hint' }, hint),
    surveys.length === 0
      ? h('p', { class: 'empty' }, emptyText)
      : h('ul', { class: 'survey-list' }, surveys.map((survey) => surveyCard(survey, actionsFor(survey)))),
  );
}

export function homeView({ store, navigate }) {
  const user = store.currentUser;
  const coordinator = store.isCoordinator;

  const openActions = (survey) => {
    const actions = [];
    if (!user) {
      actions.push(h('a', { class: 'button', href: '#/login' }, 'Sign in to respond'));
    } else if (store.hasCompleted(survey)) {
      actions.push(h('span', { class: 'badge' }, '✓ Completed'));
    } else {
      actions.push(h('a', { class: 'button primary', href: `#/take/${survey.id}` }, 'Take survey'));
    }
    if (coordinator) {
      actions.push(
        h(
          'button',
          {
            type: 'button',
            onclick: () => {
              if (!window.confirm(`Close "${survey.title}"? It will stop accepting responses.`)) return;
              store.closeSurvey(survey.id);
              navigate('/', `"${survey.title}" is closed. Its results are now public.`);
            },
          },
          'Close survey',
        ),
      );
    }
    return actions;
  };

  const draftActions = (survey) => [
    h(
      'button',
      {
        type: 'button',
        class: 'primary',
        onclick: () => {
          store.openSurvey(survey.id);
          navigate('/', `"${survey.title}" is now open for responses.`);
        },
      },
      'Open for responses',
    ),
  ];

  const closedActions = (survey) => [
    h('a', { class: 'button', href: `#/results/${survey.id}` }, 'View results'),
  ];

  return h(
    'div',
    {},
    h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        {},
        h('h1', {}, 'Surveys'),
        h(
          'p',
          { class: 'lead' },
          coordinator
            ? 'Define surveys, open them for responses, and close them to publish the results.'
            : 'Answer the surveys that are open, and browse the results of closed ones.',
        ),
      ),
      coordinator && h('a', { class: 'button primary', href: '#/new' }, '+ New survey'),
    ),
    coordinator &&
      section(
        'Drafts',
        'Defined but not yet visible to respondents.',
        store.listSurveys(STATUS.DRAFT),
        'No drafts. Create a survey to get started.',
        draftActions,
      ),
    section(
      'Open surveys',
      'Currently collecting responses — one response per account.',
      store.listSurveys(STATUS.OPEN),
      'No survey is open right now.',
      openActions,
    ),
    section(
      'Closed surveys',
      'No longer accepting responses. Results are visible to everyone.',
      store.listSurveys(STATUS.CLOSED),
      'No survey has been closed yet.',
      closedActions,
    ),
  );
}
