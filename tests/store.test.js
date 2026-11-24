import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ROLES, hashPassword, verifyPassword } from '../src/auth.js';
import { DEMO_COORDINATOR, seedDemoData } from '../src/demo.js';
import { SurveyStore } from '../src/store.js';
import { STATUS, SurveyError, tally } from '../src/survey.js';

/** Minimal stand-in for window.localStorage. */
function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
  };
}

const PASSWORD = 'correct horse';
const definition = {
  title: 'Lunch',
  questions: [
    { text: 'Pizza or pasta?', choices: ['Pizza', 'Pasta'] },
    { text: 'When?', choices: ['Noon', '1 pm'] },
  ],
};

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const record = await hashPassword(PASSWORD);
    assert.equal(await verifyPassword(PASSWORD, record), true);
    assert.equal(await verifyPassword('correct horsf', record), false);
  });

  it('salts each hash and never keeps the plain password', async () => {
    const [first, second] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
    assert.notEqual(first.salt, second.salt);
    assert.notEqual(first.hash, second.hash);
    assert.ok(!JSON.stringify(first).includes(PASSWORD));
  });
});

describe('SurveyStore', () => {
  let storage;
  let store;

  /** Registers the three accounts used throughout and leaves nobody signed in. */
  beforeEach(async () => {
    storage = memoryStorage();
    store = new SurveyStore(storage, { now: () => new Date('2026-03-01T12:00:00Z') });
    await store.register('carol', PASSWORD, ROLES.COORDINATOR);
    await store.register('bob', PASSWORD);
    await store.register('eve', PASSWORD);
  });

  const as = (username) => store.login(username, PASSWORD);

  describe('accounts', () => {
    it('signs users in and out', async () => {
      assert.equal(store.currentUser, null);
      assert.deepEqual(await as('bob'), { username: 'bob', role: ROLES.RESPONDENT });
      assert.equal(store.isCoordinator, false);
      store.logout();
      assert.equal(store.currentUser, null);
      await as('carol');
      assert.equal(store.isCoordinator, true);
    });

    it('treats usernames as case-insensitive and unique', async () => {
      await assert.rejects(store.register(' BOB ', PASSWORD), /already taken/);
      assert.equal((await store.login('Bob', PASSWORD)).username, 'bob');
    });

    it('rejects invalid usernames and short passwords', async () => {
      await assert.rejects(store.register('x', PASSWORD), SurveyError);
      await assert.rejects(store.register('has space', PASSWORD), SurveyError);
      await assert.rejects(store.register('dave', 'short'), /at least 8/);
    });

    it('gives the same error for a wrong password and an unknown user', async () => {
      await assert.rejects(store.login('bob', 'wrong password'), /Wrong username or password/);
      await assert.rejects(store.login('nobody', PASSWORD), /Wrong username or password/);
      assert.equal(store.currentUser, null);
    });
  });

  describe('permissions', () => {
    it('lets only coordinators define, open and close surveys', async () => {
      assert.throws(() => store.createSurvey(definition), /sign in/);
      await as('carol');
      const survey = store.createSurvey(definition);

      await as('bob');
      assert.throws(() => store.createSurvey(definition), /Only survey coordinators/);
      assert.throws(() => store.openSurvey(survey.id), /Only survey coordinators/);
      assert.throws(() => store.closeSurvey(survey.id), /Only survey coordinators/);
    });

    it('hides drafts from respondents and guests', async () => {
      await as('carol');
      const survey = store.createSurvey(definition);
      assert.equal(store.listSurveys(STATUS.DRAFT).length, 1);

      await as('bob');
      assert.deepEqual(store.listSurveys(STATUS.DRAFT), []);
      assert.throws(() => store.getSurvey(survey.id), /does not exist/);
    });

    it('requires an account to respond', async () => {
      await as('carol');
      const survey = store.openSurvey(store.createSurvey(definition).id);
      store.logout();
      assert.throws(() => store.submitResponse(survey.id, [0, 0]), /sign in/);
    });
  });

  describe('survey workflow', () => {
    it('runs a survey from definition to published results', async () => {
      await as('carol');
      const { id } = store.createSurvey(definition);
      assert.equal(store.getSurvey(id).createdAt, '2026-03-01T12:00:00.000Z');
      store.openSurvey(id);
      assert.deepEqual(store.listSurveys(STATUS.OPEN).map((survey) => survey.id), [id]);

      await as('bob');
      assert.equal(store.hasCompleted(store.getSurvey(id)), false);
      assert.throws(() => store.submitResponse(id, [0, null]), (error) => error.missing[0] === 1);
      store.submitResponse(id, [0, 1]);
      assert.equal(store.hasCompleted(store.getSurvey(id)), true);
      assert.throws(() => store.submitResponse(id, [1, 1]), /already completed/);

      await as('eve');
      store.submitResponse(id, [1, 1]);

      await as('carol');
      store.closeSurvey(id);
      store.logout();

      const [closed] = store.listSurveys(STATUS.CLOSED);
      assert.deepEqual(
        tally(closed).map((question) => question.choices.map((choice) => choice.count)),
        [[1, 1], [0, 2]],
      );
    });

    it('assigns increasing ids and lists newest first', async () => {
      await as('carol');
      store.createSurvey(definition);
      store.createSurvey({ ...definition, title: 'Dinner' });
      assert.deepEqual(store.listSurveys(STATUS.DRAFT).map((survey) => [survey.id, survey.title]), [
        [2, 'Dinner'],
        [1, 'Lunch'],
      ]);
    });

    it('does not save an invalid survey', async () => {
      await as('carol');
      assert.throws(() => store.createSurvey({ title: '', questions: [] }), SurveyError);
      assert.deepEqual(store.listSurveys(STATUS.DRAFT), []);
    });

    it('returns copies, so callers cannot corrupt stored surveys', async () => {
      await as('carol');
      const survey = store.createSurvey(definition);
      survey.title = 'Tampered';
      survey.questions[0].choices.push('Salad');
      assert.equal(store.getSurvey(survey.id).title, 'Lunch');
      assert.equal(store.getSurvey(survey.id).questions[0].choices.length, 2);
    });
  });

  describe('persistence', () => {
    it('restores accounts, session and surveys from storage', async () => {
      await as('carol');
      const { id } = store.createSurvey(definition);
      store.openSurvey(id);

      const reloaded = new SurveyStore(storage);
      assert.deepEqual(reloaded.currentUser, { username: 'carol', role: ROLES.COORDINATOR });
      assert.equal(reloaded.getSurvey(id).status, STATUS.OPEN);
    });

    it('starts empty when storage holds garbage', () => {
      const broken = memoryStorage();
      broken.setItem('survey-app/v1', '{not json');
      assert.equal(new SurveyStore(broken).isEmpty, true);
    });

    it('reset() erases everything', async () => {
      await as('carol');
      store.createSurvey(definition);
      store.reset();
      assert.equal(store.isEmpty, true);
      assert.equal(new SurveyStore(storage).isEmpty, true);
    });
  });
});

describe('seedDemoData', () => {
  it('creates one survey per state and a working coordinator account', async () => {
    const store = new SurveyStore(memoryStorage());
    await seedDemoData(store);

    assert.equal(store.currentUser, null, 'the visitor starts signed out');
    assert.equal(store.listSurveys(STATUS.OPEN).length, 1);

    const [closed] = store.listSurveys(STATUS.CLOSED);
    assert.equal(closed.responses.length, 24);
    assert.deepEqual(
      tally(closed)[0].choices.map((choice) => choice.count),
      [11, 6, 5, 2],
    );

    await store.login(DEMO_COORDINATOR.username, DEMO_COORDINATOR.password);
    assert.equal(store.isCoordinator, true);
    assert.equal(store.listSurveys(STATUS.DRAFT).length, 1);
  });
});
