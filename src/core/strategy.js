// Cost-aware trading strategy driven by the online forecaster, and the
// walk-forward backtest that replays it bar by bar (no look-ahead).

import { FeatureEngine } from './features.js';
import { HedgeEnsemble, createDefaultExperts } from './models.js';
import { clip } from './stats.js';

const TARGET_CLIP = 6;

/** One-way cost of trading one unit of notional, as a fraction (fees + half spread + slippage). */
export function oneWayCost({ feeBps = 0, spreadBps = 0, slippageBps = 0 } = {}) {
  return (feeBps + spreadBps / 2 + slippageBps) / 1e4;
}

/**
 * No-trade band rule: only move when the expected return beats the threshold,
 * otherwise keep the current position (avoids paying costs on noise).
 */
export function decidePosition(current, expectedReturn, threshold, allowShort) {
  if (expectedReturn > threshold) return 1;
  if (expectedReturn < -threshold) return allowShort ? -1 : 0;
  return current;
}

export class Strategy {
  constructor({ costs = {}, thresholdMult = 1, allowShort = true, warmup = 100, model = {} } = {}) {
    this.cost = oneWayCost(costs);
    this.threshold = thresholdMult * this.cost;
    this.allowShort = allowShort;
    this.warmup = warmup;
    this.features = new FeatureEngine(model.features);
    this.forecaster = new HedgeEnsemble(createDefaultExperts(model.rls), model.hedge);
    this.position = 0;
    this.pending = null;
    this.seen = 0;
  }

  get expertNames() {
    return this.forecaster.experts.map((e) => e.name);
  }

  /**
   * Process a newly closed bar:
   * 1. book the PnL of the position held over the bar,
   * 2. let the model learn from the return it just observed,
   * 3. forecast the next bar and rebalance (paying costs on the traded notional).
   */
  step(bar) {
    const f = this.features.push(bar);
    this.seen += 1;
    const prevPosition = this.position;
    const benchRet = f.simpleRet ?? 0;
    const grossRet = prevPosition * benchRet;

    if (this.pending && f.logRet !== null) {
      this.forecaster.update(this.pending.x, clip(f.logRet / this.pending.sigma, TARGET_CLIP));
    }

    let pred = 0;
    let weights = null;
    if (f.x) {
      const out = this.forecaster.predict(f.x);
      pred = out.yhat * f.sigma;
      weights = out.weights;
      this.pending = { x: f.x, sigma: f.sigma };
    }

    const tradable = this.seen > this.warmup && f.x !== null;
    const position = tradable ? decidePosition(prevPosition, pred, this.threshold, this.allowShort) : 0;
    const cost = Math.abs(position - prevPosition) * this.cost;
    this.position = position;

    return {
      time: bar.time,
      close: bar.close,
      benchRet,
      grossRet,
      cost,
      netRet: grossRet - cost,
      position,
      pred,
      sigma: f.sigma,
      weights,
      tradable: this.seen > this.warmup,
    };
  }
}

export function runBacktest(bars, config) {
  const strategy = new Strategy(config);
  const records = bars.map((bar) => strategy.step(bar));
  return { strategy, records };
}
