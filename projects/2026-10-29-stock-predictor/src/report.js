// Compact, JSON-friendly report of a pipeline run, consumed by the web dashboard.

const round = (v) => Math.round(v * 1e6) / 1e6;

/**
 * @param {object} result output of runPipeline
 * @param {object} ctx { symbol, name, bars, news?, track?, chartDays? }
 */
export function toReport(result, { symbol, name = symbol, bars, news = [], track = null, chartDays = 120 }) {
  const { evaluation, options } = result;
  return {
    symbol,
    name,
    asOf: result.asOf,
    lastClose: result.lastClose,
    forecast: result.forecast,
    edge: result.edge,
    model: result.model,
    metrics: evaluation.metrics,
    backtest: evaluation.backtest,
    strategies: evaluation.strategies,
    options: { threshold: options.threshold, cost: options.cost, minTrain: options.minTrain, testSize: options.testSize },
    oos: {
      dates: evaluation.oos.dates,
      actual: evaluation.oos.actual.map(round),
      predicted: evaluation.oos.predicted.map(round),
    },
    prices: bars.slice(-chartDays).map((b) => [b.date, b.close]),
    news: news.slice(-12).reverse(),
    track,
  };
}
