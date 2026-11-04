// MapLibre-powered 3D fly-over player. `maplibregl` is loaded globally from the CDN.
import { buildTrack, resample, smoothAngle } from './geo.js';
import { cameraTarget, progressAt, smoothingFactor, zoomForDistance } from './animation.js';
import { THEMES, DEFAULT_THEME, TERRAIN_EXAGGERATION, buildStyle, progressGradient } from './map-styles.js';

const PITCH = 62;
const INTRO_MS = 2200;
const OUTRO_MS = 2600;
const HEADING_TAU = 1.1; // seconds: camera heading inertia
const ELEVATION_TAU = 0.6; // seconds: camera height inertia

export class FlyoverPlayer {
  /**
   * @param {HTMLElement} container
   * @param {{onFrame?: (f: object) => void, onStateChange?: (state: string) => void}} [hooks]
   */
  constructor(container, hooks = {}) {
    this.hooks = hooks;
    this.theme = DEFAULT_THEME;
    this.durationMs = 60_000;
    this.track = null;
    this.elapsed = 0;
    this.heading = 0;
    this.state = 'idle'; // idle | intro | playing | paused | outro | ended
    this.raf = 0;
    this.map = new maplibregl.Map({
      container,
      style: this.composeStyle(),
      center: [6.87, 45.95],
      zoom: 9,
      pitch: 45,
      maxPitch: 85,
      attributionControl: { compact: true },
    });
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  }

  get canvas() {
    return this.map.getCanvas();
  }

  /** Load raw track points, render the route and frame it. */
  load(rawPoints) {
    const full = buildTrack(rawPoints);
    const samples = Math.min(3000, Math.max(300, Math.round(full.total / 4)));
    this.track = { full, path: resample(full, samples) };
    this.stop();
    this.progress = 0;
    this.runner = null;
    this.refreshStyle();
    this.overview(0);
    this.emitFrame(0);
    return full;
  }

  setTheme(key) {
    if (!THEMES[key]) return;
    this.theme = key;
    this.refreshStyle();
  }

  setDuration(ms) {
    const progress = this.elapsed / this.durationMs;
    this.durationMs = ms;
    this.elapsed = progress * ms;
  }

  /** Start (or resume) the fly-over. Resolves when the animation and outro are over. */
  play() {
    if (!this.track) return Promise.resolve();
    if (this.state === 'playing' || this.state === 'intro') return this.finished;
    if (this.state !== 'paused') {
      this.elapsed = 0;
      this.finished = new Promise((resolve) => (this.resolveFinished = resolve));
      this.intro();
    } else {
      this.setState('playing');
      this.loop();
    }
    return this.finished;
  }

  pause() {
    if (this.state !== 'playing') return;
    cancelAnimationFrame(this.raf);
    this.setState('paused');
  }

  /** Jump to a normalised time (0..1) and render that frame, paused. */
  seek(t) {
    if (!this.track) return;
    this.map.stop();
    cancelAnimationFrame(this.raf);
    if (!this.resolveFinished) this.finished = new Promise((resolve) => (this.resolveFinished = resolve));
    this.setState('paused');
    this.elapsed = Math.min(1, Math.max(0, t)) * this.durationMs;
    this.renderFrame(0, true);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.map.stop();
    this.resolveFinished?.();
    this.resolveFinished = null;
    this.elapsed = 0;
    this.setState('idle');
  }

  // --- internals -----------------------------------------------------------

  intro() {
    this.setState('intro');
    const target = cameraTarget(this.track.path, 0);
    this.heading = target.heading;
    this.elevation = this.groundElevation(target.position);
    this.updateRoute(0, target.position);
    this.map.flyTo({
      center: [target.position.lon, target.position.lat],
      elevation: this.elevation,
      zoom: zoomForDistance(this.track.full.total),
      pitch: PITCH,
      bearing: target.heading,
      duration: INTRO_MS,
      essential: true,
    });
    this.map.once('moveend', () => {
      if (this.state !== 'intro') return;
      this.setState('playing');
      this.loop();
    });
  }

  loop() {
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.elapsed = Math.min(this.durationMs, this.elapsed + dt * 1000);
      this.renderFrame(dt, false);
      if (this.elapsed >= this.durationMs) this.outro();
      else this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  renderFrame(dt, snap) {
    const progress = progressAt(this.elapsed / this.durationMs);
    const target = cameraTarget(this.track.path, progress);
    this.heading = snap ? target.heading : smoothAngle(this.heading, target.heading, smoothingFactor(dt, HEADING_TAU));
    const ground = this.groundElevation(target.position);
    this.elevation = snap || this.elevation == null
      ? ground
      : this.elevation + (ground - this.elevation) * smoothingFactor(dt, ELEVATION_TAU);
    this.map.jumpTo({
      center: [target.position.lon, target.position.lat],
      elevation: this.elevation,
      bearing: this.heading,
      pitch: PITCH,
      zoom: zoomForDistance(this.track.full.total),
    });
    this.updateRoute(progress, target.position);
    this.emitFrame(progress);
  }

  /**
   * Terrain height under a point (already exaggerated). The camera orbits around this
   * height: MapLibre does not re-anchor the centre elevation on programmatic jumps,
   * which would otherwise put the camera underground in mountains.
   */
  groundElevation(position) {
    const fromDem = this.map.queryTerrainElevation([position.lon, position.lat]);
    return fromDem ?? (position.ele ?? 0) * TERRAIN_EXAGGERATION;
  }

  outro() {
    this.setState('outro');
    this.overview(OUTRO_MS);
    setTimeout(() => {
      if (this.state !== 'outro') return;
      this.setState('ended');
      this.resolveFinished?.();
      this.resolveFinished = null;
    }, OUTRO_MS + 200);
  }

  overview(duration) {
    this.map.fitBounds(this.track.full.bounds, {
      padding: overviewPadding(this.map.getContainer()),
      pitch: 50,
      bearing: this.heading,
      duration,
      maxZoom: 15,
    });
  }

  updateRoute(progress, position) {
    const colors = THEMES[this.theme].route;
    this.progress = progress;
    this.runner = position;
    if (!this.map.getLayer('route-progress')) return;
    const gradient = progressGradient(progress, colors);
    this.map.setPaintProperty('route-progress', 'line-gradient', gradient);
    this.map.setPaintProperty('route-glow', 'line-gradient', gradient);
    this.map.getSource('runner').setData(runnerGeoJson(position));
  }

  emitFrame(progress) {
    const { full } = this.track;
    this.hooks.onFrame?.({ progress, distance: progress * full.total, track: full, t: this.elapsed / this.durationMs });
  }

  setState(state) {
    this.state = state;
    this.hooks.onStateChange?.(state);
  }

  refreshStyle() {
    this.map.setStyle(this.composeStyle());
  }

  /** Base theme + route overlay as a single style document (MapLibre diffs updates). */
  composeStyle() {
    const style = buildStyle(this.theme);
    if (!this.track) return style;
    const colors = THEMES[this.theme].route;
    const coords = this.track.path.points.map((p) => [p.lon, p.lat]);
    const runner = this.runner ?? this.track.path.points[0];
    style.sources.route = {
      type: 'geojson',
      lineMetrics: true,
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
    };
    style.sources.runner = { type: 'geojson', data: runnerGeoJson(runner) };
    const round = { 'line-cap': 'round', 'line-join': 'round' };
    style.layers.push(
      { id: 'route-shadow', type: 'line', source: 'route', layout: round,
        paint: { 'line-color': 'rgba(0,0,0,0.35)', 'line-width': 9, 'line-blur': 6 } },
      { id: 'route-rest', type: 'line', source: 'route', layout: round,
        paint: { 'line-color': colors.rest, 'line-width': 3.5 } },
      { id: 'route-glow', type: 'line', source: 'route', layout: round,
        paint: { 'line-gradient': progressGradient(this.progress ?? 0, colors), 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.45 } },
      { id: 'route-progress', type: 'line', source: 'route', layout: round,
        paint: { 'line-gradient': progressGradient(this.progress ?? 0, colors), 'line-width': 5 } },
      { id: 'runner-halo', type: 'circle', source: 'runner',
        paint: { 'circle-radius': 16, 'circle-color': colors.head, 'circle-opacity': 0.3, 'circle-blur': 0.6, 'circle-pitch-alignment': 'map' } },
      { id: 'runner-dot', type: 'circle', source: 'runner',
        paint: { 'circle-radius': 7, 'circle-color': colors.done, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3, 'circle-pitch-alignment': 'map' } },
    );
    return style;
  }
}

/** Keep the route clear of the floating panel (left) and HUD (bottom) on wide screens. */
function overviewPadding(container) {
  const wide = container.clientWidth > 900;
  return { top: 70, bottom: 170, left: wide ? 420 : 40, right: wide ? 70 : 40 };
}

function runnerGeoJson(p) {
  return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } };
}

