// Causal feature engineering on OHLCV bars.
// Every feature at bar t only uses information available at the close of bar t,
// and is normalised by an EWMA volatility estimate so the model is scale-free.

import { clip } from './stats.js';

export const FEATURE_NAMES = [
  'ret_0', // last log-return
  'ret_1', // previous log-return
  'mom_5', // 5-bar momentum
  'mom_20', // 20-bar momentum
  'trend', // fast EMA - slow EMA of log price
  'zscore_20', // distance of log price to its 20-bar mean
  'flow', // taker order-flow imbalance of the bar
  'flow_5', // 5-bar average order-flow imbalance
  'volume_z', // log-volume z-score
  'range', // high-low (Parkinson) range
  'clv', // close location value inside the bar
];

const FEATURE_CLIP = 5;
const VOL_FLOOR = 1e-5;

const emaStep = (prev, value, alpha) => (prev === null ? value : prev + alpha * (value - prev));

function meanStd(values) {
  let m = 0;
  for (const v of values) m += v;
  m /= values.length;
  let s = 0;
  for (const v of values) s += (v - m) ** 2;
  return { m, s: Math.sqrt(s / values.length) };
}

export class FeatureEngine {
  constructor({ volHalfLife = 60, window = 20, fastSpan = 8, slowSpan = 32 } = {}) {
    this.volAlpha = 1 - 0.5 ** (1 / volHalfLife);
    this.fastAlpha = 2 / (fastSpan + 1);
    this.slowAlpha = 2 / (slowSpan + 1);
    this.window = window;
    this.bars = [];
    this.logRets = [];
    this.flows = [];
    this.variance = null;
    this.emaFast = null;
    this.emaSlow = null;
  }

  get ready() {
    return this.logRets.length >= this.window;
  }

  /**
   * Ingest a closed bar. Returns the realised returns versus the previous bar,
   * the current volatility estimate and the feature vector (null during warm-up).
   */
  push(bar) {
    const prev = this.bars.at(-1);
    let logRet = null;
    let simpleRet = null;
    if (prev) {
      logRet = Math.log(bar.close / prev.close);
      simpleRet = bar.close / prev.close - 1;
      this.logRets.push(logRet);
      this.variance = emaStep(this.variance, logRet * logRet, this.volAlpha);
    }
    const logPrice = Math.log(bar.close);
    this.emaFast = emaStep(this.emaFast, logPrice, this.fastAlpha);
    this.emaSlow = emaStep(this.emaSlow, logPrice, this.slowAlpha);
    const hasFlow = bar.volume > 0 && Number.isFinite(bar.takerBuy);
    this.flows.push(hasFlow ? clip((2 * bar.takerBuy) / bar.volume - 1, 1) : 0);
    this.bars.push(bar);

    if (this.bars.length > this.window) this.bars.shift();
    if (this.logRets.length > this.window) this.logRets.shift();
    if (this.flows.length > this.window) this.flows.shift();

    const sigma = Math.max(Math.sqrt(this.variance ?? 0), VOL_FLOOR);
    return { logRet, simpleRet, sigma, x: this.ready ? this.#vector(bar, sigma) : null };
  }

  #vector(bar, sigma) {
    const r = this.logRets;
    const n = r.length;
    const sumLast = (k) => {
      let s = 0;
      for (let i = n - k; i < n; i++) s += r[i];
      return s;
    };
    const logCloses = meanStd(this.bars.map((b) => Math.log(b.close)));
    const logVolumes = meanStd(this.bars.map((b) => Math.log1p(b.volume || 0)));
    const flows = this.flows;
    let flow5 = 0;
    for (let i = flows.length - 5; i < flows.length; i++) flow5 += flows[i];
    const span = bar.high - bar.low;

    const raw = [
      r[n - 1] / sigma,
      r[n - 2] / sigma,
      sumLast(5) / (sigma * Math.sqrt(5)),
      sumLast(20) / (sigma * Math.sqrt(20)),
      (this.emaFast - this.emaSlow) / sigma,
      logCloses.s > 0 ? (Math.log(bar.close) - logCloses.m) / logCloses.s : 0,
      flows.at(-1),
      flow5 / 5,
      logVolumes.s > 0 ? (Math.log1p(bar.volume || 0) - logVolumes.m) / logVolumes.s : 0,
      span > 0 ? Math.log(bar.high / bar.low) / sigma : 0,
      span > 0 ? (bar.close - bar.low - (bar.high - bar.close)) / span : 0,
    ];
    return Float64Array.from(raw, (v) => clip(Number.isFinite(v) ? v : 0, FEATURE_CLIP));
  }
}
