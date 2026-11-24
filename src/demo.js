// Sample data loaded on first visit, so the app has something to show:
// a coordinator account plus one survey in each state.

import { ROLES } from './auth.js';

/** Public on purpose: these are demo credentials shown on the sign-in page. */
export const DEMO_COORDINATOR = Object.freeze({
  username: 'coordinator',
  password: 'survey-demo',
});

const CLOSED_SURVEY = {
  title: 'Developer tooling check-in',
  questions: [
    {
      text: 'Which editor do you spend most of your day in?',
      choices: ['VS Code', 'A JetBrains IDE', 'Vim or Neovim', 'Something else'],
    },
    {
      text: 'How happy are you with our CI pipeline?',
      choices: ['Very happy', 'Happy', 'Neutral', 'Unhappy', 'Very unhappy'],
    },
    {
      text: 'How often do flaky tests block your pull requests?',
      choices: ['Never', 'Monthly', 'Weekly', 'Daily'],
    },
  ],
};

// How many sample respondents picked each choice, per question.
// Every row adds up to the same number of respondents.
const CLOSED_SURVEY_COUNTS = [
  [11, 6, 5, 2],
  [3, 9, 7, 4, 1],
  [2, 8, 10, 4],
];

const OPEN_SURVEY = {
  title: 'Team offsite planning',
  questions: [
    {
      text: 'Which month suits you best?',
      choices: ['March', 'April', 'May', 'June'],
    },
    {
      text: 'What kind of place should we go to?',
      choices: ['Mountains', 'Seaside', 'A big city'],
    },
    {
      text: 'How long should the offsite be?',
      choices: ['Two days', 'Three days', 'A full week'],
    },
  ],
};

const DRAFT_SURVEY = {
  title: 'Quarterly priorities',
  questions: [
    {
      text: 'What should the team focus on next quarter?',
      choices: ['Performance', 'New features', 'Paying down tech debt', 'Documentation'],
    },
    {
      text: 'Is our current release cadence right?',
      choices: ['Too fast', 'About right', 'Too slow'],
    },
  ],
};

/** Expands per-choice counts into one answer list per respondent. */
function answersFromCounts(counts) {
  const columns = counts.map((row) => row.flatMap((count, choice) => Array(count).fill(choice)));
  return columns[0].map((_, respondent) =>
    // Rotate each column by a different offset so answers are not perfectly correlated.
    columns.map((column, question) => column[(respondent + question * 7) % column.length]),
  );
}

/** Fills an empty store with the sample data and leaves the visitor signed out. */
export async function seedDemoData(store) {
  await store.register(DEMO_COORDINATOR.username, DEMO_COORDINATOR.password, ROLES.COORDINATOR);
  await store.login(DEMO_COORDINATOR.username, DEMO_COORDINATOR.password);

  const closed = store.createSurvey(CLOSED_SURVEY);
  store.openSurvey(closed.id);
  answersFromCounts(CLOSED_SURVEY_COUNTS).forEach((answers, index) => {
    store.importResponse(closed.id, `sample-respondent-${index + 1}`, answers);
  });
  store.closeSurvey(closed.id);

  const open = store.createSurvey(OPEN_SURVEY);
  store.openSurvey(open.id);

  store.createSurvey(DRAFT_SURVEY);
  store.logout();
}
