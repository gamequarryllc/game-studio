#!/usr/bin/env python3
"""Draws the app's icon, favicon and splash mark.

The icon and favicon are the sprout: the six-cell battery with two leaves growing
out of it. The splash mark is the plain battery.

    python3 art/make_icons.py        (from apps/plainlimit/)

Needs Pillow. The colours are the app's own: the green of a nearly full
battery and the near-black ink used on it, on a warm cream ground.
"""
import os

from PIL import Image, ImageDraw

GREEN = (74, 197, 110)
INK = (16, 18, 15)
TRACK = (16, 18, 15, 56)
GROUND = (16, 18, 20)
PAPER = (242, 243, 241)
CREAM_TOP = (251, 248, 236)
CREAM_BOTTOM = (237, 230, 207)
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


def _bezier(p0, p1, p2, p3, steps=40):
    """Points along one cubic curve."""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        pts.append(
            (
                u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
            )
        )
    return pts


def _leaf(d, k, base, c1, tip, c2, c3, c4, width):
    """One leaf: out from the stem to its tip and back, filled green with an ink edge."""
    pts = _bezier(base, c1, c2, tip) + _bezier(tip, c3, c4, base)
    pts = [(x * k, y * k) for x, y in pts]
    d.polygon(pts, fill=GREEN)
    d.line(pts + pts[:2], fill=INK, width=int(width * k), joint="curve")
    r = width * k / 2
    for x, y in (pts[0], pts[len(pts) // 2]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=INK)


def icon(size, scale=4):
    """The sprout icon: the six-cell battery, four cells left, with two leaves growing out of it.

    Drawn on a 1024 grid, large, then shrunk for clean edges.
    """
    k = size * scale / 1024
    w = size * scale
    img = Image.new("RGBA", (w, w), CREAM_TOP + (255,))
    d = ImageDraw.Draw(img)
    for y in range(w):
        t = y / (w - 1)
        d.line([(0, y), (w, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(CREAM_TOP, CREAM_BOTTOM)) + (255,))

    def box(x0, y0, x1, y1):
        return [x0 * k, y0 * k, x1 * k, y1 * k]

    top = 445  # top edge of the casing; everything else hangs off it
    # the casing and its cap
    d.rounded_rectangle(box(120, top, 850, top + 380), radius=120 * k, outline=INK, width=int(40 * k))
    d.rounded_rectangle(box(852, top + 124, 904, top + 256), radius=24 * k, fill=INK)
    # six cells: four left, two used
    cells, gap, x0, span = 6, 20, 206, 558
    cell_w = (span - (cells - 1) * gap) / cells
    faint = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    fd = ImageDraw.Draw(faint)
    for i in range(cells):
        cx = x0 + i * (cell_w + gap)
        b = box(cx, top + 86, cx + cell_w, top + 294)
        if i < 4:
            d.rounded_rectangle(b, radius=28 * k, fill=GREEN)
        else:
            fd.rounded_rectangle(b, radius=28 * k, outline=INK + (77,), width=int(10 * k))
    img.alpha_composite(faint)
    # the sprout: a stem out of the top of the casing and two leaves
    sx = 485
    d.line([(sx * k, (top + 20) * k), (sx * k, (top - 100) * k)], fill=INK, width=int(30 * k))
    _leaf(d, k, (sx, top - 80), (sx, top - 180), (300, top - 200), (380, top - 210), (300, top - 110), (380, top - 70), 26)
    _leaf(d, k, (sx, top - 100), (sx, top - 220), (690, top - 250), (600, top - 260), (690, top - 150), (600, top - 100), 26)
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
