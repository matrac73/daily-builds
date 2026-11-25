import csv
import io
import json

import pytest

from slack_archiver.export import export_channel, render_text

from .conftest import ts

USERS = {"U1": "alice", "U2": "bob"}


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("hi <@U2>!", "hi @bob!"),
        ("ask <@U404>", "ask @U404"),
        ("see <#C1|general>", "see #general"),
        ("<!here> deploy", "@here deploy"),
        ("<!subteam^S1|@ops> ping", "@ops ping"),
        ("docs: <https://example.com|the guide>", "docs: the guide (https://example.com)"),
        ("<https://example.com>", "https://example.com"),
        ("a &lt; b &amp;&amp; c &gt; d", "a < b && c > d"),
    ],
)
def test_render_text(raw, expected):
    assert render_text(raw, USERS) == expected


@pytest.fixture
def channel(store):
    store.add_channel("C1", "general")
    store.save_users(USERS.items())
    store.save_messages(
        "C1",
        [
            {"ts": ts(0), "user": "U1", "text": "hello <@U2>, \"quoted\"", "client_msg_id": "x1"},
            {"ts": ts(1), "user": "U2", "text": "line one\nline two"},
            {"ts": ts(24 * 60), "user": "U1", "text": "next day"},
        ],
    )
    return store.get_channel("general")


def export(store, channel, fmt) -> str:
    out = io.StringIO()
    assert export_channel(store, channel, fmt, out) == 3
    return out.getvalue()


def test_json_export_is_lossless(store, channel):
    document = json.loads(export(store, channel, "json"))
    assert document["channel"] == {"id": "C1", "name": "general"}
    first = document["messages"][0]
    assert first["user"] == "alice"
    assert first["text"] == 'hello <@U2>, "quoted"'
    assert first["raw"]["client_msg_id"] == "x1"


def test_jsonl_export_has_one_message_per_line(store, channel):
    lines = export(store, channel, "jsonl").splitlines()
    assert [json.loads(line)["ts"] for line in lines] == [ts(0), ts(1), ts(24 * 60)]


def test_csv_export_renders_text_and_survives_newlines(store, channel):
    rows = list(csv.DictReader(io.StringIO(export(store, channel, "csv"))))
    assert [row["user"] for row in rows] == ["alice", "bob", "alice"]
    assert rows[0]["text"] == 'hello @bob, "quoted"'
    assert rows[1]["text"] == "line one\nline two"
    assert rows[0]["time"] == "2023-11-14T22:13:20Z"


def test_markdown_export_groups_by_day(store, channel):
    text = export(store, channel, "md")
    assert text.startswith("# #general\n\n3 messages archived from Slack, 2023-11-14 to 2023-11-15 (UTC).")
    assert text.count("\n## ") == 2
    assert "## 2023-11-15\n\n**alice** `22:13:20`\n\nnext day\n" in text
    assert "hello @bob" in text


def test_markdown_export_of_empty_channel(store):
    store.add_channel("C2", "random")
    out = io.StringIO()
    assert export_channel(store, store.get_channel("random"), "md", out) == 0
    assert "No messages archived yet" in out.getvalue()


def test_unknown_format_is_rejected(store, channel):
    with pytest.raises(ValueError):
        export_channel(store, channel, "xml", io.StringIO())
