"""Draws the fire's flipbooks: inked cartoon flames and cel-shaded plum smoke.

  fx/flames.png  4 x 4 cells of 128 x 256: each row is one flame silhouette, its
                 four cells the held drawings it boils through (8 a second in
                 the game). Rows 0-2 are ordinary flames (two, three and a
                 lopsided crowd of tongues); row 3 is the tall leading flame
                 each cluster gets one of. The image stores levels, not colours,
                 so the shader can paint cursed-wood fire, golden phoenix fire or
                 violet dragon fire from the same drawings:
                   R = 0 ink line, 0.33 the dark band inside it, 0.66 the body,
                       1.0 the hot core; G = 1 on the sooty tips; A = the shape.
                 Carved lines (thin dark cuts that follow the tongues, the way a
                 linocut flame is cut) run through the body.
  fx/puffs.png   2 x 2 cells of 128 x 128: lumpy smoke puffs, a lit top and a
                 shadowed underside with a crisp edge (R = light, A = shape).

Run:  python3 art/fx/make_fx.py
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "fx"))
S = 2                      # draw at 2x, then shrink: smooth, hand-cut edges

CW, CH = 128, 256          # one flame cell


def tongue(cx, base_y, top_y, width, curl, lean, n=18):
    """A tapered, curling tongue of flame as a polygon (cell pixels, y down)."""
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        y = base_y + (top_y - base_y) * t
        w = width * (1.0 - t) ** 1.15 * (0.75 + 0.25 * math.sin(t * math.pi))
        x = cx + lean * t * t * (top_y - base_y) * -0.25 + curl * math.sin(t * math.pi * 0.9) * t * width * 1.4 \
            - curl * math.sin(t * math.pi * 1.8) * (1.0 - t) * width * 0.35          # an S-curve, like a cut flame
        left.append((x - w, y))
        right.append((x + w, y))
    return left + right[::-1]


def body(cx, base_y, h, w):
    """The round-bottomed belly the tongues rise out of."""
    pts = []
    for i in range(33):
        a = math.pi * i / 32
        # a broad, flattish base (it sits in the ash), not an egg
        pts.append((cx + math.cos(a) * w * (1.0 + 0.08 * math.sin(a * 5.0)), base_y - h * 0.22 + math.sin(a) * h * 0.22))
    pts.append((cx - w * 0.95, base_y - h * 0.4))
    pts.append((cx - w * 0.55, base_y - h * 0.7))
    pts.append((cx, base_y - h * 0.82))
    pts.append((cx + w * 0.55, base_y - h * 0.7))
    pts.append((cx + w * 0.95, base_y - h * 0.4))
    return pts


def flame_cell(row, frame, rng):
    W, H = CW * S, CH * S
    mask = Image.new("L", (W, H), 0)
    core = Image.new("L", (W, H), 0)
    cuts = Image.new("L", (W, H), 0)
    dm, dc, dk = ImageDraw.Draw(mask), ImageDraw.Draw(core), ImageDraw.Draw(cuts)
    cx = W * 0.5
    base = H - 10 * S
    j = lambda a: rng.uniform(-a, a)   # the boil: each drawing a little different
    if row == 3:
        # the tall leading flame: a narrow belly, one long curling tongue and two small ones
        bw, bh = W * 0.3, H * 0.42
        tongues = [(cx + j(3) * S, H * 0.04 + j(6) * S, W * 0.21, 0.55 + j(0.25), 0.25 + j(0.15)),
                   (cx - W * 0.17 + j(3) * S, H * 0.42 + j(10) * S, W * 0.1, -0.6 + j(0.3), -0.2),
                   (cx + W * 0.19 + j(3) * S, H * 0.5 + j(10) * S, W * 0.09, 0.7 + j(0.3), 0.15)]
    else:
        bw, bh = W * 0.4, H * 0.55
        shapes = {
            0: [(-0.12, 0.2, 0.2, 0.5, 0.1), (0.16, 0.36, 0.15, -0.6, -0.1)],
            1: [(0.02, 0.16, 0.18, -0.4, 0.05), (-0.22, 0.4, 0.13, -0.7, -0.15), (0.22, 0.34, 0.14, 0.8, 0.2)],
            2: [(0.1, 0.22, 0.19, 0.7, 0.25), (-0.18, 0.3, 0.15, -0.5, -0.05), (0.27, 0.5, 0.1, 0.9, 0.3), (-0.3, 0.55, 0.08, -0.9, -0.3)],
        }[row]
        tongues = [(cx + (dx + j(0.02)) * W, (ty + j(0.035)) * H, tw * W, cu + j(0.25), le) for dx, ty, tw, cu, le in shapes]
    dm.polygon(body(cx + j(2) * S, base, bh + j(6) * S, bw), fill=255)
    for (tx, ty, tw, cu, le) in tongues:
        dm.polygon(tongue(tx, base - bh * 0.45, ty, tw, cu, le), fill=255)
    # the hot core: a smaller belly and the root of the biggest tongue
    dc.polygon(body(cx + j(2) * S, base - 6 * S, bh * 0.6, bw * 0.55), fill=255)
    tx, ty, tw, cu, le = tongues[0]
    dc.polygon(tongue(tx, base - bh * 0.4, ty + (base - ty) * 0.45, tw * 0.5, cu, le), fill=255)
    # carved lines: thin cuts following the tongues up out of the belly
    for (tx, ty, tw, cu, le) in tongues:
        pts = []
        for i in range(10):
            t = 0.12 + 0.62 * i / 9
            y = (base - bh * 0.3) + (ty - (base - bh * 0.3)) * t
            x = tx + cu * math.sin(t * math.pi * 0.9) * t * tw * 1.4 + tw * 0.25 * (1 - t)
            pts.append((x, y))
        dk.line(pts, fill=255, width=int(2.2 * S))
    m = np.asarray(mask, dtype=np.float32) / 255.0
    ink = np.asarray(mask.filter(ImageFilter.MaxFilter(9 * S + 1)), dtype=np.float32) / 255.0
    inner = np.asarray(mask.filter(ImageFilter.MinFilter(7 * S + 1)), dtype=np.float32) / 255.0
    c = np.asarray(core, dtype=np.float32) / 255.0 * inner
    k = np.asarray(cuts, dtype=np.float32) / 255.0 * np.asarray(mask.filter(ImageFilter.MinFilter(11 * S + 1)), dtype=np.float32) / 255.0
    level = np.where(m > 0.5, 0.66, 0.0)
    level = np.where((m > 0.5) & (inner < 0.5), 0.33, level)          # the dark band inside the ink
    level = np.where((c > 0.5), 1.0, level)
    level = np.where((k > 0.5) & (c < 0.5), 0.33, level)              # carved cuts through the body
    # sooty tips: the top fifth of each tongue goes to smoke
    yy = np.arange(H, dtype=np.float32)[:, None] / H
    top = min(t[1] for t in tongues) / H
    tip = ((yy < top + 0.09) | ((yy < top + 0.2) & (inner < 0.5))) & (m > 0.5)
    rgba = np.zeros((H, W, 4), dtype=np.float32)
    rgba[..., 0] = level
    rgba[..., 1] = np.where(tip, 1.0, 0.0)
    rgba[..., 3] = np.clip(ink, 0, 1)
    img = Image.fromarray((rgba * 255).astype(np.uint8), "RGBA")
    return img.resize((CW, CH), Image.LANCZOS)


def puff_cell(k, rng):
    W = 128 * S
    mask = Image.new("L", (W, W), 0)
    light = Image.new("L", (W, W), 0)
    dm, dl = ImageDraw.Draw(mask), ImageDraw.Draw(light)
    blobs = []
    for i in range(5 + k):
        a = 2 * math.pi * i / (5 + k) + rng.uniform(-0.3, 0.3)
        r = W * rng.uniform(0.14, 0.2)
        d = W * rng.uniform(0.12, 0.2)
        blobs.append((W * 0.5 + math.cos(a) * d, W * 0.52 + math.sin(a) * d * 0.8, r))
    blobs.append((W * 0.5, W * 0.5, W * 0.24))
    for (x, y, r) in blobs:
        dm.ellipse((x - r, y - r, x + r, y + r), fill=255)
        dl.ellipse((x - r * 0.8, y - r * 1.05, x + r * 0.7, y + r * 0.35), fill=255)
    m = np.asarray(mask.filter(ImageFilter.GaussianBlur(1.0 * S)), dtype=np.float32) / 255.0
    li = np.asarray(light, dtype=np.float32) / 255.0 * np.asarray(mask.filter(ImageFilter.MinFilter(9 * S + 1)), dtype=np.float32) / 255.0
    rgba = np.zeros((W, W, 4), dtype=np.float32)
    rgba[..., 0] = np.where(li > 0.5, 1.0, 0.45)
    rgba[..., 3] = m
    return Image.fromarray((rgba * 255).astype(np.uint8), "RGBA").resize((128, 128), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    atlas = Image.new("RGBA", (CW * 4, CH * 4), (0, 0, 0, 0))
    for row in range(4):
        for frame in range(4):
            rng = random.Random(1000 + row * 31 + frame * 7)
            atlas.paste(flame_cell(row, frame, rng), (frame * CW, row * CH))
    atlas.save(os.path.join(OUT, "flames.png"))
    puffs = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    for k in range(4):
        puffs.paste(puff_cell(k, random.Random(77 + k)), ((k % 2) * 128, (k // 2) * 128))
    puffs.save(os.path.join(OUT, "puffs.png"))
    print("wrote", os.path.join(OUT, "flames.png"), "and puffs.png")


if __name__ == "__main__":
    main()
