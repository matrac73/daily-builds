"""Command-line interface."""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.markup import escape
from rich.table import Table

from . import __version__
from .api import make_server
from .archiver import Archiver, NotOwnerError, SyncResult
from .client import DEFAULT_PAGE_SIZE, DEFAULT_RATE_PER_MINUTE, SlackClient, SlackError
from .export import FORMATS, export_channel, render_text
from .store import Store, UnknownChannelError, ts_to_iso

console = Console()
errors = Console(stderr=True)

HINTS = {
    "not_in_channel": "the token's owner must be a member of the channel",
    "invalid_auth": "the token in SLACK_TOKEN is not valid",
    "not_authed": "the token in SLACK_TOKEN is not valid",
    "missing_scope": "the token lacks a scope; see the README for the required list",
    "ratelimited": "lower --rate (new non-Marketplace apps are limited to 1 request/minute)",
}

_INTERVAL = re.compile(r"(\d+)([smhd]?)")
_UNIT_SECONDS = {"": 1, "s": 1, "m": 60, "h": 3600, "d": 86400}


class UsageError(Exception):
    """The command cannot run as invoked."""


def parse_interval(text: str) -> int:
    """Parse ``90``, ``90s``, ``15m``, ``2h`` or ``1d`` into seconds."""
    match = _INTERVAL.fullmatch(text.strip().lower())
    if not match or int(match.group(1)) == 0:
        raise argparse.ArgumentTypeError(f"invalid interval {text!r} (try 90s, 15m, 2h or 1d)")
    return int(match.group(1)) * _UNIT_SECONDS[match.group(2)]


def build_client(args: argparse.Namespace) -> SlackClient:
    token = os.environ.get("SLACK_TOKEN")
    if not token:
        raise UsageError("set the SLACK_TOKEN environment variable to a workspace owner's token")
    return SlackClient(token, rate_per_minute=args.rate, page_size=args.page_size)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="slack-archiver",
        description="Archive Slack channels to SQLite before the free tier purges them.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument(
        "--db",
        default=os.environ.get("SLACK_ARCHIVER_DB", "slack-archive.db"),
        help="archive database path (default: $SLACK_ARCHIVER_DB or slack-archive.db)",
    )
    parser.add_argument(
        "--rate",
        type=float,
        default=DEFAULT_RATE_PER_MINUTE,
        help=f"maximum Slack requests per minute (default: {DEFAULT_RATE_PER_MINUTE})",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=DEFAULT_PAGE_SIZE,
        help=f"messages requested per call (default: {DEFAULT_PAGE_SIZE})",
    )
    commands = parser.add_subparsers(dest="command", required=True, metavar="COMMAND")

    commands.add_parser("auth", help="check that the token belongs to a workspace owner")

    channels = commands.add_parser("channels", help="manage the list of archived channels")
    actions = channels.add_subparsers(dest="action", required=True, metavar="ACTION")
    listing = actions.add_parser("list", help="show archived channels and their statistics")
    listing.add_argument("--remote", action="store_true", help="list the workspace's channels instead")
    adding = actions.add_parser("add", help="start archiving channels")
    adding.add_argument("channels", nargs="+", metavar="CHANNEL", help="channel name or ID")
    removing = actions.add_parser("remove", help="stop archiving a channel")
    removing.add_argument("channel", metavar="CHANNEL")
    removing.add_argument("--purge", action="store_true", help="also delete its archived messages")

    sync = commands.add_parser("sync", help="fetch new messages once")
    sync.add_argument("channels", nargs="*", metavar="CHANNEL", help="default: every tracked channel")

    watch = commands.add_parser("watch", help="keep archiving on a fixed interval until stopped")
    watch.add_argument("--every", type=parse_interval, default=900, metavar="INTERVAL",
                       help="time between runs, e.g. 90s, 15m, 2h (default: 15m)")

    search = commands.add_parser("search", help="search archived messages")
    search.add_argument("query")
    search.add_argument("-c", "--channel", help="restrict the search to one channel")
    search.add_argument("-n", "--limit", type=int, default=20, help="maximum results (default: 20)")

    export = commands.add_parser("export", help="copy an archived channel to a file")
    export.add_argument("channel", metavar="CHANNEL")
    export.add_argument("-f", "--format", choices=FORMATS, default="json")
    export.add_argument("-o", "--output", help="file to write, or - for stdout (default: CHANNEL.FORMAT)")

    serve = commands.add_parser("serve", help="serve the archive over a read-only JSON API")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    return parser


def cmd_auth(args: argparse.Namespace, store: Store) -> int:
    identity = Archiver(build_client(args), store).verify_owner()
    console.print(
        f"[green]OK[/] {escape(identity.user)} is an owner of [bold]{escape(identity.team)}[/]."
    )
    return 0


def cmd_channels(args: argparse.Namespace, store: Store) -> int:
    if args.action == "add":
        added = Archiver(build_client(args), store).add_channels(args.channels)
        for channel in added:
            console.print(f"[green]Tracking[/] #{escape(channel['name'])} ({channel['id']})")
    elif args.action == "remove":
        channel = store.remove_channel(args.channel, purge=args.purge)
        outcome = "removed with its messages" if args.purge else "no longer archived (messages kept)"
        console.print(f"#{escape(channel['name'])} {outcome}.")
    elif args.remote:
        tracked = {channel["id"] for channel in store.channels(active_only=True)}
        table = Table(title="Workspace channels")
        table.add_column("Channel", style="cyan")
        table.add_column("ID")
        table.add_column("Visibility")
        table.add_column("Archived")
        for channel in Archiver(build_client(args), store).remote_channels():
            table.add_row(
                "#" + channel["name"],
                channel["id"],
                "private" if channel.get("is_private") else "public",
                "[green]yes[/]" if channel["id"] in tracked else "no",
            )
        console.print(table)
    else:
        _print_tracked(store)
    return 0


def _print_tracked(store: Store) -> None:
    channels = store.channels()
    if not channels:
        console.print("No channels yet. Add one with: slack-archiver channels add general")
        return
    table = Table(title="Archived channels")
    table.add_column("Channel", style="cyan")
    table.add_column("ID")
    table.add_column("Status")
    table.add_column("Messages", justify="right")
    table.add_column("First message")
    table.add_column("Last message")
    table.add_column("Last sync")
    for channel in channels:
        table.add_row(
            "#" + channel["name"],
            channel["id"],
            "[green]active[/]" if channel["active"] else "[dim]stopped[/]",
            f"{channel['message_count']:,}",
            _when(channel["first_ts"]),
            _when(channel["newest_ts"]),
            (channel["last_synced_at"] or "never").replace("T", " ").rstrip("Z"),
        )
    console.print(table)


def _when(ts: str | None) -> str:
    return ts_to_iso(ts).replace("T", " ").rstrip("Z") if ts else "-"


def cmd_sync(args: argparse.Namespace, store: Store) -> int:
    results = _run_sync(Archiver(build_client(args), store), args.channels)
    return 1 if any(result.error for result in results) else 0


def _run_sync(archiver: Archiver, refs: list[str]) -> list[SyncResult]:
    with console.status("Contacting Slack...") as status:
        results = archiver.sync(
            refs,
            progress=lambda name, count: status.update(f"#{escape(name)}: {count:,} new messages"),
        )
    if not results:
        console.print("Nothing to sync. Add a channel with: slack-archiver channels add general")
        return results
    table = Table(title=f"Sync at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    table.add_column("Channel", style="cyan")
    table.add_column("New messages", justify="right")
    table.add_column("Result")
    for result in results:
        if result.error:
            hint = HINTS.get(result.error)
            outcome = f"[red]{escape(result.error)}[/]" + (f" - {hint}" if hint else "")
        else:
            outcome = "[green]ok[/]"
        table.add_row("#" + result.channel, f"{result.new_messages:,}", outcome)
    console.print(table)
    return results


def cmd_watch(args: argparse.Namespace, store: Store) -> int:
    archiver = Archiver(build_client(args), store)
    archiver.verify_owner()
    console.print(f"Archiving every {args.every:,} seconds. Press Ctrl+C to stop.")
    try:
        while True:
            try:
                _run_sync(archiver, [])
            except SlackError as exc:
                _report(exc)
            time.sleep(args.every)
    except KeyboardInterrupt:
        console.print("Stopped.")
        return 0


def cmd_search(args: argparse.Namespace, store: Store) -> int:
    channel_id = store.get_channel(args.channel)["id"] if args.channel else None
    matches = store.messages(channel_id, query=args.query, limit=args.limit, newest_first=True)
    if not matches:
        console.print("No archived message matches.")
        return 0
    users = store.users()
    table = Table(title=f"{len(matches)} newest matches for {args.query!r}")
    table.add_column("Time (UTC)", no_wrap=True)
    table.add_column("Channel", style="cyan")
    table.add_column("User", style="bold")
    table.add_column("Message", overflow="fold")
    for message in matches:
        table.add_row(
            message["time"].replace("T", " ").rstrip("Z"),
            "#" + message["channel"],
            escape(message["user"]),
            escape(render_text(message["text"], users)),
        )
    console.print(table)
    return 0


def cmd_export(args: argparse.Namespace, store: Store) -> int:
    channel = store.get_channel(args.channel)
    if args.output == "-":
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
        export_channel(store, channel, args.format, sys.stdout)
        return 0
    path = Path(args.output or f"{channel['name']}.{args.format}")
    with path.open("w", encoding="utf-8", newline="") as out:
        count = export_channel(store, channel, args.format, out)
    console.print(f"Wrote {count:,} messages from #{escape(channel['name'])} to {escape(str(path))}")
    return 0


def cmd_serve(args: argparse.Namespace, store: Store) -> int:
    server = make_server(args.db, args.host, args.port)
    host, port = server.server_address[:2]
    console.print(f"Serving {escape(args.db)} at http://{host}:{port}/ - press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        console.print("Stopped.")
    finally:
        server.server_close()
    return 0


COMMANDS: dict[str, Any] = {
    "auth": cmd_auth,
    "channels": cmd_channels,
    "sync": cmd_sync,
    "watch": cmd_watch,
    "search": cmd_search,
    "export": cmd_export,
    "serve": cmd_serve,
}


def _report(exc: Exception) -> None:
    message = str(exc)
    if isinstance(exc, SlackError) and exc.code in HINTS:
        message += f" - {HINTS[exc.code]}"
    errors.print(f"[red]Error:[/] {escape(message)}")


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    store = Store(args.db)
    try:
        return COMMANDS[args.command](args, store)
    except (SlackError, NotOwnerError, UnknownChannelError, UsageError, ValueError) as exc:
        _report(exc)
        return 1
    finally:
        store.close()
