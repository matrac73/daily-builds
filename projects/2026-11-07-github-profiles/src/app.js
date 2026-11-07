import { fetchProfile, formatCount, validateUsername } from './github.js';
import { loadTheme, saveTheme, toggleTheme } from './theme.js';

const root = document.documentElement;
const form = document.querySelector('#search-form');
const input = document.querySelector('#username');
const submitButton = form.querySelector('button[type="submit"]');
const alertBox = document.querySelector('#alert');
const profileSection = document.querySelector('#profile');
const themeButton = document.querySelector('#theme-toggle');
const repoTemplate = document.querySelector('#repo-template');

// ---- Theme -----------------------------------------------------------------

function applyTheme(theme) {
  root.dataset.theme = theme;
  const next = toggleTheme(theme);
  themeButton.setAttribute('aria-label', `Switch to ${next} mode`);
  themeButton.title = `Switch to ${next} mode`;
}

themeButton.addEventListener('click', () => {
  const theme = toggleTheme(root.dataset.theme);
  saveTheme(localStorage, theme);
  applyTheme(theme);
});

applyTheme(loadTheme(localStorage, matchMedia('(prefers-color-scheme: dark)').matches));

// ---- Rendering -------------------------------------------------------------

function showAlert(message) {
  alertBox.textContent = message;
  alertBox.hidden = false;
}

function hideAlert() {
  alertBox.hidden = true;
  alertBox.textContent = '';
}

function setLoading(loading) {
  submitButton.disabled = loading;
  submitButton.textContent = loading ? 'Searching…' : 'Search';
  profileSection.setAttribute('aria-busy', String(loading));
}

function setText(selector, value) {
  profileSection.querySelector(selector).textContent = value;
}

function renderRepo(repo) {
  const item = repoTemplate.content.firstElementChild.cloneNode(true);
  const link = item.querySelector('.repo-name');
  link.href = repo.url;
  link.textContent = repo.name;
  item.querySelector('.repo-description').textContent = repo.description ?? 'No description provided.';
  item.querySelector('.repo-language').textContent = repo.language ?? '—';
  item.querySelector('.repo-stars').textContent = formatCount(repo.stars);
  item.querySelector('.repo-forks').textContent = formatCount(repo.forks);
  return item;
}

function renderProfile(profile) {
  const avatar = profileSection.querySelector('.avatar');
  avatar.src = profile.avatarUrl;
  avatar.alt = `${profile.login}'s avatar`;

  const login = profileSection.querySelector('.login');
  login.href = profile.profileUrl;
  login.textContent = `@${profile.login}`;

  setText('.name', profile.name ?? profile.login);
  setText('.bio', profile.bio ?? '');
  setText('.followers', formatCount(profile.followers));
  setText('.following', formatCount(profile.following));
  setText('.repos', formatCount(profile.publicRepos));

  const list = profileSection.querySelector('.repo-list');
  const emptyState = profileSection.querySelector('.repo-empty');
  list.replaceChildren(...profile.topRepos.map(renderRepo));
  emptyState.hidden = profile.topRepos.length > 0;

  profileSection.hidden = false;
}

// ---- Search ----------------------------------------------------------------

let latestRequest = 0;

async function search(rawUsername) {
  const { valid, username, reason } = validateUsername(rawUsername);
  if (!valid) {
    showAlert(reason);
    input.focus();
    return;
  }

  const requestId = ++latestRequest;
  hideAlert();
  setLoading(true);
  try {
    const profile = await fetchProfile(username);
    if (requestId !== latestRequest) return;
    renderProfile(profile);
    const url = new URL(location.href);
    url.searchParams.set('user', profile.login);
    history.replaceState(null, '', url);
  } catch (error) {
    if (requestId !== latestRequest) return;
    profileSection.hidden = true;
    showAlert(error.message);
  } finally {
    if (requestId === latestRequest) setLoading(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  search(input.value);
});

const initialUser = new URLSearchParams(location.search).get('user');
if (initialUser) {
  input.value = initialUser;
  search(initialUser);
}
