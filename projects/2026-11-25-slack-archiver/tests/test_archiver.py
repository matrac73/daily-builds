import pytest

from slack_archiver.archiver import NotOwnerError
from slack_archiver.store import UnknownChannelError

from .conftest import ts


def test_owner_is_identified(archiver):
    identity = archiver.verify_owner()
    assert (identity.user, identity.team) == ("alice", "Acme")


def test_non_owner_cannot_add_or_sync(archiver, slack, store):
    slack.is_owner = False
    with pytest.raises(NotOwnerError):
        archiver.add_channels(["general"])
    store.add_channel("C1", "general")
    slack.post("C1", 1, "secret")
    with pytest.raises(NotOwnerError):
        archiver.sync()
    assert store.messages() == []
    assert slack.count("conversations.history") == 0


def test_add_channels_resolves_names_and_ids(archiver, store):
    added = archiver.add_channels(["#general", "C2"])
    assert [channel["name"] for channel in added] == ["general", "random"]
    assert [channel["id"] for channel in store.channels()] == ["C1", "C2"]


def test_add_channels_is_all_or_nothing(archiver, store):
    with pytest.raises(UnknownChannelError):
        archiver.add_channels(["general", "missing"])
    assert store.channels() == []


def test_first_sync_fetches_full_history_across_pages(archiver, slack, store):
    archiver.add_channels(["general"])
    for n in range(1, 6):
        slack.post("C1", n, f"msg {n}")

    [result] = archiver.sync()

    assert (result.channel, result.new_messages, result.error) == ("general", 5, None)
    assert [m["text"] for m in store.messages("C1")] == [f"msg {n}" for n in range(1, 6)]
    assert slack.count("conversations.history") == 3  # page size is 2
    assert store.get_channel("general")["last_ts"] == ts(5)


def test_next_sync_only_requests_messages_after_the_cursor(archiver, slack, store):
    archiver.add_channels(["general"])
    slack.post("C1", 1, "old")
    archiver.sync()
    slack.post("C1", 2, "new")
    slack.calls.clear()

    [result] = archiver.sync()

    assert result.new_messages == 1
    history = [params for name, params in slack.calls if name == "conversations.history"]
    assert [params["oldest"] for params in history] == [ts(1)]
    assert [m["text"] for m in store.messages("C1")] == ["old", "new"]


def test_sync_with_nothing_new_keeps_cursor(archiver, slack, store):
    archiver.add_channels(["general"])
    slack.post("C1", 1, "only")
    archiver.sync()
    [result] = archiver.sync()
    assert result.new_messages == 0
    assert store.get_channel("general")["last_ts"] == ts(1)


def test_failed_channel_does_not_block_others_or_move_its_cursor(archiver, slack, store):
    archiver.add_channels(["general", "random"])
    slack.post("C1", 1, "hello")
    slack.post("C2", 1, "world")
    slack.errors["C1"] = "not_in_channel"

    general, random = archiver.sync()

    assert (general.error, general.new_messages) == ("not_in_channel", 0)
    assert (random.error, random.new_messages) == (None, 1)
    assert store.get_channel("general")["last_ts"] is None

    del slack.errors["C1"]
    assert archiver.sync()[0].new_messages == 1


def test_removed_channels_are_skipped(archiver, slack, store):
    archiver.add_channels(["general", "random"])
    store.remove_channel("random")
    assert [result.channel for result in archiver.sync()] == ["general"]


def test_sync_can_target_specific_channels(archiver, slack):
    archiver.add_channels(["general", "random"])
    assert [result.channel for result in archiver.sync(["random"])] == ["random"]


def test_sync_stores_user_names_and_reports_progress(archiver, slack, store):
    archiver.add_channels(["general"])
    for n in range(1, 4):
        slack.post("C1", n, "hi", user="U2")
    seen = []

    archiver.sync(progress=lambda name, count: seen.append((name, count)))

    assert seen == [("general", 2), ("general", 3)]
    assert store.messages("C1")[0]["user"] == "bob"
