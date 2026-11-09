#!/usr/bin/env python3
"""Paints the scorch marks a burnt building leaves on the warehouse floor.

    python3 art/textures/make_scorch_decals.py

models/scorch.png: eight decals in a 4 x 2 sheet (each 256 x 256), painted the
way a scenic painter would on a stop-motion set: a char core laid in with broad
brush strokes in three warm char tones (#2a2420 and two near it), soot dragged
outward in dry-brush streaks that thin and fade, a thin heat-browned ring where
the paper toasted, and a few flicks of soot past the edge. No noise texture: every
mark is a stroke, so it reads as paint, and nothing is lighter than the floor.

  0-3  footprints (houses, offices, castle pieces), each a different shape
  4-5  long marks for a tower that fell along its strip (the long axis is x)
  6-7  small splats (cars, trees, burning scraps)
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
TILE = 256
SS = 4                       # painted at 4x and scaled down (soft, anti-aliased brush edges)
S = TILE * SS

CHAR = [(42, 36, 32), (47, 39, 33), (37, 31, 28), (51, 41, 34)]
SOOT = [(64, 56, 50), (74, 64, 56), (56, 50, 46)]
TOAST = (78, 58, 42)


def blob(rng, cx, cy, rx, ry, wobble, n=48, phase=None):
    """An irregular closed outline: an ellipse whose radius wanders smoothly (a few slow waves, not noise)."""
    if phase is None:
        phase = [rng.uniform(0, math.tau) for _ in range(4)]
    amps = [wobble * rng.uniform(0.5, 1.0) for _ in range(4)]
    pts = []
    for k in range(n):
        a = k / n * math.tau
        r = 1.0 + sum(amps[i] * math.sin(a * (i + 2) + phase[i]) for i in range(4))
        pts.append((cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r))
    return pts


def dab_stroke(layer, rng, p0, p1, width, color, alpha, bristles=5, dry=0.0, taper=True):
    """One brush stroke from p0 to p1: a run of overlapping dabs, split into bristles,
    thinning (and drying out) toward its end."""
    d = ImageDraw.Draw(layer, "RGBA")
    x0, y0 = p0
    x1, y1 = p1
    L = math.hypot(x1 - x0, y1 - y0)
    if L < 1:
        return
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = -uy, ux
    bend = rng.uniform(-0.18, 0.18) * L
    offs = [rng.uniform(-0.5, 0.5) for _ in range(bristles)]
    for b in range(bristles):
        bw = width / bristles * rng.uniform(1.1, 1.8)
        steps = max(4, int(L / (bw * 0.22 + 1)))
        skip_from = 1.0 - dry * rng.uniform(0.2, 0.9)
        for i in range(steps + 1):
            t = i / steps
            if t > skip_from and rng.random() < 0.7:
                continue
            k = (1.0 - t * 0.75) if taper else 1.0
            sway = math.sin(t * math.pi) * bend
            off = offs[b] * width * k
            x = x0 + ux * L * t + nx * (sway + off)
            y = y0 + uy * L * t + ny * (sway + off)
            r = bw * 0.5 * (0.6 + 0.4 * k)
            a = int(alpha * (1.0 - t * 0.55 if taper else 1.0) * rng.uniform(0.75, 1.0))
            d.ellipse((x - r, y - r, x + r, y + r), fill=color + (max(0, min(255, a)),))


def paint(seed, shape):
    rng = random.Random(seed)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    cx, cy = S / 2, S / 2
    if shape == "foot":
        rx, ry = S * rng.uniform(0.27, 0.32), S * rng.uniform(0.25, 0.31)
        wob = 0.07
    elif shape == "long":
        rx, ry = S * 0.42, S * 0.17
        wob = 0.05
    else:
        rx, ry = S * rng.uniform(0.18, 0.23), S * rng.uniform(0.16, 0.21)
        wob = 0.12
    # 1. The heat-browned ring: where the paper toasted, just beyond the soot.
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(ring).polygon(blob(rng, cx, cy, rx * 1.42, ry * 1.42, wob), fill=TOAST + (64,))
    ring = ring.filter(ImageFilter.GaussianBlur(S * 0.03))
    img.alpha_composite(ring)
    # 2. Soot dragged outward: dry-brush streaks from inside the core out past its edge.
    soot = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    n_streaks = 70 if shape != "small" else 34
    drift = rng.uniform(0, math.tau)           # the way the smoke was blowing: streaks run longer that way
    for _ in range(n_streaks):
        a = rng.uniform(0, math.tau)
        pull = 1.0 + 0.45 * max(0.0, math.cos(a - drift))
        r0 = rng.uniform(0.55, 0.85)
        r1 = r0 + rng.uniform(0.35, 0.75) * pull
        p0 = (cx + math.cos(a) * rx * r0, cy + math.sin(a) * ry * r0)
        a2 = a + rng.uniform(-0.12, 0.12)
        p1 = (cx + math.cos(a2) * rx * r1, cy + math.sin(a2) * ry * r1)
        dab_stroke(soot, rng, p0, p1, rng.uniform(0.05, 0.11) * S * (0.6 if shape == "small" else 1.0),
                   rng.choice(SOOT), rng.uniform(55, 110), bristles=rng.randint(4, 7), dry=0.8)
    soot = soot.filter(ImageFilter.GaussianBlur(SS * 1.2))
    img.alpha_composite(soot)
    # 3. The char core: an irregular shape laid in with broad, overlapping strokes.
    core = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    outline = blob(rng, cx, cy, rx, ry, wob)
    ImageDraw.Draw(core).polygon(outline, fill=CHAR[0] + (200,))
    strokes = 26 if shape != "small" else 12
    for _ in range(strokes):
        # Broad strokes across the core in one general direction, like a flat brush.
        ang = rng.uniform(-0.5, 0.5) + (0.0 if shape == "long" else rng.choice([0.0, math.pi / 2]))
        px = cx + rng.uniform(-0.75, 0.75) * rx
        py = cy + rng.uniform(-0.75, 0.75) * ry
        L = rng.uniform(0.4, 0.9) * min(rx, ry) * (2.4 if shape == "long" else 1.0)
        p0 = (px - math.cos(ang) * L / 2, py - math.sin(ang) * L / 2)
        p1 = (px + math.cos(ang) * L / 2, py + math.sin(ang) * L / 2)
        dab_stroke(core, rng, p0, p1, rng.uniform(0.07, 0.14) * S, rng.choice(CHAR), rng.uniform(70, 130),
                   bristles=rng.randint(5, 9), dry=0.3, taper=False)
    # Keep the core strokes inside a slightly grown outline (they feather into the soot).
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).polygon(blob(rng, cx, cy, rx * 1.08, ry * 1.08, wob * 0.8), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(S * 0.018))
    a = core.getchannel("A")
    core.putalpha(Image.composite(a, Image.new("L", (S, S), 0), mask))
    core = core.filter(ImageFilter.GaussianBlur(SS * 0.8))
    img.alpha_composite(core)
    # 4. A darker heart where it burned longest, and a few flicks of soot past the edge.
    heart = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(heart).polygon(blob(rng, cx + rng.uniform(-0.15, 0.15) * rx, cy + rng.uniform(-0.15, 0.15) * ry,
                                       rx * 0.55, ry * 0.5, wob * 1.3), fill=(30, 25, 23, 120))
    heart = heart.filter(ImageFilter.GaussianBlur(S * 0.035))
    img.alpha_composite(heart)
    flicks = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fd = ImageDraw.Draw(flicks)
    for _ in range(18 if shape != "small" else 9):
        a = rng.uniform(0, math.tau)
        r = rng.uniform(1.05, 1.5)
        x, y = cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r
        s = rng.uniform(0.006, 0.016) * S
        fd.ellipse((x - s, y - s * 0.7, x + s, y + s * 0.7), fill=rng.choice(CHAR) + (rng.randint(110, 190),))
    flicks = flicks.filter(ImageFilter.GaussianBlur(SS * 0.6))
    img.alpha_composite(flicks)
    # Fade everything out before the tile's edge so the quad never shows.
    edge = Image.new("L", (S, S), 0)
    ImageDraw.Draw(edge).ellipse((S * 0.02, S * 0.02, S * 0.98, S * 0.98), fill=255) if shape != "long" else \
        ImageDraw.Draw(edge).rounded_rectangle((S * 0.01, S * 0.12, S * 0.99, S * 0.88), radius=S * 0.2, fill=255)
    edge = edge.filter(ImageFilter.GaussianBlur(S * 0.03))
    img.putalpha(Image.composite(img.getchannel("A"), Image.new("L", (S, S), 0), edge))
    return img.resize((TILE, TILE), Image.LANCZOS)


def main():
    plan = [("foot", 11), ("foot", 12), ("foot", 13), ("foot", 14), ("long", 21), ("long", 22), ("small", 31), ("small", 32)]
    sheet = Image.new("RGBA", (TILE * 4, TILE * 2), (0, 0, 0, 0))
    for k, (shape, seed) in enumerate(plan):
        sheet.alpha_composite(paint(seed, shape), ((k % 4) * TILE, (k // 4) * TILE))
    out = os.path.join(ROOT, "models", "scorch.png")
    sheet.save(out)
    print("wrote", out)


if __name__ == "__main__":
    main()
