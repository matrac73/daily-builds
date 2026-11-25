"""Shared fixtures: an in-memory Slack workspace standing in for the Web API."""

from __future__ import annotations

import pytest

from slack_archiver.archiver import Archiver
from slack_archiver.client import Response, SlackClient
from slack_archiver.store import Store


def ts(n: int) -> str:
    """A Slack timestamp ``n`` minutes after an arbitrary origin (2023-11-14 22:13:20 UTC)."""
    return f"{1_700_000_000 + n * 60}.000100"


class FakeSlack:
    """A transport that answers like Slack, including cursor pagination."""

    def __init__(self) -> None:
        self.is_owner = True
        self.channels = {"C1": "general", "C2": "random"}
        self.users = {"U1": "alice", "U2": "bob"}
        self.messages: dict[str, list[dict]] = {"C1": [], "C2": []}
        self.errors: dict[str, str] = {}
        self.calls: list[tuple[str, dict]] = []

    def post(self, channel_id: str, n: int, text: str, user: str = "U1") -> None:
        self.messages[channel_id].append({"type": "message", "ts": ts(n), "user": user, "text": text})

    def count(self, method: str) -> int:
        return sum(1 for name, _ in self.calls if name == method)

    def __call__(self, method: str, params: dict, token: str) -> Response:
        self.calls.append((method, dict(params)))
        return Response(200, {}, getattr(self, "_" + method.replace(".", "_"))(params))

    def _auth_test(self, params: dict) -> dict:
        return {"ok": True, "user_id": "U1", "user": "alice", "team": "Acme"}

    def _users_info(self, params: dict) -> dict:
        return {"ok": True, "user": {"id": params["user"], "is_owner": self.is_owner}}

    def _users_list(self, params: dict) -> dict:
        members = [{"id": uid, "name": name} for uid, name in self.users.items()]
        return {"ok": True, "members": members}

    def _conversations_list(self, params: dict) -> dict:
        channels = [{"id": cid, "name": name} for cid, name in self.channels.items()]
        return self._page(channels, params, "channels")

    def _conversations_history(self, params: dict) -> dict:
        channel_id = params["channel"]
        if channel_id in self.errors:
            return {"ok": False, "error": self.errors[channel_id]}
        oldest = params.get("oldest", "0")
        newer = [m for m in self.messages[channel_id] if m["ts"] > oldest]
        newer.sort(key=lambda m: m["ts"], reverse=True)
        return self._page(newer, params, "messages")

    @staticmethod
    def _page(items: list, params: dict, key: str) -> dict:
        start, limit = int(params.get("cursor", 0)), int(params["limit"])
        end = start + limit
        more = end < len(items)
        return {
            "ok": True,
            key: items[start:end],
            "has_more": more,
            "response_metadata": {"next_cursor": str(end) if more else ""},
        }


@pytest.fixture
def slack() -> FakeSlack:
    return FakeSlack()


@pytest.fixture
def client(slack: FakeSlack) -> SlackClient:
    return SlackClient("xoxp-test", transport=slack, page_size=2, sleep=lambda seconds: None)


@pytest.fixture
def store(tmp_path) -> Store:
    store = Store(tmp_path / "archive.db")
    yield store
    store.close()


@pytest.fixture
def archiver(client: SlackClient, store: Store) -> Archiver:
    return Archiver(client, store)
