import { toSummary } from './movies.js';

const NAME_PATTERN = /^[\p{L}\p{N} _.-]{2,20}$/u;
const GUEST = '@guest'; // "@" is not allowed in names, so this can never clash with an account
export const MAX_REVIEW_LENGTH = 2000;

const emptyState = () => ({
  users: [],
  currentUser: null,
  watchlists: {},
  reviews: {},
  tmdbKey: '',
});

/**
 * Everything the visitor owns — accounts, watchlists, reviews and settings —
 * persisted in a Storage-like object (localStorage in the browser). Accounts
 * are local profiles: they separate data per person on a shared device and
 * are not a security boundary.
 *
 * Emits a `change` event after every mutation; `event.detail.scope` is one
 * of 'session', 'watchlist', 'reviews' or 'settings'.
 */
export class UserStore extends EventTarget {
  #storage;
  #key;
  #now;
  #state;

  constructor({ storage = null, key = 'marquee:v1', now = () => new Date() } = {}) {
    super();
    this.#storage = storage;
    this.#key = key;
    this.#now = now;
    this.#state = { ...emptyState(), ...this.#read() };
  }

  #read() {
    try {
      const saved = JSON.parse(this.#storage?.getItem(this.#key) ?? 'null');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch {
      return {};
    }
  }

  #commit(scope) {
    try {
      this.#storage?.setItem(this.#key, JSON.stringify(this.#state));
    } catch {
      // Storage is full or blocked: the session keeps working from memory.
    }
    this.dispatchEvent(new CustomEvent('change', { detail: { scope } }));
  }

  // ── Accounts ──────────────────────────────────────────────────────────

  get users() {
    return [...this.#state.users];
  }

  get currentUser() {
    return this.#state.currentUser;
  }

  /** Creates a profile and signs it in. A guest watchlist follows its owner into the account. */
  createAccount(rawName) {
    const name = String(rawName ?? '').trim().replace(/\s+/g, ' ');
    if (!NAME_PATTERN.test(name)) {
      throw new Error('Use 2–20 letters, numbers, spaces, dots, dashes or underscores.');
    }
    if (this.#state.users.some((user) => user.toLowerCase() === name.toLowerCase())) {
      throw new Error(`“${name}” already exists on this device.`);
    }
    this.#state.users.push(name);
    const guestList = this.#state.watchlists[GUEST];
    if (guestList?.length) {
      this.#state.watchlists[name] = guestList;
      delete this.#state.watchlists[GUEST];
    }
    this.#state.currentUser = name;
    this.#commit('session');
    return name;
  }

  signIn(name) {
    if (!this.#state.users.includes(name)) throw new Error(`No account named “${name}”.`);
    this.#state.currentUser = name;
    this.#commit('session');
  }

  signOut() {
    this.#state.currentUser = null;
    this.#commit('session');
  }

  // ── Watchlist ─────────────────────────────────────────────────────────

  get #watchlistKey() {
    return this.#state.currentUser ?? GUEST;
  }

  /** The current user's saved movies (the guest list when signed out), latest addition first. */
  get watchlist() {
    return [...(this.#state.watchlists[this.#watchlistKey] ?? [])];
  }

  isInWatchlist(movieId) {
    return this.watchlist.some((movie) => movie.id === movieId);
  }

  /** Adds or removes the movie; returns whether it is saved afterwards. */
  toggleWatchlist(movie) {
    const saved = this.isInWatchlist(movie.id);
    this.#state.watchlists[this.#watchlistKey] = saved
      ? this.watchlist.filter((entry) => entry.id !== movie.id)
      : [toSummary(movie), ...this.watchlist];
    this.#commit('watchlist');
    return !saved;
  }

  // ── Reviews ───────────────────────────────────────────────────────────

  /** Reviews written on this device for a movie, most recent first. */
  reviewsFor(movieId) {
    return [...(this.#state.reviews[movieId] ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  }

  ownReview(movieId) {
    const author = this.#state.currentUser;
    return this.reviewsFor(movieId).find((review) => review.author === author) ?? null;
  }

  /** Publishes the signed-in user's review, replacing their previous one for the movie. */
  saveReview(movieId, { rating, text }) {
    const author = this.#state.currentUser;
    if (!author) throw new Error('Sign in to review movies.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error('Pick a rating between 1 and 5 stars.');
    }
    const body = String(text ?? '').trim();
    if (!body) throw new Error('Write a few words about the movie.');
    if (body.length > MAX_REVIEW_LENGTH) {
      throw new Error(`Reviews are limited to ${MAX_REVIEW_LENGTH} characters.`);
    }
    const others = (this.#state.reviews[movieId] ?? []).filter((review) => review.author !== author);
    this.#state.reviews[movieId] = [
      ...others,
      { author, rating, text: body, date: this.#now().toISOString() },
    ];
    this.#commit('reviews');
  }

  deleteReview(movieId) {
    const author = this.#state.currentUser;
    const remaining = (this.#state.reviews[movieId] ?? []).filter((review) => review.author !== author);
    if (remaining.length) this.#state.reviews[movieId] = remaining;
    else delete this.#state.reviews[movieId];
    this.#commit('reviews');
  }

  // ── Settings ──────────────────────────────────────────────────────────

  get tmdbKey() {
    return this.#state.tmdbKey;
  }

  setTmdbKey(key) {
    this.#state.tmdbKey = String(key ?? '').trim();
    this.#commit('settings');
  }
}
