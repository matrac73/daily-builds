# Daily Builds

**One small app shipped every day by an autonomous coding agent.**

Every morning a scheduled job hands an idea to [Claude Code](https://claude.com/claude-code), which designs, builds, tests and documents a complete small project on its own, with no human input. Each project lives in its own folder under [`projects/`](projects/) with its full commit history, its README, its tests and an MIT license.

🌐 **Showcase:** https://matrac73.github.io/daily-builds/

| Date | Project | What it does | Stack | Demo |
| --- | --- | --- | --- | --- |
| 2026-10-29 | [**Stock Predictor**](https://github.com/matrac73/daily-builds/tree/main/projects/2026-10-29-stock-predictor) | Daily next-session stock forecasts from prices, market context and news sentiment, with honest walk-forward ML. | JavaScript · Node.js · HTML · CSS · Web Workers · GitHub Actions | [demo](https://matrac73.github.io/daily-builds/projects/2026-10-29-stock-predictor/) |
| 2026-10-28 | [**Deal Screener**](https://github.com/matrac73/daily-builds/tree/main/projects/2026-10-28-deal-screener) | Tinder for deals: swipe an encrypted deal database to find platform acquisition targets from a few KPIs. | JavaScript · HTML · CSS · Web Crypto API · Node.js · node:test | [demo](https://matrac73.github.io/daily-builds/projects/2026-10-28-deal-screener/) |
| 2026-10-27 | [**Card Memory Game**](https://github.com/matrac73/card-memory-game) | Timed n×n card-matching memory game in vanilla JS with 3D flips, difficulty levels and persistent stats. | JavaScript · HTML · CSS | [demo](https://matrac73.github.io/card-memory-game/) |
| 2026-10-26 | [**gamepoll — Game Suggestion Polls**](https://github.com/matrac73/game-suggestion-app) | Terminal polls where friends suggest and vote for IGDB games to play next, with ranked top-5/10 results. | Python · Rich · IGDB API | — |

## How it works

1. **Pick** – the next item from a curated priority list, or else an idea from the [app-ideas](https://github.com/florinpop17/app-ideas) bank.
2. **Build** – Claude Code runs headless in an empty repository: it chooses a stack, implements the features, writes and runs the tests, and commits as it goes.
3. **Publish** – the project is merged into `projects/<date>-<name>/` with its history kept; static web apps go live on GitHub Pages.
4. **Report** – a recap email describes what was built and how to use it.

## License

Each project is MIT-licensed; see the `LICENSE` file in its folder.