import io
import math
import random
import sys
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import fouet  # noqa: E402

FPS = 60
DT = 1 / FPS


def simulate(path, seconds):
    """Drive whip + crack rule along `path(t) -> (x, y)`; returns crack events."""
    whip = fouet.Whip(*path(0))
    detector = fouet.FlickDetector()
    snap = fouet.LashSnap()
    cracks, prev = [], path(0)
    for frame in range(1, int(seconds * FPS) + 1):
        t = frame * DT
        x, y = path(t)
        vx, vy = (x - prev[0]) / DT, (y - prev[1]) / DT
        prev = (x, y)
        whip.update(x, y, DT)
        flick = detector.update(vx, vy, t)
        if flick:
            snap.start(flick, t)
        done = snap.update(whip, t)
        if done:
            cracks.append({"t": t, "hand": (x, y), "tip": whip.tip, "flick": done})
    return cracks


def flick_then(after, speed=2200.0, start=0.5, duration=0.22):
    """Hand rests, moves right at `speed`, then does `after` ('stop' or 'back')."""
    def path(t):
        if t < start:
            return (300.0, 300.0)
        if t < start + duration:
            return (300.0 + speed * (t - start), 300.0)
        end = 300.0 + speed * duration
        if after == "back":
            back = min(t - start - duration, 0.08)
            return (end - 900.0 * back, 300.0)
        return (end, 300.0)
    return path


# ------------------------------------------------------------------ crack rule

def test_speeding_up_alone_never_cracks():
    det = fouet.FlickDetector(min_speed=1000)
    assert all(det.update(v, 0, i * DT) is None for i, v in enumerate(range(0, 4000, 200)))


def test_steady_fast_motion_never_cracks():
    det = fouet.FlickDetector(min_speed=1000)
    assert all(det.update(2500, 0, i * DT) is None for i in range(60))


def test_stopping_dead_after_a_fast_move_cracks():
    det = fouet.FlickDetector(min_speed=1000)
    for i in range(10):
        assert det.update(2000, 0, i * DT) is None
    flick = det.update(0, 0, 10 * DT)
    assert flick is not None
    assert flick.speed == 2000 and (flick.dx, flick.dy) == (1, 0)


def test_pulling_back_cracks_even_without_stopping():
    det = fouet.FlickDetector(min_speed=1000)
    for i in range(10):
        det.update(0, -1800, i * DT)
    assert det.update(0, 600, 10 * DT) is not None


def test_slow_deceleration_does_not_crack():
    det = fouet.FlickDetector(min_speed=1000, window=0.2)
    speeds = [2000 - i * 40 for i in range(50)]  # brakes over ~0.8 s
    assert all(det.update(v, 0, i * DT) is None for i, v in enumerate(speeds))


def test_slow_moves_never_crack():
    det = fouet.FlickDetector(min_speed=1000)
    for i in range(10):
        det.update(700, 0, i * DT)
    assert det.update(0, 0, 10 * DT) is None


def test_cooldown_gives_one_crack_per_flick():
    det = fouet.FlickDetector(min_speed=1000, cooldown=0.2)
    for i in range(5):
        det.update(2000, 0, i * DT)
    assert det.update(0, 0, 5 * DT) is not None
    det.update(2500, 0, 6 * DT)
    assert det.update(0, 0, 7 * DT) is None


def test_smoothed_velocity_tail_does_not_crack_twice():
    det = fouet.FlickDetector(min_speed=1000, cooldown=0.22, window=0.2)
    v = 3750.0
    for i in range(6):
        det.update(v, 0, i * DT)
    cracks = 0
    for i in range(6, 60):
        v *= 0.3
        cracks += det.update(v, 0, i * DT) is not None
    assert cracks == 1


def test_snap_straightens_the_lash_along_the_swing_then_cracks():
    whip = fouet.Whip(0, 0)  # hanging straight down
    snap = fouet.LashSnap(max_delay=10)
    snap.start(fouet.Flick(2000, 1, 0), 0.0)  # thrown to the right
    fired, frames = None, 0
    while fired is None and frames < 60:
        frames += 1
        whip.update(0, 0, DT)
        fired = snap.update(whip, frames * DT)
    assert fired is not None and not snap.pending
    assert whip.reach(1, 0) >= 0.85 * whip.length
    assert frames <= 10


def test_snap_times_out():
    whip = fouet.Whip(0, 0)
    snap = fouet.LashSnap(pull=0.0, max_delay=0.1)
    snap.start(fouet.Flick(2000, 1, 0), 0.0)
    fired = [snap.update(whip, i * DT) for i in range(1, 10)]
    assert any(fired)


def test_idle_snap_does_nothing():
    whip = fouet.Whip(0, 0)
    before = [p[:] for p in whip.points]
    assert fouet.LashSnap().update(whip, 1.0) is None
    assert whip.points == before


def test_crack_intensity_is_clamped():
    assert fouet.crack_intensity(500, 1000) == 0
    assert 0 < fouet.crack_intensity(2000, 1000) < 1
    assert fouet.crack_intensity(99999, 1000) == 1


# ------------------------------------------------------------------ end to end

def test_flick_and_stop_cracks_once_after_the_stop_ahead_of_the_hand():
    stop_at = 0.5 + 0.22
    cracks = simulate(flick_then("stop"), 1.6)
    assert len(cracks) == 1
    crack = cracks[0]
    assert stop_at <= crack["t"] <= stop_at + 0.25
    assert crack["tip"][0] > crack["hand"][0] + 60  # lash thrown forward, past the hand


def test_the_crack_lands_where_you_aim_in_every_direction():
    for angle in range(0, 360, 45):
        dx, dy = math.cos(math.radians(angle)), math.sin(math.radians(angle))
        for speed in (1300, 2200, 3700):
            def path(t, dx=dx, dy=dy, speed=speed):
                k = min(max(t - 0.5, 0.0), 300 / speed)  # 300 px swing, then stop dead
                return (600 + dx * speed * k, 500 + dy * speed * k)
            cracks = simulate(path, 1.5)
            assert len(cracks) == 1, (angle, speed)
            (hx, hy), (tx, ty) = cracks[0]["hand"], cracks[0]["tip"]
            off = math.degrees(math.atan2((ty - hy) * dx - (tx - hx) * dy, (tx - hx) * dx + (ty - hy) * dy))
            assert abs(off) < 25, (angle, speed, off)
            assert math.hypot(tx - hx, ty - hy) > 180, (angle, speed)


def test_flick_and_pull_back_cracks():
    cracks = simulate(flick_then("back"), 1.6)
    assert len(cracks) == 1 and cracks[0]["t"] >= 0.72


def test_stuttering_mouse_cracks_once_at_the_real_stop():
    # The mouse only reports every other frame (and drops some): with the time-
    # window velocity, the empty frames mid-swing must not read as a stop.
    velocity, detector = fouet.VelocityTracker(), fouet.FlickDetector()
    fires = []
    for frame in range(90):
        t = frame * DT
        k = min(max(t - 0.5, 0.0), 0.12)
        x = 600 - 3000 * k
        if 30 < frame < 40 and frame % 2:  # stale position on odd frames mid-swing
            x = 600 - 3000 * min(max((frame - 1) * DT - 0.5, 0.0), 0.12)
        vx, vy = velocity.update(x, 500.0, t)
        if detector.update(vx, vy, t):
            fires.append(t)
    assert len(fires) == 1 and fires[0] >= 0.62


def test_velocity_tracker_measures_over_its_span():
    v = fouet.VelocityTracker(span=0.035)
    for i in range(10):
        vx, vy = v.update(i * 20.0, 0.0, i * DT)
    assert abs(vx - 1200) < 1 and vy == 0
    v.reset()
    assert v.update(5, 5, 1.0) == (0.0, 0.0)


def test_whip_at_rest_never_cracks():
    assert simulate(lambda t: (400.0, 200.0), 2.0) == []


# ------------------------------------------------------------------ physics

def test_whip_hangs_straight_and_keeps_its_length():
    whip = fouet.Whip(100, 100)
    for _ in range(240):
        whip.update(100, 100, DT)
    tip_x, tip_y = whip.tip
    assert abs(tip_x - 100) < 1
    assert abs((tip_y - 100) - whip.length) < whip.length * 0.03


def test_bend_limit_keeps_the_lash_from_folding():
    whip = fouet.Whip(300, 300)
    rng = random.Random(3)
    worst = 0.0
    x, y = 300.0, 300.0
    for i in range(400):
        x += rng.uniform(-60, 60)
        y += rng.uniform(-60, 60)
        whip.update(x, y, DT)
        angles = whip.joint_angles()
        worst = max(worst, max(a - whip.max_bend[j + 1] for j, a in enumerate(angles)))
    assert worst < 0.5  # the root-to-tip projection is exact


def test_root_is_stiffer_than_tip():
    whip = fouet.Whip(0, 0)
    assert whip.max_bend[1] < whip.max_bend[whip.segments // 2] < whip.max_bend[-2]


def test_segments_stay_close_to_rest_length():
    whip = fouet.Whip(0, 0)
    for i in range(120):
        whip.update(math.cos(i / 5) * 200, math.sin(i / 3) * 120, DT)
    pts = whip.points
    for a, b in zip(pts, pts[1:]):
        assert abs(math.hypot(b[0] - a[0], b[1] - a[1]) - whip.segment_length) < whip.segment_length * 0.2


def test_stalled_frame_is_capped():
    whip = fouet.Whip(0, 0)
    whip.update(50, 0, 5.0)  # a 5 s hiccup must not explode
    assert all(math.isfinite(v) for p in whip.points for v in p)


# ------------------------------------------------------------------ pixel art

def test_raster_line_is_continuous_and_inclusive():
    cells = fouet.raster_line(0, 0, 7, 3)
    assert cells[0] == (0, 0) and cells[-1] == (7, 3)
    for (ax, ay), (bx, by) in zip(cells, cells[1:]):
        assert max(abs(bx - ax), abs(by - ay)) == 1


def test_circle_cells_are_on_the_radius():
    for x, y in fouet.circle_cells(10, 10, 6):
        assert abs(math.hypot(x - 10, y - 10) - 6) < 1


def test_whip_sprite_has_outline_and_cracker():
    whip = fouet.Whip(100, 100)
    cells = fouet.whip_sprite(whip.points, (80, 140), (100, 100), 4)
    colors = set(cells.values())
    assert fouet.OUTLINE in colors and fouet.CRACKER in colors and fouet.HANDLE in colors
    for (x, y), c in cells.items():  # every non-outline cell is enclosed by sprite cells
        if c != fouet.OUTLINE:
            assert all((x + dx, y + dy) in cells for dx, dy in fouet.N4)


def test_color_runs_cover_every_cell_once():
    cells = {(0, 0): "a", (1, 0): "a", (2, 0): "b", (5, 0): "b", (0, 1): "a"}
    runs = fouet.color_runs(cells)
    covered = {(x, y): c for y, x0, x1, c in runs for x in range(x0, x1 + 1)}
    assert covered == cells and len(runs) == 4


def test_font_glyphs_are_5x7_and_text_metrics():
    for ch, rows in fouet.FONT.items():
        assert len(rows) == 7 and all(len(r) == 5 for r in rows), ch
    cells, w, h = fouet.text_cells("Do it!", 2)
    assert (w, h) == ((6 * 6 - 1) * 2, 14)
    assert all(0 <= x < w and 0 <= y < h for x, y in cells)


def test_every_phrase_is_drawable():
    for tier in fouet.PHRASES:
        for phrase in tier:
            assert all(ch in fouet.FONT for ch in phrase.upper()), phrase


def test_dither_dissolves_progressively():
    alive = [sum(fouet.dither_keep(x, y, f) for x in range(4) for y in range(4)) for f in (0, 0.5, 1)]
    assert alive == [16, 8, 0]


def test_icon_is_16x16_and_differs_when_on():
    off, on = fouet.icon_cells(False), fouet.icon_cells(True)
    assert all(0 <= x < 16 and 0 <= y < 16 for x, y in off)
    assert off != on


# ------------------------------------------------------------------ phrases & sound

def test_tiers_escalate_every_three_hits():
    assert [fouet.tier_for_combo(c) for c in range(0, 10)] == [0, 0, 0, 0, 1, 1, 1, 2, 2, 2]


def test_picker_never_repeats():
    picker = fouet.PhrasePicker(rng=random.Random(1))
    picks = [picker.pick(0) for _ in range(50)]
    assert all(a != b for a, b in zip(picks, picks[1:]))


def test_combo_resets_after_the_window():
    combo = fouet.Combo(window=1.0)
    assert [combo.hit(t) for t in (0, 0.5, 1.2, 3.0)] == [1, 2, 3, 1]


def test_sounds_are_valid_8bit_wavs(tmp_path):
    paths = fouet.build_sounds(str(tmp_path))
    assert set(paths) == {"miss", "hit0", "hit1", "hit2"}
    for path in paths.values():
        with wave.open(path) as w:
            assert (w.getsampwidth(), w.getnchannels(), w.getframerate()) == (1, 1, fouet.SAMPLE_RATE)
            assert w.getnframes() > 1000


def test_wav_bytes_clips():
    with wave.open(io.BytesIO(fouet.wav_bytes([-5, 0, 5]))) as w:
        assert list(w.readframes(3)) == [8, 128, 248]


def test_cli_parses_options():
    args = fouet.parse_args(["--no-sound", "--sensitivity", "1.5", "--anywhere"])
    assert args.no_sound and args.anywhere and args.sensitivity == 1.5
