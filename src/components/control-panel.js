import { pluralize } from '../format.js';
import { panelStyles } from './panel-styles.js';

const BUTTONS = [
  { action: 'load', label: 'Load DB' },
  { action: 'query', label: 'Query DB' },
  { action: 'clear', label: 'Clear DB' },
];

const styles = new CSSStyleSheet();
styles.replaceSync(`
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    padding: 1rem;
  }
  button {
    flex: 1 1 7rem;
    padding: 0.65rem 1rem;
    font: inherit;
    font-weight: 600;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
    transition: background 120ms, border-color 120ms, opacity 120ms;
  }
  button[data-action="load"] {
    color: var(--on-accent);
    background: var(--accent);
    border-color: var(--accent);
  }
  button[data-action="clear"] {
    color: var(--danger);
  }
  button:hover:not(:disabled) {
    border-color: var(--accent);
    filter: brightness(1.08);
  }
  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`);

/**
 * `<control-panel>` — the Load / Query / Clear buttons.
 *
 * Fires a bubbling `db-action` event whose `detail.action` is `load`, `query`
 * or `clear`. Buttons start disabled until `states` is assigned.
 */
class ControlPanel extends HTMLElement {
  #buttons = new Map();
  #meta;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [panelStyles, styles];
    root.innerHTML = `
      <section class="panel">
        <header><h2>Control panel</h2><span class="meta"></span></header>
        <div class="buttons"></div>
      </section>`;
    this.#meta = root.querySelector('.meta');

    const container = root.querySelector('.buttons');
    for (const { action, label } of BUTTONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = action;
      button.textContent = label;
      button.disabled = true;
      button.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('db-action', { detail: { action }, bubbles: true }));
      });
      this.#buttons.set(action, button);
      container.append(button);
    }
  }

  /** @param {{ load: boolean, query: boolean, clear: boolean }} states `true` = enabled */
  set states(states) {
    for (const [action, button] of this.#buttons) {
      button.disabled = !states[action];
    }
  }

  /** @param {number} count Rows currently stored, shown next to the title */
  set rowCount(count) {
    this.#meta.textContent = `${pluralize(count, 'row')} stored`;
  }
}

customElements.define('control-panel', ControlPanel);
