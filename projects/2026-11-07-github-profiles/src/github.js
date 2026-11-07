// Core GitHub logic: input validation, API access, repository ranking and formatting.
// Everything here is DOM-free so it can be unit-tested with `node --test`.

export const API_BASE = 'https://api.github.com';
export const TOP_REPO_COUNT = 4;

// GitHub logins: 1-39 alphanumerics or single hyphens, no leading/trailing hyphen.
const USERNAME_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export class GitHubError extends Error {
  constructor(message, kind) {
    super(message);
    this.name = 'GitHubError';
    this.kind = kind;
  }
}

export function normalizeUsername(input) {
  return String(input ?? '').trim().replace(/^@/, '');
}

export function validateUsername(input) {
  const username = normalizeUsername(input);
  if (!username) {
    return { valid: false, username, reason: 'Please enter a GitHub username.' };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      valid: false,
      username,
      reason: `"${username}" is not a valid GitHub username (letters, digits and single hyphens, max 39 characters).`,
    };
  }
  return { valid: true, username, reason: null };
}

export function repoScore(repo) {
  return (repo.stargazers_count ?? 0) + (repo.forks_count ?? 0);
}

// Picks the most popular repositories by stars + forks, ignoring forks of other projects.
// Ties are broken by stars, then by name, so the result is deterministic.
export function topRepositories(repos, count = TOP_REPO_COUNT) {
  return repos
    .filter((repo) => !repo.fork)
    .toSorted(
      (a, b) =>
        repoScore(b) - repoScore(a) ||
        (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, count);
}

const compactFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCount(value) {
  return compactFormatter.format(value ?? 0);
}

function rateLimitMessage(response) {
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  if (!reset) return 'GitHub API rate limit reached. Please try again later.';
  const time = new Date(reset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `GitHub API rate limit reached. Try again after ${time}.`;
}

async function getJson(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json' } });
  } catch {
    throw new GitHubError('Network error: could not reach GitHub.', 'network');
  }
  if (response.status === 404) {
    throw new GitHubError('No GitHub user found with that username.', 'not-found');
  }
  const rateLimited =
    response.status === 429 ||
    (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
  if (rateLimited) {
    throw new GitHubError(rateLimitMessage(response), 'rate-limit');
  }
  if (!response.ok) {
    throw new GitHubError(`GitHub API error (HTTP ${response.status}).`, 'http');
  }
  return response.json();
}

// Fetches a user's profile and their top repositories.
// `fetchImpl` is injectable so tests can run without network access.
export async function fetchProfile(input, fetchImpl = globalThis.fetch) {
  const { valid, username, reason } = validateUsername(input);
  if (!valid) throw new GitHubError(reason, 'invalid');

  const login = encodeURIComponent(username);
  const [user, repos] = await Promise.all([
    getJson(`${API_BASE}/users/${login}`, fetchImpl),
    getJson(`${API_BASE}/users/${login}/repos?per_page=100&sort=pushed`, fetchImpl),
  ]);

  return {
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url,
    profileUrl: user.html_url,
    bio: user.bio,
    followers: user.followers,
    following: user.following,
    publicRepos: user.public_repos,
    topRepos: topRepositories(repos).map((repo) => ({
      name: repo.name,
      url: repo.html_url,
      description: repo.description,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
    })),
  };
}
