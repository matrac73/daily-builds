# Christmas Lights

A string of rippling Christmas lights in the browser, built with vanilla JavaScript Web Components and no build step.

Seven coloured bulbs hang in a row. On every tick of a timer the next bulb brightens and glows while the previous one fades back to its normal intensity, so the light appears to ripple along the string.

## Features

- **Start / stop** the display with a button or the <kbd>Space</kbd> key. When you resume, the ripple picks up where it stopped.
- **Interval** slider (50–2000 ms) sets how fast the light moves. The change applies immediately, even while the display is running.
- **Intensity** slider (0–100 %) sets how bright and how wide the glow of the lit bulb is.
- **Rows**: show 1 to 7 rows. Each row is offset by one bulb, so stacked rows form a diagonal wave.
- **Per-bulb colour and size**: every bulb has its own colour picker and size slider (24–96 px), plus a reset button.
- Accessible: real form controls, labelled inputs, `aria-pressed` on the toggle, and `prefers-reduced-motion` support.

## Quick start

No install or build is needed. Serve the folder with any static file server:

```bash
git clone <this-repo-url> christmas-lights
cd christmas-lights
npx serve .            # or: python -m http.server 8000
```

Then open the URL the server prints (for example `http://localhost:3000` or `http://localhost:8000`).

> ES modules don't load over `file://`, so opening `index.html` by double-clicking won't work. Use a local server.

## Usage examples

- **Slow, gentle shimmer**: interval about 800 ms, intensity about 40 %.
- **Chase effect**: interval 60–100 ms, intensity 100 %.
- **LED matrix wave**: rows set to 7, so the lit bulbs form a diagonal that rolls across the grid.
- **Monochrome string**: set every bulb to the same colour and vary the sizes so they taper from big to small.

## Project structure

```
.
├── index.html                    # Page markup and controls
├── styles.css                    # Page styles (the components have their own shadow-DOM styles)
├── src/
│   ├── app.js                    # Connects the controls, ticker and components
│   ├── lights.js                 # Pure logic: limits, sequencing, bulb appearance, ticker
│   └── components/
│       ├── light-display.js      # <light-display>: renders the rows of bulbs
│       └── bulb-editor.js        # <bulb-editor>: colour and size picker for each bulb
├── test/
│   └── lights.test.js            # node:test unit tests for src/lights.js
└── package.json                  # Script shortcuts only; no dependencies
```

All of the decisions live in `src/lights.js`, which never touches the DOM: which bulb is lit for a given step and row, how a bulb looks at a given intensity, and how input values are clamped. That module also has `createTicker`, a start/stop/toggle controller with injectable timer functions, so it can be tested without real time passing. The two custom elements only render that state.

## Tests

The tests need Node.js 18 or newer and have no dependencies:

```bash
npm test               # same as: node --test
```

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/1-Beginner/Christmas-Lights-App.md) idea bank.
