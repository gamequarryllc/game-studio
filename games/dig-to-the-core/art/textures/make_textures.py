"""Hand-painted looking textures for Dig to the Core (numpy + PIL, no stock art).

    python3 art/textures/make_textures.py

Writes textures/rock_paint.png (256 x 256, tiles seamlessly), greyscale
values the rock shader multiplies by each rock type's colour:
  R  painted rock: broad value patches laid in like a palette knife, small
     chipped facets lit from above (light top edge, dark underside), bedding
     strokes running sideways, and a few jagged joints. Low contrast on
     purpose: the strata bands and the headlamp carry the big values.
  G  fine grit and mineral flecks, for close up
  B  crack mask (1 = deep joint), sparse, so joints stay dark under the lamp
  A  painted grass: clumps in three values with blade strokes (the field)

and textures/strata.png (512 x 1): the strata bands, 64 m of them, each
0.5 to 1.5 m thick and 12 to 22 percent lighter or darker than the last.
  R  band value      G  band warmth (0.5 = as is, up = warmer, down = cooler)
  B  1 on the thin seam where two bands meet, and on the odd pebble bed
"""
import os

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "textures"))
N = 256
rng = np.random.default_rng(20261109)


def tile_noise(freq, seed, octaves=3, n=N):
    """Tileable value noise (sum of a few octaves of smoothed random grids)."""
    r = np.random.default_rng(seed)
    out = np.zeros((n, n))
    amp = 1.0
    total = 0.0
    for _ in range(octaves):
        g = r.random((freq, freq))
        big = np.tile(g, (3, 3))
        im = Image.fromarray((big * 255).astype(np.uint8)).resize((n * 3, n * 3), Image.BICUBIC)
        out += np.asarray(im, float)[n:2 * n, n:2 * n] / 255.0 * amp
        total += amp
        amp *= 0.5
        freq *= 2
    return out / total


def wrap_blur(a, radius):
    big = np.tile(a, (3, 3))
    im = Image.fromarray(np.clip(big * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(im, float)[N:2 * N, N:2 * N] / 255.0


def smear(a, dx, dy, steps):
    """Brush smear: average shifted copies along a direction (wraps)."""
    acc = np.zeros_like(a)
    for s in range(steps):
        acc += np.roll(np.roll(a, int(round(dx * s)), 1), int(round(dy * s)), 0)
    return acc / steps


def posterize(a, levels):
    return np.round(a * (levels - 1)) / (levels - 1)


def voronoi(cells, seed, warp=None, squash=1.0):
    """Tileable Voronoi: nearest and second distance, cell id, offset to the
    nearest centre. squash < 1 flattens the cells (wider than tall)."""
    r = np.random.default_rng(seed)
    pts = (np.stack(np.meshgrid(np.arange(cells), np.arange(cells), indexing="ij"), -1) + 0.5
           + (r.random((cells, cells, 2)) - 0.5) * 0.9)
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
                    dx = xs - (pts[i, j, 0] + di)
                    dy = (ys - (pts[i, j, 1] + dj)) / squash
                    d = np.sqrt(dx * dx + dy * dy)
                    closer = d < d1
                    d2 = np.where(closer, d1, np.minimum(d2, d))
                    d1 = np.where(closer, d, d1)
                    cid = np.where(closer, i * cells + j, cid)
                    off[..., 0] = np.where(closer, dx, off[..., 0])
                    off[..., 1] = np.where(closer, dy, off[..., 1])
    return d1, d2, cid, off


def chips(cells, seed, squash=0.7):
    """Small chipped facets: each a flat value, lit along its top edge and
    shaded along its underside (texture y grows downward = down the wall)."""
    warp = ((tile_noise(4, seed + 50, 2) - 0.5) * 0.7, (tile_noise(4, seed + 51, 2) - 0.5) * 0.7)
    d1, d2, cid, off = voronoi(cells, seed, warp, squash)
    r = np.random.default_rng(seed + 1)
    flat = r.uniform(-1.0, 1.0, cells * cells)[cid]
    rim = np.clip(d1 / np.maximum(d2, 1e-4), 0, 1) ** 3
    # off = point - centre: off.y < 0 is the top of the chip (lit), > 0 the underside.
    size = np.maximum(np.hypot(off[..., 0], off[..., 1]), 1e-4)
    facing = (-off[..., 1] * 0.9 - off[..., 0] * 0.3) / size
    return flat, facing * rim


def joints(seed):
    """A few jagged joints: the edges of big warped cells, but only some of
    them, broken up so they start and stop like real cracks."""
    warp = ((tile_noise(6, seed + 70, 3) - 0.5) * 1.1, (tile_noise(6, seed + 71, 3) - 0.5) * 1.1)
    d1, d2, _cid, _off = voronoi(4, seed, warp, 0.8)
    edge = d2 - d1
    width = 0.025 + 0.05 * tile_noise(10, seed + 72, 2)
    c = np.clip(1.0 - edge / width, 0, 1) ** 1.3
    keep = np.clip((tile_noise(5, seed + 73, 3) - 0.52) * 5.0, 0, 1)
    return c * keep


def main():
    os.makedirs(OUT, exist_ok=True)
    # 1. Broad value patches, laid in flat like a palette knife.
    patches = posterize(tile_noise(3, 21, 3), 5)
    patches = wrap_blur(patches, 2.0) - 0.5
    # 2. Chipped facets at two sizes.
    f_big, lit_big = chips(9, 22, 0.65)
    f_small, lit_small = chips(20, 23, 0.6)
    # 3. Bedding strokes running sideways, a little wavy.
    streak = tile_noise(32, 24, 2)
    streak = smear(streak, 5.0, 0.35, 10) - 0.5
    # 4. Fine stipple.
    stip = tile_noise(64, 25, 1) - 0.5
    val = (0.62 + 0.20 * patches + 0.05 * f_big + 0.11 * lit_big + 0.035 * f_small + 0.07 * lit_small
           + 0.16 * streak + 0.06 * stip)
    crack = joints(26)
    val = val * (1.0 - 0.5 * crack)
    # Brush grain over everything, then soften a touch.
    val = posterize(np.clip(val, 0, 1), 12)
    val = wrap_blur(val, 0.7)
    lo, hi = np.percentile(val, 1), np.percentile(val, 99.5)
    val = np.clip((val - lo) / (hi - lo) * 0.62 + 0.38, 0, 1)

    grit = tile_noise(64, 7, 2)
    flecks = (rng.random((N, N)) > 0.988).astype(float)
    flecks = wrap_blur(flecks, 0.6) * 3.0
    g = np.clip(0.5 + (grit - 0.5) * 0.9 + flecks * 0.5, 0, 1)

    # Grass: clumps in three values, with blade strokes leaning one way.
    clumps = posterize(tile_noise(10, 8, 3), 4)
    blades = smear((rng.random((N, N)) > 0.8).astype(float), 0.4, -1.0, 5)
    grass = np.clip(0.55 + (clumps - 0.5) * 0.7 + (blades - blades.mean()) * 0.9, 0, 1)
    grass = wrap_blur(grass, 0.5)

    rgba = np.stack([val, g, crack, grass], -1)
    Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA").save(os.path.join(OUT, "rock_paint.png"))

    # Strata: 64 m in 512 texels (8 per metre).
    r = np.random.default_rng(3)
    bands = []
    y = 0.0
    shade = 1.0
    warm = 0.5
    while y < 64.0:
        h = r.uniform(0.5, 1.5)
        step = r.uniform(0.12, 0.22) * (1 if shade < 1.0 else -1) * (1 if r.random() < 0.8 else -1)
        shade = float(np.clip(shade + step, 0.74, 1.22))
        warm = float(np.clip(0.5 + r.uniform(-0.45, 0.45), 0.05, 0.95))
        pebbly = r.random() < 0.18
        bands.append((y, y + h, shade, warm, pebbly))
        y += h
    tex = np.zeros((512, 3))
    for i in range(512):
        m = i / 8.0
        for (a, b, s, w, pb) in bands:
            if a <= m < b:
                seam = (m - a) < 0.09
                tex[i] = (s / 1.25 * (0.84 if seam else 1.0), w, 1.0 if (seam or pb) else 0.0)
                break
    img = tex[None, :, :]
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), "RGB").save(os.path.join(OUT, "strata.png"))
    print("wrote", os.path.join(OUT, "rock_paint.png"), "and strata.png")


if __name__ == "__main__":
    main()
