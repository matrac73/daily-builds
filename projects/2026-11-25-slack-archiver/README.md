# Slack Archiver

Keep your Slack history: a small Python CLI that incrementally archives chosen channels to a local SQLite database before the free-tier limit purges them.

## Features

- **Pick your channels** - add or remove channels by name or ID; removing one keeps its archive unless you ask to purge it.
- **Owners only** - every operation that talks to Slack first checks that the token belongs to a workspace owner, and refuses otherwise.
- **Incremental sync** - each run asks Slack only for messages newer than the last one archived. Runs are idempotent and safe to interrupt: the cursor advances only once a channel's new range is fully stored.
- **Hands-off** - `watch` keeps archiving on an interval with no manual intervention; `sync` does a single pass for cron or Task Scheduler.
- **Rate-limit aware** - requests are spaced to a configurable budget (50 per minute by default) and `429 Retry-After` responses are honoured.
- **Export to a file** - lossless JSON / JSON Lines, or readable CSV / Markdown with mentions, links and entities rendered.
- **Search** - find archived messages from the terminal.
- **Read-only JSON API** - serve the archive over HTTP for other applications.
- **Light** - one runtime dependency ([rich](https://github.com/Textualize/rich)); HTTP, storage and the API server use the standard library.

## Quick start

Requires Python 3.10+.

```bash
git clone <this-repo> slack-archiver
cd slack-archiver
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

Create a Slack app at <https://api.slack.com/apps>, add these **User Token Scopes**, and install it to your workspace **as a workspace owner**:

| Scope | Used for |
| --- | --- |
| `channels:read`, `groups:read` | resolving channel names |
| `channels:history`, `groups:history` | reading messages |
| `users:read` | the owner check and display names |

Then export the user token (`xoxp-...`) and start archiving:

```bash
export SLACK_TOKEN=xoxp-...      # PowerShell: $env:SLACK_TOKEN = "xoxp-..."

slack-archiver auth                        # confirm the token belongs to an owner
slack-archiver channels add general help   # choose what to archive
slack-archiver watch --every 15m           # archive forever, every 15 minutes
```

The token is only ever read from the `SLACK_TOKEN` environment variable. The token's owner must be a member of each archived channel.

## Usage

```bash
# Channels
slack-archiver channels list --remote      # every channel in the workspace
slack-archiver channels list               # archived channels, counts, last sync
slack-archiver channels remove help        # stop archiving, keep the messages
slack-archiver channels remove help --purge

# Archiving
slack-archiver sync                        # one pass over every tracked channel
slack-archiver sync general                # one pass over one channel
slack-archiver watch --every 1h            # 90s, 15m, 2h, 1d ...

# Reading the archive (no token needed)
slack-archiver search "deploy key" -c general -n 50
slack-archiver export general -f md        # writes general.md
slack-archiver export general -f csv -o archive/general.csv
slack-archiver export general -f jsonl -o - | jq .text
slack-archiver serve --port 8000
```

Global options go before the command:

| Option | Default | Meaning |
| --- | --- | --- |
| `--db PATH` | `$SLACK_ARCHIVER_DB` or `slack-archive.db` | archive database |
| `--rate N` | `50` | maximum Slack requests per minute |
| `--page-size N` | `200` | messages requested per call |

`sync` exits with status 1 if any channel failed, so schedulers can alert on it. A failure in one channel never blocks the others.

### Slack rate limits

Slack announced in 2025 that newly created apps which are not distributed through the Slack Marketplace get a much lower `conversations.history` budget (one request per minute, 15 messages per request). If your app falls in that category, run with:

```bash
slack-archiver --rate 1 --page-size 15 watch --every 5m
```

### JSON API

`slack-archiver serve` exposes the archive read-only on `127.0.0.1:8000`:

| Endpoint | Returns |
| --- | --- |
| `GET /channels` | archived channels with message counts |
| `GET /channels/{name-or-id}/messages` | messages, oldest first. Query: `after`, `before` (Slack timestamps, exclusive), `q`, `limit` (1-1000, default 100) |
| `GET /search?q=text` | matches across every channel, newest first. Query: `limit` |

```bash
curl "http://127.0.0.1:8000/channels/general/messages?limit=2"
```

```json
{
  "channel": "general",
  "count": 2,
  "messages": [
    {
      "channel_id": "C0123456789",
      "channel": "general",
      "ts": "1700000060.000100",
      "time": "2023-11-14T22:14:20Z",
      "user_id": "U0123456789",
      "user": "alice",
      "text": "Welcome!",
      "subtype": null,
      "thread_ts": null
    }
  ]
}
```

To page through a channel, pass the last `ts` you received as `after`. The API has no authentication: keep it bound to localhost or put it behind your own proxy.

### Limitations

- Only channel-level messages are archived. Thread replies that were not also sent to the channel are not fetched.
- Messages edited or deleted after they were archived keep their archived version.

## Project structure

```
slack_archiver/
  client.py     Slack Web API client: throttling, 429 back-off, cursor pagination
  store.py      SQLite schema and queries (channels, messages, users)
  archiver.py   owner check, channel tracking, incremental sync
  export.py     JSON / JSONL / CSV / Markdown export and Slack markup rendering
  api.py        read-only JSON API (http.server)
  cli.py        argparse commands and rich output
tests/          pytest suite running against an in-memory fake Slack workspace
```

## Tests

```bash
pip install -e ".[dev]"
python -m pytest
```

The suite needs no network and no Slack token.

## License

[MIT](LICENSE) - Copyright (c) 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/3-Advanced/Slack-Archiver.md) idea bank.
