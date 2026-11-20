import { BUGS, findBug } from './bugs.js';
import { LANE_COUNT, createRace, stepRace } from './race.js';
import { createSoundboard } from './sound.js';
import { createStats, recordRace } from './stats.js';
import { validateSetup, validateStart } from './validation.js';

const DEFAULT_NAMES = ['Dot', 'Sprout', 'Buzz', 'Flicker'];
const NAME_MAX_LENGTH = 14;
/** Caps a frame's elapsed time so a backgrounded tab cannot teleport bugs. */
const MAX_FRAME_SECONDS = 0.1;

const settings = document.getElementById('settings');
const laneConfigs = document.getElementById('lane-configs');
const track = document.getElementById('track');
const startButton = document.getElementById('start-button');
const result = document.getElementById('result');
const errorList = document.getElementById('errors');
const warningList = document.getElementById('warnings');
const sessionSummary = document.getElementById('session-summary');
const statsBody = document.getElementById('stats-body');
const soundToggle = document.getElementById('sound-toggle');

const sound = createSoundboard();
let stats = createStats(LANE_COUNT);

/** Builds an element from an HTML string made only of static, trusted markup. */
function fromTemplate(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function buildLaneConfig(index) {
  const lane = index + 1;
  const icons = BUGS.map(
    (bug, bugIndex) => `
      <label class="icon-option" title="${bug.label}">
        <input type="radio" name="icon-${index}" value="${bug.id}" ${bugIndex === index % BUGS.length ? 'checked' : ''} />
        <span class="thumb">${bug.svg}</span>
        <span class="sr-only">${bug.label}</span>
      </label>`,
  ).join('');

  return fromTemplate(`
    <fieldset class="lane-config" data-lane="${index}">
      <legend>Lane ${lane}</legend>
      <div class="icon-options">${icons}</div>
      <input class="name-input" type="text" maxlength="${NAME_MAX_LENGTH}" value="${DEFAULT_NAMES[index % DEFAULT_NAMES.length]}"
        aria-label="Name of the bug in lane ${lane}" placeholder="Bug name" autocomplete="off" spellcheck="false" />
    </fieldset>`);
}

function buildTrackLane(index) {
  return fromTemplate(`
    <div class="lane" data-lane="${index}">
      <label class="pick">
        <input type="radio" name="pick" value="${index}" />
        <span class="pick-number">${index + 1}</span>
        <span class="pick-name"></span>
      </label>
      <div class="strip">
        <div class="finish-line"></div>
        <div class="runner"><div class="bug"></div></div>
      </div>
    </div>`);
}

const configOf = (index) => laneConfigs.children[index];
const trackLanes = () => [...track.querySelectorAll('.lane')];

function readLanes() {
  return Array.from({ length: LANE_COUNT }, (_, index) => ({
    icon: configOf(index).querySelector('input[type="radio"]:checked').value,
    name: configOf(index).querySelector('.name-input').value,
  }));
}

function readPick() {
  const checked = track.querySelector('input[name="pick"]:checked');
  return checked ? Number(checked.value) : null;
}

const readSpeed = () => settings.querySelector('input[name="speed"]:checked').value;

const displayName = (lane, index) => lane.name.trim() || `Lane ${index + 1}`;

function renderMessages(list, messages) {
  list.replaceChildren(
    ...messages.map((message) => {
      const item = document.createElement('li');
      item.textContent = message;
      return item;
    }),
  );
}

function renderValidation({ warnings, errors }) {
  renderMessages(warningList, warnings);
  renderMessages(errorList, errors);
}

function renderStats(lanes) {
  const { races, correctGuesses } = stats;
  sessionSummary.textContent =
    races === 0
      ? 'No races run yet this session.'
      : `Races run: ${races} · Correct guesses: ${correctGuesses} (${Math.round((correctGuesses / races) * 100)}%)`;

  statsBody.replaceChildren(
    ...stats.lanes.map((laneStats, index) => {
      const row = document.createElement('tr');
      const cells = [index + 1, displayName(lanes[index], index), laneStats.races, laneStats.wins, laneStats.losses];
      for (const value of cells) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    }),
  );
}

/** Mirrors the setup panel (icons and names) onto the track and stats table. */
function renderLanes(lanes) {
  trackLanes().forEach((laneElement, index) => {
    const bug = laneElement.querySelector('.bug');
    if (bug.dataset.icon !== lanes[index].icon) {
      bug.dataset.icon = lanes[index].icon;
      bug.innerHTML = findBug(lanes[index].icon).svg;
    }
    laneElement.querySelector('.pick-name').textContent = displayName(lanes[index], index);
  });
  renderStats(lanes);
}

function refreshSetup() {
  const lanes = readLanes();
  renderLanes(lanes);
  renderValidation(validateSetup(lanes));
}

function renderPositions(race) {
  trackLanes().forEach((laneElement, index) => {
    laneElement.style.setProperty('--progress', race.runners[index].position);
  });
}

function setRacing(racing) {
  startButton.disabled = racing;
  settings.disabled = racing;
  track.disabled = racing;
  track.classList.toggle('is-racing', racing);
}

function finishRace(lanes, winner, pick) {
  setRacing(false);
  trackLanes().forEach((laneElement, index) => {
    laneElement.classList.add(index === winner ? 'is-winner' : 'is-loser');
  });

  const guessedRight = winner === pick;
  if (guessedRight) sound.playWin();
  else sound.playLose();

  result.textContent = guessedRight
    ? `${displayName(lanes[winner], winner)} wins — you called it!`
    : `${displayName(lanes[winner], winner)} wins. You bet on ${displayName(lanes[pick], pick)}.`;
  result.classList.toggle('is-correct', guessedRight);

  stats = recordRace(stats, winner, pick);
  renderStats(lanes);
}

function startRace() {
  const lanes = readLanes();
  const pick = readPick();
  const validation = validateStart(lanes, pick);
  renderValidation(validation);
  if (validation.errors.length > 0) return;

  const race = createRace(readSpeed());
  for (const laneElement of trackLanes()) {
    laneElement.classList.remove('is-winner', 'is-loser');
  }
  renderPositions(race);
  result.textContent = 'And they’re off!';
  result.classList.remove('is-correct');
  setRacing(true);
  sound.playStart();

  let previous = performance.now();
  const frame = (now) => {
    const elapsed = Math.min((now - previous) / 1000, MAX_FRAME_SECONDS);
    previous = now;
    stepRace(race, elapsed);
    renderPositions(race);
    if (race.winner === null) requestAnimationFrame(frame);
    else finishRace(lanes, race.winner, pick);
  };
  requestAnimationFrame(frame);
}

for (let index = 0; index < LANE_COUNT; index += 1) {
  laneConfigs.append(buildLaneConfig(index));
  track.append(buildTrackLane(index));
}

laneConfigs.addEventListener('input', refreshSetup);
track.addEventListener('change', refreshSetup);
soundToggle.addEventListener('change', () => sound.setMuted(!soundToggle.checked));
startButton.addEventListener('click', startRace);

refreshSetup();
