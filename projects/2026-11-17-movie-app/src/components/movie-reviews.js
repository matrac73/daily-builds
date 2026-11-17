import { store } from '../context.js';
import { html } from '../lib/html.js';
import { averageRating, formatDate, truncate } from '../lib/movies.js';
import { MAX_REVIEW_LENGTH } from '../lib/store.js';
import './star-rating.js';
import { css, shared } from './styles.js';

const EXTERNAL_REVIEW_LENGTH = 700;

const styles = css`
  :host {
    display: block;
  }
  h2 {
    font-size: 1.5rem;
  }
  .summary {
    margin: 0.3rem 0 1.25rem;
    color: var(--muted);
  }
  .summary strong {
    color: var(--accent);
  }
  form,
  .prompt {
    display: grid;
    gap: 0.8rem;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .prompt {
    justify-items: start;
  }
  form h3 {
    font-family: var(--font-body);
    font-size: 1rem;
  }
  textarea {
    min-height: 6rem;
    resize: vertical;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  ul {
    display: grid;
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    padding: 1.1rem 1.25rem;
    border-radius: var(--radius);
    background: var(--surface);
  }
  .byline {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.3rem 0.75rem;
    margin-bottom: 0.45rem;
  }
  .author {
    font-weight: 700;
  }
  .stars {
    color: var(--accent);
    letter-spacing: 0.08em;
  }
  .date,
  .tag {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .tag {
    padding: 0 0.5rem;
    border: 1px solid var(--line);
    border-radius: 999px;
  }
  .text {
    white-space: pre-line;
    overflow-wrap: anywhere;
    color: #d5d9e6;
  }
`;

const starText = (rating) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

/**
 * <movie-reviews> — reviews for `movieId`: those written on this device
 * (with a form for the signed-in user) followed by the `external` ones that
 * came with the movie data.
 */
class MovieReviews extends HTMLElement {
  #movieId = null;
  #external = [];
  #onStoreChange = ({ detail }) => {
    if (detail.scope === 'reviews' || detail.scope === 'session') this.#render();
  };

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [shared, styles];
    root.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#submit(event.target);
    });
    root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'delete') store.deleteReview(this.#movieId);
      if (action === 'account') {
        this.dispatchEvent(new CustomEvent('open-account', { bubbles: true, composed: true }));
      }
    });
  }

  set movieId(id) {
    this.#movieId = id;
    this.#render();
  }

  set external(reviews) {
    this.#external = reviews ?? [];
    this.#render();
  }

  connectedCallback() {
    store.addEventListener('change', this.#onStoreChange);
    this.#render();
  }

  disconnectedCallback() {
    store.removeEventListener('change', this.#onStoreChange);
  }

  #submit(form) {
    const error = form.querySelector('.error');
    try {
      store.saveReview(this.#movieId, {
        rating: form.querySelector('star-rating').value,
        text: form.elements.text.value,
      });
    } catch (failure) {
      error.textContent = failure.message;
    }
  }

  #render() {
    if (!this.#movieId || !this.isConnected) return;
    const local = store.reviewsFor(this.#movieId);
    const average = averageRating(local);
    const count = local.length + this.#external.length;

    this.shadowRoot.innerHTML = html`
      <h2>Reviews</h2>
      <p class="summary">
        ${average === null
          ? 'No ratings from this device yet.'
          : html`<strong>★ ${average.toFixed(1)}</strong> / 5 from ${local.length}
              ${local.length === 1 ? 'review' : 'reviews'} on this device.`}
      </p>
      ${this.#renderComposer()}
      ${count === 0
        ? html`<p class="muted">Nobody has reviewed this movie yet. Be the first.</p>`
        : html`<ul>
            ${local.map(
              (review) => html`
                <li>
                  <div class="byline">
                    <span class="author">${review.author}</span>
                    <span class="stars" role="img" aria-label="${review.rating} out of 5 stars">${starText(review.rating)}</span>
                    <span class="date">${formatDate(review.date)}</span>
                  </div>
                  <p class="text">${review.text}</p>
                </li>
              `,
            )}
            ${this.#external.map(
              (review) => html`
                <li>
                  <div class="byline">
                    <span class="author">${review.author}</span>
                    <span class="tag">TMDB</span>
                    <span class="date">${formatDate(review.date)}</span>
                  </div>
                  <p class="text">${truncate(review.text, EXTERNAL_REVIEW_LENGTH)}</p>
                </li>
              `,
            )}
          </ul>`}
    `;

    const own = store.ownReview(this.#movieId);
    const rating = this.shadowRoot.querySelector('star-rating');
    if (rating && own) rating.value = own.rating;
  }

  #renderComposer() {
    if (!store.currentUser) {
      return html`
        <div class="prompt">
          <p>Create a free local account to rate and review this movie.</p>
          <button class="btn primary" type="button" data-action="account">Create an account</button>
        </div>
      `;
    }
    const own = store.ownReview(this.#movieId);
    return html`
      <form novalidate>
        <h3>${own ? 'Edit your review' : 'Write a review'} <span class="muted">as ${store.currentUser}</span></h3>
        <star-rating></star-rating>
        <textarea
          class="field"
          name="text"
          maxlength="${MAX_REVIEW_LENGTH}"
          placeholder="What did you think?"
          aria-label="Your review"
        >${own?.text ?? ''}</textarea>
        <p class="error" role="alert"></p>
        <div class="actions">
          <button class="btn primary" type="submit">${own ? 'Update review' : 'Post review'}</button>
          ${own && html`<button class="btn quiet" type="button" data-action="delete">Delete</button>`}
        </div>
      </form>
    `;
  }
}

customElements.define('movie-reviews', MovieReviews);
