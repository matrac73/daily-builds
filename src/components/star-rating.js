import { html } from '../lib/html.js';
import { css, shared } from './styles.js';

const MAX_STARS = 5;

const styles = css`
  :host {
    display: inline-block;
  }
  div {
    display: inline-flex;
    gap: 0.1rem;
  }
  button {
    padding: 0 0.1rem;
    border: 0;
    border-radius: 6px;
    background: none;
    font-size: 1.7rem;
    line-height: 1;
    color: var(--line);
    cursor: pointer;
    transition: color 0.1s, transform 0.1s;
  }
  button.on {
    color: var(--accent);
  }
  button:hover {
    transform: scale(1.15);
  }
`;

/**
 * <star-rating> — a 1–5 star input built as an ARIA radio group: arrow keys
 * move the selection, and a `change` event fires whenever `value` changes
 * through user interaction.
 */
class StarRating extends HTMLElement {
  #value = 0;
  #stars;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [shared, styles];
    root.innerHTML = html`
      <div role="radiogroup" aria-label="Your rating">
        ${Array.from({ length: MAX_STARS }, (_, i) => {
          const stars = i + 1;
          return html`<button type="button" role="radio" data-value="${stars}" aria-label="${stars} star${stars > 1 ? 's' : ''}">★</button>`;
        })}
      </div>
    `;
    this.#stars = [...root.querySelectorAll('button')];

    root.addEventListener('click', (event) => {
      const star = event.target.closest('button');
      if (star) this.#select(Number(star.dataset.value));
    });
    root.addEventListener('keydown', (event) => {
      const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      this.#select(Math.min(MAX_STARS, Math.max(1, this.#value + step)));
      this.#stars[this.#value - 1].focus();
    });
    this.#sync();
  }

  get value() {
    return this.#value;
  }

  set value(value) {
    this.#value = Math.min(MAX_STARS, Math.max(0, Math.trunc(Number(value)) || 0));
    this.#sync();
  }

  #select(value) {
    if (value === this.#value) return;
    this.value = value;
    this.dispatchEvent(new Event('change', { bubbles: true }));
  }

  #sync() {
    this.#stars.forEach((star, i) => {
      const stars = i + 1;
      star.classList.toggle('on', stars <= this.#value);
      star.setAttribute('aria-checked', String(stars === this.#value));
      // Roving tabindex: the group is a single tab stop.
      star.tabIndex = stars === (this.#value || 1) ? 0 : -1;
    });
  }
}

customElements.define('star-rating', StarRating);
