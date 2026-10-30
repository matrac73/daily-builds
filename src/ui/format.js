// Display helpers (French locale).

const nf = (digits) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: 'negative' });

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const pct = (v, digits = 2) => (Number.isFinite(v) ? `${nf(digits).format(v * 100)} %` : '—');
export const bps = (v, digits = 2) => (Number.isFinite(v) ? `${nf(digits).format(v * 1e4)} bp` : '—');
export const num = (v, digits = 2) => (Number.isFinite(v) ? nf(digits).format(v) : '—');
export const signed = (text, v) => (v > 0 ? `+${text}` : text);

export function money(v, currency = 'USD') {
  if (!Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0, signDisplay: 'negative' }).format(v);
}

export function price(v) {
  if (!Number.isFinite(v)) return '—';
  const digits = v >= 1000 ? 2 : v >= 1 ? 3 : 6;
  return nf(digits).format(v);
}

export function dateTime(ms, timeZone) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone }).format(ms);
}

export const tone = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
