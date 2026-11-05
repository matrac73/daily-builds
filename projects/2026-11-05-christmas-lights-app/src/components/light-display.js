import { activeIndex, bulbAppearance, defaultBulbs, limit } from '../lights.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: grid;
      gap: 1.25rem;
      justify-items: center;
      padding: 2rem 1rem;
    }
    .row {
      position: relative;
      isolation: isolate;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: clamp(0.5rem, 2.5vw, 1.5rem);
      flex-wrap: nowrap;
    }
    /* the wire the bulbs hang from */
    .row::before {
      content: '';
      position: absolute;
      inset: 50% -1rem auto;
      height: 2px;
      background: var(--wire-color, #2f4f3a);
      z-index: -1;
    }
    .bulb {
      width: var(--size);
      height: var(--size);
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #fff8 0 12%, transparent 40%), var(--color);
      opacity: var(--opacity);
      box-shadow: var(--glow);
      transition: opacity var(--fade, 120ms) ease-out, box-shadow var(--fade, 120ms) ease-out;
    }
    @media (prefers-reduced-motion: reduce) {
      .bulb { transition: none; }
    }
  </style>
  <div part="rows"></div>
`;

/**
 * <light-display> renders `rows` rows of bulbs and lights one bulb per row
 * according to `step`. Set `step` to null to show every bulb at normal intensity.
 */
export class LightDisplay extends HTMLElement {
  #bulbs = defaultBulbs();
  #rows = 1;
  #intensity = 80;
  #step = null;
  #container;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.append(template.content.cloneNode(true));
    this.#container = root.querySelector('[part="rows"]');
    this.setAttribute('role', 'img');
  }

  connectedCallback() {
    this.#build();
  }

  get bulbs() { return this.#bulbs.map((b) => ({ ...b })); }
  set bulbs(value) {
    this.#bulbs = value.map((b) => ({ ...b }));
    this.#build();
  }

  get rows() { return this.#rows; }
  set rows(value) {
    this.#rows = limit('rows', value);
    this.#build();
  }

  get intensity() { return this.#intensity; }
  set intensity(value) {
    this.#intensity = limit('intensity', value);
    this.#paint();
  }

  get step() { return this.#step; }
  set step(value) {
    this.#step = value === null ? null : Number(value);
    this.#paint();
  }

  /** Recreate the bulb elements (row count or bulb list changed). */
  #build() {
    const rows = Array.from({ length: this.#rows }, () => {
      const row = document.createElement('div');
      row.className = 'row';
      row.append(...this.#bulbs.map(() => {
        const bulb = document.createElement('span');
        bulb.className = 'bulb';
        return bulb;
      }));
      return row;
    });
    this.#container.replaceChildren(...rows);
    this.setAttribute('aria-label',
      `${this.#rows} row${this.#rows > 1 ? 's' : ''} of ${this.#bulbs.length} Christmas lights`);
    this.#paint();
  }

  /** Update every bulb's style for the current step and settings. */
  #paint() {
    const count = this.#bulbs.length;
    [...this.#container.children].forEach((row, r) => {
      const lit = this.#step === null ? -1 : activeIndex(this.#step, r, count);
      [...row.children].forEach((el, i) => {
        const look = bulbAppearance({ ...this.#bulbs[i], intensity: this.#intensity, active: i === lit });
        el.style.setProperty('--size', `${look.size}px`);
        el.style.setProperty('--color', look.color);
        el.style.setProperty('--opacity', look.opacity);
        el.style.setProperty('--glow', look.glow);
      });
    });
  }
}

customElements.define('light-display', LightDisplay);
