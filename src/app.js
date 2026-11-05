import './components/light-display.js';
import './components/bulb-editor.js';
import { createTicker, defaultBulbs, limit } from './lights.js';

const display = document.querySelector('light-display');
const editor = document.querySelector('bulb-editor');
const toggleButton = document.querySelector('#toggle');
const resetButton = document.querySelector('#reset');
const controls = {
  interval: document.querySelector('#interval'),
  intensity: document.querySelector('#intensity'),
  rows: document.querySelector('#rows'),
};

const ticker = createTicker((step) => { display.step = step; }, {
  interval: controls.interval.value,
});

/** Show the clamped value next to its slider and return it. */
function readControl(name) {
  const value = limit(name, controls[name].value);
  document.querySelector(`output[for="${name}"]`).textContent =
    name === 'interval' ? `${value} ms` : name === 'intensity' ? `${value}%` : value;
  return value;
}

/** Fade time scales with the interval so fast ripples stay crisp. */
function applyInterval() {
  const interval = readControl('interval');
  ticker.setInterval(interval);
  display.style.setProperty('--fade', `${Math.min(250, Math.round(interval * 0.4))}ms`);
}

function setRunning(running) {
  if (running) {
    display.step = ticker.step;
    ticker.start();
  } else {
    ticker.stop();
    display.step = null;
  }
  toggleButton.textContent = running ? 'Stop' : 'Start';
  toggleButton.setAttribute('aria-pressed', String(running));
}

toggleButton.addEventListener('click', () => setRunning(!ticker.running));

controls.interval.addEventListener('input', applyInterval);
controls.intensity.addEventListener('input', () => { display.intensity = readControl('intensity'); });
controls.rows.addEventListener('input', () => { display.rows = readControl('rows'); });
editor.addEventListener('bulbs-change', (event) => { display.bulbs = event.detail; });

resetButton.addEventListener('click', () => {
  const bulbs = defaultBulbs();
  editor.bulbs = bulbs;
  display.bulbs = bulbs;
});

document.addEventListener('keydown', (event) => {
  // composedPath() reaches into shadow roots, e.g. the bulb editor's inputs
  const target = event.composedPath()[0];
  const interactive = target instanceof HTMLInputElement || target instanceof HTMLButtonElement;
  if (event.code === 'Space' && !interactive) {
    event.preventDefault();
    setRunning(!ticker.running);
  }
});

applyInterval();
display.intensity = readControl('intensity');
display.rows = readControl('rows');
setRunning(true);
