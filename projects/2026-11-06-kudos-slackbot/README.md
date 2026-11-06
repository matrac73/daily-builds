# Kudos Slackbot

A dependency-free Slack slash-command bot that saves your team's shout-outs so they don't get lost in the scroll.

Run `/kudo add @alice thanks for unblocking the release!` and the kudo is announced in the channel and stored. You can list, search and rank kudos later.

## Features

- **`/kudo add @user <text>`**: give someone a kudo. It's announced publicly in the channel.
- **`/kudo replace <kudo-id> <text>`**: rewrite one of your kudos. Edited kudos are marked as such.
- **`/kudo delete <kudo-id>`**: delete one of your kudos.
- **`/kudo list <n|*>`**: show the *n* most recent kudos (default 10), or all of them with `*`.
- **`/kudo user @user`**: show every kudo a person has received.
- **`/kudo top <n|*>`** *(bonus)*: leaderboard of the most recognised people. Ties go to whoever was recognised first.
- **`/kudo help`**: show usage.

Other details:

- Only a kudo's author can replace or delete it, and you can't give a kudo to yourself.
- Kudo ids are never reused, even after a delete.
- Every request is checked against [Slack's HMAC-SHA256 request signature](https://api.slack.com/authentication/verifying-requests-from-slack), with replay protection and a constant-time compare.
- Kudos are saved as JSON with atomic write-then-rename. Commands run one at a time, so concurrent requests can't race.
- Zero runtime dependencies: it only uses Node's built-in `http`, `crypto` and `fs`.
- A **browser playground** (`index.html`) runs the same command engine in a fake Slack channel, so you can try it without a workspace.

## Quick start

Requires Node.js 20 or newer.

### Try the playground (no Slack needed)

```bash
npx --yes serve .
# open http://localhost:3000 and switch between users in the sidebar
```

The playground is plain HTML and ES modules with no build step, so it also works on GitHub Pages as-is.

### Run the bot locally

```bash
git clone <this-repo> kudos-slackbot && cd kudos-slackbot
KUDOS_INSECURE=1 npm start          # skips signature checks: local testing only!
```

Then simulate Slack from another terminal:

```bash
curl -s localhost:3000/slack/commands -d user_id=UALICE --data-urlencode "text=add <@UBOB|bob> great pairing session"
curl -s localhost:3000/slack/commands -d user_id=UBOB --data-urlencode "text=top *"
```

### Connect it to Slack

1. Create an app at <https://api.slack.com/apps> and copy its **Signing Secret**.
2. Under **Slash Commands**, create `/kudo` with the request URL `https://<your-host>/slack/commands`. Tick **Escape channels, users, and links**, so that `@alice` arrives as `<@U123|alice>`.
3. Install the app to your workspace.
4. Start the server:

   ```bash
   SLACK_SIGNING_SECRET=xxxxxxxx PORT=3000 npm start
   ```

   For local development, expose it with a tunnel such as `ngrok http 3000`.

| Variable               | Default           | Purpose                                         |
| ---------------------- | ----------------- | ----------------------------------------------- |
| `SLACK_SIGNING_SECRET` | *(required)*      | Verifies that requests really come from Slack   |
| `PORT`                 | `3000`            | HTTP port                                       |
| `KUDOS_DATA_FILE`      | `data/kudos.json` | Where kudos are stored                          |
| `KUDOS_INSECURE`       | unset             | Set to `1` to skip signature checks (dev only)  |

## Usage examples

```text
/kudo add @alice fixed the flaky CI pipeline 🙌
  → 🎉 @bob gave kudo #1 to @alice: fixed the flaky CI pipeline 🙌   (visible to the channel)

/kudo replace 1 fixed the flaky CI pipeline AND documented it
  → ✏️ Kudo #1 for @alice now reads: …

/kudo list 3
  → 3 most recent kudos
    #3 @carol from @alice: great demo
    #2 @bob from @dave: thanks for the review
    #1 @alice from @bob: fixed the flaky CI pipeline AND documented it (edited)

/kudo user @alice
/kudo top *
  → Kudos leaderboard
    🥇 @alice with 4 kudos
    🥈 @bob with 2 kudos
    🥉 @carol with 1 kudo

/kudo delete 1
```

Only `add` posts to the whole channel. All other replies are ephemeral, so only the person who ran the command sees them.

## Project structure

```text
.
├── server.js            # Entry point: reads env, loads the store, starts the HTTP server
├── src/
│   ├── kudos.js         # Command parser, KudoStore and executeCommand (pure, browser-safe)
│   ├── app.js           # HTTP handler: routing, body limits, signature check, command queue
│   ├── slack.js         # Slack signature verification and response shaping
│   └── fileStore.js     # Atomic JSON persistence
├── index.html           # Browser playground (GitHub Pages entry point)
├── playground/
│   ├── app.js           # Fake Slack channel UI and mrkdwn renderer
│   └── style.css
└── test/
    ├── kudos.test.js    # Parsing, permissions, listing and leaderboard rules
    └── server.test.js   # Signature checks and end-to-end HTTP + persistence
```

## Tests

```bash
npm test
```

This uses Node's built-in test runner (`node --test`). The suite covers command parsing and validation, author-only edits, ordering and tie-breaking, JSON round-trips, signature checks (tampering, wrong secret, stale timestamp), and a real HTTP server. That includes concurrent requests and persistence to disk.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/3-Advanced/Kudos-Slackbot.md) idea bank.
