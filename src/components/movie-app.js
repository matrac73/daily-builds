import { store } from '../context.js';
import { html } from '../lib/html.js';
import { parseRoute, routeToHash } from '../lib/router.js';
import './account-panel.js';
import './movie-browser.js';
import './movie-details.js';
import { css, shared } from './styles.js';
import './watchlist-view.js';

const APP_TITLE = 'Marquee — find your next movie';
const SEARCH_DELAY_MS = 250;

const styles = css`
  :host {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  header {
    position: sticky;
    top: 0;
    z-index: 10;
    border-bottom: 1px solid var(--line);
    background: rgb(13 15 20 / 0.86);
    backdrop-filter: blur(14px);
  }
  .bar,
  main,
  footer {
    width: 100%;
    max-width: var(--page-width);
    margin: 0 auto;
    padding-inline: var(--page-gutter);
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 1.25rem;
    padding-block: 0.75rem;
  }
  .brand {
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    color: var(--text);
    text-decoration: none;
  }
  .brand span {
    color: var(--accent);
  }
  .search {
    flex: 1 1 14rem;
    max-width: 26rem;
  }
  .search .field {
    border-radius: 999px;
    background: var(--surface);
  }
  nav {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: auto;
  }
  nav a {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.8rem;
    border-radius: 999px;
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--muted);
    text-decoration: none;
  }
  nav a:hover,
  nav a[aria-current='page'] {
    color: var(--text);
  }
  nav a[aria-current='page'] {
    background: var(--surface-2);
  }
  .count {
    min-width: 1.35rem;
    padding: 0 0.35rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 0.75rem;
    text-align: center;
  }
  .account {
    max-width: 11rem;
    padding-block: 0.45rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }
  main {
    flex: 1;
    padding-block: clamp(1.25rem, 3vw, 2rem) 3rem;
  }
  footer {
    padding-block: 1.5rem 2rem;
    border-top: 1px solid var(--line);
    font-size: 0.8rem;
    color: var(--muted);
  }
  @media (max-width: 640px) {
    .search {
      order: 3;
      flex-basis: 100%;
      max-width: none;
    }
  }
`;

/**
 * <movie-app> — the application shell: header with search and navigation,
 * a hash-routed outlet, and the account panel.
 */
class MovieApp extends HTMLElement {
  #main;
  #search;
  #panel;
  #browser = null; // kept alive so going back restores the loaded list
  #browserScroll = 0;
  #searchTimer = 0;
  #onHashChange = () => this.#navigate();
  #onStoreChange = ({ detail }) => {
    this.#renderSession();
    if (detail.scope === 'settings') {
      // The data source changed: every loaded list and page is stale.
      this.#browser = null;
      this.#navigate();
    }
  };

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [shared, styles];
    root.innerHTML = html`
      <header>
        <div class="bar">
          <a class="brand" href="#/">Marquee<span>.</span></a>
          <form class="search" role="search">
            <input class="field" type="search" placeholder="Search titles, cast, genres…" aria-label="Search movies" />
          </form>
          <nav aria-label="Main">
            <a href="#/" data-route="home">Browse</a>
            <a href="#/watchlist" data-route="watchlist">Watchlist <span class="count"></span></a>
            <button class="btn account" type="button"></button>
          </nav>
        </div>
      </header>
      <main></main>
      <footer>
        Marquee is a no-build Web Components demo. Live mode uses the TMDB API but is not endorsed
        or certified by TMDB.
      </footer>
      <account-panel></account-panel>
    `;
    this.#main = root.querySelector('main');
    this.#search = root.querySelector('input[type="search"]');
    this.#panel = root.querySelector('account-panel');

    root.querySelector('.search').addEventListener('submit', (event) => {
      event.preventDefault();
      this.#applySearch();
    });
    this.#search.addEventListener('input', () => {
      clearTimeout(this.#searchTimer);
      this.#searchTimer = setTimeout(() => this.#applySearch(), SEARCH_DELAY_MS);
    });
    root.querySelector('.account').addEventListener('click', () => this.#panel.open());
    root.addEventListener('open-account', () => this.#panel.open());
  }

  connectedCallback() {
    history.scrollRestoration = 'manual';
    window.addEventListener('hashchange', this.#onHashChange);
    store.addEventListener('change', this.#onStoreChange);
    this.#renderSession();
    this.#navigate();
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this.#onHashChange);
    store.removeEventListener('change', this.#onStoreChange);
    clearTimeout(this.#searchTimer);
  }

  #applySearch() {
    clearTimeout(this.#searchTimer);
    const hash = routeToHash({ name: 'home', query: this.#search.value });
    if (hash === (location.hash || '#/')) return;
    // Refining a search replaces the history entry so Back leaves the search
    // instead of replaying every keystroke.
    if (parseRoute(location.hash).name === 'home') location.replace(hash);
    else location.hash = hash;
  }

  #renderSession() {
    const count = store.watchlist.length;
    const badge = this.shadowRoot.querySelector('.count');
    badge.textContent = count;
    badge.hidden = count === 0;
    const account = this.shadowRoot.querySelector('.account');
    account.textContent = store.currentUser ?? 'Sign in';
    account.title = store.currentUser ? `Signed in as ${store.currentUser}` : 'Create an account or sign in';
  }

  #navigate() {
    const route = parseRoute(location.hash);
    for (const link of this.shadowRoot.querySelectorAll('nav a')) {
      if (link.dataset.route === route.name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    const searching = this.shadowRoot.activeElement === this.#search;
    const showingBrowser = this.#browser !== null && this.#main.firstElementChild === this.#browser;

    if (route.name === 'home') {
      const resume = !showingBrowser && this.#browser?.query === route.query;
      this.#browser ??= document.createElement('movie-browser');
      this.#browser.query = route.query;
      if (!showingBrowser) {
        this.#main.replaceChildren(this.#browser);
        window.scrollTo(0, resume ? this.#browserScroll : 0);
      }
      if (!searching) this.#search.value = route.query;
      document.title = route.query ? `“${route.query}” · Marquee` : APP_TITLE;
      return;
    }

    if (showingBrowser) this.#browserScroll = window.scrollY;
    if (!searching) this.#search.value = '';
    document.title = route.name === 'watchlist' ? 'Watchlist · Marquee' : APP_TITLE;
    this.#main.replaceChildren(this.#createView(route));
    window.scrollTo(0, 0);
  }

  #createView(route) {
    if (route.name === 'movie') {
      const details = document.createElement('movie-details');
      details.movieId = route.id;
      return details;
    }
    if (route.name === 'watchlist') return document.createElement('watchlist-view');

    const missing = document.createElement('div');
    missing.className = 'state';
    missing.innerHTML = html`
      <h2>Page not found</h2>
      <p>This reel seems to be missing.</p>
      <a class="btn primary" href="#/">Back to the movies</a>
    `;
    return missing;
  }
}

customElements.define('movie-app', MovieApp);
