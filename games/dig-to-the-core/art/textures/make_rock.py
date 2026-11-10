"""Hand-painted rock: one tiling texture per layer of the planet (numpy + PIL, no stock art, no noise).

    python3 art/textures/make_rock.py [preview.png]

Writes textures/rock_walls.png: twenty 256 x 256 tiles stacked top to bottom,
imported by Godot as a texture array (rock_walls.png.import: 20 vertical
slices). Slices 0-9 are the ten layers seen on a wall (Topsoil first): flat
beds, each a step lighter or darker than the last, a dark bedding line with a
lit lip under it, and hard-edged stones lying in the beds, each with a lit
top, a shaded underside, one chipped facet and a contact shadow on the rock
below it. Slices 10-19 are the same rock seen on a floor or a roof: no beds,
flat patches, the stones lit from one side.

RGB is the painted colour, one main colour per layer (Bedrock is grey). A
marks the lines that catch or give light: quartz veins in the Crystal Caves,
glowing cracks and seams from the Lava Lakes down (zero elsewhere).

Each wall tile's top and bottom edge is a straight bedding line, so the rock
shader can slide every 2 m row sideways by its own amount without a visible
seam (that breaks up the repeat). The folded Mantle is the exception: its
beds run off the tile's edges, so it tiles plainly.

Everything is drawn at 512 px as flat shapes and scaled down, so edges stay
crisp: the only "texture" is what a painter would put there.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "textures"))
P = 512          # painted at
N = 256          # written at
YY, XX = np.mgrid[0:P, 0:P]


def C(*c):
    return np.array(c, float)


# --- Drawing helpers ---------------------------------------------------------------------------
def poly_wrapped(draw, pts, fill):
    """A polygon drawn so it wraps round the tile's edges."""
    for ox in (-P, 0, P):
        for oy in (-P, 0, P):
            draw.polygon([(x + ox, y + oy) for (x, y) in pts], fill=fill)


def line_wrapped(draw, pts, fill, width):
    for ox in (-P, 0, P):
        for oy in (-P, 0, P):
            draw.line([(x + ox, y + oy) for (x, y) in pts], fill=fill, width=width, joint="curve")


def stone_outline(rng, cx, cy, r, flat=0.7, verts=(6, 9), jag=0.28, rot=0.25):
    """An irregular, hard-edged stone: a jittered polygon squashed to lie in
    its bed and tipped a little."""
    n = int(rng.integers(verts[0], verts[1] + 1))
    a0 = rng.uniform(0, math.tau)
    tilt = rng.uniform(-rot, rot)
    pts = []
    for i in range(n):
        a = a0 + math.tau * (i + rng.uniform(-0.3, 0.3)) / n
        rr = r * rng.uniform(1.0 - jag, 1.0)
        x, y = math.cos(a) * rr, math.sin(a) * rr * flat
        xr = x * math.cos(tilt) - y * math.sin(tilt)
        yr = x * math.sin(tilt) + y * math.cos(tilt)
        pts.append((cx + xr, cy + yr))
    return pts


def edge_dist(label, dy, dx, kmax):
    """For every pixel, how many steps (1..kmax) towards (dy, dx) until the
    label changes; kmax + 1 if it doesn't within kmax."""
    d = np.full(label.shape, kmax + 1, np.int32)
    for j in range(1, kmax + 1):
        other = np.roll(np.roll(label, j * dy, 0), j * dx, 1)
        hit = (other != label) & (d > kmax)
        d[hit] = j
    return d


def shade_stones(img, label, cols, rims, facets, light=(1, 0), floor=False, outline=0.62, lit=1.2, under=0.7,
                 shadow=0.62, shadow_len=None):
    """Paints the stones in `label` (0 = matrix) onto img: flat colour, a lit
    rim on the side facing the light, a shaded rim opposite, a chipped facet,
    a dark edge underneath and a contact shadow on the matrix beyond."""
    mask = label > 0
    if not mask.any():
        return img
    kmax = int(max(rims.max(), 2))
    # Light comes from above on a wall, from the upper left on a floor:
    # pixels near the edge facing it are lit, those near the far edge shaded.
    # (edge_dist(label, 1, 0) looks at the pixels above.)
    lx = 1 if floor else 0
    d_lit = edge_dist(label, 1, lx, kmax)
    d_dark = edge_dist(label, -1, -lx, kmax)
    rim = rims[label]
    col = cols[label]
    f = np.ones(label.shape)
    f = np.where(d_lit <= rim, lit, f)
    f = np.where((d_dark <= np.maximum(1, (rim * 0.8).astype(int))) & (d_lit > rim), under, f)
    f = np.where(d_dark <= 1, outline, f)
    # chipped facet: one straight cut across each stone, a value step
    fx, fy, fc, fv = facets[0][label], facets[1][label], facets[2][label], facets[3][label]
    side = (XX * fx + YY * fy - fc)
    # wrapped stones: take the side relative to the stone's own centre (fc is set so the centre is at 0)
    side = ((side + P * 0.5) % P) - P * 0.5
    f = np.where((side > 0) & (f == 1.0), fv, f)
    out = img.copy()
    out[mask] = (col * f[..., None])[mask]
    # contact shadow: the matrix just below (and a little across from) a stone
    sl = 4 if shadow_len is None else shadow_len
    sh = np.zeros(label.shape, bool)
    sdy, sdx = (1, 0) if not floor else (1, 1)
    for j in range(1, sl + 1):
        sh |= np.roll(np.roll(mask, j * sdy, 0), (j // 2) * sdx if not floor else j * sdx, 1)
    sh &= ~mask
    out[sh] *= shadow
    return out


def wiggle_line(rng, x0, y0, x1, y1, steps, amp):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        if 0 < i < steps:
            x += rng.uniform(-amp, amp)
            y += rng.uniform(-amp, amp)
        pts.append((x, y))
    return pts


# --- Beds ----------------------------------------------------------------------------------------
class Beds:
    """Bedding: curves across the tile. The first is straight at y = 0 (the
    tile's seam) unless the layer is folded."""

    def __init__(self, rng, tmin, tmax, amp, fold=0.0):
        ys = [0.0]
        while ys[-1] + tmax < P - tmin * 0.5:
            ys.append(ys[-1] + rng.uniform(tmin, tmax))
        # stretch so the last bed ends exactly at the tile's bottom
        k = P / (ys[-1] + rng.uniform(tmin, tmax))
        ys = [y * k for y in ys]
        x = np.arange(P)
        fphase = rng.uniform(0, math.tau)
        foldc = fold * (np.sin(x / P * math.tau + fphase) * 0.75 + np.sin(x / P * math.tau * 2 + fphase * 1.7) * 0.25)
        self.curves = []
        for i, y in enumerate(ys):
            if i == 0:
                c = np.zeros(P)
            else:
                n = int(rng.integers(1, 4))
                c = amp * rng.uniform(0.3, 1.0) * np.sin(x / P * math.tau * n + rng.uniform(0, math.tau))
            self.curves.append(y + c + foldc)
        self.curves.append(self.curves[0] + P)
        cs = np.array(self.curves)                       # (K + 1, P)
        self.count = len(self.curves) - 1
        idx = (YY[None, :, :] >= cs[:, None, :]).sum(0) - 1
        # above the first curve (a fold pushes it down): that's the last bed of the tile above
        self.index = np.where(idx < 0, self.count - 1, idx) % self.count
        top = cs[self.index, XX]
        top = np.where(YY < top, top - P, top)
        bot = cs[self.index + 1, XX]
        bot = np.where(bot - top > P, bot - P, bot)
        self.d_top = YY - top                             # pixels below this bed's top line
        self.thick = np.maximum(bot - top, 1.0)

    def centre(self, bed, frac):
        """Points along a bed (x, y) at a fraction of its thickness."""
        a = self.curves[bed]
        b = self.curves[bed + 1]
        return a + (b - a) * frac


def paint_beds(rng, base, beds, vals, line_dark=0.58, lip=1.1, line_w=3, lip_w=3, top_light=0.05, hue=0.03,
               skip_line=0.0):
    """Flat fills, a step lighter or darker per bed, a two-step light at the
    top of each bed, the bedding line and its lit lip."""
    k = beds.count
    bedv = np.array([vals[i % len(vals)] * rng.uniform(0.97, 1.03) for i in range(k)])
    bedh = np.array([[1.0 + rng.uniform(-hue, hue) for _ in range(3)] for _ in range(k)])
    img = base[None, None, :] * bedv[beds.index][..., None] * bedh[beds.index]
    frac = beds.d_top / beds.thick
    img *= np.where(frac < 0.22, 1.0 + top_light, np.where(frac < 0.5, 1.0 + top_light * 0.4, 1.0))[..., None]
    drawn = np.array([rng.random() >= skip_line for _ in range(k)])
    drawn[0] = True
    on = drawn[beds.index]
    img = np.where(((beds.d_top < line_w) & on)[..., None], img * line_dark, img)
    img = np.where(((beds.d_top >= line_w) & (beds.d_top < line_w + lip_w) & on)[..., None], img * lip, img)
    return img


def lenses(rng, img, beds, count, val_range=(0.93, 1.07), length=(40, 150), thick=(3, 8)):
    """Long flat lenses of a slightly different rock along the beds: painted
    strokes, hard edged."""
    lab = Image.new("I", (P, P), 0)
    d = ImageDraw.Draw(lab)
    vals = [1.0]
    for i in range(count):
        bed = int(rng.integers(0, beds.count))
        frac = rng.uniform(0.3, 0.8)
        x0 = rng.uniform(0, P)
        L = rng.uniform(*length)
        t = rng.uniform(*thick)
        steps = 10
        top, bottom = [], []
        cy = beds.centre(bed, frac)
        for s in range(steps + 1):
            u = s / steps
            x = x0 + L * u
            yc = cy[int(x) % P]
            h = t * (1.0 - (2 * u - 1) ** 2) ** 0.7
            top.append((x, yc - h * 0.5))
            bottom.append((x, yc + h * 0.5))
        poly_wrapped(d, top + bottom[::-1], i + 1)
        vals.append(rng.uniform(*val_range))
    lab = np.asarray(lab, np.int32)
    v = np.array(vals)[lab]
    return img * v[..., None]


def specks(rng, img, count, val=(0.85, 1.15), size=(1, 2)):
    """A few grains of sand: tiny hard dots, sparse (this is not noise)."""
    for _ in range(count):
        x, y = int(rng.integers(0, P)), int(rng.integers(0, P))
        s = int(rng.integers(size[0], size[1] + 1))
        v = rng.uniform(*val)
        ys = np.arange(y, y + s) % P
        xs = np.arange(x, x + s) % P
        img[np.ix_(ys, xs)] *= v
    return img


# --- Stones --------------------------------------------------------------------------------------
class Stones:
    def __init__(self):
        self.lab = Image.new("I", (P, P), 0)
        self.d = ImageDraw.Draw(self.lab)
        self.cols = [C(0, 0, 0)]
        self.rims = [0]
        self.fac = [[0.0], [0.0], [0.0], [1.0]]
        self.n = 0

    def add(self, rng, pts, col, rim, facet_val=None):
        self.n += 1
        poly_wrapped(self.d, pts, self.n)
        self.cols.append(np.array(col, float))
        self.rims.append(int(rim))
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        a = rng.uniform(0, math.tau)
        fx, fy = math.cos(a), math.sin(a)
        off = rng.uniform(0.1, 0.5) * rim * 2.5
        self.fac[0].append(fx)
        self.fac[1].append(fy)
        self.fac[2].append(cx * fx + cy * fy + off)
        self.fac[3].append(facet_val if facet_val is not None else rng.choice([0.9, 1.08]))

    def paint(self, img, floor=False, **kw):
        lab = np.asarray(self.lab, np.int32)
        cols = np.array(self.cols)
        rims = np.array(self.rims)
        fac = [np.array(f) for f in self.fac]
        return shade_stones(img, lab, cols, rims, fac, floor=floor, **kw), lab


def pick(rng, cols, jitter=0.06):
    c = np.array(cols[int(rng.integers(0, len(cols)))], float)
    return c * rng.uniform(1 - jitter, 1 + jitter)


def scatter_in_beds(rng, st, beds, count, r, cols, flat=(0.5, 0.75), pebbly=0.4, verts=(6, 9), jag=0.28, rot=0.25):
    """Stones lying in the beds: most beds carry a few, some are full."""
    k = beds.count
    weight = np.array([4.0 if rng.random() < pebbly else 0.6 for _ in range(k)])
    weight /= weight.sum()
    for _ in range(count):
        bed = int(rng.choice(k, p=weight))
        x = rng.uniform(0, P)
        cy = beds.centre(bed, rng.uniform(0.35, 0.85))[int(x) % P]
        rr = rng.uniform(*r)
        pts = stone_outline(rng, x, cy, rr, rng.uniform(*flat), verts, jag, rot)
        st.add(rng, pts, pick(rng, cols), max(2, rr * 0.22))


def scatter_free(rng, st, count, r, cols, flat=(0.75, 1.0), verts=(6, 9), jag=0.28):
    for _ in range(count):
        x, y = rng.uniform(0, P), rng.uniform(0, P)
        rr = rng.uniform(*r)
        pts = stone_outline(rng, x, y, rr, rng.uniform(*flat), verts, jag, rot=math.pi)
        st.add(rng, pts, pick(rng, cols), max(2, rr * 0.25))


def patches(rng, base, cells, vals, hue=0.02):
    """Flat patches for a floor: jittered cells, each its own flat value."""
    n = cells
    px = (np.arange(n)[None, :] + 0.5 + rng.uniform(-0.4, 0.4, (n, n))) * P / n
    py = (np.arange(n)[:, None] + 0.5 + rng.uniform(-0.4, 0.4, (n, n))) * P / n
    best = np.full((P, P), 1e9)
    cid = np.zeros((P, P), int)
    for j in range(n):
        for i in range(n):
            dx = (XX - px[j, i] + P / 2) % P - P / 2
            dy = (YY - py[j, i] + P / 2) % P - P / 2
            dd = dx * dx * 1.0 + dy * dy
            closer = dd < best
            best = np.where(closer, dd, best)
            cid = np.where(closer, j * n + i, cid)
    v = np.array([vals[int(rng.integers(0, len(vals)))] for _ in range(n * n)])
    h = np.array([[1 + rng.uniform(-hue, hue) for _ in range(3)] for _ in range(n * n)])
    return base[None, None, :] * v[cid][..., None] * h[cid], cid


def draw_mask(fn):
    im = Image.new("L", (P, P), 0)
    fn(ImageDraw.Draw(im))
    return np.asarray(im, float) / 255.0


# --- Features ------------------------------------------------------------------------------------
def roots(rng, img, count, col, floor=False):
    """Thin dark roots wandering down through the soil, tapering, branching."""
    def draw(d):
        for _ in range(count):
            x, y = rng.uniform(0, P), rng.uniform(0, P)
            a = math.pi / 2 + rng.uniform(-0.5, 0.5) if not floor else rng.uniform(0, math.tau)
            w = rng.uniform(2.5, 5.0)
            for _s in range(int(rng.integers(10, 22))):
                nx, ny = x + math.cos(a) * 9, y + math.sin(a) * 9
                line_wrapped(d, [(x, y), (nx, ny)], 255, max(1, int(round(w))))
                if rng.random() < 0.18:
                    b = a + rng.choice([-1, 1]) * rng.uniform(0.6, 1.1)
                    bx, by = nx, ny
                    for _t in range(int(rng.integers(2, 6))):
                        cx, cy = bx + math.cos(b) * 7, by + math.sin(b) * 7
                        line_wrapped(d, [(bx, by), (cx, cy)], 255, 1)
                        bx, by = cx, cy
                        b += rng.uniform(-0.4, 0.4)
                x, y = nx, ny
                a += rng.uniform(-0.35, 0.35)
                if not floor:
                    a = a * 0.85 + (math.pi / 2) * 0.15
                w *= 0.92
    m = draw_mask(draw) > 0.5
    img[m] = col
    # a lit edge on the left of each root (the lamp's above and to the side)
    lit = np.roll(m, -1, 1) & ~m
    img[lit] *= 1.12
    return img


def shells(rng, img, count, col, line, r=(5, 12)):
    """Shell sections in sandstone: little cream crescents with a dark inner
    line, a few lying open."""
    def crescent(d, cx, cy, rr, a, fill):
        pts = []
        for i in range(13):
            t = math.pi * i / 12
            pts.append((cx + math.cos(t + a) * rr, cy - math.sin(t + a) * rr * 0.62))
        for i in range(12, -1, -1):
            t = math.pi * i / 12
            pts.append((cx + math.cos(t + a) * rr * 0.72, cy - math.sin(t + a) * rr * 0.62 * 0.45))
        poly_wrapped(d, pts, fill)

    lab = Image.new("L", (P, P), 0)
    edge = Image.new("L", (P, P), 0)
    d = ImageDraw.Draw(lab)
    e = ImageDraw.Draw(edge)
    for _ in range(count):
        cx, cy, rr = rng.uniform(0, P), rng.uniform(0, P), rng.uniform(*r)
        a = rng.uniform(-0.4, 0.4) + (math.pi if rng.random() < 0.35 else 0)
        crescent(d, cx, cy, rr, a, 255)
        crescent(e, cx, cy + 1.5, rr, a, 255)
    m = np.asarray(lab) > 127
    me = (np.asarray(edge) > 127) & ~m
    img[me] *= 0.62
    img[m] = col * rng.uniform(0.95, 1.05)
    # the inner line of each shell
    inner = m & ~np.roll(m, 2, 0)
    img[inner] = line
    return img


def ammonite_section(rng, img, cx, cy, r, col, line):
    """A small ammonite cut through: a flat cream disc with a spiral line and
    its chambers."""
    def draw(d):
        for ox in (-P, 0, P):
            for oy in (-P, 0, P):
                d.ellipse([cx - r + ox, cy - r * 0.92 + oy, cx + r + ox, cy + r * 0.92 + oy], fill=255)
    m = draw_mask(draw) > 0.5
    sh = np.roll(np.roll(m, 3, 0), 1, 1) & ~m
    img[sh] *= 0.6
    img[m] = col
    lit = m & ~np.roll(m, 2, 0)
    img[lit] *= 1.15

    def spiral(d):
        pts = []
        for i in range(120):
            t = i / 119 * 4.2 * math.pi
            rr = r * 0.95 * math.exp(-0.16 * t)
            pts.append((cx + math.cos(t) * rr, cy + math.sin(t) * rr * 0.92))
        line_wrapped(d, pts, 255, 2)
        for k in range(14):
            t = k / 14 * 2 * math.pi
            r0 = r * 0.95 * math.exp(-0.16 * t)
            r1 = r * 0.95 * math.exp(-0.16 * (t + 2 * math.pi))
            line_wrapped(d, [(cx + math.cos(t) * r0, cy + math.sin(t) * r0 * 0.92),
                             (cx + math.cos(t) * r1, cy + math.sin(t) * r1 * 0.92)], 255, 1)
    ms = draw_mask(spiral) > 0.4
    img[ms & m] = line
    return img


def joints(rng, img, beds, per_bed, dark=0.5, lit=1.15, width=2):
    """Joints across beds: a dark crack with a lit edge on one side, leaning,
    kinked, most stopping short of the next bed (never a brick wall)."""
    def draw(d):
        for b in range(beds.count):
            for _ in range(int(rng.integers(per_bed[0], per_bed[1] + 1))):
                x = rng.uniform(0, P)
                y0 = beds.curves[b][int(x) % P] + 2
                y1 = beds.curves[b + 1][int(x) % P] - 1
                if rng.random() < 0.6:
                    y1 = y0 + (y1 - y0) * rng.uniform(0.35, 0.8)
                pts = wiggle_line(rng, x, y0, x + rng.uniform(-18, 18), y1, 4, 2.5)
                line_wrapped(d, pts, 255, width)
    m = draw_mask(draw) > 0.5
    img[m] *= dark
    e = np.roll(m, 1, 1) & ~m
    img[e] *= lit
    return img


def cracks(rng, n, start_len, width=(2, 4), branch=0.3, floor=False, vertical=False):
    """Jagged cracks (a mask): random walks that fork and thin out."""
    def draw(d):
        for _ in range(n):
            x, y = rng.uniform(0, P), rng.uniform(0, P)
            a = rng.uniform(0, math.tau) if not vertical else math.pi / 2 + rng.uniform(-0.4, 0.4)
            stack = [(x, y, a, rng.uniform(*width), start_len)]
            while stack:
                x, y, a, w, L = stack.pop()
                for _s in range(int(L)):
                    st = rng.uniform(6, 13)
                    nx, ny = x + math.cos(a) * st, y + math.sin(a) * st
                    line_wrapped(d, [(x, y), (nx, ny)], 255, max(1, int(round(w))))
                    x, y = nx, ny
                    a += rng.uniform(-0.7, 0.7)
                    if vertical:
                        a = a * 0.7 + (math.pi / 2) * 0.3
                    if rng.random() < branch * 0.25 and w > 1.2:
                        stack.append((x, y, a + rng.choice([-1, 1]) * rng.uniform(0.6, 1.2), w * 0.6, L * 0.5))
                    w *= 0.96
    return draw_mask(draw) > 0.5


# --- The ten layers ------------------------------------------------------------------------------
# Each returns (wall rgb, wall a, floor rgb, floor a), all P x P.

def topsoil(rng):
    base = C(0.40, 0.275, 0.17)
    beds = Beds(rng, 26, 60, 4)
    img = paint_beds(rng, base, beds, [1.0, 0.9, 1.06, 0.95, 0.86, 1.02], line_dark=0.66, lip=1.07, line_w=2, lip_w=2,
                     skip_line=0.3)
    img = lenses(rng, img, beds, 26, (0.9, 1.08))
    img = roots(rng, img, 9, C(0.2, 0.135, 0.085))
    st = Stones()
    cols = [C(0.56, 0.5, 0.42), C(0.46, 0.4, 0.34), C(0.64, 0.56, 0.44), C(0.36, 0.3, 0.26)]
    scatter_in_beds(rng, st, beds, 70, (5, 15), cols, pebbly=0.35)
    img, _ = st.paint(img)
    img = specks(rng, img, 500, (0.82, 1.18))
    wall_a = np.zeros((P, P))
    fl, _ = patches(rng, base, 4, [1.0, 0.97, 1.03, 0.95])
    fl = roots(rng, fl, 7, C(0.2, 0.135, 0.085), floor=True)
    st = Stones()
    scatter_free(rng, st, 55, (5, 14), cols)
    fl, _ = st.paint(fl, floor=True)
    fl = specks(rng, fl, 500, (0.82, 1.18))
    return img, wall_a, fl, np.zeros((P, P))


def clay(rng):
    base = C(0.66, 0.38, 0.235)
    beds = Beds(rng, 16, 34, 2.5)
    img = paint_beds(rng, base, beds, [1.0, 0.93, 1.05, 0.97, 0.9, 1.03, 0.96], line_dark=0.74, lip=1.06, line_w=2,
                     lip_w=2, top_light=0.03)
    # fine laminations: thin flat lines inside the beds
    lam = np.zeros((P, P), bool)
    for b in range(beds.count):
        nlam = int(rng.integers(1, 4))
        for _ in range(nlam):
            cy = beds.centre(b, rng.uniform(0.3, 0.9))
            yy = np.round(cy).astype(int) % P
            x0 = int(rng.integers(0, P))
            L = int(rng.integers(P // 3, P))
            xs = (np.arange(L) + x0) % P
            lam[yy[xs], xs] = True
    img[lam] *= 0.86
    img = lenses(rng, img, beds, 18, (0.9, 1.06), (60, 200), (3, 7))
    # spatula smears: a few short flat strokes, lighter, where the clay was cut
    def smear(d):
        for _ in range(9):
            x, y = rng.uniform(0, P), rng.uniform(0, P)
            L, h = rng.uniform(30, 70), rng.uniform(4, 8)
            sk = rng.uniform(-0.2, 0.2)
            pts = [(x, y), (x + L, y + L * sk), (x + L - 6, y + L * sk + h), (x - 4, y + h)]
            poly_wrapped(d, pts, 255)
    sm = draw_mask(smear) > 0.5
    img[sm] *= 1.06
    st = Stones()
    scatter_in_beds(rng, st, beds, 14, (4, 9), [C(0.55, 0.47, 0.4), C(0.48, 0.36, 0.28)], pebbly=0.2)
    img, _ = st.paint(img)
    fl, _ = patches(rng, base, 4, [1.0, 0.97, 1.025, 0.95])
    st = Stones()
    scatter_free(rng, st, 12, (4, 9), [C(0.55, 0.47, 0.4), C(0.48, 0.36, 0.28)])
    fl, _ = st.paint(fl, floor=True)
    # drying cracks on a floor: a few, not a crazed net
    m = cracks(rng, 5, 7, (1.5, 2.5), 0.4)
    fl[m] *= 0.62
    return img, np.zeros((P, P)), fl, np.zeros((P, P))


def bedrock(rng):
    base = C(0.48, 0.48, 0.47)
    beds = Beds(rng, 28, 96, 5)
    img = paint_beds(rng, base, beds, [1.0, 0.92, 1.06, 0.96, 0.88, 1.03], line_dark=0.56, lip=1.1, line_w=2, lip_w=3,
                     top_light=0.06, hue=0.012, skip_line=0.3)
    img = lenses(rng, img, beds, 20, (0.93, 1.06), (50, 180), (4, 10))
    img = joints(rng, img, beds, (0, 1), 0.52, 1.14, 2)
    st = Stones()
    cols = [C(0.62, 0.62, 0.6), C(0.4, 0.4, 0.41), C(0.55, 0.54, 0.52), C(0.7, 0.69, 0.66)]
    scatter_in_beds(rng, st, beds, 34, (8, 24), cols, flat=(0.55, 0.85), pebbly=0.4, verts=(4, 6), jag=0.2, rot=0.4)
    img, _ = st.paint(img, lit=1.22, under=0.7)
    img = specks(rng, img, 400, (0.85, 1.15))
    fl, _ = patches(rng, base, 4, [1.0, 0.965, 1.03, 0.945])
    m = cracks(rng, 6, 9, (2, 3.5), 0.4)
    fl[m] *= 0.5
    st = Stones()
    scatter_free(rng, st, 40, (7, 20), cols, verts=(4, 6), jag=0.2)
    fl, _ = st.paint(fl, floor=True)
    return img, np.zeros((P, P)), fl, np.zeros((P, P))


def fossil_bed(rng):
    base = C(0.76, 0.655, 0.47)
    beds = Beds(rng, 22, 54, 3.5)
    img = paint_beds(rng, base, beds, [1.0, 0.92, 1.05, 0.96, 0.88, 1.02], line_dark=0.62, lip=1.08, line_w=2, lip_w=3)
    img = lenses(rng, img, beds, 24, (0.92, 1.06))
    shell = C(0.93, 0.88, 0.76)
    line = C(0.42, 0.33, 0.22)
    img = shells(rng, img, 46, shell, line, (5, 11))
    for _ in range(3):
        img = ammonite_section(rng, img, rng.uniform(0, P), rng.uniform(0, P), rng.uniform(12, 20), shell * 0.97, line)
    st = Stones()
    scatter_in_beds(rng, st, beds, 26, (4, 10), [C(0.62, 0.52, 0.38), C(0.85, 0.78, 0.64)], pebbly=0.3)
    img, _ = st.paint(img)
    img = specks(rng, img, 700, (0.86, 1.14))
    fl, _ = patches(rng, base, 4, [1.0, 0.97, 1.03, 0.95])
    fl = shells(rng, fl, 50, shell, line, (5, 11))
    for _ in range(2):
        fl = ammonite_section(rng, fl, rng.uniform(0, P), rng.uniform(0, P), rng.uniform(12, 18), shell * 0.97, line)
    fl = specks(rng, fl, 700, (0.86, 1.14))
    return img, np.zeros((P, P)), fl, np.zeros((P, P))


def graveyard(rng):
    base = C(0.62, 0.44, 0.245)
    beds = Beds(rng, 40, 90, 4)
    img = paint_beds(rng, base, beds, [1.0, 0.92, 1.05, 0.95], line_dark=0.6, lip=1.08, line_w=2, lip_w=3)
    st = Stones()
    cols = [C(0.74, 0.64, 0.48), C(0.52, 0.4, 0.28), C(0.66, 0.5, 0.32), C(0.82, 0.74, 0.58), C(0.45, 0.36, 0.3)]
    # a conglomerate: rounded cobbles of every size packed into some beds
    scatter_in_beds(rng, st, beds, 60, (6, 26), cols, flat=(0.6, 0.85), pebbly=0.5, verts=(8, 11), jag=0.14, rot=0.3)
    # bone fragments: a long shaft with knobbly ends
    bone = C(0.88, 0.81, 0.66)
    for _ in range(5):
        x, y = rng.uniform(0, P), rng.uniform(0, P)
        L, w = rng.uniform(22, 44), rng.uniform(4, 6)
        a = rng.uniform(-0.35, 0.35)
        ca, sa = math.cos(a), math.sin(a)
        pts = []
        prof = [(-0.5, 1.6), (-0.42, 1.9), (-0.36, 1.0), (0.36, 0.9), (0.42, 1.8), (0.5, 1.5)]
        for u, h in prof:
            pts.append((x + ca * u * L - sa * h * w * 0.5, y + sa * u * L + ca * h * w * 0.5))
        for u, h in reversed(prof):
            pts.append((x + ca * u * L + sa * h * w * 0.5, y + sa * u * L - ca * h * w * 0.5))
        st.add(rng, pts, bone * rng.uniform(0.93, 1.03), 2, 1.0)
    img, _ = st.paint(img, lit=1.2, under=0.72, shadow_len=5)
    img = specks(rng, img, 500, (0.86, 1.14))
    fl, _ = patches(rng, base, 4, [1.0, 0.965, 1.03, 0.945])
    st = Stones()
    scatter_free(rng, st, 55, (6, 24), cols, verts=(8, 11), jag=0.14)
    fl, _ = st.paint(fl, floor=True, shadow_len=5)
    return img, np.zeros((P, P)), fl, np.zeros((P, P))


def veins(rng, n, width=(10, 16)):
    """Quartz veins: long straight runs that kink once or twice, with crystal
    teeth growing off them (a mask)."""
    def draw(d):
        for _ in range(n):
            x, y = rng.uniform(0, P), rng.uniform(0, P)
            a = rng.uniform(-0.5, 0.5) + (math.pi if rng.random() < 0.5 else 0)
            w = rng.uniform(*width)
            pts = [(x, y)]
            for _s in range(int(rng.integers(2, 3))):
                L = rng.uniform(90, 170)
                nx, ny = x + math.cos(a) * L, y + math.sin(a) * L
                # crystal teeth: little pointed blades standing off the vein
                for _t in range(0):
                    u = rng.uniform(0.15, 0.85)
                    bx, by = x + (nx - x) * u, y + (ny - y) * u
                    side = rng.choice([-1, 1])
                    ta = a + side * rng.uniform(1.1, 1.5)
                    tl = rng.uniform(12, 22)
                    tw = rng.uniform(5, 8)
                    tip = (bx + math.cos(ta) * tl, by + math.sin(ta) * tl)
                    poly_wrapped(d, [(bx - math.cos(a) * tw, by - math.sin(a) * tw), tip,
                                     (bx + math.cos(a) * tw, by + math.sin(a) * tw)], 255)
                x, y = nx, ny
                pts.append((x, y))
                a += rng.uniform(-0.7, 0.7)
            line_wrapped(d, pts, 255, max(1, int(round(w))))
    return draw_mask(draw) > 0.5


def crystal_caves(rng):
    base = C(0.27, 0.23, 0.35)
    beds = Beds(rng, 50, 120, 6)
    img = paint_beds(rng, base, beds, [1.0, 0.88, 1.08, 0.94], line_dark=0.6, lip=1.14, line_w=3, lip_w=2,
                     top_light=0.06)
    st = Stones()
    cols = [C(0.36, 0.31, 0.47), C(0.22, 0.19, 0.29), C(0.42, 0.36, 0.55)]
    scatter_in_beds(rng, st, beds, 40, (8, 24), cols, flat=(0.6, 1.0), pebbly=0.5, verts=(3, 5), jag=0.15, rot=0.8)
    img, _ = st.paint(img, lit=1.3, under=0.7)
    v = veins(rng, 3)
    vc = C(0.3, 0.48, 0.5)
    img[v] = vc
    img[v & ~np.roll(v, 3, 0)] = vc * 1.3                          # the lit upper edge
    img[v & ~np.roll(v, -3, 0)] = vc * 0.7                         # the shaded lower edge
    sel = (np.roll(v, 3, 0) | np.roll(v, -3, 0) | np.roll(v, 3, 1) | np.roll(v, -3, 1)) & ~v
    img[sel] *= 0.7                                                # a dark selvage either side
    a = v.astype(float)
    # little crystal points standing along the veins
    fl, _ = patches(rng, base, 4, [1.0, 0.96, 1.04, 0.94])
    st = Stones()
    scatter_free(rng, st, 36, (8, 22), cols, verts=(3, 5), jag=0.15)
    fl, _ = st.paint(fl, floor=True, lit=1.3)
    vf = veins(rng, 3)
    fl[vf] = vc
    fsel = (np.roll(vf, 3, 0) | np.roll(vf, -3, 0) | np.roll(vf, 3, 1) | np.roll(vf, -3, 1)) & ~vf
    fl[fsel] *= 0.7
    return img, a, fl, vf.astype(float)


def lava_lakes(rng):
    base = C(0.19, 0.165, 0.16)
    beds = Beds(rng, 70, 140, 3)
    img = paint_beds(rng, base, beds, [1.0, 0.94, 1.05], line_dark=0.55, lip=1.25, line_w=3, lip_w=2, top_light=0.08,
                     hue=0.01, skip_line=1.0)
    # columnar basalt: tall joints, the columns' faces each their own flat value
    cols_x = np.sort(rng.uniform(0, P, 6))
    colv = rng.choice([0.88, 1.0, 1.1, 1.2], len(cols_x))
    xi = np.searchsorted(cols_x, XX % P) % len(cols_x)
    img *= colv[xi][..., None]
    def jt(d):
        xs = list(cols_x) + [cols_x[0] + P]
        for i, x in enumerate(cols_x):
            pts = []
            for k in range(9):
                pts.append((x + rng.uniform(-7, 7) * (k % 2 * 2 - 1), -10 + k * (P + 20) / 8))
            line_wrapped(d, pts, 255, 3)
            # cross-fractures inside the column, at uneven heights
            for _ in range(int(rng.integers(1, 4))):
                y = rng.uniform(0, P)
                x1 = xs[i + 1]
                line_wrapped(d, wiggle_line(rng, x + 3, y, x1 - 3, y + rng.uniform(-10, 10), 3, 2), 255, 2)
    jm = draw_mask(jt) > 0.5
    img[jm] *= 0.4
    img[np.roll(jm, 2, 1) & ~jm] *= 1.3
    # a few gas pits: dark, with a lit lower lip (the inverse of a stone)
    def pits(d):
        for _ in range(12):
            x, y, r = rng.uniform(0, P), rng.uniform(0, P), rng.uniform(2.5, 6)
            for ox in (-P, 0, P):
                for oy in (-P, 0, P):
                    d.ellipse([x - r + ox, y - r * 0.8 + oy, x + r + ox, y + r * 0.8 + oy], fill=255)
    pm = draw_mask(pits) > 0.5
    img[pm] *= 0.45
    img[np.roll(pm, 2, 0) & ~pm] *= 1.25
    # glowing cracks following the joints and running across
    cm = cracks(rng, 3, 9, (2.5, 4), 0.3, vertical=True)
    hot = C(0.95, 0.42, 0.1)
    img[cm] = hot * 0.55
    st = Stones()
    scatter_in_beds(rng, st, beds, 20, (6, 16), [C(0.28, 0.25, 0.24), C(0.12, 0.11, 0.1)], verts=(4, 6), jag=0.2)
    img, _ = st.paint(img, lit=1.35, under=0.65)
    # On a floor or a roof: the tops of the columns, a pavement of five- and
    # six-sided slabs, each its own flat value, the joints between them dark
    # with a lit lip on the side away from the light, a few slabs cracked.
    fl, cid = patches(rng, base, 5, [0.88, 0.96, 1.0, 1.08, 1.16])
    joint = np.zeros((P, P), bool)
    joint[:, 1:] |= cid[:, 1:] != cid[:, :-1]
    joint[1:, :] |= cid[1:, :] != cid[:-1, :]
    jm = joint.copy()
    for _ in range(2):
        jm = jm | np.roll(jm, 1, 0) | np.roll(jm, 1, 1)
    fl[jm] *= 0.42
    lip = (np.roll(jm, -2, 0) | np.roll(jm, -2, 1)) & ~jm
    fl[lip] *= 1.22
    cf = cracks(rng, 3, 8, (2.5, 4), 0.3)
    fl[cf] = hot * 0.55
    return img, cm.astype(float), fl, cf.astype(float)


def mantle(rng):
    base = C(0.34, 0.37, 0.19)
    beds = Beds(rng, 22, 46, 3, fold=46)
    img = paint_beds(rng, base, beds, [1.0, 0.86, 1.08, 0.94, 0.8, 1.04], line_dark=0.6, lip=1.1, line_w=2, lip_w=2,
                     top_light=0.05)
    # granular: small angular grains in green-gold and black, along the folds
    st = Stones()
    cols = [C(0.5, 0.52, 0.24), C(0.2, 0.2, 0.12), C(0.44, 0.46, 0.28), C(0.58, 0.55, 0.3)]
    scatter_in_beds(rng, st, beds, 120, (3, 8), cols, flat=(0.6, 0.9), pebbly=0.6, verts=(4, 6), jag=0.2, rot=0.6)
    img, _ = st.paint(img, lit=1.25, under=0.7, shadow_len=3)
    # hot seams: two bedding lines per tile open up and glow, thin and broken
    # into lenses (not every fold line, or the wall reads as a contour map)
    seam = np.zeros((P, P), bool)
    picks = rng.choice(np.arange(1, beds.count), size=min(2, beds.count - 1), replace=False)
    gaps = np.zeros(P, bool)
    x = 0
    while x < P:
        run = int(rng.uniform(50, 150))
        gaps[x:x + run] = True
        x += run + int(rng.uniform(25, 70))
    for b in picks:
        seam |= (beds.index == b) & (beds.d_top < 3) & gaps[XX]
    hot = C(0.95, 0.45, 0.12)
    img[np.roll(seam, 2, 0) & ~seam] *= 0.6      # scorched just under the seam
    img[seam] = hot * 0.5
    fl, _ = patches(rng, base, 4, [1.0, 0.95, 1.04, 0.92])
    st = Stones()
    scatter_free(rng, st, 110, (3, 8), cols, verts=(4, 6), jag=0.2)
    fl, _ = st.paint(fl, floor=True, shadow_len=3)
    cf = cracks(rng, 2, 8, (2.5, 3.5), 0.3)
    fl[cf] = hot * 0.5
    return img, seam.astype(float), fl, cf.astype(float)


def outer_core(rng):
    """Molten iron that has skinned over: a slow flow of dark iron in sagging
    bands, slabs of crust rafting along them, the melt showing hot where the
    skin has torn (along some bands and in short cracks across them)."""
    base = C(0.28, 0.19, 0.13)
    beds = Beds(rng, 26, 60, 6, fold=14)
    img = paint_beds(rng, base, beds, [1.0, 0.88, 1.1, 0.94, 1.04], line_dark=0.62, lip=1.14, line_w=2, lip_w=2,
                     top_light=0.06)
    hot = C(1.0, 0.6, 0.2)
    seam = np.zeros((P, P), bool)
    for b in range(beds.count):
        if rng.random() < 0.4:
            seam |= (beds.index == b) & (beds.d_top < 3)
    st = Stones()
    cols = [C(0.36, 0.25, 0.17), C(0.22, 0.15, 0.11), C(0.32, 0.22, 0.15)]
    scatter_in_beds(rng, st, beds, 26, (14, 36), cols, flat=(0.28, 0.42), pebbly=0.6, verts=(5, 7), jag=0.15, rot=0.08)
    img, lab = st.paint(img, lit=1.28, under=0.68, shadow_len=3)
    cm = cracks(rng, 8, 3, (2, 3), 0.0, vertical=True) & (lab == 0)
    glow = seam | cm
    img[glow] = hot * 0.55
    fl, _ = patches(rng, base, 4, [1.0, 0.94, 1.06, 0.97])
    st = Stones()
    scatter_free(rng, st, 22, (16, 34), cols, flat=(0.5, 0.8), verts=(5, 7), jag=0.15)
    fl, flab = st.paint(fl, floor=True, lit=1.25, shadow_len=3)
    fc = cracks(rng, 5, 8, (2, 3.5), 0.5) & (flab == 0)
    fl[fc] = hot * 0.55
    return img, glow.astype(float), fl, fc.astype(float)


def crystal_blades(rng, count, length, width, cols, lean=0.5):
    """Long six-sided crystals seen side on, packed at angles: each blade is
    split lengthwise into a lit face, a mid face and a shaded face, with a
    pointed termination. Returns (rgb, mask)."""
    img = np.zeros((P, P, 3))
    mask = np.zeros((P, P), bool)
    for _ in range(count):
        cx, cy = rng.uniform(0, P), rng.uniform(0, P)
        a = -math.pi / 2 + rng.uniform(-lean, lean) + (math.pi if rng.random() < 0.3 else 0)
        L, W = rng.uniform(*length), rng.uniform(*width)
        ux, uy = math.cos(a), math.sin(a)
        vx, vy = -uy, ux
        col = pick(rng, cols, 0.05)
        faces = [(-1.0, -0.35, 1.45), (-0.35, 0.35, 1.0), (0.35, 1.0, 0.58)]
        for f0, f1, val in faces:
            def pt(u, v):
                return (cx + ux * u + vx * v * W * 0.5, cy + uy * u + vy * v * W * 0.5)
            tipv = (f0 + f1) * 0.5
            pts = [pt(-L * 0.5, f0), pt(L * 0.5 - W * 0.6 * (1 - abs(f0)), f0), pt(L * 0.5 + W * 0.15, tipv * 0.2),
                   pt(L * 0.5 - W * 0.6 * (1 - abs(f1)), f1), pt(-L * 0.5, f1)]
            m = draw_mask(lambda d: poly_wrapped(d, pts, 255)) > 0.5
            img[m] = col * val
            mask |= m
            edge = m & ~np.roll(m, 1, 0)
            img[edge] = col * val * 0.8
    return img, mask


def gems(rng, count, r, cols):
    """Big cut-looking crystals face on: an irregular polygon split into a fan
    of facets from an off-centre apex, each facet lit by which way it faces
    (upper left bright). Returns (rgb, mask)."""
    img = np.zeros((P, P, 3))
    mask = np.zeros((P, P), bool)
    for _ in range(count):
        cx, cy, rr = rng.uniform(0, P), rng.uniform(0, P), rng.uniform(*r)
        pts = stone_outline(rng, cx, cy, rr, rng.uniform(0.7, 1.0), (5, 7), 0.18, math.pi)
        ax, ay = cx + rng.uniform(-0.25, 0.25) * rr, cy + rng.uniform(-0.25, 0.25) * rr
        col = pick(rng, cols, 0.05)
        for i in range(len(pts)):
            p0, p1 = pts[i], pts[(i + 1) % len(pts)]
            mx, my = (p0[0] + p1[0]) * 0.5 - ax, (p0[1] + p1[1]) * 0.5 - ay
            face = math.atan2(my, mx)
            val = 1.0 + 0.24 * math.cos(face - math.radians(-135))
            tri = [(ax, ay), p0, p1]
            m = draw_mask(lambda d: poly_wrapped(d, tri, 255)) > 0.5
            img[m] = col * val
            mask |= m
    return img, mask


def inner_core(rng):
    """The heart of the planet: bronze crystal blades packed every which way,
    molten amber glowing in the gaps between them."""
    hot = C(1.0, 0.62, 0.22)
    cols = [C(0.52, 0.38, 0.19), C(0.47, 0.34, 0.17), C(0.56, 0.41, 0.21)]
    blades, m = gems(rng, 46, (48, 88), cols)
    img = np.where(m[..., None], blades, hot * 0.5)
    gap = ~m
    # a dark rim where each crystal meets the melt
    rim = (np.roll(m, 2, 0) | np.roll(m, -2, 0) | np.roll(m, 2, 1) | np.roll(m, -2, 1)) & gap
    img[rim] = hot * 0.42
    fb, fm = gems(rng, 46, (48, 88), cols)
    fl = np.where(fm[..., None], fb, hot * 0.5)
    frim = (np.roll(fm, 2, 0) | np.roll(fm, -2, 0) | np.roll(fm, 2, 1) | np.roll(fm, -2, 1)) & ~fm
    fl[frim] = hot * 0.3
    return img, (gap & ~rim).astype(float), fl, (~fm & ~frim).astype(float)


LAYERS = [topsoil, clay, bedrock, fossil_bed, graveyard, crystal_caves, lava_lakes, mantle, outer_core, inner_core]


def down(rgb, a):
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), "RGB").resize((N, N), Image.LANCZOS)
    al = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "L").resize((N, N), Image.LANCZOS)
    return np.dstack([np.asarray(im), np.asarray(al)])


def main():
    walls, floors = [], []
    for i, fn in enumerate(LAYERS):
        rng = np.random.default_rng(1109 + i * 31)
        w, wa, f, fa = fn(rng)
        walls.append(down(w, wa))
        floors.append(down(f, fa))
        print("painted", fn.__name__)
    sheet = np.concatenate(walls + floors, 0)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "rock_walls.png")
    Image.fromarray(sheet.astype(np.uint8), "RGBA").save(path)
    print("wrote", path)
    if len(sys.argv) > 1:
        # Preview: each layer's wall 2 x 2 tiled over its floor, glow lines lit.
        cells = []
        for w, f in zip(walls, floors):
            def lit(t):
                rgb = t[..., :3].astype(float) / 255
                a = t[..., 3:4].astype(float) / 255
                return np.clip(rgb + a * 0.35, 0, 1)
            col = np.concatenate([np.tile(lit(w), (2, 2, 1)), np.tile(lit(f), (1, 2, 1))], 0)
            cells.append(col)
        rows = [np.concatenate(cells[i:i + 5], 1) for i in (0, 5)]
        prev = np.concatenate(rows, 0)
        Image.fromarray((prev * 255).astype(np.uint8)).save(sys.argv[1])
        print("preview", sys.argv[1])


if __name__ == "__main__":
    main()
