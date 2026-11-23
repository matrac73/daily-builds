export const STORE_NAME = 'customers';
const DB_VERSION = 1;

/**
 * Promise-based gateway to the `customers` object store.
 *
 * Every public method opens its own connection, runs a single transaction and
 * closes the connection again, so an instance holds no state besides its name.
 */
export class Customer {
  #indexedDB;
  #log;

  /**
   * @param {string} dbName Name of the IndexedDB database
   * @param {object} [options]
   * @param {IDBFactory} [options.indexedDB] Factory to use (injectable for tests)
   * @param {(message: string) => void} [options.log] Receives execution details
   */
  constructor(dbName, { indexedDB = globalThis.indexedDB, log = () => {} } = {}) {
    if (!indexedDB) {
      throw new Error("This browser doesn't support IndexedDB, so customer data cannot be stored.");
    }
    this.dbName = dbName;
    this.#indexedDB = indexedDB;
    this.#log = log;
  }

  /**
   * Populate the database with a set of customers. Existing rows with the
   * same `userid` are overwritten; the whole load is rolled back on any error.
   * @param {object[]} customerData Rows to store
   * @returns {Promise<number>} Number of rows written
   */
  initialLoad(customerData) {
    return this.#transact('readwrite', (store) => {
      for (const customer of customerData) {
        store.put(customer);
        this.#log(`put → userid ${customer.userid} (${customer.name})`);
      }
      return () => customerData.length;
    });
  }

  /**
   * Remove all rows from the database.
   * @returns {Promise<number>} Number of rows removed
   */
  removeAllRows() {
    return this.#transact('readwrite', (store) => {
      const countRequest = store.count();
      store.clear();
      this.#log(`clear → every row in "${STORE_NAME}"`);
      return () => countRequest.result;
    });
  }

  /**
   * Retrieve every customer, ordered by primary key (`userid`).
   * @returns {Promise<object[]>}
   */
  queryAllRows() {
    return this.#transact('readonly', (store) => {
      const request = store.getAll();
      this.#log(`getAll → every row in "${STORE_NAME}"`);
      return () => request.result;
    });
  }

  /**
   * @returns {Promise<number>} Number of rows currently stored
   */
  countRows() {
    return this.#transact('readonly', (store) => {
      const request = store.count();
      return () => {
        this.#log(`count → ${request.result} row(s) in"${STORE_NAME}"`);
        return request.result;
      };
    });
  }

  /** Open the database, creating the schema on first use. */
  #open() {
    return new Promise((resolve, reject) => {
      const request = this.#indexedDB.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = () => {
        this.#log(`Creating object store "${STORE_NAME}" (keyPath: userid) with indexes name, email (unique)`);
        const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'userid' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('email', 'email', { unique: true });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Run `work` inside one transaction on the customers store.
   *
   * `work` queues its requests synchronously and returns a function that reads
   * the outcome; it is only called once the transaction has committed, so the
   * promise never resolves with data from a transaction that later aborted.
   */
  async #transact(mode, work) {
    const db = await this.#open();
    this.#log(`Opened "${this.dbName}" v${DB_VERSION}; ${mode} transaction started`);
    try {
      return await new Promise((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, mode);
        let readResult;
        txn.oncomplete = () => {
          const result = readResult();
          this.#log('Transaction committed');
          resolve(result);
        };
        txn.onabort = () => {
          this.#log(`Transaction aborted: ${txn.error?.message ?? 'unknown error'}`);
          reject(txn.error ?? new Error('Transaction aborted'));
        };
        try {
          readResult = work(txn.objectStore(STORE_NAME));
        } catch (error) {
          txn.onabort = null;
          txn.abort();
          this.#log(`Transaction aborted: ${error.message}`);
          reject(error);
        }
      });
    } finally {
      db.close();
    }
  }
}
