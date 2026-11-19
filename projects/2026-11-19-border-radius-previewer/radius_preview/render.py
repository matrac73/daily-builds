"""Rich renderables: the coloured shape, the radii table and the CSS panel."""

from __future__ import annotations

from rich.align import Align
from rich.color import Color
from rich.console import Group, RenderableType
from rich.panel import Panel
from rich.style import Style
from rich.table import Table
from rich.text import Text

from .geometry import CORNER_NAMES, CORNERS, Radii, rasterize, to_half_blocks
from .session import Session

GRADIENT = ((99, 102, 241), (236, 72, 153))  # indigo -> pink


def _gradient(position: float) -> Style:
    start, end = GRADIENT
    rgb = (round(a + (b - a) * position) for a, b in zip(start, end))
    return Style(color=Color.from_rgb(*rgb))


def shape_text(radii: Radii, width: float, height: float, columns: int) -> Text:
    """Draw the box with half-blocks, tinted by a diagonal gradient."""
    lines = to_half_blocks(rasterize(radii, width, height, columns))
    text = Text(no_wrap=True)
    span = max(1, columns + len(lines) - 2)
    for row, line in enumerate(lines):
        if row:
            text.append("\n")
        for col, char in enumerate(line):
            text.append(char, None if char == " " else _gradient((col + row) / span))
    return text


def radii_table(session: Session) -> Table:
    """List each corner's declared values and the pixel radii actually used."""
    resolved = session.radii.resolve(session.width, session.height)
    table = Table(box=None, padding=(0, 2, 0, 0), header_style="dim")
    table.add_column("corner")
    table.add_column("horizontal", justify="right")
    table.add_column("vertical", justify="right")
    table.add_column("used (px)", justify="right", style="dim")
    for corner, (rx, ry) in zip(CORNERS, resolved.corners):
        horizontal, vertical = session.radii.corner(corner)
        table.add_row(
            f"[bold cyan]{corner}[/] {CORNER_NAMES[corner]}",
            str(horizontal),
            str(vertical),
            f"{rx:.4g} / {ry:.4g}",
        )
    return table


def build_view(session: Session, columns: int) -> RenderableType:
    """Assemble the full preview: shape, values and resulting CSS."""
    resolved = session.radii.resolve(session.width, session.height)
    shape = Panel(
        Align.center(
            shape_text(session.radii, session.width, session.height, columns)
        ),
        title="preview",
        subtitle=f"{session.width:g} × {session.height:g} px",
        border_style="dim",
        padding=(1, 2),
    )
    parts: list[RenderableType] = [shape, radii_table(session)]
    if resolved.was_scaled:
        parts.append(
            Text(
                f"Radii overlap: the browser scales them all by {resolved.scale:.3g}.",
                style="yellow",
            )
        )
    css = Text(session.radii.to_css(), style="bold green")
    parts.append(Panel(css, title="css", title_align="left", border_style="green"))
    return Group(*parts)
