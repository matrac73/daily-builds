// Point-in-time feature engineering. Row t only uses information available at the close of day t;
// its target is the next-day log return log(close[t+1] / close[t]).

import {
  logReturns, momentum, sma, rollingStd, rsi, macdHistogram, bollingerPercentB, rollingZScore,
} from './indicators.js';

export const FEATURE_NAMES = [
  'ret_1d', 'ret_lag1', 'ret_lag2', 'mom_5d', 'mom_20d', 'vol_10d', 'vol_ratio',
  'rsi_14', 'macd_hist', 'dist_sma20', 'dist_sma50', 'bollinger_b', 'volume_z', 'range', 'gap',
  'mkt_ret_1d', 'mkt_mom_5d', 'news_sentiment', 'news_volume',
];
const VOLUME_Z = FEATURE_NAMES.indexOf('volume_z');

/** Forward-fill another series' closes onto `dates` (never peeks at later dates). */
function alignCloses(dates, otherBars) {
  if (!otherBars?.length) return null;
  const out = [];
  let j = 0;
  let last = NaN;
  for (const d of dates) {
    while (j < otherBars.length && otherBars[j].date <= d) last = otherBars[j++].close;
    out.push(last);
  }
  return out;
}

/**
 * @param {object[]} bars sorted OHLCV bars
 * @param {object} [opts]
 * @param {object[]} [opts.market] benchmark bars (e.g. S&P 500)
 * @param {Map<string,{score:number,count:number}>} [opts.sentiment] daily news sentiment by bar date
 * @returns {{ names: string[], dates: string[], X: number[][], y: (number|null)[], closes: number[] }}
 *   the last row has y = null: it is the row used to forecast the next session.
 */
export function buildDataset(bars, { market, sentiment } = {}) {
  const dates = bars.map((b) => b.date);
  const close = bars.map((b) => b.close);
  const ret = logReturns(close);
  const vol10 = rollingStd(ret, 10);
  const vol5 = rollingStd(ret, 5);
  const vol20 = rollingStd(ret, 20);
  const mom5 = momentum(close, 5);
  const mom20 = momentum(close, 20);
  const rsi14 = rsi(close, 14);
  const macd = macdHistogram(close);
  const sma20 = sma(close, 20);
  const sma50 = sma(close, 50);
  const pctB = bollingerPercentB(close, 20);
  const volZ = rollingZScore(bars.map((b) => Math.log(1 + b.volume)), 20);

  const mkt = alignCloses(dates, market);
  const mktRet = mkt ? logReturns(mkt) : null;
  const mktMom = mkt ? momentum(mkt, 5) : null;

  // Exponentially decayed sentiment so a headline keeps influencing the next few sessions.
  let sentEma = 0;
  const sent = dates.map((d) => {
    const s = sentiment?.get(d);
    sentEma = 0.5 * sentEma + (s ? 0.5 * s.score : 0);
    return [sentEma, Math.log1p(s?.count ?? 0)];
  });

  const X = [];
  const y = [];
  const rowDates = [];
  const rowCloses = [];
  for (let t = 0; t < bars.length; t++) {
    const b = bars[t];
    const row = [
      ret[t], ret[t - 1], ret[t - 2], mom5[t], mom20[t], vol10[t], vol5[t] / vol20[t],
      rsi14[t] / 100 - 0.5, macd[t] / close[t], close[t] / sma20[t] - 1, close[t] / sma50[t] - 1,
      pctB[t], volZ[t], (b.high - b.low) / b.close, t > 0 ? Math.log(b.open / close[t - 1]) : NaN,
      mktRet ? mktRet[t] : 0, mktMom ? mktMom[t] : 0, sent[t][0], sent[t][1],
    ].map((v, i) => (i === VOLUME_Z && !Number.isFinite(v) ? 0 : v)); // flat volume (e.g. indices) => neutral
    if (!row.every(Number.isFinite)) continue;
    X.push(row);
    y.push(t + 1 < bars.length ? Math.log(close[t + 1] / close[t]) : null);
    rowDates.push(dates[t]);
    rowCloses.push(close[t]);
  }
  return { names: FEATURE_NAMES, dates: rowDates, X, y, closes: rowCloses };
}
