#!/usr/bin/env python3
"""Draws the cut-paper fire and the tissue-paper smoke.

    python3 art/textures/make_fire_sheets.py

models/flames.png: six flames side by side (each 128 x 256), cut from layers of
coloured paper with torn edges: a darker red base (#b8321c) and rim, an orange
body, a yellow tongue and a pale core, each layer throwing a thin shadow on the
one under it. They differ in shape (tall and thin, fat, forked, leaning, ragged,
a double tongue).

models/smoke.png: four torn pieces of grey tissue paper (each 128 x 128), soft
and see-through, with a slightly darker torn edge and fibres.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
SS = 3
rng = random.Random(2611)

BASE = (184, 50, 28)      # #b8321c
RIM = (128, 30, 18)
ORANGE = (238, 118, 34)
YELLOW = (250, 196, 58)
CORE = (255, 238, 170)


def torn(points, amp, step=4.0):
    """Subdivide an outline and rough its edge like torn paper (small fast jitter + slow wander)."""
    out = []
    phase = rng.uniform(0, 6.3)
    n = len(points)
    for i in range(n):
        x0, y0 = points[i]
        x1, y1 = points[(i + 1) % n]
        L = math.hypot(x1 - x0, y1 - y0) or 1.0
        nx, ny = -(y1 - y0) / L, (x1 - x0) / L
        k = max(1, int(L / step))
        for j in range(k):
            t = j / k
            w = math.sin(phase + (i + t) * 1.7) * amp * 0.6 + rng.uniform(-amp, amp) * 0.7
            out.append((x0 + (x1 - x0) * t + nx * w, y0 + (y1 - y0) * t + ny * w))
    return out


def tongue(cx, base_y, top_y, width, lean, bend):
    """One flame tongue: a rounded bottom, widest low down, an S-curved taper to a point."""
    right, left = [], []
    steps = 22
    H = base_y - top_y
    for i in range(steps + 1):
        t = i / steps
        y = base_y - H * t
        hw = width * 0.5 * (math.sin(min(1.0, t / 0.28) * math.pi * 0.5) * 0.55 + 0.45) * (1.0 - t) ** 1.25
        sway = lean * t * t * H + math.sin(t * math.pi * 1.4) * bend * H * t
        right.append((cx + hw + sway, y))
        left.append((cx - hw + sway, y))
    bottom = []
    for i in range(1, 8):
        a = math.pi * i / 8
        bottom.append((cx + math.cos(a) * width * 0.225, base_y + math.sin(a) * width * 0.16))
    return right + list(reversed(left)) + bottom


SHAPES = {
    # main tongue (x offset, height, width, lean, bend) followed by side tongues
    "tall": [(0.0, 0.95, 0.5, 0.03, 0.04), (0.14, 0.45, 0.24, 0.2, -0.05)],
    "fat": [(0.0, 0.8, 0.72, -0.02, 0.05), (-0.18, 0.55, 0.34, -0.25, 0.04), (0.2, 0.42, 0.3, 0.3, -0.04)],
    "fork": [(-0.1, 0.92, 0.42, -0.12, 0.05), (0.14, 0.78, 0.38, 0.2, -0.06), (0.0, 0.5, 0.6, 0.0, 0.0)],
    "lean": [(0.0, 0.93, 0.52, 0.26, -0.03), (-0.16, 0.48, 0.28, 0.1, 0.06)],
    "ragged": [(0.0, 0.86, 0.56, 0.05, -0.08), (-0.2, 0.62, 0.26, -0.18, 0.05), (0.22, 0.7, 0.24, 0.25, -0.04),
               (0.08, 0.4, 0.3, 0.3, 0.0)],
    "double": [(-0.13, 0.9, 0.44, -0.04, 0.06), (0.15, 0.82, 0.42, 0.12, -0.05)],
}


def flame_polys(w, h, kind, scale, lean_all):
    polys = []
    base_y = h * 0.9
    for (dx, hh, ww, lean, bend) in SHAPES[kind]:
        top_y = base_y - h * 0.86 * hh * scale
        polys.append(tongue(w / 2 + dx * w * (0.6 + 0.4 * scale), base_y, top_y, ww * w * scale, lean + lean_all, bend))
    return polys


def draw_layer(img, poly, color, shadow=True):
    d = ImageDraw.Draw(img)
    p = [(x * SS, y * SS) for x, y in poly]
    if shadow:
        sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).polygon([(x + 2 * SS, y + 3 * SS) for x, y in p], fill=(60, 14, 8, 120))
        sh = sh.filter(ImageFilter.GaussianBlur(1.2 * SS))
        img.alpha_composite(sh)
    d.polygon(p, fill=color + (255,))


def flame(kind, seed):
    rng.seed(seed)
    w, h = 128, 256
    img = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    lean_all = rng.uniform(-0.03, 0.03)
    layers = [(1.0, RIM, 1.4), (0.95, BASE, 1.3), (0.78, ORANGE, 1.2), (0.56, YELLOW, 1.0), (0.32, CORE, 0.8)]
    for k, (sc, col, amp) in enumerate(layers):
        for poly in flame_polys(w, h, kind, sc, lean_all * (1.0 - k * 0.15)):
            # Inner layers sit low: smaller pieces of paper glued on near the bottom.
            poly = [(x, y - (1.0 - sc) * h * 0.05) for x, y in poly]
            draw_layer(img, torn(poly, amp, 3.0), col, shadow=k > 0)
    # The darker red base: a deep red band across the bottom, following the shape.
    band = Image.new("RGBA", img.size, (0, 0, 0, 0))
    yb = h * 0.8
    pts = [(x * SS, (yb + math.sin(x * 0.17 + seed) * 4 + rng.uniform(-1.5, 1.5)) * SS) for x in range(0, w + 1, 4)]
    ImageDraw.Draw(band).polygon(pts + [(w * SS, h * SS), (0, h * SS)], fill=BASE + (255,))
    inner = Image.new("L", img.size, 0)
    for poly in flame_polys(w, h, kind, 0.95, lean_all):
        ImageDraw.Draw(inner).polygon([(x * SS, y * SS) for x, y in poly], fill=255)
    inner = inner.filter(ImageFilter.MinFilter(5))
    band.putalpha(Image.composite(band.getchannel("A"), Image.new("L", img.size, 0), inner))
    img.alpha_composite(band)
    return img.resize((w, h), Image.LANCZOS)


def tissue(seed):
    rng.seed(seed)
    s = 128
    img = Image.new("RGBA", (s * SS, s * SS), (0, 0, 0, 0))
    cx, cy = s / 2, s / 2
    pts = []
    n = 9
    for k in range(n):
        a = k / n * math.tau + rng.uniform(-0.2, 0.2)
        r = s * rng.uniform(0.28, 0.46)
        stretch = 1.0 + 0.35 * (seed % 2)
        pts.append((cx + math.cos(a) * r * stretch * 0.95, cy + math.sin(a) * r / stretch))
    poly = torn(pts, 3.5, 3.0)
    p = [(x * SS, y * SS) for x, y in poly]
    base = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(base).polygon(p, fill=(214, 212, 208, 150))
    # A second, smaller layer: tissue is see-through, so overlaps are darker.
    pts2 = [(cx + (x - cx) * 0.6 + rng.uniform(-8, 8), cy + (y - cy) * 0.6 + rng.uniform(-8, 8)) for x, y in pts[::2]]
    ImageDraw.Draw(base).polygon([(x * SS, y * SS) for x, y in torn(pts2, 3.0, 3.0)], fill=(190, 188, 186, 190))
    edge = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(edge).line(p + [p[0]], fill=(150, 148, 146, 170), width=2 * SS)
    img.alpha_composite(base)
    img.alpha_composite(edge)
    # Fibres, lighter than the tissue.
    fib = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(fib)
    for _ in range(30):
        x, y = rng.uniform(0.25, 0.75) * s, rng.uniform(0.25, 0.75) * s
        a = rng.uniform(0, math.tau)
        L = rng.uniform(3, 9)
        d.line(((x * SS, y * SS), ((x + math.cos(a) * L) * SS, (y + math.sin(a) * L) * SS)), fill=(246, 246, 244, 70), width=SS)
    img.alpha_composite(fib)
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).polygon(p, fill=255)
    img.putalpha(Image.composite(img.getchannel("A"), Image.new("L", img.size, 0), mask))
    return img.resize((s, s), Image.LANCZOS)


def main():
    kinds = ["tall", "fat", "fork", "lean", "ragged", "double"]
    sheet = Image.new("RGBA", (128 * len(kinds), 256), (0, 0, 0, 0))
    for k, kind in enumerate(kinds):
        sheet.alpha_composite(flame(kind, 100 + k), (128 * k, 0))
    out = os.path.join(ROOT, "models", "flames.png")
    sheet.save(out)
    smoke = Image.new("RGBA", (128 * 4, 128), (0, 0, 0, 0))
    for k in range(4):
        smoke.alpha_composite(tissue(200 + k), (128 * k, 0))
    out2 = os.path.join(ROOT, "models", "smoke.png")
    smoke.save(out2)
    print("wrote", out, "and", out2)


if __name__ == "__main__":
    main()
