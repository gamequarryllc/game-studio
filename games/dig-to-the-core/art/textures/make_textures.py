"""Hand-painted looking textures for Dig to the Core (numpy + PIL, no stock art).

    python3 art/textures/make_textures.py

Writes textures/rock_paint.png (256 x 256, tiles seamlessly), greyscale
values the rock shader multiplies by each rock type's colour:
  R  painted rock: chunky stones lit from the top left, with darker cracks
     between them, posterized and softened like brush work
  G  fine grit and mineral flecks, for close up
  B  crack mask (1 = deep crack), so cracks stay dark under the headlamp
  A  painted grass: clumps in three values with blade strokes (the field)

and textures/strata.png (512 x 1): the strata bands, 64 m of them, each
0.5 to 1.5 m thick and 10 to 20 percent lighter or darker than the last,
with a thin dark seam where two bands meet.
"""
import math
import os

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "textures"))
N = 256
rng = np.random.default_rng(20261109)


def voronoi(cells, jitter=0.85, seed=0, warp=None):
    """Tileable Voronoi: (nearest distance, second distance, cell id, offset to centre).
    warp: (wx, wy) arrays in cell units that bend the cell edges."""
    r = np.random.default_rng(seed)
    pts = (np.stack(np.meshgrid(np.arange(cells), np.arange(cells), indexing="ij"), -1) + 0.5
           + (r.random((cells, cells, 2)) - 0.5) * jitter)
    ys, xs = np.mgrid[0:N, 0:N] / N * cells
    if warp is not None:
        xs = xs + warp[0]
        ys = ys + warp[1]
    d1 = np.full((N, N), 1e9)
    d2 = np.full((N, N), 1e9)
    cid = np.zeros((N, N), int)
    off = np.zeros((N, N, 2))
    for i in range(cells):
        for j in range(cells):
            for di in (-cells, 0, cells):
                for dj in (-cells, 0, cells):
                    px = pts[i, j, 0] + di
                    py = pts[i, j, 1] + dj
                    if abs(px - (cells / 2)) > cells * 0.5 + 2 and di != 0:
                        pass
                    dx = xs - px
                    dy = ys - py
                    d = np.sqrt(dx * dx + dy * dy)
                    closer = d < d1
                    d2 = np.where(closer, d1, np.minimum(d2, d))
                    d1 = np.where(closer, d, d1)
                    cid = np.where(closer, i * cells + j, cid)
                    off[..., 0] = np.where(closer, dx, off[..., 0])
                    off[..., 1] = np.where(closer, dy, off[..., 1])
    return d1, d2, cid, off


def tile_noise(freq, seed, octaves=3):
    """Tileable value noise (sum of a few octaves of smoothed random grids)."""
    r = np.random.default_rng(seed)
    out = np.zeros((N, N))
    amp = 1.0
    total = 0.0
    for o in range(octaves):
        f = freq * (2 ** o)
        g = r.random((f, f))
        img = Image.fromarray((g * 255).astype(np.uint8)).resize((N, N), Image.BICUBIC)
        # Wrap: resample a 3x3 tiled copy so the edges match.
        big = np.tile(g, (3, 3))
        im = Image.fromarray((big * 255).astype(np.uint8)).resize((N * 3, N * 3), Image.BICUBIC)
        a = np.asarray(im, float)[N:2 * N, N:2 * N] / 255.0
        out += a * amp
        total += amp
        amp *= 0.5
    return out / total


def wrap_blur(a, radius):
    big = np.tile(a, (3, 3))
    im = Image.fromarray(np.clip(big * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(im, float)[N:2 * N, N:2 * N] / 255.0


def smear(a, dx, dy, steps):
    """Brush smear: average shifted copies along a direction."""
    acc = np.zeros_like(a)
    for s in range(steps):
        acc += np.roll(np.roll(a, int(round(dx * s)), 1), int(round(dy * s)), 0)
    return acc / steps


def posterize(a, levels):
    return np.round(a * (levels - 1)) / (levels - 1)


def rock_layer(cells, seed, light=(-0.6, -0.8), warp_amt=0.35):
    warp = ((tile_noise(3, seed + 50, 3) - 0.5) * 2 * warp_amt * 1.0, (tile_noise(3, seed + 51, 3) - 0.5) * 2 * warp_amt)
    d1, d2, cid, off = voronoi(cells, 0.95, seed, warp)
    r = np.random.default_rng(seed + 1)
    base = r.uniform(0.72, 1.0, cells * cells)[cid]
    lx, ly = light
    size = np.maximum(np.sqrt(off[..., 0] ** 2 + off[..., 1] ** 2), 1e-4)
    # Bevel: lit on the side facing the light, shaded opposite, strongest at the rim.
    rim = np.clip((d1 / np.maximum(d2, 1e-4)), 0, 1) ** 2
    facing = -(off[..., 0] * lx + off[..., 1] * ly) / size
    val = base + 0.22 * facing * rim
    edge = d2 - d1
    width = 0.05 + 0.1 * tile_noise(6, seed + 60, 2)
    crack = np.clip(1.0 - edge / width, 0, 1) ** 1.5
    # Not every seam is a crack: some fade out, like weathered joints.
    crack *= np.clip((tile_noise(5, seed + 61, 2) - 0.35) * 3.0, 0, 1)
    return val, crack


def main():
    os.makedirs(OUT, exist_ok=True)
    big_v, big_c = rock_layer(5, 11, warp_amt=0.45)
    small_v, _small_c = rock_layer(14, 12, warp_amt=0.3)
    val = big_v * 0.7 + small_v * 0.3
    crack = big_c
    # Painterly: posterize, then soften, then a smear of brush grain.
    val = posterize(np.clip(val, 0, 1), 7)
    val = wrap_blur(val, 1.1)
    strokes = smear(tile_noise(24, 5, 2), 3, 1, 6) - 0.5
    val = val + strokes * 0.12
    val = val * (1.0 - 0.55 * crack)
    blotch = tile_noise(4, 6, 2)
    val = val * (0.85 + 0.3 * blotch)
    val = np.clip((val - val.min()) / (val.max() - val.min()) * 0.85 + 0.15, 0, 1)

    grit = tile_noise(64, 7, 2)
    flecks = (rng.random((N, N)) > 0.985).astype(float)
    flecks = wrap_blur(flecks, 0.6) * 3.0
    g = np.clip(0.5 + (grit - 0.5) * 0.9 + flecks * 0.5, 0, 1)

    # Grass: clumps in three values, with blade strokes leaning one way.
    clumps = posterize(tile_noise(10, 8, 3), 4)
    blades = smear((rng.random((N, N)) > 0.8).astype(float), 0.4, -1.0, 5)
    grass = np.clip(0.55 + (clumps - 0.5) * 0.7 + (blades - blades.mean()) * 0.9, 0, 1)
    grass = wrap_blur(grass, 0.5)

    rgba = np.stack([val, g, crack, grass], -1)
    Image.fromarray((rgba * 255).astype(np.uint8), "RGBA").save(os.path.join(OUT, "rock_paint.png"))

    # Strata: 64 m in 512 texels (8 per metre).
    tex = np.zeros(512)
    y = 0.0
    shade = 1.0
    r = np.random.default_rng(3)
    bands = []
    while y < 64.0:
        h = r.uniform(0.5, 1.5)
        step = r.uniform(0.1, 0.2) * (1 if shade < 1.0 else -1) * (1 if r.random() < 0.8 else -1)
        shade = float(np.clip(shade + step, 0.78, 1.18))
        bands.append((y, y + h, shade))
        y += h
    for i in range(512):
        m = i / 8.0
        for (a, b, s) in bands:
            if a <= m < b:
                v = s
                if m - a < 0.08:
                    v *= 0.82   # the seam
                tex[i] = v
                break
    tex = tex / 1.25
    img = np.stack([tex, tex, tex], -1)[None, :, :]
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), "RGB").save(os.path.join(OUT, "strata.png"))
    print("wrote", os.path.join(OUT, "rock_paint.png"), "and strata.png")


if __name__ == "__main__":
    main()
