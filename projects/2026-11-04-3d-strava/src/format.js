// Human-friendly formatting for the HUD (French locale).

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '–';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 2 : 1).replace('.', ',')} km`;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '–';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}h${pad(m)}` : `${m}:${pad(sec)}`;
}

export function formatElevation(meters) {
  return Number.isFinite(meters) ? `${Math.round(meters)} m` : '–';
}

/** Pace in min/km, e.g. "5:12 /km". */
export function formatPace(meters, ms) {
  if (!(meters > 0) || !(ms > 0)) return '–';
  const secPerKm = ms / 1000 / (meters / 1000);
  if (secPerKm > 3600) return '–';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00 /km` : `${m}:${String(s).padStart(2, '0')} /km`;
}
