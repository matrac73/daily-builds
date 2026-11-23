import './components/control-panel.js';
import './components/notification-panel.js';
import './components/log-panel.js';
import './components/query-results.js';
import { Customer } from './customer.js';
import { pluralize } from './format.js';
import { CUSTOMER_DATA } from './seed.js';
import { buttonStates } from './state.js';

const DBNAME = 'customer_db';

const controls = document.querySelector('control-panel');
const notifications = document.querySelector('notification-panel');
const log = document.querySelector('log-panel');
const results = document.querySelector('query-results');

/** Post a status message; the log keeps the running history. */
function notify(message, tone = 'info') {
  notifications.show(message, tone);
  log.add(message, tone);
}

/** Re-derive the row counter and button states from what is actually stored. */
async function syncControls(customer) {
  const rowCount = await customer.countRows();
  controls.rowCount = rowCount;
  controls.states = buttonStates({ rowCount });
}

/**
 * Run one database operation with start/end notifications, locking the
 * buttons while it is in flight.
 * @param {Customer} customer
 * @param {string} label Operation name used in the notifications
 * @param {() => Promise<string>} operation Resolves with the success message
 */
async function run(customer, label, operation) {
  controls.states = buttonStates({ busy: true });
  notify(`${label} started…`);
  try {
    notify(await operation(), 'success');
  } catch (error) {
    notify(`${label} failed: ${error.message}`, 'error');
  }
  try {
    await syncControls(customer);
  } catch (error) {
    notify(`Could not read the database: ${error.message}`, 'error');
  }
}

function start() {
  let customer;
  try {
    customer = new Customer(DBNAME, { log: (message) => log.add(message) });
  } catch (error) {
    notify(error.message, 'error');
    return;
  }

  /** Add customer data to the database */
  const loadDB = () =>
    run(customer, 'Load', async () => {
      const count = await customer.initialLoad(CUSTOMER_DATA);
      results.reset();
      return `Load finished — ${pluralize(count, 'customer')} stored.`;
    });

  /** List all customers in the query results area */
  const queryDB = () =>
    run(customer, 'Query', async () => {
      const rows = await customer.queryAllRows();
      results.rows = rows;
      return rows.length > 0
        ? `Query finished — ${pluralize(rows.length, 'customer')} retrieved.`
        : 'Query finished — no rows to display.';
    });

  /** Clear all customer data from the database */
  const clearDB = () =>
    run(customer, 'Clear', async () => {
      const count = await customer.removeAllRows();
      results.reset();
      return `Clear finished — ${pluralize(count, 'row')} removed.`;
    });

  const handlers = { load: loadDB, query: queryDB, clear: clearDB };
  controls.addEventListener('db-action', (event) => handlers[event.detail.action]());

  notify(`Ready. Connected to "${DBNAME}".`);
  syncControls(customer).catch((error) => {
    notify(`Could not read the database: ${error.message}`, 'error');
  });
}

start();
