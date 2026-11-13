from datetime import datetime, timezone

import pytest

from gittweet.errors import StateError
from gittweet.state import State


def test_missing_file_gives_an_empty_state(tmp_path):
    state = State.load(tmp_path / "state.json")
    assert state.last_scan_date is None
    assert state.selected_repos is None
    assert state.tweeted == set()
    assert state.template is None


def test_round_trip(tmp_path):
    path = tmp_path / "nested" / "state.json"
    State(
        path=path,
        last_scan_date=datetime(2026, 6, 5, 9, 30, tzinfo=timezone.utc),
        selected_repos=["ada/alpha"],
        tweeted={"ada/alpha#7", "ada/beta#3"},
        template="PR #{number}",
    ).save()

    loaded = State.load(path)

    assert loaded.last_scan_date == datetime(2026, 6, 5, 9, 30, tzinfo=timezone.utc)
    assert loaded.selected_repos == ["ada/alpha"]
    assert loaded.tweeted == {"ada/alpha#7", "ada/beta#3"}
    assert loaded.template == "PR #{number}"
    assert [entry.name for entry in path.parent.iterdir()] == ["state.json"]


def test_an_empty_selection_is_not_confused_with_no_selection(tmp_path):
    path = tmp_path / "state.json"
    State(path=path, selected_repos=[]).save()
    assert State.load(path).selected_repos == []


def test_corrupt_file_raises_a_state_error(tmp_path):
    path = tmp_path / "state.json"
    path.write_text("{not json", encoding="utf-8")
    with pytest.raises(StateError, match="Cannot read state file"):
        State.load(path)


def test_in_memory_state_does_not_touch_the_disk(tmp_path):
    State(tweeted={"ada/alpha#1"}).save()
    assert list(tmp_path.iterdir()) == []
