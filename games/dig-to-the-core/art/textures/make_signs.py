"""The game's painted signs: lettering painted into enamel sign textures (no
floating text in the world). numpy + PIL, the game's own fonts (Rye for
signage, Zilla Slab for the small print), read from fonts/*.woff2.

    python3 art/textures/make_signs.py

Writes textures/signs/*.png:
  shaft.png    the "Open shaft" sign by the fence gap (its whole face)
  liftup.png   the plate on the lift stop's post
  shack.png    the board over the shack door
  lift.png     the plate hung on the headframe
  layers.png   one plate per layer (10 rows), for the lift shaft's walls
Each is cream vitreous enamel: a coloured border stripe, a fine inset line,
a soft gloss, fine crazing, and chips knocked out to the dark iron.
"""
import io
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "textures", "signs")

CREAM = (239, 227, 200)
RED = (181, 51, 42)
SOOT = (36, 28, 23)
IRON = (52, 46, 42)
BRASS = (192, 138, 62)

LAYERS = ["Topsoil", "Clay", "Bedrock", "Fossil bed", "Dinosaur graveyard", "Crystal caves", "Lava lakes", "Mantle",
          "Outer core", "Inner core"]


def font(name, size):
    """Loads a woff2 from fonts/ (decompressed in memory with fontTools)."""
    from fontTools.ttLib import TTFont
    f = TTFont(os.path.join(ROOT, "fonts", name))
    f.flavor = None
    buf = io.BytesIO()
    f.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, size)


def enamel(w, h, seed, border=RED, stripe=0.07, radius=0.06):
    """A blank enamel plate: iron edge, border stripe, cream field, inset line,
    gloss, crazing, chips. Returns an RGB image."""
    rnd = random.Random(seed)
    im = Image.new("RGB", (w, h), IRON)
    d = ImageDraw.Draw(im)
    r = int(min(w, h) * radius)
    m = max(3, int(min(w, h) * 0.025))
    d.rounded_rectangle([m, m, w - 1 - m, h - 1 - m], r, fill=border)
    s = int(min(w, h) * stripe) + m
    d.rounded_rectangle([s, s, w - 1 - s, h - 1 - s], max(2, r - s // 2), fill=CREAM)
    li = s + max(3, int(min(w, h) * 0.022))
    d.rounded_rectangle([li, li, w - 1 - li, h - 1 - li], max(2, r - li // 2), outline=border, width=max(2, int(min(w, h) * 0.008)))
    return im, (li, li, w - li, h - li)


def finish(im, seed, chips=4):
    """Gloss, crazing, grime and chips over the painted plate."""
    rnd = random.Random(seed)
    w, h = im.size
    a = np.asarray(im, float) / 255.0
    ys = np.linspace(0, 1, h)[:, None]
    xs = np.linspace(0, 1, w)[None, :]
    gloss = np.clip(1.0 - np.abs(ys - 0.18) / 0.22, 0, 1) * 0.06
    grime = 0.06 * (ys ** 2) + 0.03 * np.random.default_rng(seed).random((h, w))
    a = a * (1.0 - grime[..., None]) + gloss[..., None]
    out = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(out)
    # Fine crazing in the enamel.
    for _ in range(int(w * h / 9000)):
        x, y = rnd.uniform(0, w), rnd.uniform(0, h)
        pts = [(x, y)]
        for _k in range(rnd.randint(2, 5)):
            x += rnd.uniform(-14, 14)
            y += rnd.uniform(-14, 14)
            pts.append((x, y))
        d.line(pts, fill=(200, 188, 165), width=1)
    # Chips knocked out to the iron, mostly at the edges and corners.
    for k in range(chips):
        corner = rnd.choice([(0.04, 0.06), (0.96, 0.06), (0.04, 0.94), (0.96, 0.94), (rnd.uniform(0.1, 0.9), rnd.choice([0.04, 0.96]))])
        cx, cy = corner[0] * w, corner[1] * h
        rr = min(w, h) * rnd.uniform(0.025, 0.06)
        poly = [(cx + math.cos(t) * rr * rnd.uniform(0.6, 1.2), cy + math.sin(t) * rr * rnd.uniform(0.6, 1.2)) for t in np.linspace(0, math.tau, 9)[:-1]]
        d.polygon(poly, fill=IRON)
        d.line(poly + poly[:1], fill=(120, 108, 92), width=1)
    return out.filter(ImageFilter.SMOOTH)


def centred(d, box, text, f, fill, dy=0, stroke=0):
    """Text centred in a box. stroke thickens the letters (in their own
    colour) so a sign still reads from across the field, when it's small."""
    x0, y0, x1, y1 = box
    bb = d.textbbox((0, 0), text, font=f, stroke_width=stroke)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((x0 + x1 - tw) / 2 - bb[0], (y0 + y1 - th) / 2 - bb[1] + dy), text, font=f, fill=fill,
           stroke_width=stroke, stroke_fill=fill)


def fit(d, text, fname, max_w, start):
    s = start
    while s > 10:
        f = font(fname, s)
        bb = d.textbbox((0, 0), text, font=f)
        if bb[2] - bb[0] <= max_w:
            return f
        s -= 2
    return font(fname, s)


def shaft():
    w, h = 860, 480
    im, inner = enamel(w, h, 1)
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = inner
    # Big, heavy soot lettering on the cream, one short red line under it:
    # it has to read from the path, metres away, in low sun.
    f = fit(d, "Open shaft", "Rye-Regular.woff2", (x1 - x0) * 0.9, 170)
    centred(d, (x0, y0, x1, y0 + (y1 - y0) * 0.64), "Open shaft", f, SOOT, 6, 9)
    d.line([(x0 + 50, y0 + (y1 - y0) * 0.64), (x1 - 50, y0 + (y1 - y0) * 0.64)], fill=SOOT, width=7)
    f2 = font("ZillaSlab-700.woff2", 78)
    centred(d, (x0, y0 + (y1 - y0) * 0.64, x1, y1), "Mind the edge", f2, RED, -2, 2)
    return finish(im, 1, 5)


def liftup():
    w, h = 460, 260
    im, inner = enamel(w, h, 2)
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = inner
    # An up arrow on the left, the words on the right.
    ax = x0 + 64
    d.polygon([(ax, y0 + 26), (ax + 46, y0 + 86), (ax + 18, y0 + 86), (ax + 18, y1 - 26), (ax - 18, y1 - 26), (ax - 18, y0 + 86), (ax - 46, y0 + 86)], fill=RED)
    f = fit(d, "Lift up", "Rye-Regular.woff2", (x1 - x0) - 150, 92)
    centred(d, (x0 + 120, y0, x1, y1 - 30), "Lift up", f, SOOT, 0, 3)
    f2 = font("ZillaSlab-700.woff2", 30)
    centred(d, (x0 + 120, y1 - 70, x1, y1), "to the shack", f2, RED)
    return finish(im, 2, 3)


def shack():
    w, h = 1320, 200
    im, inner = enamel(w, h, 3, stripe=0.06, radius=0.08)
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = inner
    f = fit(d, "Supply Shack", "Rye-Regular.woff2", (x1 - x0) * 0.62, 118)
    centred(d, (x0, y0, x0 + (x1 - x0) * 0.68, y1), "Supply Shack", f, RED, 4, 3)
    f2 = font("ZillaSlab-700.woff2", 38)
    d.line([(x0 + (x1 - x0) * 0.69, y0 + 24), (x0 + (x1 - x0) * 0.69, y1 - 24)], fill=SOOT, width=3)
    for i, t in enumerate(["tools", "upgrades", "crew"]):
        centred(d, (x0 + (x1 - x0) * 0.69, y0 + (y1 - y0) * i / 3, x1, y0 + (y1 - y0) * (i + 1) / 3), t, f2, SOOT)
    return finish(im, 3, 6)


def lift():
    w, h = 420, 170
    im, inner = enamel(w, h, 4, border=SOOT)
    d = ImageDraw.Draw(im)
    f = fit(d, "Lift", "Rye-Regular.woff2", (inner[2] - inner[0]) * 0.8, 110)
    centred(d, inner, "Lift", f, RED, 4, 3)
    return finish(im, 4, 3)


def layers():
    w, h = 520, 150
    rows = []
    for i, name in enumerate(LAYERS):
        im, inner = enamel(w, h, 10 + i)
        d = ImageDraw.Draw(im)
        x0, y0, x1, y1 = inner
        box = (x0, y0, x0 + (x1 - x0) * 0.74, y1)
        if " " in name and len(name) > 12:
            a, b = name.split(" ", 1)
            f = fit(d, max(a, b, key=len), "Rye-Regular.woff2", (x1 - x0) * 0.68, 46)
            centred(d, (box[0], box[1], box[2], (box[1] + box[3]) / 2), a, f, SOOT, 6)
            centred(d, (box[0], (box[1] + box[3]) / 2, box[2], box[3]), b, f, SOOT, -4)
        else:
            f = fit(d, name, "Rye-Regular.woff2", (x1 - x0) * 0.68, 70)
            centred(d, box, name, f, SOOT, 3)
        f2 = font("ZillaSlab-700.woff2", 44)
        centred(d, (x0 + (x1 - x0) * 0.74, y0, x1, y1), "%d m" % (i * 24), f2, RED, 2)
        rows.append(finish(im, 10 + i, 3))
    sheet = Image.new("RGB", (w, h * len(rows)))
    for i, r in enumerate(rows):
        sheet.paste(r, (0, i * h))
    return sheet


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in [("shaft", shaft), ("liftup", liftup), ("shack", shack), ("lift", lift), ("layers", layers)]:
        fn().save(os.path.join(OUT, name + ".png"))
        print("painted", name)


if __name__ == "__main__":
    main()
