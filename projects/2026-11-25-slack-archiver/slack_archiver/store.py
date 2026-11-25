"""SQLite persistence for tracked channels, their messages and user names."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS channels (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    active         INTEGER NOT NULL DEFAULT 1,
    added_at       TEXT NOT NULL,
    last_ts        TEXT,
    last_synced_at TEXT
);
CREATE TABLE IF NOT EXISTS messages (
    channel_id TEXT NOT NULL REFERENCES channels(id),
    ts         TEXT NOT NULL,
    user_id    TEXT,
    text       TEXT NOT NULL,
    subtype    TEXT,
    thread_ts  TEXT,
    raw        TEXT NOT NULL,
    PRIMARY KEY (channel_id, ts)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS users (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL
);
"""


class UnknownChannelError(LookupError):
    """The requested channel is not in the archive (or not in the workspace)."""

    def __init__(self, ref: str) -> None:
        super().__init__(f"unknown channel: {ref}")
        self.ref = ref


def normalize_ref(ref: str) -> str:
    """Accept ``#general``, ``General`` or a channel ID interchangeably."""
    return ref.strip().lstrip("#")


def ts_to_iso(ts: str) -> str:
    """Convert a Slack timestamp (``1700000000.000100``) to an ISO-8601 UTC string."""
    moment = datetime.fromtimestamp(float(ts), tz=timezone.utc)
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Store:
    """The archive database.

    Slack timestamps are stored as text: they are fixed-width, so lexical order
    is chronological order and no precision is lost to floating point.
    """

    def __init__(self, path: str | Path) -> None:
        self.db = sqlite3.connect(str(path))
        self.db.row_factory = sqlite3.Row
        with self.db:
            self.db.executescript(SCHEMA)

    def close(self) -> None:
        self.db.close()

    # -- channels ---------------------------------------------------------

    def add_channel(self, channel_id: str, name: str) -> None:
        """Track a channel. Re-adding a removed channel resumes from its cursor."""
        with self.db:
            self.db.execute(
                "INSERT INTO channels (id, name, added_at) VALUES (?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET name = excluded.name, active = 1",
                (channel_id, name, _now()),
            )

    def remove_channel(self, ref: str, *, purge: bool = False) -> dict[str, Any]:
        """Stop tracking a channel; with ``purge`` also delete its messages."""
        channel = self.get_channel(ref)
        with self.db:
            if purge:
                self.db.execute("DELETE FROM messages WHERE channel_id = ?", (channel["id"],))
                self.db.execute("DELETE FROM channels WHERE id = ?", (channel["id"],))
            else:
                self.db.execute("UPDATE channels SET active = 0 WHERE id = ?", (channel["id"],))
        return channel

    def get_channel(self, ref: str) -> dict[str, Any]:
        key = normalize_ref(ref)
        matches = [c for c in self.channels() if key == c["id"] or key.lower() == c["name"]]
        if not matches:
            raise UnknownChannelError(ref)
        return matches[0]

    def channels(self, *, active_only: bool = False) -> list[dict[str, Any]]:
        """All known channels with message statistics, ordered by name."""
        rows = self.db.execute(
            "SELECT c.*, COUNT(m.ts) AS message_count, MIN(m.ts) AS first_ts, "
            "       MAX(m.ts) AS newest_ts "
            "FROM channels c LEFT JOIN messages m ON m.channel_id = c.id "
            + ("WHERE c.active = 1 " if active_only else "")
            + "GROUP BY c.id ORDER BY c.name"
        )
        return [{**dict(row), "active": bool(row["active"])} for row in rows]

    def record_sync(self, channel_id: str, last_ts: str | None) -> None:
        """Mark a completed sync and advance the cursor when new messages arrived."""
        with self.db:
            self.db.execute(
                "UPDATE channels SET last_ts = COALESCE(?, last_ts), last_synced_at = ? WHERE id = ?",
                (last_ts, _now(), channel_id),
            )

    # -- messages ---------------------------------------------------------

    def save_messages(self, channel_id: str, messages: Iterable[dict[str, Any]]) -> int:
        """Insert messages, ignoring ones already archived. Returns the number added."""
        rows = [
            (
                channel_id,
                message["ts"],
                message.get("user"),
                message.get("text", ""),
                message.get("subtype"),
                message.get("thread_ts"),
                json.dumps(message, ensure_ascii=False, sort_keys=True),
            )
            for message in messages
        ]
        before = self.db.total_changes
        with self.db:
            self.db.executemany("INSERT OR IGNORE INTO messages VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
        return self.db.total_changes - before

    def messages(
        self,
        channel_id: str | None = None,
        *,
        after: str | None = None,
        before: str | None = None,
        query: str | None = None,
        limit: int | None = None,
        newest_first: bool = False,
        include_raw: bool = False,
    ) -> list[dict[str, Any]]:
        """Archived messages matching the filters, oldest first by default.

        ``after`` and ``before`` are exclusive Slack timestamps; ``query`` is a
        case-insensitive substring match on the message text.
        """
        clauses, args = [], []
        if channel_id is not None:
            clauses.append("m.channel_id = ?")
            args.append(channel_id)
        if after is not None:
            clauses.append("m.ts > ?")
            args.append(after)
        if before is not None:
            clauses.append("m.ts < ?")
            args.append(before)
        if query:
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            clauses.append("m.text LIKE ? ESCAPE '\\'")
            args.append(f"%{escaped}%")
        sql = (
            "SELECT m.*, c.name AS channel, COALESCE(u.name, m.user_id, 'unknown') AS user "
            "FROM messages m JOIN channels c ON c.id = m.channel_id "
            "LEFT JOIN users u ON u.id = m.user_id "
            + ("WHERE " + " AND ".join(clauses) + " " if clauses else "")
            + f"ORDER BY m.ts {'DESC' if newest_first else 'ASC'}, m.channel_id"
        )
        if limit is not None:
            sql += " LIMIT ?"
            args.append(limit)
        return [_message(row, include_raw) for row in self.db.execute(sql, args)]

    # -- users ------------------------------------------------------------

    def save_users(self, users: Iterable[tuple[str, str]]) -> None:
        with self.db:
            self.db.executemany(
                "INSERT INTO users (id, name) VALUES (?, ?) "
                "ON CONFLICT(id) DO UPDATE SET name = excluded.name",
                list(users),
            )

    def users(self) -> dict[str, str]:
        return {row["id"]: row["name"] for row in self.db.execute("SELECT id, name FROM users")}


def _message(row: sqlite3.Row, include_raw: bool) -> dict[str, Any]:
    message = {
        "channel_id": row["channel_id"],
        "channel": row["channel"],
        "ts": row["ts"],
        "time": ts_to_iso(row["ts"]),
        "user_id": row["user_id"],
        "user": row["user"],
        "text": row["text"],
        "subtype": row["subtype"],
        "thread_ts": row["thread_ts"],
    }
    if include_raw:
        message["raw"] = json.loads(row["raw"])
    return message
