import pytest

from radius_preview.geometry import (
    Length,
    Radii,
    contains,
    parse_corner,
    rasterize,
    to_half_blocks,
)


def px(value):
    return Length(value, "px")


class TestLength:
    @pytest.mark.parametrize(
        "text, expected",
        [
            ("40", Length(40, "px")),
            ("40px", Length(40, "px")),
            ("25%", Length(25, "%")),
            (" 12.5PX ", Length(12.5, "px")),
            (".5%", Length(0.5, "%")),
        ],
    )
    def test_parse(self, text, expected):
        assert Length.parse(text) == expected

    @pytest.mark.parametrize("text", ["", "abc", "-5", "10em", "1 0", "5px%"])
    def test_parse_rejects_invalid(self, text):
        with pytest.raises(ValueError):
            Length.parse(text)

    def test_zero_is_unitless_and_canonical(self):
        assert Length.parse("0%") == Length.parse("0px")
        assert str(Length.parse("0%")) == "0"

    def test_str_drops_trailing_zeros(self):
        assert str(Length(40.0, "px")) == "40px"
        assert str(Length(12.5, "%")) == "12.5%"

    def test_resolve(self):
        assert Length(25, "%").resolve(200) == 50
        assert Length(25, "px").resolve(200) == 25


class TestShorthand:
    @pytest.mark.parametrize(
        "text, expected",
        [
            ("10", [10, 10, 10, 10]),
            ("10 20", [10, 20, 10, 20]),
            ("10 20 30", [10, 20, 30, 20]),
            ("10 20 30 40", [10, 20, 30, 40]),
        ],
    )
    def test_expansion_follows_css_rules(self, text, expected):
        radii = Radii.parse(text)
        assert [length.value for length in radii.horizontal] == expected
        assert radii.vertical == radii.horizontal

    def test_slash_separates_vertical_radii(self):
        radii = Radii.parse("10 20 / 30% 40%")
        assert radii.corner("tl") == (px(10), Length(30, "%"))
        assert radii.corner("tr") == (px(20), Length(40, "%"))
        assert radii.corner("br") == (px(10), Length(30, "%"))
        assert radii.corner("bl") == (px(20), Length(40, "%"))

    def test_accepts_a_full_declaration(self):
        assert Radii.parse("border-radius: 10px 20px;") == Radii.parse("10 20")

    @pytest.mark.parametrize("text", ["", "1 2 3 4 5", "1 / 2 / 3", "10 /", "/ 10"])
    def test_parse_rejects_invalid(self, text):
        with pytest.raises(ValueError):
            Radii.parse(text)

    @pytest.mark.parametrize(
        "text, css",
        [
            ("10 10 10 10", "border-radius: 10px;"),
            ("10 20 10 20", "border-radius: 10px 20px;"),
            ("10 20 30 20", "border-radius: 10px 20px 30px;"),
            ("10 20 30 40", "border-radius: 10px 20px 30px 40px;"),
            ("10 20 10 30", "border-radius: 10px 20px 10px 30px;"),
            ("10 / 10", "border-radius: 10px;"),
            ("0 50%", "border-radius: 0 50%;"),
            (
                "30% 70% 70% 30% / 30% 30% 70% 70%",
                "border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%;",
            ),
            ("10 10 / 20 40 20 40", "border-radius: 10px / 20px 40px;"),
        ],
    )
    def test_css_uses_shortest_form(self, text, css):
        assert Radii.parse(text).to_css() == css

    @pytest.mark.parametrize(
        "text", ["10", "1 2", "1 2 3", "1 2 3 4", "5% 10 / 20 30% 40", "0 0 0 7"]
    )
    def test_css_round_trips(self, text):
        radii = Radii.parse(text)
        assert Radii.parse(radii.to_css()) == radii


class TestCorners:
    def test_parse_corner(self):
        assert parse_corner("40") == (px(40), px(40))
        assert parse_corner("80/30%") == (px(80), Length(30, "%"))
        with pytest.raises(ValueError):
            parse_corner("1/2/3")

    def test_with_corner_changes_only_that_corner(self):
        radii = Radii.uniform(px(10)).with_corner("br", px(50), px(20))
        assert radii.to_css() == "border-radius: 10px 10px 50px / 10px 10px 20px;"

    def test_with_corner_defaults_to_circular(self):
        radii = Radii.parse("10 / 20").with_corner("tl", px(5))
        assert radii.corner("tl") == (px(5), px(5))

    def test_unknown_corner(self):
        with pytest.raises(ValueError, match="unknown corner"):
            Radii.uniform(px(1)).with_corner("xx", px(1))


class TestResolve:
    def test_percentages_use_their_own_axis(self):
        resolved = Radii.parse("10%").resolve(300, 100)
        assert resolved.corners == ((30, 10),) * 4
        assert not resolved.was_scaled

    def test_overlapping_radii_are_scaled_proportionally(self):
        # 150 + 150 > 200: everything shrinks by 200/300.
        resolved = Radii.parse("150 150 30 30").resolve(200, 200)
        assert resolved.scale == pytest.approx(2 / 3)
        assert resolved.corners[0] == pytest.approx((100, 100))
        assert resolved.corners[2] == pytest.approx((20, 20))

    def test_huge_radius_makes_a_pill(self):
        resolved = Radii.parse("9999").resolve(300, 100)
        for corner in resolved.corners:
            assert corner == pytest.approx((50, 50))

    def test_fifty_percent_is_not_scaled(self):
        assert Radii.parse("50%").resolve(120, 80).scale == 1


class TestContains:
    def test_square_box_includes_its_corners(self):
        resolved = Radii.parse("0").resolve(100, 100)
        assert contains(0.5, 0.5, 100, 100, resolved)
        assert not contains(-1, 50, 100, 100, resolved)
        assert not contains(50, 101, 100, 100, resolved)

    def test_circle(self):
        resolved = Radii.parse("50%").resolve(100, 100)
        assert contains(50, 50, 100, 100, resolved)
        assert contains(50, 1, 100, 100, resolved)
        for x, y in [(5, 5), (95, 5), (95, 95), (5, 95)]:
            assert not contains(x, y, 100, 100, resolved)

    def test_only_the_rounded_corner_is_cut(self):
        resolved = Radii.parse("0 0 60 0").resolve(100, 100)
        assert contains(2, 2, 100, 100, resolved)
        assert contains(98, 2, 100, 100, resolved)
        assert contains(2, 98, 100, 100, resolved)
        assert not contains(98, 98, 100, 100, resolved)

    def test_elliptical_corner(self):
        # Top-left ellipse: 80 wide, 20 tall.
        resolved = Radii.parse("80 0 0 0 / 20 0 0 0").resolve(100, 100)
        assert not contains(10, 5, 100, 100, resolved)
        assert contains(10, 15, 100, 100, resolved)
        assert contains(70, 2, 100, 100, resolved)


class TestRasterize:
    def test_grid_keeps_aspect_ratio_with_even_rows(self):
        mask = rasterize(Radii.parse("0"), 300, 100, 30)
        assert (len(mask), len(mask[0])) == (10, 30)
        assert len(rasterize(Radii.parse("0"), 100, 30, 10)) == 4  # 3 -> 4

    def test_square_fills_the_grid(self):
        assert all(all(row) for row in rasterize(Radii.parse("0"), 100, 100, 8))

    def test_circle_is_symmetric(self):
        mask = rasterize(Radii.parse("50%"), 100, 100, 20)
        assert mask == mask[::-1]
        assert mask == [row[::-1] for row in mask]
        assert not mask[0][0] and mask[10][10]

    @pytest.mark.parametrize("args", [(100, 100, 1), (0, 100, 10), (100, -1, 10)])
    def test_rejects_bad_dimensions(self, args):
        with pytest.raises(ValueError):
            rasterize(Radii.parse("0"), *args)

    def test_half_blocks(self):
        mask = [
            [True, True, False, False],
            [True, False, True, False],
        ]
        assert to_half_blocks(mask) == ["█▀▄ "]

    def test_rendered_circle(self):
        lines = to_half_blocks(rasterize(Radii.parse("50%"), 100, 100, 8))
        assert lines == [
            " ▄████▄ ",
            "████████",
            "████████",
            " ▀████▀ ",
        ]
