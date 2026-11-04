// Dependency-free GPX / TCX parsing (works in the browser and in Node tests).

/**
 * @typedef {{lat: number, lon: number, ele: number|null, time: number|null}} TrackPoint
 * @typedef {{name: string, points: TrackPoint[]}} ParsedTrack
 */

/**
 * Parse a GPX or TCX document.
 * @param {string} text
 * @returns {ParsedTrack}
 */
export function parseTrackFile(text) {
  const xml = String(text ?? '');
  if (/<TrainingCenterDatabase[\s>]/i.test(xml)) return parseTcx(xml);
  if (/<gpx[\s>]/i.test(xml)) return parseGpx(xml);
  throw new Error('Format non reconnu : fournis un fichier GPX ou TCX.');
}

/** @param {string} xml @returns {ParsedTrack} */
export function parseGpx(xml) {
  const points = [];
  // Track points first; fall back to route points (Strava route exports).
  for (const tag of ['trkpt', 'rtept']) {
    const re = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, 'gi');
    for (const [, attrs, body = ''] of xml.matchAll(re)) {
      const lat = num(attr(attrs, 'lat'));
      const lon = num(attr(attrs, 'lon'));
      if (!validCoord(lat, lon)) continue;
      points.push({ lat, lon, ele: num(tagText(body, 'ele')), time: date(tagText(body, 'time')) });
    }
    if (points.length) break;
  }
  return finish(firstName(xml, ['trk', 'rte', 'metadata']), points);
}

/** @param {string} xml @returns {ParsedTrack} */
export function parseTcx(xml) {
  const points = [];
  for (const [, body] of xml.matchAll(/<Trackpoint\b[^>]*>([\s\S]*?)<\/Trackpoint>/gi)) {
    const lat = num(tagText(body, 'LatitudeDegrees'));
    const lon = num(tagText(body, 'LongitudeDegrees'));
    if (!validCoord(lat, lon)) continue;
    points.push({
      lat,
      lon,
      ele: num(tagText(body, 'AltitudeMeters')),
      time: date(tagText(body, 'Time')),
    });
  }
  const name = tagText(xml, 'Notes') ?? tagText(xml, 'Id') ?? '';
  return finish(name, points);
}

function finish(name, points) {
  if (points.length < 2) throw new Error('Le fichier ne contient pas de trace GPS exploitable.');
  return { name: decodeEntities(name ?? '').trim(), points };
}

function attr(attrs, key) {
  const m = attrs.match(new RegExp(`\\b${key}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return m ? m[1] : null;
}

function tagText(xml, tag) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i'));
  if (!m) return null;
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/, '$1').trim();
}

function firstName(xml, containers) {
  for (const c of containers) {
    const block = xml.match(new RegExp(`<${c}\\b[^>]*>([\\s\\S]*?)</${c}>`, 'i'));
    const name = block && tagText(block[1], 'name');
    if (name) return name;
  }
  return '';
}

function num(s) {
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function date(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function validCoord(lat, lon) {
  return lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
