// Sign-in and account-creation pages.

import { DEMO_COORDINATOR } from '../demo.js';
import { SurveyError } from '../survey.js';
import { h } from './dom.js';

/**
 * A username/password form. `submit(username, password)` may be async and
 * may throw a SurveyError, which is shown above the fields.
 */
function credentialsForm({ submitLabel, passwordAutocomplete, submit }) {
  const username = h('input', {
    id: 'username',
    name: 'username',
    autocomplete: 'username',
    autocapitalize: 'none',
    spellcheck: 'false',
    required: true,
  });
  const password = h('input', {
    id: 'password',
    name: 'password',
    type: 'password',
    autocomplete: passwordAutocomplete,
    required: true,
  });
  const error = h('p', { class: 'error', role: 'alert', hidden: true });
  const button = h('button', { type: 'submit', class: 'primary' }, submitLabel);

  const form = h(
    'form',
    {
      class: 'card form',
      novalidate: true,
      onsubmit: async (event) => {
        event.preventDefault();
        button.disabled = true;
        error.hidden = true;
        try {
          await submit(username.value, password.value);
        } catch (failure) {
          if (!(failure instanceof SurveyError)) throw failure;
          error.textContent = failure.message;
          error.hidden = false;
          button.disabled = false;
        }
      },
    },
    error,
    h('label', { for: 'username' }, 'Username'),
    username,
    h('label', { for: 'password' }, 'Password'),
    password,
    h('div', { class: 'form-actions' }, button, h('a', { class: 'button', href: '#/' }, 'Cancel')),
  );

  return { form, username, password };
}

export function loginView({ store, navigate }) {
  const { form, username, password } = credentialsForm({
    submitLabel: 'Sign in',
    passwordAutocomplete: 'current-password',
    submit: async (name, secret) => {
      const user = await store.login(name, secret);
      navigate('/', `Signed in as ${user.username}.`);
    },
  });

  const demo = h(
    'aside',
    { class: 'card note' },
    h('h2', {}, 'Just looking around?'),
    h(
      'p',
      {},
      'A demo coordinator account is built in: ',
      h('code', {}, DEMO_COORDINATOR.username),
      ' / ',
      h('code', {}, DEMO_COORDINATOR.password),
      '. Coordinators can define, open and close surveys.',
    ),
    h(
      'button',
      {
        type: 'button',
        onclick: () => {
          username.value = DEMO_COORDINATOR.username;
          password.value = DEMO_COORDINATOR.password;
          form.requestSubmit();
        },
      },
      'Sign in as the demo coordinator',
    ),
  );

  return h(
    'div',
    { class: 'narrow' },
    h('h1', {}, 'Sign in'),
    form,
    h('p', { class: 'hint' }, 'No account yet? ', h('a', { href: '#/register' }, 'Create one'), ' to respond to surveys.'),
    demo,
  );
}

export function registerView({ store, navigate }) {
  const { form } = credentialsForm({
    submitLabel: 'Create account',
    passwordAutocomplete: 'new-password',
    submit: async (name, secret) => {
      await store.register(name, secret);
      const user = await store.login(name, secret);
      navigate('/', `Welcome, ${user.username}! You can now respond to open surveys.`);
    },
  });

  return h(
    'div',
    { class: 'narrow' },
    h('h1', {}, 'Create a respondent account'),
    form,
    h(
      'p',
      { class: 'hint' },
      'Usernames are 3–24 characters, passwords at least 8. Already registered? ',
      h('a', { href: '#/login' }, 'Sign in'),
      '.',
    ),
  );
}
