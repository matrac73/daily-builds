# Stock Predictor

**Every trading day, retrain a model on prices, market context and news sentiment, forecast tomorrow's close — and only trust it if it beats the random walk out-of-sample.**

A zero-dependency Node.js job plus a static web dashboard. The job pulls daily prices and news headlines, rebuilds point-in-time features, runs a nested walk-forward evaluation, applies decision rules, logs the forecast and settles the previous day's one. The dashboard (plain HTML/ES modules, GitHub Pages-ready) shows forecasts, honest metrics and a live track record, and can rerun the whole pipeline in your browser.

> ⚠️ Educational project, not investment advice. Next-day returns are close to unpredictable; the app is designed to say so when it is the case.

## Tracked instruments

| Ticker | Instrument | Benchmark |
|---|---|---|
| `PSP5.PA` | Amundi PEA S&P 500 ETF (Paris) | S&P 500 (`^GSPC`) |
| `SAF.PA` | Safran | CAC 40 (`^FCHI`) |
| `EUR=X` | USD/EUR exchange rate | US Dollar Index (`DX-Y.NYB`) |
| `C40.PA` | Amundi CAC 40 ETF (Paris) | CAC 40 (`^FCHI`) |

## Features

- **Quantitative + qualitative inputs** — 19 features: lagged returns, momentum, volatility regime, RSI, MACD, distance to SMA20/50, Bollinger %B, volume z-score, intraday range, overnight gap, benchmark index returns (S&P 500 / CAC 40 / Dollar Index) and **news sentiment** from Yahoo Finance RSS headlines (finance lexicon with negation and intensifiers).
- **ML best practices, enforced in code**
  - target = next-day **log return** (stationary), not the price;
  - strictly **point-in-time** features (tested: truncating the future never changes past rows); news published after the 16:00 New York close counts for the next session;
  - scaler statistics fitted on the **training window only**;
  - **nested walk-forward** validation: expanding window, monthly retraining, ridge penalty λ tuned by an inner walk-forward on each training window only;
  - training targets **winsorized** (±4σ) to limit crash-day leverage;
  - compared against **random-walk and drift baselines** (out-of-sample R², RMSE, MAE, hit rate) and a cost-aware long/short backtest vs buy & hold.
- **Decision rules** — the model's forecast is used only if it beats the random walk out-of-sample (R² > 0, hit rate > 50%, ≥ 60 test days); forecasts are clipped to ±2σ; a BUY/SELL signal requires the expected move to clear a threshold plus round-trip costs; otherwise HOLD. Every decision comes with its reasons.
- **95%, 50% and 25% prediction intervals and P(up)** from out-of-sample residuals: the narrow 25% band is the "most likely" zone, the 95% band the plausible range. The chart draws them as nested bars and the tracker checks each band's live coverage (a calibrated model lands ~95% / 50% / 25% of closes inside them).
- **Algorithm alphas** — the ridge model, the historical drift, the random walk (always flat) and buy & hold are all traded with the same BUY/SELL/HOLD rules over the out-of-sample period; for each the dashboard shows total return, excess return vs buy & hold, annualised **Jensen's alpha** and **beta** against the asset (regression of strategy daily returns on the asset's), and trade count. The ridge penalty λ (often called "alpha" in ML libraries) is shown next to the model.
- **Live track record** — every forecast is logged in `data/predictions.json` and settled against the real close on the next run (MAPE, hit rate, interval coverage).
- **Prediction history module** — a dedicated dashboard section grades every settled recommendation: BUY is right if the price rose, SELL if it fell, HOLD if the move stayed inside the trading hurdle (no trade missed). It shows overall and per-stock accuracy, BUY/SELL/HOLD scores, the return earned by following the calls, interval coverage, and a filterable log (by stock, live forecasts only). `--backfill N` replays the last N sessions point-in-time (truncated history) so the history is not empty on day one; replays are tagged and never overwrite live forecasts.
- **Mobile-friendly dashboard** — sticky section nav (Forecasts / History / Lab), swipeable stock tabs, phone-sized charts with legible labels, tables that scroll or drop secondary columns, full-width Lab controls.
- **Daily automation** — a GitHub Actions cron runs tests, refreshes data and commits it; GitHub Pages serves the dashboard.
- **Bonus: in-browser Lab** — rerun the full pipeline in a Web Worker on a cached stock or your own CSV, tweaking threshold, costs, training window and retraining frequency.

## Quick start

Requires Node.js ≥ 20 — no `npm install`, there are no dependencies.

```bash
npm test                # run the test suite
npm run daily           # fetch prices + news, retrain, forecast, write data/
npm run daily -- --backfill 20   # same, plus replay the last 20 sessions into the history
npm run serve           # open http://localhost:8080
```

`npm run daily:offline` reruns everything from the cached CSVs and news archive (no network).

## Usage

```bash
# Forecast a subset of the configured stocks
node scripts/daily.js --symbols PSP5.PA,SAF.PA

# Example output
PSP5.PA 2026-10-30 close 59.87 -> 60.13 (0.43%, P(up) 70%) BUY
SAF.PA 2026-10-30 close 275.70 -> 275.70 (0.00%, P(up) 50%) HOLD

# Seed the prediction history with 20 point-in-time replays per stock (takes a few minutes)
node scripts/daily.js --backfill 20
```

Add or remove stocks in `data/config.json` (any Yahoo Finance ticker, with an optional benchmark index):

```json
{ "symbol": "SAF.PA", "name": "Safran", "market": "^FCHI" }
```

Use the library directly:

```js
import { parseBarsCsv } from './src/csv.js';
import { runPipeline } from './src/pipeline.js';

const result = runPipeline(parseBarsCsv(csvText), { threshold: 0.003, testSize: 63 });
console.log(result.forecast.intervals, result.evaluation.strategies, result.edge);
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
  validation.js   walk-forward splits, forecast metrics, backtest, Jensen alpha / beta
  rules.js        edge gating, clipping, BUY/SELL/HOLD hurdle
  pipeline.js     nested walk-forward evaluation, per-algorithm strategies, final fit, forecast + 95/50/25% intervals
  tracker.js      prediction log: upsert, settle, grade recommendations, live + history stats
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

28 tests cover the indicators, the absence of look-ahead in indicators and features, walk-forward splits, metrics, backtest and Jensen alpha/beta, nested 95/50/25% intervals, per-algorithm alphas, ridge and scaler maths, the decision rules, sentiment scoring and session alignment, the prediction tracker and the grading of BUY/SELL/HOLD calls in the history, and data parsing (CSV, Yahoo chart payloads incl. in-progress sessions, RSS). End-to-end tests check that the pipeline **finds** an edge on a synthetic autocorrelated market and **refuses** to claim one on a pure random walk.

## Honest results

On real large caps, most daily runs conclude "no proven edge" and fall back to the random walk — which is what efficient-market theory predicts and what a well-validated model should report. The news-sentiment features start at zero history: the archive grows by one RSS snapshot per run, so their weight only becomes meaningful after weeks of daily collection.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code).
