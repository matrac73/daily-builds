// Live track record: every daily forecast is logged, then settled once the next close is known.
// Settled entries are graded so the history shows whether each BUY / SELL / HOLD call was right.

/** Hurdle used to grade HOLD calls of entries logged without one (threshold 0.2% + 2 x 5 bps costs). */
export const DEFAULT_HURDLE = 0.003;

/** Build a log entry from a pipeline result. */
export function toLogEntry(symbol, result, madeAt) {
  const f = result.forecast;
  const o = result.options;
  return {
    symbol,
    madeAt,
    basedOn: result.asOf,
    lastClose: result.lastClose,
    predictedClose: f.predictedClose,
    lower: f.lower,
    upper: f.upper,
    intervals: f.intervals ?? null,
    probUp: f.probUp ?? null,
    signal: f.signal,
    hurdle: o ? o.threshold + 2 * o.cost : null,
    targetDate: null,
    actualClose: null,
  };
}

/** Insert or replace the entry for (symbol, basedOn): re-running on the same day is idempotent. */
export function upsert(log, entry) {
  const rest = log.filter((e) => !(e.symbol === entry.symbol && e.basedOn === entry.basedOn));
  return [...rest, entry].sort((a, b) => a.basedOn.localeCompare(b.basedOn) || a.symbol.localeCompare(b.symbol));
}

/** Fill in the realised close: the first bar strictly after the forecast's base date. */
export function settle(log, symbol, bars) {
  return log.map((e) => {
    if (e.symbol !== symbol || e.actualClose !== null) return e;
    const next = bars.find((b) => b.date > e.basedOn);
    return next ? { ...e, targetDate: next.date, actualClose: next.close } : e;
  });
}

/**
 * Grade a settled entry (null while pending).
 * BUY is right if the price rose, SELL if it fell, HOLD if the move stayed inside the trading hurdle
 * (i.e. no trade was missed). `pnl` is the return earned by following the call (HOLD earns 0).
 */
export function evaluateEntry(e) {
  if (e.actualClose === null) return null;
  const move = e.actualClose / e.lastClose - 1;
  const hurdle = e.hurdle ?? DEFAULT_HURDLE;
  const correct = e.signal === 'BUY' ? move > 0 : e.signal === 'SELL' ? move < 0 : Math.abs(move) <= hurdle;
  const pnl = e.signal === 'BUY' ? move : e.signal === 'SELL' ? -move : 0;
  const inside = (lo, hi) => e.actualClose >= lo && e.actualClose <= hi;
  const intervals = { 0.95: inside(e.lower, e.upper) };
  for (const i of e.intervals ?? []) intervals[i.level] = inside(i.lower, i.upper);
  return { move, correct, pnl, error: e.predictedClose / e.actualClose - 1, intervals };
}

/** Entries with their grade attached, most recent first. */
export function withOutcomes(entries) {
  return entries.map((e) => ({ ...e, outcome: evaluateEntry(e) })).sort((a, b) => b.basedOn.localeCompare(a.basedOn));
}

/** Live accuracy of settled forecasts and of the recommendations they carried. */
export function trackStats(entries) {
  const settled = entries.filter((e) => e.actualClose !== null);
  if (settled.length === 0) return { settled: 0, pending: entries.length };
  let absPct = 0;
  let calls = 0;
  let hits = 0;
  let good = 0;
  let equity = 1;
  let trades = 0;
  let tradePnl = 0;
  const inBand = {};
  const banded = {};
  const bySignal = { BUY: { n: 0, correct: 0 }, SELL: { n: 0, correct: 0 }, HOLD: { n: 0, correct: 0 } };
  for (const e of settled) {
    const o = evaluateEntry(e);
    absPct += Math.abs(e.predictedClose - e.actualClose) / e.actualClose;
    const predictedMove = Math.sign(e.predictedClose - e.lastClose);
    const actualMove = Math.sign(e.actualClose - e.lastClose);
    if (predictedMove !== 0 && actualMove !== 0) {
      calls += 1;
      if (predictedMove === actualMove) hits += 1;
    }
    for (const [level, inside] of Object.entries(o.intervals)) {
      banded[level] = (banded[level] ?? 0) + 1;
      inBand[level] = (inBand[level] ?? 0) + (inside ? 1 : 0);
    }
    const s = bySignal[e.signal];
    if (s) {
      s.n += 1;
      if (o.correct) s.correct += 1;
    }
    if (o.correct) good += 1;
    equity *= 1 + o.pnl;
    if (e.signal !== 'HOLD') {
      trades += 1;
      tradePnl += o.pnl;
    }
  }
  const coverage = Object.fromEntries(Object.keys(banded).map((level) => [level, inBand[level] / banded[level]]));
  return {
    settled: settled.length,
    pending: entries.length - settled.length,
    mape: absPct / settled.length,
    intervalCoverage: coverage[0.95],
    coverage,
    hitRate: calls ? hits / calls : null,
    recommendations: {
      accuracy: good / settled.length,
      cumulativeReturn: equity - 1,
      trades,
      meanTradeReturn: trades ? tradePnl / trades : null,
      bySignal,
    },
  };
}

/** Per-symbol and overall statistics of a whole prediction log, for the history view. */
export function historySummary(log) {
  const symbols = [...new Set(log.map((e) => e.symbol))].sort();
  return {
    overall: trackStats(log),
    bySymbol: symbols.map((symbol) => ({ symbol, stats: trackStats(log.filter((e) => e.symbol === symbol)) })),
  };
}
