#!/usr/bin/env python3
"""Turn the source splatter logo into the themeable assets the app ships.

The artwork arrives as an opaque PNG: black splatter "27" on white. The web app
needs it as a transparent white mark so CSS can tint it per theme, plus a square
crop for the favicon and a social card.

Only needed to regenerate assets — the outputs are committed.

    pip install pillow && python3 scripts/make-logo.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SOURCE = PUBLIC / "logo-27-original.png"

NAVY = (7, 11, 20, 255)      # --bg of the "night" theme
BLUE = (59, 130, 246, 255)   # --accent
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def to_white_alpha(img: Image.Image) -> Image.Image:
    """Ink becomes opaque white, paper becomes transparent.

    Alpha is the inverse of luminance, so the splatter's ragged anti-aliased
    edges survive instead of being hard-thresholded into jaggies.
    """
    img = img.convert("RGBA")
    luminance = img.convert("L")
    alpha = luminance.point(lambda v: 255 - v)
    # Respect any transparency already in the source.
    alpha = Image.composite(alpha, Image.new("L", img.size, 0), img.getchannel("A"))
    white = Image.new("RGBA", img.size, (255, 255, 255, 0))
    white.putalpha(alpha)
    return white.crop(white.getbbox())


def square(img: Image.Image, size: int) -> Image.Image:
    """Fit the mark into a transparent square canvas of the given size."""
    fitted = img.copy()
    fitted.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2), fitted)
    return canvas


def tint(img: Image.Image, color: tuple[int, int, int, int]) -> Image.Image:
    solid = Image.new("RGBA", img.size, color)
    solid.putalpha(img.getchannel("A"))
    return solid


def make_favicon(mark: Image.Image, size: int = 256) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), NAVY)
    inner = square(mark, int(size * 0.82))
    canvas.paste(inner, ((size - inner.width) // 2, (size - inner.height) // 2), inner)
    return canvas


def make_og(mark: Image.Image, width: int = 1200, height: int = 630) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), NAVY)

    # Soft blue wash behind the mark so the card is not a flat rectangle. Drawn
    # on its own layer and alpha-composited — ImageDraw replaces alpha rather
    # than blending it, so drawing translucent shapes straight onto the canvas
    # would punch holes in the background instead of glowing over it.
    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    for i in range(28, 0, -1):
        radius = i * 22
        layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        ImageDraw.Draw(layer).ellipse(
            (width // 2 - radius, 270 - radius, width // 2 + radius, 270 + radius),
            fill=(*BLUE[:3], 4),
        )
        glow = Image.alpha_composite(glow, layer)
    del gdraw
    canvas = Image.alpha_composite(canvas, glow)

    art = mark.copy()
    art.thumbnail((560, 330), Image.LANCZOS)
    canvas.paste(art, ((width - art.width) // 2, 90), art)

    draw = ImageDraw.Draw(canvas)
    try:
        title_font = ImageFont.truetype(FONT, 76)
        sub_font = ImageFont.truetype(FONT, 30)
    except OSError:  # no bundled font on this machine; the mark alone still reads
        return canvas

    for text, font, y, fill in (
        ("27.GUESSR", title_font, 452, (255, 255, 255, 255)),
        ("Zgadnij utwór 27.Fuckdemons", sub_font, 552, (125, 165, 235, 255)),
    ):
        w = draw.textbbox((0, 0), text, font=font)[2]
        draw.text(((width - w) // 2, y), text, font=font, fill=fill)
    return canvas


def main() -> None:
    source = Image.open(SOURCE)
    mark = to_white_alpha(source)

    outputs = {
        "logo-27.png": mark,
        "logo-27-mark.png": square(mark, 512),
        "logo-27-blue.png": tint(square(mark, 512), BLUE),
        "favicon.png": make_favicon(mark),
        "apple-touch-icon.png": make_favicon(mark, 180),
        "og-image.png": make_og(mark),
    }
    for name, img in outputs.items():
        img.save(PUBLIC / name, optimize=True)
        print(f"{name:24} {img.width}x{img.height}")


if __name__ == "__main__":
    main()
