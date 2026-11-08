# Shell Game

An honest, animated shell game in vanilla JavaScript: hide the pea, watch the shells shuffle for five seconds, then find it.

No framework, no build step, no dependencies — just ES modules served as static files.

## Features

- **Hide the pea yourself** — click a shell and watch the pea roll under it.
- **5-second animated shuffle** — shells trade places along arcs (one passes behind, one in front), with a progress bar on the table.
- **Three speeds** — Relaxed, Classic or Hustler. Faster swaps mean more swaps in the same five seconds.
- **Keep guessing** — lifted shells stay up, so you can see where the pea is *not* until you find it.
- **Celebration** — the winning shell glows and dances, the pea pulses, and a congratulations message appears.
- **Score panel** — games played (counted when the pea is hidden), first-guess wins and win rate, saved in `localStorage`, with a reset button.
- **Honest by construction** — the final arrangement is computed from the same list of swaps that drives the animation; the pea never leaves its shell.
- **Keyboard & screen-reader friendly** — <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> pick the left/middle/right shell, <kbd>S</kbd> shuffles; shells are real buttons labelled by position and status messages are announced through a live region.

## Quick start

The app is plain static files, but browsers block ES modules on `file://`, so serve the folder:

```bash
git clone <this-repo-url> shell-game
cd shell-game
npx serve .            # or: python -m http.server 8000
```

Then open the URL printed in the terminal (e.g. <http://localhost:3000> or <http://localhost:8000>).

It also works as-is on GitHub Pages or in any sub-folder of a static site: every path is relative.

## How to play

1. Click a shell — the pea moves under it and a new game starts (*Games played* +1).
2. Press **Shuffle** (or <kbd>S</kbd>). The shells swap places for 5 seconds.
3. Click the shell you think hides the pea. A wrong shell stays lifted, greyed out; keep going until you find it.
4. Find it on the **first** guess to score a win.
5. Click any shell to hide the pea again and play another round.

## Project structure

```
.
├── index.html        # Page markup + shared SVG shell artwork
├── styles.css        # Felt table, shell lift / celebration animations
├── src/
│   ├── game.js       # Pure, immutable state machine (hide → shuffle → guess → won)
│   ├── shuffle.js    # Swap planning: random slot pairs filling 5 seconds
│   ├── score.js      # Score persistence (any getItem/setItem storage) and win rate
│   └── app.js        # DOM rendering, Web Animations API, input handling
└── test/             # node:test suites for game.js, shuffle.js and score.js
```

The rules live entirely in `src/game.js` and `src/shuffle.js`, which have no DOM dependency. `app.js` only turns clicks into state transitions and state transitions into motion:

- shells are absolutely positioned buttons; a swap animates their `left` and an arc `transform` with `element.animate()`;
- the pea travels between the table and a shell with a FLIP animation;
- after a shuffle the buttons are re-ordered in the DOM so Tab order matches what you see.

## Tests

Requires Node.js 20+ (no `npm install` needed — there are no dependencies):

```bash
npm test               # same as: node --test
```

The suites cover phase transitions and invalid actions, the "only first-guess finds count as wins" rule, immutability of states, swap planning for each speed, and score storage including corrupted data and throwing storage.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/3-Advanced/Shell-Game.md) idea bank.
