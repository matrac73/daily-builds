// Models: a standard scaler, ridge regression and the naive baselines it must beat.

import { mean, std, solve } from './stats.js';

/** Z-score scaling whose statistics come from the training set only. */
export class StandardScaler {
  fit(X) {
    const cols = X[0].length;
    this.means = [];
    this.stds = [];
    for (let j = 0; j < cols; j++) {
      const col = X.map((r) => r[j]);
      const s = std(col);
      this.means.push(mean(col));
      this.stds.push(s > 1e-12 ? s : 1); // constant column: leave it centred at 0
    }
    return this;
  }

  transform(X) {
    return X.map((r) => r.map((v, j) => (v - this.means[j]) / this.stds[j]));
  }
}

/**
 * L2-regularised linear regression, closed form: w = (X'X + lambda*I)^-1 X'(y - mean(y)).
 * Expects centred features (use StandardScaler); the intercept is not penalised.
 */
export class Ridge {
  constructor(lambda = 1) {
    this.lambda = lambda;
  }

  fit(X, y) {
    const p = X[0].length;
    this.intercept = mean(y);
    const xtx = Array.from({ length: p }, () => new Array(p).fill(0));
    const xty = new Array(p).fill(0);
    X.forEach((row, i) => {
      const yc = y[i] - this.intercept;
      for (let a = 0; a < p; a++) {
        xty[a] += row[a] * yc;
        for (let b = a; b < p; b++) xtx[a][b] += row[a] * row[b];
      }
    });
    for (let a = 0; a < p; a++) {
      xtx[a][a] += this.lambda;
      for (let b = 0; b < a; b++) xtx[a][b] = xtx[b][a];
    }
    this.weights = solve(xtx, xty);
    return this;
  }

  predict(X) {
    return X.map((row) => row.reduce((s, v, j) => s + v * this.weights[j], this.intercept));
  }
}

/** Random walk: tomorrow's expected return is zero (the hardest baseline to beat in finance). */
export class ZeroBaseline {
  fit() {
    return this;
  }

  predict(X) {
    return X.map(() => 0);
  }
}

/** Historical drift: tomorrow's expected return is the mean training return. */
export class DriftBaseline {
  fit(_X, y) {
    this.drift = mean(y);
    return this;
  }

  predict(X) {
    return X.map(() => this.drift);
  }
}
