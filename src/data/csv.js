// CSV import: any file with a time column and at least a close column.
// Recognised headers (case-insensitive): time|timestamp|date|datetime, open, high, low, close|price, volume.

const ALIASES = {
  time: ['time', 'timestamp', 'date', 'datetime', 'open_time'],
  open: ['open'],
  high: ['high'],
  low: ['low'],
  close: ['close', 'price', 'adj close', 'last'],
  volume: ['volume', 'vol'],
};

function parseTime(value) {
  const num = Number(value);
  if (Number.isFinite(num)) return num < 1e11 ? num * 1000 : num; // seconds or ms epoch
  return Date.parse(value);
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV vide');
  const sep = lines[0].includes(';') ? ';' : ',';
  const header = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const col = Object.fromEntries(
    Object.entries(ALIASES).map(([field, names]) => [field, header.findIndex((h) => names.includes(h))]),
  );
  if (col.time < 0 || col.close < 0) throw new Error('CSV : colonnes "time" et "close" requises');

  const bars = lines.slice(1).map((line) => {
    const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const close = Number(cells[col.close]);
    const pick = (field) => (col[field] >= 0 ? Number(cells[col[field]]) : close);
    return {
      time: parseTime(cells[col.time]),
      open: pick('open'),
      high: pick('high'),
      low: pick('low'),
      close,
      volume: col.volume >= 0 ? Number(cells[col.volume]) : 0,
    };
  });
  return bars.filter((b) => Number.isFinite(b.time) && b.close > 0).sort((a, b) => a.time - b.time);
}
