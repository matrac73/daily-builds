// Core Kudos logic: command parsing, storage model and command execution.
// Pure ES module with no Node-specific imports so it runs both in the
// Slack server and in the browser playground.

export const HELP_TEXT = [
  '*Kudos commands*',
  '`/kudo add @user <text>` give a kudo to someone',
  '`/kudo replace <kudo-id> <text>` rewrite one of your kudos',
  '`/kudo delete <kudo-id>` delete one of your kudos',
  '`/kudo list <n|*>` show the most recent kudos',
  '`/kudo user @user` show every kudo for a person',
  '`/kudo top <n|*>` leaderboard of the most recognised people',
  '`/kudo help` show this message',
].join('\n');

const MAX_TEXT_LENGTH = 500;

export class KudoError extends Error {}

// Normalises the many shapes Slack can send a user reference in:
// `<@U123|alice>` (escaped mention), `<@U123>`, `@alice` and a raw `U123`.
export function parseUserRef(raw) {
  const value = (raw ?? '').trim();
  const escaped = value.match(/^<@([A-Z0-9]+)(?:\|[^>]*)?>$/i);
  if (escaped) return escaped[1].toUpperCase();
  const plain = value.match(/^@?([\w.-]+)$/);
  if (plain) return plain[1];
  throw new KudoError(`\`${value || '(empty)'}\` is not a valid Slack user.`);
}

// Parses `<n>` or `*`. Returns Infinity for `*`; defaults to `fallback`.
export function parseCount(raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  if (raw === '*') return Infinity;
  if (!/^\d+$/.test(raw) || Number(raw) === 0) {
    throw new KudoError(`\`${raw}\` must be a positive integer or \`*\`.`);
  }
  return Number(raw);
}

function parseKudoId(raw) {
  if (!/^\d+$/.test(raw ?? '')) {
    throw new KudoError(`\`${raw ?? ''}\` is not a valid kudo id.`);
  }
  return Number(raw);
}

function requireText(text) {
  const clean = text.trim();
  if (!clean) throw new KudoError('Please include the kudo text.');
  if (clean.length > MAX_TEXT_LENGTH) {
    throw new KudoError(`Kudos are limited to ${MAX_TEXT_LENGTH} characters.`);
  }
  return clean;
}

// Splits `/kudo` text into a structured command, validating arguments.
export function parseCommand(input) {
  const text = (input ?? '').trim();
  const [rawAction = 'help', ...rest] = text.split(/\s+/);
  const action = rawAction.toLowerCase();
  const restText = text.slice(rawAction.length).trim();
  const firstSpace = restText.search(/\s/);
  const firstArg = firstSpace === -1 ? restText : restText.slice(0, firstSpace);
  const remainder = firstSpace === -1 ? '' : restText.slice(firstSpace);

  switch (action) {
    case 'add':
      if (!firstArg) throw new KudoError('Usage: `/kudo add @user <text>`');
      return { action, recipient: parseUserRef(firstArg), text: requireText(remainder) };
    case 'replace':
      if (!firstArg) throw new KudoError('Usage: `/kudo replace <kudo-id> <text>`');
      return { action, id: parseKudoId(firstArg), text: requireText(remainder) };
    case 'delete':
      return { action, id: parseKudoId(rest[0]) };
    case 'list':
      return { action, count: parseCount(rest[0], 10) };
    case 'user':
      if (!rest[0]) throw new KudoError('Usage: `/kudo user @user`');
      return { action, recipient: parseUserRef(rest[0]) };
    case 'top':
      return { action, count: parseCount(rest[0], 5) };
    case 'help':
      return { action };
    default:
      throw new KudoError(`Unknown action \`${rawAction}\`. Try \`/kudo help\`.`);
  }
}

// In-memory kudo repository with plain-object (de)serialisation.
export class KudoStore {
  constructor({ nextId = 1, kudos = [] } = {}, now = () => new Date()) {
    this.nextId = nextId;
    this.kudos = kudos.map((k) => ({ ...k }));
    this.now = now;
  }

  toJSON() {
    return { nextId: this.nextId, kudos: this.kudos };
  }

  add(author, recipient, text) {
    const kudo = { id: this.nextId++, author, recipient, text, createdAt: this.now().toISOString() };
    this.kudos.push(kudo);
    return kudo;
  }

  #ownedKudo(id, requester) {
    const kudo = this.kudos.find((k) => k.id === id);
    if (!kudo) throw new KudoError(`Kudo #${id} does not exist.`);
    if (kudo.author !== requester) throw new KudoError(`Only the author of kudo #${id} can change it.`);
    return kudo;
  }

  replace(id, requester, text) {
    const kudo = this.#ownedKudo(id, requester);
    kudo.text = text;
    kudo.updatedAt = this.now().toISOString();
    return kudo;
  }

  delete(id, requester) {
    const kudo = this.#ownedKudo(id, requester);
    this.kudos = this.kudos.filter((k) => k !== kudo);
    return kudo;
  }

  // Newest first; ids are monotonic so they double as a stable tiebreaker.
  recent(count) {
    return [...this.kudos].sort((a, b) => b.id - a.id).slice(0, count);
  }

  forUser(recipient) {
    return this.kudos.filter((k) => k.recipient === recipient).sort((a, b) => b.id - a.id);
  }

  // Ranks recipients by kudo count (desc); ties go to whoever got one first.
  leaderboard(count) {
    const stats = new Map();
    for (const k of this.kudos) {
      const entry = stats.get(k.recipient) ?? { recipient: k.recipient, count: 0, firstId: k.id };
      entry.count += 1;
      entry.firstId = Math.min(entry.firstId, k.id);
      stats.set(k.recipient, entry);
    }
    return [...stats.values()]
      .sort((a, b) => b.count - a.count || a.firstId - b.firstId)
      .slice(0, count)
      .map(({ recipient, count: total }) => ({ recipient, count: total }));
  }
}

export const mention = (userId) => `<@${userId}>`;

const formatKudo = (k) =>
  `*#${k.id}* ${mention(k.recipient)} from ${mention(k.author)}: ${k.text}${k.updatedAt ? ' _(edited)_' : ''}`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Runs a `/kudo` command for `userId`. Returns `{ text, visibility, changed }`
// where visibility is `in_channel` for public announcements and `ephemeral`
// for replies only the invoking user should see.
export function executeCommand(store, userId, input) {
  try {
    return run(store, userId, parseCommand(input));
  } catch (err) {
    if (err instanceof KudoError) {
      return { text: `:warning: ${err.message}`, visibility: 'ephemeral', changed: false };
    }
    throw err;
  }
}

function run(store, userId, command) {
  const reply = (text, extra = {}) => ({ text, visibility: 'ephemeral', changed: false, ...extra });

  switch (command.action) {
    case 'add': {
      if (command.recipient === userId) throw new KudoError('Nice try! Kudos are for recognising others.');
      const k = store.add(userId, command.recipient, command.text);
      return reply(`:tada: ${mention(userId)} gave kudo *#${k.id}* to ${mention(k.recipient)}: ${k.text}`, {
        visibility: 'in_channel',
        changed: true,
      });
    }
    case 'replace': {
      const k = store.replace(command.id, userId, command.text);
      return reply(`:pencil2: Kudo *#${k.id}* for ${mention(k.recipient)} now reads: ${k.text}`, { changed: true });
    }
    case 'delete': {
      const k = store.delete(command.id, userId);
      return reply(`:wastebasket: Kudo *#${k.id}* for ${mention(k.recipient)} was deleted.`, { changed: true });
    }
    case 'list': {
      const items = store.recent(command.count);
      if (!items.length) return reply('No kudos yet. Be the first with `/kudo add @user <text>`!');
      return reply([`*${plural(items.length, 'most recent kudo')}*`, ...items.map(formatKudo)].join('\n'));
    }
    case 'user': {
      const items = store.forUser(command.recipient);
      if (!items.length) return reply(`${mention(command.recipient)} has no kudos yet.`);
      return reply(
        [`*${mention(command.recipient)} has ${plural(items.length, 'kudo')}*`, ...items.map(formatKudo)].join('\n'),
      );
    }
    case 'top': {
      const board = store.leaderboard(command.count);
      if (!board.length) return reply('Nobody has received a kudo yet.');
      const medals = [':first_place_medal:', ':second_place_medal:', ':third_place_medal:'];
      const lines = board.map(
        (e, i) => `${medals[i] ?? `${i + 1}.`} ${mention(e.recipient)} with ${plural(e.count, 'kudo')}`,
      );
      return reply(['*Kudos leaderboard*', ...lines].join('\n'));
    }
    default:
      return reply(HELP_TEXT);
  }
}
