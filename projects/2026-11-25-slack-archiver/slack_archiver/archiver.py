"""The archiving workflow: owner check, channel tracking and incremental sync."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from .client import SlackClient, SlackError
from .store import Store, UnknownChannelError, normalize_ref


class NotOwnerError(PermissionError):
    """The token does not belong to an owner of the Slack workspace."""


@dataclass(frozen=True)
class Identity:
    user: str
    team: str


@dataclass(frozen=True)
class SyncResult:
    channel: str
    new_messages: int
    error: str | None = None


Progress = Callable[[str, int], None]


class Archiver:
    """Every operation that talks to Slack first proves the caller is an owner."""

    def __init__(self, client: SlackClient, store: Store) -> None:
        self.client = client
        self.store = store

    def verify_owner(self) -> Identity:
        """Return who the token belongs to, or raise ``NotOwnerError``."""
        auth = self.client.auth_test()
        user = self.client.user_info(auth["user_id"])
        if not (user.get("is_owner") or user.get("is_primary_owner")):
            raise NotOwnerError(
                f"{auth.get('user', auth['user_id'])} is not an owner of the "
                f"{auth.get('team', 'Slack')} workspace. Use a user token (xoxp-...) "
                "issued to a workspace owner."
            )
        return Identity(user=auth.get("user", auth["user_id"]), team=auth.get("team", ""))

    def remote_channels(self) -> list[dict[str, Any]]:
        """Every public and private channel visible to the owner's token."""
        self.verify_owner()
        return sorted(self.client.list_channels(), key=lambda channel: channel["name"])

    def add_channels(self, refs: Iterable[str]) -> list[dict[str, Any]]:
        """Resolve names or IDs against the workspace and start tracking them.

        Nothing is added unless every reference resolves.
        """
        wanted = [normalize_ref(ref) for ref in refs]
        remote = self.remote_channels()
        resolved = []
        for key in wanted:
            match = next(
                (c for c in remote if key == c["id"] or key.lower() == c["name"]), None
            )
            if match is None:
                raise UnknownChannelError(key)
            resolved.append(match)
        for channel in resolved:
            self.store.add_channel(channel["id"], channel["name"])
        return resolved

    def sync(self, refs: Iterable[str] = (), progress: Progress | None = None) -> list[SyncResult]:
        """Fetch new messages for the given channels (default: all tracked ones).

        A failure in one channel is reported in its result and does not stop the
        others.
        """
        refs = list(refs)
        if refs:
            channels = [self.store.get_channel(ref) for ref in refs]
        else:
            channels = self.store.channels(active_only=True)
        self.verify_owner()
        if channels:
            self.store.save_users(
                (user["id"], _display_name(user)) for user in self.client.list_users()
            )
        return [self._sync_channel(channel, progress) for channel in channels]

    def _sync_channel(self, channel: dict[str, Any], progress: Progress | None) -> SyncResult:
        """Archive everything newer than the channel's cursor.

        Slack returns pages newest-first, so the cursor only advances once the
        whole range has been stored: an interrupted run is simply repeated, and
        duplicate inserts are ignored.
        """
        added, newest = 0, None
        try:
            for page in self.client.history(channel["id"], oldest=channel["last_ts"]):
                added += self.store.save_messages(channel["id"], page)
                if page and newest is None:
                    newest = max(message["ts"] for message in page)
                if progress:
                    progress(channel["name"], added)
        except SlackError as exc:
            return SyncResult(channel["name"], added, error=exc.code)
        self.store.record_sync(channel["id"], newest)
        return SyncResult(channel["name"], added)


def _display_name(user: dict[str, Any]) -> str:
    profile = user.get("profile", {})
    return profile.get("display_name") or user.get("real_name") or user.get("name") or user["id"]
