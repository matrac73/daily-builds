# Fouet 🪢

**Attach a physics whip to your mouse cursor. Crack it on a text field and it types "faster", "do it", "make it"…**

Click the button in the bottom-right corner and a leather whip snaps onto your cursor. Flick your wrist: the lash
rolls out, the tip breaks the "sound barrier" and *cracks*. If it cracks over a text zone (your AI-agent prompt,
a commit message, a chat box), a motivational phrase gets typed right into it. Chain hits and the phrases get louder.

## Features

- **Smooth whip physics**: a 24-segment Verlet rope with fixed-timestep substeps and anchor interpolation, so the
  lash stays fluid at any frame rate and fast flicks really accelerate the tip.
- **Real crack detection**: a crack fires when the tip speed crosses a threshold (rising edge + re-arm + cooldown).
  Slow dragging or lazy waving never cracks; one sharp flick gives exactly one crack.
- **Types where you whip**: works on `<textarea>`, text/search `<input>` and any `contenteditable` element. Uses
  `insertText` so native undo and React/Vue state stay in sync, and adds spaces only where needed.
- **Combo escalation**: `faster` → `FASTER!` → `FASTER!!!`. Every 3 consecutive hits unlock a louder tier.
- **Stylish feedback**: wooden handle that leans with your wrist, tapered leather lash with a frayed cracker, tip
  motion streak, shock-wave ring, sparks, popping phrase labels, a shaking target and a synthesized crack sound
  (Web Audio, no assets).
- **Toggle** with the bottom-right button or <kbd>Alt</kbd>+<kbd>W</kbd>; <kbd>Esc</kbd> puts the whip away. A badge
  counts your hits.
- **Bonus — bookmarklet**: drag it from the demo page to your bookmarks bar and use the whip on any website.
- Respects `prefers-reduced-motion` (no shaking). Zero dependencies, zero build step.

## Quick start

Any static server works (ES modules don't load from `file://`):

```bash
git clone <this-repo> fouet
cd fouet
npx --yes http-server -c-1 -p 8080 .    # or: python -m http.server 8080
```

Open <http://localhost:8080>, press the button in the bottom-right corner, then flick the mouse over a text field.

## Usage

### On the demo page

1. Press the round button in the bottom-right corner (or <kbd>Alt</kbd>+<kbd>W</kbd>).
2. Point at the "Prompt for your AI agent" box and do a short, sharp flick (out and back).
3. `Refactor the billing module and write the tests.` becomes `… write the tests. faster`.
4. Keep hitting within ~2 s: `DO IT NOW!`, then `NO EXCUSES!!`.

### On any website (bookmarklet)

Host the project over http(s) (e.g. GitHub Pages), open the demo page, drag the **🪢 Fouet** link to your
bookmarks bar, then click the bookmark on any page. Click it again to toggle. Sites with a strict
Content-Security-Policy may refuse to load external scripts.

### In your own page

```html
<script type="module">
  import { mount } from './src/fouet.js';
  const fouet = mount({ threshold: 2400, sound: true }); // adds the button, nothing else
  fouet.toggle();     // programmatic on/off
  fouet.active;       // boolean
  fouet.destroy();    // remove everything
</script>
```

`threshold` is the tip speed (px/s) needed to crack: raise it for a harder whip, lower it for a lazier one.

## Project structure

```
index.html          Demo page (served as-is, relative paths only)
style.css           Demo page styles
app.js              Demo entry: mounts the whip, builds the bookmarklet link
src/
  whip.js           Verlet rope simulation (pure, no DOM)
  crack.js          Tip speed → crack events, crack intensity
  phrases.js        Phrase tiers, combo counter, no-repeat picker
  text.js           Spacing-aware insertion, which elements are whippable
  bookmarklet.js    Builds the javascript: URL for the bookmarklet
  fouet.js          Browser layer: overlay canvas, button, rendering, sound, typing
tests/              node:test suites for all the pure modules
```

## Tests

Requires Node.js ≥ 20, no install needed:

```bash
npm test            # = node --test tests/
```

The physics tests drive the simulated whip with synthetic wrist motions and check that a 1600 px/s flick cracks
exactly once while slow drags and lazy waves never do, that the lash stays inextensible, and that it comes to rest.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code).
