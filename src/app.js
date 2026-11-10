// Browser glue: form handling, rendering, ticking and localStorage.

import { breakdown, validateEvent } from './countdown.js';
import { STORAGE_KEY, addEvent, removeEvent, serialize, deserialize } from './events.js';

const TICK_MS = 250;
const TOAST_MS = 6000;
const UNITS = ['days', 'hours', 'minutes', 'seconds'];

const form = document.querySelector('#event-form');
const list = document.querySelector('#event-list');
const emptyState = document.querySelector('#empty-state');
const template = document.querySelector('#event-template');
const toast = document.querySelector('#toast');
const baseTitle = document.title;

const whenFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' });

let events = loadEvents();
/** Rendered card nodes and last state, keyed by event id. */
const cards = new Map();
let toastTimer;

function loadEvents() {
  try {
    return deserialize(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function saveEvents() {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(events));
  } catch {
    // Storage may be full or disabled (private mode); countdowns still work for this session.
  }
}

function showErrors(errors) {
  for (const field of ['name', 'date', 'time']) {
    const input = form.elements[field];
    const message = errors.find((error) => error.field === field)?.message;
    const slot = document.querySelector(`#${field}-error`);
    slot.textContent = message ?? '';
    slot.hidden = !message;
    input.setAttribute('aria-invalid', String(Boolean(message)));
  }
  const first = errors[0];
  if (first) form.elements[first.field].focus();
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, TOAST_MS);
}

function announceReached(event) {
  showToast(`🎉 “${event.name}” is happening now!`);
  document.title = `🎉 ${event.name} — ${baseTitle}`;
}

function createCard(event) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector('.event-name').textContent = event.name;
  node.querySelector('.event-when').textContent = whenFormat.format(event.target);
  const remove = node.querySelector('.remove');
  remove.setAttribute('aria-label', `Remove countdown for ${event.name}`);
  remove.addEventListener('click', () => {
    events = removeEvent(events, event.id);
    saveEvents();
    render();
  });
  const digits = Object.fromEntries(
    UNITS.map((unit) => [unit, node.querySelector(`[data-unit="${unit}"]`)]),
  );
  return { node, digits, timer: node.querySelector('.tubes'), done: null, label: '' };
}

function updateCard(card, event, now) {
  const parts = breakdown(event.target - now);
  for (const unit of UNITS) {
    const text = String(parts[unit]).padStart(2, '0');
    if (card.digits[unit].textContent !== text) card.digits[unit].textContent = text;
  }
  if (card.done !== parts.done) {
    if (card.done === false && parts.done) announceReached(event);
    card.done = parts.done;
    card.node.classList.toggle('reached', parts.done);
  }
  const label = parts.done
    ? `${event.name} has been reached`
    : `${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes until ${event.name}`;
  if (card.label !== label) {
    card.label = label;
    card.timer.setAttribute('aria-label', label);
  }
}

function render() {
  const ids = new Set(events.map((event) => event.id));
  for (const [id, card] of cards) {
    if (!ids.has(id)) {
      card.node.remove();
      cards.delete(id);
    }
  }
  const now = Date.now();
  for (const event of events) {
    let card = cards.get(event.id);
    if (!card) {
      card = createCard(event);
      cards.set(event.id, card);
    }
    updateCard(card, event, now);
    list.append(card.node); // re-appending keeps DOM order in sync with the sorted list
  }
  emptyState.hidden = events.length > 0;
}

function tick() {
  const now = Date.now();
  for (const event of events) updateCard(cards.get(event.id), event, now);
}

form.addEventListener('submit', (submitEvent) => {
  submitEvent.preventDefault();
  const data = new FormData(form);
  const result = validateEvent({
    name: data.get('name'),
    date: data.get('date'),
    time: data.get('time'),
  });
  if (!result.ok) {
    showErrors(result.errors);
    return;
  }
  showErrors([]);
  events = addEvent(events, result.event);
  saveEvents();
  render();
  form.reset();
  form.elements.name.focus();
});

render();
setInterval(tick, TICK_MS);
