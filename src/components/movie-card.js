import { html } from '../lib/html.js';
import { formatDate, formatRating, ratingTier } from '../lib/movies.js';
import { routeToHash } from '../lib/router.js';
import './movie-poster.js';
import { css, shared } from './styles.js';
import './watchlist-button.js';

const styles = css`
  :host {
    display: block;
    position: relative;
    min-width: 0;
  }
  .poster {
    display: block;
    position: relative;
    border-radius: var(--radius);
    color: var(--text);
    text-decoration: none;
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.35);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  :host(:hover) .poster,
  :host(:focus-within) .poster {
    transform: translateY(-4px);
    box-shadow: 0 14px 30px rgb(0 0 0 / 0.5);
  }
  .rating {
    position: absolute;
    left: 0.5rem;
    bottom: 0.5rem;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: rgb(13 15 20 / 0.82);
    backdrop-filter: blur(6px);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted);
  }
  .rating.high {
    color: var(--good);
  }
  .rating.mid {
    color: var(--accent);
  }
  .rating.low {
    color: var(--danger);
  }
  watchlist-button {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
  }
  h3 {
    margin-top: 0.7rem;
    font-family: var(--font-body);
    font-size: 0.95rem;
    line-height: 1.3;
  }
  h3 a {
    color: inherit;
    text-decoration: none;
  }
  h3 a:hover {
    color: var(--accent);
  }
  .meta {
    margin-top: 0.15rem;
    font-size: 0.8rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @media (prefers-reduced-motion: reduce) {
    .poster {
      transition: none;
    }
  }
`;

/** <movie-card> — poster, title, date and rating of its `movie`, linking to the movie page. */
class MovieCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).adoptedStyleSheets = [shared, styles];
  }

  set movie(movie) {
    const href = routeToHash({ name: 'movie', id: movie.id });
    const meta = [formatDate(movie.releaseDate) || 'Date to be announced', movie.genres?.[0]];
    this.shadowRoot.innerHTML = html`
      <a class="poster" href="${href}" tabindex="-1" aria-hidden="true">
        <movie-poster></movie-poster>
        <span class="rating ${ratingTier(movie.rating)}">★ ${formatRating(movie.rating)}</span>
      </a>
      <watchlist-button variant="icon"></watchlist-button>
      <h3><a href="${href}">${movie.title}</a></h3>
      <p class="meta">${meta.filter(Boolean).join(' · ')}</p>
    `;
    this.shadowRoot.querySelector('movie-poster').movie = movie;
    this.shadowRoot.querySelector('watchlist-button').movie = movie;
  }
}

customElements.define('movie-card', MovieCard);
