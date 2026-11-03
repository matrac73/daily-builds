#!/usr/bin/env python3
"""Fouet - a pixel-art whip for your desktop.

Click the pixel button in the bottom-right corner of your screen (or press
Ctrl+Alt+W): a whip snaps onto your mouse. Flick, then stop dead (or pull back):
the lash cracks at its tip. If it cracks on a text zone of any application,
Fouet clicks there and types "faster", "do it", "make it"... Chain hits to
escalate to ALL CAPS.

Single file, Python 3.8+ standard library only. Desktop mode runs on Windows.

    py fouet.py              # start (pyw fouet.py: same, without a console)
    py fouet.py --help       # options
"""
from __future__ import annotations

import argparse
import math
import os
import random
import struct
import sys
import tempfile
import time
import wave
from collections import deque
from typing import Dict, List, Optional, Tuple

__version__ = "2.1.0"

Cell = Tuple[int, int]

# --------------------------------------------------------------------------- palette

TRANSPARENT = "#010203"  # colour key of the overlay: never used by the sprites
OUTLINE = "#240c00"
LASH = ("#b83200", "#e04400", "#ff5a0a", "#ff7a1a", "#ff9f40")  # root -> tip
LASH_CORE = "#ffc46b"
CRACKER = "#fff4dc"
HANDLE = "#7a3f14"
HANDLE_WRAP = "#3d1d07"
POMMEL = "#ffb000"
FIRE = ("#fff4dc", "#ffd166", "#ff9f1c", "#ff5a0a", "#c42a00")  # hot -> cold
TIER_COLORS = ("#ffd166", "#ff7a1a", "#ff2d2d")
MISS_COLOR = "#fff4dc"

# --------------------------------------------------------------------------- phrases

PHRASES = (
    ("faster", "do it", "make it", "go on", "come on", "keep going", "push it"),
    ("FASTER!", "DO IT NOW!", "MAKE IT WORK!", "SHIP IT!", "NO BREAKS!", "MOVE IT!"),
    ("FASTER!!!", "DO IT. NOW.", "NO EXCUSES!!", "MAKE IT HAPPEN!!", "HARDER!!!", "SHIP IT YESTERDAY!"),
)


def tier_for_combo(combo: int, tier_count: int = len(PHRASES), hits_per_tier: int = 3) -> int:
    """Every `hits_per_tier` hits in a combo unlock the next, louder tier."""
    if combo < 1:
        return 0
    return min(tier_count - 1, (combo - 1) // hits_per_tier)


class PhrasePicker:
    """Random picker that never returns the same phrase twice in a row."""

    def __init__(self, phrases=PHRASES, rng: Optional[random.Random] = None):
        self.phrases = phrases
        self.rng = rng or random.Random()
        self.last: Optional[str] = None

    def pick(self, tier: int) -> str:
        pool = self.phrases[max(0, min(len(self.phrases) - 1, tier))]
        choices = [p for p in pool if p != self.last] if len(pool) > 1 else list(pool)
        self.last = self.rng.choice(choices)
        return self.last


class Combo:
    """Counts hits landing within `window` seconds of each other."""

    def __init__(self, window: float = 1.8):
        self.window = window
        self.count = 0
        self.last_hit = -math.inf

    def hit(self, now: float) -> int:
        self.count = self.count + 1 if now - self.last_hit <= self.window else 1
        self.last_hit = now
        return self.count


# --------------------------------------------------------------------------- physics


class Whip:
    """Verlet rope pinned to the handle, with a bend limit at every joint.

    The bend limit is what keeps the lash from folding onto itself: the root is
    stiff (small angles allowed) and the tip supple, so a flick travels down the
    lash as a clean loop instead of a crumpled noodle.
    """

    def __init__(self, x: float, y: float, segments: int = 20, segment_length: float = 13.0,
                 gravity: float = 1500.0, damping: float = 0.993, iterations: int = 12,
                 step: float = 1 / 120, max_substeps: int = 8,
                 bend_root: float = 14.0, bend_tip: float = 48.0):
        self.segments = segments
        self.segment_length = segment_length
        self.gravity = gravity
        self.damping = damping
        self.iterations = iterations
        self.step = step
        self.max_substeps = max_substeps
        # Joint i may deviate from straight by at most max_bend[i] degrees.
        self.max_bend = [0.0] * (segments + 1)
        for i in range(1, segments):
            self.max_bend[i] = bend_root + (bend_tip - bend_root) * (i / segments) ** 1.5
        self.max_bend_rad = [math.radians(a) for a in self.max_bend]
        self.points: List[List[float]] = []
        self.reset(x, y)

    def reset(self, x: float, y: float) -> None:
        self.points = [[x, y + i * self.segment_length, x, y + i * self.segment_length]
                       for i in range(self.segments + 1)]
        self.anchor = (x, y)
        self.accumulator = 0.0

    @property
    def tip(self) -> Tuple[float, float]:
        p = self.points[-1]
        return p[0], p[1]

    @property
    def length(self) -> float:
        return self.segments * self.segment_length

    def reach(self, dx: float, dy: float) -> float:
        """How far the tip is thrown along direction (dx, dy), from the handle."""
        head, tip = self.points[0], self.points[-1]
        return (tip[0] - head[0]) * dx + (tip[1] - head[1]) * dy

    def steer(self, dx: float, dy: float, pull: float) -> None:
        """Pull every point towards the straight line leaving the handle along
        (dx, dy); the tip is pulled hardest. Velocities follow (Verlet)."""
        hx, hy = self.points[0][0], self.points[0][1]
        n = len(self.points) - 1
        for i in range(1, n + 1):
            p = self.points[i]
            k = pull * (0.4 + 0.6 * i / n)
            p[0] += (hx + dx * self.segment_length * i - p[0]) * k
            p[1] += (hy + dy * self.segment_length * i - p[1]) * k

    def joint_angles(self) -> List[float]:
        """Deviation from straight (degrees) at every inner joint."""
        out = []
        pts = self.points
        for i in range(1, len(pts) - 1):
            ax, ay = pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]
            bx, by = pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]
            cross, dot = ax * by - ay * bx, ax * bx + ay * by
            out.append(abs(math.degrees(math.atan2(cross, dot))))
        return out

    def _substep(self, ax: float, ay: float, dt: float) -> float:
        pts = self.points
        head = pts[0]
        head[2], head[3], head[0], head[1] = head[0], head[1], ax, ay
        g = self.gravity * dt * dt
        damping = self.damping
        for p in pts[1:]:
            vx = (p[0] - p[2]) * damping
            vy = (p[1] - p[3]) * damping
            p[2], p[3] = p[0], p[1]
            p[0] += vx
            p[1] += vy + g

        seg = self.segment_length
        last = len(pts) - 1
        for _ in range(self.iterations):
            for i in range(last):
                a, b = pts[i], pts[i + 1]
                dx, dy = b[0] - a[0], b[1] - a[1]
                dist = math.hypot(dx, dy) or 1e-6
                diff = (dist - seg) / dist
                if i == 0:  # pinned head: the neighbour takes the whole correction
                    b[0] -= dx * diff
                    b[1] -= dy * diff
                else:
                    h = diff * 0.5
                    a[0] += dx * h
                    a[1] += dy * h
                    b[0] -= dx * h
                    b[1] -= dy * h

        # Bend limit, root to tip: each segment is put back inside a cone of
        # +/- max_bend around the previous one, at exactly its rest length.
        # One pass is exact because a segment only depends on those before it.
        for i in range(last):
            a, b = pts[i], pts[i + 1]
            dx, dy = b[0] - a[0], b[1] - a[1]
            if i >= 1:
                prev = pts[i - 1]
                rx, ry = a[0] - prev[0], a[1] - prev[1]
                bend = math.atan2(rx * dy - ry * dx, rx * dx + ry * dy)
                limit = self.max_bend_rad[i]
                if abs(bend) > limit:
                    heading = math.atan2(ry, rx) + math.copysign(limit, bend)
                    dx, dy = math.cos(heading), math.sin(heading)
            k = seg / (math.hypot(dx, dy) or 1e-6)
            b[0], b[1] = a[0] + dx * k, a[1] + dy * k

        tip = pts[-1]
        return math.hypot(tip[0] - tip[2], tip[1] - tip[3]) / dt

    def update(self, ax: float, ay: float, frame_dt: float) -> float:
        """Advance towards anchor (ax, ay); returns the peak tip speed (px/s)."""
        self.accumulator += max(0.0, frame_dt)
        steps = int(self.accumulator / self.step)
        if steps > self.max_substeps:
            steps, self.accumulator = self.max_substeps, 0.0
        else:
            self.accumulator -= steps * self.step
        peak = 0.0
        fx, fy = self.anchor
        for s in range(1, steps + 1):
            t = s / steps
            peak = max(peak, self._substep(fx + (ax - fx) * t, fy + (ay - fy) * t, self.step))
        if steps:
            self.anchor = (ax, ay)
        return peak


# --------------------------------------------------------------------------- crack rule


class VelocityTracker:
    """Hand velocity measured over the last `span` seconds of positions.

    Frame-to-frame differences lie: a frame that received no mouse update reads
    as a dead stop and would crack mid-swing. A short time window does not.
    """

    def __init__(self, span: float = 0.035):
        self.span = span
        self.samples: deque = deque()

    def reset(self) -> None:
        self.samples.clear()

    def update(self, x: float, y: float, now: float) -> Tuple[float, float]:
        s = self.samples
        s.append((x, y, now))
        while len(s) > 2 and now - s[1][2] >= self.span:
            s.popleft()
        ox, oy, ot = s[0]
        dt = now - ot
        return ((x - ox) / dt, (y - oy) / dt) if dt > 0 else (0.0, 0.0)


class Flick:
    __slots__ = ("speed", "dx", "dy")

    def __init__(self, speed: float, dx: float, dy: float):
        self.speed, self.dx, self.dy = speed, dx, dy


class FlickDetector:
    """Fires when the hand moved fast and then stops dead or pulls back.

    Speeding up never cracks (the old "cracks as soon as I start" problem):
    only a sharp brake does. A brake means that, within `window` seconds of a
    peak above `min_speed`, the hand speed fell under `stop_ratio` x peak, or its
    velocity now points backwards (projection on the peak direction below
    -`reverse_ratio` x peak).
    """

    def __init__(self, min_speed: float = 1100.0, stop_ratio: float = 0.3,
                 reverse_ratio: float = 0.12, window: float = 0.2, cooldown: float = 0.22):
        self.min_speed = min_speed
        self.stop_ratio = stop_ratio
        self.reverse_ratio = reverse_ratio
        self.window = window
        self.cooldown = cooldown
        self.history: deque = deque()
        self.last_fire = -math.inf

    def reset(self) -> None:
        self.history.clear()

    def update(self, vx: float, vy: float, now: float) -> Optional[Flick]:
        if now - self.last_fire < self.cooldown:
            return None  # ignore the motion tail of the flick that just cracked
        hist = self.history
        while hist and now - hist[0][2] > self.window:
            hist.popleft()
        if hist:
            pvx, pvy, _ = max(hist, key=lambda h: h[0] * h[0] + h[1] * h[1])
            peak = math.hypot(pvx, pvy)
            if peak >= self.min_speed:
                speed = math.hypot(vx, vy)
                along = (vx * pvx + vy * pvy) / peak
                if speed <= peak * self.stop_ratio or along <= -peak * self.reverse_ratio:
                    self.last_fire = now
                    hist.clear()
                    return Flick(peak, pvx / peak, pvy / peak)
        hist.append((vx, vy, now))
        return None


class LashSnap:
    """After a flick, snaps the lash straight along the swing direction and
    cracks once it is extended (`reach` x its length) or after `max_delay` s.

    This is the "crack where I aim" part: a real whip thrown by a sharp brake
    unrolls along the line of the swing; the snap makes that reliable instead
    of leaving it to a pendulum that can swing the tip anywhere.
    """

    def __init__(self, pull: float = 0.4, reach: float = 0.85, max_delay: float = 0.15):
        self.pull = pull
        self.reach = reach
        self.max_delay = max_delay
        self.flick: Optional[Flick] = None
        self.started = 0.0

    @property
    def pending(self) -> bool:
        return self.flick is not None

    def start(self, flick: Flick, now: float) -> None:
        self.flick, self.started = flick, now

    def update(self, whip: "Whip", now: float) -> Optional[Flick]:
        """Call after `whip.update` each frame; returns the flick when it cracks."""
        flick = self.flick
        if flick is None:
            return None
        whip.steer(flick.dx, flick.dy, self.pull)
        if whip.reach(flick.dx, flick.dy) >= self.reach * whip.length or now - self.started >= self.max_delay:
            self.flick = None
            return flick
        return None


def crack_intensity(speed: float, min_speed: float) -> float:
    """0..1 strength of a crack, from the hand speed of its flick."""
    if speed <= min_speed:
        return 0.0
    return min(1.0, (speed - min_speed) / (min_speed * 2))


# --------------------------------------------------------------------------- pixel art

BAYER = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
N8 = N4 + ((1, 1), (1, -1), (-1, 1), (-1, -1))


def dither_keep(x: int, y: int, fade: float) -> bool:
    """Ordered-dither dissolve: a cell survives while fade < its Bayer threshold."""
    return (BAYER[y & 3][x & 3] + 0.5) / 16 > fade


def raster_line(x0: int, y0: int, x1: int, y1: int) -> List[Cell]:
    """Bresenham line, both ends included."""
    cells = []
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        cells.append((x0, y0))
        if x0 == x1 and y0 == y1:
            return cells
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def circle_cells(cx: int, cy: int, r: int) -> List[Cell]:
    """Midpoint circle outline."""
    if r <= 0:
        return [(cx, cy)]
    cells = set()
    x, y, err = r, 0, 1 - r
    while x >= y:
        for px, py in ((x, y), (y, x), (-y, x), (-x, y), (-x, -y), (-y, -x), (y, -x), (x, -y)):
            cells.add((cx + px, cy + py))
        y += 1
        if err < 0:
            err += 2 * y + 1
        else:
            x -= 1
            err += 2 * (y - x) + 1
    return sorted(cells)


def stamp(cells: Dict[Cell, str], x: int, y: int, size: int, color: str) -> None:
    lo = -(size // 2)
    for oy in range(lo, lo + size):
        for ox in range(lo, lo + size):
            cells[(x + ox, y + oy)] = color


def add_outline(cells: Dict[Cell, str], color: str, neighbours=N4) -> None:
    ring = {}
    for x, y in cells:
        for dx, dy in neighbours:
            k = (x + dx, y + dy)
            if k not in cells:
                ring[k] = color
    cells.update(ring)


def lash_width(t: float) -> int:
    return 3 if t < 0.3 else 2 if t < 0.68 else 1


def whip_sprite(points, grip: Tuple[float, float], hilt: Tuple[float, float], cell: float) -> Dict[Cell, str]:
    """Pixel sprite of handle + lash, in cell coordinates, with a dark outline."""
    cells: Dict[Cell, str] = {}
    c = [(int(p[0] // cell), int(p[1] // cell)) for p in points]
    n = len(c) - 1
    for i in range(n):
        t = i / n
        width = lash_width(t)
        color = LASH[min(len(LASH) - 1, int(t * len(LASH)))]
        line = raster_line(c[i][0], c[i][1], c[i + 1][0], c[i + 1][1])
        for x, y in line:
            stamp(cells, x, y, width, color)
        if width >= 2:
            for x, y in line:
                cells[(x, y)] = LASH_CORE
    tx, ty = c[-1]
    cells[(tx, ty)] = CRACKER

    gx, gy = int(grip[0] // cell), int(grip[1] // cell)
    hx, hy = int(hilt[0] // cell), int(hilt[1] // cell)
    for k, (x, y) in enumerate(raster_line(gx, gy, hx, hy)):
        stamp(cells, x, y, 3, HANDLE_WRAP if k % 3 == 2 else HANDLE)
    stamp(cells, gx, gy, 3, POMMEL)
    cells[(hx, hy)] = POMMEL
    add_outline(cells, OUTLINE)
    return cells


def color_runs(cells: Dict[Cell, str]) -> List[Tuple[int, int, int, str]]:
    """Merge horizontal neighbours of the same colour: (y, x_start, x_end, colour)."""
    runs = []
    for (x, y) in sorted(cells, key=lambda k: (k[1], k[0])):
        color = cells[(x, y)]
        if runs and runs[-1][0] == y and runs[-1][2] == x - 1 and runs[-1][3] == color:
            ry, rx0, _, rc = runs[-1]
            runs[-1] = (ry, rx0, x, rc)
        else:
            runs.append((y, x, x, color))
    return runs


# 5x7 pixel font (uppercase only: lowercase text is drawn in capitals).
_FONT_ROWS = {
    "A": ".###. #...# #...# ##### #...# #...# #...#",
    "B": "####. #...# #...# ####. #...# #...# ####.",
    "C": ".###. #...# #.... #.... #.... #...# .###.",
    "D": "####. #...# #...# #...# #...# #...# ####.",
    "E": "##### #.... #.... ####. #.... #.... #####",
    "F": "##### #.... #.... ####. #.... #.... #....",
    "G": ".###. #...# #.... #.### #...# #...# .####",
    "H": "#...# #...# #...# ##### #...# #...# #...#",
    "I": ".###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.",
    "J": "..### ...#. ...#. ...#. #..#. #..#. .##..",
    "K": "#...# #..#. #.#.. ##... #.#.. #..#. #...#",
    "L": "#.... #.... #.... #.... #.... #.... #####",
    "M": "#...# ##.## #.#.# #.#.# #...# #...# #...#",
    "N": "#...# #...# ##..# #.#.# #..## #...# #...#",
    "O": ".###. #...# #...# #...# #...# #...# .###.",
    "P": "####. #...# #...# ####. #.... #.... #....",
    "Q": ".###. #...# #...# #...# #.#.# #..#. .##.#",
    "R": "####. #...# #...# ####. #.#.. #..#. #...#",
    "S": ".#### #.... #.... .###. ....# ....# ####.",
    "T": "##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..",
    "U": "#...# #...# #...# #...# #...# #...# .###.",
    "V": "#...# #...# #...# #...# #...# .#.#. ..#..",
    "W": "#...# #...# #...# #.#.# #.#.# #.#.# .#.#.",
    "X": "#...# #...# .#.#. ..#.. .#.#. #...# #...#",
    "Y": "#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..",
    "Z": "##### ....# ...#. ..#.. .#... #.... #####",
    "0": ".###. #...# #..## #.#.# ##..# #...# .###.",
    "1": "..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.",
    "2": ".###. #...# ....# ...#. ..#.. .#... #####",
    "3": "##### ...#. ..#.. ...#. ....# #...# .###.",
    "4": "...#. ..##. .#.#. #..#. ##### ...#. ...#.",
    "5": "##### #.... ####. ....# ....# #...# .###.",
    "6": "..##. .#... #.... ####. #...# #...# .###.",
    "7": "##### ....# ...#. ..#.. .#... .#... .#...",
    "8": ".###. #...# #...# .###. #...# #...# .###.",
    "9": ".###. #...# #...# .#### ....# ...#. .##..",
    "!": "..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..",
    ".": "..... ..... ..... ..... ..... ..... ..#..",
    "'": "..#.. ..#.. ..... ..... ..... ..... .....",
    "?": ".###. #...# ....# ...#. ..#.. ..... ..#..",
    "-": "..... ..... ..... ##### ..... ..... .....",
    " ": "..... ..... ..... ..... ..... ..... .....",
}
FONT = {ch: rows.split() for ch, rows in _FONT_ROWS.items()}
GLYPH_W, GLYPH_H, GLYPH_ADVANCE = 5, 7, 6


def text_cells(text: str, scale: int = 1) -> Tuple[List[Cell], int, int]:
    """Lit cells of `text` (top-left origin), plus its width and height in cells."""
    cells = []
    for i, ch in enumerate(text.upper()):
        rows = FONT.get(ch, FONT["?"])
        ox = i * GLYPH_ADVANCE * scale
        for ry, row in enumerate(rows):
            for rx, bit in enumerate(row):
                if bit == "#":
                    for sy in range(scale):
                        for sx in range(scale):
                            cells.append((ox + rx * scale + sx, ry * scale + sy))
    width = max(0, len(text) * GLYPH_ADVANCE - 1) * scale
    return cells, width, GLYPH_H * scale


# 16x16 button icon. H/h handle, P pommel, L lash, S spark.
ICON = (
    "................",
    ".............S..",
    "......LLL...SSS.",
    ".....L...L...S..",
    ".....L....L.L...",
    "......L....L....",
    ".......L........",
    "........L.......",
    ".......hH.......",
    "......HHh.......",
    ".....hHH........",
    "....HHh.........",
    "...hHH..........",
    "..PPh...........",
    "..PP............",
    "................",
)
ICON_OFF = {"bg": "#141414", "rim": "#ff5a0a", "L": "#ff5a0a", "H": "#c98a4b", "h": "#6b3a14",
            "P": "#ffb000", "S": "#ffd166"}
ICON_ON = {"bg": "#ff5a0a", "rim": "#240c00", "L": "#240c00", "H": "#5a2a08", "h": "#240c00",
           "P": "#fff4dc", "S": "#fff4dc"}


def icon_cells(on: bool, spark: bool = True) -> Dict[Cell, str]:
    pal = ICON_ON if on else ICON_OFF
    cells: Dict[Cell, str] = {}
    size = len(ICON)
    for y in range(size):
        for x in range(size):
            corner = (x in (0, size - 1)) and (y in (0, size - 1))
            if corner:
                continue
            edge = x in (0, size - 1) or y in (0, size - 1)
            cells[(x, y)] = pal["rim"] if edge else pal["bg"]
    for y, row in enumerate(ICON):
        for x, ch in enumerate(row):
            if ch in pal and (ch != "S" or spark):
                cells[(x, y)] = pal[ch]
    return cells


# --------------------------------------------------------------------------- 8-bit sound

SAMPLE_RATE = 22050


def _square(phase: float, duty: float = 0.5) -> float:
    return 1.0 if phase % 1.0 < duty else -1.0


def synth_crack(intensity: float = 0.5, rate: int = SAMPLE_RATE, rng: Optional[random.Random] = None) -> List[float]:
    """Crunchy crack: sample-and-hold noise snap plus a falling square chirp, 4-bit."""
    rng = rng or random.Random(7)
    n = int(rate * 0.14)
    out, held, phase = [], 0.0, 0.0
    for i in range(n):
        t = i / rate
        if i % 3 == 0:
            held = rng.uniform(-1, 1)
        noise = held * math.exp(-t / (0.012 + 0.01 * intensity))
        freq = 2600 - 2200 * min(1.0, t / 0.05)
        phase += freq / rate
        chirp = _square(phase) * 0.4 * math.exp(-t / 0.03)
        out.append(round((noise * (0.75 + 0.25 * intensity) + chirp) * 0.7 * 8) / 8)
    return out


TIER_NOTES = ((988, 1319), (988, 1319, 1568), (1319, 1568, 2093, 2637))


def synth_blip(tier: int, rate: int = SAMPLE_RATE) -> List[float]:
    """Coin-like square arpeggio, longer and higher with the combo tier."""
    out, phase = [], 0.0
    for freq in TIER_NOTES[max(0, min(len(TIER_NOTES) - 1, tier))]:
        n = int(rate * 0.055)
        for i in range(n):
            phase += freq / rate
            out.append(_square(phase, 0.25) * 0.35 * (1 - i / n) ** 0.5)
    return out


def mix(a: List[float], b: List[float], offset: int) -> List[float]:
    out = list(a) + [0.0] * max(0, offset + len(b) - len(a))
    for i, s in enumerate(b):
        out[offset + i] += s
    return out


def wav_bytes(samples: List[float], rate: int = SAMPLE_RATE) -> bytes:
    """8-bit mono WAV (unsigned PCM), clipped to [-1, 1]."""
    import io
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(1)
        w.setframerate(rate)
        w.writeframes(bytes(int(128 + max(-1.0, min(1.0, s)) * 120) for s in samples))
    return buf.getvalue()


def build_sounds(folder: str) -> Dict[str, str]:
    """Write the sound bank once; winsound can only play files asynchronously."""
    os.makedirs(folder, exist_ok=True)
    crack = synth_crack(0.6)
    bank = {"miss": crack}
    for tier in range(len(TIER_NOTES)):
        bank["hit%d" % tier] = mix(crack, synth_blip(tier), int(SAMPLE_RATE * 0.05))
    paths = {}
    for name, samples in bank.items():
        path = os.path.join(folder, name + ".wav")
        with open(path, "wb") as f:
            f.write(wav_bytes(samples))
        paths[name] = path
    return paths


# --------------------------------------------------------------------------- effects


class Effects:
    """Sparks, embers, shock rings and floating pixel labels (screen px)."""

    def __init__(self, rng: Optional[random.Random] = None):
        self.rng = rng or random.Random()
        self.sparks: List[list] = []  # x, y, vx, vy, age, life, gravity
        self.rings: List[list] = []  # x, y, age, life, max_radius
        self.labels: List[list] = []  # text, x, y, age, life, color, scale
        self.flashes: List[list] = []  # x, y, age

    def burst(self, x: float, y: float, intensity: float, scale: float) -> None:
        r = self.rng
        self.rings.append([x, y, 0.0, 0.3, (30 + 40 * intensity) * scale])
        self.flashes.append([x, y, 0.0])
        for _ in range(10 + int(14 * intensity)):
            a = r.uniform(0, math.tau)
            v = r.uniform(150, 300 + 450 * intensity) * scale
            self.sparks.append([x, y, math.cos(a) * v, math.sin(a) * v, 0.0, r.uniform(0.25, 0.55), 900 * scale])

    def ember(self, x: float, y: float, scale: float) -> None:
        r = self.rng
        self.sparks.append([x, y, r.uniform(-40, 40) * scale, r.uniform(-120, -40) * scale,
                            0.0, r.uniform(0.2, 0.45), -60 * scale])

    def label(self, text: str, x: float, y: float, color: str, scale: int, life: float = 1.1) -> None:
        self.labels.append([text, x, y, 0.0, life, color, scale])

    def step(self, dt: float) -> None:
        for s in self.sparks:
            s[4] += dt
            s[2] *= 0.9
            s[3] = s[3] * 0.9 + s[6] * dt
            s[0] += s[2] * dt
            s[1] += s[3] * dt
        self.sparks = [s for s in self.sparks if s[4] < s[5]]
        for ring in self.rings:
            ring[2] += dt
        self.rings = [ring for ring in self.rings if ring[2] < ring[3]]
        for lab in self.labels:
            lab[3] += dt
        self.labels = [lab for lab in self.labels if lab[3] < lab[4]]
        for f in self.flashes:
            f[2] += dt
        self.flashes = [f for f in self.flashes if f[2] < 0.09]

    def clear(self) -> None:
        self.sparks.clear()
        self.rings.clear()
        self.labels.clear()
        self.flashes.clear()

    def draw(self, cells: Dict[Cell, str], cell: float, ox: float = 0.0, oy: float = 0.0) -> None:
        """Add the effects to `cells`; (ox, oy) is the screen origin of the cell grid."""
        def to_cell(x: float, y: float) -> Cell:
            return int((x - ox) // cell), int((y - oy) // cell)

        for x, y, _, _, age, life, _ in self.sparks:
            k = age / life
            cells[to_cell(x, y)] = FIRE[min(len(FIRE) - 1, int(k * len(FIRE)))]
        for x, y, age, life, max_r in self.rings:
            k = age / life
            radius = int(max_r * (1 - (1 - k) ** 3) / cell)
            color = FIRE[min(len(FIRE) - 1, int(k * 4))]
            for cx, cy in circle_cells(*to_cell(x, y), radius):
                if dither_keep(cx, cy, k):
                    cells[(cx, cy)] = color
        for x, y, age in self.flashes:
            cx, cy = to_cell(x, y)
            reach = 2 + int(age * 40)
            for d in range(-reach, reach + 1):
                cells[(cx + d, cy)] = CRACKER
                cells[(cx, cy + d)] = CRACKER
        for text, x, y, age, life, color, scale in self.labels:
            k = age / life
            glyphs, w, h = text_cells(text, scale)
            lx, ly = to_cell(x, y)
            ox_, oy_ = lx - w // 2, ly - h - 4 - int(k * 14)
            fade = max(0.0, (k - 0.55) / 0.45)
            lit = {(ox_ + gx, oy_ + gy): color for gx, gy in glyphs if dither_keep(ox_ + gx, oy_ + gy, fade)}
            add_outline(lit, OUTLINE, N8)
            cells.update(lit)


# --------------------------------------------------------------------------- Windows desktop app

HANDLE_ANGLE = -math.pi / 3  # resting handle points up-right


class Win32:
    """The few Win32 calls Fouet needs, through ctypes."""

    def __init__(self):
        import ctypes
        from ctypes import wintypes

        self.ctypes = ctypes
        self.user32 = ctypes.windll.user32
        u = self.user32
        ULONG_PTR = ctypes.c_size_t

        class MOUSEINPUT(ctypes.Structure):
            _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
                        ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]

        class KEYBDINPUT(ctypes.Structure):
            _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                        ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]

        class HARDWAREINPUT(ctypes.Structure):
            _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD), ("wParamH", wintypes.WORD)]

        class _UNION(ctypes.Union):
            _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT)]

        class INPUT(ctypes.Structure):
            _anonymous_ = ("u",)
            _fields_ = [("type", wintypes.DWORD), ("u", _UNION)]

        class CURSORINFO(ctypes.Structure):
            _fields_ = [("cbSize", wintypes.DWORD), ("flags", wintypes.DWORD),
                        ("hCursor", wintypes.HANDLE), ("ptScreenPos", wintypes.POINT)]

        self.INPUT, self.CURSORINFO, self.POINT, self.RECT = INPUT, CURSORINFO, wintypes.POINT, wintypes.RECT
        u.SendInput.argtypes = (wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int)
        u.LoadCursorW.restype = wintypes.HANDLE
        u.LoadCursorW.argtypes = (wintypes.HINSTANCE, ctypes.c_void_p)
        u.GetWindowLongW.restype = ctypes.c_long
        u.SetWindowLongW.argtypes = (wintypes.HWND, ctypes.c_int, ctypes.c_long)
        self.ibeam = u.LoadCursorW(None, ctypes.c_void_p(32513))  # IDC_IBEAM
        try:  # 1 ms timer resolution, or Tk's after() rounds frames up to 15.6 ms
            ctypes.windll.winmm.timeBeginPeriod(1)
        except Exception:
            pass

    @staticmethod
    def set_dpi_aware() -> None:
        import ctypes
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            try:
                ctypes.windll.user32.SetProcessDPIAware()
            except Exception:
                pass

    def dpi_scale(self) -> float:
        try:
            return max(1.0, self.user32.GetDpiForSystem() / 96)
        except Exception:
            return 1.0

    def virtual_screen(self) -> Tuple[int, int, int, int]:
        m = self.user32.GetSystemMetrics
        return m(76), m(77), m(78), m(79)

    def work_area(self) -> Tuple[int, int, int, int]:
        r = self.RECT()
        self.user32.SystemParametersInfoW(0x30, 0, self.ctypes.byref(r), 0)
        return r.left, r.top, r.right, r.bottom

    def cursor(self) -> Tuple[int, int]:
        p = self.POINT()
        self.user32.GetCursorPos(self.ctypes.byref(p))
        return p.x, p.y

    def set_cursor(self, x: int, y: int) -> None:
        self.user32.SetCursorPos(int(x), int(y))

    def cursor_is_ibeam(self) -> bool:
        info = self.CURSORINFO()
        info.cbSize = self.ctypes.sizeof(self.CURSORINFO)
        return bool(self.user32.GetCursorInfo(self.ctypes.byref(info))) and info.hCursor == self.ibeam

    def key_down(self, vk: int) -> bool:
        return bool(self.user32.GetAsyncKeyState(vk) & 0x8000)

    def _send(self, inputs) -> None:
        arr = (self.INPUT * len(inputs))(*inputs)
        self.user32.SendInput(len(inputs), arr, self.ctypes.sizeof(self.INPUT))

    def click(self) -> None:
        down, up = self.INPUT(type=0), self.INPUT(type=0)
        down.mi.dwFlags, up.mi.dwFlags = 0x0002, 0x0004  # LEFTDOWN, LEFTUP
        self._send([down, up])

    def press(self, vk: int) -> None:
        down, up = self.INPUT(type=1), self.INPUT(type=1)
        down.ki.wVk = up.ki.wVk = vk
        up.ki.dwFlags = 0x0002  # KEYUP
        self._send([down, up])

    def type_text(self, text: str) -> None:
        inputs = []
        for unit in struct.unpack("<%dH" % (len(text.encode("utf-16-le")) // 2), text.encode("utf-16-le")):
            for flags in (0x0004, 0x0004 | 0x0002):  # UNICODE, UNICODE|KEYUP
                ev = self.INPUT(type=1)
                ev.ki.wScan, ev.ki.dwFlags = unit, flags
                inputs.append(ev)
        self._send(inputs)

    def make_overlay(self, hwnd: int) -> None:
        """Click-through, never focused, hidden from the taskbar."""
        ex = self.user32.GetWindowLongW(hwnd, -20)
        self.user32.SetWindowLongW(hwnd, -20, ex | 0x80000 | 0x20 | 0x80 | 0x08000000)

    def make_tool(self, hwnd: int) -> None:
        """Clickable but never steals focus from the app you are typing in."""
        ex = self.user32.GetWindowLongW(hwnd, -20)
        self.user32.SetWindowLongW(hwnd, -20, ex | 0x80 | 0x08000000)


class App:
    VK_CONTROL, VK_MENU, VK_W, VK_ESCAPE, VK_END = 0x11, 0x12, 0x57, 0x1B, 0x23

    def __init__(self, sound: bool = True, anywhere: bool = False, sensitivity: float = 1.0,
                 cell: Optional[int] = None, typing: bool = True):
        import tkinter as tk

        Win32.set_dpi_aware()
        self.win = Win32()
        self.tk = tk
        self.scale = self.win.dpi_scale()
        self.cell = cell or max(3, round(4 * self.scale))
        self.anywhere = anywhere
        self.typing = typing
        self.min_speed = 1100 * self.scale / max(0.2, sensitivity)

        self.sounds: Dict[str, str] = {}
        if sound:
            try:
                import winsound
                self.winsound = winsound
                self.sounds = build_sounds(os.path.join(tempfile.gettempdir(), "fouet-sounds-" + __version__))
            except Exception:
                self.sounds = {}

        self.active = False
        self.hits = 0
        self.combo = Combo()
        self.picker = PhrasePicker()
        self.effects = Effects()
        self.detector = FlickDetector(min_speed=self.min_speed)
        self.snap = LashSnap()
        self.velocity = VelocityTracker()
        self.angle = HANDLE_ANGLE
        self.mouse = self.win.cursor()
        self.vel = (0.0, 0.0)
        self.last = time.perf_counter()
        self.next_frame = self.last
        self.prev_hotkey = False
        self.button_state = None
        s = self.scale
        self.handle_length = 44 * s
        self.whip = Whip(*self.mouse, segment_length=13 * s, gravity=1500 * s)

        # Toggle button: the root window, bottom-right of the primary work area.
        self.root = tk.Tk()
        self.root.title("Fouet")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.configure(bg=TRANSPARENT)
        self.root.attributes("-transparentcolor", TRANSPARENT)
        self.bcell = max(3, round(4 * s))
        size = 16 * self.bcell
        left, top, right, bottom = self.win.work_area()
        margin = int(16 * s)
        self.root.geometry("%dx%d+%d+%d" % (size, size, right - size - margin, bottom - size - margin))
        self.button = tk.Canvas(self.root, width=size, height=size, bg=TRANSPARENT,
                                highlightthickness=0, cursor="hand2")
        self.button.pack()
        self.button.bind("<Button-1>", lambda e: self.toggle())
        self.button.bind("<Button-3>", self.menu)
        self.popup = tk.Menu(self.root, tearoff=0)
        self.popup.add_command(label="Fouet on/off   Ctrl+Alt+W", command=self.toggle)
        self.autostart = tk.BooleanVar(value=get_autostart())
        self.popup.add_checkbutton(label="Start with Windows", variable=self.autostart,
                                   command=lambda: set_autostart(self.autostart.get()))
        self.popup.add_separator()
        self.popup.add_command(label="Quit Fouet", command=self.quit)

        # Full virtual-screen overlay, click-through.
        self.vx, self.vy, vw, vh = self.win.virtual_screen()
        self.overlay = tk.Toplevel(self.root)
        self.overlay.overrideredirect(True)
        self.overlay.attributes("-topmost", True)
        self.overlay.configure(bg=TRANSPARENT)
        self.overlay.attributes("-transparentcolor", TRANSPARENT)
        self.overlay.geometry("%dx%d+%d+%d" % (vw, vh, self.vx, self.vy))
        self.canvas = tk.Canvas(self.overlay, width=vw, height=vh, bg=TRANSPARENT, highlightthickness=0)
        self.canvas.pack()
        self.root.update_idletasks()
        self.win.make_overlay(self._hwnd(self.overlay))
        self.win.make_tool(self._hwnd(self.root))
        self.overlay.withdraw()
        self.draw_button(0.0)

    @staticmethod
    def _hwnd(window) -> int:
        return int(window.wm_frame(), 16)

    # -- lifecycle
    def run(self) -> None:
        self.root.after(16, self.frame)
        self.root.mainloop()

    def quit(self) -> None:
        self.root.destroy()

    def menu(self, event) -> None:
        self.autostart.set(get_autostart())  # the installer may have changed it
        self.popup.tk_popup(event.x_root, event.y_root)

    def toggle(self) -> None:
        self.set_active(not self.active)

    def set_active(self, on: bool) -> None:
        if on == self.active:
            return
        self.active = on
        if on:
            self.mouse = self.win.cursor()
            self.angle = HANDLE_ANGLE
            hx, hy = self.hilt()
            self.whip.reset(hx, hy)
            self.detector.reset()
            self.velocity.reset()
            self.overlay.deiconify()
            self.overlay.attributes("-topmost", True)
            self.root.lift()
        else:
            self.effects.clear()
            self.canvas.delete("all")
            self.overlay.withdraw()
        self.draw_button(time.perf_counter())

    # -- loop
    def frame(self) -> None:
        start = time.perf_counter()
        dt = min(0.05, start - self.last)
        self.last = start
        self.poll_keys()
        if self.active:
            self.step(dt, start)
        self.draw_button(start)
        self.root.update_idletasks()  # redraw now, so the frame budget below includes it
        period = 1 / 60 if self.active else 0.04
        self.next_frame = max(self.next_frame, start - period) + period
        self.root.after(max(1, int((self.next_frame - time.perf_counter()) * 1000)), self.frame)

    def poll_keys(self) -> None:
        k = self.win.key_down
        hotkey = k(self.VK_CONTROL) and k(self.VK_MENU) and k(self.VK_W)
        if hotkey and not self.prev_hotkey:
            self.toggle()
        self.prev_hotkey = hotkey
        if self.active and k(self.VK_ESCAPE):
            self.set_active(False)

    def hilt(self) -> Tuple[float, float]:
        mx, my = self.mouse
        return mx + math.cos(self.angle) * self.handle_length, my + math.sin(self.angle) * self.handle_length

    def step(self, dt: float, now: float) -> None:
        x, y = self.win.cursor()
        self.vel = self.velocity.update(x, y, now)
        self.mouse = (x, y)
        lean = max(-0.9, min(0.9, self.vel[0] * 0.0006 / self.scale))
        self.angle += (HANDLE_ANGLE + lean - self.angle) * min(1.0, dt * 14)

        hilt = self.hilt()
        tip_speed = self.whip.update(hilt[0], hilt[1], dt)
        flick = self.detector.update(self.vel[0], self.vel[1], now)
        if flick:
            self.snap.start(flick, now)
        done = self.snap.update(self.whip, now)
        if done:
            self.crack(done, now)
        if tip_speed > self.min_speed * 1.5:
            self.effects.ember(*self.whip.tip, self.scale)
        self.effects.step(dt)
        self.render(hilt)

    def crack(self, flick: Flick, now: float) -> None:
        tx, ty = self.whip.tip
        intensity = crack_intensity(flick.speed, self.min_speed)
        self.effects.burst(tx, ty, intensity, self.scale)
        tier = tier_for_combo(self.combo.count + 1) if now - self.combo.last_hit <= self.combo.window else 0
        phrase = self.picker.pick(tier)
        if self.typing and self.type_at(int(tx), int(ty), phrase):
            tier = tier_for_combo(self.combo.hit(now))
            self.hits += 1
            self.effects.label(phrase, tx, ty, TIER_COLORS[tier], 2 if tier == 2 else 1)
            self.play("hit%d" % tier)
        else:
            self.effects.label("CLAC!", tx, ty, MISS_COLOR, 1, life=0.45)
            self.play("miss")

    def type_at(self, x: int, y: int, phrase: str) -> bool:
        """Click the text zone under the tip and type there; False if it is not text."""
        home = self.win.cursor()
        self.win.set_cursor(x, y)
        if not self.anywhere:
            time.sleep(0.03)  # let the app under the tip set its cursor
            if not self.win.cursor_is_ibeam():
                self.win.set_cursor(*home)
                return False
        self.win.click()
        time.sleep(0.015)
        self.win.press(self.VK_END)
        self.win.type_text(" " + phrase)
        self.win.set_cursor(*home)
        self.mouse = home
        self.detector.reset()
        self.velocity.reset()
        return True

    def play(self, name: str) -> None:
        path = self.sounds.get(name)
        if path:
            w = self.winsound
            w.PlaySound(path, w.SND_FILENAME | w.SND_ASYNC | w.SND_NODEFAULT)

    # -- drawing
    def render(self, hilt: Tuple[float, float]) -> None:
        cell = self.cell
        ox, oy = self.vx, self.vy
        pts = [(p[0] - ox, p[1] - oy) for p in self.whip.points]
        cells = whip_sprite(pts, (self.mouse[0] - ox, self.mouse[1] - oy), (hilt[0] - ox, hilt[1] - oy), cell)
        self.effects.draw(cells, cell, ox, oy)
        c = self.canvas
        c.delete("all")
        for y, x0, x1, color in color_runs(cells):
            c.create_rectangle(x0 * cell, y * cell, (x1 + 1) * cell, (y + 1) * cell, fill=color, width=0)

    def draw_button(self, now: float) -> None:
        spark = not self.active or int(now * 8) % 2 == 0
        state = (self.active, spark, self.hits)
        if state == self.button_state:
            return
        self.button_state = state
        cells = icon_cells(self.active, spark)
        if self.hits:
            digits, w, h = text_cells(str(min(self.hits, 99)))
            badge = {(15 - w + gx, 15 - h + gy): "#fff4dc" for gx, gy in digits}
            add_outline(badge, OUTLINE)
            cells.update(badge)
        b, c = self.bcell, self.button
        c.delete("all")
        for y, x0, x1, color in color_runs(cells):
            if 0 <= y < 16:
                c.create_rectangle(max(0, x0) * b, y * b, (min(15, x1) + 1) * b, (y + 1) * b, fill=color, width=0)


# --------------------------------------------------------------------------- entry point


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="fouet", description="A pixel-art whip for your desktop. "
                                "Flick, then stop dead: the lash cracks and types into the text zone under its tip.")
    p.add_argument("--no-sound", action="store_true", help="mute the 8-bit crack")
    p.add_argument("--anywhere", action="store_true",
                   help="type wherever the tip cracks, even if the zone does not show a text cursor")
    p.add_argument("--sensitivity", type=float, default=1.0,
                   help="above 1 = cracks with slower flicks, below 1 = needs faster flicks (default 1)")
    p.add_argument("--pixel", type=int, default=None, help="size of one pixel-art pixel in screen pixels")
    p.add_argument("--version", action="version", version="fouet " + __version__)
    return p.parse_args(argv)


RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
APP_NAME = "Fouet"


def launch_command() -> str:
    """Command line that starts this copy of Fouet without a console."""
    if getattr(sys, "frozen", False):  # PyInstaller exe
        return '"%s"' % sys.executable
    pythonw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    return '"%s" "%s"' % (pythonw if os.path.exists(pythonw) else sys.executable, os.path.abspath(__file__))


def get_autostart(key_path: str = RUN_KEY) -> bool:
    """True if Fouet starts with Windows (per-user Run key, shared with the installer)."""
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path) as key:
            winreg.QueryValueEx(key, APP_NAME)
            return True
    except OSError:
        return False


def set_autostart(on: bool, key_path: str = RUN_KEY) -> None:
    import winreg
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
        if on:
            winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, launch_command())
        else:
            try:
                winreg.DeleteValue(key, APP_NAME)
            except FileNotFoundError:
                pass


def message_box(text: str, error: bool = False) -> None:
    import ctypes
    ctypes.windll.user32.MessageBoxW(None, text, APP_NAME, 0x10 if error else 0x40)


def main(argv=None) -> int:
    if sys.stdout is None:  # windowed exe: there is no console to print to
        sys.stdout = sys.stderr = open(os.devnull, "w")
    args = parse_args(argv)
    if sys.platform != "win32":
        print("Fouet desktop runs on Windows. Try the browser version: "
              "https://matrac73.github.io/daily-builds/projects/2026-11-03-fouet/")
        return 1
    import ctypes
    mutex = ctypes.windll.kernel32.CreateMutexW(None, False, "Local\\FouetPixelWhip")
    if ctypes.windll.kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
        message_box("Fouet is already running: look for the pixel button in the bottom-right corner.")
        return 0
    print("Fouet %s - click the pixel button bottom-right or press Ctrl+Alt+W.\n"
          "Flick, then stop dead: crack on a text zone to motivate it. Esc puts the whip away,\n"
          "right-click the button for options and to quit." % __version__)
    try:
        App(sound=not args.no_sound, anywhere=args.anywhere, sensitivity=args.sensitivity, cell=args.pixel).run()
    except KeyboardInterrupt:
        pass
    except Exception:
        import traceback
        log = os.path.join(tempfile.gettempdir(), "fouet-error.log")
        with open(log, "w", encoding="utf-8") as f:
            traceback.print_exc(file=f)
        message_box("Fouet crashed, sorry. Details: %s" % log, error=True)
        return 1
    finally:
        ctypes.windll.kernel32.CloseHandle(mutex)
    return 0


if __name__ == "__main__":
    sys.exit(main())
