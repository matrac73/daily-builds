"""Pure border-radius logic: parsing, CSS output and rasterisation.

Everything here follows the CSS Backgrounds and Borders spec: the shorthand
expansion rules, percentages resolved against the box (horizontal radii
against the width, vertical radii against the height) and the proportional
shrinking of radii that would otherwise overlap.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace

CORNERS = ("tl", "tr", "br", "bl")
CORNER_NAMES = {
    "tl": "top-left",
    "tr": "top-right",
    "br": "bottom-right",
    "bl": "bottom-left",
}

_LENGTH_RE = re.compile(r"^(\d+(?:\.\d+)?|\.\d+)(px|%)?$")


@dataclass(frozen=True)
class Length:
    """A non-negative CSS length in pixels or percent."""

    value: float
    unit: str = "px"

    def __post_init__(self) -> None:
        if self.unit not in ("px", "%"):
            raise ValueError(f"unsupported unit {self.unit!r} (use px or %)")
        if self.value < 0:
            raise ValueError("a radius cannot be negative")
        if self.value == 0:
            # 0px and 0% are the same length; keep one canonical form.
            object.__setattr__(self, "unit", "px")

    @classmethod
    def parse(cls, text: str) -> Length:
        match = _LENGTH_RE.match(text.strip().lower())
        if not match:
            raise ValueError(
                f"invalid radius {text!r} (expected e.g. 40, 40px or 25%)"
            )
        return cls(float(match.group(1)), match.group(2) or "px")

    def resolve(self, reference: float) -> float:
        """Return the length in pixels, given the box side it refers to."""
        if self.unit == "%":
            return self.value * reference / 100
        return self.value

    def __str__(self) -> str:
        if self.value == 0:
            return "0"
        return f"{self.value:g}{self.unit}"


Quad = tuple[Length, Length, Length, Length]


def _expand(values: list[Length]) -> Quad:
    """Expand 1-4 shorthand values to (tl, tr, br, bl)."""
    if len(values) == 1:
        a = values[0]
        return (a, a, a, a)
    if len(values) == 2:
        a, b = values
        return (a, b, a, b)
    if len(values) == 3:
        a, b, c = values
        return (a, b, c, b)
    if len(values) == 4:
        return (values[0], values[1], values[2], values[3])
    raise ValueError("expected between 1 and 4 radius values")


def _collapse(quad: Quad) -> str:
    """Write (tl, tr, br, bl) using as few shorthand values as possible."""
    tl, tr, br, bl = quad
    values = [tl, tr, br, bl]
    if bl == tr:
        values.pop()
        if br == tl:
            values.pop()
            if tr == tl:
                values.pop()
    return " ".join(str(value) for value in values)


def parse_corner(text: str) -> tuple[Length, Length]:
    """Parse one corner: ``40`` (circular) or ``40/20`` (horizontal/vertical)."""
    parts = text.split("/")
    if len(parts) > 2:
        raise ValueError(f"invalid corner {text!r} (expected R or H/V)")
    horizontal = Length.parse(parts[0])
    vertical = Length.parse(parts[1]) if len(parts) == 2 else horizontal
    return horizontal, vertical


@dataclass(frozen=True)
class ResolvedRadii:
    """Used radii in pixels, one ``(rx, ry)`` pair per corner (tl, tr, br, bl)."""

    corners: tuple[tuple[float, float], ...]
    scale: float

    @property
    def was_scaled(self) -> bool:
        return self.scale < 1


@dataclass(frozen=True)
class Radii:
    """The eight values of ``border-radius``, ordered tl, tr, br, bl."""

    horizontal: Quad
    vertical: Quad

    @classmethod
    def uniform(cls, length: Length) -> Radii:
        quad = (length, length, length, length)
        return cls(quad, quad)

    @classmethod
    def parse(cls, text: str) -> Radii:
        """Parse a ``border-radius`` shorthand value such as ``10 20 / 30%``."""
        text = text.strip().removesuffix(";").strip()
        if text.lower().startswith("border-radius"):
            text = text.split(":", 1)[-1]
        parts = text.split("/")
        if len(parts) > 2:
            raise ValueError("border-radius accepts at most one '/'")
        quads = []
        for part in parts:
            tokens = part.split()
            if not tokens:
                raise ValueError("missing radius values")
            quads.append(_expand([Length.parse(token) for token in tokens]))
        return cls(quads[0], quads[-1])

    def corner(self, corner: str) -> tuple[Length, Length]:
        index = _corner_index(corner)
        return self.horizontal[index], self.vertical[index]

    def with_corner(
        self, corner: str, horizontal: Length, vertical: Length | None = None
    ) -> Radii:
        """Return a copy with one corner replaced (circular if no vertical)."""
        index = _corner_index(corner)
        new_h = list(self.horizontal)
        new_v = list(self.vertical)
        new_h[index] = horizontal
        new_v[index] = horizontal if vertical is None else vertical
        return replace(self, horizontal=tuple(new_h), vertical=tuple(new_v))

    @property
    def value(self) -> str:
        """The shortest equivalent shorthand value, without the property name."""
        horizontal = _collapse(self.horizontal)
        if self.horizontal == self.vertical:
            return horizontal
        return f"{horizontal} / {_collapse(self.vertical)}"

    def to_css(self) -> str:
        return f"border-radius: {self.value};"

    def resolve(self, width: float, height: float) -> ResolvedRadii:
        """Compute used pixel radii for a ``width`` x ``height`` box.

        When adjacent radii add up to more than a side, every radius is
        multiplied by the same factor so the curves no longer overlap.
        """
        rx = [length.resolve(width) for length in self.horizontal]
        ry = [length.resolve(height) for length in self.vertical]
        sides = (
            (width, rx[0] + rx[1]),  # top
            (width, rx[2] + rx[3]),  # bottom
            (height, ry[0] + ry[3]),  # left
            (height, ry[1] + ry[2]),  # right
        )
        scale = min([1.0] + [side / total for side, total in sides if total > 0])
        corners = tuple((x * scale, y * scale) for x, y in zip(rx, ry))
        return ResolvedRadii(corners, scale)


def _corner_index(corner: str) -> int:
    try:
        return CORNERS.index(corner)
    except ValueError:
        raise ValueError(
            f"unknown corner {corner!r} (expected one of {', '.join(CORNERS)})"
        ) from None


def contains(
    x: float, y: float, width: float, height: float, resolved: ResolvedRadii
) -> bool:
    """Tell whether point ``(x, y)`` lies inside the rounded box."""
    if not (0 <= x <= width and 0 <= y <= height):
        return False
    (tl, tr, br, bl) = resolved.corners
    # Each entry: ellipse centre and radii for one corner region.
    regions = (
        (tl[0], tl[1], tl, x < tl[0] and y < tl[1]),
        (width - tr[0], tr[1], tr, x > width - tr[0] and y < tr[1]),
        (width - br[0], height - br[1], br, x > width - br[0] and y > height - br[1]),
        (bl[0], height - bl[1], bl, x < bl[0] and y > height - bl[1]),
    )
    for cx, cy, (rx, ry), in_corner_region in regions:
        if in_corner_region:
            return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
    return True


def rasterize(
    radii: Radii, width: float, height: float, columns: int
) -> list[list[bool]]:
    """Sample the shape on a grid of square pixels, ``columns`` wide.

    The number of rows keeps the box's aspect ratio and is always even so
    two pixel rows can be packed into one line of terminal half-blocks.
    """
    if columns < 2:
        raise ValueError("columns must be at least 2")
    if width <= 0 or height <= 0:
        raise ValueError("box dimensions must be positive")
    rows = max(2, round(columns * height / width))
    rows += rows % 2
    resolved = radii.resolve(width, height)
    return [
        [
            contains(
                (col + 0.5) * width / columns,
                (row + 0.5) * height / rows,
                width,
                height,
                resolved,
            )
            for col in range(columns)
        ]
        for row in range(rows)
    ]


def half_block(top: bool, bottom: bool) -> str:
    """Pick the character showing two stacked pixels in one terminal cell."""
    if top and bottom:
        return "█"
    if top:
        return "▀"
    if bottom:
        return "▄"
    return " "


def to_half_blocks(mask: list[list[bool]]) -> list[str]:
    """Pack a pixel mask (even number of rows) into lines of half-blocks."""
    return [
        "".join(half_block(top, bottom) for top, bottom in zip(mask[i], mask[i + 1]))
        for i in range(0, len(mask), 2)
    ]
