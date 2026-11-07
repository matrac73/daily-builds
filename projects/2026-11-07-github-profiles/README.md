# GitHub Profiles

Look up any GitHub user and see their avatar, stats and top four repositories, in a fast static web app with no build step.

## Features

- **Search by username**: type a login (a leading `@` and extra spaces are fine) and press **Search** or Enter.
- **Profile card**: avatar, display name, `@login` linking to GitHub, bio, follower, following and public repository counts.
- **Top 4 repositories**: ranked by stars + forks. Forks of other projects are skipped, and ties are broken by stars and then by name, so the order never changes between runs.
- **Clear alerts**: invalid usernames are caught before any request is sent. Unknown users, the API rate limit (with the reset time), HTTP errors and network failures each get their own message.
- **Dark / light mode**: the first visit follows your OS setting. If you pick a theme it's saved in `localStorage` and restored on your next visit.
- **Shareable links**: the URL updates to `?user=<login>`, and opening such a link runs the search right away.
- **No build step**: plain HTML, CSS and ES modules, all with relative paths, so it can be served from any sub-folder (e.g. GitHub Pages).

## Quick start

Requirements: a modern browser. Serving locally needs [Node.js](https://nodejs.org/) 20+; running the tests needs Node.js 22+.

```bash
git clone <this-repo-url> github-profiles
cd github-profiles
npx --yes serve -l 8080 .     # or: npm start
```

Then open <http://localhost:8080>. Any static server works, e.g. `python3 -m http.server 8080`. ES modules don't load from `file://`, so open the page through a server.

## Usage

| Action | Result |
| --- | --- |
| Type `torvalds`, press Enter | Shows Linus Torvalds' profile and his 4 most popular repositories |
| Open `http://localhost:8080/?user=octocat` | Loads `octocat` directly |
| Search `bad name` | Alert: not a valid GitHub username (no request sent) |
| Search `this-user-does-not-exist-123` | Alert: no GitHub user found with that username |
| Click the sun/moon button | Toggles the theme; the choice is remembered |

The app uses the unauthenticated GitHub REST API, which allows **60 requests per hour per IP**. Each search uses 2 requests (profile + repositories).

## Project structure

```
.
├── index.html          # Markup, including the repository card <template>
├── styles.css          # Light/dark design tokens and responsive layout
├── src/
│   ├── app.js          # DOM wiring: search form, rendering, theme toggle, ?user= links
│   ├── github.js       # Pure logic: username validation, API client, ranking, formatting
│   └── theme.js        # Theme loading/saving with graceful storage fallback
├── tests/
│   ├── github.test.js  # Validation, ranking, formatting, API success and error paths (mocked fetch)
│   └── theme.test.js   # Theme persistence and fallbacks
└── package.json        # npm scripts only, no dependencies
```

All of the logic lives in modules that don't touch the DOM. `fetchProfile` takes an injectable `fetch`, so the tests run offline.

## Tests

```bash
npm test          # runs: node --test tests/
```

The tests use only Node's built-in test runner and assertion library, so there's nothing to install.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/2-Intermediate/GitHub-Profiles.md) idea bank.
