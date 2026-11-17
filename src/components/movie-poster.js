import { html } from '../lib/html.js';
import { releaseYear } from '../lib/movies.js';
import { posterPalette } from '../lib/poster.js';
import { css, shared } from './styles.js';

const styles = css`
  :host {
    display: block;
    aspect-ratio: 2 / 3;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--surface-2);
    container-type: inline-size;
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .art {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 0.3em;
    height: 100%;
    padding: 9cqi;
    background: linear-gradient(var(--angle), var(--from), var(--to));
    overflow: hidden;
  }
  .initial {
    position: absolute;
    top: -0.22em;
    right: -0.04em;
    font-family: var(--font-display);
    font-size: 78cqi;
    font-weight: 700;
    line-height: 1;
    color: rgb(255 255 255 / 0.09);
  }
  .title {
    position: relative;
    font-family: var(--font-display);
    font-size: clamp(0.85rem, 10.5cqi, 2rem);
    font-weight: 700;
    line-height: 1.1;
    overflow-wrap: anywhere;
    text-wrap: balance;
  }
  .year {
    position: relative;
    font-size: clamp(0.65rem, 6cqi, 1rem);
    letter-spacing: 0.14em;
    color: rgb(255 255 255 / 0.7);
  }
`;

/**
 * <movie-poster> — shows a movie's artwork, or draws a typographic poster
 * from a title-derived palette when there is none (or it fails to load).
 */
class MoviePoster extends HTMLElement {
  #movie = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).adoptedStyleSheets = [shared, styles];
  }

  set movie(movie) {
    this.#movie = movie;
    if (movie.posterUrl) this.#renderImage();
    else this.#renderArt();
  }

  #renderImage() {
    const { posterUrl, title } = this.#movie;
    this.shadowRoot.innerHTML = html`<img src="${posterUrl}" alt="Poster of ${title}" loading="lazy" />`;
    this.shadowRoot.querySelector('img').addEventListener('error', () => this.#renderArt());
  }

  #renderArt() {
    const { title } = this.#movie;
    const { from, to, angle } = posterPalette(title);
    this.shadowRoot.innerHTML = html`
      <div
        class="art"
        role="img"
        aria-label="Poster of ${title}"
        style="--from:${from};--to:${to};--angle:${angle}deg"
      >
        <span class="initial" aria-hidden="true">${[...title][0]}</span>
        <span class="title">${title}</span>
        <span class="year">${releaseYear(this.#movie)}</span>
      </div>
    `;
  }
}

customElements.define('movie-poster', MoviePoster);
