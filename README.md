# Marquee

A movie database app built from vanilla Web Components — browse the latest releases, open any movie for its ratings, synopsis and cast, keep a watchlist and write reviews. No framework, no build step, no dependencies.

## Features

- **Latest movies up front** — the newest release is featured as a hero, followed by every other movie from newest to oldest, grouped by year.
- **Infinite scroll** — the next page loads as you approach the end of the list.
- **Movie pages** — score ring, release date, runtime, director, genres, synopsis, cast and reviews, each at its own shareable URL (`#/movie/dune-part-two`).
- **Search** — by title, cast, director or genre, ignoring case and accents.
- **Watchlist** — bookmark a movie from any card or page; works immediately, without an account.
- **Accounts** — local profiles, each with its own watchlist. A watchlist started as a guest follows you into the first account you create.
- **Reviews** — signed-in users can rate a movie from 1 to 5 stars, write a review, then edit or delete it.
- **Two data sources** — works out of the box with a bundled catalogue of 36 films (2023–2025); paste a free [TMDB](https://www.themoviedb.org/settings/api) API key in the account panel to browse live data with posters, cast photos and TMDB reviews.
- **Accessible and responsive** — keyboard-operable star rating, native `<dialog>`, visible focus, reduced-motion support, layouts from phone to desktop.

## Quick start

The app is plain static files. Serve the folder with any static server:

```bash
git clone <this-repo-url> marquee
cd marquee
npx serve .
```

Then open the URL it prints (usually <http://localhost:3000>). `npm start` runs the same command.

Opening `index.html` straight from disk does not work: browsers block ES modules on `file://`.

To publish it, push the repository to GitHub and enable GitHub Pages on the root folder. Every path is relative, so it also works from a sub-folder.

## Usage

| To… | Do this |
| --- | --- |
| Browse | Scroll the front page; older movies load automatically. |
| Open a movie | Click a poster or title. |
| Search | Type in the header field, e.g. `zendaya`, `horror`, `villeneuve`. |
| Save a movie | Click the bookmark on a card, or **Add to watchlist** on a movie page. |
| See saved movies | Open **Watchlist** in the header. |
| Create an account | Click **Sign in**, pick a name, **Create account**. |
| Review a movie | Sign in, open a movie, choose a star rating, write, **Post review**. |
| Use live TMDB data | Click **Sign in** (or your name), paste a TMDB v3 API key under **Movie data**, **Save**. **Use demo data** switches back. |

Routes are hash-based and can be bookmarked:

```text
#/                      front page
#/?q=science+fiction    search results
#/movie/dune-part-two   a movie from the bundled catalogue
#/movie/693134          a TMDB movie (numeric id, needs an API key)
#/watchlist             your saved movies
```

### Good to know

- Accounts, watchlists, reviews and the TMDB key are stored in your browser's `localStorage`. Nothing is sent to a server, accounts have no password, and they are a way to separate people on one device rather than a security feature.
- The TMDB key is only ever sent to `api.themoviedb.org`.
- The bundled catalogue is hand-written demo data. Its scores are approximate snapshots of community ratings, and its posters are generated from each title because no artwork is shipped.
- Live mode uses the TMDB API but is not endorsed or certified by TMDB.

## Project structure

```text
index.html                 entry point, loads <movie-app>
styles.css                 design tokens (CSS custom properties) and page base
data/movies.json           bundled demo catalogue
src/
  context.js               app-wide singletons: the store and the catalogue
  lib/                     DOM-free logic, covered by the tests
    movies.js              sorting, search, pagination, formatting
    router.js              hash route parsing and building
    store.js               accounts, watchlists, reviews, settings (localStorage)
    catalog.js             picks the data provider for a request
    demo-provider.js       serves data/movies.json
    tmdb-provider.js       TMDB v3 client and response normalisation
    poster.js              deterministic title → gradient poster palette
    html.js                auto-escaping `html` tagged template
    errors.js              CatalogError
  components/              custom elements, each with its own shadow DOM
    movie-app.js           shell: header, search, router outlet
    movie-browser.js       front page: hero, year-grouped grid, infinite scroll
    movie-details.js       movie page
    movie-reviews.js       review list and form
    movie-card.js          poster card
    movie-poster.js        artwork or generated poster
    watchlist-view.js      saved movies
    watchlist-button.js    bookmark toggle
    star-rating.js         1–5 star input (ARIA radio group)
    account-panel.js       accounts and data-source dialog
    styles.js              shared constructable stylesheet
test/                      node:test suites
```

Both data providers return the same movie shape, so components never know where a movie came from. A movie's id decides which provider resolves it (slugs for the bundled catalogue, numbers for TMDB), which keeps watchlist entries working after you switch data source.

## Tests

The logic in `src/lib` is tested with Node's built-in test runner (Node 20 or later, nothing to install):

```bash
npm test
```

The suites cover search, sorting and pagination, routing, HTML escaping, the user store (accounts, watchlists, reviews, persistence, corrupted or failing storage), both data providers (TMDB against a fake `fetch`) and the integrity of the bundled catalogue.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/3-Advanced/Movie-App.md) idea bank.
