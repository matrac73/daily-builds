// Application state: accounts, the signed-in session and surveys, persisted
// as one JSON document in a Storage-like object (localStorage in the browser,
// an in-memory stand-in in tests). This is also where permissions live:
// every administrative operation checks the signed-in user's role.

import { ROLES, hashPassword, normalizeUsername, validateCredentials, verifyPassword } from './auth.js';
import {
  STATUS,
  SurveyError,
  closeSurvey,
  createSurvey,
  hasResponded,
  openSurvey,
  submitResponse,
} from './survey.js';

const STORAGE_KEY = 'survey-app/v1';

const emptyState = () => ({ users: [], surveys: [], session: null });

export class SurveyStore {
  #storage;
  #now;
  #state;

  /**
   * @param {Pick<Storage, 'getItem' | 'setItem'>} storage
   * @param {{ now?: () => Date }} [options]
   */
  constructor(storage, { now = () => new Date() } = {}) {
    this.#storage = storage;
    this.#now = now;
    this.#state = this.#load();
  }

  #load() {
    try {
      const saved = JSON.parse(this.#storage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.users) && Array.isArray(saved.surveys)) {
        return { ...emptyState(), ...saved };
      }
    } catch {
      // Unreadable data: fall through and start from a clean slate.
    }
    return emptyState();
  }

  #save() {
    this.#storage.setItem(STORAGE_KEY, JSON.stringify(this.#state));
  }

  /** True until the first account or survey exists. */
  get isEmpty() {
    return this.#state.users.length === 0 && this.#state.surveys.length === 0;
  }

  /** Wipes every account, survey and response. */
  reset() {
    this.#state = emptyState();
    this.#save();
  }

  // ── Accounts ────────────────────────────────────────────────────────────

  /** The signed-in user as `{ username, role }`, or null for a guest. */
  get currentUser() {
    const user = this.#state.users.find((candidate) => candidate.username === this.#state.session);
    return user ? { username: user.username, role: user.role } : null;
  }

  get isCoordinator() {
    return this.currentUser?.role === ROLES.COORDINATOR;
  }

  /** Creates an account. Usernames are unique, ignoring case. */
  async register(username, password, role = ROLES.RESPONDENT) {
    validateCredentials(username, password);
    const name = normalizeUsername(username);
    if (this.#state.users.some((user) => user.username === name)) {
      throw new SurveyError(`The username "${name}" is already taken.`);
    }
    const user = { username: name, role, password: await hashPassword(password) };
    this.#state.users.push(user);
    this.#save();
    return { username: user.username, role: user.role };
  }

  async login(username, password) {
    const name = normalizeUsername(username);
    const user = this.#state.users.find((candidate) => candidate.username === name);
    // Same message for an unknown user and a wrong password, so the form
    // does not reveal which usernames exist.
    if (!user || !(await verifyPassword(String(password ?? ''), user.password))) {
      throw new SurveyError('Wrong username or password.');
    }
    this.#state.session = user.username;
    this.#save();
    return this.currentUser;
  }

  logout() {
    this.#state.session = null;
    this.#save();
  }

  #requireUser() {
    const user = this.currentUser;
    if (!user) throw new SurveyError('Please sign in first.');
    return user;
  }

  #requireCoordinator() {
    const user = this.#requireUser();
    if (user.role !== ROLES.COORDINATOR) {
      throw new SurveyError('Only survey coordinators can do that.');
    }
    return user;
  }

  // ── Surveys ─────────────────────────────────────────────────────────────

  /** Surveys in one status, newest first. Drafts are only visible to coordinators. */
  listSurveys(status) {
    if (status === STATUS.DRAFT && !this.isCoordinator) return [];
    return this.#state.surveys
      .filter((survey) => survey.status === status)
      .sort((a, b) => b.id - a.id)
      .map((survey) => structuredClone(survey));
  }

  getSurvey(id) {
    const survey = this.#state.surveys.find((candidate) => candidate.id === Number(id));
    if (!survey || (survey.status === STATUS.DRAFT && !this.isCoordinator)) {
      throw new SurveyError('That survey does not exist.');
    }
    return structuredClone(survey);
  }

  /** Whether the signed-in user already completed the given survey. */
  hasCompleted(survey) {
    const user = this.currentUser;
    return user !== null && hasResponded(survey, user.username);
  }

  createSurvey(definition) {
    const user = this.#requireCoordinator();
    const id = this.#state.surveys.reduce((max, survey) => Math.max(max, survey.id), 0) + 1;
    const survey = createSurvey(definition, {
      id,
      createdBy: user.username,
      createdAt: this.#now().toISOString(),
    });
    this.#state.surveys.push(survey);
    this.#save();
    return structuredClone(survey);
  }

  openSurvey(id) {
    this.#requireCoordinator();
    return this.#replace(id, openSurvey);
  }

  closeSurvey(id) {
    this.#requireCoordinator();
    return this.#replace(id, closeSurvey);
  }

  /** Records the signed-in user's answers; each user can respond once. */
  submitResponse(id, answers) {
    const user = this.#requireUser();
    return this.#replace(id, (survey) =>
      submitResponse(survey, user.username, answers, this.#now().toISOString()),
    );
  }

  /**
   * Adds a response without a signed-in session. Used to load sample data;
   * the survey rules (open, once per respondent, complete) still apply.
   */
  importResponse(id, respondent, answers) {
    return this.#replace(id, (survey) =>
      submitResponse(survey, respondent, answers, this.#now().toISOString()),
    );
  }

  #replace(id, transform) {
    const index = this.#state.surveys.findIndex((survey) => survey.id === Number(id));
    if (index === -1) throw new SurveyError('That survey does not exist.');
    const updated = transform(this.#state.surveys[index]);
    this.#state.surveys[index] = updated;
    this.#save();
    return structuredClone(updated);
  }
}
