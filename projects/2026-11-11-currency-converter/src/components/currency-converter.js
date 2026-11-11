import {
  AmountError,
  MAX_DIGITS,
  convert,
  formatAmount,
  formatRate,
  listCurrencies,
  parseAmount,
} from '../converter.js';
import { loadRates } from '../rates.js';

const ERROR_MESSAGES = {
  [AmountError.NOT_A_NUMBER]: 'Please enter a number — digits only, with an optional decimal point.',
  [AmountError.TOO_MANY_DIGITS]: `Please enter at most ${MAX_DIGITS} digits.`,
};

const styles = new CSSStyleSheet();
styles.replaceSync(`
  :host {
    display: block;
    color: var(--text);
  }

  * { box-sizing: border-box; }

  form {
    display: grid;
    gap: 1.25rem;
    padding: clamp(1.25rem, 5vw, 2rem);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1.25rem;
    box-shadow: var(--shadow);
  }

  .field { display: grid; gap: 0.4rem; min-width: 0; }

  label {
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }

  input, select {
    width: 100%;
    padding: 0.75rem 0.9rem;
    font: inherit;
    color: inherit;
    background: var(--field);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  input { font-size: 1.5rem; font-variant-numeric: tabular-nums; }

  input:focus-visible, select:focus-visible, button:focus-visible {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  input[aria-invalid="true"] {
    border-color: var(--danger);
    box-shadow: 0 0 0 3px var(--danger-soft);
  }

  .currencies {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 0.75rem;
    align-items: end;
  }

  button {
    width: 2.9rem;
    height: 2.9rem;
    display: grid;
    place-items: center;
    color: var(--accent);
    background: var(--accent-soft);
    border: 1px solid transparent;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.2s, background 0.15s;
  }

  button:hover { transform: rotate(180deg); }
  button svg { width: 1.2rem; height: 1.2rem; }

  .error {
    margin: -0.6rem 0 0;
    font-size: 0.9rem;
    color: var(--danger);
  }

  .error:empty { display: none; }

  .result {
    display: grid;
    gap: 0.25rem;
    padding: 1.1rem 1.25rem;
    background: var(--accent-soft);
    border-radius: 1rem;
  }

  .result .source, .result .rate { font-size: 0.9rem; color: var(--muted); }

  output {
    font-size: clamp(1.6rem, 7vw, 2.4rem);
    font-weight: 700;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .status {
    margin: 0;
    font-size: 0.8rem;
    color: var(--muted);
    text-align: center;
  }

  .status::before {
    content: '';
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    margin-right: 0.4rem;
    border-radius: 50%;
    background: var(--muted);
  }

  .status[data-state="live"]::before { background: var(--ok); }
  .status[data-state="offline"]::before { background: var(--warn); }

  @media (max-width: 26rem) {
    .currencies { grid-template-columns: 1fr; }
    button { justify-self: center; transform: rotate(90deg); }
    button:hover { transform: rotate(270deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    button, input, select { transition: none; }
  }
`);

const template = document.createElement('template');
template.innerHTML = `
  <form novalidate>
    <div class="field">
      <label for="amount">Amount</label>
      <input id="amount" type="text" inputmode="decimal" autocomplete="off"
             maxlength="${MAX_DIGITS + 1}" aria-describedby="error" />
    </div>
    <p class="error" id="error" role="alert"></p>

    <div class="currencies">
      <div class="field">
        <label for="from">From</label>
        <select id="from" disabled></select>
      </div>
      <button type="button" id="swap" title="Swap currencies" aria-label="Swap currencies" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
        </svg>
      </button>
      <div class="field">
        <label for="to">To</label>
        <select id="to" disabled></select>
      </div>
    </div>

    <div class="result" aria-live="polite">
      <span class="source" id="source">&nbsp;</span>
      <output id="output" for="amount from to">—</output>
      <span class="rate" id="rate">&nbsp;</span>
    </div>

    <p class="status" id="status" data-state="loading">Loading exchange rates…</p>
  </form>
`;

/**
 * <currency-converter amount="100" from="USD" to="EUR"></currency-converter>
 *
 * Converts as you type. The optional attributes set the initial values.
 */
class CurrencyConverter extends HTMLElement {
  #rates = null;
  #started = false;
  #el = {};

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [styles];
    root.append(template.content.cloneNode(true));
    for (const id of ['amount', 'error', 'from', 'to', 'swap', 'source', 'output', 'rate', 'status']) {
      this.#el[id] = root.getElementById(id);
    }

    const { amount, from, to, swap } = this.#el;
    root.querySelector('form').addEventListener('submit', (event) => event.preventDefault());
    amount.addEventListener('input', () => this.#render());
    from.addEventListener('change', () => this.#render());
    to.addEventListener('change', () => this.#render());
    swap.addEventListener('click', () => this.#swap());
  }

  async connectedCallback() {
    if (this.#started) return;
    this.#started = true;
    const { amount, from, to, swap } = this.#el;
    amount.value = this.getAttribute('amount') ?? '1';

    const loaded = await loadRates();
    this.#rates = loaded.rates;
    this.#populate(from, this.getAttribute('from') ?? 'USD');
    this.#populate(to, this.getAttribute('to') ?? 'EUR');
    swap.disabled = false;
    this.#showStatus(loaded);
    this.#render();
  }

  #populate(select, preferred) {
    const options = listCurrencies(this.#rates).map(
      ({ code, name }) => new Option(`${code} — ${name}`, code),
    );
    select.replaceChildren(...options);
    if (preferred in this.#rates) select.value = preferred;
    select.disabled = false;
  }

  #swap() {
    const { from, to } = this.#el;
    [from.value, to.value] = [to.value, from.value];
    this.#render();
  }

  #showStatus({ live, date }) {
    const { status } = this.#el;
    status.dataset.state = live ? 'live' : 'offline';
    status.textContent = live
      ? `ECB reference rates of ${date}, via Frankfurter`
      : `Live rates unavailable — using saved ECB rates of ${date}`;
  }

  #render() {
    if (!this.#rates) return;
    const { amount, error, from, to, source, output, rate } = this.#el;
    const parsed = parseAmount(amount.value);

    error.textContent = parsed.ok ? '' : (ERROR_MESSAGES[parsed.error] ?? '');
    amount.setAttribute('aria-invalid', String(Boolean(error.textContent)));

    const unitRate = convert(1, from.value, to.value, this.#rates);
    rate.textContent = `1 ${from.value} = ${formatRate(unitRate)} ${to.value}`;

    if (!parsed.ok) {
      source.innerHTML = '&nbsp;';
      output.textContent = '—';
      return;
    }
    source.textContent = `${formatAmount(parsed.value)} ${from.value} =`;
    output.textContent = `${formatAmount(convert(parsed.value, from.value, to.value, this.#rates))} ${to.value}`;
  }
}

customElements.define('currency-converter', CurrencyConverter);
