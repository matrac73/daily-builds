import pytest

from slack_archiver.store import Store, UnknownChannelError, ts_to_iso

from .conftest import ts


def message(n: int, text: str, user: str = "U1") -> dict:
    return {"ts": ts(n), "user": user, "text": text}


@pytest.fixture
def general(store: Store) -> str:
    store.add_channel("C1", "general")
    return "C1"


def test_ts_to_iso():
    assert ts_to_iso("1700000000.000100") == "2023-11-14T22:13:20Z"


@pytest.mark.parametrize("ref", ["general", "#general", "General", "C1"])
def test_channel_lookup_accepts_names_and_ids(store, general, ref):
    assert store.get_channel(ref)["id"] == "C1"


def test_unknown_channel_raises(store):
    with pytest.raises(UnknownChannelError):
        store.get_channel("nope")


def test_saving_is_idempotent(store, general):
    assert store.save_messages(general, [message(1, "a"), message(2, "b")]) == 2
    assert store.save_messages(general, [message(2, "b"), message(3, "c")]) == 1
    assert [m["text"] for m in store.messages(general)] == ["a", "b", "c"]


def test_channel_statistics(store, general):
    store.save_messages(general, [message(5, "later"), message(1, "first")])
    channel = store.get_channel("general")
    assert channel["message_count"] == 2
    assert (channel["first_ts"], channel["newest_ts"]) == (ts(1), ts(5))
    assert channel["active"] is True


def test_messages_filters_and_ordering(store, general):
    store.save_messages(general, [message(n, f"msg {n}") for n in range(1, 6)])
    assert [m["text"] for m in store.messages(general, after=ts(3))] == ["msg 4", "msg 5"]
    assert [m["text"] for m in store.messages(general, before=ts(2))] == ["msg 1"]
    newest = store.messages(general, limit=2, newest_first=True)
    assert [m["text"] for m in newest] == ["msg 5", "msg 4"]


def test_query_is_a_literal_case_insensitive_substring(store, general):
    store.save_messages(
        general, [message(1, "Deploy is 100% done"), message(2, "deploy at 1000 rps"), message(3, "a_b")]
    )
    assert len(store.messages(query="DEPLOY")) == 2
    assert [m["text"] for m in store.messages(query="100%")] == ["Deploy is 100% done"]
    assert [m["text"] for m in store.messages(query="_")] == ["a_b"]


def test_user_names_are_resolved_with_fallbacks(store, general):
    store.save_users([("U1", "alice")])
    store.save_messages(general, [message(1, "a", "U1"), message(2, "b", "U9"), {"ts": ts(3), "text": "c"}])
    assert [m["user"] for m in store.messages(general)] == ["alice", "U9", "unknown"]


def test_raw_payload_round_trips(store, general):
    original = {"ts": ts(1), "user": "U1", "text": "hi", "reactions": [{"name": "tada", "count": 2}]}
    store.save_messages(general, [original])
    assert store.messages(general, include_raw=True)[0]["raw"] == original
    assert "raw" not in store.messages(general)[0]


def test_remove_keeps_messages_and_readding_keeps_cursor(store, general):
    store.save_messages(general, [message(1, "a")])
    store.record_sync(general, ts(1))
    store.remove_channel("general")
    assert store.channels(active_only=True) == []
    assert store.get_channel("general")["message_count"] == 1

    store.add_channel("C1", "general")
    channel = store.get_channel("general")
    assert channel["active"] is True and channel["last_ts"] == ts(1)


def test_purge_deletes_channel_and_messages(store, general):
    store.save_messages(general, [message(1, "a")])
    store.remove_channel("general", purge=True)
    assert store.channels() == []
    assert store.messages() == []


def test_record_sync_without_new_messages_keeps_cursor(store, general):
    store.record_sync(general, ts(4))
    store.record_sync(general, None)
    channel = store.get_channel("general")
    assert channel["last_ts"] == ts(4)
    assert channel["last_synced_at"] is not None
