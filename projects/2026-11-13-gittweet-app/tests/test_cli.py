import io

import pytest
from rich.console import Console

from gittweet.cli import build_poster, execute, repo_table, run_once, status_line
from gittweet.core import DEFAULT_TEMPLATE, Session
from gittweet.twitter import DryRunPoster, TwitterPoster

from .conftest import NOW, FakePoster


@pytest.fixture
def console() -> Console:
    return Console(file=io.StringIO(), width=120, force_terminal=False, color_system=None)


def output(console: Console) -> str:
    return console.file.getvalue()


def render(console: Console, renderable) -> str:
    console.print(renderable)
    return output(console)


def test_table_lists_every_repo_with_its_checkbox(session, console):
    session.toggle("ada/beta")
    text = render(console, repo_table(session))
    rows = [line for line in text.splitlines() if "alpha" in line or "beta" in line]
    assert "[x]" in rows[0] and "First project" in rows[0]
    assert "[ ]" in rows[1]


def test_table_shows_the_new_prs_after_a_scan(session, console):
    session.set_date("2026-06-05T00:00:00Z")
    session.scan()
    assert "#7, #8" in render(console, repo_table(session))


def test_status_line_reports_date_selection_and_mode(session, console):
    assert "not set" in render(console, status_line(session))
    assert "3/3" in output(console)
    assert "live" in output(console)


def test_enter_scans_then_tweets(session, poster, console):
    execute(session, "d 2026-06-05T00:00:00Z", console)
    execute(session, "", console)
    assert session.action == "Tweet"
    assert "3 tweet(s) ready" in output(console)

    execute(session, "", console)
    assert len(poster.posted) == 3
    assert session.action == "Scan"
    assert "https://x.com/i/web/status/1" in output(console)


def test_row_numbers_toggle_repositories(session, console):
    execute(session, "1 3", console)
    assert session.selected == {"ada/beta"}
    execute(session, "9", console)
    assert "no repository on row 9" in output(console)
    assert session.selected == {"ada/beta"}


def test_select_all_and_none(session, console):
    execute(session, "n", console)
    assert session.selected == set()
    execute(session, "a", console)
    assert len(session.selected) == 3


@pytest.mark.parametrize(
    ("command", "message"),
    [
        ("d", "Enter a scan date"),
        ("d someday", "not a valid date"),
        ("d 2030-01-01", "in the future"),
        ("", "Enter a scan date first"),
        ("m {oops}", "Unknown placeholder"),
        ("frobnicate", "Unknown command"),
        ("t", "Nothing to tweet yet"),
    ],
)
def test_mistakes_are_reported_without_leaving_the_prompt(session, console, command, message):
    assert execute(session, command, console) is True
    assert message in output(console)


def test_message_command_sets_shows_and_resets_the_template(session, console):
    execute(session, "m New PR #{number} on {repo}", console)
    assert session.template == "New PR #{number} on {repo}"
    execute(session, "m reset", console)
    assert session.template == DEFAULT_TEMPLATE


def test_quit_stops_the_loop(session, console):
    assert execute(session, "q", console) is False


def test_run_once_previews_without_yes_and_tweets_with_it(session, poster, console):
    session.set_date("2026-06-05T00:00:00Z")
    assert run_once(session, console, confirmed=False) == 0
    assert poster.posted == []
    assert "--yes" in output(console)

    assert run_once(session, console, confirmed=True) == 0
    assert len(poster.posted) == 3


def test_run_once_fails_when_posting_fails(repos, state, github, console):
    session = Session(repos, state, github, FakePoster(fail_on=1), now=lambda: NOW)
    session.set_date("2026-06-05T00:00:00Z")
    assert run_once(session, console, confirmed=True) == 1
    assert "over capacity" in output(console)


def test_dry_run_is_announced(repos, state, github, console):
    session = Session(repos, state, github, FakePoster(dry_run=True), now=lambda: NOW)
    session.set_date("2026-06-05T00:00:00Z")
    run_once(session, console, confirmed=True)
    assert "nothing was posted or recorded" in output(console)


def test_poster_is_live_only_with_credentials_and_without_dry_run():
    environ = {
        "TWITTER_API_KEY": "a",
        "TWITTER_API_SECRET": "b",
        "TWITTER_ACCESS_TOKEN": "c",
        "TWITTER_ACCESS_SECRET": "d",
    }
    assert isinstance(build_poster(False, {}), DryRunPoster)
    assert isinstance(build_poster(False, environ), TwitterPoster)
    assert isinstance(build_poster(True, environ), DryRunPoster)
