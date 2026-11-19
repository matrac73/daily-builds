"""State and command language of the interactive mode (no I/O here)."""

from __future__ import annotations

from dataclasses import dataclass, replace

from .geometry import CORNERS, Radii, parse_corner

DEFAULT_RADII = "30% 70% 70% 30% / 30% 30% 70% 70%"
DEFAULT_SIZE = (200.0, 200.0)

HELP = """\
[bold]tl[/] | [bold]tr[/] | [bold]br[/] | [bold]bl[/] R      set one corner, e.g. [cyan]tl 40[/] or [cyan]br 25%[/]
[bold]tl[/] H/V                  elliptical corner, e.g. [cyan]tl 80/30[/]
[bold]all[/] R | H/V             set the four corners at once
[bold]set[/] SHORTHAND           any CSS value, e.g. [cyan]set 10 40% / 50% 20[/]
[bold]size[/] WxH                resize the box, e.g. [cyan]size 320x180[/]
[bold]copy[/]                    copy the CSS to the clipboard
[bold]reset[/]                   back to the starting shape
[bold]help[/], [bold]quit[/]"""


@dataclass(frozen=True)
class Session:
    radii: Radii
    width: float = DEFAULT_SIZE[0]
    height: float = DEFAULT_SIZE[1]


@dataclass(frozen=True)
class Outcome:
    """Result of one command: the new state plus what the UI should do."""

    session: Session
    message: str = ""
    action: str | None = None  # "copy", "help", "quit" or None


def parse_size(text: str) -> tuple[float, float]:
    """Parse a ``WIDTHxHEIGHT`` box size in pixels."""
    parts = text.lower().split("x")
    try:
        width, height = (float(part) for part in parts)
    except ValueError:
        raise ValueError(f"invalid size {text!r} (expected e.g. 300x200)") from None
    if width <= 0 or height <= 0:
        raise ValueError("box dimensions must be positive")
    return width, height


def apply_command(session: Session, line: str, initial: Session) -> Outcome:
    """Run one interactive command; raises ``ValueError`` on bad input."""
    name, _, argument = line.strip().partition(" ")
    name = name.lower()
    argument = argument.strip()

    if not name:
        return Outcome(session)
    if name in ("quit", "exit", "q"):
        return Outcome(session, action="quit")
    if name in ("help", "?"):
        return Outcome(session, action="help")
    if name == "copy":
        return Outcome(session, action="copy")
    if name == "reset":
        return Outcome(initial, "Shape reset.")

    if not argument:
        raise ValueError(f"'{name}' needs a value (type 'help' for the commands)")
    if name in CORNERS:
        horizontal, vertical = parse_corner(argument.replace(" ", ""))
        radii = session.radii.with_corner(name, horizontal, vertical)
        return Outcome(replace(session, radii=radii))
    if name == "all":
        horizontal, vertical = parse_corner(argument.replace(" ", ""))
        radii = Radii((horizontal,) * 4, (vertical,) * 4)
        return Outcome(replace(session, radii=radii))
    if name == "set":
        return Outcome(replace(session, radii=Radii.parse(argument)))
    if name == "size":
        width, height = parse_size(argument)
        return Outcome(replace(session, width=width, height=height))
    raise ValueError(f"unknown command '{name}' (type 'help' for the commands)")
