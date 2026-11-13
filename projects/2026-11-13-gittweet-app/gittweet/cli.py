"""Terminal user interface: the repo table, the Scan/Tweet prompt and one-shot mode."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Mapping, Sequence

from rich.console import Console
from rich.markup import escape
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from . import __version__
from .core import PLACEHOLDERS, Poster, Session
from .errors import ConfigError, GitTweetError, SelectionError
from .github import GitHubClient
from .state import State, default_state_path
from .twitter import Credentials, DryRunPoster, TwitterPoster

HELP = """\
[bold]Enter[/]            run the current action (Scan, or Tweet after a scan found new PRs)
[bold]1 3 4[/]            toggle the repositories on those rows
[bold]a[/] / [bold]n[/]            select all / none
[bold]d[/] <date>         set the scan date (YYYY-MM-DD or YYYY-MM-DD HH:MM, local time)
[bold]m[/] <message>      set a custom tweet message; [bold]m reset[/] restores the default
[bold]s[/] / [bold]t[/]            scan / tweet explicitly
[bold]h[/] / [bold]q[/]            show this help / quit"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="gittweet",
        description="Tweet when a pull request is opened on one of your GitHub repositories.",
        epilog="Environment: GITHUB_TOKEN, GITHUB_USER, TWITTER_API_KEY, TWITTER_API_SECRET, "
        "TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET, GITTWEET_STATE.",
    )
    parser.add_argument("-u", "--user", help="GitHub user whose repositories are listed "
                        "(default: $GITHUB_USER, else the owner of $GITHUB_TOKEN)")
    parser.add_argument("-s", "--since", metavar="DATE",
                        help="scan date; defaults to the last scan date")
    parser.add_argument("-r", "--repo", action="append", metavar="NAME",
                        help="select only this repository (repeatable)")
    parser.add_argument("-m", "--message", metavar="TEMPLATE",
                        help="custom tweet message, placeholders: "
                        + ", ".join("{" + name + "}" for name in PLACEHOLDERS))
    parser.add_argument("--once", action="store_true",
                        help="scan once and exit instead of opening the interactive prompt")
    parser.add_argument("-y", "--yes", action="store_true",
                        help="with --once, send the tweets without asking")
    parser.add_argument("--dry-run", action="store_true",
                        help="never post, even when Twitter credentials are configured")
    parser.add_argument("--state", type=Path, metavar="FILE",
                        help="state file (default: $GITTWEET_STATE or ~/.gittweet/state.json)")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def build_poster(dry_run: bool, environ: Mapping[str, str]) -> Poster:
    credentials = Credentials.from_env(environ)
    if dry_run or credentials is None:
        return DryRunPoster()
    return TwitterPoster(credentials)


def repo_table(session: Session) -> Table:
    """The repository list; rows that will produce tweets are highlighted."""
    table = Table(title="Your GitHub repositories", title_justify="left", expand=True)
    table.add_column("#", justify="right", style="dim", no_wrap=True)
    table.add_column("Sel", no_wrap=True)
    table.add_column("Repository", no_wrap=True)
    table.add_column("Description", ratio=1, overflow="ellipsis", no_wrap=True)
    table.add_column("New PRs", no_wrap=True)
    for row, repo in enumerate(session.repos, start=1):
        pull_requests = session.pending.get(repo.full_name, [])
        table.add_row(
            str(row),
            Text("[x]" if repo.full_name in session.selected else "[ ]"),
            Text(repo.name),
            Text(repo.description or "-"),
            Text(", ".join(f"#{pr.number}" for pr in pull_requests)),
            style="bold yellow" if pull_requests else None,
        )
    return table


def status_line(session: Session) -> Text:
    since = session.since.astimezone().strftime("%Y-%m-%d %H:%M") if session.since else "not set"
    mode = "dry run (nothing is posted)" if session.poster.dry_run else "live"
    return Text.assemble(
        ("Scan date: ", "dim"), since,
        ("  |  Selected: ", "dim"), f"{len(session.selected)}/{len(session.repos)}",
        ("  |  Twitter: ", "dim"), mode,
    )


def scan(session: Session, console: Console) -> None:
    with console.status("Scanning pull requests..."):
        pending = session.scan()
    if not pending:
        console.print("[green]No new pull requests to tweet.[/]")
        return
    planned = session.planned_tweets()
    body = Text("\n").join(Text(text) for _, text in planned)
    console.print(Panel(body, title=f"{len(planned)} tweet(s) ready", border_style="yellow"))


def tweet(session: Session, console: Console) -> bool:
    """Send the pending tweets; return False when posting failed."""
    if not session.pending:
        console.print("Nothing to tweet yet: run a scan first.")
        return True
    with console.status("Tweeting..."):
        report = session.tweet()
    for sent in report.sent:
        if sent.link:
            console.print(f"[green]Tweeted[/] {escape(sent.text)}\n        [dim]{sent.link}[/]")
        else:
            console.print(f"[cyan]Dry run[/] {escape(sent.text)}")
    if session.poster.dry_run and report.sent:
        console.print("[dim]Dry run: nothing was posted or recorded. "
                      "Configure the TWITTER_* variables to tweet for real.[/]")
    if report.error:
        console.print(f"[bold red]Error:[/] {escape(report.error)}")
        return False
    return True


def execute(session: Session, line: str, console: Console) -> bool:
    """Run one prompt command; return False when the user asked to quit."""
    line = line.strip()
    head, _, rest = line.partition(" ")
    head, rest = head.lower(), rest.strip()
    try:
        if not line and session.pending:
            tweet(session, console)
        elif not line:
            scan(session, console)
        elif all(token.isdigit() for token in line.split()):
            _toggle_rows(session, [int(token) for token in line.split()])
        elif head in ("a", "all"):
            session.select_all()
        elif head in ("n", "none"):
            session.select_none()
        elif head in ("d", "date"):
            session.set_date(rest)
        elif head in ("m", "message"):
            _message(session, rest, console)
        elif head in ("s", "scan"):
            scan(session, console)
        elif head in ("t", "tweet"):
            tweet(session, console)
        elif head in ("h", "help", "?"):
            console.print(HELP)
        elif head in ("q", "quit", "exit"):
            return False
        else:
            console.print(f"[red]Unknown command '{escape(head)}'.[/] Type [bold]h[/] for help.")
    except GitTweetError as error:
        console.print(f"[bold red]Error:[/] {escape(str(error))}")
    return True


def _toggle_rows(session: Session, rows: Sequence[int]) -> None:
    for row in rows:
        if not 1 <= row <= len(session.repos):
            raise SelectionError(f"There is no repository on row {row}.")
    for row in rows:
        session.toggle(session.repos[row - 1].full_name)


def _message(session: Session, rest: str, console: Console) -> None:
    if rest:
        session.set_template(None if rest.lower() == "reset" else rest)
    console.print(f"Tweet message: [bold]{escape(session.template)}[/]")


def interactive(session: Session, console: Console) -> int:
    console.print("Type [bold]h[/] for help, [bold]q[/] to quit.")
    while True:
        console.print(repo_table(session))
        console.print(status_line(session))
        try:
            line = console.input(f"[bold cyan]{session.action}[/] (Enter) > ")
        except EOFError:
            return 0
        if not execute(session, line, console):
            return 0


def run_once(session: Session, console: Console, confirmed: bool) -> int:
    scan(session, console)
    console.print(repo_table(session))
    console.print(status_line(session))
    if not session.pending:
        return 0
    if not confirmed:
        console.print("Re-run with [bold]--yes[/] to send these tweets.")
        return 0
    return 0 if tweet(session, console) else 1


def run(args: argparse.Namespace, console: Console, environ: Mapping[str, str]) -> int:
    token = environ.get("GITHUB_TOKEN") or None
    user = args.user or environ.get("GITHUB_USER") or None
    if not user and not token:
        raise ConfigError("Pass --user (or set GITHUB_USER / GITHUB_TOKEN) to list repositories.")
    state_path = args.state or Path(environ.get("GITTWEET_STATE") or default_state_path())
    state = State.load(state_path)
    github = GitHubClient(token)
    poster = build_poster(args.dry_run, environ)

    with console.status("Loading repositories..."):
        repos = github.list_repos(user)
    if not repos:
        console.print("No repositories found.")
        return 0

    session = Session(repos, state, github, poster)
    if args.repo:
        session.select_only(args.repo)
    if args.since:
        session.set_date(args.since)
    if args.message:
        session.set_template(args.message)
    if args.once:
        return run_once(session, console, args.yes)
    return interactive(session, console)


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    console = Console()
    try:
        return run(args, console, os.environ)
    except GitTweetError as error:
        console.print(f"[bold red]Error:[/] {escape(str(error))}")
        return 1
    except KeyboardInterrupt:
        console.print()
        return 130
