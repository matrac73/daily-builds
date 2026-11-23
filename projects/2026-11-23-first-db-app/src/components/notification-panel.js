import { panelStyles } from './panel-styles.js';

const styles = new CSSStyleSheet();
styles.replaceSync(`
  .message {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    margin: 0;
    padding: 1rem;
    font-size: 1.05rem;
  }
  .dot {
    flex: none;
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    background: var(--tone);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--tone) 22%, transparent);
  }
  [data-tone="info"] { --tone: var(--info); }
  [data-tone="success"] { --tone: var(--success); }
  [data-tone="error"] { --tone: var(--danger); }
`);

/** `<notification-panel>` — shows the latest status message. */
class NotificationPanel extends HTMLElement {
  #message;
  #text;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [panelStyles, styles];
    root.innerHTML = `
      <section class="panel">
        <header><h2>Notifications</h2></header>
        <p class="message" role="status" data-tone="info">
          <span class="dot"></span><span class="text"></span>
        </p>
      </section>`;
    this.#message = root.querySelector('.message');
    this.#text = root.querySelector('.text');
  }

  /**
   * @param {string} message
   * @param {'info' | 'success' | 'error'} [tone]
   */
  show(message, tone = 'info') {
    this.#message.dataset.tone = tone;
    this.#text.textContent = message;
  }
}

customElements.define('notification-panel', NotificationPanel);
