// One-week PnL extrapolation by stationary block bootstrap (Politis & Romano, 1994):
// resample blocks of realised net strategy returns so that volatility clustering
// and serial dependence survive in the simulated paths.

import { mulberry32 } from './rng.js';
import { mean, quantileSorted } from './stats.js';

const BAND_QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95];

export function projectPnl(
  returns,
  { horizon, capital = 10000, paths = 1000, meanBlock = 30, seed = 42, checkpoints = 120 } = {},
) {
  const n = returns.length;
  if (n === 0 || !(horizon > 0)) throw new Error('Projection needs returns and a positive horizon');

  const rng = mulberry32(seed);
  const jump = 1 / meanBlock;
  const marks = Math.min(checkpoints, horizon);
  const markSteps = Array.from({ length: marks }, (_, k) => Math.round(((k + 1) * horizon) / marks));
  const pathValues = Array.from({ length: marks }, () => new Float64Array(paths));
  const finals = new Float64Array(paths);

  for (let p = 0; p < paths; p++) {
    let idx = Math.floor(rng() * n);
    let equity = 1;
    let mark = 0;
    for (let step = 1; step <= horizon; step++) {
      idx = rng() < jump ? Math.floor(rng() * n) : (idx + 1) % n;
      equity *= 1 + returns[idx];
      if (step === markSteps[mark]) {
        pathValues[mark][p] = (equity - 1) * capital;
        mark += 1;
      }
    }
    finals[p] = (equity - 1) * capital;
  }

  const bands = markSteps.map((step, k) => {
    const sorted = Float64Array.from(pathValues[k]).sort();
    const [p05, p25, p50, p75, p95] = BAND_QUANTILES.map((q) => quantileSorted(sorted, q));
    return { step, p05, p25, p50, p75, p95 };
  });

  const sorted = Float64Array.from(finals).sort();
  const tailCount = Math.max(1, Math.floor(paths * 0.05));
  const tail = Array.from(sorted.subarray(0, tailCount));
  return {
    bands,
    stats: {
      mean: mean(Array.from(finals)),
      median: quantileSorted(sorted, 0.5),
      p05: quantileSorted(sorted, 0.05),
      p95: quantileSorted(sorted, 0.95),
      probLoss: finals.filter((v) => v < 0).length / paths,
      expectedShortfall: mean(tail),
    },
  };
}
