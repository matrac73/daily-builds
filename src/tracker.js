// Live track record: every daily forecast is logged, then settled once the next close is known.

/** Build a log entry from a pipeline result. */
export function toLogEntry(symbol, result, madeAt) {
  const f = result.forecast;
  return {
    symbol,
    madeAt,
    basedOn: result.asOf,
    lastClose: result.lastClose,
    predictedClose: f.predictedClose,
    lower: f.lower,
    upper: f.upper,
    signal: f.signal,
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

/** Live accuracy of settled forecasts. */
export function trackStats(entries) {
  const settled = entries.filter((e) => e.actualClose !== null);
  if (settled.length === 0) return { settled: 0, pending: entries.length };
  let absPct = 0;
  let inBand = 0;
  let calls = 0;
  let hits = 0;
  for (const e of settled) {
    absPct += Math.abs(e.predictedClose - e.actualClose) / e.actualClose;
    if (e.actualClose >= e.lower && e.actualClose <= e.upper) inBand += 1;
    const predictedMove = Math.sign(e.predictedClose - e.lastClose);
    const actualMove = Math.sign(e.actualClose - e.lastClose);
    if (predictedMove !== 0 && actualMove !== 0) {
      calls += 1;
      if (predictedMove === actualMove) hits += 1;
    }
  }
  return {
    settled: settled.length,
    pending: entries.length - settled.length,
    mape: absPct / settled.length,
    intervalCoverage: inBand / settled.length,
    hitRate: calls ? hits / calls : null,
  };
}
