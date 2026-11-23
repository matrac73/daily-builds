# Your First DB App

A gentle, hands-on introduction to IndexedDB: load, query and clear a customer database that lives entirely in your browser — no server, no build step, no framework.

## Features

- **Control panel** with `Load DB`, `Query DB` and `Clear DB` buttons, plus a live "rows stored" counter.
- **Notification panel** showing the latest status message (every operation announces its start and its end).
- **Scrollable log panel** with a timestamped running history of all notifications, interleaved with execution details coming straight from the `Customer` class (connections opened, schema creation, each `put`, commits, aborts).
- **Scrollable query results** table with a sticky header and a sales total, and a clear message when there are no rows to display.
- **Smart button states** — derived from what is actually stored, so they are still right when you reload the page and data from a previous session is found:

  | Database                                        | Load DB  | Query DB | Clear DB |
  |-------------------------------------------------|----------|----------|----------|
  | empty (first visit, after `Clear DB`)           | enabled  | enabled  | disabled |
  | has rows (after `Load DB`, or a reloaded page)  | disabled | enabled  | enabled  |
  | an operation is running                         | disabled | disabled | disabled |

- **Extra customer fields**: date of last order and total sales for the year, on top of `userid`, `name` and `email`.
- **Transactional by design**: a load either stores every row or none (try breaking the unique `email` index in `src/seed.js`).
- Light and dark themes (follows your system), keyboard-accessible, responsive.

## Quick start

The app is plain HTML/CSS/ES modules. ES modules need to be served over HTTP, so use any static server from the repository root:

```bash
git clone <this-repo-url> first-db-app
cd first-db-app
python -m http.server 8000     # or: npx serve .
```

Then open <http://localhost:8000>.

## Usage

1. Click **Load DB** — 8 fictional customers are written in a single `readwrite` transaction. Watch each `put` scroll by in the log.
2. Click **Query DB** — every row is read back with `getAll()` and displayed in the results table.
3. **Reload the page** — the counter still says "8 rows stored" and `Clear DB` is enabled: the data survived the session.
4. Click **Clear DB** — the object store is emptied; `Query DB` now reports that there are no rows to display.

You can inspect the database yourself in DevTools → *Application* → *IndexedDB* → `customer_db`.

### Using the `Customer` class on its own

`src/customer.js` has no dependency on the UI and returns promises:

```js
import { Customer } from './src/customer.js';

const customer = new Customer('customer_db', { log: console.log });

await customer.initialLoad([
  { userid: '444', name: 'Bill', email: 'bill@company.com', lastOrderDate: '2026-11-14', totalSales: 12899.99 },
]);                                   // → 1   (rows written)
await customer.queryAllRows();        // → [{ userid: '444', name: 'Bill', … }]
await customer.countRows();           // → 1
await customer.removeAllRows();       // → 1   (rows removed)
```

## Project structure

```
index.html                     Page shell: lays out the four custom elements
styles.css                     Design tokens (light/dark) and page layout
src/
  app.js                       loadDB / queryDB / clearDB handlers and wiring
  customer.js                  Customer class — the only code touching IndexedDB
  seed.js                      Fictional customer data
  state.js                     Pure function deciding which buttons are enabled
  format.js                    Currency, date, time and plural helpers
  components/
    control-panel.js           <control-panel>      emits `db-action` events
    notification-panel.js      <notification-panel> latest status message
    log-panel.js               <log-panel>          append-only execution log
    query-results.js           <query-results>      scrollable customer table
    panel-styles.js            Stylesheet shared by all panels
tests/                         node:test suites
```

Design notes:

- **Web Components, no framework.** Each panel is a custom element with its own shadow DOM and a tiny imperative API (`show()`, `add()`, `rows = …`). Theming flows in through CSS custom properties; common panel chrome is a constructable stylesheet adopted by every shadow root.
- **Differences from the starter code.** The class in the original brief only inserts rows inside `onupgradeneeded`, so `Load DB` silently does nothing once the database exists (for instance after `Clear DB`). Here the upgrade handler only creates the schema, and data is written in a regular transaction, which makes the load repeatable. Methods return promises that settle when the transaction *commits* (not when a request succeeds), and the IndexedDB factory and logger are injected so the class can be tested outside a browser.

## Tests

The core logic (the `Customer` class, the button-state rule, the formatters and the seed data) is covered with Node's built-in test runner, using [`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB) as an in-memory IndexedDB implementation. Requires Node.js 20+.

```bash
npm install
npm test
```

The dev dependency is only needed for tests — the app itself has no dependencies.

## Retrospective

**What use cases are there for IndexedDB in frontend apps?**
Offline-first apps (drafts, notes, to-do lists that sync later), caching server responses so they can be filtered, sorted or reshaped locally, queues of pending writes while the network is down, storing large or binary assets (images, audio, files) for PWAs, and persisting UI state too big or too structured for `localStorage`.

**Advantages and disadvantages compared to a file or local storage?**

| | IndexedDB | `localStorage` | File (download / File System Access) |
|---|---|---|---|
| Capacity | Large (a share of the disk) | ~5 MB | Disk-bound |
| Data types | Structured-clonable objects, Blobs | Strings only | Bytes / text you serialise yourself |
| Querying | Keys, indexes, ranges, cursors | Key lookup only | None — parse everything |
| Transactions | Yes, atomic | No | No |
| Blocking | Asynchronous, usable in workers | Synchronous, blocks the main thread | Asynchronous |
| API ergonomics | Verbose, event-based | Trivial | Needs user gestures and permissions |
| Portability | Tied to origin and browser | Tied to origin and browser | The user owns it and can move it |

The main downsides of IndexedDB are its verbose event-based API (hence the promise wrapper in this project), schema migrations through version upgrades, the fact that the browser may evict data under storage pressure unless persistence is requested, and that it is no more secure than any other client-side storage.

**What criteria help decide whether IndexedDB is right for an app?**
It is a matter of degree: the more of these are true, the stronger the case.

- The data is *structured and numerous* (hundreds of records or more), or includes binary blobs → IndexedDB; a handful of preferences → `localStorage` is simpler.
- You need to *look records up by something other than a single key*, or update several records atomically.
- The app must *work offline* or feel instant by reading locally before hitting the network.
- The data is *non-confidential* and *reconstructible*: the client cannot be secured and the browser may clear it, so the server (or the user's own files) must remain the source of truth for anything that matters.
- The data does *not* need to follow the user across devices or browsers on its own — otherwise you need a sync layer or a server anyway.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/1-Beginner/First-DB-App.md) idea bank.
