# Nixie Countdown

A dependency-free countdown timer for birthdays, launches and holidays. The days, hours, minutes and seconds glow like nixie tubes.

## Features

- **Define an event**: enter a name, a date and an optional time. With no time, the event starts at midnight local time.
- **Clear validation**: you get a warning for a blank or overlong name, a malformed or impossible date (such as `2027-02-30`), an out-of-range time, a time skipped by a daylight-saving change, a date in the past, and a date too far away for the four-digit days display (more than 9,999 days).
- **Live countdown**: each card shows days, hours, minutes and seconds and updates on its own. When seconds go past zero, minutes drop by one and seconds restart at 59, all the way up to days. Every tick is computed from `Date.now()`, so the countdown doesn't drift, even after the tab sleeps.
- **Multiple events**: add as many countdowns as you like. The soonest comes first.
- **Saved between sessions**: events are kept in `localStorage`. Corrupt or tampered data is ignored safely.
- **Alert when reached**: a toast message appears, the tab title changes and the tubes flicker when an event's moment arrives.
- **No libraries**: all date math uses the built-in `Date` object. There's no build step and no runtime dependencies.

## Quick start

The app is static files. ES modules need to be served over HTTP, so opening `index.html` straight from disk won't work.

```bash
git clone <this-repo-url> nixie-countdown
cd nixie-countdown
npm start            # serves the folder on http://localhost:8080 (uses npx http-server)
```

Any static server works, for example `python -m http.server 8080`. The app uses only relative paths, so you can deploy it as-is to GitHub Pages, including in a sub-folder.

## Usage

1. Type an event name, e.g. `Sam's birthday`.
2. Pick a date, e.g. `2026-12-25`. You can also set a time, e.g. `18:30`.
3. Click **Start**. A new card appears and starts counting down.
4. Click **✕** on a card to remove it.

Examples of the warnings you'll see:

| Input | Warning |
| --- | --- |
| Empty name | "Give your event a name." |
| Date `2027-02-29` | "That date does not exist on the calendar." |
| Date `2060-01-01` | "Too far away: the timer can show at most 9,999 days (about 27 years)." |
| Yesterday's date | "That moment has already passed — pick a future date." |
| `02:30` on a spring-forward night | "That time is skipped by a daylight-saving change in your time zone." |

## Project structure

```
.
├── index.html          # markup: form, countdown list, card template
├── styles.css          # nixie-tube styling
├── src/
│   ├── countdown.js    # pure logic: parse local date/time, validate, break down durations
│   ├── events.js       # pure logic: event list ops and JSON (de)serialization
│   └── app.js          # browser code: DOM rendering, ticking, localStorage, alerts
├── test/
│   ├── countdown.test.js
│   └── events.test.js
└── package.json        # npm start / npm test scripts, no dependencies
```

All the logic in `src/countdown.js` and `src/events.js` is free of DOM code, so Node can test it directly.

## Tests

Requires Node.js 20 or later.

```bash
npm test             # runs node --test
```

The tests cover the time breakdown and its rollover at each boundary, rounding, local-midnight defaults, impossible dates and leap days, malformed times, DST gaps (the time zone is pinned to `Europe/Paris` so results don't depend on the machine), past and overflowing dates, and persistence that survives bad data.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/1-Beginner/Countdown-Timer-App.md) idea bank.
