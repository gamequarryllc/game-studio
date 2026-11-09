#!/usr/bin/env python3
"""Builds the bay: the seabed heightmap, its painted vertex colours, the pool
merge tree and every hand-placed landmark, into data/bay.json.

    python3 art/bay/make_bay.py [--preview out.png]

The bay is a composed level, not random scatter: the coordinates of the sea
wall, headlands, pier, lagoons, reef pools, wrecks and the lost town are
chosen here by hand; noise only adds wear. Godot never generates terrain, it
loads this file (fast on phones), so a change here is a change to the level.

World axes (Godot): x east, z south, y up. The camera looks north from the
town. Grid: N x N cells of S metres, vertices (N+1)^2, index = j * W + i.

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

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "data", "bay.json"))

N = 128
S = 1.0
W = N + 1
X0 = -64.0
Z0 = -64.0
rng = np.random.default_rng(20261109)

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
    "beach": mix(mix("sand", "paper", 0.32), "ink", 0.05),
    "bar_sand": mix(mix("sand", "paper", 0.22), "ink", 0.13),
    "kelp_sand": mix(mix(mix("sand", "paper", 0.15), "ink", 0.26), "shoal", 0.10),
    "kelp_bed": mix(mix("shoal", "rust", 0.45), "ink", 0.42),
    "reef_rock": mix(mix("sand", "rust", 0.38), "ink", 0.22),
    "reef_coral": mix(mix("coral", "sand", 0.5), "ink", 0.14),
    "silt": mix(mix(mix("sand", "paper", 0.2), "ink", 0.40), "rust", 0.06),
    "rust_stain": mix("rust", "ink", 0.15),
    "trench": mix(mix("teal", "ink", 0.45), "sand", 0.12),
    "town_floor": mix(mix("paper", "sand", 0.55), "ink", 0.18),
    "street": mix("paper", "sand", 0.35),
    "grass": mix(mix("shoal", "sand", 0.5), "ink", 0.36),
    "grass_dry": mix(mix(mix("sand", "paper", 0.2), "shoal", 0.3), "ink", 0.2),
    "cliff": mix(mix("sand", "ink", 0.45), "rust", 0.10),
    "wall": mix(mix("paper", "ink", 0.38), "sand", 0.2),
    "paving": mix(mix("paper", "ink", 0.22), "sand", 0.3),
}

# --- Rings (depth bands, metres below the old sea level) ----------------------------------------
RINGS = [("Sandbars", 0.0, 3.0), ("Kelp forest", 3.0, 7.0), ("Reef", 7.0, 11.0),
         ("Shipwrecks", 11.0, 15.0), ("The trench", 15.0, 20.0), ("The lost town", 20.0, 24.5)]

# The deep centre (the lost town) sits close under the sea wall; the bay
# shelves gently towards the town on the south shore, where the camera is.
C = np.array([-4.0, -24.0])
# Distance from C to the shoreline by direction (angle from +x towards +z).
R_CTRL = [  # (degrees, radius)
    (0, 50), (35, 58), (70, 66), (90, 68), (115, 66), (150, 58), (180, 50),
    (215, 42), (250, 36), (270, 33), (295, 34), (325, 42), (360, 50)]
WALL_Z = -57.0          # crest line of the sea wall
WALL_X = (-27.0, 23.0)  # between the two headlands


def radius_at(theta_deg):
    t = theta_deg % 360.0
    for k in range(len(R_CTRL) - 1):
        a0, r0 = R_CTRL[k]
        a1, r1 = R_CTRL[k + 1]
        if a0 <= t <= a1:
            u = (t - a0) / (a1 - a0)
            u = u * u * (3 - 2 * u)
            return r0 + (r1 - r0) * u
    return R_CTRL[0][1]


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def value_noise(shape_xz, scale, seed, octaves=3):
    """Smooth fractal value noise on the grid (bilinear-interpolated lattices)."""
    xs, zs = shape_xz
    out = np.zeros_like(xs)
    amp = 1.0
    tot = 0.0
    r = np.random.default_rng(seed)
    for o in range(octaves):
        sc = scale / (2 ** o)
        gx = xs / sc
        gz = zs / sc
        ix = np.floor(gx).astype(int)
        iz = np.floor(gz).astype(int)
        fx = gx - ix
        fz = gz - iz
        fx = fx * fx * (3 - 2 * fx)
        fz = fz * fz * (3 - 2 * fz)
        size = 512
        lat = r.uniform(-1, 1, (size, size))
        ix0 = ix % size
        iz0 = iz % size
        ix1 = (ix + 1) % size
        iz1 = (iz + 1) % size
        v = (lat[iz0, ix0] * (1 - fx) * (1 - fz) + lat[iz0, ix1] * fx * (1 - fz)
             + lat[iz1, ix0] * (1 - fx) * fz + lat[iz1, ix1] * fx * fz)
        out += v * amp
        tot += amp
        amp *= 0.5
    return out / tot


def depth_profile(r):
    """Metres below sea level for a normalised distance r from the deep
    centre (1 = the old shoreline). Terraced: each ring is a shelf with a
    steeper drop into the next one, so the seabed comes up band by band."""
    # Ring boundaries in r and the depth at each.
    rb = [1.0, 0.82, 0.66, 0.52, 0.37, 0.22, 0.0]
    db = [0.0, 3.0, 7.0, 11.0, 15.0, 20.0, 24.0]
    d = np.zeros_like(r)
    for k in range(len(rb) - 1):
        r0, r1 = rb[k], rb[k + 1]
        d0, d1 = db[k], db[k + 1]
        inside = (r <= r0) & (r > r1)
        u = (r0 - r) / (r0 - r1)
        # A shelf: flatter in the middle of the band, steeper at the edges.
        shelf = u + 0.6 * np.sin(2 * np.pi * u) / (2 * np.pi)
        shelf = 0.35 * u + 0.65 * (u ** 2 * (3 - 2 * u)) if k == 0 else shelf
        d = np.where(inside, d0 + (d1 - d0) * shelf, d)
    d = np.where(r <= 0.0, db[-1], d)
    return d


def build_heights():
    i = np.arange(W)
    xs, zs = np.meshgrid(X0 + i * S, Z0 + i * S)    # zs[j, i], xs[j, i]
    # Domain warp so the rings aren't circles.
    wx = value_noise((xs, zs), 40.0, 11, 2) * 7.0
    wz = value_noise((xs, zs), 40.0, 12, 2) * 7.0
    px = xs + wx - C[0]
    pz = zs + wz - C[1]
    theta = np.degrees(np.arctan2(pz, px))
    R = np.vectorize(radius_at)(theta)
    r = np.sqrt(px * px + pz * pz) / R
    h = -depth_profile(r)
    # Land beyond the shoreline: a beach, then rising ground.
    land = r > 1.0
    lr = (r - 1.0)
    h = np.where(land, 0.0 + np.minimum(lr * 14.0, 1.3) + np.maximum(lr - 0.09, 0) * 26.0, h)
    # Wear: broad undulation on every shelf and fine roughness.
    h += value_noise((xs, zs), 18.0, 21, 3) * 0.7 * smoothstep(0.98, 0.7, r)
    h += value_noise((xs, zs), 5.0, 22, 2) * 0.18
    # Sandbars: two ridges parallel to the town shore, broken by gaps.
    along = np.degrees(np.arctan2(pz, px))
    gap = 0.5 + 0.5 * np.sin(np.radians(along) * 7.0 + 0.6)
    for rr, amp, wdt in [(0.905, 1.25, 0.022), (0.855, 0.9, 0.02)]:
        ridge = amp * np.exp(-((r - rr) / wdt) ** 2) * smoothstep(0.15, 0.6, gap)
        south = smoothstep(-10, 30, zs)          # mostly on the town side
        h += ridge * (0.35 + 0.65 * south)
    # Reef: rocky knolls on the east side of the reef band.
    knoll = value_noise((xs, zs), 7.0, 31, 2)
    reef_band = smoothstep(0.69, 0.62, r) * smoothstep(0.46, 0.54, r)
    h += np.maximum(knoll, 0) * 2.2 * reef_band * smoothstep(-30, 10, xs)
    # The trench: a canyon from the west wreck shelf down to the town.
    tpath = [(-46, 2), (-38, -6), (-30, -12), (-22, -18), (-13, -22)]
    tdist = np.full_like(xs, 1e9)
    tdep = np.zeros_like(xs)
    for k in range(len(tpath) - 1):
        ax, az = tpath[k]
        bx, bz = tpath[k + 1]
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz
        t = np.clip(((xs - ax) * dx + (zs - az) * dz) / L2, 0, 1)
        qx = ax + t * dx
        qz = az + t * dz
        dd = np.sqrt((xs - qx) ** 2 + (zs - qz) ** 2)
        better = dd < tdist
        tdist = np.where(better, dd, tdist)
        tdep = np.where(better, 12.0 + 8.0 * ((k + t) / (len(tpath) - 1)), tdep)
    canyon = np.exp(-(tdist / 4.2) ** 2)
    h = np.where(~land, np.minimum(h, -tdep * canyon + h * (1 - canyon)), h)
    # The lost town's floor: a gentle bowl around the town square.
    town = smoothstep(0.30, 0.16, r)
    sq = np.array([-4.0, -26.0])
    dsq = np.sqrt((xs - sq[0]) ** 2 + (zs - sq[1]) ** 2)
    h = np.where(town > 0, h * (1 - town) + (-21.2 - 2.6 * smoothstep(14.0, 0.0, dsq)) * town, h)
    # Headlands either side of the sea wall: cliffs.
    for (hx, hz, rad, top) in [(-38, -56, 16, 7.5), (36, -55, 18, 9.0)]:
        d = np.sqrt((xs - hx) ** 2 + ((zs - hz) * 1.25) ** 2)
        bump = top * smoothstep(rad, rad * 0.45, d)
        h = np.where(bump > 0.01, np.maximum(h, bump + value_noise((xs, zs), 4.0, 41, 2) * 0.6 * (bump > 0.5)), h)
    # The sea wall across the mouth, slightly bowed, crest +2.4.
    bow = 1.6 * np.cos(np.clip((xs - (WALL_X[0] + WALL_X[1]) / 2) / (WALL_X[1] - WALL_X[0]) * np.pi, -np.pi / 2, np.pi / 2))
    wall_c = WALL_Z - bow
    on_span = (xs > WALL_X[0] - 6) & (xs < WALL_X[1] + 6)
    wd = np.abs(zs - wall_c)
    wall_h = np.where(wd < 2.2, 2.4, np.where(wd < 4.0, 2.4 - (wd - 2.2) * 6.0, -99))
    h = np.where(on_span, np.maximum(h, wall_h), h)
    # Beyond the wall: the outer sea floor, falling away.
    outer = (zs < wall_c - 2.2) & on_span
    outer |= (zs < WALL_Z - 3) & ~on_span & (h < 0.5)
    h = np.where(outer & (zs < wall_c - 3.5), np.minimum(h, -2.0 - (wall_c - 3.5 - zs) * 0.9), h)
    return xs, zs, r, h, outer, land


# --- Designed pools ------------------------------------------------------------------------------
# name, centre (x, z), radii (a, b), rotation (deg), depth of the bowl, lip
# height above the local seabed. Each becomes its own body of water when the
# bay drops below its lip, and keeps its water until a barge pump sits on it.
POOLS = [
    # name, (x, z), (a, b), rot, bowl depth below the rim, rim (absolute y)
    ("West lagoon", (-26, 33), (6.5, 3.4), 30, 1.3, -0.9),
    ("Town lagoon", (-2, 39), (8.0, 3.2), 4, 1.3, -1.1),
    ("East lagoon", (24, 33), (6.0, 3.2), -35, 1.2, -0.8),
    ("Kelp hollow", (-34, 14), (5.0, 3.8), 20, 1.7, -4.6),
    ("Otter hole", (20, 21), (4.4, 3.6), -10, 1.6, -4.9),
    ("Reef pool", (24, -4), (4.4, 3.4), 65, 1.9, -8.4),
    ("Coral basin", (-30, -34), (4.0, 3.2), 10, 1.9, -9.4),
    ("Galleon scour", (-23, -4), (4.6, 3.0), 100, 1.8, -12.6),
    ("Boiler pit", (11, 3), (3.8, 3.0), 0, 1.9, -13.2),
    ("Black pothole", (-30, -12), (3.4, 2.8), 30, 2.2, -16.4),
    ("Lantern pit", (12, -25), (3.2, 2.6), 0, 2.2, -17.6),
]


def carve_pools(xs, zs, h):
    """Each pool: a bowl below its rim, and a lip that raises the seabed round
    it to at least the rim (only where the seabed is lower, i.e. downhill),
    so the pool closes off exactly when the bay drops below the rim."""
    info = []
    for (name, (cx, cz), (a, b), rot, depth, rim) in POOLS:
        c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        dx = xs - cx
        dz = zs - cz
        u = (dx * c + dz * s) / a
        v = (-dx * s + dz * c) / b
        rl = np.sqrt(u * u + v * v)
        inside = rl < 1.0
        bowl = rim - 0.06 - depth * np.clip(1 - rl * rl, 0, 1) ** 0.75
        h[:] = np.where(inside, np.minimum(h, bowl), h)
        # lip: a soft raised ring reaching rim + 0.15 at rl ~ 1.12
        bump = rim + 0.15 * np.clip(1 - np.abs(rl - 1.12) / 0.3, 0, 1)
        lip = (rl >= 1.0) & (rl < 1.42)
        h[:] = np.where(lip, np.maximum(h, bump), h)
        h[:] = np.where((rl >= 1.0) & (rl < 1.24), np.maximum(h, rim), h)
        ci = int(round(cx - X0))
        cj = int(round(cz - Z0))
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


def priority_fill(hf, active, sink, eps=4e-3):
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


def prune_small(hf, active, sink, min_area=14, min_depth=0.25):
    """Fills leaves that are too small or too shallow to be worth a pool."""
    for _ in range(6):
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
def paint(xs, zs, r, h, land, outer):
    cn = value_noise((xs, zs), 6.0, 51, 3)
    cn2 = value_noise((xs, zs), 2.2, 52, 2)
    gy, gx = np.gradient(h, S)
    slope = np.sqrt(gx * gx + gy * gy)
    lap = (np.roll(h, 1, 0) + np.roll(h, -1, 0) + np.roll(h, 1, 1) + np.roll(h, -1, 1) - 4 * h)
    d = -h
    col = np.zeros(h.shape + (3,))

    def band(lo, hi, soft=0.6):
        return smoothstep(lo - soft, lo + soft, d) * (1 - smoothstep(hi - soft, hi + soft, d))

    col += COL["bar_sand"] * band(-0.2, 3.0)[..., None]
    kelp = band(3.0, 7.0)
    kelp_mix = smoothstep(0.0, 0.5, cn)[..., None]
    col += (COL["kelp_sand"] * (1 - kelp_mix) + COL["kelp_bed"] * kelp_mix) * kelp[..., None]
    reef = band(7.0, 11.0)
    coral_mix = smoothstep(0.35, 0.75, cn + cn2 * 0.4)[..., None] * 0.7
    col += (COL["reef_rock"] * (1 - coral_mix) + COL["reef_coral"] * coral_mix) * reef[..., None]
    col += COL["silt"] * band(11.0, 15.0)[..., None]
    col += COL["trench"] * band(15.0, 20.4)[..., None]
    col += COL["town_floor"] * smoothstep(19.8, 20.8, d)[..., None]
    # normalise the soft band overlaps
    wsum = band(-0.2, 3.0) + kelp + reef + band(11.0, 15.0) + band(15.0, 20.4) + smoothstep(19.8, 20.8, d)
    col = col / np.maximum(wsum, 1e-3)[..., None]
    # Town streets: a crooked grid of lanes across the town floor.
    town = smoothstep(20.0, 21.0, d)
    sx = xs + 4.0 + value_noise((xs, zs), 12.0, 61, 1) * 2.0
    sz = zs + 26.0 + value_noise((xs, zs), 12.0, 62, 1) * 2.0
    lane = np.maximum(np.exp(-((np.mod(sx + 3.0, 9.0) - 4.5) / 0.9) ** 2), np.exp(-((np.mod(sz + 2.0, 8.0) - 4.0) / 0.9) ** 2))
    plaza = smoothstep(5.5, 3.5, np.sqrt((xs + 4.0) ** 2 + (zs + 26.0) ** 2))
    lane = np.maximum(lane, plaza)
    col = col * (1 - (lane * town)[..., None] * 0.8) + COL["street"] * (lane * town * 0.8)[..., None]
    # Land: beach sand, dune grass, cliffs.
    beach = land & (h < 1.6)
    grass_t = smoothstep(1.2, 2.4, h)[..., None]
    grass = COL["grass"] * (1 - smoothstep(0.1, 0.6, cn)[..., None]) + COL["grass_dry"] * smoothstep(0.1, 0.6, cn)[..., None]
    land_col = COL["beach"] * (1 - grass_t) + grass * grass_t
    cliff_t = smoothstep(0.9, 1.6, slope)[..., None]
    land_col = land_col * (1 - cliff_t) + COL["cliff"] * cliff_t
    col = np.where(land[..., None] | (h > 0.05)[..., None], land_col, col)
    # Seabed rock on steep slopes.
    rock_t = (smoothstep(0.8, 1.5, slope) * (d > 0.3))[..., None]
    col = col * (1 - rock_t * 0.6) + (COL["cliff"] * 0.85) * rock_t * 0.6
    # The sea wall's stone.
    wall = (h > 2.0) & (np.abs(zs - WALL_Z) < 6) & (xs > WALL_X[0] - 6) & (xs < WALL_X[1] + 6)
    col = np.where(wall[..., None], COL["wall"] * (0.92 + 0.08 * cn2[..., None]), col)
    # Painted wear: concave creases darker, crests lighter, grain.
    shade = 1.0 + np.clip(lap, -1.5, 1.5) * -0.09 + cn2 * 0.05
    col = col * shade[..., None]
    col = np.where(outer[..., None], COL["silt"] * 0.8, col)
    return np.clip(col, 0, 1)


# --- Landmarks -----------------------------------------------------------------------------------
def hget(h, x, z):
    fi = (x - X0) / S
    fj = (z - Z0) / S
    i = int(np.clip(math.floor(fi), 0, W - 2))
    j = int(np.clip(math.floor(fj), 0, W - 2))
    u, v = fi - i, fj - j
    return float(h[j, i] * (1 - u) * (1 - v) + h[j, i + 1] * u * (1 - v) + h[j + 1, i] * (1 - u) * v + h[j + 1, i + 1] * u * v)


def landmarks(h, pools):
    lm = {}
    # Shore pump pads round the bay, just above the old waterline.
    lm["pads"] = []
    for (x, z, yaw) in [(6, 47.5, 180), (-20, 43.0, 160), (24, 42.5, 205), (-41, 24, 125), (44, 14, 240), (-45, -6, 100)]:
        lm["pads"].append({"x": x, "z": z, "y": hget(h, x, z), "yaw": yaw})
    # The pier from the town into the bay, the aquarium at its head on shore.
    lm["pier"] = {"x0": 12.0, "z0": 54.0, "x1": 12.0, "z1": 33.0, "deck": 2.1}
    lm["aquarium"] = {"x": 21.0, "z": 55.5, "y": hget(h, 21, 55.5), "yaw": 0}
    lm["lighthouse"] = {"x": 37.0, "z": -57.0, "y": hget(h, 37, -57)}
    lm["houses"] = []
    for (x, z, yaw, kind) in [(-6, 56, 0, 0), (-14, 54.5, 8, 1), (-24, 52, 20, 0), (-33, 47, 35, 1), (2, 58, -4, 1),
                              (30, 52, -15, 0), (39, 46, -30, 1), (-42, 40, 50, 0)]:
        lm["houses"].append({"x": x, "z": z, "y": hget(h, x, z), "yaw": yaw, "kind": kind})
    # Wrecks on the wreck shelf.
    lm["wrecks"] = []
    for (name, x, z, yaw, kind) in [("The Marigold", -16, 4, 72, "galleon"), ("SS Perpetua", 19, -6, -25, "steamer"),
                                    ("Little Kittiwake", 2, 11, 140, "trawler")]:
        lm["wrecks"].append({"name": name, "x": x, "z": z, "y": hget(h, x, z), "yaw": yaw, "kind": kind})
    # The lost town on the bottom: buildings round the square.
    lm["town"] = []
    for (x, z, yaw, kind) in [(-4, -26, 0, "clocktower"), (-12, -21, 15, "house"), (4, -21, -10, "house"),
                              (-13, -31, 5, "chapel"), (5, -31, -20, "house"), (-1, -18, 90, "arch"),
                              (10, -26, -80, "house"), (-18, -26, 80, "house")]:
        lm["town"].append({"x": x, "z": z, "y": hget(h, x, z), "yaw": yaw, "kind": kind})
    return lm


def scatter(h, r, lm, pools):
    """Clustered props: kelp in stands, coral heads in groups, rocks in threes."""
    out = {"kelp": [], "coral": [], "rocks": []}
    taken = [(p["x"], p["z"], 6.5) for p in pools] + [(w["x"], w["z"], 11.0) for w in lm["wrecks"]]

    def free(x, z, pad=0.0):
        return all((x - a) ** 2 + (z - b) ** 2 > (rr + pad) ** 2 for a, b, rr in taken)

    rr = np.random.default_rng(7)
    # kelp stands: centres in the kelp band
    tries = 0
    stands = 0
    while stands < 26 and tries < 4000:
        tries += 1
        x, z = rr.uniform(-60, 60), rr.uniform(-55, 55)
        d = -hget(h, x, z)
        if not (3.4 < d < 6.8) or not free(x, z):
            continue
        stands += 1
        for _ in range(int(rr.integers(5, 12))):
            a = rr.uniform(0, math.tau)
            rad = rr.uniform(0, 3.2) ** 1.2
            kx, kz = x + math.cos(a) * rad, z + math.sin(a) * rad
            dd = -hget(h, kx, kz)
            if 3.0 < dd < 7.5:
                out["kelp"].append([round(kx, 2), round(-dd, 3), round(kz, 2), round(rr.uniform(0, 360), 1), round(rr.uniform(0.7, 1.35), 2)])
    tries = 0
    groups = 0
    while groups < 30 and tries < 4000:
        tries += 1
        x, z = rr.uniform(-60, 60), rr.uniform(-55, 55)
        d = -hget(h, x, z)
        if not (7.3 < d < 10.8) or not free(x, z):
            continue
        groups += 1
        for _ in range(int(rr.integers(2, 6))):
            a = rr.uniform(0, math.tau)
            rad = rr.uniform(0.5, 2.6)
            kx, kz = x + math.cos(a) * rad, z + math.sin(a) * rad
            dd = -hget(h, kx, kz)
            if 7.0 < dd < 11.2:
                out["coral"].append([round(kx, 2), round(-dd, 3), round(kz, 2), round(rr.uniform(0, 360), 1),
                                     round(rr.uniform(0.7, 1.4), 2), int(rr.integers(0, 3))])
    tries = 0
    groups = 0
    while groups < 22 and tries < 4000:
        tries += 1
        x, z = rr.uniform(-60, 60), rr.uniform(-55, 55)
        d = -hget(h, x, z)
        if not (0.5 < d < 19) or not free(x, z, 1.0):
            continue
        groups += 1
        for k in range(3):
            a = rr.uniform(0, math.tau)
            rad = rr.uniform(0.6, 2.0)
            kx, kz = x + math.cos(a) * rad, z + math.sin(a) * rad
            out["rocks"].append([round(kx, 2), round(hget(h, kx, kz), 3), round(kz, 2), round(rr.uniform(0, 360), 1),
                                 round([1.6, 1.0, 0.6][k] * rr.uniform(0.8, 1.2), 2), int(rr.integers(0, 2))])
    return out


def b64(arr):
    return base64.b64encode(arr.tobytes()).decode("ascii")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", default="")
    args = ap.parse_args()
    xs, zs, r, h, outer, land = build_heights()
    hf = h.reshape(-1).copy()
    outer_f = outer.reshape(-1)
    active = ~outer_f
    # Sink: the deepest point of the town square.
    sink = int(np.argmin(np.where(active, hf, 1e9)))
    hf = priority_fill(hf, active, sink)
    h2 = hf.reshape(W, W)
    pools = carve_pools(xs, zs, h2)
    hf = h2.reshape(-1)
    sink = int(np.argmin(np.where(active, hf, 1e9)))
    hf, t, vn = prune_small(hf, active, sink)
    t, vn = merge_tree(hf, active)
    desc, total = subtree_count(t)
    h2 = hf.reshape(W, W)
    # Which node is each designed pool, and at what level does it split off?
    for p in pools:
        k = int(vn[p["v"]])
        p["node"] = k
        p["spill"] = float(t.high[k])
        p["floor"] = float(t.low[k])
    # Report.
    leaves = [k for k in range(len(t.parent)) if not t.children[k] and t.high[k] <= 0.0]
    print("nodes", len(t.parent), "leaves below sea level", len(leaves))
    for k in leaves:
        print("  leaf %d: floor %.2f spill %.2f area %d" % (k, t.low[k], t.high[k], total[k]))
    for p in pools:
        print("pool %-14s rim %.2f node %d spill %.2f floor %.2f" % (p["name"], p["rim"], p["node"], p["spill"], p["floor"]))
    col = paint(xs, zs, r, h2, land, outer)
    lm = landmarks(h2, pools)
    props = scatter(h2, r, lm, pools)
    # Pack the tree.
    own_off, own_len, own_all = [], [], []
    for k in range(len(t.parent)):
        own_off.append(len(own_all))
        own_len.append(len(t.own[k]))
        own_all.extend(t.own[k])
    data = {
        "n": N, "s": S, "x0": X0, "z0": Z0, "sink": sink,
        "rings": [{"name": n, "top": -a, "bottom": -b} for (n, a, b) in RINGS],
        "heights": b64(hf.astype(np.float32)),
        "colors": b64((col.reshape(-1, 3) * 255).round().astype(np.uint8)),
        "outer": b64(outer_f.astype(np.uint8)),
        "vert_node": b64(vn.astype(np.int32)),
        "tree": {"parent": t.parent, "low": [round(x, 4) for x in t.low], "high": [round(x, 4) for x in t.high],
                 "minv": t.minv, "desc": desc, "own_off": own_off, "own_len": own_len},
        "own_heights": b64(np.array(own_all, dtype=np.float32)),
        "pools": [{k: p[k] for k in ("name", "x", "z", "v", "node", "spill", "floor")} for p in pools],
        "landmarks": lm,
        "props": props,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB; min %.2f max %.2f" % (hf[active].min(), hf.max()))
    if args.preview:
        preview(h2, col, t, vn, pools, lm, props, args.preview)


def preview(h, col, t, vn, pools, lm, props, path):
    from PIL import Image, ImageDraw
    gy, gx = np.gradient(h, S)
    # hillshade, sun from the west-south-west
    lx, ly, lz = -0.8, 0.45, 0.4
    nx, ny, nz = -gx, np.ones_like(h), -gy
    nl = np.sqrt(nx * nx + ny * ny + nz * nz)
    shade = np.clip((nx * lx + ny * ly + nz * lz) / nl / math.sqrt(lx * lx + ly * ly + lz * lz), 0, 1)
    img = col * (0.45 + 0.75 * shade[..., None])
    # contours at the ring tops
    for lev in [0, -3, -7, -11, -15, -20]:
        m = (np.sign(h - lev) != np.sign(np.roll(h, 1, 1) - lev)) | (np.sign(h - lev) != np.sign(np.roll(h, 1, 0) - lev))
        img[m] = img[m] * 0.4 + np.array([0.1, 0.25, 0.35]) * 0.6
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).resize((W * 5, W * 5), Image.NEAREST)
    d = ImageDraw.Draw(im)

    def P(x, z):
        return ((x - X0) * 5, (z - Z0) * 5)

    for p in pools:
        x, y = P(p["x"], p["z"])
        d.text((x - 20, y - 6), "%s %.1f" % (p["name"][:10], p["spill"]), fill=(255, 255, 255))
    for w in lm["wrecks"]:
        x, y = P(w["x"], w["z"])
        d.rectangle([x - 6, y - 6, x + 6, y + 6], outline=(140, 60, 30), width=3)
    for pd in lm["pads"]:
        x, y = P(pd["x"], pd["z"])
        d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(224, 96, 63))
    for b in lm["town"]:
        x, y = P(b["x"], b["z"])
        d.rectangle([x - 4, y - 4, x + 4, y + 4], fill=(243, 234, 211))
    for k in props["kelp"]:
        x, y = P(k[0], k[2])
        d.point((x, y), fill=(30, 80, 40))
    for c in props["coral"]:
        x, y = P(c[0], c[2])
        d.point((x, y), fill=(255, 120, 90))
    im.save(path)
    print("preview", path)


if __name__ == "__main__":
    main()
