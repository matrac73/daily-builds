# Random Meal Generator

Out of dinner ideas? One click gives you a random recipe — name, picture, ingredients, step-by-step instructions and a video — straight from [TheMealDB](https://www.themealdb.com).

## Features

- **One button, one meal** — click again for another one; the meal already on screen is never served twice in a row.
- **Everything you need to cook** — recipe name, picture, category, cuisine, tags, ingredients with measures, and a link to the original recipe when there is one.
- **Readable instructions** — the API's free-form text is split into a clean numbered list (embedded "STEP 1" / "2." numbering is removed).
- **YouTube video** — embedded through `youtube-nocookie.com` when the recipe has one.
- **Robust** — loading and error states, stale requests are cancelled, and API data is treated as untrusted (text-only rendering, URL validation).
- **Accessible and responsive** — keyboard friendly, live status announcements, light/dark themes, reduced-motion support.
- **Zero dependencies, no build step** — plain HTML, CSS and ES modules.

## Quick start

The app is fully static. ES modules need to be served over HTTP, so use any static server:

```bash
git clone <this-repo-url> random-meal-generator
cd random-meal-generator
npx serve .
```

Then open the URL printed in the terminal (usually <http://localhost:3000>).

No Node.js? Python works just as well: `python -m http.server 8000`, then open <http://localhost:8000>.

Because every path is relative, the folder can also be dropped as-is on GitHub Pages or in any sub-folder of an existing site.

## Usage

1. Click **Get a random meal**.
2. Read the ingredients and follow the numbered steps, or scroll down and cook along with the video.
3. Not inspired? Click **Get another meal**.

The parsing logic is also usable on its own, in the browser or in Node:

```js
import { fetchRandomMeal } from './src/api.js';

const meal = await fetchRandomMeal();
console.log(meal.name);        // "Teriyaki Chicken Casserole"
console.log(meal.ingredients); // [{ name: "Chicken", measure: "1 whole" }, ...]
console.log(meal.steps);       // ["Preheat oven to 350° F.", ...]
console.log(meal.videoUrl);    // "https://www.youtube-nocookie.com/embed/4aZr5hZXP_s"
```

## Project structure

```
.
├── index.html         # page shell
├── styles.css         # layout, themes, responsive rules
├── src/
│   ├── meal.js        # pure logic: normalises a raw TheMealDB record
│   ├── api.js         # fetches a random meal, maps failures to friendly errors
│   └── app.js         # DOM rendering and button wiring
└── tests/
    ├── fixtures.js    # sample record and fetch stand-in
    ├── meal.test.js   # ingredients, instructions, YouTube and URL parsing
    └── api.test.js    # success, re-roll, HTTP/network/payload errors, aborts
```

## Tests

The tests use Node's built-in test runner (Node 20+), with no dependencies to install and no network access:

```bash
npm test
```

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/1-Beginner/Random-Meal-Generator.md) idea bank.
