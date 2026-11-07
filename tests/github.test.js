import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  GitHubError,
  fetchProfile,
  formatCount,
  normalizeUsername,
  topRepositories,
  validateUsername,
} from '../src/github.js';

describe('validateUsername', () => {
  test('accepts valid logins and trims whitespace and a leading @', () => {
    for (const [input, expected] of [
      ['octocat', 'octocat'],
      ['  torvalds ', 'torvalds'],
      ['@sindresorhus', 'sindresorhus'],
      ['a-b-c', 'a-b-c'],
      ['x', 'x'],
      ['a'.repeat(39), 'a'.repeat(39)],
    ]) {
      const result = validateUsername(input);
      assert.equal(result.valid, true, input);
      assert.equal(result.username, expected);
    }
  });

  test('rejects empty and malformed logins with a reason', () => {
    for (const input of ['', '   ', null, '-abc', 'abc-', 'a--b', 'with space', 'émile', 'a'.repeat(40), 'a/b']) {
      const result = validateUsername(input);
      assert.equal(result.valid, false, String(input));
      assert.match(result.reason, /username/i);
    }
  });

  test('normalizeUsername handles non-string input', () => {
    assert.equal(normalizeUsername(undefined), '');
    assert.equal(normalizeUsername(42), '42');
  });
});

describe('topRepositories', () => {
  const repo = (name, stars, forks, fork = false) => ({
    name,
    stargazers_count: stars,
    forks_count: forks,
    fork,
  });

  test('ranks by stars + forks and keeps the top 4', () => {
    const repos = [
      repo('a', 1, 0),
      repo('b', 50, 10),
      repo('c', 5, 100),
      repo('d', 0, 0),
      repo('e', 30, 0),
      repo('f', 20, 20),
    ];
    assert.deepEqual(
      topRepositories(repos).map((r) => r.name),
      ['c', 'b', 'f', 'e'],
    );
  });

  test('ignores forked repositories', () => {
    const repos = [repo('fork', 1000, 1000, true), repo('own', 1, 1)];
    assert.deepEqual(topRepositories(repos).map((r) => r.name), ['own']);
  });

  test('breaks ties by stars, then by name', () => {
    const repos = [repo('zeta', 5, 5), repo('beta', 5, 5), repo('alpha', 8, 2)];
    assert.deepEqual(topRepositories(repos).map((r) => r.name), ['alpha', 'beta', 'zeta']);
  });

  test('does not mutate the input and supports a custom count', () => {
    const repos = [repo('a', 1, 0), repo('b', 2, 0)];
    const snapshot = structuredClone(repos);
    assert.equal(topRepositories(repos, 1)[0].name, 'b');
    assert.deepEqual(repos, snapshot);
  });

  test('returns an empty list when there are no repositories', () => {
    assert.deepEqual(topRepositories([]), []);
  });
});

describe('formatCount', () => {
  test('formats numbers compactly', () => {
    assert.equal(formatCount(0), '0');
    assert.equal(formatCount(999), '999');
    assert.equal(formatCount(1500), '1.5K');
    assert.equal(formatCount(2_340_000), '2.3M');
    assert.equal(formatCount(undefined), '0');
  });
});

describe('fetchProfile', () => {
  const user = {
    login: 'octocat',
    name: 'The Octocat',
    avatar_url: 'https://avatars.githubusercontent.com/u/583231',
    html_url: 'https://github.com/octocat',
    bio: null,
    followers: 12000,
    following: 9,
    public_repos: 8,
  };
  const repos = [
    { name: 'Spoon-Knife', html_url: 'u1', description: 'fork me', language: 'HTML', stargazers_count: 12, forks_count: 150, fork: false },
    { name: 'Hello-World', html_url: 'u2', description: null, language: null, stargazers_count: 2600, forks_count: 2400, fork: false },
    { name: 'forked', html_url: 'u3', description: null, language: 'Go', stargazers_count: 99999, forks_count: 0, fork: true },
  ];

  const jsonResponse = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers });

  function mockFetch(routes) {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      const path = new URL(url).pathname;
      const handler = routes[path];
      if (!handler) throw new Error(`Unexpected request: ${url}`);
      return handler();
    };
    return { fetchImpl, calls };
  }

  test('returns the profile with its top repositories', async () => {
    const { fetchImpl, calls } = mockFetch({
      '/users/octocat': () => jsonResponse(user),
      '/users/octocat/repos': () => jsonResponse(repos),
    });
    const profile = await fetchProfile(' @octocat ', fetchImpl);

    assert.equal(calls.length, 2);
    assert.ok(calls.every((url) => url.startsWith('https://api.github.com/users/octocat')));
    assert.equal(profile.login, 'octocat');
    assert.equal(profile.followers, 12000);
    assert.equal(profile.publicRepos, 8);
    assert.deepEqual(
      profile.topRepos.map((r) => [r.name, r.stars, r.forks]),
      [
        ['Hello-World', 2600, 2400],
        ['Spoon-Knife', 12, 150],
      ],
    );
  });

  test('rejects invalid usernames without hitting the network', async () => {
    const { fetchImpl, calls } = mockFetch({});
    await assert.rejects(fetchProfile('bad name', fetchImpl), { name: 'GitHubError', kind: 'invalid' });
    assert.equal(calls.length, 0);
  });

  test('reports unknown users', async () => {
    const { fetchImpl } = mockFetch({
      '/users/ghost-user-x': () => jsonResponse({ message: 'Not Found' }, 404),
      '/users/ghost-user-x/repos': () => jsonResponse({ message: 'Not Found' }, 404),
    });
    await assert.rejects(fetchProfile('ghost-user-x', fetchImpl), (error) => {
      assert.ok(error instanceof GitHubError);
      assert.equal(error.kind, 'not-found');
      assert.match(error.message, /no github user/i);
      return true;
    });
  });

  test('reports rate limiting', async () => {
    const limited = () =>
      jsonResponse({ message: 'API rate limit exceeded' }, 403, {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '1700000000',
      });
    const { fetchImpl } = mockFetch({ '/users/octocat': limited, '/users/octocat/repos': limited });
    await assert.rejects(fetchProfile('octocat', fetchImpl), { kind: 'rate-limit' });
  });

  test('reports other HTTP errors and network failures', async () => {
    const serverError = mockFetch({
      '/users/octocat': () => jsonResponse({}, 500),
      '/users/octocat/repos': () => jsonResponse([]),
    });
    await assert.rejects(fetchProfile('octocat', serverError.fetchImpl), { kind: 'http', message: /HTTP 500/ });

    const offline = async () => {
      throw new TypeError('fetch failed');
    };
    await assert.rejects(fetchProfile('octocat', offline), { kind: 'network' });
  });
});
