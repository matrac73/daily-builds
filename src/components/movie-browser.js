import { catalog } from '../context.js';
import { CatalogError } from '../lib/errors.js';
import { html } from '../lib/html.js';
import { formatDate, formatRating, releaseYear, truncate } from '../lib/movies.js';
import { posterPalette } from '../lib/poster.js';
import { routeToHash } from '../lib/router.js';
import './movie-card.js';
import { css, shared } from './styles.js';
import './watchlist-button.js';

const styles = css`
  :host {
    display: block;
  }
  .hero {
    position: relative;
    display: flex;
    align-items: flex-end;
    min-height: clamp(300px, 46vh, 440px);
    margin-bottom: 2.5rem;
    border-radius: calc(var(--radius) * 1.4);
    overflow: hidden;
    background: linear-gradient(var(--angle), var(--from), var(--to));
  }
  .hero img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .hero::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgb(13 15 20 / 0.95) 5%, rgb(13 15 20 / 0.45) 55%, transparent);
  }
  .hero-body {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 0.7rem;
    max-width: 44rem;
    padding: clamp(1.25rem, 4vw, 2.5rem);
  }
  .eyebrow {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .hero h2 {
    font-size: clamp(1.9rem, 5vw, 3.2rem);
    text-wrap: balance;
  }
  .hero .meta {
    color: var(--muted);
    font-size: 0.92rem;
  }
  .hero .overview {
    color: #d5d9e6;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
    margin-top: 0.4rem;
  }

  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.4rem 1rem;
    margin-bottom: 1.4rem;
  }
  .heading h1 {
    font-size: clamp(1.5rem, 3.5vw, 2rem);
  }
  .heading p {
    font-size: 0.9rem;
    color: var(--muted);
  }
  .source {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .source::before {
    content: '';
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--accent);
  }
  .source.tmdb::before {
    background: var(--good);
  }

  .year {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 0.6rem;
    font-size: 1.25rem;
    color: var(--muted);
  }
  .year:first-child {
    margin-top: 0;
  }
  .year::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }

  .status {
    margin-top: 1.75rem;
  }
  .end {
    padding: 1.5rem 0;
    text-align: center;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .skeleton {
    aspect-ratio: 2 / 3;
    border-radius: var(--radius);
    background: linear-gradient(100deg, var(--surface) 30%, var(--surface-2) 50%, var(--surface) 70%);
    background-size: 300% 100%;
    animation: shimmer 1.4s linear infinite;
  }
  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
    }
  }
`;

const SKELETON_COUNT = 6;

/**
 * <movie-browser> — the front page. Shows the newest release as a hero, then
 * every other movie from newest to oldest, loading the next page whenever the
 * visitor scrolls near the end. Setting `query` switches to search results.
 */
class MovieBrowser extends HTMLElement {
  #query = '';
  #page = 0;
  #totalPages = 1;
  #loading = false;
  #started = false;
  #lastYear = null;
  #request = 0; // bumped on every reset so stale responses can be dropped
  #observer = null;
  #hero;
  #heading;
  #grid;
  #status;
  #sentinel;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [shared, styles];
    root.innerHTML = html`
      <section class="hero" hidden></section>
      <header class="heading"></header>
      <div class="grid"></div>
      <div class="status" aria-live="polite"></div>
      <div class="sentinel" aria-hidden="true"></div>
    `;
    this.#hero = root.querySelector('.hero');
    this.#heading = root.querySelector('.heading');
    this.#grid = root.querySelector('.grid');
    this.#status = root.querySelector('.status');
    this.#sentinel = root.querySelector('.sentinel');
    this.#status.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="retry"]')) this.#loadNext();
    });
  }

  get query() {
    return this.#query;
  }

  set query(value) {
    const query = String(value ?? '').trim();
    if (query === this.#query) return;
    this.#query = query;
    if (this.#started) this.#reset();
  }

  connectedCallback() {
    this.#observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) this.#loadNext();
      },
      { rootMargin: '600px 0px' },
    );
    this.#observer.observe(this.#sentinel);
    if (!this.#started) {
      this.#started = true;
      this.#reset();
    }
  }

  disconnectedCallback() {
    this.#observer.disconnect();
    this.#observer = null;
  }

  #reset() {
    this.#request += 1;
    this.#page = 0;
    this.#totalPages = 1;
    this.#loading = false;
    this.#lastYear = null;
    this.#hero.hidden = true;
    this.#grid.replaceChildren();
    this.#renderHeading();
    this.#loadNext();
  }

  #renderHeading() {
    const live = catalog.source === 'tmdb';
    this.#heading.innerHTML = html`
      <div>
        <h1>${this.#query ? html`Results for “${this.#query}”` : 'Latest releases'}</h1>
        ${!this.#query && html`<p>Newest first — keep scrolling to travel back in time.</p>`}
      </div>
      <span class="source ${live ? 'tmdb' : 'demo'}">${live ? 'Live from TMDB' : 'Demo catalogue'}</span>
    `;
  }

  async #loadNext() {
    if (this.#loading || this.#page >= this.#totalPages) return;
    this.#loading = true;
    const request = this.#request;
    this.#status.innerHTML = html`
      <div class="grid" aria-label="Loading movies">
        ${Array.from({ length: SKELETON_COUNT }, () => html`<div class="skeleton"></div>`)}
      </div>
    `;

    let result;
    try {
      result = await catalog.list({ page: this.#page + 1, query: this.#query });
    } catch (error) {
      if (request !== this.#request) return;
      this.#loading = false;
      this.#renderError(error);
      return;
    }
    if (request !== this.#request) return;

    this.#loading = false;
    this.#page = result.page;
    this.#totalPages = result.totalPages;
    this.#append(result.items);
    this.#renderProgress();
    this.#rearmObserver();
  }

  #append(movies) {
    let rest = movies;
    if (this.#page === 1 && !this.#query && movies.length > 0) {
      this.#renderHero(movies[0]);
      rest = movies.slice(1);
    }
    for (const movie of rest) {
      // Search results come back by relevance, so year dividers only make
      // sense for the chronological front page.
      const year = releaseYear(movie);
      if (!this.#query && year && year !== this.#lastYear) {
        this.#lastYear = year;
        const divider = document.createElement('h2');
        divider.className = 'year';
        divider.textContent = year;
        this.#grid.append(divider);
      }
      const card = document.createElement('movie-card');
      card.movie = movie;
      this.#grid.append(card);
    }
  }

  #renderHero(movie) {
    const { from, to, angle } = posterPalette(movie.title);
    const meta = [formatDate(movie.releaseDate), ...(movie.genres ?? []).slice(0, 3), `★ ${formatRating(movie.rating)}`];
    this.#hero.style.cssText = `--from:${from};--to:${to};--angle:${angle}deg`;
    this.#hero.innerHTML = html`
      ${movie.backdropUrl && html`<img src="${movie.backdropUrl}" alt="" />`}
      <div class="hero-body">
        <span class="eyebrow">Latest release</span>
        <h2>${movie.title}</h2>
        <p class="meta">${meta.filter(Boolean).join(' · ')}</p>
        <p class="overview">${truncate(movie.overview ?? '', 260)}</p>
        <div class="actions">
          <a class="btn primary" href="${routeToHash({ name: 'movie', id: movie.id })}">View details</a>
          <watchlist-button></watchlist-button>
        </div>
      </div>
    `;
    this.#hero.querySelector('watchlist-button').movie = movie;
    this.#hero.hidden = false;
  }

  #renderProgress() {
    const empty = this.#hero.hidden && this.#grid.childElementCount === 0;
    if (empty) {
      this.#status.innerHTML = html`
        <div class="state">
          <h2>No movies found</h2>
          <p>${this.#query ? `Nothing matches “${this.#query}”. Try a title, an actor or a genre.` : 'The catalogue is empty.'}</p>
        </div>
      `;
    } else if (this.#page >= this.#totalPages) {
      this.#status.innerHTML = html`<p class="end">That's everything — you've reached the end of the reel.</p>`;
    } else {
      this.#status.replaceChildren();
    }
  }

  #renderError(error) {
    const message = error instanceof CatalogError ? error.message : 'Something went wrong while loading movies.';
    this.#status.innerHTML = html`
      <div class="state" role="alert">
        <h2>Couldn't load movies</h2>
        <p>${message}</p>
        <button class="btn" type="button" data-action="retry">Try again</button>
      </div>
    `;
  }

  /**
   * An observer only fires when intersection changes. If the sentinel is still
   * in range after a page was appended (tall screens, short pages), observing
   * it again forces a fresh callback so the next page loads.
   */
  #rearmObserver() {
    this.#observer?.unobserve(this.#sentinel);
    this.#observer?.observe(this.#sentinel);
  }
}

customElements.define('movie-browser', MovieBrowser);
