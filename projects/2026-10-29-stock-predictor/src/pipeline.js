// End-to-end pipeline: features -> nested walk-forward evaluation -> final fit -> rule-based forecast.

import { buildDataset } from './features.js';
import { StandardScaler, Ridge, DriftBaseline } from './models.js';
import { walkForwardSplits, forecastMetrics, backtest } from './validation.js';
import { hasEdge, clipReturn, position, SIGNAL_LABELS } from './rules.js';
import { mean, std, normalCdf } from './stats.js';

export const DEFAULTS = {
  lambdas: [1, 10, 30, 100, 300, 1000, 3000, 10000], // ridge penalty grid
  minTrain: 252, // one trading year before the first out-of-sample forecast
  testSize: 21, // retrain every trading month
  innerFolds: 4, // walk-forward folds used to tune lambda inside each training window
  winsorize: 4, // clip training targets to +/- 4 std to limit the pull of crash days
  threshold: 0.002, // minimum expected move (0.2%) before taking a position
  cost: 0.0005, // 5 bps per unit of turnover
};

function winsorize(y, k) {
  const m = mean(y);
  const s = std(y);
  return y.map((v) => Math.max(m - k * s, Math.min(m + k * s, v)));
}

/** Scale on the training window only, then fit ridge. */
export function fitRidge(X, y, lambda, k = DEFAULTS.winsorize) {
  const scaler = new StandardScaler().fit(X);
  const model = new Ridge(lambda).fit(scaler.transform(X), winsorize(y, k));
  return { model, predict: (Xn) => model.predict(scaler.transform(Xn)) };
}

/** Choose the ridge penalty by walk-forward CV restricted to the given (training) window. */
export function selectLambda(X, y, opts = DEFAULTS) {
  const n = X.length;
  const minTrain = Math.floor(n * 0.6);
  const testSize = Math.max(1, Math.ceil((n - minTrain) / opts.innerFolds));
  const splits = walkForwardSplits(n, { minTrain, testSize });
  const scores = opts.lambdas.map((lambda) => {
    let sse = 0;
    let count = 0;
    for (const { trainEnd, testEnd } of splits) {
      const { predict } = fitRidge(X.slice(0, trainEnd), y.slice(0, trainEnd), lambda, opts.winsorize);
      predict(X.slice(trainEnd, testEnd)).forEach((p, i) => {
        sse += (y[trainEnd + i] - p) ** 2;
        count += 1;
      });
    }
    return { lambda, mse: sse / count };
  });
  const best = scores.reduce((a, b) => (b.mse < a.mse ? b : a));
  return { lambda: best.lambda, scores };
}

/**
 * Nested walk-forward evaluation: the outer loop produces honest out-of-sample forecasts,
 * the inner loop (selectLambda) tunes hyper-parameters using the outer training window only.
 */
export function walkForward(X, y, dates, opts = DEFAULTS) {
  const oos = { dates: [], actual: [], predicted: [], drift: [], lambdas: [] };
  for (const { trainEnd, testEnd } of walkForwardSplits(X.length, opts)) {
    const Xtr = X.slice(0, trainEnd);
    const ytr = y.slice(0, trainEnd);
    const Xte = X.slice(trainEnd, testEnd);
    const { lambda } = selectLambda(Xtr, ytr, opts);
    const dailyStd = std(ytr);
    const preds = fitRidge(Xtr, ytr, lambda, opts.winsorize).predict(Xte).map((p) => clipReturn(p, dailyStd));
    const drift = new DriftBaseline().fit(Xtr, ytr).predict(Xte);
    for (let i = 0; i < Xte.length; i++) {
      oos.dates.push(dates[trainEnd + i]);
      oos.actual.push(y[trainEnd + i]);
      oos.predicted.push(preds[i]);
      oos.drift.push(drift[i]);
      oos.lambdas.push(lambda);
    }
  }
  const zero = oos.actual.map(() => 0);
  const positions = oos.predicted.map((p) => position(p, opts));
  return {
    oos,
    metrics: {
      model: forecastMetrics(oos.actual, oos.predicted),
      drift: forecastMetrics(oos.actual, oos.drift),
      zero: forecastMetrics(oos.actual, zero),
    },
    backtest: backtest(oos.actual, positions, opts.cost),
  };
}

/**
 * Train on everything known today and forecast the next session's close.
 * @param {object[]} bars OHLCV bars, sorted by date
 * @param {object} [options] { market, sentiment } inputs for buildDataset, plus DEFAULTS overrides
 */
export function runPipeline(bars, { market, sentiment, ...overrides } = {}) {
  const opts = { ...DEFAULTS, ...overrides };
  const data = buildDataset(bars, { market, sentiment });
  const last = data.X.length - 1;
  if (last < opts.minTrain + opts.testSize) {
    throw new Error(`Not enough history: ${data.X.length} usable rows, need > ${opts.minTrain + opts.testSize}`);
  }
  const X = data.X.slice(0, last);
  const y = data.y.slice(0, last);

  const evaluation = walkForward(X, y, data.dates, opts);
  const edge = hasEdge(evaluation.metrics.model);

  const { lambda, scores } = selectLambda(X, y, opts);
  const { model, predict } = fitRidge(X, y, lambda, opts.winsorize);
  const dailyStd = std(y);
  const rawReturn = predict([data.X[last]])[0];
  const modelReturn = clipReturn(rawReturn, dailyStd);

  // Rule: without a proven out-of-sample edge, fall back to the random walk.
  const expectedReturn = edge.ok ? modelReturn : 0;
  const sigma = edge.ok ? evaluation.metrics.model.rmse : dailyStd;
  const lastClose = data.closes[last];
  const pos = edge.ok ? position(expectedReturn, opts) : 0;
  const reasons = edge.ok
    ? [pos === 0 ? `expected move below the ${((opts.threshold + 2 * opts.cost) * 100).toFixed(2)}% hurdle` : 'model edge confirmed out-of-sample']
    : edge.reasons;
  if (modelReturn !== rawReturn) reasons.push('forecast clipped to 2 daily standard deviations');

  return {
    asOf: data.dates[last],
    lastClose,
    forecast: {
      rawReturn,
      modelReturn,
      expectedReturn,
      predictedClose: lastClose * Math.exp(expectedReturn),
      lower: lastClose * Math.exp(expectedReturn - 1.96 * sigma),
      upper: lastClose * Math.exp(expectedReturn + 1.96 * sigma),
      probUp: normalCdf(expectedReturn / sigma),
      signal: SIGNAL_LABELS[pos],
      reasons,
    },
    edge,
    model: {
      lambda,
      lambdaScores: scores,
      trainingRows: X.length,
      weights: data.names
        .map((name, j) => ({ name, weight: model.weights[j] }))
        .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
    },
    evaluation,
    options: opts,
  };
}
