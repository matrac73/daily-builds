import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createCatalog, isTmdbId } from '../src/lib/catalog.js';
import { createDemoProvider } from '../src/lib/demo-provider.js';
import { PAGE_SIZE } from '../src/lib/movies.js';
import { createTmdbProvider } from '../src/lib/tmdb-provider.js';

const bundled = JSON.parse(await readFile(new URL('../data/movies.json', import.meta.url), 'utf8'));

// ── Bundled catalogue ───────────────────────────────────────────────────

test('the bundled catalogue is well formed', () => {
  assert.ok(bundled.length > PAGE_SIZE * 2, 'enough movies to exercise infinite scroll');
  assert.equal(new Set(bundled.map((movie) => movie.id)).size, bundled.length, 'ids are unique');
  for (const movie of bundled) {
    assert.match(movie.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${movie.id} is a slug`);
    assert.equal(isTmdbId(movie.id), false, `${movie.id} must not look like a TMDB id`);
    assert.match(movie.releaseDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(movie.releaseDate)), `${movie.id} has a real date`);
    assert.ok(movie.title && movie.overview, `${movie.id} has a title and an overview`);
    assert.ok(movie.rating > 0 && movie.rating <= 10);
    assert.ok(movie.runtime > 0);
    assert.ok(movie.genres.length > 0 && movie.directors.length > 0 && movie.cast.length > 0);
    for (const member of movie.cast) assert.ok(member.name && member.character);
  }
});

// ── Demo provider ───────────────────────────────────────────────────────

test('demo provider lists movies newest first, page by page', async () => {
  const demo = createDemoProvider(async () => bundled);
  const first = await demo.list();
  assert.equal(first.items.length, PAGE_SIZE);
  assert.equal(first.totalPages, Math.ceil(bundled.length / PAGE_SIZE));

  const all = [];
  for (let page = 1; page <= first.totalPages; page += 1) {
    all.push(...(await demo.list({ page })).items);
  }
  assert.equal(all.length, bundled.length);
  const dates = all.map((movie) => movie.releaseDate);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test('demo provider searches and resolves single movies', async () => {
  const demo = createDemoProvider(async () => bundled);
  const { items } = await demo.list({ query: 'villeneuve' });
  assert.deepEqual(items.map((movie) => movie.id), ['dune-part-two']);
  assert.equal((await demo.get('anora')).title, 'Anora');
  await assert.rejects(demo.get('missing'), { name: 'CatalogError', code: 'not-found' });
});

test('demo provider loads once and retries after a failure', async () => {
  let calls = 0;
  const demo = createDemoProvider(async () => {
    calls += 1;
    if (calls === 1) throw new Error('offline');
    return bundled;
  });
  await assert.rejects(demo.list(), /offline/);
  await demo.list();
  await demo.get('anora');
  assert.equal(calls, 2);
});

// ── TMDB provider ───────────────────────────────────────────────────────

const GENRES = { genres: [{ id: 18, name: 'Drama' }, { id: 878, name: 'Science Fiction' }] };

function fakeTmdb(routes) {
  const requests = [];
  const fetch = async (url) => {
    requests.push(url);
    const route = routes[url.pathname.replace('/3', '')];
    if (!route) return { ok: false, status: 404, json: async () => ({}) };
    const status = route.status ?? 200;
    return { ok: status < 400, status, json: async () => route.body };
  };
  return { fetch, requests };
}

const discoverPage = {
  page: 2,
  total_pages: 900,
  results: [
    {
      id: 42,
      title: 'Solaris Rising',
      release_date: '2026-10-02',
      overview: 'A crew wakes up.',
      vote_average: 7.26,
      vote_count: 310,
      genre_ids: [878, 18, 99999],
      poster_path: '/poster.jpg',
      backdrop_path: null,
    },
  ],
};

test('tmdb provider discovers released movies by date and normalises them', async () => {
  const { fetch, requests } = fakeTmdb({
    '/discover/movie': { body: discoverPage },
    '/genre/movie/list': { body: GENRES },
  });
  const tmdb = createTmdbProvider({
    getApiKey: () => 'secret',
    fetch,
    today: () => new Date('2026-11-17T10:00:00Z'),
  });

  const result = await tmdb.list({ page: 2 });
  assert.deepEqual(result, {
    page: 2,
    totalPages: 500,
    items: [
      {
        id: '42',
        title: 'Solaris Rising',
        releaseDate: '2026-10-02',
        overview: 'A crew wakes up.',
        rating: 7.26,
        voteCount: 310,
        genres: ['Science Fiction', 'Drama'],
        posterUrl: 'https://image.tmdb.org/t/p/w342/poster.jpg',
        backdropUrl: null,
      },
    ],
  });

  const discover = requests.find((url) => url.pathname.endsWith('/discover/movie'));
  assert.equal(discover.origin, 'https://api.themoviedb.org');
  assert.equal(discover.searchParams.get('api_key'), 'secret');
  assert.equal(discover.searchParams.get('sort_by'), 'primary_release_date.desc');
  assert.equal(discover.searchParams.get('primary_release_date.lte'), '2026-11-17');
  assert.equal(discover.searchParams.get('page'), '2');
});

test('tmdb provider searches by title and fetches genres only once', async () => {
  const { fetch, requests } = fakeTmdb({
    '/search/movie': { body: { page: 1, total_pages: 1, results: [] } },
    '/genre/movie/list': { body: GENRES },
  });
  const tmdb = createTmdbProvider({ getApiKey: () => 'k', fetch });
  await tmdb.list({ query: '  blade runner ' });
  await tmdb.list({ query: 'alien' });

  const searches = requests.filter((url) => url.pathname.endsWith('/search/movie'));
  assert.deepEqual(searches.map((url) => url.searchParams.get('query')), ['blade runner', 'alien']);
  assert.equal(requests.filter((url) => url.pathname.endsWith('/genre/movie/list')).length, 1);
});

test('tmdb provider builds a full movie page from details, credits and reviews', async () => {
  const { fetch, requests } = fakeTmdb({
    '/movie/42': {
      body: {
        ...discoverPage.results[0],
        genres: [{ id: 878, name: 'Science Fiction' }],
        tagline: 'Wake up.',
        runtime: 121,
        credits: {
          cast: Array.from({ length: 20 }, (_, i) => ({
            name: `Actor ${i}`,
            character: `Role ${i}`,
            profile_path: i === 0 ? '/face.jpg' : null,
          })),
          crew: [
            { name: 'Lena Ortiz', job: 'Director' },
            { name: 'Sam Poe', job: 'Producer' },
          ],
        },
        reviews: { results: [{ author: 'cinefan', content: 'Stunning.', created_at: '2026-10-05T08:00:00Z' }] },
      },
    },
  });
  const movie = await createTmdbProvider({ getApiKey: () => 'k', fetch }).get('42');

  assert.equal(requests[0].searchParams.get('append_to_response'), 'credits,reviews');
  assert.equal(movie.id, '42');
  assert.deepEqual(movie.genres, ['Science Fiction']);
  assert.equal(movie.runtime, 121);
  assert.equal(movie.tagline, 'Wake up.');
  assert.deepEqual(movie.directors, ['Lena Ortiz']);
  assert.equal(movie.cast.length, 12);
  assert.deepEqual(movie.cast[0], {
    name: 'Actor 0',
    character: 'Role 0',
    photoUrl: 'https://image.tmdb.org/t/p/w185/face.jpg',
  });
  assert.equal(movie.cast[1].photoUrl, null);
  assert.deepEqual(movie.reviews, [{ author: 'cinefan', text: 'Stunning.', date: '2026-10-05T08:00:00Z' }]);
});

test('tmdb provider turns failures into user-facing catalogue errors', async () => {
  const unauthorized = createTmdbProvider({
    getApiKey: () => 'bad',
    fetch: fakeTmdb({
      '/discover/movie': { status: 401, body: {} },
      '/genre/movie/list': { status: 401, body: {} },
    }).fetch,
  });
  await assert.rejects(unauthorized.list(), { name: 'CatalogError', code: 'unauthorized' });

  const empty = createTmdbProvider({ getApiKey: () => 'k', fetch: fakeTmdb({}).fetch });
  await assert.rejects(empty.get('7'), { code: 'not-found' });

  const offline = createTmdbProvider({
    getApiKey: () => 'k',
    fetch: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  await assert.rejects(offline.get('7'), { code: 'network' });

  const down = createTmdbProvider({
    getApiKey: () => 'k',
    fetch: fakeTmdb({ '/movie/7': { status: 503, body: {} } }).fetch,
  });
  await assert.rejects(down.get('7'), { code: 'network', message: /503/ });
});

// ── Catalogue ───────────────────────────────────────────────────────────

function stubProvider(name) {
  return {
    list: async (params) => ({ from: name, params }),
    get: async (id) => ({ from: name, id }),
  };
}

test('catalog browses the demo data until an API key is available', async () => {
  let key = '';
  const catalog = createCatalog({
    demo: stubProvider('demo'),
    tmdb: stubProvider('tmdb'),
    hasApiKey: () => Boolean(key),
  });

  assert.equal(catalog.source, 'demo');
  assert.deepEqual(await catalog.list({ page: 3 }), { from: 'demo', params: { page: 3 } });

  key = 'abc';
  assert.equal(catalog.source, 'tmdb');
  assert.equal((await catalog.list({})).from, 'tmdb');
});

test('catalog resolves a movie with the provider its id belongs to', async () => {
  let key = 'abc';
  const catalog = createCatalog({
    demo: stubProvider('demo'),
    tmdb: stubProvider('tmdb'),
    hasApiKey: () => Boolean(key),
  });

  assert.deepEqual(await catalog.get('693134'), { from: 'tmdb', id: '693134' });
  assert.deepEqual(await catalog.get('dune-part-two'), { from: 'demo', id: 'dune-part-two' });

  key = '';
  await assert.rejects(catalog.get('693134'), { name: 'CatalogError', code: 'needs-key' });
  assert.equal((await catalog.get('dune-part-two')).from, 'demo');
});
