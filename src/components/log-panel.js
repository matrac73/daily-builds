import { formatTime, pluralize } from '../format.js';
import { panelStyles } from './panel-styles.js';

const styles = new CSSStyleSheet();
styles.replaceSync(`
  ol {
    margin: 0;
    padding: 0.5rem 0;
    list-style: none;
    font-family: var(--mono);
    font-size: 0.8rem;
    line-height: 1.5;
  }
  li {
    display: flex;
    gap: 0.75rem;
    padding: 0.1rem 1rem;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  time {
    flex: none;
    opacity: 0.7;
  }
  li:not([data-kind="detail"]) {
    color: var(--text);
    font-weight: 600;
  }
  li[data-kind="detail"] span {
    padding-left: 1rem;
  }
  li[data-kind="success"] span { color: var(--success); }
  li[data-kind="error"] span { color: var(--danger); }
`);

/**
 * `<log-panel>` — scrollable, append-only execution log.
 *
 * Entries are either notifications (`info`, `success`, `error`), which form
 * the running notification history, or indented `detail` lines.
 */
class LogPanel extends HTMLElement {
  #list;
  #scroll;
  #meta;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [panelStyles, styles];
    root.innerHTML = `
      <section class="panel">
        <header><h2>Log</h2><span class="meta"></span></header>
        <div class="scroll" tabindex="0" role="log" aria-label="Execution log"><ol></ol></div>
      </section>`;
    this.#list = root.querySelector('ol');
    this.#scroll = root.querySelector('.scroll');
    this.#meta = root.querySelector('.meta');
  }

  /**
   * @param {string} message
   * @param {'info' | 'success' | 'error' | 'detail'} [kind]
   */
  add(message, kind = 'detail') {
    const now = new Date();
    const item = document.createElement('li');
    item.dataset.kind = kind;

    const time = document.createElement('time');
    time.dateTime = now.toISOString();
    time.textContent = formatTime(now);

    const text = document.createElement('span');
    text.textContent = message;

    item.append(time, text);
    this.#list.append(item);
    this.#meta.textContent = pluralize(this.#list.childElementCount, 'line');
    this.#scroll.scrollTop = this.#scroll.scrollHeight;
  }
}

customElements.define('log-panel', LogPanel);
