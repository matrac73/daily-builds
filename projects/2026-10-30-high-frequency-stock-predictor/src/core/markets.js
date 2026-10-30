// Trading calendars and default transaction-cost presets.

export const INTERVAL_MINUTES = { '1m': 1, '5m': 5, '15m': 15 };

/** Number of bars per day / week / year for a market type and bar size. */
export function calendar(market, intervalMinutes) {
  const minutesPerDay = market === 'crypto' ? 24 * 60 : 390; // US equities: 9:30-16:00
  const daysPerWeek = market === 'crypto' ? 7 : 5;
  const daysPerYear = market === 'crypto' ? 365 : 252;
  const barsPerDay = minutesPerDay / intervalMinutes;
  return {
    barsPerDay,
    barsPerWeek: Math.round(barsPerDay * daysPerWeek),
    barsPerYear: Math.round(barsPerDay * daysPerYear),
  };
}

/** Bar size in minutes, inferred from the median spacing of timestamps (ignores session gaps). */
export function inferIntervalMinutes(bars) {
  const gaps = [];
  for (let i = 1; i < bars.length; i++) gaps.push(bars[i].time - bars[i - 1].time);
  if (gaps.length === 0) return 1;
  gaps.sort((a, b) => a - b);
  return Math.max(1, Math.round(gaps[Math.floor(gaps.length / 2)] / 60_000));
}

/**
 * Realistic retail costs in basis points.
 * crypto: Binance spot taker fee 0.10 %, tight spread on majors.
 * stock: low-cost broker (~0.5 bp commission), large-cap US spread.
 */
export const COST_PRESETS = {
  crypto: { feeBps: 10, spreadBps: 1, slippageBps: 1 },
  stock: { feeBps: 0.5, spreadBps: 2, slippageBps: 1 },
};
