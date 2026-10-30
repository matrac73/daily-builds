// Online forecasters: recursive least squares experts aggregated by an
// exponentially weighted (Hedge) forecaster. Everything learns one bar at a time.

import { clip } from './stats.js';
import { FEATURE_NAMES } from './features.js';

const PRED_CLIP = 3;

/**
 * Recursive Least Squares with exponential forgetting: the online, exact
 * equivalent of a ridge regression on an exponentially weighted window.
 */
export class RLS {
  constructor(dim, { lambda = 0.998, delta = 1 } = {}) {
    this.dim = dim;
    this.lambda = lambda;
    this.w = new Float64Array(dim);
    this.P = Array.from({ length: dim }, (_, i) => {
      const row = new Float64Array(dim);
      row[i] = delta;
      return row;
    });
  }

  predict(x) {
    let y = 0;
    for (let i = 0; i < this.dim; i++) y += this.w[i] * x[i];
    return y;
  }

  /** One RLS step; returns the a-priori prediction error. */
  update(x, y) {
    const { dim, P, lambda } = this;
    const Px = new Float64Array(dim);
    for (let i = 0; i < dim; i++) {
      let s = 0;
      for (let j = 0; j < dim; j++) s += P[i][j] * x[j];
      Px[i] = s;
    }
    let denom = lambda;
    for (let i = 0; i < dim; i++) denom += x[i] * Px[i];
    const err = y - this.predict(x);
    for (let i = 0; i < dim; i++) {
      const k = Px[i] / denom;
      this.w[i] += k * err;
      for (let j = 0; j < dim; j++) P[i][j] = (P[i][j] - k * Px[j]) / lambda;
    }
    return err;
  }
}

/** A linear RLS model restricted to a subset of the features (+ intercept). */
export class LinearExpert {
  constructor(name, featureNames, options) {
    this.name = name;
    this.indices = featureNames.map((f) => {
      const idx = FEATURE_NAMES.indexOf(f);
      if (idx < 0) throw new Error(`Unknown feature: ${f}`);
      return idx;
    });
    this.model = new RLS(this.indices.length + 1, options);
  }

  #input(x) {
    const v = new Float64Array(this.indices.length + 1);
    v[0] = 1;
    this.indices.forEach((idx, i) => (v[i + 1] = x[idx]));
    return v;
  }

  predict(x) {
    return clip(this.model.predict(this.#input(x)), PRED_CLIP);
  }

  update(x, y) {
    this.model.update(this.#input(x), y);
  }
}

/** Random-walk benchmark: always forecasts a zero return. */
export class ZeroExpert {
  constructor(name) {
    this.name = name;
  }

  predict() {
    return 0;
  }

  update() {}
}

export function createDefaultExperts(options = {}) {
  return [
    new LinearExpert('Ridge complet (RLS)', FEATURE_NAMES, options),
    new LinearExpert('Auto-régressif', ['ret_0', 'ret_1', 'mom_5'], options),
    new LinearExpert('Tendance', ['trend', 'mom_20'], options),
    new LinearExpert('Microstructure', ['flow', 'flow_5', 'clv', 'volume_z'], options),
    new LinearExpert('Retour à la moyenne', ['zscore_20', 'range'], options),
    new ZeroExpert('Marche aléatoire'),
  ];
}

/**
 * Out-of-sample shrinkage: regresses realised targets on the ensemble's own
 * past forecasts (y = b * yhat, ridge prior towards b = 0). A model without
 * proven skill gets b ~ 0, so its forecasts can no longer trigger trades.
 * Negative slopes are floored at 0: we never bet against our own model.
 */
export class Calibrator {
  constructor({ lambda = 0.999, priorStrength = 20 } = {}) {
    this.lambda = lambda;
    this.priorStrength = priorStrength;
    this.sxy = 0;
    this.sxx = 0;
  }

  get slope() {
    return Math.max(0, this.sxy / (this.sxx + this.priorStrength));
  }

  apply(yhat) {
    return this.slope * yhat;
  }

  update(yhat, y) {
    this.sxy = this.lambda * this.sxy + yhat * y;
    this.sxx = this.lambda * this.sxx + yhat * yhat;
  }
}

/**
 * Exponentially weighted average forecaster (Hedge): each expert gets a weight
 * proportional to exp(-eta * discounted cumulative squared loss).
 */
export class HedgeEnsemble {
  constructor(experts, { eta = 1, discount = 0.995 } = {}) {
    this.experts = experts;
    this.eta = eta;
    this.discount = discount;
    this.losses = new Float64Array(experts.length);
  }

  weights() {
    const min = Math.min(...this.losses);
    const raw = Array.from(this.losses, (l) => Math.exp(-this.eta * (l - min)));
    const total = raw.reduce((a, b) => a + b, 0);
    return raw.map((w) => w / total);
  }

  predict(x) {
    const preds = this.experts.map((e) => e.predict(x));
    const weights = this.weights();
    const yhat = preds.reduce((acc, p, i) => acc + p * weights[i], 0);
    return { yhat, preds, weights };
  }

  update(x, y) {
    this.experts.forEach((expert, i) => {
      const loss = (y - expert.predict(x)) ** 2;
      this.losses[i] = this.discount * this.losses[i] + loss;
      expert.update(x, y);
    });
  }
}
