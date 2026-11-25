import json
import threading
import urllib.error
import urllib.request

import pytest

from slack_archiver.api import make_server
from slack_archiver.store import Store

from .conftest import ts


@pytest.fixture
def base_url(tmp_path):
    db_path = tmp_path / "archive.db"
    store = Store(db_path)
    store.add_channel("C1", "general")
    store.add_channel("C2", "random")
    store.save_users([("U1", "alice")])
    store.save_messages("C1", [{"ts": ts(n), "user": "U1", "text": f"msg {n}"} for n in range(1, 6)])
    store.save_messages("C2", [{"ts": ts(9), "user": "U1", "text": "msg in random"}])
    store.close()

    server = make_server(db_path, port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()
    thread.join()


def get(url: str) -> tuple[int, dict]:
    try:
        with urllib.request.urlopen(url) as reply:
            return reply.status, json.load(reply)
    except urllib.error.HTTPError as exc:
        return exc.code, json.load(exc)


def test_index_lists_endpoints(base_url):
    status, body = get(base_url + "/")
    assert status == 200
    assert "/channels" in body["endpoints"]


def test_channels(base_url):
    status, body = get(base_url + "/channels")
    assert status == 200
    assert [(c["name"], c["message_count"]) for c in body["channels"]] == [("general", 5), ("random", 1)]


def test_channel_messages_by_name_or_id(base_url):
    by_name = get(base_url + "/channels/general/messages")
    by_id = get(base_url + "/channels/C1/messages")
    assert by_name == by_id
    status, body = by_name
    assert status == 200 and body["count"] == 5
    assert body["messages"][0] == {
        "channel_id": "C1",
        "channel": "general",
        "ts": ts(1),
        "time": "2023-11-14T22:14:20Z",
        "user_id": "U1",
        "user": "alice",
        "text": "msg 1",
        "subtype": None,
        "thread_ts": None,
    }


def test_paging_with_after_and_limit(base_url):
    _, first = get(base_url + "/channels/general/messages?limit=2")
    assert [m["text"] for m in first["messages"]] == ["msg 1", "msg 2"]
    cursor = first["messages"][-1]["ts"]
    _, second = get(base_url + f"/channels/general/messages?limit=2&after={cursor}")
    assert [m["text"] for m in second["messages"]] == ["msg 3", "msg 4"]


def test_search_spans_channels_newest_first(base_url):
    status, body = get(base_url + "/search?q=msg&limit=2")
    assert status == 200
    assert [m["text"] for m in body["messages"]] == ["msg in random", "msg 5"]


@pytest.mark.parametrize(
    ("path", "status"),
    [
        ("/channels/nope/messages", 404),
        ("/nothing/here", 404),
        ("/search", 400),
        ("/channels/general/messages?limit=abc", 400),
        ("/channels/general/messages?limit=0", 400),
    ],
)
def test_errors(base_url, path, status):
    code, body = get(base_url + path)
    assert code == status
    assert body["error"]
