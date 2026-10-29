// OHLCV CSV <-> bar objects. Bars: { date: 'YYYY-MM-DD', open, high, low, close, volume }.

const COLUMNS = ['date', 'open', 'high', 'low', 'close', 'volume'];

export function parseBarsCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('CSV needs a header and at least one row');
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
  const idx = {};
  for (const col of COLUMNS) {
    // Accept "Adj Close" as a fallback for close (Yahoo exports).
    const i = header.indexOf(col === 'close' && !header.includes('close') ? 'adjclose' : col);
    if (i === -1 && col !== 'volume') throw new Error(`Missing column "${col}"`);
    idx[col] = i;
  }
  const bars = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const bar = { date: cells[idx.date].trim() };
    for (const col of COLUMNS.slice(1)) {
      bar[col] = idx[col] === -1 ? 0 : Number(cells[idx[col]]);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bar.date)) throw new Error(`Bad date "${bar.date}"`);
    if ([bar.open, bar.high, bar.low, bar.close].every((v) => Number.isFinite(v) && v > 0)) bars.push(bar);
  }
  return sortAndDedupe(bars);
}

export function barsToCsv(bars) {
  const rows = bars.map((b) => [b.date, b.open, b.high, b.low, b.close, b.volume].join(','));
  return ['Date,Open,High,Low,Close,Volume', ...rows].join('\n') + '\n';
}

/** Sort by date and keep the last occurrence of any duplicated date. */
export function sortAndDedupe(bars) {
  const byDate = new Map(bars.map((b) => [b.date, b]));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
