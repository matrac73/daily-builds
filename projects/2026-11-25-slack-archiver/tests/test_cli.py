import argparse
import json

import pytest

from slack_archiver import cli
from slack_archiver.client import SlackClient


@pytest.mark.parametrize(
    ("text", "seconds"),
    [("90", 90), ("90s", 90), ("15m", 900), ("2h", 7200), ("1d", 86400), (" 5M ", 300)],
)
def test_parse_interval(text, seconds):
    assert cli.parse_interval(text) == seconds


@pytest.mark.parametrize("text", ["", "0", "0m", "soon", "1.5h", "-5m", "10w"])
def test_parse_interval_rejects_nonsense(text):
    with pytest.raises(argparse.ArgumentTypeError):
        cli.parse_interval(text)


@pytest.fixture
def run(slack, tmp_path, monkeypatch):
    """Run the CLI against the fake workspace and a throwaway database."""
    monkeypatch.setattr(
        cli,
        "build_client",
        lambda args: SlackClient("xoxp-test", transport=slack, sleep=lambda seconds: None),
    )
    monkeypatch.chdir(tmp_path)
    return lambda *argv: cli.main(["--db", str(tmp_path / "archive.db"), *argv])


def test_full_workflow(run, slack, tmp_path, capsys):
    slack.post("C1", 1, "the deploy key lives in the vault")
    slack.post("C1", 2, "thanks <@U1>", user="U2")

    assert run("auth") == 0
    assert "owner" in capsys.readouterr().out

    assert run("channels", "add", "general") == 0
    assert run("sync") == 0
    assert "general" in capsys.readouterr().out

    assert run("channels", "list") == 0
    assert "active" in capsys.readouterr().out

    assert run("search", "vault") == 0
    assert "alice" in capsys.readouterr().out

    assert run("export", "general", "-f", "md") == 0
    exported = (tmp_path / "general.md").read_text(encoding="utf-8")
    assert "thanks @alice" in exported
    assert "Wrote 2 messages" in capsys.readouterr().out

    assert run("export", "general", "-f", "jsonl", "-o", "-") == 0
    lines = capsys.readouterr().out.strip().splitlines()
    assert [json.loads(line)["user"] for line in lines] == ["alice", "bob"]

    assert run("channels", "remove", "general") == 0
    assert run("sync") == 0
    assert "Nothing to sync" in capsys.readouterr().out


def test_non_owner_is_refused(run, slack, capsys):
    slack.is_owner = False
    assert run("channels", "add", "general") == 1
    assert "not an owner" in capsys.readouterr().err


def test_sync_reports_channel_errors_with_exit_code(run, slack, capsys):
    run("channels", "add", "general")
    slack.errors["C1"] = "not_in_channel"
    assert run("sync") == 1
    assert "not_in_channel" in capsys.readouterr().out


def test_unknown_channel_is_a_clean_error(run, capsys):
    assert run("export", "nope") == 1
    assert "unknown channel" in capsys.readouterr().err


def test_missing_token_is_a_clean_error(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("SLACK_TOKEN", raising=False)
    assert cli.main(["--db", str(tmp_path / "archive.db"), "auth"]) == 1
    assert "SLACK_TOKEN" in capsys.readouterr().err
