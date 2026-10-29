// Web worker for the in-browser lab: runs the full pipeline off the main thread.

import { parseBarsCsv } from './src/csv.js';
import { dailySentiment } from './src/sentiment.js';
import { runPipeline } from './src/pipeline.js';
import { toReport } from './src/report.js';

self.onmessage = ({ data }) => {
  try {
    const bars = parseBarsCsv(data.csv);
    const market = data.marketCsv ? parseBarsCsv(data.marketCsv) : undefined;
    const sentiment = data.news?.length ? dailySentiment(data.news, bars.map((b) => b.date)) : undefined;
    const result = runPipeline(bars, { market, sentiment, ...data.options });
    self.postMessage({ report: toReport(result, { symbol: data.symbol, name: data.name, bars, news: data.news ?? [] }) });
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};
