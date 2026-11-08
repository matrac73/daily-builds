/**
 * Browser layer: renders the game state and animates it. All rules live in
 * game.js; this file only translates clicks into transitions and transitions
 * into motion.
 */
import { PHASE, createGame, endShuffle, guess, hidePea, isRevealed, shuffle, slotOf } from './game.js';
import { SPEEDS, applySwap, planShuffle } from './shuffle.js';
import { emptyScore, loadScore, saveScore, winRate } from './score.js';

const SLOT_LEFT = [7, 38, 69]; // left edge of each slot, in % of the table width
const SLOT_NAMES = ['left', 'middle', 'right'];
const LIFT_MS = 380;
const PEA_FLIGHT_MS = 550;

const $ = (selector) => document.querySelector(selector);
const stage = $('#stage');
const cupLayer = stage.querySelector('.cups');
const cups = [...cupLayer.querySelectorAll('.cup')].sort((a, b) => a.dataset.shell - b.dataset.shell);
const pea = $('#pea');
const progressBar = $('#progress-bar');
const message = $('#message');
const shuffleButton = $('#shuffle');
const speedSelect = $('#speed');
const resetButton = $('#reset');
const stats = { played: $('#played'), wins: $('#wins'), rate: $('#rate') };

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();

let game = createGame(loadScore(storage));
let busy = false; // true while an animation is running: input is ignored

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function say(text, tone = 'info') {
  message.textContent = text;
  message.dataset.tone = tone;
}

function setScore(score) {
  game = { ...game, score };
  saveScore(storage, score);
}

function renderScore(previous = game.score) {
  const rate = winRate(game.score);
  const values = { played: game.score.played, wins: game.score.wins, rate: rate === null ? '–' : `${rate}%` };
  for (const [key, el] of Object.entries(stats)) {
    el.textContent = values[key];
    if (key in previous && previous[key] !== game.score[key]) {
      el.classList.remove('bump');
      void el.offsetWidth; // restart the CSS animation
      el.classList.add('bump');
    }
  }
}

function canClick(shellId) {
  if (busy) return false;
  if (game.phase === PHASE.HIDING || game.phase === PHASE.WON) return true;
  return game.phase === PHASE.GUESSING && !isRevealed(game, shellId);
}

function render() {
  stage.dataset.phase = game.phase;
  shuffleButton.disabled = busy || game.phase !== PHASE.READY;
  speedSelect.disabled = busy;
  resetButton.disabled = busy;
  cups.forEach((cup, shellId) => {
    cup.disabled = !canClick(shellId);
  });
}

/** Position cups on their slots and keep DOM (= tab) order left to right. */
function arrangeCups() {
  cups.forEach((cup, shellId) => {
    const slot = slotOf(game, shellId);
    cup.style.left = `${SLOT_LEFT[slot]}%`;
    cup.setAttribute('aria-label', `Shell on the ${SLOT_NAMES[slot]}`);
  });
  cupLayer.append(...game.order.map((shellId) => cups[shellId]));
}

function setLifted(cup, lifted) {
  cup.classList.toggle('lifted', lifted);
}

/** Move the pea into `target` with a FLIP animation so it visibly travels there. */
async function flyPea(target) {
  const first = pea.getBoundingClientRect();
  target.append(pea);
  const last = pea.getBoundingClientRect();
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  if (dx === 0 && dy === 0) return;
  await pea.animate(
    [
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: `translate(${dx / 2}px, ${dy / 2 - last.height * 2}px)`, offset: 0.5 },
      { transform: 'translate(0, 0)' },
    ],
    { duration: PEA_FLIGHT_MS, easing: 'ease-in-out' },
  ).finished;
}

/** Animate the two cups standing on slots `a` and `b` trading places along arcs. */
function animateSwap(order, [a, b], ms) {
  const moves = [
    { cup: cups[order[a]], from: a, to: b, lift: -14, scale: 0.92, z: 1 }, // passes behind
    { cup: cups[order[b]], from: b, to: a, lift: 6, scale: 1.06, z: 3 }, // passes in front
  ];
  return Promise.all(
    moves.map(({ cup, from, to, lift, scale, z }) => {
      cup.style.left = `${SLOT_LEFT[to]}%`; // final state, held by the animation until it ends
      cup.style.zIndex = z;
      const middle = (SLOT_LEFT[from] + SLOT_LEFT[to]) / 2;
      return cup
        .animate(
          [
            { left: `${SLOT_LEFT[from]}%`, transform: 'none' },
            { left: `${middle}%`, transform: `translateY(${lift}%) scale(${scale})` },
            { left: `${SLOT_LEFT[to]}%`, transform: 'none' },
          ],
          { duration: ms, easing: 'ease-in-out' },
        )
        .finished.then(() => {
          cup.style.zIndex = '';
        });
    }),
  );
}

async function runBusy(task) {
  busy = true;
  render();
  try {
    await task();
  } finally {
    busy = false;
    render();
  }
}

function onHide(shellId) {
  const previous = game.score;
  game = hidePea(game, shellId);
  setScore(game.score);
  renderScore(previous);
  cups.forEach((cup) => cup.classList.remove('winner', 'miss'));

  return runBusy(async () => {
    say('Hiding the pea…');
    const cup = cups[shellId];
    setLifted(cup, true);
    await wait(LIFT_MS);
    await flyPea(cup.querySelector('.pea-spot'));
    cups.forEach((c) => setLifted(c, false));
    await wait(LIFT_MS);
    say('The pea is hidden. Press Shuffle when you are ready.');
  });
}

function onShuffle() {
  if (busy || game.phase !== PHASE.READY) return undefined;
  const swapMs = SPEEDS[speedSelect.value] ?? SPEEDS.classic;
  const swaps = planShuffle(swapMs);
  let order = game.order;
  game = shuffle(game, swaps);

  return runBusy(async () => {
    say('Keep your eyes on the pea…');
    progressBar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: swaps.length * swapMs,
      easing: 'linear',
    });
    for (const swap of swaps) {
      await animateSwap(order, swap, swapMs);
      order = applySwap(order, swap);
    }
    game = endShuffle(game);
    arrangeCups();
    say('Where is the pea? Click a shell.');
  });
}

function onGuess(shellId) {
  const previous = game;
  game = guess(game, shellId);
  if (game === previous) return undefined;

  return runBusy(async () => {
    const cup = cups[shellId];
    setLifted(cup, true);
    await wait(LIFT_MS);
    if (game.phase !== PHASE.WON) {
      cup.classList.add('miss');
      say('Empty! Try another shell.', 'miss');
      return;
    }
    cup.classList.add('winner');
    setScore(game.score);
    renderScore(previous.score);
    const tries = game.guesses.length;
    say(
      tries === 1
        ? 'Congratulations! You found the pea on your first guess. Click a shell to play again.'
        : `Congratulations, you found the pea after ${tries} guesses! Click a shell to play again.`,
      'win',
    );
  });
}

function onCup(shellId) {
  if (!canClick(shellId)) return;
  if (game.phase === PHASE.GUESSING) onGuess(shellId);
  else onHide(shellId);
}

cupLayer.addEventListener('click', (event) => {
  const cup = event.target.closest('.cup');
  if (cup) onCup(Number(cup.dataset.shell));
});

shuffleButton.addEventListener('click', onShuffle);

resetButton.addEventListener('click', () => {
  const previous = game.score;
  setScore(emptyScore());
  renderScore(previous);
});

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('select')) return;
  const slot = ['1', '2', '3'].indexOf(event.key);
  if (slot !== -1) {
    onCup(game.order[slot]);
  } else if (event.key.toLowerCase() === 's') {
    onShuffle();
  }
});

arrangeCups();
renderScore();
render();
say('Click a shell to hide the pea under it.');
