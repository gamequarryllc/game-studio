#!/usr/bin/env python3
"""Draws the app's icon, favicon and splash mark: the six-cell battery.

    python3 art/make_icons.py        (from apps/screen-battery/)

Needs Pillow. The colours are the app's own: the green of a nearly full
battery and the near-black ink used on it.
"""
import os

from PIL import Image, ImageDraw

GREEN = (74, 197, 110)
INK = (16, 18, 15)
TRACK = (16, 18, 15, 56)
GROUND = (16, 18, 20)
PAPER = (242, 243, 241)
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


def icon(size):
    img = Image.new("RGBA", (size, size), GREEN + (255,))
    mark = battery(int(size * 0.7), 4, INK, TRACK)
    img.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return img.convert("RGB")


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
