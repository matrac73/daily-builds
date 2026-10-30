// Small numeric toolkit shared by the model, the metrics and the projection.

export function mean(values) {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Sample variance (n - 1 denominator). */
export function variance(values) {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) ** 2;
  return s / (n - 1);
}

export function std(values) {
  return Math.sqrt(variance(values));
}

/** Pearson correlation; returns 0 when one of the series is constant. */
export function corr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

/**
 * Simple OLS regression y = alpha + beta * x + e, with the standard error
 * and t-statistic of the intercept (Jensen's alpha when x is the benchmark).
 */
export function ols(y, x) {
  const n = Math.min(y.length, x.length);
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
  }
  const beta = sxx > 0 ? sxy / sxx : 0;
  const alpha = my - beta * mx;
  let sse = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    sse += (y[i] - alpha - beta * x[i]) ** 2;
    sst += (y[i] - my) ** 2;
  }
  const s2 = n > 2 ? sse / (n - 2) : 0;
  const alphaSE = sxx > 0 ? Math.sqrt(s2 * (1 / n + (mx * mx) / sxx)) : Math.sqrt(s2 / Math.max(n, 1));
  return {
    alpha,
    beta,
    alphaSE,
    alphaT: alphaSE > 0 ? alpha / alphaSE : 0,
    r2: sst > 0 ? 1 - sse / sst : 0,
  };
}

/** Linear-interpolated quantile of an already sorted array. */
export function quantileSorted(sorted, q) {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function clip(value, limit) {
  return value > limit ? limit : value < -limit ? -limit : value;
}
