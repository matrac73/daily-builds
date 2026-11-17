import { store } from '../context.js';
import { html, raw } from '../lib/html.js';
import { css, shared } from './styles.js';

const BOOKMARK = raw(
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
);

const styles = css`
  :host {
    display: inline-block;
  }
  svg {
    fill: none;
  }
  [aria-pressed='true'] svg {
    fill: currentColor;
  }
  [aria-pressed='true'] {
    color: var(--accent);
    border-color: var(--accent);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 1px solid rgb(255 255 255 / 0.25);
    border-radius: 50%;
    background: rgb(13 15 20 / 0.72);
    backdrop-filter: blur(6px);
    cursor: pointer;
    transition: transform 0.15s, border-color 0.15s;
  }
  .icon:hover {
    transform: scale(1.1);
    border-color: var(--accent);
  }
`;

/**
 * <watchlist-button> — toggles its `movie` in the current user's watchlist.
 * `variant="icon"` renders the compact round button used on cards.
 */
class WatchlistButton extends HTMLElement {
  #movie = null;
  #onStoreChange = ({ detail }) => {
    if (detail.scope === 'watchlist' || detail.scope === 'session') this.#render();
  };

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).adoptedStyleSheets = [shared, styles];
    this.shadowRoot.addEventListener('click', () => {
      if (this.#movie) store.toggleWatchlist(this.#movie);
    });
  }

  set movie(movie) {
    this.#movie = movie;
    this.#render();
  }

  connectedCallback() {
    store.addEventListener('change', this.#onStoreChange);
    this.#render();
  }

  disconnectedCallback() {
    store.removeEventListener('change', this.#onStoreChange);
  }

  #render() {
    if (!this.#movie) return;
    const saved = store.isInWatchlist(this.#movie.id);
    const label = saved ? 'Remove from watchlist' : 'Add to watchlist';
    this.shadowRoot.innerHTML =
      this.getAttribute('variant') === 'icon'
        ? html`<button class="icon" type="button" aria-pressed="${saved}" aria-label="${label}" title="${label}">
            ${BOOKMARK}
          </button>`
        : html`<button class="btn" type="button" aria-pressed="${saved}">
            ${BOOKMARK} ${saved ? 'In your watchlist' : 'Add to watchlist'}
          </button>`;
  }
}

customElements.define('watchlist-button', WatchlistButton);
