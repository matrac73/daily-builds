"""Render the 16x16 pixel button icon of fouet.py into a multi-size .ico (needs Pillow)."""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import fouet  # noqa: E402


def icon_image(on: bool = True) -> Image.Image:
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for (x, y), color in fouet.icon_cells(on).items():
        img.putpixel((x, y), tuple(int(color[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
    return img


def main(out: str) -> None:
    base = icon_image(on=True)
    sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = [base.resize((s, s), Image.NEAREST) for s in sizes]  # nearest: keep it pixel-sharp
    frames[-1].save(out, format="ICO", sizes=[(s, s) for s in sizes], append_images=frames[:-1])
    frames[-1].save(str(Path(out).with_suffix(".png")))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "packaging" / "fouet.ico"))
