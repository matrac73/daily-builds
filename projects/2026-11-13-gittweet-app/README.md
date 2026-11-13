# GitTweet

A terminal app that tweets when a pull request is opened on one of your GitHub repositories — and never tweets the same PR twice.

## Features

- **Repository table** with a checkbox per repo, rendered with [rich](https://github.com/Textualize/rich).
- **Scan → Tweet flow**: pick repos, enter a date, *Scan*; repos with new pull requests are highlighted and the action becomes *Tweet*. Changing the selection, the date or the message turns it back into *Scan*.
- **No duplicates**: every tweeted PR is remembered, so scanning the same date again only yields PRs that were not tweeted yet.
- **Date validation**: missing, malformed and future dates are rejected with a clear message.
- **Custom tweet message** with placeholders (`{number}`, `{repo}`, `{description}`, `{title}`, `{author}`, `{url}`), truncated to 280 characters.
- **Persistence across sessions**: last scan date, repo selection, custom message and tweeted PRs are stored in `~/.gittweet/state.json`.
- **Safe by default**: without Twitter credentials GitTweet runs in *dry-run* mode and only shows what it would post.
- **One-shot mode** (`--once --yes`) for cron jobs and CI.
- Only one dependency (`rich`); GitHub and Twitter (OAuth 1.0a) are called with the standard library.

## Quick start

Requires Python 3.10+.

```bash
git clone <this-repo> gittweet && cd gittweet
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

gittweet --user octocat          # or: python -m gittweet --user octocat
```

That is enough to browse and scan public repositories in dry-run mode.

### Configuration

Everything is read from environment variables; nothing secret is ever written to disk.

| Variable | Purpose |
| --- | --- |
| `GITHUB_USER` | Default for `--user`. |
| `GITHUB_TOKEN` | Optional personal access token: higher rate limit, and private repos when `--user` is omitted. |
| `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET` | OAuth 1.0a credentials of an X/Twitter app with *write* permission. Set all four to tweet for real. |
| `GITTWEET_STATE` | Path of the state file (default `~/.gittweet/state.json`). |

## Usage

### Interactive

```text
$ gittweet --user ada
Your GitHub repositories
┏━━━┳━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━┓
┃ # ┃ Sel ┃ Repository ┃ Description                   ┃ New PRs ┃
┡━━━╇━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━┩
│ 1 │ [x] │ alpha      │ First project                 │ #7, #8  │
│ 2 │ [ ] │ beta       │ -                             │         │
│ 3 │ [x] │ gamma      │ Third project                 │         │
└───┴─────┴────────────┴───────────────────────────────┴─────────┘
Scan date: 2026-06-05 00:00  |  Selected: 2/3  |  Twitter: live
Tweet (Enter) >
```

The prompt always shows the current action; press **Enter** to run it.

| Command | Effect |
| --- | --- |
| *Enter* | Run the current action: **Scan**, or **Tweet** once a scan found new PRs |
| `1 3 4` | Toggle the repositories on those rows |
| `a` / `n` | Select all / none |
| `d 2026-01-31` | Set the scan date (`YYYY-MM-DD` or `YYYY-MM-DD HH:MM`, local time; ISO offsets accepted) |
| `m New PR #{number} on {repo}: {url}` | Set a custom tweet message (`m reset` restores the default, `m` shows it) |
| `s` / `t` | Scan / tweet explicitly |
| `h` / `q` | Help / quit |

The default message is `Pull Request #<pr-number> created for repo <repo name> - <repo description>`.

If you do not enter a date, the scan resumes from the last scan date of the previous session.

### One-shot

```bash
# Preview what would be tweeted for two repos since a date
gittweet --user ada --repo alpha --repo gamma --since 2026-01-31 --once

# Same scan, and send the tweets (suitable for cron; resumes from the last scan date)
gittweet --user ada --once --yes

# Force a dry run even when Twitter credentials are set
gittweet --user ada --once --yes --dry-run
```

Dry-run tweets are never recorded as sent, so they will be picked up again by the next real run.

## Project structure

```text
gittweet/
  core.py      date validation, tweet rendering, the Scan/Tweet session state machine
  state.py     JSON persistence (last scan date, selection, message, tweeted PRs)
  github.py    GitHub REST client (owned repos, pull requests, pagination, errors)
  twitter.py   X/Twitter v2 poster with OAuth 1.0a signing, and the dry-run poster
  http.py      tiny JSON-over-HTTP helper on urllib (injectable for tests)
  cli.py       argument parsing, rich table, interactive prompt, one-shot mode
  errors.py    user-facing exception types
tests/         pytest suite, no network access needed
```

## Tests

```bash
pip install -e ".[dev]"
pytest
```

The suite covers the date rules, the Scan/Tweet state machine and its de-duplication, persistence, GitHub pagination and error handling, OAuth 1.0a signing, and the prompt commands — all against in-memory fakes.

## License

[MIT](LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/3-Advanced/GitTweet-App.md) idea bank.
