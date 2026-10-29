// Time-series validation: expanding-window walk-forward splits and forecast metrics.

/**
 * Expanding-window walk-forward splits: train on [0, trainEnd), test on [trainEnd, testEnd).
 * Test blocks are contiguous, never overlap, and always lie strictly after their training data.
 */
export function walkForwardSplits(n, { minTrain, testSize }) {
  if (minTrain < 1 || testSize < 1) throw new Error('minTrain and testSize must be >= 1');
  const splits = [];
  for (let trainEnd = minTrain; trainEnd < n; trainEnd += testSize) {
    splits.push({ trainEnd, testEnd: Math.min(trainEnd + testSize, n) });
  }
  return splits;
}

/**
 * @param {number[]} actual realised log returns
 * @param {number[]} predicted forecast log returns
 * @param {number[]} [reference] reference forecasts (default: zero / random walk) for out-of-sample R²
 */
export function forecastMetrics(actual, predicted, reference = actual.map(() => 0)) {
  const n = actual.length;
  let abs = 0;
  let sq = 0;
  let sqRef = 0;
  let hits = 0;
  let calls = 0;
  for (let i = 0; i < n; i++) {
    const e = actual[i] - predicted[i];
    abs += Math.abs(e);
    sq += e * e;
    sqRef += (actual[i] - reference[i]) ** 2;
    if (predicted[i] !== 0 && actual[i] !== 0) {
      calls += 1;
      if (Math.sign(predicted[i]) === Math.sign(actual[i])) hits += 1;
    }
  }
  return {
    n,
    mae: abs / n,
    rmse: Math.sqrt(sq / n),
    hitRate: calls ? hits / calls : null,
    r2oos: sqRef > 0 ? 1 - sq / sqRef : 0,
  };
}

/**
 * Long/flat/short backtest of daily signals with proportional transaction costs.
 * @param {number[]} returns realised next-day log returns
 * @param {number[]} positions position held over each return (-1, 0 or 1)
 * @param {number} cost cost per unit of position change (e.g. 0.0005 = 5 bps)
 */
export function backtest(returns, positions, cost = 0) {
  let logEquity = 0;
  let prev = 0;
  let trades = 0;
  for (let i = 0; i < returns.length; i++) {
    const turnover = Math.abs(positions[i] - prev);
    if (turnover > 0) trades += 1;
    logEquity += positions[i] * returns[i] + Math.log(1 - cost * turnover);
    prev = positions[i];
  }
  const buyHold = returns.reduce((a, b) => a + b, 0);
  return { strategyReturn: Math.expm1(logEquity), buyHoldReturn: Math.expm1(buyHold), trades };
}
