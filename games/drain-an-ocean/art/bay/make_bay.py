#!/usr/bin/env python3
"""Builds the bay: the seabed heightmap, its painted vertex colours, the pool
merge tree, every hand-placed landmark and the land round it, into
data/bay.json.

    python3 art/bay/make_bay.py [--preview out.png]

The bay is drawn the way a hydrographer draws a chart: by hand-placed
isobaths. Each depth contour (the old shoreline, 3, 7, 11, 15 and 20 m) is a
closed spline through points chosen here, and the seabed between two
contours is interpolated from the distances to them, then softened, so the
shelves are wide where the chart says wide and steep where it says steep, and
nothing is a circle. On top of that come the designed features, each a
smooth shape: the drowned river canyon that runs from the river mouth down
to the lost town, the reef knolls, the sandbars, the delta fan, eleven pools
with modelled lips, the west headland's cliffs, the rocky point and the sea
wall's footing. Noise only adds a few centimetres of wear. Godot never
generates terrain: it loads this file, so a change here is a change to the
level.

World axes (Godot): x east, z south, y up. The camera looks north from the
town. Bay grid: N x N cells of S metres, vertices (N+1)^2, index = j * W + i.
The land beyond the grid is a second, coarser grid ("far") built from the same
height function, so the two meet without a seam.

What the merge tree is for. As one water level falls, the water splits into
separate bodies where the seabed has rims. Processing vertices from lowest to
highest with a union-find gives a tree: each node is a connected body of
water for a range of levels [low, high). Below `low` it splits into its
children (or empties, for a leaf). At runtime a body is (node, level), so the
game never flood-fills: splits happen exactly at the precomputed heights.
Before the tree is built, every unplanned dimple is filled (priority flood
from the deepest point), so the only pools are the designed ones.
"""
import argparse
import base64
import heapq
import json
import math
import os

import numpy as np
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "data", "bay.json"))

N = 256
S = 0.5
W = N + 1
X0 = -64.0
Z0 = -64.0
FAR_N = 150
FAR_S = 3.0
FAR_X0 = -225.0
FAR_Z0 = -225.0

# --- Palette (art bible) and mixes ---------------------------------------------------------
SW = {
    "teal": (0x0F, 0x4C, 0x5C), "shoal": (0x4F, 0xA8, 0x9B), "sand": (0xE3, 0xC4, 0x8F),
    "paper": (0xF3, 0xEA, 0xD3), "coral": (0xE0, 0x60, 0x3F), "rust": (0x8C, 0x44, 0x25),
    "ink": (0x1C, 0x2A, 0x33),
}
SW = {k: np.array(v, dtype=np.float64) / 255.0 for k, v in SW.items()}


def mix(a, b, t):
    a = SW[a] if isinstance(a, str) else a
    b = SW[b] if isinstance(b, str) else b
    return a + (b - a) * t


COL = {
    "beach": mix(mix("sand", "paper", 0.30), "ink", 0.04),
    "beach_wet": mix(mix("sand", "paper", 0.12), "ink", 0.12),
    "flat_sand": mix(mix("sand", "paper", 0.18), "ink", 0.12),
    "kelp_sand": mix(mix(mix("sand", "paper", 0.08), "ink", 0.24), "shoal", 0.06),
    "kelp_stain": mix(mix("shoal", "rust", 0.5), "ink", 0.38),
    "reef_sand": mix(mix("sand", "paper", 0.12), "ink", 0.2),
    "reef_rock": mix(mix("sand", "rust", 0.34), "ink", 0.3),
    "coral_crust": mix(mix("coral", "sand", 0.55), "ink", 0.16),
    "silt": mix(mix(mix("sand", "paper", 0.1), "ink", 0.38), "rust", 0.05),
    "rust_halo": mix(mix("rust", "sand", 0.25), "ink", 0.22),
    "trench": mix(mix("teal", "ink", 0.4), "sand", 0.2),
    "canyon_rock": mix(mix("ink", "sand", 0.32), "teal", 0.12),
    "town_floor": mix(mix("paper", "sand", 0.5), "ink", 0.2),
    "street": mix(mix("paper", "sand", 0.3), "ink", 0.08),
    "grass": mix(mix("shoal", "sand", 0.42), "ink", 0.34),
    "grass_lush": mix(mix("shoal", "sand", 0.3), "ink", 0.42),
    "grass_dry": mix(mix(mix("sand", "paper", 0.15), "shoal", 0.28), "ink", 0.18),
    "dune": mix(mix("sand", "paper", 0.22), "shoal", 0.1),
    "cliff": mix(mix("sand", "ink", 0.42), "rust", 0.12),
    "cliff_dark": mix(mix("sand", "ink", 0.58), "rust", 0.1),
    "rock_point": mix(mix("paper", "ink", 0.45), "sand", 0.18),
    "wall": mix(mix("paper", "ink", 0.36), "sand", 0.22),
    "wrack": mix(mix("rust", "ink", 0.45), "shoal", 0.12),
    "outer": mix(mix("sand", "ink", 0.45), "teal", 0.2),
    "road": mix(mix("paper", "ink", 0.3), "sand", 0.35),
    "field_a": mix(mix("shoal", "sand", 0.55), "ink", 0.3),
    "field_b": mix(mix("sand", "shoal", 0.3), "ink", 0.18),
    "hedge": mix(mix("shoal", "ink", 0.55), "rust", 0.08),
}

# --- Rings (depth bands, metres below the old sea level) ----------------------------------------
RINGS = [("Sandbars", 0.0, 3.0), ("Kelp forest", 3.0, 7.0), ("Reef", 7.0, 11.0),
         ("Shipwrecks", 11.0, 15.0), ("The trench", 15.0, 20.0), ("The lost town", 20.0, 24.5)]

# --- The chart: hand-placed isobaths ------------------------------------------------------------
# Each is a closed loop of (x, z) control points, clockwise as seen from
# above with north up: along the sea wall west to east, down the east shore,
# west along the town beach, up past the river mouth and the west cliffs.
# The bay is deliberately lopsided: wide sand flats under the town and the
# east spit, a narrow steep shelf under the west headland's cliffs, a broad
# reef platform on the east, the wreck shelf in the middle and the lost town
# tucked under the sea wall, a little west of centre.
ISOBATHS = [
    (0.0, [(-27, -52.0), (-14, -53.6), (-2, -54.4), (10, -53.8), (21, -51.6), (27, -47), (32, -40), (37, -31),
           (42, -23), (46.5, -14.5), (48, -5.5), (46, 3), (46, 12), (43, 24), (38.5, 33.5), (31, 40.5), (21, 45),
           (9, 47.4), (-3, 47.2), (-15, 45.6), (-26, 42.4), (-34, 38.5), (-39.5, 37.8), (-44, 34.5), (-47.5, 27),
           (-49.5, 16), (-50, 4), (-48.5, -9), (-45, -22), (-39.5, -34), (-33, -45)]),
    (3.0, [(-25.5, -50.5), (-14, -52.0), (-2, -52.6), (10, -52.0), (19.5, -49.8), (24.5, -44.5), (28.5, -37),
           (33, -28), (38, -18), (40.5, -8), (39.5, 2), (37, 12), (33, 19.5), (24.5, 22.5), (12, 20.5), (0, 18.5),
           (-12, 19.5), (-24, 22), (-32, 24.5), (-38, 20.5), (-42.5, 12), (-46, 2), (-45.5, -9), (-42.5, -21),
           (-37.5, -32), (-31.5, -43)]),
    (7.0, [(-24, -49.0), (-13, -50.6), (-2, -51.2), (9, -50.6), (17.5, -48), (21.5, -42), (23, -33), (23.5, -23),
           (24.5, -13), (25.5, -4), (24, 4.5), (19, 9.5), (10, 10.5), (0, 9), (-11, 9.5), (-22, 11.5), (-30, 11),
           (-36.5, 6), (-41, -2), (-42, -11), (-40, -21), (-35.5, -31), (-30, -41)]),
    (11.0, [(-22.5, -47.5), (-12, -49.2), (-2, -49.8), (7, -49.0), (12.5, -45), (10.5, -37), (8, -28), (7, -19),
            (8, -10), (6.5, -2.5), (1, 1.5), (-8, 2.5), (-17, 4.5), (-25, 4), (-31, -0.5), (-36, -8), (-37.5, -17),
            (-35.5, -27), (-31.5, -36), (-27, -43)]),
    (15.0, [(-20.5, -46.0), (-11, -47.6), (-2, -48.2), (5, -47.2), (7.5, -43), (5.5, -36), (3, -29), (1, -22.5),
            (-2.5, -17.5), (-8, -15.5), (-14.5, -15.5), (-21, -17), (-26.5, -20), (-30.5, -25), (-31, -32),
            (-28, -39), (-24.5, -43.5)]),
    (20.0, [(-17, -44.6), (-9, -46.0), (-2, -45.8), (3, -43), (3.5, -37), (1, -31.5), (-3.5, -28.5), (-9, -27.8),
            (-14.5, -29.5), (-18, -34), (-19, -40)]),
]
TOWN_SQUARE = (-7.5, -37.5)

# The sea wall's crest line, west headland to the rocky point (bowed out to sea).
WALL = [(-31.0, -55.6), (-20.0, -57.3), (-8.0, -58.3), (4.0, -58.2), (15.0, -57.2), (25.0, -55.2), (30.0, -53.6)]
WALL_CREST = 2.6

# The drowned river: from the weir at the river mouth down the old valley to
# the lost town (its lower reach is the trench).
CANYON = [(-43.0, 34.0), (-41.0, 26.0), (-37.5, 17.0), (-34.0, 8.0), (-31.0, -1.0), (-28.5, -10.0), (-25.5, -18.0),
          (-21.5, -25.0), (-17.5, -31.0)]
CANYON_CUT = [0.8, 1.8, 2.6, 3.0, 3.2, 3.2, 2.8, 2.0, 0.8]      # how far it's cut below the seabed beside it
CANYON_HALF = [2.4, 2.8, 3.2, 3.4, 3.6, 3.8, 4.0, 4.2, 4.6]
# The river upstream of the weir, out through the land to the south-west.
RIVER = [(-43.5, 35.5), (-49.0, 41.0), (-55.0, 46.5), (-62.0, 52.0), (-72.0, 58.0), (-86.0, 66.0), (-104.0, 77.0),
         (-128.0, 92.0), (-160.0, 112.0), (-200.0, 136.0), (-240.0, 160.0)]
WEIR = (-43.6, 35.4)
RIVER_LEVEL = 0.75

# --- Smooth helpers -----------------------------------------------------------------------------


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def value_noise(xs, zs, scale, seed, octaves=3):
    """Smooth fractal value noise (bilinear-interpolated lattices), -1..1."""
    out = np.zeros_like(xs)
    amp = 1.0
    tot = 0.0
    r = np.random.default_rng(seed)
    for o in range(octaves):
        sc = scale / (2 ** o)
        gx = xs / sc + 1000.0
        gz = zs / sc + 1000.0
        ix = np.floor(gx).astype(int)
        iz = np.floor(gz).astype(int)
        fx = gx - ix
        fz = gz - iz
        fx = fx * fx * (3 - 2 * fx)
        fz = fz * fz * (3 - 2 * fz)
        size = 512
        lat = r.uniform(-1, 1, (size, size))
        ix0, iz0, ix1, iz1 = ix % size, iz % size, (ix + 1) % size, (iz + 1) % size
        v = (lat[iz0, ix0] * (1 - fx) * (1 - fz) + lat[iz0, ix1] * fx * (1 - fz)
             + lat[iz1, ix0] * (1 - fx) * fz + lat[iz1, ix1] * fx * fz)
        out += v * amp
        tot += amp
        amp *= 0.5
    return out / tot


def catmull(points, closed=True, step=0.5):
    """A Catmull-Rom spline through the points, sampled about every `step` m."""
    P = [np.array(p, dtype=np.float64) for p in points]
    n = len(P)
    out = []
    segs = n if closed else n - 1
    for i in range(segs):
        p0 = P[(i - 1) % n] if closed else P[max(i - 1, 0)]
        p1 = P[i]
        p2 = P[(i + 1) % n] if closed else P[min(i + 1, n - 1)]
        p3 = P[(i + 2) % n] if closed else P[min(i + 2, n - 1)]
        L = np.linalg.norm(p2 - p1)
        k = max(2, int(L / step))
        for s in range(k):
            t = s / k
            t2, t3 = t * t, t * t * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append(q)
    if not closed:
        out.append(P[-1])
    return np.array(out)


def seg_dist(xs, zs, pts, closed):
    """Distance from every grid point to a polyline, plus the arc-length
    parameter (0..1) of the nearest point and the nearest segment index."""
    A = pts
    B = np.roll(pts, -1, axis=0) if closed else pts[1:]
    if not closed:
        A = pts[:-1]
    seglen = np.linalg.norm(B - A, axis=1)
    cum = np.concatenate([[0.0], np.cumsum(seglen)])
    total = cum[-1]
    best = np.full(xs.shape, 1e9)
    par = np.zeros(xs.shape)
    for k in range(len(A)):
        ax, az = A[k]
        dx, dz = B[k] - A[k]
        L2 = dx * dx + dz * dz + 1e-12
        t = np.clip(((xs - ax) * dx + (zs - az) * dz) / L2, 0, 1)
        d = np.hypot(xs - (ax + t * dx), zs - (az + t * dz))
        m = d < best
        best = np.where(m, d, best)
        par = np.where(m, (cum[k] + t * seglen[k]) / total, par)
    return best, par


def inside(xs, zs, pts):
    """Crossing-number point-in-polygon for every grid point."""
    res = np.zeros(xs.shape, dtype=bool)
    n = len(pts)
    for k in range(n):
        x1, z1 = pts[k]
        x2, z2 = pts[(k + 1) % n]
        cond = (z1 > zs) != (z2 > zs)
        with np.errstate(divide="ignore", invalid="ignore"):
            xint = x1 + (zs - z1) * (x2 - x1) / (z2 - z1 + 1e-12)
        res ^= cond & (xs < xint)
    return res


def sdf(xs, zs, pts):
    d, _ = seg_dist(xs, zs, pts, True)
    return np.where(inside(xs, zs, pts), d, -d)


def path_interp(par, values):
    """Interpolates per-control-point values along an open path by its
    arc-length parameter (control points spread evenly in parameter)."""
    v = np.asarray(values, dtype=np.float64)
    u = par * (len(v) - 1)
    i = np.clip(np.floor(u).astype(int), 0, len(v) - 2)
    f = u - i
    f = f * f * (3 - 2 * f)
    return v[i] * (1 - f) + v[i + 1] * f


# --- The height function -----------------------------------------------------------------------
LOOPS = [(d, catmull(p, True, 1.0)) for d, p in ISOBATHS]
WALL_LINE = catmull(WALL, False, 0.5)
CANYON_LINE = catmull(CANYON, False, 0.5)
RIVER_LINE = catmull(RIVER, False, 1.0)


def wall_z(x):
    """The sea wall's crest z at x (extended flat past its ends)."""
    xs = WALL_LINE[:, 0]
    zs = WALL_LINE[:, 1]
    return np.interp(x, xs, zs)


def heights(xs, zs, cell):
    """The whole landform on a grid of `cell`-metre spacing. Returns (h,
    parts) where parts holds the masks the painter needs."""
    sd = [sdf(xs, zs, pts) for _d, pts in LOOPS]
    depth = np.zeros_like(xs)
    # Between two isobaths: interpolate by distance (linear here, softened later).
    for k in range(len(LOOPS) - 1):
        d0, d1 = LOOPS[k][0], LOOPS[k + 1][0]
        a = np.maximum(sd[k], 0.0)
        b = np.maximum(-sd[k + 1], 0.0)
        t = a / np.maximum(a + b, 1e-6)
        band = (sd[k] >= 0) & (sd[k + 1] < 0)
        depth = np.where(band, d0 + (d1 - d0) * t, depth)
    # Inside the 20 m contour: the lost town's floor, a gentle bowl to the square.
    inner = sd[-1] >= 0
    dsq = np.hypot(xs - TOWN_SQUARE[0], zs - TOWN_SQUARE[1])
    town_floor = 20.0 + 1.2 * smoothstep(0.0, 4.0, sd[-1]) + 3.3 * smoothstep(12.0, 0.0, dsq)
    depth = np.where(inner, town_floor, depth)
    wet = sd[0] >= 0
    # Soften the creases where the slope changes at each isobath (the bands
    # are linear between contours); the shoreline itself stays put.
    soft = ndimage.gaussian_filter(depth, 2.4 / cell, mode="nearest")
    depth = np.where(wet, np.maximum(soft, 0.05 * np.minimum(sd[0], 4.0)), 0.0)
    h = np.where(wet, -depth, 0.0)

    # --- Land: beaches, dunes, the town terrace, the headland and the rocky point.
    dout = np.maximum(-sd[0], 0.0)
    beach = 1.5 * smoothstep(0.0, 9.0, dout) + 0.025 * dout
    hills = 0.06 * np.maximum(dout - 18.0, 0.0) + 5.0 * smoothstep(60.0, 160.0, dout)
    land = beach + hills
    # Hills behind the town roll a little (far, low, broad: no blotches up close).
    land += value_noise(xs, zs, 70.0, 5, 2) * 3.0 * smoothstep(30.0, 90.0, dout)
    # West headland: a high grassy plateau with cliffs into the bay and the sea.
    hd = np.hypot((xs + 50.0) * 0.85, (zs + 54.0) * 1.0)
    head = smoothstep(34.0, 14.0, hd) * smoothstep(-2.0, 3.0, dout) * smoothstep(-90.0, -40.0, zs)
    cliff = 9.5 * head * smoothstep(0.0, 5.0, dout + (zs < wall_z(xs) - 1.0) * 6.0)
    land = np.maximum(land, cliff + 0.6 * value_noise(xs, zs, 9.0, 41, 2) * head)
    # The rocky point on the east side of the wall: low rock, in ridges of
    # tilted strata running out to sea (north-east), boulders between them.
    rp = np.hypot((xs - 37.0) * 0.9, (zs + 52.0) * 1.1)
    point = smoothstep(18.0, 6.0, rp)
    ridges = np.zeros_like(xs)
    for (ax, az, bx, bz, hh, wdt) in [(29.0, -46.0, 44.0, -60.0, 1.6, 1.3), (32.5, -44.0, 47.0, -56.0, 1.2, 1.1),
                                      (27.0, -50.0, 37.0, -62.0, 1.0, 1.0), (35.5, -42.5, 48.0, -51.0, 0.8, 0.9)]:
        line = np.array([(ax, az), (bx, bz)], dtype=np.float64)
        dd, pp = seg_dist(xs, zs, line, False)
        ridges = np.maximum(ridges, hh * smoothstep(wdt * 1.6, wdt * 0.3, dd) * (0.7 + 0.3 * np.sin(pp * 9.0)))
    land = land + point * (1.9 + ridges)

    # The town terrace: the quay at +2.3, the town climbing gently behind it.
    town_band = smoothstep(36.0, 44.0, zs) * smoothstep(-42.0, -30.0, xs) * smoothstep(46.0, 34.0, xs)
    land = land + town_band * smoothstep(6.0, 13.0, dout) * 0.9
    # River valley: cut down to the river bed behind the weir.
    dr, pr = seg_dist(xs, zs, RIVER_LINE, False)
    bed = RIVER_LEVEL - 0.5 + 9.0 * pr ** 1.4
    valley = smoothstep(16.0, 3.0, dr)
    chan = smoothstep(4.5, 1.6, dr)
    land = land * (1 - valley) + np.minimum(land, bed + 0.35 * dr) * valley
    land = np.where(chan > 0, land * (1 - chan) + (bed - 0.25) * chan, land)
    h = np.where(wet, h, land)

    # --- The drowned river canyon: the trench, cut down from the river mouth to
    # the town. Its floor is the seabed beside it less a cut that grows
    # downstream, with steep rocky walls, so it reads at every water level.
    dc, pc = seg_dist(xs, zs, CANYON_LINE, False)
    cut = path_interp(pc, CANYON_CUT)
    chalf = path_interp(pc, CANYON_HALF)
    prof = smoothstep(1.0, 0.0, dc / (chalf * 1.8))
    prof = prof * prof * (3 - 2 * prof)
    h = np.where(wet | (dc < chalf * 2.0), h - cut * prof * smoothstep(-0.5, 0.6, -h + 0.9), h)

    # --- Reef knolls: rock heads on the east reef platform (7-11 m).
    rk = np.zeros_like(xs)
    for (kx, kz, kr, ka) in [(19.0, -12, 3.2, 1.6), (14.5, -4, 2.4, 1.2), (20.0, 3.0, 2.8, 1.3), (12.5, 6.5, 2.2, 1.0),
                             (20.5, -25.0, 2.6, 1.4), (16.0, -31.5, 2.4, 1.1), (11.5, -41.5, 2.0, 0.9),
                             (-38.0, -14.5, 1.8, 0.8), (-34.0, -24.0, 1.6, 0.7)]:
        # Each head is a cluster: a main boss and two smaller ones off one
        # side, stretched along the old current (north-east).
        for (ox, oz, sr, sa) in [(0, 0, 1.0, 1.0), (kr * 0.7, -kr * 0.5, 0.55, 0.7), (-kr * 0.45, kr * 0.75, 0.45, 0.55)]:
            ux = (xs - kx - ox) * 0.8 + (zs - kz - oz) * 0.6
            uz = -(xs - kx - ox) * 0.6 + (zs - kz - oz) * 0.8
            dd = np.hypot(ux / 1.35, uz / 0.8) / (kr * sr)
            rk = np.maximum(rk, ka * sa * np.clip(1 - dd * dd, 0, 1) ** 1.6)
    reef_zone = smoothstep(6.0, 7.5, -h) * smoothstep(12.5, 10.5, -h)
    h = h + rk * reef_zone

    # --- Sandbars: long low ridges along the town and east flats, with gaps.
    for (pts, amp, half) in [([(-30, 34.5), (-18, 37.0), (-6, 38.4), (6, 38.6), (16, 37.2)], 0.55, 1.6),
                             ([(36.5, 26), (30.5, 30.5), (23.0, 33.4)], 0.6, 1.5),
                             ([(-36, 27.5), (-26, 30.0)], 0.45, 1.4)]:
        line = catmull(pts, False, 0.5)
        db, pb = seg_dist(xs, zs, line, False)
        ends = smoothstep(0.0, 0.12, pb) * smoothstep(1.0, 0.88, pb)
        ridge = amp * np.exp(-(db / half) ** 2) * ends
        h = h + ridge * (h < -0.2) * smoothstep(-3.0, -0.6, h)
    # --- The delta fan off the river mouth: a lobe of sand pushed into the bay.
    fan = np.hypot((xs + 38.0) * 0.8, (zs - 27.0) * 1.0)
    h = h + 0.9 * smoothstep(13.0, 2.0, fan) * smoothstep(-6.0, -0.8, h) * (dc > 2.5)

    # --- Wear: a few centimetres of broad undulation, never blotches.
    h = h + value_noise(xs, zs, 16.0, 21, 2) * 0.12 * (h < -0.3)

    # --- The sea wall's footing and the open sea beyond it.
    wz = wall_z(xs)
    span = smoothstep(-36.0, -29.0, xs) * smoothstep(36.0, 28.0, xs)
    wd = np.abs(zs - wz)
    wall_h = WALL_CREST - smoothstep(2.6, 4.4, wd) * 60.0
    h = np.where(span > 0.01, smax(h, wall_h * span + h * (1 - span), 0.3), h)
    outer = zs < wz - 2.8
    sea_floor = -2.5 - 0.22 * np.maximum(wz - 2.8 - zs, 0.0) - 1.5 * smoothstep(0, 30, wz - zs)
    # North of the coast everything that isn't headland or point is sea floor.
    keep = (head > 0.3) | (point > 0.35)
    h = np.where(outer & ~keep, np.minimum(h, sea_floor), h)
    h = np.where(outer & keep, smin(h, sea_floor + 9.0 * np.maximum(head, point), 1.0), h)
    parts = {"sd": sd, "wet": wet, "dout": dout, "head": head, "point": point, "dc": dc, "pc": pc,
             "chalf": chalf, "rk": rk * reef_zone, "dr": dr, "outer": outer, "town_band": town_band, "fan": fan}
    return h, parts


# --- Designed pools ------------------------------------------------------------------------------
# name, centre (x, z), radii (a, b), rotation (deg), bowl depth below the rim,
# rim (absolute y). Each becomes its own body of water when the bay drops
# below its lip, and keeps its water until a barge pump sits on it.
POOLS = [
    ("West lagoon", (-23.0, 33.0), (5.6, 2.6), 8, 1.4, None),
    ("Town lagoon", (1.0, 33.5), (7.0, 2.6), -2, 1.4, None),
    ("East lagoon", (27.5, 28.5), (5.0, 2.5), -36, 1.3, None),
    ("Kelp hollow", (-22.0, 16.0), (3.8, 2.8), 20, 1.7, None),
    ("Otter hole", (32.5, 1.0), (3.4, 2.7), -70, 1.6, None),
    ("Reef pool", (16.5, -20.0), (3.4, 2.5), 70, 1.8, None),
    ("Coral basin", (16.5, -37.0), (3.0, 2.4), 20, 1.8, None),
    ("Galleon scour", (-23.5, -8.0), (3.4, 2.3), 105, 1.8, None),
    ("Boiler pit", (1.5, -15.5), (2.8, 2.3), 10, 1.8, None),
    ("Black pothole", (-29.0, -28.5), (2.5, 2.1), 35, 2.0, None),
    ("Lantern pit", (-5.0, -24.5), (2.4, 2.0), 0, 2.0, None),
]


def carve_pools(xs, zs, h):
    """Each pool: a rounded bowl below its rim and a modelled berm round it
    that raises the downhill seabed to just above the rim, blended in with
    smooth min/max so the lip is a soft curve, not cell steps."""
    info = []
    for (name, (cx, cz), (a, b), rot, depth, rim) in POOLS:
        if rim is None:
            # The lip sits a little above the seabed here: a modest berm.
            rim = round(hget(h, cx, cz) + 0.3, 2)
        c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        dx = xs - cx
        dz = zs - cz
        u = (dx * c + dz * s) / a
        v = (-dx * s + dz * c) / b
        th = np.arctan2(v, u)
        ph = (cx * 0.37 + cz * 0.71) % math.tau
        wob = 1.0 + 0.11 * np.sin(2 * th + ph) + 0.06 * np.sin(3 * th + 2.1 * ph) + 0.035 * np.sin(5 * th + ph * 0.5)
        rl = np.sqrt(u * u + v * v) / wob
        mean_r = 0.5 * (a + b)
        e = (rl - 1.0) * mean_r                       # metres outside the bowl's edge
        berm = rim + 0.16 - 0.32 * np.maximum(e - 0.8, 0.0) ** 1.25
        berm = np.where(e < -0.7, -99.0, berm)
        h1 = smax(h, berm, 0.22)
        # Inside, the floor is the pool's own rounded bowl (on a slope that
        # makes a terrace held back by the downhill berm, like a rock pool).
        bowl = rim - 0.05 - depth * np.clip(1.0 - rl * rl, 0.0, 1.0) ** 1.3
        w = smoothstep(1.12, 0.86, rl)
        h[:] = h1 * (1 - w) + bowl * w
        ci = int(round((cx - X0) / S))
        cj = int(round((cz - Z0) / S))
        info.append({"name": name, "x": cx, "z": cz, "rim": rim, "v": cj * W + ci})
    return info


# --- Fill and merge tree --------------------------------------------------------------------------
def neighbours(v):
    i, j = v % W, v // W
    if i > 0:
        yield v - 1
    if i < W - 1:
        yield v + 1
    if j > 0:
        yield v - W
    if j < W - 1:
        yield v + W


def priority_fill(hf, active, sink, eps=1.5e-3):
    """Raises every vertex in `active` with no downhill path to the sink to its
    spill height (plus a tiny slope), so the only pools are carved ones."""
    out = hf.copy()
    seen = np.zeros(hf.size, dtype=bool)
    heap = [(out[sink], sink)]
    seen[sink] = True
    while heap:
        hv, v = heapq.heappop(heap)
        for n in neighbours(v):
            if seen[n] or not active[n]:
                continue
            seen[n] = True
            if out[n] < hv + eps:
                out[n] = hv + eps
            heapq.heappush(heap, (out[n], n))
    return out


class Tree:
    def __init__(self):
        self.parent = []
        self.low = []
        self.high = []
        self.minv = []
        self.children = []
        self.own = []


def merge_tree(hf, active):
    order = np.lexsort((np.arange(hf.size), hf))
    uf = np.arange(hf.size)
    comp = {}
    on = np.zeros(hf.size, dtype=bool)
    vert_node = np.full(hf.size, -1, dtype=np.int64)
    t = Tree()

    def find(a):
        root = a
        while uf[root] != root:
            root = uf[root]
        while uf[a] != root:
            uf[a], a = root, uf[a]
        return root

    for v in order:
        if not active[v]:
            continue
        on[v] = True
        roots = set()
        for n in neighbours(v):
            if on[n]:
                roots.add(find(n))
        hv = float(hf[v])
        if not roots:
            k = len(t.parent)
            t.parent.append(-1); t.low.append(hv); t.high.append(1e9); t.minv.append(int(v))
            t.children.append([]); t.own.append([hv])
            comp[v] = k
            vert_node[v] = k
        elif len(roots) == 1:
            r = roots.pop()
            uf[v] = r
            k = comp[r]
            t.own[k].append(hv)
            vert_node[v] = k
        else:
            k = len(t.parent)
            kids = [comp[r] for r in roots]
            t.parent.append(-1); t.low.append(hv); t.high.append(1e9)
            t.minv.append(min((t.minv[c] for c in kids), key=lambda m: hf[m]))
            t.children.append(kids); t.own.append([hv])
            for c in kids:
                t.parent[c] = k
                t.high[c] = hv
            rs = list(roots)
            for r in rs[1:]:
                uf[r] = rs[0]
            uf[v] = rs[0]
            comp[rs[0]] = k
            vert_node[v] = k
    return t, vert_node


def subtree_count(t):
    desc = [0] * len(t.parent)
    total = [0] * len(t.parent)
    for k in range(len(t.parent)):            # children always come before parents
        total[k] = len(t.own[k]) + sum(total[c] for c in t.children[k])
        desc[k] = total[k] - len(t.own[k])
    return desc, total


def prune_small(hf, active, sink, min_area=56, min_depth=0.25):
    """Fills leaves that are too small or too shallow to be worth a pool."""
    for _ in range(8):
        t, vn = merge_tree(hf, active)
        _, total = subtree_count(t)
        changed = False
        sink_node = vn[sink]
        anc = set()
        k = sink_node
        while k >= 0:
            anc.add(k)
            k = t.parent[k]
        for k in range(len(t.parent)):
            if t.children[k] or k in anc or t.parent[k] < 0:
                continue
            spill = t.high[k]
            if spill > 0.0:
                continue
            if total[k] < min_area or spill - t.low[k] < min_depth:
                mask = (vn == k) & active
                hf[mask] = np.maximum(hf[mask], spill + 0.002)
                changed = True
        if not changed:
            return hf, t, vn
    t, vn = merge_tree(hf, active)
    return hf, t, vn


# --- Colours ---------------------------------------------------------------------------------------
def paint(xs, zs, h, P, cell):
    """Painted vertex colours (rgb) and a sand mask (a: where the seabed shader
    draws ripple marks). Every change of colour follows a feature: a depth
    band, a slope, the canyon, the reef heads, the town's lanes, the tide
    line. The only noise is a slow few-percent drift."""
    gz, gx = np.gradient(h, cell)
    slope = np.hypot(gx, gz)
    lap = ndimage.laplace(h) / (cell * cell)
    d = -h
    drift = value_noise(xs, zs, 22.0, 51, 2)
    col = np.zeros(h.shape + (3,))
    sand = np.zeros(h.shape)

    def band(lo, hi, soft=0.8):
        return smoothstep(lo - soft, lo + soft, d) * (1 - smoothstep(hi - soft, hi + soft, d))

    w = [band(-0.3, 3.0), band(3.0, 7.0), band(7.0, 11.0), band(11.0, 15.0), band(15.0, 20.3), smoothstep(19.6, 20.6, d)]
    tot = sum(w)
    w = [x / np.maximum(tot, 1e-4) for x in w]
    # Sand flats: paler on crests, a touch darker in the troughs between bars.
    flats = COL["flat_sand"] * (1.0 + np.clip(-lap, -0.6, 0.6)[..., None] * 0.06)
    # Kelp forest: sand stained in long tongues running down the slope.
    kd = smoothstep(3.5, 6.8, d)[..., None]
    kelp = COL["kelp_sand"] * (1 - 0.45 * kd) + COL["kelp_stain"] * 0.45 * kd
    reef = COL["reef_sand"] * (1 - smoothstep(0.05, 0.5, P["rk"])[..., None]) + COL["reef_rock"] * smoothstep(0.05, 0.5, P["rk"])[..., None]
    reef = reef * (1 - smoothstep(0.6, 1.1, P["rk"])[..., None] * 0.6) + COL["coral_crust"] * smoothstep(0.6, 1.1, P["rk"])[..., None] * 0.6
    col = (flats * w[0][..., None] + kelp * w[1][..., None] + reef * w[2][..., None]
           + COL["silt"] * w[3][..., None] + COL["trench"] * w[4][..., None] + COL["town_floor"] * w[5][..., None])
    sand = w[0] + w[1] * 0.8 + w[2] * 0.6 + w[3] * 0.35
    # Canyon walls are rock, its floor dark silt.
    cwall = smoothstep(0.8, 1.6, slope) * (P["dc"] < P["chalf"] * 2.1)
    col = col * (1 - cwall[..., None]) + COL["canyon_rock"] * cwall[..., None]
    sand = sand * (1 - cwall)
    # Steep seabed elsewhere: rock showing through.
    rock = smoothstep(0.9, 1.7, slope) * (d > 0.4)
    col = col * (1 - rock[..., None] * 0.65) + COL["cliff"] * 0.9 * rock[..., None] * 0.65
    sand = sand * (1 - rock)
    # Town streets: a crooked grid of lanes round the square.
    town = smoothstep(19.8, 20.8, d)
    sx = xs - TOWN_SQUARE[0] + value_noise(xs, zs, 14.0, 61, 1) * 1.6
    szz = zs - TOWN_SQUARE[1] + value_noise(xs, zs, 14.0, 62, 1) * 1.6
    lane = np.maximum(np.exp(-((np.mod(sx + 4.5, 9.5) - 4.75) / 0.85) ** 2), np.exp(-((np.mod(szz + 4.0, 8.5) - 4.25) / 0.85) ** 2))
    plaza = smoothstep(5.0, 3.6, np.hypot(xs - TOWN_SQUARE[0], zs - TOWN_SQUARE[1]))
    lane = np.maximum(lane, plaza)
    col = col * (1 - (lane * town)[..., None] * 0.75) + COL["street"] * (lane * town * 0.75)[..., None]
    sand = sand * (1 - town)
    # Rust halos are painted round the wrecks in landmarks(); see wreck_halo().

    # --- Land.
    land = ~P["wet"] | (h > 0.02)
    hl = np.maximum(h, 0.0)
    beach_t = smoothstep(1.1, 2.0, hl + 0.25 * drift)
    dune = COL["dune"] * (1 - beach_t[..., None]) + COL["beach"] * 0.0
    beach_col = COL["beach"] * (1 - smoothstep(0.0, 0.6, hl))[..., None] + COL["beach"] * smoothstep(0.0, 0.6, hl)[..., None]
    grass = COL["grass"] * (1 - smoothstep(-0.3, 0.6, drift)[..., None]) + COL["grass_dry"] * smoothstep(-0.3, 0.6, drift)[..., None]
    lcol = beach_col * (1 - beach_t[..., None]) + grass * beach_t[..., None]
    lcol = lcol * (1 - smoothstep(1.0, 1.3, hl)[..., None] * (1 - beach_t[..., None]) * 0.0) + dune * 0.0
    # The high-water wrack line: dried weed in a thin broken band at +0.35.
    wr = np.exp(-((hl - 0.36 - 0.05 * drift) / 0.07) ** 2) * smoothstep(-0.2, 0.3, np.sin(xs * 0.9 + zs * 0.4 + drift * 3)) * (P["dout"] < 9)
    lcol = lcol * (1 - wr[..., None] * 0.55) + COL["wrack"] * wr[..., None] * 0.55
    # Cliffs: rock with strata running level across the face.
    cl = smoothstep(0.8, 1.6, slope)
    strata = 0.5 + 0.5 * np.sin(hl * 4.2 + drift * 0.6)
    cliffc = COL["cliff"] * (1 - strata[..., None] * 0.45) + COL["cliff_dark"] * strata[..., None] * 0.45
    lcol = lcol * (1 - cl[..., None]) + cliffc * cl[..., None]
    # The rocky point: bare weathered rock.
    rp = smoothstep(0.35, 0.7, P["point"])
    lcol = lcol * (1 - rp[..., None]) + COL["rock_point"] * (0.92 + 0.08 * strata)[..., None] * rp[..., None]
    # Fields and hedgerows on the far land: irregular fields (a jittered
    # Voronoi, 35-70 m across) in three muted tones, hedges along their
    # borders, everything quieter with distance so the bay stays the subject.
    far = smoothstep(24.0, 44.0, P["dout"]) * (1 - P["head"])
    cell = 52.0
    gxv = xs / cell
    gzv = zs / cell
    ix = np.floor(gxv)
    iz = np.floor(gzv)
    f1 = np.full(xs.shape, 9.0)
    f2 = np.full(xs.shape, 9.0)
    pick = np.zeros(xs.shape)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            cx = ix + ox
            cz = iz + oy
            jx = (np.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1.0
            jz = (np.sin(cx * 39.3468 + cz * 11.135) * 24634.6345) % 1.0
            dd = np.hypot(gxv - (cx + 0.15 + 0.7 * jx), gzv - (cz + 0.15 + 0.7 * jz))
            nearer = dd < f1
            f2 = np.where(nearer, f1, np.minimum(f2, dd))
            pick = np.where(nearer, (jx * 3.7 + jz * 1.3) % 1.0, pick)
            f1 = np.where(nearer, dd, f1)
    tone = np.where(pick < 0.4, 0, np.where(pick < 0.75, 1, 2))
    fieldc = (COL["grass"] * (tone == 0)[..., None] + COL["field_a"] * (tone == 1)[..., None] + COL["field_b"] * (tone == 2)[..., None])
    fieldc = fieldc * (0.96 + 0.06 * pick)[..., None]
    hedge = 1.0 - smoothstep(0.012, 0.03, f2 - f1)
    fade = 1.0 - 0.5 * smoothstep(60.0, 180.0, P["dout"])
    fieldc = fieldc * (1 - (hedge * fade)[..., None] * 0.7) + COL["hedge"] * (hedge * fade * 0.7)[..., None]
    lcol = lcol * (1 - far[..., None] * (1 - cl[..., None])) + fieldc * (far[..., None] * (1 - cl[..., None]))
    # The river's banks: lusher grass along the valley.
    rb = smoothstep(9.0, 3.0, P["dr"]) * (1 - cl)
    lcol = lcol * (1 - rb[..., None] * 0.6) + COL["grass_lush"] * rb[..., None] * 0.6
    col = np.where(land[..., None], lcol, col)
    sand = np.where(land, (1 - beach_t) * (hl < 1.4) * 0.6, sand)
    # Beyond the wall: the outer sea floor (seen only through the sea).
    col = np.where((P["outer"] & (h < -0.5))[..., None], COL["outer"], col)
    # A soft few-percent drift, and creases a touch darker.
    shade = 1.0 + drift * 0.035 - np.clip(lap, -1.0, 1.0) * 0.03
    col = col * shade[..., None]
    return np.clip(col, 0, 1), np.clip(sand, 0, 1)


# --- Landmarks -----------------------------------------------------------------------------------
def hget(h, x, z, x0=X0, z0=Z0, s=S):
    w = h.shape[1]
    fi = (x - x0) / s
    fj = (z - z0) / s
    i = int(np.clip(math.floor(fi), 0, w - 2))
    j = int(np.clip(math.floor(fj), 0, w - 2))
    u, v = fi - i, fj - j
    return float(h[j, i] * (1 - u) * (1 - v) + h[j, i + 1] * u * (1 - v) + h[j + 1, i] * (1 - u) * v + h[j + 1, i + 1] * u * v)


# Yaws turn each wreck's broken-open side (the model's +X) towards the camera.
WRECKS = [("The Marigold", -18.0, -3.0, -72, "galleon"), ("SS Perpetua", 5.0, -9.5, -18, "steamer"),
          ("Little Kittiwake", -7.0, -6.5, -105, "trawler")]
TOWN = [(-7.5, -38.5, 8, "clocktower"), (-13.5, -33.5, 22, "house"), (-1.5, -33.0, -12, "house"),
        (-14.0, -42.0, 14, "chapel"), (-1.0, -42.5, -24, "house"), (-7.5, -31.2, 0, "arch"),
        (1.6, -38.0, -78, "house"), (-16.0, -38.2, 80, "house")]


def landmarks(h):
    lm = {}
    # Shore pump pads round the bay, just above the old waterline.
    lm["pads"] = []
    gz, gx = np.gradient(h, S)
    for (x, z) in [(6.0, 48.0), (-17.0, 46.0), (24.0, 45.5), (-49.5, 14.0), (47.0, 6.0), (-48.5, -10.0)]:
        # Walk uphill to the strip of beach just above the old waterline.
        for _ in range(200):
            y = hget(h, x, z)
            if 0.55 < y:
                break
            i = int(np.clip((x - X0) / S, 0, W - 1))
            j = int(np.clip((z - Z0) / S, 0, W - 1))
            g = np.array([gx[j, i], gz[j, i]])
            g = g / max(np.linalg.norm(g), 1e-6)
            x, z = x + g[0] * 0.25, z + g[1] * 0.25
        lm["pads"].append({"x": round(x, 2), "z": round(z, 2), "y": hget(h, x, z)})
    lm["pier"] = {"x0": 12.0, "z0": 55.0, "x1": 12.0, "z1": 34.0, "deck": 2.1}
    lm["aquarium"] = {"x": 21.5, "z": 56.0, "y": hget(h, 21.5, 56.0), "yaw": 0}
    lm["lighthouse"] = {"x": 38.0, "z": -54.5, "y": hget(h, 38.0, -54.5)}
    lm["houses"] = []
    for (x, z, yaw, kind) in [(-6, 56.5, 2, 0), (-14.5, 55.0, 9, 1), (-23.5, 52.5, 18, 0), (2.5, 58.5, -5, 1),
                              (31, 53.5, -14, 0), (40, 47.5, -32, 1), (-31.5, 49.0, 30, 2), (-2.0, 62.0, 0, 2),
                              (30.0, 61.0, -8, 1), (-12.0, 61.5, 6, 0)]:
        lm["houses"].append({"x": x, "z": z, "y": hget(h, x, z), "yaw": yaw, "kind": kind})
    lm["wrecks"] = []
    for (name, x, z, yaw, kind) in WRECKS:
        lm["wrecks"].append({"name": name, "x": x, "z": z, "y": hget(h, x, z), "yaw": yaw, "kind": kind})
    lm["town"] = []
    for (x, z, yaw, kind) in TOWN:
        lm["town"].append({"x": x, "z": z, "y": hget(h, x, z), "yaw": yaw, "kind": kind})
    lm["wall"] = [[round(float(p[0]), 3), round(float(p[1]), 3)] for p in catmull(WALL, False, 1.0)]
    lm["wall_crest"] = WALL_CREST
    lm["weir"] = {"x": WEIR[0], "z": WEIR[1], "y": RIVER_LEVEL, "yaw": -45.0}
    lm["river"] = [[round(float(p[0]), 2), round(float(p[1]), 2)] for p in RIVER_LINE]
    lm["river_level"] = RIVER_LEVEL
    lm["ripple_dir"] = [0.86, -0.51]     # ripple wave vector: crests run NNW-SSE, the flood current ran ENE
    # Chart lettering for each ring: (x, z) of the middle of the word, its
    # heading (deg, 0 = reading east), and how much it bends along the contour.
    lm["ring_labels"] = [
        {"x": -6.0, "z": 41.0, "yaw": -2.0, "bend": 0.012},
        {"x": -31.0, "z": 20.0, "yaw": -38.0, "bend": 0.03},
        {"x": 25.5, "z": -2.0, "yaw": -82.0, "bend": 0.02},
        {"x": -5.0, "z": 6.8, "yaw": 4.0, "bend": 0.035},
        {"x": -21.0, "z": -14.0, "yaw": -55.0, "bend": 0.04},
        {"x": -6.5, "z": -34.0, "yaw": 0.0, "bend": 0.05},
    ]
    return lm


def scatter(h, lm, pools):
    """Clustered props: kelp in stands, coral heads in groups, stones in
    clusters at the feet of slopes and round the rocky point."""
    out = {"kelp": [], "coral": [], "rocks": []}
    taken = [(p["x"], p["z"], 6.0) for p in pools] + [(w["x"], w["z"], 9.0) for w in lm["wrecks"]]
    taken += [(t["x"], t["z"], 4.0) for t in lm["town"]]

    def free(x, z, pad=0.0):
        if np.hypot(x - CANYON_LINE[:, 0], z - CANYON_LINE[:, 1]).min() < 3.0:
            return False
        return all((x - a) ** 2 + (z - b) ** 2 > (rr + pad) ** 2 for a, b, rr in taken)

    rr = np.random.default_rng(7)
    # Kelp stands: where the kelp forest is (3-7 m), thickest on the west and south slopes.
    stands = 0
    tries = 0
    while stands < 30 and tries < 6000:
        tries += 1
        x, z = rr.uniform(-50, 40), rr.uniform(-45, 35)
        d = -hget(h, x, z)
        if not (3.4 < d < 6.8) or not free(x, z):
            continue
        if x > 10 and z < 10 and rr.random() < 0.7:
            continue
        stands += 1
        for _ in range(int(rr.integers(6, 14))):
            a = rr.uniform(0, math.tau)
            rad = rr.uniform(0, 3.4) ** 1.2
            kx, kz = x + math.cos(a) * rad, z + math.sin(a) * rad
            dd = -hget(h, kx, kz)
            if 3.0 < dd < 7.5:
                out["kelp"].append([round(kx, 2), round(-dd, 3), round(kz, 2), round(rr.uniform(0, 360), 1), round(rr.uniform(0.7, 1.35), 2)])
    # Coral heads: on and round the reef knolls.
    groups = 0
    tries = 0
    while groups < 34 and tries < 6000:
        tries += 1
        x, z = rr.uniform(-40, 35), rr.uniform(-45, 15)
        d = -hget(h, x, z)
        if not (7.2 < d < 10.8) or not free(x, z):
            continue
        groups += 1
        for _ in range(int(rr.integers(2, 6))):
            a = rr.uniform(0, math.tau)
            rad = rr.uniform(0.5, 2.4)
            kx, kz = x + math.cos(a) * rad, z + math.sin(a) * rad
            dd = -hget(h, kx, kz)
            if 7.0 < dd < 11.2:
                out["coral"].append([round(kx, 2), round(-dd, 3), round(kz, 2), round(rr.uniform(0, 360), 1),
                                     round(rr.uniform(0.7, 1.4), 2), int(rr.integers(0, 3))])
    # Stones: clusters of five to seven, one big, two middling, the rest
    # small, gathered at the foot of slopes (where they'd have rolled).
    gz, gx = np.gradient(h, S)
    slope = np.hypot(gx, gz)
    groups = 0
    tries = 0
    while groups < 30 and tries < 8000:
        tries += 1
        x, z = rr.uniform(-52, 46), rr.uniform(-52, 46)
        i = int(np.clip((x - X0) / S, 1, W - 2))
        j = int(np.clip((z - Z0) / S, 1, W - 2))
        d = -h[j, i]
        if not (0.4 < d < 19.0) or not free(x, z, 1.0):
            continue
        # The foot of a slope: gentle here, steep a few metres uphill.
        up = slope[max(j - 8, 0):j + 9, max(i - 8, 0):i + 9].max()
        if slope[j, i] > 0.5 or up < 0.8:
            continue
        groups += 1
        n = int(rr.integers(5, 8))
        base = rr.uniform(0, math.tau)
        for k in range(n):
            a = base + rr.normal(0, 0.9)
            rad = 0.0 if k == 0 else rr.uniform(0.9, 2.6) * (0.6 + 0.4 * k / n)
            kx, kz = x + math.cos(a) * rad, z + math.sin(a) * rad
            size = [1.5, 1.0, 0.85, 0.55, 0.45, 0.35, 0.3][k] * rr.uniform(0.85, 1.15)
            out["rocks"].append([round(kx, 2), round(hget(h, kx, kz), 3), round(kz, 2), round(rr.uniform(0, 360), 1),
                                 round(size, 2), int(rr.integers(0, 3))])
    # The rocky point and the sea wall's toe: boulders.
    for (cx, cz, n, spread, big) in [(34.0, -49.0, 9, 5.0, 1.8), (41.0, -56.0, 7, 4.0, 2.0), (-30.5, -50.0, 6, 3.0, 1.6),
                                     (-2.0, -53.0, 5, 6.0, 1.2), (14.0, -52.0, 5, 5.0, 1.1), (-45.5, -18.0, 6, 3.0, 1.4)]:
        for k in range(n):
            a = rr.uniform(0, math.tau)
            rad = rr.uniform(0, spread)
            kx, kz = cx + math.cos(a) * rad, cz + math.sin(a) * rad
            out["rocks"].append([round(kx, 2), round(hget(h, kx, kz), 3), round(kz, 2), round(rr.uniform(0, 360), 1),
                                 round(big * rr.uniform(0.35, 1.0), 2), int(rr.integers(0, 3))])
    return out


def b64(arr):
    return base64.b64encode(arr.tobytes()).decode("ascii")


def grid(n, s, x0, z0):
    i = np.arange(n + 1)
    return np.meshgrid(x0 + i * s, z0 + i * s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", default="")
    args = ap.parse_args()
    xs, zs = grid(N, S, X0, Z0)
    h, P = heights(xs, zs, S)
    outer = P["outer"]
    outer_f = outer.reshape(-1)
    active = ~outer_f
    hf = h.reshape(-1).copy()
    sink = int(np.argmin(np.where(active, hf, 1e9)))
    hf = priority_fill(hf, active, sink)
    filled = hf.reshape(W, W) - h
    print("fill: max %.3f m, cells raised > 5 cm: %d" % (filled.max(), int((filled > 0.05).sum())))
    h2 = hf.reshape(W, W)
    pools = carve_pools(xs, zs, h2)
    hf = h2.reshape(-1)
    sink = int(np.argmin(np.where(active, hf, 1e9)))
    hf, t, vn = prune_small(hf, active, sink)
    t, vn = merge_tree(hf, active)
    desc, total = subtree_count(t)
    h2 = hf.reshape(W, W)
    for p in pools:
        k = int(vn[p["v"]])
        p["node"] = k
        p["spill"] = float(t.high[k])
        p["floor"] = float(t.low[k])
    leaves = [k for k in range(len(t.parent)) if not t.children[k] and t.high[k] <= 0.0]
    print("nodes", len(t.parent), "leaves below sea level", len(leaves))
    for k in leaves:
        print("  leaf %d: floor %.2f spill %.2f area %.1f m2" % (k, t.low[k], t.high[k], total[k] * S * S))
    for p in pools:
        print("pool %-14s rim %.2f node %d spill %.2f floor %.2f" % (p["name"], p["rim"], p["node"], p["spill"], p["floor"]))
    # Volumes per ring (for the balance notes).
    wet = active & (hf < 0)
    vols = []
    for (_n, a, b) in RINGS:
        top, bot = -a, -b
        v = np.clip(np.minimum(top, 0) - np.maximum(hf, bot), 0, None)
        vols.append(float((v * wet).sum() * S * S))
    print("volumes by ring (m3):", ", ".join("%s %.0f" % (RINGS[i][0], vols[i]) for i in range(len(RINGS))), "total %.0f" % sum(vols))
    col, sandm = paint(xs, zs, h2, P, S)
    lm = landmarks(h2)
    # Rust halos round the wrecks, painted on after the landmarks are known.
    for w in lm["wrecks"]:
        dd = np.hypot(xs - w["x"], zs - w["z"])
        halo = smoothstep(9.0, 2.0, dd) * (h2 < -10)
        col = col * (1 - halo[..., None] * 0.5) + COL["rust_halo"] * halo[..., None] * 0.5
    props = scatter(h2, lm, pools)
    # The far land: the same height function on a coarse grid. Inside the bay
    # grid it tucks just under the bay mesh so the two never show a seam.
    fxs, fzs = grid(FAR_N, FAR_S, FAR_X0, FAR_Z0)
    fh, FP = heights(fxs, fzs, FAR_S)
    fcol, _fs = paint(fxs, fzs, fh, FP, FAR_S)
    in_core = (fxs > X0 + 0.01) & (fxs < X0 + N * S - 0.01) & (fzs > Z0 + 0.01) & (fzs < Z0 + N * S - 0.01)
    for jj in range(fh.shape[0]):
        for ii in range(fh.shape[1]):
            if in_core[jj, ii]:
                fh[jj, ii] = hget(h2, fxs[jj, ii], fzs[jj, ii]) - 0.25
    # Pack the tree.
    own_off, own_len, own_all = [], [], []
    for k in range(len(t.parent)):
        own_off.append(len(own_all))
        own_len.append(len(t.own[k]))
        own_all.extend(t.own[k])
    rgba = np.concatenate([col.reshape(-1, 3), sandm.reshape(-1, 1)], axis=1)
    data = {
        "n": N, "s": S, "x0": X0, "z0": Z0, "sink": sink,
        "rings": [{"name": n, "top": -a, "bottom": -b} for (n, a, b) in RINGS],
        "heights": b64(hf.astype(np.float32)),
        "colors": b64((rgba * 255).round().astype(np.uint8)),
        "outer": b64(outer_f.astype(np.uint8)),
        "vert_node": b64(vn.astype(np.int32)),
        "tree": {"parent": t.parent, "low": [round(x, 4) for x in t.low], "high": [round(x, 4) for x in t.high],
                 "minv": t.minv, "desc": desc, "own_off": own_off, "own_len": own_len},
        "own_heights": b64(np.array(own_all, dtype=np.float32)),
        "pools": [{k: p[k] for k in ("name", "x", "z", "v", "node", "spill", "floor")} for p in pools],
        "landmarks": lm,
        "props": props,
        "far": {"n": FAR_N, "s": FAR_S, "x0": FAR_X0, "z0": FAR_Z0,
                "heights": b64(fh.reshape(-1).astype(np.float32)),
                "colors": b64((fcol.reshape(-1, 3) * 255).round().astype(np.uint8))},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB; min %.2f max %.2f" % (hf[active].min(), hf.max()))
    if args.preview:
        preview(h2, col, lm, props, pools, args.preview)


def preview(h, col, lm, props, pools, path):
    from PIL import Image, ImageDraw
    gz, gx = np.gradient(h, S)
    # hillshade, sun from the west-south-west
    lx, ly, lz = -0.85, 0.45, 0.35
    nx, ny, nz = -gx, np.ones_like(h), -gz
    nl = np.sqrt(nx * nx + ny * ny + nz * nz)
    shade = np.clip((nx * lx + ny * ly + nz * lz) / nl / math.sqrt(lx * lx + ly * ly + lz * lz), 0, 1)
    img = col * (0.4 + 0.8 * shade[..., None])
    for lev in [0, -3, -7, -11, -15, -20]:
        m = (np.sign(h - lev) != np.sign(np.roll(h, 1, 1) - lev)) | (np.sign(h - lev) != np.sign(np.roll(h, 1, 0) - lev))
        img[m] = img[m] * 0.3 + np.array([0.1, 0.25, 0.35]) * 0.7
    sc = 3
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).resize((W * sc, W * sc), Image.BILINEAR)
    d = ImageDraw.Draw(im)

    def Pp(x, z):
        return ((x - X0) / S * sc, (z - Z0) / S * sc)

    for p in pools:
        x, y = Pp(p["x"], p["z"])
        d.text((x - 20, y - 6), "%s %.1f" % (p["name"][:10], p["spill"]), fill=(255, 255, 255))
    for w in lm["wrecks"]:
        x, y = Pp(w["x"], w["z"])
        d.rectangle([x - 8, y - 8, x + 8, y + 8], outline=(140, 60, 30), width=3)
    for pd in lm["pads"]:
        x, y = Pp(pd["x"], pd["z"])
        d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=(224, 96, 63))
    for b in lm["town"]:
        x, y = Pp(b["x"], b["z"])
        d.rectangle([x - 5, y - 5, x + 5, y + 5], fill=(243, 234, 211))
    for k in props["rocks"]:
        x, y = Pp(k[0], k[2])
        r = k[4] * 3
        d.ellipse([x - r, y - r, x + r, y + r], fill=(90, 90, 90))
    for k in props["kelp"]:
        x, y = Pp(k[0], k[2])
        d.point((x, y), fill=(30, 80, 40))
    for c in props["coral"]:
        x, y = Pp(c[0], c[2])
        d.point((x, y), fill=(255, 120, 90))
    wl = lm["wall"]
    d.line([Pp(p[0], p[1]) for p in wl], fill=(240, 240, 240), width=3)
    im.save(path)
    print("preview", path)


if __name__ == "__main__":
    main()
