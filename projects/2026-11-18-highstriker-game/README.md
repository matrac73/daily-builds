# High Striker

The classic carnival strength game in your browser: time your swing, launch the puck up the rail and ring the bell.

No build step, no dependencies, no audio files: plain HTML, CSS and ES modules, with every sound synthesised live by the Web Audio API.

## Features

- **Animated SVG tower** with a brass bell on top, a levered platform and mallet at the bottom, and a track with a puck in between.
- **Skill plus luck**: a needle sweeps across a power meter. The closer to the centre you hit **Strike!**, the harder the swing; a random luck factor (85% to 105%) then nudges the result.
- **Real physics**: the puck is launched with an initial speed and slowed by gravity and rail friction, integrated at a fixed 240 Hz step. Hit hard enough and it bounces off the bell.
- **Scoreboard**: bells rung, attempts and points, with a progress bar towards the 10-point target and a **Clear** button.
- **Points by distance**: 1 point from 1/8 of the track, 2 from 1/4, 3 from 1/2, 4 from 3/4, and 5 for ringing the bell.
- **Congratulations banner** once 10 points are reached, with a *Play again* button.
- **Sound**: a thud on the lever, a whistle that rises with the puck, a ringing bell, a different jingle for each score and a victory fanfare. Can be muted.
- **The bell shakes** (and radiates) when struck.
- Keyboard friendly (`Space` / `Enter` to strike), responsive, and respects `prefers-reduced-motion`.

## Quick start

The game uses ES modules, so it must be served over HTTP (opening `index.html` from the file system will not work).

```bash
git clone <this-repo-url> highstriker
cd highstriker
npx --yes serve .
```

Then open the URL printed by `serve` (usually <http://localhost:3000>). Any static server works just as well, for example:

```bash
python -m http.server 8000
```

The project is fully static with `index.html` at the root and only relative paths, so it can be published as-is on GitHub Pages, including from a sub-folder.

## How to play

1. Watch the needle sweep across the power meter.
2. Click **Strike!** (or press `Space` / `Enter`) when the needle is in the green centre.
3. The puck flies up the rail; where it peaks decides your points:

   | Peak height      | Points |
   | ---------------- | ------ |
   | below 1/8        | 0      |
   | 1/8 to 1/4       | 1      |
   | 1/4 to 1/2       | 2      |
   | 1/2 to 3/4       | 3      |
   | 3/4 to the bell  | 4      |
   | bell struck      | 5      |

4. Reach 10 points to win. **Clear** resets the score at any time.

A perfectly centred swing always rings the bell; anything less than 80% power never does. In between, it is up to carnival luck.

## The algorithm

```text
power = 1 - |2 * needle - 1|                  needle sweeps 0..1, centre is best
force = clamp(power * (0.85 + 0.2 * random))  luck factor
v0    = force * 3                             launch speed, track lengths per second
dv/dt = -(2.2 + 0.6 * v)                      gravity + friction proportional to speed
```

The puck's height is integrated with a semi-implicit Euler step. The same `stepPuck` function drives both the on-screen animation and the unit tests, where its peak is checked against the closed-form solution.

## Project structure

```text
.
├── index.html          # page markup and the SVG tower
├── styles.css          # carnival look and the bell / lever / mallet animations
├── src/
│   ├── game.js         # pure logic: meter, luck, puck physics, scoring (no DOM)
│   ├── audio.js        # Web Audio sound effects
│   └── app.js          # wires logic, audio and DOM together; animation loop
├── tests/
│   └── game.test.js    # unit tests for the game logic
├── package.json
└── LICENSE
```

## Tests

The game logic is covered by the Node.js built-in test runner (Node 20 or later, no dependencies to install):

```bash
npm test
```

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/2-Intermediate/HighStriker-Game.md) idea bank.
