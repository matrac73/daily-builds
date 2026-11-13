"""State persisted across sessions: tweeted PRs, last scan date, selections."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from .errors import StateError


def default_state_path() -> Path:
    return Path.home() / ".gittweet" / "state.json"


@dataclass
class State:
    """Everything GitTweet remembers between runs.

    ``selected_repos`` is ``None`` until the user changes the selection for the
    first time, which lets a first run start with every repository selected.
    A state without a ``path`` lives in memory only.
    """

    path: Path | None = None
    last_scan_date: datetime | None = None
    selected_repos: list[str] | None = None
    tweeted: set[str] = field(default_factory=set)
    template: str | None = None

    @classmethod
    def load(cls, path: Path) -> "State":
        if not path.exists():
            return cls(path=path)
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            last_scan = raw.get("last_scan_date")
            selected = raw.get("selected_repos")
            return cls(
                path=path,
                last_scan_date=datetime.fromisoformat(last_scan) if last_scan else None,
                selected_repos=list(selected) if selected is not None else None,
                tweeted=set(raw.get("tweeted", [])),
                template=raw.get("template"),
            )
        except (OSError, ValueError, AttributeError, TypeError) as error:
            raise StateError(f"Cannot read state file {path}: {error}") from error

    def save(self) -> None:
        if self.path is None:
            return
        payload = {
            "last_scan_date": self.last_scan_date.isoformat() if self.last_scan_date else None,
            "selected_repos": self.selected_repos,
            "tweeted": sorted(self.tweeted),
            "template": self.template,
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Write to a sibling file first so a crash never leaves a truncated state.
        temporary = self.path.with_name(self.path.name + ".tmp")
        temporary.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        os.replace(temporary, self.path)
