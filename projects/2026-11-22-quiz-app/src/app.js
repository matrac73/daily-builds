import { quizzes } from './quizzes.js';
import {
  answer,
  createSession,
  currentQuestion,
  formatDuration,
  isFinished,
  shareText,
  summarize,
} from './quiz-engine.js';
import { clearHistory, loadHistory, memoryStorage, recordAttempt, statsFor } from './history.js';

const FEEDBACK_DELAY_MS = 800;
const RECENT_ATTEMPTS_SHOWN = 8;

const app = document.querySelector('#app');
const storage = browserStorage();

/** Releases whatever the current view holds on to (timers, global listeners). */
let teardown = () => {};

function browserStorage() {
  try {
    window.localStorage.getItem('quiz-app:probe');
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
}

/** Tiny hyperscript helper: `h('p', { className: 'lead' }, 'text', child)`. */
function h(tag, props = {}, ...children) {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...present(children.flat()));
  return element;
}

/** Drops the `false` / `null` left behind by `condition && node`. */
function present(nodes) {
  return nodes.filter((node) => node !== null && node !== false);
}

/** Turns `backtick` spans into <code> elements, without ever touching innerHTML. */
function rich(text) {
  return text.split('`').map((part, index) => (index % 2 ? h('code', {}, part) : part));
}

function show(...nodes) {
  teardown();
  teardown = () => {};
  app.replaceChildren(...present(nodes));
  app.querySelector('h2')?.focus();
}

function percentLabel(ratio) {
  return `${Math.round(ratio * 100)}%`;
}

// ---------------------------------------------------------------- home

function renderHome() {
  const history = loadHistory(storage);
  show(
    h('h2', { tabIndex: -1 }, 'Pick a quiz'),
    h(
      'p',
      { className: 'lead' },
      'Each question has four answers and only one is right. The clock starts as soon as you do.',
    ),
    h('ul', { className: 'quiz-list' }, quizzes.map((quiz) => quizCard(quiz, statsFor(history, quiz.id)))),
    history.length > 0 && historyPanel(history),
  );
}

function quizCard(quiz, stats) {
  const record = stats.best
    ? `Best ${stats.best.percent}% in ${formatDuration(stats.best.durationMs)} · ${stats.attempts} attempt${stats.attempts > 1 ? 's' : ''}`
    : 'Not attempted yet';
  return h(
    'li',
    { className: 'quiz-card' },
    h('span', { className: 'quiz-icon', ariaHidden: 'true' }, quiz.icon),
    h(
      'div',
      { className: 'quiz-info' },
      h('h3', {}, quiz.title),
      h('p', {}, quiz.description),
      h('p', { className: 'muted' }, `${quiz.questions.length} questions · ${record}`),
    ),
    h(
      'button',
      { type: 'button', className: 'button primary', onclick: () => startQuiz(quiz) },
      'Start',
      h('span', { className: 'visually-hidden' }, ` the ${quiz.title} quiz`),
    ),
  );
}

function historyPanel(history) {
  const rows = history
    .slice(-RECENT_ATTEMPTS_SHOWN)
    .reverse()
    .map((attempt) =>
      h(
        'tr',
        {},
        h('td', {}, attempt.title ?? attempt.quizId),
        h('td', {}, `${attempt.correct}/${attempt.total} (${attempt.percent}%)`),
        h('td', {}, formatDuration(attempt.durationMs)),
        h(
          'td',
          {},
          h('span', { className: `badge ${attempt.passed ? 'pass' : 'fail'}` }, attempt.passed ? 'Passed' : 'Failed'),
        ),
        h('td', { className: 'muted' }, new Date(attempt.finishedAt).toLocaleDateString()),
      ),
    );

  return h(
    'section',
    { className: 'history' },
    h(
      'div',
      { className: 'history-header' },
      h('h3', {}, 'Recent attempts'),
      h(
        'button',
        {
          type: 'button',
          className: 'button ghost',
          onclick: () => {
            clearHistory(storage);
            renderHome();
          },
        },
        'Clear history',
      ),
    ),
    h(
      'div',
      { className: 'table-scroll' },
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, ['Quiz', 'Score', 'Time', 'Result', 'Date'].map((label) => h('th', { scope: 'col' }, label)))),
        h('tbody', {}, rows),
      ),
    ),
  );
}

// ---------------------------------------------------------------- quiz

function startQuiz(quiz) {
  renderQuestion(quiz, createSession(quiz, { now: Date.now() }));
}

function renderQuestion(quiz, session) {
  const question = currentQuestion(session);
  const number = session.answers.length + 1;
  const total = session.questions.length;

  const clock = h('span', { className: 'clock', title: 'Elapsed time' });
  const tick = () => {
    clock.textContent = formatDuration(Date.now() - session.startedAt);
  };
  tick();

  const feedback = h('p', { className: 'feedback', role: 'status' });
  const buttons = question.choices.map((choice, index) =>
    h(
      'button',
      { type: 'button', className: 'choice', onclick: () => choose(index) },
      h('kbd', {}, String(index + 1)),
      h('span', {}, rich(choice)),
    ),
  );

  let advanceTimer = null;

  function choose(index) {
    const next = answer(session, index, Date.now());
    const isCorrect = index === question.correctIndex;

    document.removeEventListener('keydown', onKeydown);
    buttons.forEach((button, i) => {
      button.disabled = true;
      if (i === question.correctIndex) button.classList.add('is-correct');
      else if (i === index) button.classList.add('is-wrong');
    });
    feedback.textContent = isCorrect ? 'Correct!' : 'Not quite.';
    feedback.classList.add(isCorrect ? 'pass' : 'fail');

    advanceTimer = setTimeout(
      () => (isFinished(next) ? finishQuiz(quiz, next) : renderQuestion(quiz, next)),
      FEEDBACK_DELAY_MS,
    );
  }

  function onKeydown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const index = Number(event.key) - 1;
    if (index in buttons) choose(index);
  }

  show(
    h(
      'div',
      { className: 'quiz-status' },
      h('span', {}, `${quiz.title} · Question ${number} of ${total}`),
      clock,
    ),
    h('progress', { max: total, value: session.answers.length, ariaLabel: 'Quiz progress' }),
    h('h2', { tabIndex: -1, className: 'prompt' }, rich(question.prompt)),
    h('div', { className: 'choices' }, buttons),
    feedback,
    h(
      'div',
      { className: 'actions' },
      h('span', { className: 'muted hint' }, 'Tip: press 1–4 to answer.'),
      h('button', { type: 'button', className: 'button ghost', onclick: renderHome }, 'Quit quiz'),
    ),
  );

  const clockTimer = setInterval(tick, 500);
  document.addEventListener('keydown', onKeydown);
  teardown = () => {
    clearInterval(clockTimer);
    clearTimeout(advanceTimer);
    document.removeEventListener('keydown', onKeydown);
  };
}

function finishQuiz(quiz, session) {
  const summary = summarize(session);
  recordAttempt(storage, summary);
  renderResult(quiz, summary);
}

// -------------------------------------------------------------- result

function renderResult(quiz, summary) {
  const text = shareText(summary);
  const shareStatus = h('p', { className: 'muted', role: 'status' });
  const postUrl = `https://twitter.com/intent/tweet?${new URLSearchParams({ text, url: location.href })}`;

  show(
    h(
      'p',
      { className: `verdict ${summary.passed ? 'pass' : 'fail'}` },
      summary.passed ? 'Passed' : 'Failed',
    ),
    h(
      'h2',
      { tabIndex: -1 },
      summary.passed ? `Nicely done — you passed the ${summary.title} quiz.` : `Not this time — you failed the ${summary.title} quiz.`,
    ),
    h(
      'dl',
      { className: 'stats' },
      stat('Correct answers', `${summary.correct} / ${summary.total}`),
      stat('Score', `${summary.percent}%`),
      stat('Time', formatDuration(summary.durationMs)),
      stat('Pass mark', percentLabel(summary.passMark)),
    ),
    h(
      'div',
      { className: 'actions' },
      h('button', { type: 'button', className: 'button primary', onclick: () => startQuiz(quiz) }, 'Try again'),
      h('button', { type: 'button', className: 'button', onclick: renderHome }, 'All quizzes'),
      h('button', { type: 'button', className: 'button', onclick: () => share(text, shareStatus) }, 'Share result'),
      h('a', { className: 'button', href: postUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Post on X'),
    ),
    shareStatus,
    h('h3', {}, 'Review your answers'),
    h('ol', { className: 'review' }, summary.review.map(reviewItem)),
  );
}

function stat(label, value) {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value));
}

function reviewItem(entry) {
  return h(
    'li',
    { className: entry.isCorrect ? 'pass' : 'fail' },
    h('p', { className: 'review-prompt' }, rich(entry.prompt)),
    h('p', {}, h('strong', {}, entry.isCorrect ? '✓ Your answer: ' : '✗ Your answer: '), rich(entry.chosen)),
    !entry.isCorrect && h('p', {}, h('strong', {}, 'Correct answer: '), rich(entry.expected)),
    entry.explanation && h('p', { className: 'muted' }, rich(entry.explanation)),
  );
}

async function share(text, status) {
  try {
    if (navigator.share) {
      await navigator.share({ title: document.title, text, url: location.href });
    } else {
      await navigator.clipboard.writeText(`${text} ${location.href}`);
      status.textContent = 'Result copied to the clipboard.';
    }
  } catch (error) {
    if (error.name !== 'AbortError') status.textContent = `Could not share automatically. Copy this instead: ${text}`;
  }
}

renderHome();
