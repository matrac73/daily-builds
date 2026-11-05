import { LIMITS, defaultBulbs, limit } from '../lights.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: block; }
    ol {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
      gap: 0.75rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      gap: 0.4rem;
      justify-items: center;
      padding: 0.6rem 0.4rem;
      border-radius: 0.6rem;
      background: var(--panel-alt, #ffffff0d);
      font-size: 0.8rem;
    }
    input[type="color"] {
      width: 2.5rem;
      height: 2.5rem;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: none;
      cursor: pointer;
    }
    input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
    input[type="color"]::-webkit-color-swatch { border: 2px solid #fff3; border-radius: 50%; }
    input[type="color"]::-moz-color-swatch { border: 2px solid #fff3; border-radius: 50%; }
    input[type="range"] { width: 100%; accent-color: var(--accent, #3ddc63); }
    output { font-variant-numeric: tabular-nums; opacity: 0.8; }
  </style>
  <ol></ol>
`;

/**
 * <bulb-editor> lets the user pick the colour and size of each bulb.
 * Fires a `bulbs-change` event whose `detail` is the full bulb list.
 */
export class BulbEditor extends HTMLElement {
  #bulbs = defaultBulbs();
  #list;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.append(template.content.cloneNode(true));
    this.#list = root.querySelector('ol');
    this.#list.addEventListener('input', (event) => this.#onInput(event));
  }

  connectedCallback() {
    this.#render();
  }

  get bulbs() { return this.#bulbs.map((b) => ({ ...b })); }
  set bulbs(value) {
    this.#bulbs = value.map((b) => ({ ...b }));
    this.#render();
  }

  #render() {
    const { min, max } = LIMITS.size;
    this.#list.replaceChildren(...this.#bulbs.map((bulb, i) => {
      const item = document.createElement('li');
      item.dataset.index = i;
      item.innerHTML = `
        <input type="color" name="color" aria-label="Colour of bulb ${i + 1}">
        <input type="range" name="size" min="${min}" max="${max}" aria-label="Size of bulb ${i + 1}">
        <output></output>
      `;
      item.querySelector('[name="color"]').value = bulb.color;
      item.querySelector('[name="size"]').value = bulb.size;
      item.querySelector('output').textContent = `${bulb.size}px`;
      return item;
    }));
  }

  #onInput(event) {
    const input = event.target;
    const item = input.closest('li');
    const bulb = this.#bulbs[Number(item.dataset.index)];
    if (input.name === 'color') {
      bulb.color = input.value;
    } else {
      bulb.size = limit('size', input.value);
      item.querySelector('output').textContent = `${bulb.size}px`;
    }
    this.dispatchEvent(new CustomEvent('bulbs-change', { detail: this.bulbs, bubbles: true }));
  }
}

customElements.define('bulb-editor', BulbEditor);
