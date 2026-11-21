#!/usr/bin/env python3
"""Draws the app's icon, favicon and splash mark.

The icon and favicon are Glow: the home-screen widget's lit six-cell battery,
four cells left, glowing green on a dark ground. The splash mark is the plain battery.

    python3 art/make_icons.py        (from apps/plainlimit/)

Needs Pillow. The icon's colours are the Glow widget's: its neon green, a white
casing and a near-black ground.
"""
import os

from PIL import Image, ImageDraw, ImageFilter

PAPER = (242, 243, 241)
GLOW_GREEN = (75, 245, 141)
GLOW_TOP = (25, 33, 29)
GLOW_BOTTOM = (6, 9, 8)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "images")


def battery(size, lit, fg, track, scale=4):
    """A battery `size` px wide on a transparent ground, drawn large and shrunk for clean edges."""
    w = size * scale
    h = int(w * 0.42)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cap = int(w * 0.045)
    gap = int(w * 0.02)
    body = w - cap - gap
    border = max(2, int(h * 0.105))
    d.rounded_rectangle([0, 0, body - 1, h - 1], radius=int(h * 0.26), outline=fg, width=border)
    d.rounded_rectangle([body + gap, int(h * 0.31), w - 1, int(h * 0.69)], radius=int(cap * 0.45), fill=fg)
    inset = border + max(2, int(h * 0.09))
    cells = 6
    cell_gap = max(2, int(h * 0.09))
    cell_w = (body - 2 * inset - (cells - 1) * cell_gap) / cells
    for i in range(cells):
        x0 = inset + i * (cell_w + cell_gap)
        d.rounded_rectangle([x0, inset, x0 + cell_w, h - 1 - inset], radius=int(h * 0.09), fill=fg if i < lit else track)
    return img.resize((size, int(size * 0.42)), Image.LANCZOS)


def _layer(w, rgb):
    """A transparent layer that is `rgb` all over, so blurring it never darkens the edges."""
    return Image.new("RGBA", (w, w), rgb + (0,))


def _fade(img, opacity):
    """`img` with its alpha multiplied by `opacity`."""
    img.putalpha(img.getchannel("A").point(lambda a: round(a * opacity)))
    return img


def _glow(cells, k):
    """The lit cells with the widget's halo: a tight glow twice over a wide soft bloom."""
    tight = cells.filter(ImageFilter.GaussianBlur(14 * k))
    bloom = _fade(cells.filter(ImageFilter.GaussianBlur(42 * k)), 0.55)
    for top in (tight, tight, cells):
        bloom.alpha_composite(top)
    return bloom


def icon(size, scale=4):
    """The Glow icon: the home-screen widget's lit battery, four cells left, on a dark ground.

    Same colours and battery proportions as the Glow widget (BatteryShape in
    targets/widget/PlainlimitWidget.swift). Drawn on a 1024 grid, large, then shrunk.
    """
    w = size * scale
    k = w / 1024

    def box(x0, y0, x1, y1):
        return [x0 * k, y0 * k, x1 * k, y1 * k]

    # the ground: near-black, a touch of green at the top, with a pool of green light behind the battery
    t = Image.linear_gradient("L").resize((w, w), Image.BICUBIC)
    img = Image.merge("RGB", [t.point(lambda v, a=a, b=b: round(a + (b - a) * v / 255)) for a, b in zip(GLOW_TOP, GLOW_BOTTOM)]).convert("RGBA")

    def pool(v):  # radial_gradient's value is the distance from the centre times 1.41 (181 at the edge)
        d = min(v / 181, 1)
        a = 0.32 + (0.112 - 0.32) * d / 0.55 if d < 0.55 else 0.112 * (1 - d) / 0.45
        return round(max(a, 0) * 255)

    r = round(470 * k)
    light = Image.new("RGBA", (2 * r, 2 * r), GLOW_GREEN + (0,))
    light.putalpha(Image.radial_gradient("L").resize((2 * r, 2 * r), Image.BICUBIC).point(pool))
    img.alpha_composite(light, (round(512 * k) - r, round(512 * k) - r))

    # the battery, in the widget's proportions
    x, y, bw, h = 122, 333, 780, 358
    nub_w, nub_h, gap = h * 0.11, h * 0.36, h * 0.05
    body = bw - nub_w - gap
    sw, pad, space = h * 0.075, h * 0.15, h * 0.07
    cell_w, cell_h, cell_r = (body - 2 * pad - 5 * space) / 6, h - 2 * pad, h * 0.09
    track_w = h * 0.035

    casing = _layer(w, (255, 255, 255))
    ImageDraw.Draw(casing).rounded_rectangle(box(x, y, x + body, y + h), radius=h * 0.24 * k, outline=(255, 255, 255, 255), width=round(sw * k))
    img.alpha_composite(_fade(casing, 0.9))

    lit = _layer(w, GLOW_GREEN)
    used = _layer(w, (255, 255, 255))
    for i in range(6):
        cx = x + pad + i * (cell_w + space)
        b = box(cx, y + pad, cx + cell_w, y + pad + cell_h)
        if i < 4:
            ImageDraw.Draw(lit).rounded_rectangle(b, radius=cell_r * k, fill=GLOW_GREEN + (255,))
        else:
            ImageDraw.Draw(used).rounded_rectangle(b, radius=(cell_r + track_w / 2) * k, outline=(255, 255, 255, 255), width=round(track_w * k))
    img.alpha_composite(_glow(lit, k))
    img.alpha_composite(_fade(used, 0.17))

    cap = _layer(w, (255, 255, 255))
    nx, ny = x + body + gap, y + (h - nub_h) / 2
    ImageDraw.Draw(cap).rounded_rectangle(box(nx, ny, nx + nub_w, ny + nub_h), radius=nub_w * 0.4 * k, fill=(255, 255, 255, 255))
    img.alpha_composite(_fade(cap, 0.9))
    return img.resize((size, size), Image.LANCZOS).convert("RGB")


def main():
    os.makedirs(OUT, exist_ok=True)
    icon(1024).save(os.path.join(OUT, "icon.png"))
    icon(96).save(os.path.join(OUT, "favicon.png"))
    splash = Image.new("RGBA", (480, 480), (0, 0, 0, 0))
    mark = battery(400, 6, PAPER, (242, 243, 241, 64))
    splash.alpha_composite(mark, ((480 - mark.width) // 2, (480 - mark.height) // 2))
    splash.save(os.path.join(OUT, "splash-icon.png"))


if __name__ == "__main__":
    main()
