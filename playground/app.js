// Browser playground: a fake Slack channel driving the real command engine.
import { KudoStore, executeCommand } from '../src/kudos.js';

const STORAGE_KEY = 'kudos-playground-v1';

const USERS = [
  { id: 'UALICE', name: 'alice', color: '#e8912d' },
  { id: 'UBOB', name: 'bob', color: '#2bac76' },
  { id: 'UCAROL', name: 'carol', color: '#1d9bd1' },
  { id: 'UDAVE', name: 'dave', color: '#cd2553' },
];
const BOT = { name: 'Kudos', color: '#611f69' };

const EMOJI = {
  tada: '🎉',
  warning: '⚠️',
  pencil2: '✏️',
  wastebasket: '🗑️',
  first_place_medal: '🥇',
  second_place_medal: '🥈',
  third_place_medal: '🥉',
  boom: '💥',
};

const SUGGESTIONS = [
  '/kudo add @bob thanks for the thorough code review!',
  '/kudo list 5',
  '/kudo user @bob',
  '/kudo top *',
  '/kudo replace 1 thanks for the thorough and kind review!',
  '/kudo delete 1',
  '/kudo help',
];

const $ = (id) => document.getElementById(id);
const userById = (id) => USERS.find((u) => u.id === id);
const userByName = (name) => USERS.find((u) => u.name === name.toLowerCase());

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return { store: new KudoStore(saved.store), feed: saved.feed, currentUser: saved.currentUser };
  } catch {
    // Corrupt storage: fall through to a fresh state.
  }
  return { store: new KudoStore(), feed: [], currentUser: USERS[0].id };
}

let state = load();

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

// Slack rewrites `@name` into `<@ID|name>` before calling the bot; mimic it.
const escapeMentions = (text) =>
  text.replace(/@([\w.-]+)/g, (match, name) => {
    const user = userByName(name);
    return user ? `<@${user.id}|${user.name}>` : match;
  });

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Minimal Slack mrkdwn renderer: mentions, *bold*, _italic_, `code`, :emoji:.
function renderMrkdwn(text) {
  return escapeHtml(text)
    .replace(/&lt;@([\w.-]+)(?:\|[^&]*)?&gt;/g, (_, id) => {
      const user = userById(id);
      return `<span class="mention">@${escapeHtml(user ? user.name : id)}</span>`;
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<strong>$2</strong>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/:([a-z0-9_]+):/g, (m, name) => EMOJI[name] ?? m)
    .replace(/\n/g, '<br />');
}

function messageEl({ author, text, ephemeral }) {
  const sender = author === 'bot' ? BOT : userById(author);
  const li = document.createElement('li');
  li.className = `message${ephemeral ? ' ephemeral' : ''}`;
  li.innerHTML = `
    <span class="avatar" style="background:${sender.color}">${sender.name[0].toUpperCase()}</span>
    <div class="body">
      <p class="meta"><strong>${escapeHtml(sender.name)}</strong>${author === 'bot' ? '<span class="badge">APP</span>' : ''}
      ${ephemeral ? '<span class="only-you">Only visible to you</span>' : ''}</p>
      <div class="text">${renderMrkdwn(text)}</div>
    </div>`;
  return li;
}

function render() {
  const users = $('users');
  users.replaceChildren(
    ...USERS.map((u) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'user';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(u.id === state.currentUser));
      button.innerHTML = `<span class="dot" style="background:${u.color}"></span>${u.name}`;
      button.addEventListener('click', () => {
        state.currentUser = u.id;
        save();
        render();
      });
      return button;
    }),
  );

  const feed = $('feed');
  const visible = state.feed.filter((m) => !m.ephemeral || m.viewer === state.currentUser);
  if (visible.length) {
    feed.replaceChildren(...visible.map(messageEl));
  } else {
    feed.innerHTML = '<li class="empty">No messages yet. Try a command below. 👇</li>';
  }
  feed.scrollTop = feed.scrollHeight;
}

function send(raw) {
  const input = raw.trim();
  if (!input) return;
  const viewer = state.currentUser;
  const match = input.match(/^\/kudos?\b\s*(.*)$/is);

  if (!match) {
    state.feed.push({ author: viewer, text: input, ephemeral: false });
  } else {
    const result = executeCommand(state.store, viewer, escapeMentions(match[1]));
    const ephemeral = result.visibility === 'ephemeral';
    // Slack only echoes the slash command itself to the person who ran it.
    state.feed.push({ author: viewer, text: `\`${input}\``, ephemeral: true, viewer });
    state.feed.push({ author: 'bot', text: result.text, ephemeral, viewer });
  }
  save();
  render();
}

$('composer').addEventListener('submit', (event) => {
  event.preventDefault();
  send($('input').value);
  $('input').value = '';
});

$('reset').addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  state = load();
  render();
});

$('suggestions').replaceChildren(
  ...SUGGESTIONS.map((cmd) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = cmd;
    chip.addEventListener('click', () => {
      $('input').value = cmd;
      $('input').focus();
    });
    return chip;
  }),
);

render();
