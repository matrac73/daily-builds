# Survey App

Define multiple-choice surveys, collect one response per account, and publish tabulated results with bar charts — a zero-dependency web app that runs entirely in the browser.

## Features

**Survey coordinators** (administrators)

- Sign in to reach the administrative functions.
- Define a survey: a title and 1–10 multiple-choice questions, each with 1–5 mutually exclusive choices. **Save** stores it as a draft; **Cancel** returns home without saving.
- Open a draft for responses, and close an open survey to publish its results.

**Survey respondents**

- Create an account and sign in (usernames are unique, passwords are stored as salted PBKDF2 hashes).
- Pick an open survey and answer it by ticking checkboxes — ticking another choice unticks the previous one.
- **Submit** refuses incomplete surveys and points at the unanswered questions; **Cancel** leaves without submitting.
- Each account can complete a survey only once.

**Everyone**

- Browse closed surveys and view their results as a table (responses and share per choice) with a bar chart on a common 0–100 % scale.
- Light and dark themes, keyboard-accessible forms, no build step, no server, no tracking.

> **Scope note.** All data — accounts, surveys, responses — lives in your browser's `localStorage`. That makes the app trivially hostable (GitHub Pages works as-is), but it also means surveys are not shared between devices and the roles are a UI-level convention, not a security boundary. To collect responses from real people you would put the same domain logic behind a server.

## Quick start

No install step. ES modules need to be served over HTTP, so start any static file server from the repository root:

```bash
git clone <this-repository-url> survey-app
cd survey-app
npx --yes serve .          # or: python -m http.server 8000
```

Then open the URL printed by the server (for example <http://localhost:3000>).

## Usage

The first visit loads sample data: one draft, one open survey and one closed survey with 24 responses.

1. **Look at results** — on the home page, click **View results** on *Developer tooling check-in*.
2. **Act as a coordinator** — go to **Sign in** and click **Sign in as the demo coordinator** (`coordinator` / `survey-demo`). Click **+ New survey**, add questions and choices, then **Save**. Back on the home page, click **Open for responses** on your draft.
3. **Act as a respondent** — **Sign out**, click **Create account**, choose a username and password, then **Take survey**. Try submitting before answering everything to see the error message.
4. **Publish** — sign back in as the coordinator and click **Close survey**. The survey moves to *Closed surveys* and its results become visible to everyone.

**Reset sample data** in the footer erases everything stored in the browser and restores the samples.

## Project structure

```
index.html          Page shell (header, main, footer)
styles.css          Theme and layout, light and dark
src/
  survey.js         Domain model: validation, draft → open → closed, responses, tally
  auth.js           Username/password rules and PBKDF2 hashing (Web Crypto)
  store.js          State, permissions and persistence over a Storage-like object
  demo.js           Sample data and the demo coordinator account
  app.js            Browser entry point: hash router and navigation bar
  ui/
    dom.js          Tiny hyperscript helper (text nodes only, no innerHTML)
    home.js         Draft / open / closed survey lists
    account.js      Sign-in and account-creation forms
    builder.js      Survey definition form
    take.js         Survey response form
    results.js      Results tables and bar charts
tests/
  survey.test.js    Rules of the domain model
  store.test.js     Accounts, permissions, workflow, persistence, sample data
```

`survey.js`, `auth.js` and `store.js` have no DOM dependency, which is why the same modules run unchanged in the browser and under Node's test runner.

## Tests

Requires Node.js 20 or newer; there is nothing to install.

```bash
npm test        # or: node --test
```

The suite covers the definition rules (1–10 questions, 1–5 choices, duplicates), the survey lifecycle, incomplete and duplicate submissions, tabulation, password hashing, role permissions and persistence.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/3-Advanced/Survey-App.md) idea bank.
