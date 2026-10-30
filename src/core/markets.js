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

/**
 * Realistic retail costs in basis points.
 * crypto: Binance spot taker fee 0.10 %, tight spread on majors.
 * stock: low-cost broker (~0.5 bp commission), large-cap US spread.
 */
export const COST_PRESETS = {
  crypto: { feeBps: 10, spreadBps: 1, slippageBps: 1 },
  stock: { feeBps: 0.5, spreadBps: 2, slippageBps: 1 },
};
