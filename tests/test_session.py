import pytest

from radius_preview.geometry import Radii
from radius_preview.session import Session, apply_command, parse_size

INITIAL = Session(Radii.parse("10"))


def run(line, session=INITIAL):
    return apply_command(session, line, INITIAL)


def test_set_single_corner():
    outcome = run("tl 40")
    assert outcome.session.radii.to_css() == "border-radius: 40px 10px 10px;"
    assert outcome.action is None


def test_set_elliptical_corner_tolerates_spaces():
    outcome = run("BR 80 / 30%")
    assert outcome.session.radii.to_css() == (
        "border-radius: 10px 10px 80px / 10px 10px 30%;"
    )


def test_all_sets_every_corner():
    assert run("all 25%").session.radii.to_css() == "border-radius: 25%;"
    assert run("all 40/20").session.radii.to_css() == "border-radius: 40px / 20px;"


def test_set_takes_a_full_shorthand():
    outcome = run("set 10 40% / 50% 20")
    assert outcome.session.radii == Radii.parse("10 40% / 50% 20")


def test_size_changes_only_the_box():
    outcome = run("size 320x180")
    assert (outcome.session.width, outcome.session.height) == (320, 180)
    assert outcome.session.radii == INITIAL.radii


def test_reset_restores_the_initial_session():
    changed = run("all 99").session
    assert run("reset", changed).session == INITIAL


@pytest.mark.parametrize(
    "line, action",
    [("copy", "copy"), ("help", "help"), ("?", "help"), ("quit", "quit"), ("q", "quit")],
)
def test_actions_leave_the_session_untouched(line, action):
    outcome = run(line)
    assert outcome.action == action
    assert outcome.session == INITIAL


def test_blank_line_is_a_no_op():
    assert run("   ").session == INITIAL


@pytest.mark.parametrize("line", ["tl", "tl abc", "nope 4", "size 10", "size 0x5", "set"])
def test_invalid_commands_raise(line):
    with pytest.raises(ValueError):
        run(line)


def test_parse_size():
    assert parse_size("300x200") == (300, 200)
    assert parse_size("12.5X8") == (12.5, 8)
    for bad in ["300", "axb", "1x2x3", "-1x5"]:
        with pytest.raises(ValueError):
            parse_size(bad)
