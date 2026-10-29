// Decision rules layered on top of the model: guardrails, edge gating and the BUY / SELL / HOLD call.

/** Minimum out-of-sample evidence before a model's forecast is trusted over the random walk. */
export const EDGE_RULES = { minR2oos: 0, minHitRate: 0.5, minTestDays: 60 };

/** Does the walk-forward evaluation show the model beats the zero-return baseline? */
export function hasEdge(metrics, rules = EDGE_RULES) {
  const reasons = [];
  if (metrics.n < rules.minTestDays) reasons.push(`only ${metrics.n} out-of-sample days (< ${rules.minTestDays})`);
  if (!(metrics.r2oos > rules.minR2oos)) reasons.push('does not beat the random walk on squared error');
  if (!(metrics.hitRate > rules.minHitRate)) reasons.push('direction hit rate not above 50%');
  return { ok: reasons.length === 0, reasons };
}

/** Clip a forecast return to +/- `maxSigma` daily standard deviations (outlier guardrail). */
export function clipReturn(value, dailyStd, maxSigma = 2) {
  const cap = maxSigma * dailyStd;
  return Math.max(-cap, Math.min(cap, value));
}

/**
 * Map a forecast return to a position: trade only if the expected move clears costs plus a threshold.
 * @returns {-1|0|1}
 */
export function position(expectedReturn, { threshold, cost }) {
  const hurdle = threshold + 2 * cost; // round-trip cost
  if (expectedReturn > hurdle) return 1;
  if (expectedReturn < -hurdle) return -1;
  return 0;
}

export const SIGNAL_LABELS = { 1: 'BUY', 0: 'HOLD', '-1': 'SELL' };
