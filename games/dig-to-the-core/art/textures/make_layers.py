"""One hand-painted rock texture per layer of the planet (numpy + PIL, no stock art).

    python3 art/textures/make_layers.py [preview.png]

Writes textures/rock_layers.png: ten 256 x 256 tiles stacked top to bottom
(Topsoil first), imported by Godot as a texture array (rock_layers.png.import:
2d_array_texture, 10 vertical slices). Each tile tiles seamlessly. Channels,
as the rock shader reads them:

  R  the painted rock: value only, the layer's own way of breaking
  G  where the layer's second rock shows (loam in the dirt, red clay lenses,
     pink granite, shell beds, bone cobbles, agate, magma rock, peridotite...)
  B  the layer's lines: dark joints and partings in the upper layers, bright
     quartz veins in the Crystal Caves, glowing cracks and seams from the Lava
     Lakes down (the shader decides which, per layer)
  A  fine grit and sparkle, for close up

Every layer is painted differently on purpose, so no two layers share a
pattern: crumbly peds and root hairs, smeared laminated clay, blocky jointed
granite, cross-bedded sandstone with shell hash, a cobble conglomerate,
faceted crystal rock with veins, vesicular basalt with a cracked crust,
folded granular peridotite, streaming molten iron, big core crystals.
With a path argument it also writes a preview sheet of all ten.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "textures"))
N = 256
YS, XS = np.mgrid[0:N, 0:N].astype(float)


# --- Helpers ------------------------------------------------------------------------------------
def tile_noise(freq, seed, octaves=3, fx=None):
    """Tileable value noise. fx: cells across (defaults to freq), so the grain
    can be stretched (fx < freq makes it wide)."""
    r = np.random.default_rng(seed)
    out = np.zeros((N, N))
    amp = 1.0
    total = 0.0
    fy = freq
    fxx = fx if fx is not None else freq
    for _ in range(octaves):
        g = r.random((fy, fxx))
        big = np.tile(g, (3, 3))
        im = Image.fromarray((big * 255).astype(np.uint8)).resize((N * 3, N * 3), Image.BICUBIC)
        out += np.asarray(im, float)[N:2 * N, N:2 * N] / 255.0 * amp
        total += amp
        amp *= 0.5
        fy *= 2
        fxx *= 2
    return out / total


def blur(a, radius):
    return gaussian_filter(np.asarray(a, float), radius, mode="wrap")


def smear(a, dx, dy, steps):
    acc = np.zeros_like(a)
    for s in range(steps):
        acc += np.roll(np.roll(a, int(round(dx * s)), 1), int(round(dy * s)), 0)
    return acc / steps


def posterize(a, levels):
    return np.round(np.clip(a, 0, 1) * (levels - 1)) / (levels - 1)


def norm(a, lo_p=1.0, hi_p=99.0):
    lo, hi = np.percentile(a, lo_p), np.percentile(a, hi_p)
    return np.clip((a - lo) / max(hi - lo, 1e-6), 0, 1)


def roll_sample(a, ox, oy):
    """a sampled at (x + ox, y + oy) with wrap (nearest)."""
    xi = (XS + ox).astype(int) % N
    yi = (YS + oy).astype(int) % N
    return a[yi, xi]


def vor(cx, cy, seed, jitter=0.85, warp=0.0, warp_seed=None):
    """Tileable Voronoi on a cx x cy grid of jittered points, checked over the
    3 x 3 neighbouring cells. Returns (d1, d2, cell id, offset x, offset y) in
    pixels (offset = pixel - nearest centre)."""
    r = np.random.default_rng(seed)
    px = (np.arange(cx)[None, :] + 0.5 + (r.random((cy, cx)) - 0.5) * jitter)
    py = (np.arange(cy)[:, None] + 0.5 + (r.random((cy, cx)) - 0.5) * jitter)
    sx, sy = N / cx, N / cy
    x = XS / sx
    y = YS / sy
    if warp > 0:
        ws = warp_seed if warp_seed is not None else seed + 99
        x = x + (tile_noise(4, ws, 2) - 0.5) * warp * cx / 6
        y = y + (tile_noise(4, ws + 1, 2) - 0.5) * warp * cy / 6
    ix = np.floor(x).astype(int)
    iy = np.floor(y).astype(int)
    d1 = np.full((N, N), 1e9)
    d2 = np.full((N, N), 1e9)
    cid = np.zeros((N, N), int)
    ofx = np.zeros((N, N))
    ofy = np.zeros((N, N))
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            jx = ix + di
            jy = iy + dj
            wx = jx % cx
            wy = jy % cy
            cxp = px[wy, wx] + (jx - wx)
            cyp = py[wy, wx] + (jy - wy)
            dx = (x - cxp) * sx
            dy = (y - cyp) * sy
            d = np.sqrt(dx * dx + dy * dy)
            closer = d < d1
            d2 = np.where(closer, d1, np.minimum(d2, d))
            d1 = np.where(closer, d, d1)
            cid = np.where(closer, wy * cx + wx, cid)
            ofx = np.where(closer, dx, ofx)
            ofy = np.where(closer, dy, ofy)
    return d1, d2, cid, ofx, ofy


def chips(cx, cy, seed, warp=0.6, sharp=3.0):
    """Chipped facets: a flat value per chip, the top edge lit and the
    underside shaded (light from above, as the headlamp sits above the work)."""
    d1, d2, cid, ofx, ofy = vor(cx, cy, seed, warp=warp)
    r = np.random.default_rng(seed + 7)
    flat = r.uniform(-1, 1, cx * cy)[cid]
    rim = np.clip(d1 / np.maximum(d2, 1e-4), 0, 1) ** sharp
    size = np.maximum(np.hypot(ofx, ofy), 1e-4)
    facing = (-ofy * 0.9 - ofx * 0.35) / size
    edge = np.clip(1.0 - (d2 - d1) / 2.2, 0, 1)
    return flat, facing * rim, edge, cid


class Canvas:
    """A 3x3 tiled drawing surface: strokes drawn in the middle tile that run
    over an edge wrap round, so the result tiles. Values are floats 0..1 on a
    mid grey; draw() adds."""

    def __init__(self, base=0.0):
        self.im = Image.new("F", (N * 3, N * 3), base)
        self.d = ImageDraw.Draw(self.im)

    def line(self, pts, value, width):
        for ox in (0, N, -N):
            for oy in (0, N, -N):
                self.d.line([(x + N + ox, y + N + oy) for (x, y) in pts], fill=value, width=width, joint="curve")

    def ellipse(self, cx, cy, rx, ry, value):
        for ox in (0, N, -N):
            for oy in (0, N, -N):
                x = cx + N + ox
                y = cy + N + oy
                self.d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=value)

    def arc(self, cx, cy, r, a0, a1, value, width):
        for ox in (0, N, -N):
            for oy in (0, N, -N):
                x = cx + N + ox
                y = cy + N + oy
                self.d.arc([x - r, y - r, x + r, y + r], a0, a1, fill=value, width=width)

    def polygon(self, pts, value):
        for ox in (0, N, -N):
            for oy in (0, N, -N):
                self.d.polygon([(x + N + ox, y + N + oy) for (x, y) in pts], fill=value)

    def get(self):
        return np.asarray(self.im, float)[N:2 * N, N:2 * N].copy()


def walk(rng, start, steps, step_len, turn, bias=(0.0, 1.0)):
    p = np.array(start, float)
    a = math.atan2(bias[1], bias[0]) + rng.uniform(-0.6, 0.6)
    pts = [tuple(p)]
    for _ in range(steps):
        a += rng.uniform(-turn, turn)
        a = a * 0.85 + math.atan2(bias[1], bias[0]) * 0.15
        p = p + np.array([math.cos(a), math.sin(a)]) * step_len
        pts.append(tuple(p))
    return pts


def lit_blobs(mask_soft):
    """Gives soft blobs a light top and a shaded underside (a painter's
    sphere): the derivative of the mask down the wall."""
    up = roll_sample(mask_soft, 0, -2)
    down = roll_sample(mask_soft, 0, 2)
    return (down - up)  # >0 near the top edge of a blob (lit), <0 underneath


def finish(val, levels=12, soft=0.6, lo=0.32, span=0.66):
    """Brush banding (a limited set of values) then a light soften, mapped
    into a mid range: the strata and the lamp carry the big values."""
    v = norm(val, 0.8, 99.4)
    v = posterize(v, levels)
    v = blur(v, soft)
    return np.clip(lo + v * span, 0, 1)


def grit(seed, amount=1.0):
    g = tile_noise(64, seed, 2)
    r = np.random.default_rng(seed)
    spk = (r.random((N, N)) > 0.985).astype(float)
    return np.clip(0.5 + (g - 0.5) * 0.8 * amount + blur(spk, 0.5) * 2.0, 0, 1)


# --- The ten layers ----------------------------------------------------------------------------
def topsoil():
    """Crumbly dark soil: rounded peds lit on top, little dark crumbs, pale
    root hairs wandering down, a few small stones. G = loam pockets."""
    rng = np.random.default_rng(100)
    patches = posterize(tile_noise(4, 101, 3), 5) - 0.5
    flat, lit, edge, _ = chips(11, 10, 102, warp=1.2, sharp=2.0)
    crumbs_d1, crumbs_d2, cid, _, _ = vor(30, 30, 103)
    crumb = ((np.random.default_rng(104).random(900)[cid] < 0.16) & (crumbs_d1 < 2.4 + 1.2 * tile_noise(16, 107, 1))).astype(float)
    val = 0.5 + 0.22 * patches + 0.07 * flat + 0.13 * lit - 0.08 * blur(crumb, 0.9) - 0.08 * edge
    roots = Canvas()
    shadow = Canvas()
    for _ in range(16):
        pts = walk(rng, (rng.uniform(0, N), rng.uniform(0, N)), int(rng.integers(8, 22)), rng.uniform(5, 9), 0.7, (rng.uniform(-0.4, 0.4), 1.0))
        w = int(rng.integers(1, 3))
        roots.line(pts, 1.0, w)
        shadow.line([(x + 1, y + 1.5) for x, y in pts], 1.0, w + 1)
    root = roots.get()
    val = val - 0.14 * np.clip(shadow.get() - root, 0, 1) + 0.3 * root
    stones = Canvas()
    for _ in range(14):
        x, y = rng.uniform(0, N), rng.uniform(0, N)
        rx = rng.uniform(2.5, 6)
        stones.ellipse(x, y, rx, rx * rng.uniform(0.6, 0.9), 1.0)
    st = blur(stones.get(), 0.8)
    val = val + 0.18 * st + 0.25 * lit_blobs(st)
    loam = np.clip((blur(tile_noise(3, 105, 3), 3) - 0.52) * 6, 0, 1)
    val = val - 0.05 * loam
    b = blur(crumb, 0.5) * 0.15
    return finish(val, 11), loam, np.clip(b, 0, 1), grit(106, 0.7)


def clay():
    """Smooth laminated clay: fine wavy laminae, long knife-smeared strokes
    laid sideways, a few round concretions. G = lenses of red clay; B = the
    odd thin parting. No cracks: clay down here is wet."""
    rng = np.random.default_rng(200)
    warp = (tile_noise(3, 201, 3) - 0.5) * 18
    lam = np.sin((YS + warp) / N * math.tau * 15)
    lam2 = np.sin((YS + warp * 1.4) / N * math.tau * 38)
    knife = smear(tile_noise(16, 202, 2, fx=4), 9.0, 0.25, 16) - 0.5
    patches = posterize(tile_noise(3, 203, 2, fx=2), 4) - 0.5
    val = 0.55 + 0.05 * lam + 0.025 * lam2 + 0.22 * knife + 0.12 * patches
    # Spatula strokes: a few short smeared marks catching the light.
    strokes = Canvas()
    for _ in range(26):
        x, y = rng.uniform(0, N), rng.uniform(0, N)
        L = rng.uniform(14, 40)
        a = rng.uniform(-0.15, 0.15)
        strokes.line([(x, y), (x + L * math.cos(a), y + L * math.sin(a))], 1.0, int(rng.integers(2, 5)))
    stv = blur(strokes.get(), 1.0)
    val = val + 0.08 * stv + 0.12 * lit_blobs(stv)
    nod = Canvas()
    for _ in range(5):
        x, y = rng.uniform(0, N), rng.uniform(0, N)
        r = rng.uniform(6, 12)
        nod.ellipse(x, y, r * 1.25, r, 1.0)
    nv = blur(nod.get(), 1.5)
    val = val + 0.08 * nv + 0.35 * lit_blobs(nv)
    lens = tile_noise(3, 204, 3, fx=1)
    lens = np.clip((blur(lens, 2) - 0.55) * 7, 0, 1)
    part = Canvas()
    for k in range(3):
        y0 = rng.uniform(0, N)
        pts = [(x, y0 + 3 * math.sin(x / N * math.tau * 2 + k) + float(warp[int(y0) % N, int(x) % N]) * 0.4) for x in np.linspace(-10, N + 10, 40)]
        part.line(pts, 1.0, 1)
    pv = part.get() * np.clip((tile_noise(6, 205, 2) - 0.4) * 4, 0, 1)
    val = val - 0.12 * pv
    return finish(val, 14, 0.8), lens, np.clip(pv, 0, 1), grit(206, 0.35)


def bedrock():
    """Blocky grey stone and pink granite: big angular facets, salt-and-pepper
    crystals, and two sets of straight joints that start and stop. G = the
    granite; B = joints."""
    rng = np.random.default_rng(300)
    flat, lit, edge, cid = chips(6, 5, 301, warp=0.3, sharp=3.5)
    flat2, lit2, edge2, _ = chips(15, 14, 302, warp=0.2, sharp=4.0)
    val = 0.55 + 0.1 * flat + 0.1 * lit + 0.04 * flat2 + 0.05 * lit2
    r = rng.random((N, N))
    mica = (r < 0.05).astype(float)
    feld = (r > 0.965).astype(float)
    big = np.clip(blur((rng.random((N, N)) < 0.012).astype(float), 1.2) * 6, 0, 1)
    val = val - 0.22 * blur(mica, 0.45) + 0.2 * blur(feld, 0.45) + 0.12 * big
    joints = np.zeros((N, N))
    for (a, b, seed, wid) in ((1, 4, 303, 1.6), (5, -1, 304, 1.2), (2, -7, 305, 0.9)):
        t = (a * XS + b * YS) / N + (tile_noise(5, seed, 2) - 0.5) * 0.12
        f = np.abs(((t + 0.5) % 1.0) - 0.5) * N / math.hypot(a, b)
        line = np.clip(1.0 - f / wid, 0, 1)
        keep = np.clip((tile_noise(4, seed + 1, 3) - 0.47) * 5, 0, 1)
        joints = np.maximum(joints, line * keep)
    lip = roll_sample(joints, 0, 2)
    val = val - 0.3 * joints + 0.1 * np.clip(lip - joints, 0, 1)
    granite = np.clip((blur(tile_noise(3, 306, 3), 2) - 0.5) * 5, 0, 1)
    return finish(val, 13, 0.5), granite, np.clip(joints, 0, 1), grit(307, 1.2)


def fossil_bed():
    """Cross-bedded sandstone: sets of fine diagonal laminae, each set's
    laminae dipping the other way, cut off by wavy bounding surfaces; shell
    hash scattered through. G = shell beds (pale); B = the bounding surfaces."""
    rng = np.random.default_rng(400)
    bounds = [0.0]
    while bounds[-1] < N:
        bounds.append(bounds[-1] + rng.uniform(40, 80))
    bounds[-1] = N
    wav = (tile_noise(4, 401, 2) - 0.5) * 16
    yy = (YS + wav) % N
    val = np.zeros((N, N))
    setid = np.zeros((N, N), int)
    for i in range(len(bounds) - 1):
        m = (yy >= bounds[i]) & (yy < bounds[i + 1])
        setid[m] = i
        ang = math.radians(rng.uniform(18, 32)) * (1 if i % 2 else -1)
        sp = rng.uniform(5.5, 8.5)
        # Laminae curve down into the bottom of the set (tangential, like dunes).
        rel = (yy - bounds[i]) / max(bounds[i + 1] - bounds[i], 1)
        t = (XS * math.sin(ang) + (yy - bounds[i]) * math.cos(ang) * (1.0 - 0.45 * rel)) / sp
        lam = np.sin(t * math.tau) * 0.5 + 0.5
        val = np.where(m, 0.55 + 0.11 * (lam - 0.5) + 0.06 * (i % 3 - 1), val)
    bnd = np.zeros((N, N))
    for b in bounds[1:-1]:
        bnd = np.maximum(bnd, np.clip(1.0 - np.abs(yy - b) / 1.3, 0, 1))
    val = val - 0.22 * bnd + 0.08 * np.clip(roll_sample(bnd, 0, 2) - bnd, 0, 1)
    val = val + 0.14 * (posterize(tile_noise(4, 402, 2), 4) - 0.5) + 0.08 * (smear(tile_noise(24, 403, 2), 4, 0.5, 8) - 0.5)
    shells = Canvas()
    shade = Canvas()
    for _ in range(70):
        x, y = rng.uniform(0, N), rng.uniform(0, N)
        r = rng.uniform(2.5, 7.0)
        a0 = rng.uniform(150, 230)
        a1 = a0 + rng.uniform(70, 160)
        w = 1 if r < 4.5 else 2
        shells.arc(x, y, r, a0, a1, 1.0, w)
        shade.arc(x, y + 1.2, r, a0, a1, 1.0, w + 1)
    sh = shells.get()
    val = val + 0.32 * sh - 0.12 * np.clip(shade.get() - sh, 0, 1)
    beds = np.clip((blur(tile_noise(2, 404, 2, fx=1), 2) - 0.5) * 5, 0, 1)
    beds = np.maximum(beds, np.clip(blur(sh, 2.5) * 2.0 - 0.3, 0, 1) * 0.6)
    return finish(val, 13, 0.55), beds, np.clip(bnd, 0, 1), grit(405, 1.0)


def graveyard():
    """A cobble conglomerate in ochre: rounded clasts of every size packed in
    a gritty matrix, each lit on top with a dark contact rim and a cast
    shadow underneath. G = pale bone-bed cobbles; B = the contact rims."""
    rng = np.random.default_rng(500)
    matrix = 0.45 + 0.1 * (tile_noise(32, 501, 2) - 0.5) + 0.08 * (posterize(tile_noise(4, 502, 2), 4) - 0.5)
    body = Canvas(0.0)
    rimc = Canvas(0.0)
    shad = Canvas(0.0)
    bone = Canvas(0.0)
    ids = Canvas(0.0)
    placed = []
    tries = 0
    while len(placed) < 30 and tries < 3000:
        tries += 1
        r = rng.uniform(6, 18) if rng.random() < 0.55 else rng.uniform(2.5, 6)
        x, y = rng.uniform(0, N), rng.uniform(0, N)
        ok = True
        for (px, py, pr) in placed:
            dx = min(abs(x - px), N - abs(x - px))
            dy = min(abs(y - py), N - abs(y - py))
            if math.hypot(dx, dy) < (r + pr) * 1.25:
                ok = False
                break
        if not ok:
            continue
        placed.append((x, y, r))
        ry = r * rng.uniform(0.6, 0.85)
        shad.ellipse(x + 1.5, y + ry * 0.45, r * 1.04, ry, 1.0)
        rimc.ellipse(x, y, r + 1.4, ry + 1.4, 1.0)
        v = rng.uniform(0.25, 1.0)
        ids.ellipse(x, y, r, ry, v)
        body.ellipse(x, y, r, ry, 1.0)
        if rng.random() < 0.28:
            bone.ellipse(x, y, r, ry, 1.0)
    bd = body.get()
    soft = blur(bd, 2.5)
    shade_in = lit_blobs(blur(bd, 3.5)) * 2.2      # lit top, shaded bottom inside each cobble
    cob = ids.get()
    rim = np.clip(rimc.get() - bd, 0, 1)
    sh = np.clip(blur(shad.get(), 1.5) - bd, 0, 1)
    grain = tile_noise(40, 504, 2) - 0.5
    val = np.where(bd > 0.5, 0.4 + 0.22 * cob + 0.2 * shade_in + 0.05 * grain, matrix - 0.12 * sh)
    val = val - 0.07 * rim
    val = val + 0.1 * (posterize(tile_noise(3, 505, 2), 4) - 0.5)
    gr = np.clip(bone.get(), 0, 1)
    return finish(val, 12, 0.6), blur(gr, 0.8), np.clip(rim + sh * 0.5, 0, 1), grit(503, 1.1)


def crystal_caves():
    """Dark crystalline rock in hard facets, threaded with thin bright quartz
    veins that branch; agate banding where the geode shell shows. G = agate
    (the geode shell); B = the veins (they glint)."""
    rng = np.random.default_rng(600)
    d1, d2, cid, ofx, ofy = vor(9, 9, 601, jitter=0.95)
    r = np.random.default_rng(602)
    fa = r.uniform(0, math.tau, 81)[cid]
    fv = r.uniform(-1, 1, 81)[cid]
    # Each facet is a flat plane tilted its own way: a crisp polygon.
    tilt = (np.cos(fa) * ofx + np.sin(fa) * ofy) / 30.0
    edge = np.clip(1.0 - (d2 - d1) / 1.6, 0, 1)
    val = 0.42 + 0.14 * fv + 0.12 * np.clip(tilt, -1, 1) + 0.14 * edge * (np.sin(fa) > 0)
    d1b, d2b, cidb, _, _ = vor(22, 22, 603)
    val = val + 0.05 * np.random.default_rng(604).uniform(-1, 1, 484)[cidb]
    veins = Canvas()
    for _ in range(5):
        x, y = rng.uniform(0, N), rng.uniform(0, N)
        a = rng.uniform(0, math.pi)
        pts = [(x, y)]
        for k in range(int(rng.integers(4, 9))):
            a += rng.uniform(-0.35, 0.35)
            L = rng.uniform(10, 26)
            x, y = x + math.cos(a) * L, y + math.sin(a) * L
            pts.append((x, y))
            if rng.random() < 0.3:
                b = a + rng.choice([-1, 1]) * rng.uniform(0.5, 1.0)
                veins.line([(x, y), (x + math.cos(b) * L * 0.8, y + math.sin(b) * L * 0.8)], 1.0, 1)
        veins.line(pts, 1.0, 1)
    vn = blur(np.clip(veins.get(), 0, 1), 0.6) * 0.8
    halo = blur(vn, 1.5)
    val = val + 0.25 * vn + 0.06 * halo
    agate = np.zeros((N, N))
    for _ in range(3):
        cx, cy = rng.uniform(0, N), rng.uniform(0, N)
        dx = (XS - cx + N / 2) % N - N / 2
        dy = (YS - cy + N / 2) % N - N / 2
        rr = np.hypot(dx * 1.2, dy) + (tile_noise(6, int(rng.integers(1000)), 2) - 0.5) * 14
        rad = rng.uniform(16, 26)
        inside = np.clip((rad - rr) / 4, 0, 1)
        bands = 0.5 + 0.5 * np.sin(rr / 3.2)
        agate = np.maximum(agate, inside)
        val = np.where(inside > 0.5, val * 0.85 + 0.1 * bands + 0.03, val)
    sp = grit(605, 0.6)
    sp = np.maximum(sp, (np.random.default_rng(606).random((N, N)) > 0.992).astype(float))
    return finish(val, 12, 0.35, 0.28, 0.7), agate, vn, sp


def lava_lakes():
    """Black vesicular basalt: gas holes lit on their lower lip, ropy folds
    from when it flowed, and a crust broken by jagged cracks with a warm
    halo. G = where the magma rock (the hot stuff) comes up; B = the cracks
    (the shader makes them glow)."""
    rng = np.random.default_rng(700)
    warp = (tile_noise(3, 701, 3) - 0.5) * 40
    ropes = np.sin((YS + warp + 6 * np.sin(XS / N * math.tau * 3)) / N * math.tau * 9)
    val = 0.45 + 0.07 * ropes + 0.14 * (posterize(tile_noise(4, 702, 2), 5) - 0.5)
    flat, lit, edge, _ = chips(8, 7, 703, warp=0.8, sharp=2.2)
    val = val + 0.05 * flat + 0.1 * lit
    holes = Canvas()
    for _ in range(140):
        x, y = rng.uniform(0, N), rng.uniform(0, N)
        r = rng.uniform(1.2, 4.5) if rng.random() < 0.85 else rng.uniform(4.5, 7)
        holes.ellipse(x, y, r * 1.2, r, 1.0)
    h = holes.get()
    hs = blur(h, 0.8)
    val = val - 0.32 * h + 0.3 * np.clip(-lit_blobs(hs), 0, 1)   # dark hole, lit lower lip
    d1, d2, cid, _, _ = vor(5, 5, 704, warp=1.6)
    crack = np.clip(1.0 - (d2 - d1) / (1.4 + 1.6 * tile_noise(10, 705, 2)), 0, 1)
    keep = np.clip((tile_noise(4, 706, 3) - 0.35) * 4, 0, 1)
    d1s, d2s, _, _, _ = vor(12, 12, 707, warp=1.2)
    fine = np.clip(1.0 - (d2s - d1s) / 1.0, 0, 1) * np.clip((tile_noise(5, 708, 2) - 0.55) * 4, 0, 1)
    cr = np.clip(crack * keep + fine * 0.7, 0, 1)
    halo = blur(cr, 3.5)
    val = val - 0.35 * cr
    magma = np.clip(blur(halo, 6) * 2.4 - 0.15, 0, 1)
    glow = np.clip(cr + 0.35 * halo, 0, 1)
    return finish(val, 11, 0.5, 0.22, 0.7), magma, glow, grit(709, 0.9)


def mantle():
    """Folded granular peridotite: rounded grains lit on top, swirled into
    flow folds, thin hot seams running along some fold lines. G = the green
    peridotite bands (the rest is the orange mantle rock); B = the seams."""
    rng = np.random.default_rng(800)
    w1 = (tile_noise(2, 801, 3) - 0.5) * 2.0
    w2 = (tile_noise(3, 802, 2) - 0.5) * 1.2
    fold = np.sin(math.tau * (YS / N * 4 + 0.55 * np.sin(math.tau * (XS / N * 2 + w2)) + w1))
    d1, d2, cid, ofx, ofy = vor(30, 30, 803, jitter=0.9)
    grain_v = np.random.default_rng(804).uniform(-1, 1, 900)[cid]
    rad = np.clip(1.0 - d1 / 6.0, 0, 1)
    gl = (-ofy * 0.8 - ofx * 0.3) / np.maximum(np.hypot(ofx, ofy), 1e-3) * rad
    gedge = np.clip(1.0 - (d2 - d1) / 1.4, 0, 1)
    val = 0.5 + 0.1 * fold + 0.08 * grain_v + 0.14 * gl - 0.14 * gedge
    val = val + 0.1 * (posterize(tile_noise(3, 805, 2), 4) - 0.5)
    perid = np.clip((fold - 0.25) * 2.5, 0, 1)
    seam = np.clip(1.0 - np.abs(fold + 0.55) / 0.07, 0, 1)
    seam = seam * np.clip((tile_noise(5, 806, 3) - 0.45) * 5, 0, 1)
    seam = np.maximum(seam, gedge * np.clip((tile_noise(8, 807, 2) - 0.7) * 6, 0, 1) * 0.6)
    val = val - 0.25 * seam
    return finish(val, 12, 0.5), perid, np.clip(seam + 0.25 * blur(seam, 2.5), 0, 1), grit(808, 0.9)


def outer_core():
    """Molten iron, streaming: long flow streaks bent by eddies, a dull skin
    wrinkling across the flow, and bright channels where it runs hottest.
    G = nickel streaks; B = the hot channels."""
    w = (tile_noise(3, 901, 3) - 0.5) * 30
    yy = YS + w + 10 * np.sin(XS / N * math.tau * 2)
    streak = tile_noise(28, 902, 3, fx=3)
    streak = roll_sample(streak, 0, 0)
    flow = np.sin(yy / N * math.tau * 11) * 0.5 + 0.5
    s2 = smear(tile_noise(20, 903, 2, fx=5), 7, 0.0, 12)
    wrinkle = np.sin((XS + (tile_noise(6, 904, 2) - 0.5) * 30) / N * math.tau * 40) * np.clip((s2 - 0.45) * 3, 0, 1)
    val = 0.5 + 0.18 * (s2 - 0.5) + 0.1 * (flow - 0.5) + 0.06 * wrinkle + 0.08 * (streak - 0.5)
    hot = np.clip((np.sin(yy / N * math.tau * 5 + s2 * 4) - 0.55) * 3.0, 0, 1)
    hot = hot * np.clip((tile_noise(4, 905, 2) - 0.3) * 3, 0, 1)
    nickel = np.clip((s2 - 0.55) * 6, 0, 1)
    val = val + 0.2 * hot
    return finish(val, 12, 0.7), nickel, np.clip(hot + 0.3 * blur(hot, 3), 0, 1), grit(906, 0.5)


def inner_core():
    """The heart of the planet: a dark bronze crust of interlocking crystals,
    each face flat with fine growth lines at its own angle and a lit top edge,
    split by a few winding channels of molten amber that pool here and there.
    G = the paler core crystal; B = the molten channels (they glow)."""
    d1, d2, cid, ofx, ofy = vor(9, 9, 1001, jitter=0.9, warp=0.5)
    r = np.random.default_rng(1002)
    ang = r.uniform(0, math.pi, 81)[cid]
    fv = r.uniform(-1, 1, 81)[cid]
    lines = np.sin((XS * np.cos(ang) + YS * np.sin(ang)) / 2.6)
    face = (-ofy * 0.9 - ofx * 0.4) / np.maximum(np.hypot(ofx, ofy), 1e-3)
    edge = d2 - d1
    top = np.clip(1.0 - edge / 3.0, 0, 1) * (face > 0.2)
    val = 0.45 + 0.16 * fv + 0.05 * lines + 0.2 * top
    w = (tile_noise(3, 1003, 3) - 0.5) * 50
    chan = np.abs(np.sin((YS + w + 14 * np.sin(XS / N * math.tau * 2)) / N * math.tau * 3))
    flow = np.clip(1.0 - chan / 0.09, 0, 1) * np.clip((tile_noise(4, 1004, 2) - 0.3) * 3, 0, 1)
    pools = np.clip((blur(tile_noise(5, 1005, 2), 2) - 0.66) * 8, 0, 1)
    seam = np.clip(1.0 - edge / 1.2, 0, 1) * np.clip((tile_noise(6, 1006, 2) - 0.6) * 4, 0, 1) * 0.6
    molten = np.clip(flow + pools + seam, 0, 1)
    val = val * (1 - 0.5 * molten) + 0.3 * molten
    crystal = (r.random(81)[cid] < 0.4).astype(float)
    return finish(val, 12, 0.45), blur(crystal, 1.0), np.clip(molten + 0.3 * blur(molten, 3.0), 0, 1), grit(1007, 0.6)


LAYERS = [topsoil, clay, bedrock, fossil_bed, graveyard, crystal_caves, lava_lakes, mantle, outer_core, inner_core]


def main():
    tiles = []
    for fn in LAYERS:
        r, g, b, a = fn()
        tiles.append(np.stack([r, g, b, a], -1))
        print("painted", fn.__name__)
    sheet = np.concatenate(tiles, 0)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "rock_layers.png")
    Image.fromarray((np.clip(sheet, 0, 1) * 255).astype(np.uint8), "RGBA").save(path)
    print("wrote", path)
    if len(sys.argv) > 1:
        # Preview: each layer's value, tinted roughly by its two rocks, 2x2 tiled.
        tints = [((0.43, 0.29, 0.17), (0.3, 0.2, 0.12)), ((0.64, 0.39, 0.25), (0.56, 0.27, 0.19)),
                 ((0.44, 0.43, 0.43), (0.62, 0.52, 0.5)), ((0.68, 0.55, 0.42), (0.8, 0.74, 0.62)),
                 ((0.6, 0.43, 0.24), (0.84, 0.8, 0.7)), ((0.3, 0.25, 0.42), (0.5, 0.38, 0.62)),
                 ((0.16, 0.14, 0.14), (0.4, 0.13, 0.05)), ((0.62, 0.3, 0.12), (0.42, 0.48, 0.18)),
                 ((0.8, 0.45, 0.14), (0.9, 0.62, 0.3)), ((0.75, 0.55, 0.25), (0.95, 0.85, 0.6))]
        glow = [None, None, None, None, None, (0.8, 0.95, 1.0), (1.0, 0.45, 0.1), (1.0, 0.5, 0.15), (1.0, 0.7, 0.25), (1.0, 0.8, 0.35)]
        cells = []
        for i, t in enumerate(tiles):
            a = np.array(tints[i][0])
            bcol = np.array(tints[i][1])
            col = (a[None, None, :] * (1 - t[..., 1:2]) + bcol[None, None, :] * t[..., 1:2]) * (t[..., 0:1] * 1.6)
            if glow[i] is not None:
                col = col * (1 - 0.6 * t[..., 2:3]) + np.array(glow[i])[None, None, :] * t[..., 2:3] * 0.9
            else:
                col = col * (1 - 0.4 * t[..., 2:3])
            cells.append(np.tile(np.clip(col, 0, 1), (2, 2, 1)))
        rows = [np.concatenate(cells[i:i + 5], 1) for i in (0, 5)]
        prev = np.concatenate(rows, 0)
        Image.fromarray((prev * 255).astype(np.uint8)).save(sys.argv[1])
        print("preview", sys.argv[1])


if __name__ == "__main__":
    main()
