import { catalog } from '../context.js';
import { CatalogError } from '../lib/errors.js';
import { html } from '../lib/html.js';
import {
  formatDate,
  formatRating,
  formatRuntime,
  initials,
  ratingPercent,
  ratingTier,
  releaseYear,
} from '../lib/movies.js';
import { posterPalette } from '../lib/poster.js';
import './movie-poster.js';
import './movie-reviews.js';
import { css, shared } from './styles.js';
import './watchlist-button.js';

const styles = css`
  :host {
    display: block;
  }
  .back {
    display: inline-block;
    margin-bottom: 1.25rem;
    font-size: 0.9rem;
    color: var(--muted);
    text-decoration: none;
  }
  .back:hover {
    color: var(--accent);
  }

  .top {
    position: relative;
    display: grid;
    grid-template-columns: minmax(150px, 260px) 1fr;
    gap: clamp(1.25rem, 4vw, 2.5rem);
    align-items: end;
    padding: clamp(1.25rem, 4vw, 2.5rem);
    border-radius: calc(var(--radius) * 1.4);
    overflow: hidden;
    background: linear-gradient(var(--angle), var(--from), var(--to));
  }
  .backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .top::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgb(13 15 20 / 0.96), rgb(13 15 20 / 0.72));
  }
  .top > movie-poster,
  .info {
    position: relative;
    z-index: 1;
  }
  movie-poster {
    box-shadow: 0 18px 40px rgb(0 0 0 / 0.55);
  }
  .info {
    display: grid;
    gap: 0.9rem;
    min-width: 0;
  }
  h1 {
    font-size: clamp(1.8rem, 5vw, 3rem);
    text-wrap: balance;
  }
  h1 span {
    font-weight: 400;
    color: var(--muted);
  }
  .tagline {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.1rem;
    color: #d5d9e6;
  }
  .genres {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .genres li {
    padding: 0.15rem 0.7rem;
    border: 1px solid rgb(255 255 255 / 0.22);
    border-radius: 999px;
    font-size: 0.8rem;
  }

  .stats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem 1.75rem;
  }
  .score {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .ring {
    display: grid;
    place-items: center;
    width: 4.25rem;
    aspect-ratio: 1;
    border-radius: 50%;
    background:
      radial-gradient(closest-side, #12141b 80%, transparent 82%),
      conic-gradient(var(--tier, var(--muted)) calc(var(--pct) * 1%), rgb(255 255 255 / 0.14) 0);
    font-weight: 700;
    font-size: 1.15rem;
  }
  .ring.high {
    --tier: var(--good);
  }
  .ring.mid {
    --tier: var(--accent);
  }
  .ring.low {
    --tier: var(--danger);
  }
  .ring small {
    font-size: 0.6em;
  }
  .score-label {
    font-size: 0.85rem;
    line-height: 1.3;
    color: var(--muted);
  }
  .score-label strong {
    display: block;
    font-size: 0.95rem;
    color: var(--text);
  }
  dl {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.75rem;
    margin: 0;
  }
  dt {
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  dd {
    margin: 0;
    font-weight: 600;
  }

  section,
  movie-reviews {
    margin-top: 2.5rem;
  }
  section h2 {
    margin-bottom: 0.9rem;
    font-size: 1.5rem;
  }
  .overview {
    max-width: 46rem;
    font-size: 1.05rem;
    color: #d5d9e6;
  }

  .cast {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(215px, 1fr));
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .cast li {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-width: 0;
    padding: 0.65rem 0.8rem;
    border-radius: var(--radius);
    background: var(--surface);
  }
  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    overflow: hidden;
    background: var(--surface-2);
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--accent);
  }
  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .cast .name {
    font-weight: 600;
  }
  .cast .role {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .loading {
    height: 60vh;
    border-radius: calc(var(--radius) * 1.4);
    background: var(--surface);
  }

  @media (max-width: 620px) {
    .top {
      grid-template-columns: 1fr;
      align-items: start;
    }
    .top > movie-poster {
      width: min(60%, 220px);
    }
  }
`;

/** <movie-details> — the page of the movie identified by `movieId`. */
class MovieDetails extends HTMLElement {
  #movieId = null;
  #request = 0;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [shared, styles];
    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="retry"]')) this.#load();
    });
  }

  set movieId(id) {
    this.#movieId = id;
    this.#load();
  }

  async #load() {
    const request = (this.#request += 1);
    this.shadowRoot.innerHTML = html`<div class="loading" role="status" aria-label="Loading movie"></div>`;
    try {
      const movie = await catalog.get(this.#movieId);
      if (request === this.#request) this.#render(movie);
    } catch (error) {
      if (request === this.#request) this.#renderError(error);
    }
  }

  #render(movie) {
    const { from, to, angle } = posterPalette(movie.title);
    const year = releaseYear(movie);
    const facts = [
      ['Released', formatDate(movie.releaseDate)],
      ['Runtime', formatRuntime(movie.runtime)],
      ['Directed by', (movie.directors ?? []).join(', ')],
    ].filter(([, value]) => value);
    const votes = movie.voteCount ? `${movie.voteCount.toLocaleString('en')} votes` : 'Community score';

    this.shadowRoot.innerHTML = html`
      <a class="back" href="#/">← All movies</a>
      <article>
        <div class="top" style="--from:${from};--to:${to};--angle:${angle}deg">
          ${movie.backdropUrl && html`<img class="backdrop" src="${movie.backdropUrl}" alt="" />`}
          <movie-poster></movie-poster>
          <div class="info">
            <h1>${movie.title} ${year && html`<span>(${year})</span>`}</h1>
            ${movie.tagline && html`<p class="tagline">${movie.tagline}</p>`}
            <ul class="genres" aria-label="Genres">
              ${(movie.genres ?? []).map((genre) => html`<li>${genre}</li>`)}
            </ul>
            <div class="stats">
              <div class="score">
                <div
                  class="ring ${ratingTier(movie.rating)}"
                  style="--pct:${ratingPercent(movie.rating)}"
                  role="img"
                  aria-label="Rated ${formatRating(movie.rating)} out of 10"
                >
                  ${movie.rating > 0 ? html`<span>${ratingPercent(movie.rating)}<small>%</small></span>` : 'NR'}
                </div>
                <p class="score-label"><strong>${formatRating(movie.rating)} / 10</strong>${votes}</p>
              </div>
              <dl>
                ${facts.map(([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`)}
              </dl>
            </div>
            <div><watchlist-button></watchlist-button></div>
          </div>
        </div>

        <section>
          <h2>About</h2>
          <p class="overview">${movie.overview || 'No synopsis is available for this movie yet.'}</p>
        </section>

        ${movie.cast?.length > 0 &&
        html`
          <section>
            <h2>Cast</h2>
            <ul class="cast">
              ${movie.cast.map(
                (member) => html`
                  <li>
                    <span class="avatar" aria-hidden="true">
                      ${member.photoUrl
                        ? html`<img src="${member.photoUrl}" alt="" loading="lazy" />`
                        : initials(member.name)}
                    </span>
                    <div>
                      <div class="name">${member.name}</div>
                      <div class="role">${member.character}</div>
                    </div>
                  </li>
                `,
              )}
            </ul>
          </section>
        `}

        <movie-reviews></movie-reviews>
      </article>
    `;

    this.shadowRoot.querySelector('movie-poster').movie = movie;
    this.shadowRoot.querySelector('watchlist-button').movie = movie;
    const reviews = this.shadowRoot.querySelector('movie-reviews');
    reviews.external = movie.reviews;
    reviews.movieId = movie.id;
    document.title = `${movie.title}${year && ` (${year})`} · Marquee`;
  }

  #renderError(error) {
    const expected = error instanceof CatalogError;
    this.shadowRoot.innerHTML = html`
      <a class="back" href="#/">← All movies</a>
      <div class="state" role="alert">
        <h2>${expected && error.code === 'not-found' ? 'Movie not found' : "Couldn't open this movie"}</h2>
        <p>${expected ? error.message : 'Something went wrong while loading this movie.'}</p>
        ${(!expected || error.code === 'network') &&
        html`<button class="btn" type="button" data-action="retry">Try again</button>`}
      </div>
    `;
  }
}

customElements.define('movie-details', MovieDetails);
