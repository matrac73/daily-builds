"""Copy text to the system clipboard using whatever native tool exists."""

from __future__ import annotations

import shutil
import subprocess
import sys
from collections.abc import Callable

# Candidate commands per platform, tried in order.
_COMMANDS = {
    "win32": (["clip"],),
    "darwin": (["pbcopy"],),
    "linux": (
        ["wl-copy"],
        ["xclip", "-selection", "clipboard"],
        ["xsel", "--clipboard", "--input"],
    ),
}


def clipboard_command(
    platform: str = sys.platform,
    which: Callable[[str], str | None] = shutil.which,
) -> list[str] | None:
    """Return the first available clipboard command, or ``None``."""
    key = "linux" if platform.startswith("linux") else platform
    for command in _COMMANDS.get(key, ()):
        if which(command[0]):
            return command
    return None


def copy(
    text: str,
    command: list[str] | None = None,
    run: Callable[..., object] = subprocess.run,
) -> bool:
    """Copy ``text`` to the clipboard; return ``False`` if it is unavailable."""
    command = command or clipboard_command()
    if command is None:
        return False
    try:
        run(command, input=text.encode("utf-8"), check=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return False
    return True
