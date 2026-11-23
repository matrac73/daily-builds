import { formatCurrency, formatDate, pluralize, sumSales } from '../format.js';
import { panelStyles } from './panel-styles.js';

const COLUMNS = [
  { header: 'User ID', cell: (row) => row.userid },
  { header: 'Name', cell: (row) => row.name },
  { header: 'Email', cell: (row) => row.email },
  { header: 'Last order', cell: (row) => formatDate(row.lastOrderDate) },
  { header: 'Total sales (YTD)', cell: (row) => formatCurrency(row.totalSales), numeric: true },
];

const styles = new CSSStyleSheet();
styles.replaceSync(`
  .empty {
    margin: 0;
    padding: 2.5rem 1rem;
    text-align: center;
    color: var(--muted);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  th, td {
    padding: 0.55rem 1rem;
    text-align: left;
    white-space: nowrap;
  }
  .numeric {
    text-align: right;
  }
  thead th {
    position: sticky;
    top: 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
    background: var(--surface);
    box-shadow: inset 0 -1px 0 var(--border);
  }
  tbody tr:nth-child(even) {
    background: var(--surface-raised);
  }
  tfoot td {
    position: sticky;
    bottom: 0;
    font-weight: 600;
    background: var(--surface);
    box-shadow: inset 0 1px 0 var(--border);
  }
`);

/** `<query-results>` — scrollable table of the customers returned by a query. */
class QueryResults extends HTMLElement {
  #scroll;
  #meta;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [panelStyles, styles];
    root.innerHTML = `
      <section class="panel">
        <header><h2>Query results</h2><span class="meta"></span></header>
        <div class="scroll" tabindex="0" role="region" aria-label="Query results"></div>
      </section>`;
    this.#scroll = root.querySelector('.scroll');
    this.#meta = root.querySelector('.meta');
    this.reset();
  }

  /** Back to the "nothing queried yet" placeholder. */
  reset() {
    this.#meta.textContent = '';
    this.#showMessage('Click “Query DB” to list the customers stored in the database.');
  }

  /** @param {object[]} rows Customers to display */
  set rows(rows) {
    this.#meta.textContent = pluralize(rows.length, 'customer');
    if (rows.length === 0) {
      this.#showMessage('No rows to display — the database is empty. Click “Load DB” to populate it.');
      return;
    }
    this.#scroll.replaceChildren(buildTable(rows));
    this.#scroll.scrollTop = 0;
  }

  #showMessage(message) {
    const paragraph = document.createElement('p');
    paragraph.className = 'empty';
    paragraph.textContent = message;
    this.#scroll.replaceChildren(paragraph);
  }
}

function buildTable(rows) {
  const table = document.createElement('table');

  const headRow = table.createTHead().insertRow();
  for (const column of COLUMNS) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = column.header;
    th.classList.toggle('numeric', Boolean(column.numeric));
    headRow.append(th);
  }

  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const column of COLUMNS) {
      const td = tr.insertCell();
      td.textContent = column.cell(row);
      td.classList.toggle('numeric', Boolean(column.numeric));
    }
  }

  const footRow = table.createTFoot().insertRow();
  const label = footRow.insertCell();
  label.colSpan = COLUMNS.length - 1;
  label.textContent = 'Total';
  const total = footRow.insertCell();
  total.className = 'numeric';
  total.textContent = formatCurrency(sumSales(rows));

  return table;
}

customElements.define('query-results', QueryResults);
