# Fouet

**A pixel-art whip for your mouse. Swing, stop dead, CLAC: crack on the field where your text cursor is and it types "faster", "do it", "make it"… right there.**

Two flavours, same physics and the same 8-bit look:

- **Desktop (Windows)**: [`FouetSetup.exe`](https://github.com/matrac73/daily-builds/releases/download/fouet-v2.2.0/FouetSetup.exe)
  (installer) or [`Fouet.exe`](https://github.com/matrac73/daily-builds/releases/download/fouet-v2.2.0/Fouet.exe) (portable),
  with no Python needed. You can also run `fouet.py` (single file, standard library only). The whip works on top of *every* app: Teams, VS Code, Outlook, your browser…
- **Browser**: try it online at <https://matrac73.github.io/daily-builds/projects/2026-11-03-fouet/>, or bring it to any site with the bookmarklet.

## How to crack

Click in a text field first: orange pixel corners mark it. Speeding up never cracks. **Braking does**: swing
hard, then stop dead or pull back. The lash then unrolls along the line of your swing and cracks at its tip, one
whip-length ahead of your hand. If the tip cracks on the marked field, the phrase is typed **at your text
cursor**. Fouet never clicks, so it can't move your cursor or type anywhere else. A half-hearted flick whose tip
never snaps doesn't crack at all, and there is at most one crack every 0.6 s. Chain hits within ~2 s to
escalate: `faster` → `FASTER!` → `FASTER!!!`.

## Desktop quick start

1. Click **Install for Windows** on the [demo page](https://matrac73.github.io/daily-builds/projects/2026-11-03-fouet/)
   and run `FouetSetup.exe`. It installs per-user (no admin), adds a Start menu entry, can start Fouet with Windows,
   and uninstalls from *Settings › Apps*. If you'd rather not install anything, run the portable `Fouet.exe`.
   The exe isn't code-signed, so SmartScreen may show "Windows protected your PC": click **More info › Run anyway**.
2. Or, with Python 3.8+, run the script directly:

   ```powershell
   py fouet.py                     # start (or double-click the file)
   pyw fouet.py                    # same, without a console window
   py fouet.py --sensitivity 1.5   # cracks with gentler flicks (0.7 = needs harder ones)
   py fouet.py --no-sound          # silent whip
   py fouet.py --anywhere          # type at your text cursor wherever the tip cracks
   ```

3. Click in a text field of any app, then click the pixel button in the bottom-right corner of your screen (or
   <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>W</kbd>). Orange pixel corners mark the field that has your text cursor
   (found through Windows UI Automation: text boxes, documents, browser fields; never password boxes or plain web
   pages). Swing hard, stop dead: if the tip cracks on that field, Fouet types the phrase at your cursor.
   <kbd>Esc</kbd> puts the whip away. Right-click the button for *Start with Windows* and *Quit*. Only one Fouet
   runs at a time.

### Building the exe and the installer

```powershell
py -m pip install pyinstaller pillow        # once
winget install JRSoftware.InnoSetup         # once
pwsh packaging\build.ps1                    # -> dist\Fouet.exe, dist\FouetSetup.exe
```

`packaging/make_icon.py` renders the pixel button into the `.ico`. `packaging/fouet.iss` is the Inno Setup script:
a per-user install with a Start menu shortcut, an optional autostart (the same registry value the in-app toggle
uses) and a clean uninstall.

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

- **Brake-to-crack rule**: a crack needs a hand-speed peak above `minSpeed` (1500 px/s), followed within 200 ms
  by a dead stop (speed under 20 % of the peak) or a real pull-back, and at most one crack every 0.6 s. Hand speed
  is measured over a 35 ms window, so a frame that gets no mouse update doesn't read as a stop.
- **Lash snap**: after the brake, the lash unrolls along the swing line and cracks only once its tip reaches 90 %
  of its length. If it never gets there within 0.3 s, the flick fizzles. The crack lands where you aim (±25° in
  every direction, checked by the tests).
- **Types only where your cursor is**: the phrase goes to the focused text field, at the text cursor, and only
  when the tip cracks on that field. Nothing is ever clicked.
- **Calmer, cleaner lash**: Verlet rope with more air drag and an exact bend limit at every joint, 14° at the
  handle up to 48° at the tip. It swings less nervously and unrolls instead of folding onto itself.
- **Pixel art**: everything is drawn on a coarse pixel grid. Bresenham lash with a tapered width, highlight core
  and dark outline, a wrapped wooden handle, fire-palette sparks and embers, a midpoint-circle shock ring with an
  ordered-dither dissolve, and a built-in 5×7 pixel font for the floating phrases.
- **8-bit sound**: a sample-and-hold noise snap with a falling square chirp, quantized to 4 bits, plus a coin-style
  arpeggio that rises with your combo tier. Synthesized in code (no audio files).
- **Hero animation**: a scripted hand swings and stops on the demo page; the real crack rule decides when it cracks.

## Project structure

```
fouet.py            Desktop app — physics, crack rule, pixel art, 8-bit sound, Win32 overlay (stdlib only)
packaging/          build.ps1 (PyInstaller + Inno Setup), fouet.iss, make_icon.py
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

Both suites drive the simulated whip with synthetic hand motions. They check that accelerating, steady or
moderate motion never cracks, that a swing followed by a stop or a pull-back cracks exactly once, that frantic
shaking cracks at most a few times, that the crack lands within 25° of the aim in 8 directions at 3 speeds, that a
stuttering mouse doesn't crack mid-swing, which focused elements count as text fields, that the bend limit holds,
and that the pixel sprite is fully outlined.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code).
