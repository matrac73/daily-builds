# Stock Predictor

**Every trading day, retrain a model on prices, market context and news sentiment, forecast tomorrow's close — and only trust it if it beats the random walk out-of-sample.**

A zero-dependency Node.js job plus a static web dashboard. The job pulls daily prices and news headlines, rebuilds point-in-time features, runs a nested walk-forward evaluation, applies decision rules, logs the forecast and settles the previous day's one. The dashboard (plain HTML/ES modules, GitHub Pages-ready) shows forecasts, honest metrics and a live track record, and can rerun the whole pipeline in your browser.

> ⚠️ Educational project, not investment advice. Next-day returns are close to unpredictable; the app is designed to say so when it is the case.

## Features

- **Quantitative + qualitative inputs** — 19 features: lagged returns, momentum, volatility regime, RSI, MACD, distance to SMA20/50, Bollinger %B, volume z-score, intraday range, overnight gap, benchmark index returns (S&P 500 / CAC 40) and **news sentiment** from Yahoo Finance RSS headlines (finance lexicon with negation and intensifiers).
- **ML best practices, enforced in code**
  - target = next-day **log return** (stationary), not the price;
  - strictly **point-in-time** features (tested: truncating the future never changes past rows); news published after the 16:00 New York close counts for the next session;
  - scaler statistics fitted on the **training window only**;
  - **nested walk-forward** validation: expanding window, monthly retraining, ridge penalty λ tuned by an inner walk-forward on each training window only;
  - training targets **winsorized** (±4σ) to limit crash-day leverage;
  - compared against **random-walk and drift baselines** (out-of-sample R², RMSE, MAE, hit rate) and a cost-aware long/short backtest vs buy & hold.
- **Decision rules** — the model's forecast is used only if it beats the random walk out-of-sample (R² > 0, hit rate > 50%, ≥ 60 test days); forecasts are clipped to ±2σ; a BUY/SELL signal requires the expected move to clear a threshold plus round-trip costs; otherwise HOLD. Every decision comes with its reasons.
- **95% prediction interval and P(up)** from out-of-sample residuals.
- **Live track record** — every forecast is logged in `data/predictions.json` and settled against the real close on the next run (MAPE, hit rate, interval coverage).
- **Daily automation** — a GitHub Actions cron runs tests, refreshes data and commits it; GitHub Pages serves the dashboard.
- **Bonus: in-browser Lab** — rerun the full pipeline in a Web Worker on a cached stock or your own CSV, tweaking threshold, costs, training window and retraining frequency.

## Quick start

Requires Node.js ≥ 20 — no `npm install`, there are no dependencies.

```bash
npm test                # run the test suite
npm run daily           # fetch prices + news, retrain, forecast, write data/
npm run serve           # open http://localhost:8080
```

`npm run daily:offline` reruns everything from the cached CSVs and news archive (no network).

## Usage

```bash
# Forecast a subset of the configured stocks
node scripts/daily.js --symbols AAPL,NVDA

# Example output
AAPL   2026-10-28 close 343.83 -> 343.83 (0.00%, P(up) 50%) HOLD
NVDA   2026-10-28 close 215.38 -> 215.27 (-0.05%, P(up) 49%) HOLD
```

Add or remove stocks in `data/config.json` (any Yahoo Finance ticker, with an optional benchmark index):

```json
{ "symbol": "MC.PA", "name": "LVMH", "market": "^FCHI" }
```

Use the library directly:

```js
import { parseBarsCsv } from './src/csv.js';
import { runPipeline } from './src/pipeline.js';

const result = runPipeline(parseBarsCsv(csvText), { threshold: 0.003, testSize: 63 });
console.log(result.forecast, result.evaluation.metrics, result.edge);
```

### Running it every day

- **GitHub**: `.github/workflows/daily.yml` runs at 22:30 UTC on weekdays (and on demand). Enable GitHub Pages on the repository root to publish the dashboard.
- **Locally**: schedule `npm run daily` with cron (`30 22 * * 1-5 cd /path/to/repo && npm run daily`) or the Windows Task Scheduler.

## Project structure

```
index.html, styles.css, app.js   static dashboard (no build step, relative paths only)
worker.js                        Web Worker running the pipeline for the Lab
src/
  stats.js        mean/std, normal CDF, linear solver
  indicators.js   returns, SMA/EMA, RSI, MACD, Bollinger, rolling z-score (no look-ahead)
  sentiment.js    headline scoring, session assignment, daily aggregation
  features.js     point-in-time feature matrix + next-day targets
  models.js       StandardScaler, Ridge, zero & drift baselines
  validation.js   walk-forward splits, forecast metrics, backtest
  rules.js        edge gating, clipping, BUY/SELL/HOLD hurdle
  pipeline.js     nested walk-forward evaluation, final fit, forecast
  tracker.js      prediction log: upsert, settle, live stats
  report.js       compact JSON report for the dashboard
scripts/
  daily.js        the daily job
  sources.js      Yahoo Finance chart API + RSS parsing
  serve.js        tiny static server for local preview
data/             config, cached prices, news archive, prediction log, dashboard JSON
test/             node:test suites with deterministic synthetic markets
```

## Tests

```bash
npm test
```

26 tests cover the indicators, the absence of look-ahead in indicators and features, walk-forward splits, metrics and backtest, ridge and scaler maths, the decision rules, sentiment scoring and session alignment, the prediction tracker, and data parsing (CSV, Yahoo chart payloads incl. in-progress sessions, RSS). End-to-end tests check that the pipeline **finds** an edge on a synthetic autocorrelated market and **refuses** to claim one on a pure random walk.

## Honest results

On real large caps, most daily runs conclude "no proven edge" and fall back to the random walk — which is what efficient-market theory predicts and what a well-validated model should report. The news-sentiment features start at zero history: the archive grows by one RSS snapshot per run, so their weight only becomes meaningful after weeks of daily collection.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code).
