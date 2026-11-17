import { store } from '../context.js';
import { html } from '../lib/html.js';
import { css, shared } from './styles.js';

const styles = css`
  dialog {
    width: min(30rem, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
    padding: 0;
    border: 1px solid var(--line);
    border-radius: calc(var(--radius) * 1.2);
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 30px 80px rgb(0 0 0 / 0.6);
  }
  dialog::backdrop {
    background: rgb(5 6 9 / 0.7);
    backdrop-filter: blur(3px);
  }
  .body {
    display: grid;
    gap: 1.5rem;
    padding: 1.5rem;
  }
  .title {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .title h2 {
    font-size: 1.5rem;
  }
  .close {
    width: 2.2rem;
    height: 2.2rem;
    padding: 0;
    font-size: 1.1rem;
  }
  section {
    display: grid;
    gap: 0.7rem;
  }
  section + section {
    padding-top: 1.5rem;
    border-top: 1px solid var(--line);
  }
  h3 {
    font-family: var(--font-body);
    font-size: 0.78rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
  }
  .row .field {
    flex: 1 1 12rem;
    width: auto;
  }
  .hint {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .error:empty {
    display: none;
  }
`;

/**
 * <account-panel> — a modal for the visitor's local account (create, switch,
 * sign out) and the data source (optional TMDB API key). Call `open()`.
 */
class AccountPanel extends HTMLElement {
  #dialog;
  #onStoreChange = ({ detail }) => {
    if (detail.scope === 'session' || detail.scope === 'settings') this.#render();
  };

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [shared, styles];
    root.innerHTML = html`<dialog aria-labelledby="panel-title"><div class="body"></div></dialog>`;
    this.#dialog = root.querySelector('dialog');

    // A click on the backdrop targets the dialog element itself.
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog) this.#dialog.close();
    });
    root.addEventListener('click', (event) => this.#onAction(event.target.closest('[data-action]')));
    root.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#onSubmit(event.target);
    });
  }

  connectedCallback() {
    store.addEventListener('change', this.#onStoreChange);
  }

  disconnectedCallback() {
    store.removeEventListener('change', this.#onStoreChange);
  }

  open() {
    this.#render();
    this.#dialog.showModal();
  }

  #onAction(button) {
    if (!button) return;
    switch (button.dataset.action) {
      case 'close':
        this.#dialog.close();
        break;
      case 'sign-in':
        store.signIn(button.dataset.user);
        break;
      case 'sign-out':
        store.signOut();
        break;
      case 'clear-key':
        store.setTmdbKey('');
        break;
    }
  }

  #onSubmit(form) {
    if (form.dataset.form === 'account') {
      try {
        store.createAccount(form.elements.name.value);
      } catch (error) {
        this.shadowRoot.querySelector('.error').textContent = error.message;
      }
    } else {
      store.setTmdbKey(form.elements.key.value);
    }
  }

  #render() {
    const { currentUser, users, tmdbKey } = store;
    this.#dialog.querySelector('.body').innerHTML = html`
      <div class="title">
        <h2 id="panel-title">Account</h2>
        <button class="btn quiet close" type="button" data-action="close" aria-label="Close">✕</button>
      </div>

      <section>
        <h3>Profile</h3>
        ${currentUser
          ? html`
              <div class="row">
                <p>Signed in as <strong>${currentUser}</strong></p>
                <button class="btn" type="button" data-action="sign-out">Sign out</button>
              </div>
            `
          : html`
              <form class="row" data-form="account" novalidate>
                <input class="field" name="name" maxlength="20" placeholder="Pick a name" aria-label="Account name" autocomplete="nickname" />
                <button class="btn primary" type="submit">Create account</button>
              </form>
              <p class="error" role="alert"></p>
              ${users.length > 0 &&
              html`
                <div class="row">
                  <span class="hint">Or continue as</span>
                  ${users.map(
                    (user) => html`<button class="btn" type="button" data-action="sign-in" data-user="${user}">${user}</button>`,
                  )}
                </div>
              `}
            `}
        <p class="hint">
          Accounts live in this browser only — no password, no server. Each one keeps its own
          watchlist and signs its reviews.
        </p>
      </section>

      <section>
        <h3>Movie data</h3>
        <p>
          ${tmdbKey
            ? html`Browsing <strong>live TMDB data</strong>.`
            : html`Browsing the <strong>bundled demo catalogue</strong>.`}
        </p>
        <form class="row" data-form="tmdb">
          <input class="field" name="key" type="password" value="${tmdbKey}" placeholder="TMDB API key (v3)" aria-label="TMDB API key" autocomplete="off" required />
          <button class="btn primary" type="submit">Save</button>
          ${tmdbKey && html`<button class="btn" type="button" data-action="clear-key">Use demo data</button>`}
        </form>
        <p class="hint">
          Add a free key from
          <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">themoviedb.org</a>
          to browse every release with posters, cast photos and reviews. The key is stored in
          this browser and only ever sent to TMDB.
        </p>
      </section>
    `;
  }
}

customElements.define('account-panel', AccountPanel);
