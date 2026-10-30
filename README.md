# HF Alpha Lab

**A browser-only, live high-frequency price forecaster for crypto and US stocks. It learns online, trades only when the expected edge beats transaction costs, measures its Jensen alpha and projects one week of PnL.**

No build step, no backend, no API key needed. Free public market data goes straight into vanilla JavaScript Web Components. The UI is in French.

## Features

- **Live data, free sources**
  - Binance public market data: 1/5/15-min klines over REST, plus the real-time **WebSocket** kline stream. Klines include taker-buy volume, which the model uses as an order-flow signal.
  - Alpha Vantage intraday for US equities. The `demo` key covers IBM in 5-min bars (about one month). A free personal key unlocks any ticker.
  - CSV import (`time, open, high, low, close, volume`, or just `time, close`).
  - Offline **synthetic market** (regime-switching volatility plus a weak, persistent order-flow signal) for demos and sanity checks.
- **Online learning ensemble, with no look-ahead**
  - 11 volatility-normalised features: autocorrelation, momentum, EMA trend, mean reversion, order-flow imbalance, volume z-score, Parkinson range and close location value.
  - 5 **recursive least squares** experts (exponentially-forgetting ridge regression) plus a random-walk expert.
  - The experts are aggregated by an **exponentially weighted (Hedge) forecaster**.
  - An **out-of-sample calibration layer** shrinks forecasts that have no proven skill towards zero.
- **Cost-aware trading**
  - One-way cost = fee + half spread + slippage.
  - A **no-trade band** (Davis–Norman / Gârleanu–Pedersen): the strategy only trades when the expected return over the forecast horizon exceeds *k × cost*.
  - A multi-bar forecast horizon (1–60 bars) lets a persistent signal pay for its round-trip.
- **Backtest & alpha**
  - Strict walk-forward replay.
  - Net vs gross vs buy-and-hold equity curves.
  - **Jensen's alpha** (per bar, over the period, annualised) with its **t-statistic**, plus beta.
  - Sharpe, max drawdown, information coefficient, hit rate, turnover and costs paid.
- **Cost sensitivity (bonus)**: the whole backtest is re-run for 0 → 20 bp. The chart shows the **break-even cost** of the signal.
- **One-week PnL**
  - A **stationary block bootstrap** (Politis & Romano) of realised net returns simulates 1,000 weeks: 10,080 one-minute bars for crypto, 1,950 for a stock.
  - Outputs a fan chart, median, 90 % interval, probability of loss and 5 % expected shortfall.
  - Also shows the PnL actually realised over the last 7 days of history.
- **Live mode**
  - Every closed bar updates the model, the forecast cone (expected path ± 1σ), the position, the expert weights and a paper-trading journal.
- **"Méthode" tab**: the whole methodology, its formulas, references and limitations, explained in the app.

> Honest note: at retail costs (≈ 10 bp taker fee on Binance), 1-minute alpha on liquid crypto is usually zero or negative after costs. The app is built to **show** that rather than hide it. The calibration layer keeps the strategy in cash when it has no edge, and the cost-sensitivity chart shows how cheap execution would have to be. This is a research and teaching tool, not investment advice.

## Quick start

The app is static files. Serve the folder over HTTP, because ES modules don't load from `file://`:

```bash
git clone <this repo> hf-alpha-lab
cd hf-alpha-lab
npx http-server -c-1 -p 8080 .
# or: python -m http.server 8080
```

Open <http://localhost:8080>. The app loads the last 3,000 one-minute BTCUSDT bars and analyses them right away.

It works as-is on GitHub Pages, including from a sub-folder (all paths are relative).

## Usage examples

| Goal | Settings |
| --- | --- |
| Watch BTC live and paper-trade it | Source *Binance*, symbol `BTCUSDT`, *Analyser* then *▶ Démarrer le live* |
| One full week of 1-min crypto history | *Historique* = `10 080` (exactly 7 days of 1-min bars) |
| PnL of a stock over a week | Source *Alpha Vantage*, `IBM` with the `demo` key (5-min bars), open the **PnL 1 semaine** tab |
| What if I had maker / VIP fees? | Set *Frais* to `2` and compare the cost-sensitivity chart and break-even |
| Check the model finds alpha when it exists | Source *Synthétique*: the hidden order-flow signal should show up as positive IC and alpha (typically t > 2) |
| Your own data | Source *Fichier CSV*. The bar size is inferred from the timestamps |

Tabs can be deep-linked: `index.html#backtest`, `#week`, `#method`.

## Project structure

```
index.html            App shell + the "Méthode" tab content
styles.css            Dark UI theme
src/
  app.js              Controller: form, data loading, live loop, rendering
  core/               Pure, framework-free logic (unit tested in Node)
    features.js       Causal, volatility-normalised feature engine
    models.js         RLS, linear experts, Hedge ensemble, calibrator
    strategy.js       Cost model, no-trade band, Strategy.step(), runBacktest()
    metrics.js        Equity, drawdown, Sharpe, Jensen alpha, IC…
    projection.js     Stationary block bootstrap PnL projection
    analysis.js       Cost sensitivity sweep and break-even cost
    markets.js        Trading calendars, cost presets, interval inference
    synthetic.js      Seeded synthetic market
    stats.js, rng.js  Numeric helpers, seeded PRNG
  data/               Binance (REST + WebSocket), Alpha Vantage, CSV adapters
  ui/                 Web Components: line-chart, stat-grid, weight-bars, tab-bar
tests/                node:test suites
```

## Tests

Requires Node ≥ 20. There are no dependencies to install.

```bash
npm test        # = node --test tests/
```

The suites cover:

- RLS convergence and tracking
- causality of the features
- **no look-ahead** in the backtest, for several horizons
- PnL and cost accounting identities
- the no-trade band rule
- Hedge weighting and calibration shrinkage
- alpha detection on synthetic data
- cost sensitivity and break-even
- bootstrap properties
- the Binance pagination, Alpha Vantage and CSV parsers

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code).
