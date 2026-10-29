// Technical indicators. Every function returns an array aligned with its input,
// where value i only depends on inputs 0..i (no look-ahead). Undefined slots are NaN.

import { mean, std } from './stats.js';

/** Log return between consecutive values; out[0] is NaN. */
export function logReturns(values) {
  return values.map((v, i) => (i === 0 ? NaN : Math.log(v / values[i - 1])));
}

/** Log return over `period` steps. */
export function momentum(values, period) {
  return values.map((v, i) => (i < period ? NaN : Math.log(v / values[i - period])));
}

export function sma(values, period) {
  return values.map((_, i) => (i < period - 1 ? NaN : mean(values.slice(i - period + 1, i + 1))));
}

export function ema(values, period) {
  const alpha = 2 / (period + 1);
  const out = [];
  let prev = NaN;
  for (const v of values) {
    prev = Number.isNaN(prev) ? v : alpha * v + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

/** Rolling sample standard deviation; NaN inputs inside the window yield NaN. */
export function rollingStd(values, period) {
  return values.map((_, i) => (i < period - 1 ? NaN : std(values.slice(i - period + 1, i + 1))));
}

/** Wilder's Relative Strength Index, in [0, 100]. */
export function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(NaN);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (i >= period) out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** MACD histogram (MACD line minus its signal line). */
export function macdHistogram(closes, fast = 12, slow = 26, signal = 9) {
  const fastE = ema(closes, fast);
  const slowE = ema(closes, slow);
  const line = closes.map((_, i) => fastE[i] - slowE[i]);
  const sig = ema(line, signal);
  return line.map((v, i) => (i < slow - 1 ? NaN : v - sig[i]));
}

/** Bollinger %B: position of the close inside the (period, k-sigma) band. */
export function bollingerPercentB(closes, period = 20, k = 2) {
  const mid = sma(closes, period);
  const sd = rollingStd(closes, period);
  return closes.map((c, i) => {
    const width = 2 * k * sd[i];
    return width > 0 ? (c - (mid[i] - k * sd[i])) / width : NaN;
  });
}

/** Rolling z-score of a series against its own trailing window. */
export function rollingZScore(values, period) {
  const m = sma(values, period);
  const sd = rollingStd(values, period);
  return values.map((v, i) => (sd[i] > 0 ? (v - m[i]) / sd[i] : NaN));
}
