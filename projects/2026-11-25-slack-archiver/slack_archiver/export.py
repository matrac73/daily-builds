"""Copy an archived channel to a file: JSON, JSON Lines, CSV or Markdown."""

from __future__ import annotations

import csv
import html
import json
import re
from collections.abc import Mapping
from typing import Any, TextIO

from .store import Store

FORMATS = ("json", "jsonl", "csv", "md")

_MARKUP = re.compile(r"<([^<>]+)>")


def render_text(text: str, users: Mapping[str, str]) -> str:
    """Turn Slack markup into readable text.

    ``<@U123>`` becomes ``@name``, ``<#C123|general>`` becomes ``#general``,
    ``<https://x.io|label>`` becomes ``label (https://x.io)`` and HTML entities
    are decoded.
    """

    def replace(match: re.Match[str]) -> str:
        target, _, label = match.group(1).partition("|")
        if target.startswith("@"):
            return "@" + (label or users.get(target[1:], target[1:]))
        if target.startswith("#"):
            return "#" + (label or target[1:])
        if target.startswith("!"):
            return label or "@" + target[1:]
        return f"{label} ({target})" if label else target

    return html.unescape(_MARKUP.sub(replace, text))


def export_channel(store: Store, channel: Mapping[str, Any], fmt: str, out: TextIO) -> int:
    """Write every archived message of ``channel`` to ``out``; return the count.

    JSON and JSON Lines are lossless (they embed the original Slack payload);
    CSV and Markdown are meant for people and render Slack markup.
    """
    if fmt not in FORMATS:
        raise ValueError(f"unsupported format: {fmt}")
    lossless = fmt in ("json", "jsonl")
    messages = store.messages(channel["id"], include_raw=lossless)
    if fmt == "json":
        document = {
            "channel": {"id": channel["id"], "name": channel["name"]},
            "messages": messages,
        }
        json.dump(document, out, ensure_ascii=False, indent=2)
        out.write("\n")
    elif fmt == "jsonl":
        for message in messages:
            out.write(json.dumps(message, ensure_ascii=False) + "\n")
    else:
        users = store.users()
        for message in messages:
            message["text"] = render_text(message["text"], users)
        if fmt == "csv":
            _write_csv(messages, out)
        else:
            _write_markdown(channel["name"], messages, out)
    return len(messages)


def _write_csv(messages: list[dict[str, Any]], out: TextIO) -> None:
    fields = ["ts", "time", "user_id", "user", "text", "subtype", "thread_ts"]
    writer = csv.DictWriter(out, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    writer.writerows(messages)


def _write_markdown(name: str, messages: list[dict[str, Any]], out: TextIO) -> None:
    out.write(f"# #{name}\n\n")
    if not messages:
        out.write("_No messages archived yet._\n")
        return
    first, last = messages[0]["time"][:10], messages[-1]["time"][:10]
    out.write(f"{len(messages)} messages archived from Slack, {first} to {last} (UTC).\n")
    day = None
    for message in messages:
        date, clock = message["time"][:10], message["time"][11:19]
        if date != day:
            day = date
            out.write(f"\n## {date}\n")
        out.write(f"\n**{message['user']}** `{clock}`\n\n{message['text']}\n")
