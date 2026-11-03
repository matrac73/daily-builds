# Fouet

**A pixel-art whip for your mouse. Swing, stop dead, CLAC: it types "faster", "do it", "make it"… into the text zone it hits.**

Two flavours, same physics and the same 8-bit look:

- **Desktop (Windows)**: `fouet.py`, a single Python file with no dependencies. The whip works on top of *every* app: Teams, VS Code, Outlook, your browser…
- **Browser**: try it online at <https://matrac73.github.io/daily-builds/projects/2026-11-03-fouet/>, or bring it to any site with the bookmarklet.

## How to crack

Speeding up never cracks. **Braking does**: swing fast, then stop dead or pull back. At that moment the lash
snaps straight along the line of your swing and cracks at its tip, one whip-length ahead of your hand. Aim
*past* the text zone, not at it. Chain hits within ~2 s to escalate: `faster` → `FASTER!` → `FASTER!!!`.

## Desktop quick start

1. Download [`fouet.py`](https://matrac73.github.io/daily-builds/projects/2026-11-03-fouet/fouet.py)
   (or the "Download fouet.py" button on the demo page). You need Python 3.8+ (`winget install Python.Python.3.12`).
2. Run it:

   ```powershell
   py fouet.py                     # start (or double-click the file)
   pyw fouet.py                    # same, without a console window
   py fouet.py --sensitivity 1.5   # cracks with gentler flicks (0.7 = needs harder ones)
   py fouet.py --no-sound          # silent whip
   py fouet.py --anywhere          # type wherever it cracks, even without a text cursor
   ```

3. Click the pixel button in the bottom-right corner of your screen (or <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>W</kbd>).
   Flick, stop dead. When the tip cracks over a zone showing a text cursor (I-beam), Fouet clicks there, jumps to
   the end of the line and types the phrase. <kbd>Esc</kbd> puts the whip away; right-click the button to quit.

The overlay is click-through and never takes focus, so your mouse and keyboard keep working normally while the
whip is out. It covers every monitor and adapts to your display scaling (DPI).

## Browser quick start

Open the [online demo](https://matrac73.github.io/daily-builds/projects/2026-11-03-fouet/), press the pixel button
bottom-right (or <kbd>Alt</kbd>+<kbd>W</kbd>), then crack on the demo text fields. To run it locally (ES modules
don't load from `file://`):

```bash
npx --yes http-server -c-1 -p 8080 .    # or: py -m http.server 8080
```

**On any website**: drag the **Fouet** bookmarklet from the demo page to your bookmarks bar and click it on any page.
Sites with a strict Content-Security-Policy may refuse to load it.

**In your own page**:

```html
<script type="module">
  import { mount } from './src/fouet.js';
  const fouet = mount({ minSpeed: 1100, sound: true }); // adds the button, nothing else
  fouet.toggle();     // programmatic on/off
  fouet.destroy();    // remove everything
</script>
```

## Features

- **Brake-to-crack rule**: a crack needs a hand-speed peak above `minSpeed`, followed within 200 ms by a stop
  (speed under 30 % of the peak) or a pull-back. Hand speed is measured over a 35 ms window, so a frame that
  gets no mouse update doesn't read as a stop.
- **Lash snap**: after the brake, the lash is pulled straight along the swing line and cracks once it reaches 85 %
  of its length, so the crack lands where you aim (±25° in every direction, checked by the tests).
- **Stiffer, cleaner lash**: Verlet rope with an exact bend limit at every joint, 14° at the handle up to 48° at
  the tip. It unrolls instead of folding onto itself.
- **Pixel art**: everything is drawn on a coarse pixel grid. Bresenham lash with a tapered width, highlight core
  and dark outline, a wrapped wooden handle, fire-palette sparks and embers, a midpoint-circle shock ring with an
  ordered-dither dissolve, and a built-in 5×7 pixel font for the floating phrases.
- **8-bit sound**: a sample-and-hold noise snap with a falling square chirp, quantized to 4 bits, plus a coin-style
  arpeggio that rises with your combo tier. Synthesized in code (no audio files).
- **Hero animation**: a scripted hand swings and stops on the demo page; the real crack rule decides when it cracks.

## Project structure

```
fouet.py            Desktop app — physics, crack rule, pixel art, 8-bit sound, Win32 overlay (stdlib only)
index.html          Demo page (served as-is, relative paths only)
style.css           Pixel-style page theme (light and dark)
app.js              Demo entry: mounts the whip, hero animation, bookmarklet link
src/
  whip.js           Verlet rope with bend limit, reach/steer (pure, no DOM)
  crack.js          Velocity tracker, flick detector, lash snap, crack intensity
  pixel.js          Palette, raster primitives, whip sprite, 5×7 font, button icon
  sound.js          8-bit crack and blip synthesis
  phrases.js        Phrase tiers, combo counter, no-repeat picker
  text.js           Spacing-aware insertion, which elements are whippable
  bookmarklet.js    Builds the javascript: URL for the bookmarklet
  fouet.js          Browser layer: pixel overlay, button, sound, typing
tests/
  test_fouet.py     pytest suite for the desktop script
  *.test.js         node:test suites for the browser modules
```

## Tests

```bash
npm test                 # node --test tests/   (Node.js ≥ 20)
py -m pytest tests       # desktop script       (pip install pytest)
```

Both suites drive the simulated whip with synthetic hand motions. They check that accelerating or steady motion
never cracks, that a swing followed by a stop or a pull-back cracks exactly once, that the crack lands within 25°
of the aim in 8 directions at 3 speeds, that a stuttering mouse doesn't crack mid-swing, that the bend limit holds,
and that the pixel sprite is fully outlined.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code).
