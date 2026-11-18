import {
  BELL_POINTS,
  PHYSICS,
  POINT_BANDS,
  WIN_POINTS,
  bandFor,
  createScore,
  hasWon,
  launchPuck,
  meterPosition,
  meterPower,
  recordStrike,
  stepPuck,
  strikeForce,
} from './game.js';
import { createSoundboard } from './audio.js';

// Puck travel in SVG user units (see the viewBox in index.html).
const TRACK = { x: 120, bottom: 482, top: 99 };
const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_FRAME_SECONDS = 0.1;

const $ = (id) => document.getElementById(id);
const ui = {
  puck: $('puck'),
  bell: $('bell'),
  lever: $('lever'),
  mallet: $('mallet'),
  scale: $('scale'),
  meter: $('meter'),
  needle: $('needle'),
  strike: $('strike'),
  clear: $('clear'),
  mute: $('mute'),
  again: $('again'),
  bells: $('bells'),
  attempts: $('attempts'),
  points: $('points'),
  target: $('target'),
  progress: $('progress'),
  result: $('result'),
  win: $('win'),
  winText: $('win-text'),
  rules: $('rules-list'),
};

const sounds = createSoundboard();

let score = createScore();
let puck = null; // the puck in flight, or null while the player is aiming
let meterStart = performance.now();
let lastFrame = meterStart;
let pendingTime = 0;

const trackY = (height) => TRACK.bottom - height * (TRACK.bottom - TRACK.top);

function svg(name, attributes, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Draws the point scale on the tower and the matching rules list from POINT_BANDS. */
function buildScale() {
  POINT_BANDS.forEach((band, index) => {
    const item = document.createElement('li');
    const range = index === 0 ? 'Bell' : `${band.min * 100}% to ${POINT_BANDS[index - 1].min * 100}%`;
    item.textContent = `${range}: ${band.points} ${band.points === 1 ? 'point' : 'points'}`;
    ui.rules.append(item);

    if (band.points === 0 || band.points === BELL_POINTS) return;
    const y = trackY(band.min);
    const ceiling = trackY(POINT_BANDS[index - 1].min);
    ui.scale.append(
      svg('line', { x1: 84, x2: 156, y1: y, y2: y, class: 'scale-line' }),
      svg('text', { x: 170, y: (y + ceiling) / 2 + 5, class: 'scale-label' }, `+${band.points}`),
    );
  });
  ui.scale.append(svg('text', { x: 170, y: 82, class: 'scale-label scale-label-bell' }, `+${BELL_POINTS}`));
}

function drawPuck(height) {
  ui.puck.setAttribute('transform', `translate(${TRACK.x} ${trackY(height)})`);
}

function drawMeter(now) {
  const position = meterPosition(now - meterStart);
  ui.needle.style.left = `${position * 100}%`;
  ui.meter.setAttribute('aria-valuenow', String(Math.round(meterPower(position) * 100)));
}

function renderScore() {
  ui.bells.textContent = score.bells;
  ui.attempts.textContent = score.attempts;
  ui.points.textContent = score.points;
  ui.progress.style.width = `${Math.min(1, score.points / WIN_POINTS) * 100}%`;

  const won = hasWon(score);
  ui.win.hidden = !won;
  ui.strike.disabled = won || puck !== null;
  if (won) {
    ui.winText.textContent =
      `You reached ${score.points} points in ${score.attempts} ` +
      `${score.attempts === 1 ? 'strike' : 'strikes'}, ringing the bell ` +
      `${score.bells} ${score.bells === 1 ? 'time' : 'times'}.`;
  }
}

/** Restarts a CSS animation on an element by toggling its trigger class. */
function replay(element, className) {
  element.classList.remove(className);
  element.getBoundingClientRect(); // force a reflow so the animation restarts
  element.classList.add(className);
}

function strike() {
  if (puck || hasWon(score)) return;
  const power = meterPower(meterPosition(performance.now() - meterStart));
  puck = launchPuck(strikeForce(power));
  pendingTime = 0;
  ui.strike.disabled = true;
  ui.result.textContent = 'Up it goes…';
  replay(ui.lever, 'is-struck');
  replay(ui.mallet, 'is-struck');
  sounds.thud();
  sounds.startSlide();
}

/** Steps the physics at a fixed rate, independent of the display's frame rate. */
function advanceFlight(seconds) {
  pendingTime += seconds;
  while (pendingTime >= PHYSICS.dt && !puck.done) {
    const wasRung = puck.rangBell;
    puck = stepPuck(puck);
    pendingTime -= PHYSICS.dt;
    if (!wasRung && puck.rangBell) {
      sounds.bell();
      replay(ui.bell, 'is-ringing');
    }
  }

  drawPuck(puck.height);
  if (puck.velocity > 0) sounds.slideTo(puck.height);
  else sounds.stopSlide();
  if (puck.done) finishFlight();
}

function finishFlight() {
  const { peak } = puck;
  const band = bandFor(peak);
  puck = null;
  score = recordStrike(score, peak);

  const reached = band.points === BELL_POINTS ? 'The puck hit the bell' : `${Math.floor(peak * 100)}% of the track`;
  ui.result.textContent =
    `${band.title}! ${reached}: +${band.points} ${band.points === 1 ? 'point' : 'points'}.`;
  if (band.points !== BELL_POINTS) sounds.award(band.points);
  if (hasWon(score)) sounds.fanfare(0.4);

  meterStart = performance.now();
  renderScore();
}

function reset() {
  sounds.stopSlide();
  puck = null;
  score = createScore();
  meterStart = performance.now();
  drawPuck(0);
  ui.result.textContent = 'Score cleared. Take a swing!';
  renderScore();
}

function toggleMute() {
  sounds.setMuted(!sounds.muted);
  ui.mute.setAttribute('aria-pressed', String(sounds.muted));
  ui.mute.textContent = `Sound: ${sounds.muted ? 'off' : 'on'}`;
}

function frame(now) {
  const seconds = Math.min((now - lastFrame) / 1000, MAX_FRAME_SECONDS);
  lastFrame = now;
  if (puck) advanceFlight(seconds);
  else if (!hasWon(score)) drawMeter(now);
  requestAnimationFrame(frame);
}

ui.strike.addEventListener('click', strike);
ui.clear.addEventListener('click', reset);
ui.again.addEventListener('click', reset);
ui.mute.addEventListener('click', toggleMute);

// Space / Enter strike from anywhere; focused controls keep their native behaviour.
document.addEventListener('keydown', (event) => {
  if (event.repeat || (event.code !== 'Space' && event.code !== 'Enter')) return;
  if (event.target.closest('button, summary')) return;
  event.preventDefault();
  strike();
});

ui.target.textContent = WIN_POINTS;
buildScale();
drawPuck(0);
renderScore();
requestAnimationFrame(frame);
