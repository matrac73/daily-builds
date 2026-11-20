# Bug Race

Name four bugs, bet on a winner and watch them scurry to the finish line — a tiny browser game animated with nothing but native `requestAnimationFrame`.

## Features

- **Four-lane race track** with a radio button per lane to pick your predicted winner.
- **Setup panel**: choose an icon for every lane from four hand-drawn SVG bugs (ladybug, beetle, bee, firefly) and give each bug a name.
- **Live validation**
  - a *warning* when two lanes share the same icon (the race can still start);
  - an *error* when a name is blank or repeated (case-insensitive);
  - an *error* when you press Start without picking a winner.
- **Three speed settings** — Slow, Normal, Fast. Each bug gets its own random speed inside the selected range and changes pace during the race, so the lead can swap.
- **Fair finish**: every bug freezes the instant the first one touches the line, and Start stays disabled until then.
- **Session metrics**: races run, correct guesses, and per-bug races / wins / losses.
- **Extras**: the winner bounces, losers flip onto their backs, legs wiggle while running, and distinct jingles (synthesised with the Web Audio API, no audio files) play at the start, on a correct guess and on a wrong one. Sound can be switched off.
- Responsive, keyboard accessible, and respects `prefers-reduced-motion`.
- Zero dependencies, zero build step.

## Quick start

The app uses ES modules, so it must be served over HTTP (opening `index.html` from the file system will not work). Any static server does the job:

```bash
git clone <this-repo-url> bug-race
cd bug-race
npx serve .
# or: python -m http.server 8000
```

Then open the URL printed by the server (for example <http://localhost:3000> or <http://localhost:8000>).

Because every path is relative, the folder can also be dropped as-is onto GitHub Pages or into any sub-folder of an existing site.

## How to play

1. In **Setup**, pick an icon and type a name for each lane.
2. Choose a speed: **Slow** (about 8–12 s per race), **Normal** (about 4–7 s) or **Fast** (about 2–3 s).
3. On the **Race track**, select the radio button of the lane you think will win.
4. Press **Start** and cheer. When the race is over, the result and the metrics table update, and you can race again.

### Speed ranges

Speeds are expressed in track lengths per second and defined in [`src/race.js`](./src/race.js):

| Setting | Min  | Max  |
| ------- | ---- | ---- |
| Slow    | 0.08 | 0.12 |
| Normal  | 0.15 | 0.23 |
| Fast    | 0.30 | 0.45 |

## Project structure

```
index.html            Page markup
styles.css            Layout, track and CSS animations (bounce, flip, leg wiggle)
src/
  app.js              DOM wiring and the requestAnimationFrame loop
  race.js             Pure race simulation (speeds, pace changes, winner detection)
  validation.js       Setup rules: duplicate icons, names, missing pick
  stats.js            Session and per-bug metrics
  bugs.js             The SVG bug roster
  sound.js            Web Audio jingles
tests/                node:test suites for the pure modules
```

The game logic is kept free of DOM access: `app.js` feeds elapsed time into `stepRace()` and renders the positions it gets back, which is what makes the simulation testable with a seeded random generator.

## Tests

Requires Node.js 20 or newer; there is nothing to install.

```bash
npm test
```

The suites cover the speed ranges, the race simulation (in-range speeds, winner detection, everyone stopping at the finish, deterministic replays), setup validation and the metrics.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/3-Advanced/Bug-Race-Game.md) idea bank.
