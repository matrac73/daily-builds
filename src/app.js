// DOM controller: renders the home, quiz and summary screens on top of the pure engine.
import { CATEGORIES, findCategory } from './data/index.js';
import { buildDeck, createGame, current, answer, next, isFinished, summarize, totalSteps } from './engine.js';
import { loadStats, saveStats, recordGame, categoryStats } from './stats.js';
import { highlightPython, formatInline } from './format.js';

const STEP_LABELS = { time: 'Temps', space: 'Espace', trivia: 'Culture G' };
const root = document.getElementById('app');
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

let stats = loadStats(storage);
let session = null; // { category, game, review }

/** Minimal hyperscript helper. `html` is only ever fed with output of format.js (escaped). */
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((child) => child != null && child !== false));
  return node;
}

const rich = (tag, text, className) => h(tag, { class: className, html: formatInline(text) });

const codeBlock = (code, caption) =>
  h('figure', { class: 'code' }, caption && h('figcaption', {}, caption), h('pre', {}, h('code', { html: highlightPython(code) })));

/** Swaps the screen, focuses an element for keyboard users and scrolls to the relevant part. */
function show(view, { focus, scrollTo } = {}) {
  root.replaceChildren(view);
  (root.querySelector(focus) ?? root).focus({ preventScroll: true });
  const anchor = scrollTo && root.querySelector(scrollTo);
  if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else window.scrollTo(0, 0);
}

/* ---------- Home ---------- */

function knownMistakes(category) {
  const ids = new Set(category.items.map((item) => item.id));
  return categoryStats(stats, category.id).mistakes.filter((id) => ids.has(id));
}

function categoryCard(category) {
  const s = categoryStats(stats, category.id);
  const mistakes = knownMistakes(category);
  const unit = category.kind === 'leetcode' ? 'problèmes' : 'questions';
  const perGame = category.kind === 'leetcode' ? `${category.sessionSize} problèmes × 3 questions` : `${category.sessionSize} questions`;
  return h(
    'article',
    { class: 'category' },
    h('div', { class: 'category-icon', 'aria-hidden': 'true' }, category.icon),
    h('h2', {}, category.name),
    h('p', { class: 'muted' }, category.description),
    h('p', { class: 'meta' }, `${category.items.length} ${unit} · ${perGame} par partie`),
    h(
      'p',
      { class: 'meta' },
      s.played
        ? `Meilleur score ${s.bestPct} % · ${s.played} partie${s.played > 1 ? 's' : ''} · ${Math.round((100 * s.correct) / s.answered)} % de bonnes réponses`
        : 'Pas encore joué',
    ),
    h(
      'div',
      { class: 'actions' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => start(category) }, 'Jouer'),
      mistakes.length > 0 &&
        h('button', { type: 'button', class: 'btn', onclick: () => start(category, { review: true }) }, `Revoir mes erreurs (${mistakes.length})`),
    ),
  );
}

function renderHome() {
  session = null;
  show(
    h(
      'section',
      { class: 'home' },
      h(
        'p',
        { class: 'intro' },
        'Choisissez une rubrique. Les questions sont tirées au hasard, les réponses mélangées, et chaque correction explique le pourquoi — avec du code quand il le faut.',
      ),
      h('div', { class: 'grid' }, CATEGORIES.map(categoryCard)),
    ),
  );
}

/* ---------- Quiz ---------- */

function start(category, { review = false } = {}) {
  const onlyIds = review ? knownMistakes(category) : null;
  const deck = buildDeck(category, { size: review ? onlyIds.length : category.sessionSize, onlyIds });
  session = { category, review, game: createGame(deck) };
  renderQuiz();
}

function stepTracker(card, stepIndex, game) {
  if (card.steps.length < 2) return null;
  const doneForCard = game.answers.slice(game.answers.length - (stepIndex + (game.pending ? 1 : 0)));
  return h(
    'ol',
    { class: 'steps', 'aria-label': 'Étapes du problème' },
    card.steps.map((step, i) => {
      const done = doneForCard[i];
      const state = done ? (done.correct ? 'ok' : 'ko') : i === stepIndex ? 'active' : '';
      return h('li', { class: state, 'aria-current': i === stepIndex ? 'step' : null }, `${i + 1}. ${STEP_LABELS[step.kind]}`);
    }),
  );
}

function cardContext(card, category) {
  return h(
    'section',
    { class: 'context' },
    h(
      'header',
      { class: 'context-head' },
      h('h2', {}, card.title),
      card.tag ? h('span', { class: `tag tag-${card.tag.toLowerCase()}` }, card.tag) : h('span', { class: 'tag' }, category.name),
    ),
    card.statement && rich('p', card.statement),
    card.code && codeBlock(card.code),
  );
}

function revealView(reveal) {
  if (reveal.type === 'note') {
    return h('div', { class: 'reveal' }, h('h4', {}, reveal.heading), rich('p', reveal.note));
  }
  const { solution } = reveal;
  return h(
    'div',
    { class: 'reveal' },
    h('h4', {}, `${reveal.heading} : ${solution.name}`),
    h('div', { class: 'badges' }, h('span', { class: 'badge' }, `Temps ${solution.time}`), h('span', { class: 'badge' }, `Espace ${solution.space}`)),
    rich('p', solution.explanation),
    codeBlock(solution.code),
  );
}

function feedbackView(step, pending) {
  const right = step.choices[pending.correctIndex].label;
  return h(
    'section',
    { class: `feedback ${pending.correct ? 'ok' : 'ko'}`, 'aria-live': 'polite' },
    h('h3', {}, pending.correct ? '✅ Bonne réponse !' : '❌ Raté'),
    !pending.correct && rich('p', `La bonne réponse était : **${right}**`),
    step.explanation && rich('p', step.explanation),
    pending.reveal && revealView(pending.reveal),
    step.fixedCode && codeBlock(step.fixedCode, 'Version corrigée'),
    step.source &&
      h('p', { class: 'source' }, 'Pour aller plus loin : ', h('a', { href: step.source.url, target: '_blank', rel: 'noopener noreferrer' }, step.source.label)),
  );
}

function choiceButton(step, pending, choice, index) {
  let state = '';
  if (pending) {
    if (index === pending.correctIndex) state = 'correct';
    else if (index === pending.choiceIndex) state = 'wrong';
  }
  return h(
    'button',
    { type: 'button', class: `choice ${state}`, disabled: Boolean(pending), onclick: () => choose(index) },
    h('kbd', {}, String(index + 1)),
    h('span', { html: formatInline(choice.label) }),
  );
}

function renderQuiz() {
  const { category, game } = session;
  const { card, step, stepIndex } = current(game);
  const { pending } = game;
  const total = totalSteps(game);
  const number = game.answers.length + (pending ? 0 : 1);
  const score = game.answers.filter((a) => a.correct).length;
  const lastStep = game.cardIndex === game.deck.length - 1 && stepIndex === card.steps.length - 1;

  show(
    h(
      'section',
      { class: 'quiz' },
      h(
        'div',
        { class: 'quiz-bar' },
        h('span', { class: 'muted' }, `${category.icon} ${category.name}${session.review ? ' · révision' : ''}`),
        h('span', {}, `Question ${number} / ${total} · Score ${score}`),
        h('button', { type: 'button', class: 'btn ghost', onclick: renderHome }, 'Quitter'),
      ),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': game.answers.length },
        h('span', { style: `width:${(100 * game.answers.length) / total}%` })),
      cardContext(card, category),
      stepTracker(card, stepIndex, game),
      rich('h3', step.prompt, 'prompt'),
      h('div', { class: 'choices' }, step.choices.map((choice, i) => choiceButton(step, pending, choice, i))),
      pending && feedbackView(step, pending),
      pending &&
        h('div', { class: 'actions end' },
          h('button', { type: 'button', class: 'btn primary next', onclick: advance }, lastStep ? 'Voir le résultat →' : 'Continuer →')),
    ),
    {
      focus: pending ? '.next' : '.choice',
      scrollTo: pending ? '.feedback' : stepIndex > 0 ? '.steps' : null,
    },
  );
}

function choose(index) {
  if (!session || session.game.pending) return;
  session.game = answer(session.game, index);
  renderQuiz();
}

function advance() {
  if (!session?.game.pending) return;
  session.game = next(session.game);
  if (!isFinished(session.game)) {
    renderQuiz();
    return;
  }
  const summary = summarize(session.game);
  stats = recordGame(stats, session.category.id, summary);
  saveStats(storage, stats);
  renderSummary(summary);
}

/* ---------- Summary ---------- */

function verdict(pct) {
  if (pct === 100) return 'Sans faute. Prêt pour l\'entretien !';
  if (pct >= 75) return 'Très solide — quelques détails à revoir.';
  if (pct >= 50) return 'Bonne base, les corrections valent le détour.';
  return 'Ça pique, mais chaque erreur est maintenant dans votre liste de révision.';
}

function renderSummary(summary) {
  const { category, game } = session;
  const missed = game.answers.filter((a) => !a.correct);
  const mistakesLeft = knownMistakes(category).length;
  show(
    h(
      'section',
      { class: 'summary' },
      h('p', { class: 'muted' }, `${category.icon} ${category.name}`),
      h('p', { class: 'big-score' }, `${summary.correct} / ${summary.total}`),
      h('p', { class: 'pct' }, `${summary.pct} % — ${verdict(summary.pct)}`),
      missed.length > 0 &&
        h('div', { class: 'missed' },
          h('h3', {}, 'À revoir'),
          h('ul', {}, missed.map((a) => h('li', {}, h('strong', {}, a.cardTitle), ' — ', h('span', { html: formatInline(a.prompt) }))))),
      h(
        'div',
        { class: 'actions' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => start(category) }, 'Rejouer'),
        mistakesLeft > 0 &&
          h('button', { type: 'button', class: 'btn', onclick: () => start(category, { review: true }) }, `Revoir mes erreurs (${mistakesLeft})`),
        h('button', { type: 'button', class: 'btn ghost', onclick: renderHome }, 'Accueil'),
      ),
    ),
    { focus: '.btn.primary' },
  );
}

/* ---------- Wiring ---------- */

document.addEventListener('keydown', (event) => {
  if (!session || isFinished(session.game) || event.ctrlKey || event.metaKey || event.altKey) return;
  const index = Number(event.key) - 1;
  if (!session.game.pending && index >= 0 && index < current(session.game).step.choices.length) {
    event.preventDefault();
    choose(index);
  } else if (session.game.pending && event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
    event.preventDefault();
    advance();
  }
});

document.getElementById('home-button').addEventListener('click', renderHome);

const requested = findCategory(new URLSearchParams(window.location.search).get('rubrique'));
if (requested) start(requested);
else renderHome();
