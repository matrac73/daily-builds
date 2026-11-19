"""Command-line entry point: one-shot preview and interactive mode."""

from __future__ import annotations

import argparse
import sys

from rich.console import Console

from . import __version__, clipboard
from .geometry import CORNER_NAMES, CORNERS, Radii, parse_corner
from .render import build_view
from .session import (
    DEFAULT_RADII,
    DEFAULT_SIZE,
    HELP,
    Session,
    apply_command,
    parse_size,
)

EXAMPLES = """\
examples:
  radius-preview 40                         four equal corners
  radius-preview 10 40 80 20                top-left, top-right, bottom-right, bottom-left
  radius-preview 50% 20% / 10% 40%          all 8 values, CSS shorthand syntax
  radius-preview 20 --tl 80/30 --copy       override a corner, copy the CSS
  radius-preview -i                         tweak the shape interactively
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="radius-preview",
        description="Preview a CSS border-radius in the terminal and copy the CSS.",
        epilog=EXAMPLES,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "values",
        nargs="*",
        help="border-radius shorthand: 1-4 radii, optionally '/' and 1-4 vertical "
        f"radii, in px or %% (default: {DEFAULT_RADII.replace('%', '%%')})",
    )
    for corner in CORNERS:
        parser.add_argument(
            f"--{corner}",
            metavar="R[/V]",
            help=f"override the {CORNER_NAMES[corner]} corner (e.g. 40, 25%%, 80/30)",
        )
    parser.add_argument(
        "-s",
        "--size",
        default="{:g}x{:g}".format(*DEFAULT_SIZE),
        metavar="WxH",
        help="box size in px, used for %% values and the aspect ratio (default: %(default)s)",
    )
    parser.add_argument(
        "--columns",
        type=int,
        default=48,
        metavar="N",
        help="width of the preview in terminal columns (default: %(default)s)",
    )
    parser.add_argument(
        "-c", "--copy", action="store_true", help="copy the resulting CSS to the clipboard"
    )
    parser.add_argument(
        "--css-only", action="store_true", help="print just the CSS declaration"
    )
    parser.add_argument(
        "-i", "--interactive", action="store_true", help="edit the shape in a live prompt"
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def session_from_args(args: argparse.Namespace) -> Session:
    """Build the initial state from parsed arguments (raises ``ValueError``)."""
    radii = Radii.parse(" ".join(args.values) if args.values else DEFAULT_RADII)
    for corner in CORNERS:
        override = getattr(args, corner)
        if override is not None:
            radii = radii.with_corner(corner, *parse_corner(override))
    width, height = parse_size(args.size)
    if args.columns < 2:
        raise ValueError("--columns must be at least 2")
    return Session(radii, width, height)


def _copy(console: Console, css: str) -> bool:
    if clipboard.copy(css):
        console.print("[green]✓[/] CSS copied to the clipboard.")
        return True
    console.print("[red]✗[/] No clipboard tool found; copy the CSS above by hand.")
    return False


def run_interactive(console: Console, initial: Session, columns: int) -> None:
    """Read commands until the user quits, redrawing after each change."""
    session = initial
    console.print(build_view(session, columns))
    console.print("[dim]Type 'help' for the commands, 'quit' to leave.[/]")
    while True:
        try:
            line = console.input("[bold magenta]radius>[/] ")
        except (EOFError, KeyboardInterrupt):
            console.print()
            return
        try:
            outcome = apply_command(session, line, initial)
        except ValueError as error:
            console.print(f"[red]{error}[/]")
            continue
        if outcome.action == "quit":
            return
        if outcome.action == "help":
            console.print(HELP)
        elif outcome.action == "copy":
            _copy(console, session.radii.to_css())
        elif outcome.session != session:
            session = outcome.session
            console.print(build_view(session, columns))
        if outcome.message:
            console.print(f"[dim]{outcome.message}[/]")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    # The preview is drawn with block characters: make sure they can be
    # written even when the output is piped through a legacy code page.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    console = Console()

    try:
        session = session_from_args(args)
    except ValueError as error:
        parser.error(str(error))

    if args.interactive:
        run_interactive(console, session, args.columns)
        return 0

    css = session.radii.to_css()
    if args.css_only:
        print(css)
    else:
        console.print(build_view(session, args.columns))
    if args.copy and not _copy(Console(stderr=True) if args.css_only else console, css):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
