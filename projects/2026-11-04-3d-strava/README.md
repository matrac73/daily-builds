# 3D Strava

Turn a Strava run or ride into a smooth 3D fly-over that follows your route from start to finish in one minute, with summer, winter, autumn and night map styles.

It's a static web app: no build step, no backend, no API key. Your GPS file never leaves the browser.

## Features

- **Strava link → GPX in one click.** Paste an activity or route link (`strava.com/activities/…`, `strava.com/routes/…`, or a bare activity id). The app gives you the official *Export GPX* link for that activity. Strava only shares GPS data with the activity owner, and only through OAuth, so this is the reliable way without a server.
- **Drag & drop GPX / TCX import.** Handles Strava exports, Garmin/Coros/Suunto files and route exports (`<rtept>`).
- **Real 3D terrain.** Uses [MapLibre GL JS](https://maplibre.org/) 5 with AWS Terrain Tiles (elevation exaggerated ×1.4), hillshading, a sky with fog, and Esri World Imagery satellite tiles.
- **Four map styles**, each with its own colours, sky and route palette:
  - ☀️ *Été* (summer): saturated satellite imagery and a blue sky
  - ❄️ *Hiver* (winter): imagery desaturated and brightened to look snow-covered, with blue shadows
  - 🍂 *Automne* (autumn): warm hue shift and a golden sky
  - 🌙 *Nuit* (night): dark blue imagery with a neon route
- **A smooth cinematic camera:**
  - The motion speeds up and slows down gently at the start and end, and moves at a constant speed in between (a "trapezoidal" velocity profile).
  - The heading looks ahead along the route and is smoothed so hairpin bends don't make the camera spin. The smoothing gives the same result at any frame rate.
  - The camera height follows the terrain, so it never dips underground in the mountains.
  - The fly-over opens with a short flight to the start and ends by zooming out to an overview.
- **Live HUD** showing distance, altitude, elapsed activity time and total climb (D+), plus a scrubber to jump anywhere in the animation. Press <kbd>Space</kbd> to play or pause.
- **Duration** of 30 s, 1 min (default) or 1 min 30.
- **Bonus: video export.** Records the fly-over with a stats overlay and downloads it as MP4 (Chrome, Edge, Safari) or WebM (Firefox).

## Quick start

Any static file server works. With Node.js ≥ 20:

```bash
git clone <this-repo> 3d-strava
cd 3d-strava
npm start            # serves the folder on http://localhost:5173
```

Or without npm:

```bash
python -m http.server 5173
```

Then open http://localhost:5173. The demo track (Chamonix → Lac Blanc) loads automatically.

> You need a server: opening `index.html` directly with `file://` won't work, because browsers block ES modules and `fetch` from `file://`.

### Deploy

All paths in the app are relative, so it runs as-is from a domain root or from a sub-folder:

```bash
npx vercel --prod      # Vercel: zero config, served as a static site
```

You can also push it to GitHub Pages; there's no build step.

## Usage

1. Paste your activity link, for example `https://www.strava.com/activities/12345678901`, and click **OK**.
2. Click **Télécharger le GPX** (you must be logged in to Strava as the activity owner), then drop the downloaded `.gpx` file onto the page.
3. Pick a style (**Été / Hiver / Automne / Nuit**) and a duration.
4. Click **▶ Lancer le survol** to watch it, or **⏺ Exporter la vidéo** to record and download it. Keep the tab visible while it records.

Strava mobile share links (`strava.app.link/…`) are recognised too. The app asks you to open the link once to get the full activity URL.

## Project structure

```
index.html                 UI markup (French), loads MapLibre from the CDN
styles.css                 Glassmorphism panel + HUD, responsive
app.js                     UI wiring: link → import → playback → video export
src/
  strava.js                Strava URL parsing → GPX export URL
  track-parser.js          Dependency-free GPX/TCX parser (browser + Node)
  geo.js                   Haversine, bearing, track stats, resampling, angle smoothing
  animation.js             Timeline velocity profile, zoom, look-ahead camera target
  map-styles.js            Seasonal 3D styles (imagery grading, hillshade, sky) + route gradient
  format.js                French formatting for distance, duration, pace, altitude
  player.js                MapLibre fly-over player (intro, follow cam, outro, seek)
  video.js                 Canvas compositing + MediaRecorder export
demo/chamonix-lac-blanc.gpx  Demo trail-running track
test/                      node:test suites for all pure modules
```

## Tests

The pure logic (parsing, geodesy, timeline, camera maths, styles, formatting, video helpers) is covered by Node's built-in test runner. There are no dependencies to install.

```bash
npm test             # or: node --test
```

## Credits & data

- Rendering: [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) (BSD-3-Clause)
- Elevation: [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen; sources include SRTM, NED, EU-DEM)
- Imagery: Esri World Imagery (© Esri, Maxar, Earthstar Geographics). Check Esri's terms before commercial use.
- Strava is a trademark of Strava, Inc. This project is not affiliated with Strava.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code).
