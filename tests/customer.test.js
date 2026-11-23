import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { Customer, STORE_NAME } from '../src/customer.js';
import { CUSTOMER_DATA } from '../src/seed.js';

const BILL = { userid: '444', name: 'Bill', email: 'bill@company.com', lastOrderDate: '2026-11-14', totalSales: 100 };
const DONNA = { userid: '555', name: 'Donna', email: 'donna@home.org', lastOrderDate: '2026-09-07', totalSales: 250.5 };

describe('Customer', () => {
  let indexedDB;
  let customer;

  beforeEach(() => {
    indexedDB = new IDBFactory();
    customer = new Customer('test_db', { indexedDB });
  });

  it('throws a helpful error when IndexedDB is unavailable', () => {
    assert.throws(() => new Customer('test_db', { indexedDB: undefined }), /doesn't support IndexedDB/);
  });

  it('starts empty and creates the schema on first use', async () => {
    assert.deepEqual(await customer.queryAllRows(), []);
    assert.equal(await customer.countRows(), 0);

    const db = await new Promise((resolve) => {
      const request = indexedDB.open('test_db');
      request.onsuccess = () => resolve(request.result);
    });
    const store = db.transaction(STORE_NAME).objectStore(STORE_NAME);
    assert.equal(store.keyPath, 'userid');
    assert.deepEqual([...store.indexNames], ['email', 'name']);
    assert.equal(store.index('email').unique, true);
    db.close();
  });

  it('loads rows and reports how many were written', async () => {
    assert.equal(await customer.initialLoad([BILL, DONNA]), 2);
    assert.equal(await customer.countRows(), 2);
  });

  it('returns every row ordered by userid, with all fields intact', async () => {
    await customer.initialLoad([DONNA, BILL]);
    assert.deepEqual(await customer.queryAllRows(), [BILL, DONNA]);
  });

  it('overwrites rows with the same userid instead of duplicating them', async () => {
    await customer.initialLoad([BILL, DONNA]);
    await customer.initialLoad([{ ...BILL, totalSales: 999 }]);

    const rows = await customer.queryAllRows();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].totalSales, 999);
  });

  it('removes all rows and reports how many were removed', async () => {
    await customer.initialLoad([BILL, DONNA]);
    assert.equal(await customer.removeAllRows(), 2);
    assert.deepEqual(await customer.queryAllRows(), []);
    assert.equal(await customer.removeAllRows(), 0);
  });

  it('can be loaded again after being cleared', async () => {
    await customer.initialLoad([BILL, DONNA]);
    await customer.removeAllRows();
    await customer.initialLoad([BILL]);
    assert.deepEqual(await customer.queryAllRows(), [BILL]);
  });

  it('rolls the whole load back when the unique email index is violated', async () => {
    const impostor = { ...DONNA, userid: '999', email: BILL.email };
    await assert.rejects(customer.initialLoad([BILL, impostor]), { name: 'ConstraintError' });
    assert.equal(await customer.countRows(), 0);
  });

  it('rolls the whole load back when a row has no primary key', async () => {
    await assert.rejects(customer.initialLoad([BILL, { name: 'Nobody', email: 'nobody@nowhere.example' }]), {
      name: 'DataError',
    });
    assert.equal(await customer.countRows(), 0);
  });

  it('persists data across instances sharing a database name', async () => {
    await customer.initialLoad([BILL]);
    const sameDb = new Customer('test_db', { indexedDB });
    const otherDb = new Customer('other_db', { indexedDB });
    assert.deepEqual(await sameDb.queryAllRows(), [BILL]);
    assert.deepEqual(await otherDb.queryAllRows(), []);
  });

  it('reports execution details through the log callback', async () => {
    const messages = [];
    const logged = new Customer('logged_db', { indexedDB, log: (message) => messages.push(message) });
    await logged.initialLoad([BILL]);

    assert.match(messages[0], /Creating object store "customers"/);
    assert.ok(messages.some((message) => message.includes('readwrite transaction started')));
    assert.ok(messages.some((message) => message.includes('userid 444 (Bill)')));
    assert.equal(messages.at(-1), 'Transaction committed');
  });

  it('logs aborted transactions', async () => {
    const messages = [];
    const logged = new Customer('logged_db', { indexedDB, log: (message) => messages.push(message) });
    await assert.rejects(logged.initialLoad([BILL, { ...DONNA, email: BILL.email }]));
    assert.match(messages.at(-1), /^Transaction aborted: /);
  });
});

describe('seed data', () => {
  it('loads cleanly: unique ids and emails, complete fields', async () => {
    const customer = new Customer('seed_db', { indexedDB: new IDBFactory() });
    assert.equal(await customer.initialLoad(CUSTOMER_DATA), CUSTOMER_DATA.length);

    const rows = await customer.queryAllRows();
    assert.equal(rows.length, CUSTOMER_DATA.length);
    for (const row of rows) {
      assert.match(row.userid, /^\d+$/);
      assert.ok(row.name);
      assert.match(row.email, /^[^@\s]+@[^@\s]+$/);
      assert.match(row.lastOrderDate, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof row.totalSales, 'number');
    }
  });

  it('keeps the two customers from the original brief', () => {
    const emails = CUSTOMER_DATA.map((row) => row.email);
    assert.ok(emails.includes('bill@company.com'));
    assert.ok(emails.includes('donna@home.org'));
  });
});
