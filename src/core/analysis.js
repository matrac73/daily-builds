// High-level helpers combining backtest, metrics and cost sensitivity.

import { computeMetrics } from './metrics.js';
import { oneWayCost, runBacktest } from './strategy.js';

/**
 * Re-run the whole walk-forward backtest for several one-way cost levels
 * (in bps) to locate the break-even cost of the signal.
 */
export function costSensitivity(bars, config, levelsBps, { barsPerYear }) {
  return levelsBps.map((bps) => {
    const { records } = runBacktest(bars, { ...config, costs: { feeBps: bps } });
    const m = computeMetrics(records, { barsPerYear, horizon: config.horizon });
    return { bps, totalReturn: m?.totalReturn ?? 0, sharpe: m?.sharpe ?? 0, trades: m?.trades ?? 0 };
  });
}

/**
 * One-way cost (bps) at which the net return first drops to zero, linearly
 * interpolated on the sweep. null if the strategy never makes money,
 * Infinity if it is still profitable at the highest tested cost.
 */
export function breakEvenCost(sweep) {
  if (sweep.length === 0 || sweep[0].totalReturn <= 0) return null;
  for (let i = 1; i < sweep.length; i++) {
    const a = sweep[i - 1];
    const b = sweep[i];
    if (b.totalReturn <= 0) return a.bps + ((b.bps - a.bps) * a.totalReturn) / (a.totalReturn - b.totalReturn);
  }
  return Infinity;
}

export const DEFAULT_COST_LEVELS = [0, 0.5, 1, 2, 3, 5, 7.5, 10, 15, 20];

/** Default sweep, always including the user's current one-way cost. */
export function costLevelsFor(costs) {
  const current = Math.round(oneWayCost(costs) * 1e4 * 100) / 100;
  return [...new Set([...DEFAULT_COST_LEVELS, current])].sort((a, b) => a - b);
}
