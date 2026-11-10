# Daily Builds

**One small app shipped every day by an autonomous coding agent.**

Every morning a scheduled job hands an idea to [Claude Code](https://claude.com/claude-code), which designs, builds, tests and documents a complete small project on its own, with no human input. Each project lives in its own folder under [`projects/`](projects/) with its full commit history, its README, its tests and an MIT license.

🌐 **Showcase:** https://matrac73.github.io/daily-builds/

| Date | Project | What it does | Stack | Demo |
| --- | --- | --- | --- | --- |
| 2026-11-10 | [**Nixie Countdown**](https://github.com/matrac73/daily-builds/tree/main/projects/2026-11-10-countdown-timer-app) | Dependency-free countdown timer for your events, with nixie-tube styling, validation and saved multi-event timers. | JavaScript · HTML · CSS · Node.js (node --test) | [demo](https://matrac73.github.io/daily-builds/projects/2026-11-10-countdown-timer-app/) |
| 2026-11-09 | [**Markdown Table Generator**](https://github.com/matrac73/daily-builds/tree/main/projects/2026-11-09-markdown-table-generator) | Edit a table in your browser and get a clean GitHub Flavored Markdown table with live preview. No build step. | JavaScript · HTML · CSS · ES Modules · node:test | [demo](https://matrac73.github.io/daily-builds/projects/2026-11-09-markdown-table-generator/) |
| 2026-11-08 | [**Shell Game**](https://github.com/matrac73/daily-builds/tree/main/projects/2026-11-08-shell-game) | An honest, animated shell game in vanilla JavaScript: hide the pea, watch a 5-second shuffle, find it. | JavaScript · HTML · CSS · Web Animations API · Node.js test runner | [demo](https://matrac73.github.io/daily-builds/projects/2026-11-08-shell-game/) |
| 2026-11-07 | [**GitHub Profiles**](https://github.com/matrac73/daily-builds/tree/main/projects/2026-11-07-github-profiles) | Search any GitHub user to see their avatar, stats and top 4 repositories, with persistent dark mode. | JavaScript · HTML · CSS · GitHub REST API · Node.js test runner | [demo](https://matrac73.github.io/daily-builds/projects/2026-11-07-github-profiles/) |
| 2026-11-06 | [**Kudos Slackbot**](https://github.com/matrac73/daily-builds/tree/main/projects/2026-11-06-kudos-slackbot) | Zero-dependency Slack slash-command bot to give, edit, list and rank team kudos, with an in-browser playground. | JavaScript · Node.js · HTML · CSS · Slack API | [demo](https://matrac73.github.io/daily-builds/projects/2026-11-06-kudos-slackbot/) |
| 2026-11-05 | [**Christmas Lights**](https://github.com/matrac73/daily-builds/tree/main/projects/2026-11-05-christmas-lights-app) | A rippling string of Christmas lights in vanilla JS Web Components: adjustable speed, glow, rows, colours and sizes. | JavaScript · Web Components · HTML · CSS · Node.js test runner | [demo](https://matrac73.github.io/daily-builds/projects/2026-11-05-christmas-lights-app/) |
| 2026-11-04 | [**3D Strava**](https://github.com/matrac73/daily-builds/tree/main/projects/2026-11-04-3d-strava) | Turn a Strava activity into a smooth 60-second 3D fly-over with summer, winter, autumn and night map styles. | JavaScript · HTML · CSS · MapLibre GL JS · Node.js (node --test) | [demo](https://matrac73.github.io/daily-builds/projects/2026-11-04-3d-strava/) |
| 2026-11-03 | [**Fouet**](https://github.com/matrac73/daily-builds/tree/main/projects/2026-11-03-fouet) | Pixel-art whip for your mouse: swing, stop dead, CLAC - types FASTER, DO IT into any app. Browser + Python desktop script. | Python · Tkinter · Win32 ctypes · JavaScript · Canvas 2D · Web Audio API | [demo](https://matrac73.github.io/daily-builds/projects/2026-11-03-fouet/) |
| 2026-11-02 | [**Jeu Quizz AI**](https://github.com/matrac73/daily-builds/tree/main/projects/2026-11-02-jeu-quizz-ai) | No-build quiz web app for AI engineer interviews: LeetCode complexities, code review, transformers, AI agent stack | JavaScript · HTML · CSS · ES modules · node:test | [demo](https://matrac73.github.io/daily-builds/projects/2026-11-02-jeu-quizz-ai/) |
| 2026-11-01 | [**RAG Prod Lab**](https://github.com/matrac73/daily-builds/tree/main/projects/2026-11-01-projet-ai-engineer) | Production-minded RAG over a fictional French doc base with an open source LLM and a KPI-driven spec | Python · Rich · pytest · JavaScript · HTML · CSS · Ollama | [demo](https://matrac73.github.io/daily-builds/projects/2026-11-01-projet-ai-engineer/) |
| 2026-10-30 | [**HF Alpha Lab**](https://github.com/matrac73/daily-builds/tree/main/projects/2026-10-30-high-frequency-stock-predictor) | Live high-frequency crypto/stock forecaster in the browser: online learning, cost-aware trading, alpha and 1-week PnL | JavaScript · Web Components · HTML · CSS · SVG · Node.js test runner | [demo](https://matrac73.github.io/daily-builds/projects/2026-10-30-high-frequency-stock-predictor/) |
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