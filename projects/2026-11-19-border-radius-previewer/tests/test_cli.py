import subprocess

import pytest

from radius_preview import cli, clipboard


@pytest.fixture
def copied(monkeypatch):
    """Replace the system clipboard with a list capturing what was copied."""
    texts = []
    monkeypatch.setattr(clipboard, "copy", lambda text: texts.append(text) or True)
    return texts


class TestClipboard:
    def test_picks_platform_command(self):
        assert clipboard.clipboard_command("win32", lambda name: name) == ["clip"]
        assert clipboard.clipboard_command("darwin", lambda name: name) == ["pbcopy"]

    def test_linux_falls_back_to_first_installed_tool(self):
        command = clipboard.clipboard_command(
            "linux", lambda name: name if name == "xclip" else None
        )
        assert command == ["xclip", "-selection", "clipboard"]

    def test_no_tool_available(self):
        assert clipboard.clipboard_command("linux", lambda name: None) is None
        assert clipboard.clipboard_command("plan9", lambda name: name) is None

    def test_copy_pipes_text_to_the_command(self):
        calls = []
        ok = clipboard.copy(
            "border-radius: 4px;",
            command=["fake"],
            run=lambda cmd, **kwargs: calls.append((cmd, kwargs["input"])),
        )
        assert ok
        assert calls == [(["fake"], b"border-radius: 4px;")]

    def test_copy_reports_failure(self):
        def failing(cmd, **kwargs):
            raise subprocess.CalledProcessError(1, cmd)

        assert clipboard.copy("x", command=["fake"], run=failing) is False


class TestMain:
    def test_css_only(self, capsys):
        assert cli.main(["10", "20", "--css-only"]) == 0
        assert capsys.readouterr().out == "border-radius: 10px 20px;\n"

    def test_eight_values_and_corner_overrides(self, capsys):
        cli.main(["10", "/", "20", "--tl", "80/30", "--bl", "5%", "--css-only"])
        assert capsys.readouterr().out == (
            "border-radius: 80px 10px 10px 5% / 30px 20px 20px 5%;\n"
        )

    def test_default_shape(self, capsys):
        cli.main(["--css-only"])
        assert "30% 70% 70% 30% / 30% 30% 70% 70%" in capsys.readouterr().out

    def test_full_view_shows_shape_and_css(self, capsys):
        assert cli.main(["50%", "--columns", "20"]) == 0
        out = capsys.readouterr().out
        assert "█" in out
        assert "border-radius: 50%;" in out
        assert "top-left" in out

    def test_overlap_warning(self, capsys):
        cli.main(["150", "--size", "200x200"])
        assert "scales them all by 0.667" in capsys.readouterr().out

    def test_copy(self, capsys, copied):
        assert cli.main(["12", "--copy", "--css-only"]) == 0
        assert copied == ["border-radius: 12px;"]

    def test_copy_failure_sets_exit_code(self, monkeypatch, capsys):
        monkeypatch.setattr(clipboard, "copy", lambda text: False)
        assert cli.main(["12", "--copy", "--css-only"]) == 1

    @pytest.mark.parametrize(
        "argv",
        [["abc"], ["1", "2", "3", "4", "5"], ["--size", "bad"], ["--columns", "1"], ["--tl", "x"]],
    )
    def test_invalid_input_exits_with_usage_error(self, argv, capsys):
        with pytest.raises(SystemExit) as exit_info:
            cli.main(argv)
        assert exit_info.value.code == 2


class TestInteractive:
    def play(self, monkeypatch, capsys, lines):
        answers = iter(lines)

        def fake_input(self, prompt=""):
            try:
                return next(answers)
            except StopIteration:
                raise EOFError from None

        monkeypatch.setattr(cli.Console, "input", fake_input)
        assert cli.main(["10", "-i", "--columns", "12"]) == 0
        return capsys.readouterr().out

    def test_edit_then_copy(self, monkeypatch, capsys, copied):
        out = self.play(monkeypatch, capsys, ["tl 40", "br 20/5", "copy", "quit"])
        assert copied == ["border-radius: 40px 10px 20px / 40px 10px 5px;"]
        assert "CSS copied" in out

    def test_errors_do_not_end_the_session(self, monkeypatch, capsys, copied):
        out = self.play(monkeypatch, capsys, ["bogus 1", "all 5", "copy"])
        assert "unknown command" in out
        assert copied == ["border-radius: 5px;"]

    def test_help(self, monkeypatch, capsys):
        assert "SHORTHAND" in self.play(monkeypatch, capsys, ["help"])
