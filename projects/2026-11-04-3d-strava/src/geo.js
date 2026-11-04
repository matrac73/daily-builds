// Geodesy and track sampling helpers (pure functions).

const EARTH_RADIUS = 6371008.8; // metres
const RAD = Math.PI / 180;

/** Great-circle distance in metres between two {lat, lon} points. */
export function haversine(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing in degrees [0, 360) from a to b. */
export function bearing(a, b) {
  const φ1 = a.lat * RAD;
  const φ2 = b.lat * RAD;
  const Δλ = (b.lon - a.lon) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/**
 * Enrich raw points with cumulative distance and compute summary stats.
 * Consecutive duplicate positions are dropped so distances stay strictly increasing.
 * @param {{lat:number, lon:number, ele:number|null, time:number|null}[]} rawPoints
 */
export function buildTrack(rawPoints) {
  const points = [];
  const dist = [];
  let total = 0;
  for (const p of rawPoints) {
    const prev = points[points.length - 1];
    if (prev) {
      const step = haversine(prev, p);
      if (step < 0.01) continue;
      total += step;
    }
    points.push(p);
    dist.push(total);
  }
  if (points.length < 2) throw new Error('La trace est trop courte pour être animée.');

  const eles = points.map((p) => p.ele).filter((e) => e != null);
  const times = points.map((p) => p.time).filter((t) => t != null);
  return {
    points,
    dist,
    total,
    elevationGain: elevationGain(points.map((p) => p.ele)),
    minEle: eles.length ? Math.min(...eles) : null,
    maxEle: eles.length ? Math.max(...eles) : null,
    duration: times.length >= 2 ? times[times.length - 1] - times[0] : null,
    startTime: times.length ? times[0] : null,
    bounds: boundsOf(points),
  };
}

/**
 * Positive elevation gain with a hysteresis threshold that filters GPS noise.
 * @param {(number|null)[]} eles
 * @param {number} [threshold=3] metres
 */
export function elevationGain(eles, threshold = 3) {
  let gain = 0;
  let ref = null;
  for (const e of eles) {
    if (e == null) continue;
    if (ref == null) ref = e;
    else if (e - ref >= threshold) {
      gain += e - ref;
      ref = e;
    } else if (ref - e >= threshold) ref = e;
  }
  return gain;
}

/** [[west, south], [east, north]] */
export function boundsOf(points) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.lon);
    e = Math.max(e, p.lon);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [[w, s], [e, n]];
}

/**
 * Interpolated point at a given distance along the track (clamped).
 * @returns {{lat:number, lon:number, ele:number|null, time:number|null}}
 */
export function pointAt(track, d) {
  const { points, dist, total } = track;
  if (d <= 0) return { ...points[0] };
  if (d >= total) return { ...points[points.length - 1] };

  let lo = 0;
  let hi = dist.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (dist[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const t = (d - dist[lo]) / (dist[hi] - dist[lo]);
  return {
    lat: lerp(a.lat, b.lat, t),
    lon: lerp(a.lon, b.lon, t),
    ele: a.ele != null && b.ele != null ? lerp(a.ele, b.ele, t) : (a.ele ?? b.ele),
    time: a.time != null && b.time != null ? lerp(a.time, b.time, t) : null,
  };
}

/**
 * Resample the track to `count` points evenly spaced by distance.
 * Gives the renderer a light, uniform polyline whatever the GPS sampling rate.
 */
export function resample(track, count) {
  const n = Math.max(2, Math.floor(count));
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(pointAt(track, (track.total * i) / (n - 1)));
  return buildTrack(pts);
}

/** Exponentially move an angle (degrees) towards a target along the shortest arc. */
export function smoothAngle(current, target, alpha) {
  const delta = ((target - current + 540) % 360) - 180;
  return (current + delta * alpha + 360) % 360;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
