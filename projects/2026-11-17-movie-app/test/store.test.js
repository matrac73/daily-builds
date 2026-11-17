import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_REVIEW_LENGTH, UserStore } from '../src/lib/store.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

const dune = { id: 'dune', title: 'Dune', releaseDate: '2021-10-22', rating: 7.8, overview: 'Spice.' };
const anora = { id: 'anora', title: 'Anora', releaseDate: '2024-10-18', rating: 7.1 };

function recordScopes(store) {
  const scopes = [];
  store.addEventListener('change', (event) => scopes.push(event.detail.scope));
  return scopes;
}

test('starts empty and signed out', () => {
  const store = new UserStore();
  assert.equal(store.currentUser, null);
  assert.deepEqual(store.users, []);
  assert.deepEqual(store.watchlist, []);
  assert.equal(store.tmdbKey, '');
});

test('createAccount normalises the name and signs in', () => {
  const store = new UserStore();
  const scopes = recordScopes(store);
  assert.equal(store.createAccount('  Ada   Lovelace '), 'Ada Lovelace');
  assert.equal(store.currentUser, 'Ada Lovelace');
  assert.deepEqual(store.users, ['Ada Lovelace']);
  assert.deepEqual(scopes, ['session']);
});

test('createAccount rejects invalid and duplicate names', () => {
  const store = new UserStore();
  store.createAccount('Ada');
  assert.throws(() => store.createAccount('a'), /2–20/);
  assert.throws(() => store.createAccount('<script>'), /2–20/);
  assert.throws(() => store.createAccount('x'.repeat(21)), /2–20/);
  assert.throws(() => store.createAccount('ADA'), /already exists/);
  assert.deepEqual(store.users, ['Ada']);
});

test('signIn and signOut switch between existing accounts', () => {
  const store = new UserStore();
  store.createAccount('Ada');
  store.createAccount('Grace');
  store.signIn('Ada');
  assert.equal(store.currentUser, 'Ada');
  store.signOut();
  assert.equal(store.currentUser, null);
  assert.throws(() => store.signIn('Nobody'), /No account/);
});

test('toggleWatchlist adds summaries newest first and removes them again', () => {
  const store = new UserStore();
  const scopes = recordScopes(store);
  assert.equal(store.toggleWatchlist(dune), true);
  assert.equal(store.toggleWatchlist(anora), true);
  assert.deepEqual(store.watchlist.map((movie) => movie.id), ['anora', 'dune']);
  assert.equal('overview' in store.watchlist[1], false, 'only the card summary is stored');
  assert.equal(store.isInWatchlist('dune'), true);

  assert.equal(store.toggleWatchlist(dune), false);
  assert.equal(store.isInWatchlist('dune'), false);
  assert.deepEqual(scopes, ['watchlist', 'watchlist', 'watchlist']);
});

test('each account has its own watchlist', () => {
  const store = new UserStore();
  store.createAccount('Ada');
  store.toggleWatchlist(dune);
  store.createAccount('Grace');
  assert.deepEqual(store.watchlist, []);
  store.toggleWatchlist(anora);
  store.signIn('Ada');
  assert.deepEqual(store.watchlist.map((movie) => movie.id), ['dune']);
});

test('a guest watchlist moves into the first account created', () => {
  const store = new UserStore();
  store.toggleWatchlist(dune);
  store.createAccount('Ada');
  assert.deepEqual(store.watchlist.map((movie) => movie.id), ['dune']);
  store.signOut();
  assert.deepEqual(store.watchlist, [], 'the guest list is emptied by the move');
});

test('saveReview requires an account and valid input', () => {
  const store = new UserStore();
  assert.throws(() => store.saveReview('dune', { rating: 4, text: 'Great' }), /Sign in/);
  store.createAccount('Ada');
  assert.throws(() => store.saveReview('dune', { rating: 0, text: 'Great' }), /between 1 and 5/);
  assert.throws(() => store.saveReview('dune', { rating: 4.5, text: 'Great' }), /between 1 and 5/);
  assert.throws(() => store.saveReview('dune', { rating: 4, text: '   ' }), /few words/);
  assert.throws(
    () => store.saveReview('dune', { rating: 4, text: 'x'.repeat(MAX_REVIEW_LENGTH + 1) }),
    /limited/,
  );
  assert.deepEqual(store.reviewsFor('dune'), []);
});

test('reviews are listed newest first and one per author', () => {
  let clock = Date.UTC(2026, 0, 1);
  const store = new UserStore({ now: () => new Date((clock += 60_000)) });
  store.createAccount('Ada');
  store.saveReview('dune', { rating: 4, text: ' Sand everywhere. ' });
  store.createAccount('Grace');
  store.saveReview('dune', { rating: 5, text: 'Loved it.' });

  assert.deepEqual(store.reviewsFor('dune').map((review) => review.author), ['Grace', 'Ada']);
  assert.equal(store.reviewsFor('dune')[1].text, 'Sand everywhere.');

  store.signIn('Ada');
  store.saveReview('dune', { rating: 2, text: 'Changed my mind.' });
  const reviews = store.reviewsFor('dune');
  assert.equal(reviews.length, 2);
  assert.deepEqual(reviews[0], {
    author: 'Ada',
    rating: 2,
    text: 'Changed my mind.',
    date: '2026-01-01T00:03:00.000Z',
  });
  assert.equal(store.ownReview('dune').rating, 2);
});

test('deleteReview only removes the current author', () => {
  const store = new UserStore();
  store.createAccount('Ada');
  store.saveReview('dune', { rating: 4, text: 'Good.' });
  store.createAccount('Grace');
  store.saveReview('dune', { rating: 5, text: 'Great.' });
  store.deleteReview('dune');
  assert.deepEqual(store.reviewsFor('dune').map((review) => review.author), ['Ada']);
  assert.equal(store.ownReview('dune'), null);
});

test('setTmdbKey trims the key and notifies the settings scope', () => {
  const store = new UserStore();
  const scopes = recordScopes(store);
  store.setTmdbKey('  abc123 ');
  assert.equal(store.tmdbKey, 'abc123');
  assert.deepEqual(scopes, ['settings']);
});

test('state survives a reload from the same storage', () => {
  const storage = memoryStorage();
  const first = new UserStore({ storage });
  first.createAccount('Ada');
  first.toggleWatchlist(dune);
  first.saveReview('dune', { rating: 5, text: 'Again!' });
  first.setTmdbKey('key');

  const second = new UserStore({ storage });
  assert.equal(second.currentUser, 'Ada');
  assert.deepEqual(second.watchlist.map((movie) => movie.id), ['dune']);
  assert.equal(second.reviewsFor('dune').length, 1);
  assert.equal(second.tmdbKey, 'key');
});

test('corrupted or failing storage falls back to a working in-memory store', () => {
  const corrupted = new UserStore({ storage: memoryStorage({ 'marquee:v1': '{not json' }) });
  assert.deepEqual(corrupted.users, []);

  const broken = new UserStore({
    storage: {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    },
  });
  assert.equal(broken.toggleWatchlist(dune), true);
  assert.equal(broken.isInWatchlist('dune'), true);
});
