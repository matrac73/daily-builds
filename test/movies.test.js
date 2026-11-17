import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  averageRating,
  formatDate,
  formatRating,
  formatRuntime,
  initials,
  paginate,
  ratingPercent,
  ratingTier,
  releaseYear,
  searchMovies,
  sortByReleaseDate,
  toSummary,
  truncate,
} from '../src/lib/movies.js';

const movies = [
  { id: 'a', title: 'Alpha', releaseDate: '2023-05-01', genres: ['Drama'], directors: ['Ana Diaz'], cast: [{ name: 'Timothée Roux' }] },
  { id: 'b', title: 'Beta', releaseDate: '2025-01-15', genres: ['Science Fiction'], directors: ['Bo Chen'], cast: [] },
  { id: 'c', title: 'Gamma', releaseDate: '', genres: [], directors: [], cast: [] },
  { id: 'd', title: 'Delta', releaseDate: '2025-01-15', genres: ['Drama'], directors: [], cast: [] },
];

test('sortByReleaseDate orders newest first, ties by title, undated last', () => {
  const sorted = sortByReleaseDate(movies);
  assert.deepEqual(sorted.map((movie) => movie.id), ['b', 'd', 'a', 'c']);
  assert.equal(movies[0].id, 'a', 'the input array is left untouched');
});

test('searchMovies matches titles, genres, directors and cast', () => {
  assert.deepEqual(searchMovies(movies, 'alpha').map((m) => m.id), ['a']);
  assert.deepEqual(searchMovies(movies, 'drama').map((m) => m.id), ['a', 'd']);
  assert.deepEqual(searchMovies(movies, 'chen').map((m) => m.id), ['b']);
  assert.deepEqual(searchMovies(movies, 'roux').map((m) => m.id), ['a']);
});

test('searchMovies ignores case and diacritics and requires every term', () => {
  assert.deepEqual(searchMovies(movies, 'TIMOTHEE').map((m) => m.id), ['a']);
  assert.deepEqual(searchMovies(movies, 'drama delta').map((m) => m.id), ['d']);
  assert.deepEqual(searchMovies(movies, 'drama beta'), []);
});

test('searchMovies returns everything for a blank query', () => {
  assert.equal(searchMovies(movies, '   ').length, movies.length);
  assert.equal(searchMovies(movies, undefined).length, movies.length);
});

test('paginate slices pages and reports the total', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  assert.deepEqual(paginate(items, 1, 10), { items: items.slice(0, 10), page: 1, totalPages: 3 });
  assert.deepEqual(paginate(items, 3, 10).items, [20, 21, 22, 23, 24]);
});

test('paginate clamps out-of-range pages and handles empty lists', () => {
  assert.equal(paginate([1, 2, 3], 99, 2).page, 2);
  assert.equal(paginate([1, 2, 3], -4, 2).page, 1);
  assert.deepEqual(paginate([], 1), { items: [], page: 1, totalPages: 1 });
});

test('releaseYear extracts the year or returns an empty string', () => {
  assert.equal(releaseYear({ releaseDate: '2024-03-01' }), '2024');
  assert.equal(releaseYear({ releaseDate: '' }), '');
  assert.equal(releaseYear({}), '');
});

test('formatDate handles dates, timestamps and bad input', () => {
  assert.equal(formatDate('2024-03-01'), 'Mar 1, 2024');
  assert.equal(formatDate('2024-12-31T23:30:00.000Z'), 'Dec 31, 2024');
  assert.equal(formatDate(''), '');
  assert.equal(formatDate('not-a-date'), '');
});

test('formatRuntime renders hours and minutes', () => {
  assert.equal(formatRuntime(166), '2h 46m');
  assert.equal(formatRuntime(120), '2h');
  assert.equal(formatRuntime(45), '45m');
  assert.equal(formatRuntime(0), '');
  assert.equal(formatRuntime(null), '');
});

test('rating helpers format, scale and classify scores', () => {
  assert.equal(formatRating(8.14), '8.1');
  assert.equal(formatRating(0), 'NR');
  assert.equal(ratingPercent(8.14), 81);
  assert.equal(ratingPercent(undefined), 0);
  assert.equal(ratingTier(8), 'high');
  assert.equal(ratingTier(6.5), 'mid');
  assert.equal(ratingTier(4), 'low');
  assert.equal(ratingTier(0), 'unrated');
});

test('averageRating averages rated reviews only', () => {
  assert.equal(averageRating([{ rating: 5 }, { rating: 4 }, { rating: 4 }]), 4.3);
  assert.equal(averageRating([{ rating: 3 }, {}]), 3);
  assert.equal(averageRating([]), null);
});

test('initials and truncate shorten text for display', () => {
  assert.equal(initials('Robert Downey Jr.'), 'RD');
  assert.equal(initials('zendaya'), 'Z');
  assert.equal(truncate('short', 10), 'short');
  assert.equal(truncate('a long sentence here', 7), 'a long…');
});

test('toSummary keeps only what a card needs', () => {
  const summary = toSummary({ id: 'x', title: 'X', rating: 7, overview: 'long', cast: [{ name: 'A' }] });
  assert.deepEqual(summary, { id: 'x', title: 'X', releaseDate: '', rating: 7, genres: [], posterUrl: null });
});
