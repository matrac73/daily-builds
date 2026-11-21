import { Elevator, Phase, Purpose } from './elevator.js';
import { arrivalDelayMs, randomArrival } from './occupants.js';
import { createSounds } from './sound.js';

const ARROWS = { up: '▲', down: '▼' };
const MAX_FRAME_MS = 250;
const WARNING_MS = 3000;

const elevator = new Elevator();
const { floors, homeFloor, waitMs, maxRequests } = elevator.config;
const sounds = createSounds();
/** Floor number -> direction the waiting occupant wants to travel. */
const occupants = new Map();

const el = (id) => document.getElementById(id);
const car = el('car');
const floorsEl = el('floors');
const panelButtonsEl = el('panel-buttons');
const warningEl = el('warning');

const floorsDescending = Array.from({ length: floors }, (_, index) => floors - index);

function buildFloors() {
  document.documentElement.style.setProperty('--floors', floors);
  floorsEl.innerHTML = floorsDescending
    .map((floor) => {
      const buttons = elevator
        .allowedDirections(floor)
        .map(
          (direction) =>
            `<button type="button" class="call-button" data-floor="${floor}" data-direction="${direction}"
              aria-label="Call the elevator to go ${direction} from floor ${floor}">${ARROWS[direction]}</button>`,
        )
        .join('');
      return `<div class="floor" data-floor="${floor}">
          <span class="floor-label">${floor}</span>
          <div class="call-buttons">${buttons}</div>
          <div class="occupant" hidden><span class="person" aria-hidden="true"></span><span class="wish"></span></div>
        </div>`;
    })
    .join('');
}

function buildPanel() {
  panelButtonsEl.innerHTML = floorsDescending
    .map(
      (floor) =>
        `<button type="button" class="panel-button" data-floor="${floor}" aria-label="Go to floor ${floor}">${floor}</button>`,
    )
    .join('');
}

/** The one handler for every up/down call button in the building. */
function handleCallClick(event) {
  const button = event.target.closest('.call-button');
  if (!button) return;
  sounds.unlock();
  elevator.call(Number(button.dataset.floor), button.dataset.direction);
}

/** The one handler for every button on the in-car control panel. */
function handlePanelClick(event) {
  const button = event.target.closest('.panel-button');
  if (!button) return;
  sounds.unlock();
  elevator.selectFloor(Number(button.dataset.floor));
}

let warningTimer = null;
function showWarning(message) {
  warningEl.textContent = message;
  warningEl.hidden = false;
  clearTimeout(warningTimer);
  warningTimer = setTimeout(() => {
    warningEl.hidden = true;
  }, WARNING_MS);
}

function handleElevatorEvent(event) {
  if (event.type === 'overflow') {
    sounds.warning();
    showWarning(`Queue full: at most ${event.limit} calls can wait. Try again once one is answered.`);
  } else if (event.type === 'arrive') {
    sounds.arrival();
    if (event.purpose === Purpose.CALL) occupants.delete(event.floor);
  }
}

function describe(state) {
  switch (state.phase) {
    case Phase.MOVING:
      if (state.purpose === Purpose.CALL) return `Answering the call from floor ${state.target}.`;
      if (state.purpose === Purpose.RIDE) return `Travelling to floor ${state.target}.`;
      return `No requests left, returning to floor ${homeFloor}.`;
    case Phase.WAITING:
      return `Doors open on floor ${state.floor}. Choose a floor within ${Math.ceil(state.timerMs / 1000)} s.`;
    case Phase.DWELL:
      return `Arrived on floor ${state.floor}.`;
    default:
      return `Idle on floor ${state.floor}. Call the elevator or choose a floor.`;
  }
}

function renderDetails(state) {
  const stationary = state.phase !== Phase.MOVING;
  const acceptsSelection = state.phase === Phase.IDLE || state.phase === Phase.WAITING;
  const riding = state.purpose === Purpose.RIDE;

  car.classList.toggle('open', state.phase === Phase.WAITING || state.phase === Phase.DWELL);
  el('display-floor').textContent = state.floor;
  el('display-arrow').textContent = state.direction > 0 ? ARROWS.up : state.direction < 0 ? ARROWS.down : '';
  el('status').textContent = describe(state);

  for (const button of floorsEl.querySelectorAll('.call-button')) {
    const floor = Number(button.dataset.floor);
    const { direction } = button.dataset;
    const lit = state.pendingCalls.some((call) => call.floor === floor && call.direction === direction);
    button.classList.toggle('lit', lit);
    button.classList.toggle('hint', !lit && occupants.get(floor) === direction);
  }

  for (const row of floorsEl.querySelectorAll('.floor')) {
    const wish = occupants.get(Number(row.dataset.floor));
    const occupant = row.querySelector('.occupant');
    occupant.hidden = !wish;
    occupant.querySelector('.wish').textContent = wish ? `Going ${wish} ${ARROWS[wish]}` : '';
  }

  for (const button of panelButtonsEl.querySelectorAll('.panel-button')) {
    const floor = Number(button.dataset.floor);
    const here = stationary && floor === state.floor;
    button.disabled = !acceptsSelection || here;
    button.classList.toggle('lit', riding && floor === state.target);
    button.classList.toggle('current', here);
  }

  el('queue-count').textContent = `${state.queue.length}/${maxRequests}`;
  el('queue').innerHTML = state.pendingCalls.length
    ? state.pendingCalls
        .map((call, index) => {
          const answering = index === 0 && state.pendingCalls.length > state.queue.length;
          return `<li class="${answering ? 'answering' : ''}">Floor ${call.floor} ${ARROWS[call.direction]}${
            answering ? ' <em>on the way</em>' : ''
          }</li>`;
        })
        .join('')
    : '<li class="empty">No calls waiting</li>';
}

let lastSignature = '';
function render() {
  const state = elevator.state;
  car.style.transform = `translateY(${-(state.position - 1) * 100}%)`;
  el('countdown-bar').style.transform = `scaleX(${state.phase === Phase.WAITING ? state.timerMs / waitMs : 0})`;

  // Everything else only changes on discrete events, so skip the DOM work on most frames.
  const signature = JSON.stringify([
    state.phase,
    state.purpose,
    state.floor,
    state.target,
    state.direction,
    state.pendingCalls,
    Math.ceil(state.timerMs / 1000),
    [...occupants],
  ]);
  if (signature !== lastSignature) {
    lastSignature = signature;
    renderDetails(state);
  }
}

let arrivalTimer = null;
function scheduleOccupants() {
  clearInterval(arrivalTimer);
  const delay = arrivalDelayMs(el('arrival-interval').value);
  if (delay === null) return;
  arrivalTimer = setInterval(() => {
    const { floor, direction } = randomArrival(floors);
    if (!occupants.has(floor)) occupants.set(floor, direction);
  }, delay);
}

let lastFrame = performance.now();
function frame(now) {
  // Cap the step so a backgrounded tab resumes smoothly instead of jumping ahead.
  elevator.tick(Math.min(Math.max(now - lastFrame, 0), MAX_FRAME_MS));
  lastFrame = now;
  render();
  requestAnimationFrame(frame);
}

buildFloors();
buildPanel();
floorsEl.addEventListener('click', handleCallClick);
panelButtonsEl.addEventListener('click', handlePanelClick);
el('arrival-interval').addEventListener('input', scheduleOccupants);
el('sound-enabled').addEventListener('change', (event) => sounds.setEnabled(event.target.checked));
elevator.subscribe(handleElevatorEvent);
scheduleOccupants();
requestAnimationFrame(frame);
