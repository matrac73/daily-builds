// Browser entry point: wires the store to the page, routes `#/…` URLs to
// views and renders the navigation bar.

import { seedDemoData } from './demo.js';
import { SurveyStore } from './store.js';
import { SurveyError } from './survey.js';
import { loginView, registerView } from './ui/account.js';
import { builderView } from './ui/builder.js';
import { h } from './ui/dom.js';
import { homeView } from './ui/home.js';
import { resultsView } from './ui/results.js';
import { takeView } from './ui/take.js';

const ROUTES = [
  [/^\/$/, homeView],
  [/^\/login$/, loginView],
  [/^\/register$/, registerView],
  [/^\/new$/, builderView],
  [/^\/take\/(\d+)$/, takeView],
  [/^\/results\/(\d+)$/, resultsView],
];

/** localStorage when available, otherwise a per-tab in-memory fallback. */
function browserStorage() {
  try {
    window.localStorage.setItem('survey-app/probe', '1');
    window.localStorage.removeItem('survey-app/probe');
    return window.localStorage;
  } catch {
    const memory = new Map();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
    };
  }
}

const store = new SurveyStore(browserStorage());
const main = document.querySelector('#main');
const nav = document.querySelector('#nav');

// A one-off confirmation ("Survey saved…") shown on the next rendered page.
let flash = null;

function navigate(path, message = null) {
  flash = message;
  if (window.location.hash === `#${path}`) {
    render();
  } else {
    window.location.hash = path;
  }
}

function renderNav() {
  const user = store.currentUser;
  if (!user) {
    nav.replaceChildren(
      h('a', { href: '#/login' }, 'Sign in'),
      h('a', { class: 'button', href: '#/register' }, 'Create account'),
    );
    return;
  }
  nav.replaceChildren(
    h('span', { class: 'who' }, user.username, h('span', { class: 'badge' }, user.role)),
    h(
      'button',
      {
        type: 'button',
        onclick: () => {
          store.logout();
          navigate('/', 'You are signed out.');
        },
      },
      'Sign out',
    ),
  );
}

function errorCard(message) {
  return h(
    'div',
    { class: 'card note narrow' },
    h('h1', {}, 'Nothing to see here'),
    h('p', {}, message),
    h(
      'div',
      { class: 'form-actions' },
      h('a', { class: 'button primary', href: '#/' }, 'Back to surveys'),
      !store.currentUser && h('a', { class: 'button', href: '#/login' }, 'Sign in'),
    ),
  );
}

function resolveView(path) {
  for (const [pattern, view] of ROUTES) {
    const match = pattern.exec(path);
    if (!match) continue;
    try {
      return view({ store, navigate }, ...match.slice(1));
    } catch (failure) {
      if (!(failure instanceof SurveyError)) throw failure;
      return errorCard(failure.message);
    }
  }
  return errorCard('This page does not exist.');
}

function render() {
  const path = window.location.hash.slice(1) || '/';
  renderNav();
  main.replaceChildren(
    ...(flash ? [h('p', { class: 'flash', role: 'status' }, flash)] : []),
    resolveView(path),
  );
  flash = null;
  window.scrollTo(0, 0);
}

document.querySelector('#reset').addEventListener('click', async () => {
  if (!window.confirm('Erase every account, survey and response stored in this browser, and reload the sample data?')) {
    return;
  }
  store.reset();
  await seedDemoData(store);
  navigate('/', 'The sample data was restored.');
});

if (store.isEmpty) {
  await seedDemoData(store);
}
window.addEventListener('hashchange', render);
render();
