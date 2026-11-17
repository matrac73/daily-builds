import { store } from '../context.js';
import { html } from '../lib/html.js';
import './movie-card.js';
import { css, shared } from './styles.js';

const styles = css`
  :host {
    display: block;
  }
  header {
    margin-bottom: 1.5rem;
  }
  h1 {
    font-size: clamp(1.5rem, 3.5vw, 2rem);
  }
  header p {
    margin-top: 0.3rem;
    color: var(--muted);
  }
`;

/** <watchlist-view> — the movies saved by the current user, latest addition first. */
class WatchlistView extends HTMLElement {
  #onStoreChange = ({ detail }) => {
    if (detail.scope === 'watchlist' || detail.scope === 'session') this.#render();
  };

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).adoptedStyleSheets = [shared, styles];
  }

  connectedCallback() {
    store.addEventListener('change', this.#onStoreChange);
    this.#render();
  }

  disconnectedCallback() {
    store.removeEventListener('change', this.#onStoreChange);
  }

  #render() {
    const movies = store.watchlist;
    const owner = store.currentUser ? `${store.currentUser}'s list` : 'saved on this device';
    this.shadowRoot.innerHTML = html`
      <header>
        <h1>Your watchlist</h1>
        <p>${movies.length} ${movies.length === 1 ? 'movie' : 'movies'} · ${owner}</p>
      </header>
      ${movies.length === 0
        ? html`
            <div class="state">
              <h2>Nothing saved yet</h2>
              <p>Tap the bookmark on any movie to keep it here for later.</p>
              <a class="btn primary" href="#/">Browse movies</a>
            </div>
          `
        : html`<div class="grid"></div>`}
    `;
    const grid = this.shadowRoot.querySelector('.grid');
    for (const movie of movies) {
      const card = document.createElement('movie-card');
      card.movie = movie;
      grid.append(card);
    }
  }
}

customElements.define('watchlist-view', WatchlistView);
