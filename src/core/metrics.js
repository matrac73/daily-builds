// Performance and alpha statistics computed on walk-forward records.

import { corr, mean, ols, std } from './stats.js';

export function equityCurve(returns, start = 1) {
  const curve = new Array(returns.length);
  let equity = start;
  for (let i = 0; i < returns.length; i++) {
    equity *= 1 + returns[i];
    curve[i] = equity;
  }
  return curve;
}

/** Maximum peak-to-trough loss of an equity curve, as a positive fraction. */
export function maxDrawdown(equity) {
  let peak = -Infinity;
  let worst = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    worst = Math.max(worst, 1 - e / peak);
  }
  return worst;
}

export function sharpe(returns, barsPerYear) {
  const s = std(returns);
  return s > 0 ? (mean(returns) / s) * Math.sqrt(barsPerYear) : 0;
}

/**
 * Summary of a backtest. Alpha is Jensen's alpha from regressing the strategy's
 * net returns on the asset's buy-and-hold returns (r_s = alpha + beta * r_m + e).
 */
export function computeMetrics(records, { barsPerYear }) {
  const rows = records.filter((r) => r.tradable);
  if (rows.length < 3) return null;

  const net = rows.map((r) => r.netRet);
  const gross = rows.map((r) => r.grossRet);
  const bench = rows.map((r) => r.benchRet);
  const equity = equityCurve(net);
  const reg = ols(net, bench);

  let trades = 0;
  let turnover = 0;
  let exposed = 0;
  let hits = 0;
  let prevPosition = 0;
  for (const r of rows) {
    const traded = Math.abs(r.position - prevPosition);
    if (traded > 0) trades += 1;
    turnover += traded;
    if (prevPosition !== 0) {
      exposed += 1;
      if (r.grossRet > 0) hits += 1;
    }
    prevPosition = r.position;
  }

  // Forecast quality: prediction made at bar t vs return realised at bar t+1.
  const preds = [];
  const realised = [];
  let agree = 0;
  let directional = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    const p = rows[i].pred;
    const y = rows[i + 1].benchRet;
    preds.push(p);
    realised.push(y);
    if (p !== 0 && y !== 0) {
      directional += 1;
      if (Math.sign(p) === Math.sign(y)) agree += 1;
    }
  }

  return {
    bars: rows.length,
    totalReturn: equity.at(-1) - 1,
    grossReturn: equityCurve(gross).at(-1) - 1,
    benchReturn: equityCurve(bench).at(-1) - 1,
    totalCost: rows.reduce((acc, r) => acc + r.cost, 0),
    annVol: std(net) * Math.sqrt(barsPerYear),
    sharpe: sharpe(net, barsPerYear),
    benchSharpe: sharpe(bench, barsPerYear),
    maxDrawdown: maxDrawdown([1, ...equity]),
    trades,
    turnover,
    exposure: exposed / rows.length,
    hitRate: exposed > 0 ? hits / exposed : 0,
    alphaPerBar: reg.alpha,
    alphaAnn: reg.alpha * barsPerYear,
    alphaT: reg.alphaT,
    beta: reg.beta,
    ic: corr(preds, realised),
    directionalAccuracy: directional > 0 ? agree / directional : 0,
  };
}
