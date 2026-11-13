"""Shared fakes: an in-memory GitHub and a recording tweet poster."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from gittweet.core import PullRequest, Repo, Session
from gittweet.errors import ApiError
from gittweet.state import State

NOW = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)


def make_pr(repo: str, number: int, day: int) -> PullRequest:
    return PullRequest(
        repo=repo,
        number=number,
        title=f"Change {number}",
        author="octocat",
        url=f"https://github.com/{repo}/pull/{number}",
        created_at=datetime(2026, 6, day, tzinfo=timezone.utc),
    )


class FakeGitHub:
    def __init__(self, pull_requests: list[PullRequest]):
        self.pull_requests = pull_requests
        self.scanned: list[str] = []

    def list_pull_requests(self, full_name: str, since: datetime) -> list[PullRequest]:
        self.scanned.append(full_name)
        return [pr for pr in self.pull_requests if pr.repo == full_name and pr.created_at > since]


class FakePoster:
    def __init__(self, dry_run: bool = False, fail_on: int | None = None):
        self.dry_run = dry_run
        self.fail_on = fail_on  # 1-based index of the post() call that fails
        self.posted: list[str] = []

    def post(self, text: str) -> str | None:
        if self.fail_on == len(self.posted) + 1:
            raise ApiError("Twitter API error 503: over capacity")
        self.posted.append(text)
        return None if self.dry_run else f"https://x.com/i/web/status/{len(self.posted)}"


@pytest.fixture
def repos() -> list[Repo]:
    return [
        Repo("ada/alpha", "alpha", "First project"),
        Repo("ada/beta", "beta", ""),
        Repo("ada/gamma", "gamma", "Third project"),
    ]


@pytest.fixture
def github() -> FakeGitHub:
    return FakeGitHub(
        [
            make_pr("ada/alpha", 7, day=10),
            make_pr("ada/alpha", 8, day=12),
            make_pr("ada/beta", 3, day=11),
            make_pr("ada/gamma", 1, day=2),
        ]
    )


@pytest.fixture
def poster() -> FakePoster:
    return FakePoster()


@pytest.fixture
def state(tmp_path) -> State:
    return State(path=tmp_path / "state.json")


@pytest.fixture
def session(repos, state, github, poster) -> Session:
    return Session(repos, state, github, poster, now=lambda: NOW)
