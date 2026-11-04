// Strava link helpers.
// Strava does not expose activity data without OAuth, so a link is turned into
// the official "Export GPX" URL that the logged-in owner can download in one click.

const STRAVA_HOST = /^(?:www\.|m\.)?strava\.com$/i;
const SHORT_HOST = /^strava\.app\.link$/i;
const KIND_BY_SEGMENT = { activities: 'activity', routes: 'route' };

/**
 * Parse a Strava activity/route link (or a bare activity id).
 * @param {string} input
 * @returns {{kind: 'activity'|'route', id: string, pageUrl: string, exportUrl: string}
 *   | {kind: 'short', pageUrl: string} | null}
 */
export function parseStravaLink(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  if (/^\d{5,}$/.test(raw)) return describe('activity', raw);

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (SHORT_HOST.test(url.hostname)) return { kind: 'short', pageUrl: url.href };
  if (!STRAVA_HOST.test(url.hostname)) return null;

  const [segment, id] = url.pathname.split('/').filter(Boolean);
  const kind = KIND_BY_SEGMENT[segment];
  if (!kind || !/^\d+$/.test(id ?? '')) return null;
  return describe(kind, id);
}

function describe(kind, id) {
  const base = `https://www.strava.com/${kind === 'activity' ? 'activities' : 'routes'}/${id}`;
  return { kind, id, pageUrl: base, exportUrl: `${base}/export_gpx` };
}
