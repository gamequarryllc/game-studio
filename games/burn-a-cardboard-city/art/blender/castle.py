"""The cardboard castle in the middle of the city, built from egg boxes and the
tubes out of toilet rolls and kitchen rolls, standing on a pallet.

Walls are egg-box lids stood on edge, drawn on with marker bricks, with egg cups cut
out of a grey carton standing along the top for battlements (a gap between each,
their cut rims still pointed where the carton's posts were). Turrets are kitchen-roll
and toilet-roll tubes, the spiral seam of the wound paper showing, under cones rolled
from printed cereal-box card, the overlap seam held down with masking tape. The gatehouse is a half-dozen egg box with its lid let down for a
drawbridge between two toilet rolls. The keep is a big box under an upturned
30-egg tray, toilet-roll towers on its corners and a kitchen roll in the middle
with a flag on a skewer (burning it is the ending).

The castle sits in a 30x30-cell (15 m) yard. Wall pieces run along X; the game
turns them for the east and west sides.
"""
import math

import bmesh
from kit import (BLUE, CARD, CEREAL_IN, EGG_PULP, EGG_PULP_DARK, INSIDE, KRAFT, KRAFT_DARK, KRAFT_EDGE, PAPER, RED, ROLL,
                 ROLL_SEAM, SHINY, TAPE_COL, YELLOW, Model, srgb)
from mathutils import Euler, Matrix, Vector, noise

FRONT = (0, -1, 0)
BACK = (0, 1, 0)
UP = (0, 0, 1)
CONE_GREEN = srgb("#4f8a3c")


CUP_GREY = srgb("#a9a59c")        # grey moulded pulp, the carton the cups were cut from
CUP_GREY_DARK = srgb("#86827a")


def cut_cup(m, c, r, h, color=CUP_GREY, inside=CUP_GREY_DARK, twist=0.0):
    """One egg cup cut out of a carton, stood open side up: a four-lobed cup with a
    rounded bottom, its scissor-cut rim rising to four points where the carton's posts
    were, fuzzy grey pulp, a darker hollow inside."""
    x, y, z = c
    N, R = 16, 5
    wall = 0.022
    rng = m.rng
    jit = [rng.uniform(-0.06, 0.06) for _ in range(N)]
    m._begin()
    bm = m.bm

    def ring(j, inset):
        t = j / R
        prof = math.sin(min(1.0, t / 0.55) * math.pi * 0.5)       # rounded bottom, then nearly straight sides
        rr = (r * (0.42 + 0.58 * prof) * (1.0 + 0.06 * t)) - inset
        out = []
        for k in range(N):
            a = k / N * math.tau + twist
            lobe = 1.0 + 0.11 * math.cos(4.0 * a)
            zt = h * t
            if j == R:
                peak = max(0.0, math.cos(4.0 * a + math.pi / 4.0)) ** 3
                zt = h * (1.0 + 0.3 * peak + jit[k])
            out.append(bm.verts.new((x + math.cos(a) * rr * lobe, y + math.sin(a) * rr * lobe, z + zt - (inset * 0.6 if j < R else 0.0))))
        return out
    outer = [ring(j, 0.0) for j in range(R + 1)]
    inner = [ring(j, wall) for j in range(2, R + 1)]
    for j in range(R):
        for k in range(N):
            a, b = outer[j][k], outer[j][(k + 1) % N]
            cc, d = outer[j + 1][(k + 1) % N], outer[j + 1][k]
            bm.faces.new((a, b, cc, d))
    for j in range(len(inner) - 1):
        for k in range(N):
            a, b = inner[j][k], inner[j][(k + 1) % N]
            cc, d = inner[j + 1][(k + 1) % N], inner[j + 1][k]
            bm.faces.new((d, cc, b, a))
    for k in range(N):
        a, b = outer[R][k], outer[R][(k + 1) % N]
        cc, d = inner[-1][(k + 1) % N], inner[-1][k]
        bm.faces.new((a, b, cc, d))
    bm.faces.new(list(reversed(outer[0])))
    bm.faces.new(inner[0])
    faces = m._new()
    for f in faces:
        f.normal_update()
    off = Vector((m.seed * 1.3, x * 3.1, y * 2.7))

    def fn(p, n):
        q = Vector((p.x - x, p.y - y, p.z - z))
        fuzz = 0.9 + 0.16 * noise.noise(p * 47.0 + off) + 0.06 * noise.noise(p * 9.0 + off)
        base = inside if q.length < r * 0.98 - wall * 0.5 and n.z > -0.2 and (q.x * n.x + q.y * n.y) < 0 else color
        return [base[i] * fuzz for i in range(3)]
    m.paint_by(faces, fn, CARD)
    return faces


def cup_row(m, x0, x1, y, z, cup_r=0.2, cup_h=0.3, gap=0.2, along="x"):
    """Cut egg cups stood in a row along a wall top, a gap between each (crenellations)."""
    pitch = cup_r * 2.0 + gap
    n = max(1, int((x1 - x0 + gap) / pitch))
    start = (x0 + x1) / 2 - (n - 1) * pitch / 2
    out = []
    for k in range(n):
        t = start + k * pitch + m.rng.uniform(-0.02, 0.02)
        p = (t, y + m.rng.uniform(-0.015, 0.015), z) if along == "x" else (y + m.rng.uniform(-0.015, 0.015), t, z)
        out += cut_cup(m, p, cup_r * m.rng.uniform(0.94, 1.05), cup_h * m.rng.uniform(0.92, 1.08), twist=m.rng.uniform(-0.2, 0.2))
    return out


def cup_ring(m, c, radius, z, count, cup_r=0.17, cup_h=0.26):
    """Cut egg cups stood round the rim of a roll."""
    out = []
    for k in range(count):
        a = k / count * math.tau + m.rng.uniform(-0.05, 0.05)
        out += cut_cup(m, (c[0] + math.cos(a) * radius, c[1] + math.sin(a) * radius, z), cup_r, cup_h * m.rng.uniform(0.92, 1.08),
                       twist=a)
    return out


def bricks_along(m, length, d, z0, z1, names=("bricks", "bricks2"), faces=(FRONT, BACK), lift=0.006):
    band = 0.5
    z = z0
    k = 0
    while z + band <= z1 + 0.01:
        for face in faces:
            seg = 1.0
            x = -length / 2 + 0.05
            while x + seg <= length / 2 + 0.01:
                m.decal(names[(k + int(x * 3)) % 2], (x + seg / 2, face[1] * d / 2, z + band / 2), face, seg * 0.98,
                        band * 0.95, lift=lift)
                x += seg
        z += band
        k += 1


def roll(m, base, r, h, color=ROLL, seam=ROLL_SEAM, inside=INSIDE, crush=0.0, scraps=0):
    """A cardboard roll tube, wound from a strip of paper: the spiral seam shows as a dark
    line with a lighter lip beside it, the two plies a shade apart; sometimes a scrap of
    toilet paper is still stuck on."""
    segs = 28
    cuts = max(3, int(h / 0.1))
    f = m.cylinder(base, r, h, color, segs, CARD, caps=False, cuts=cuts, jitter=0.002)
    m._begin()
    x, y, z = base
    bm = m.bm
    m2 = Matrix.Translation(Vector(base)) @ Matrix.Translation((0, 0, h * 0.5))
    bmesh.ops.create_cone(bm, cap_ends=False, segments=segs, radius1=r - 0.02, radius2=r - 0.02, depth=h * 0.999, matrix=m2)
    inner = m._new()
    for g in inner:
        g.normal_flip()
        g.smooth = True
    m._paint(inner, inside, CARD, smooth=True)
    m._begin()
    top = Vector((x, y, z + h))
    ring_o = bmesh.ops.create_circle(bm, cap_ends=False, segments=segs, radius=r, matrix=Matrix.Translation(top))["verts"]
    ring_i = bmesh.ops.create_circle(bm, cap_ends=False, segments=segs, radius=r - 0.02, matrix=Matrix.Translation(top))["verts"]
    for k in range(segs):
        try:
            bm.faces.new((ring_o[k], ring_o[(k + 1) % segs], ring_i[(k + 1) % segs], ring_i[k]))
        except ValueError:
            pass
    rim = m._new()
    for g in rim:
        g.normal_update()
        if g.normal.z < 0:
            g.normal_flip()
    m._paint(rim, KRAFT_EDGE, CARD)
    pitch = r * 2.4          # how far the strip climbs per turn
    ph = m.rng.uniform(0, 1)
    dark = [seam[i] * 0.62 for i in range(3)]
    lip = [min(1.0, color[i] * 1.22) for i in range(3)]
    ply2 = [color[i] * 0.9 for i in range(3)]

    def fn(p, n):
        a = math.atan2(p.y - y, p.x - x) / math.tau
        u = (a - (p.z - z) / pitch + ph) % 1.0
        if u < 0.035:
            return dark
        if u < 0.075:
            return lip
        return ply2 if (u * 2.0) % 1.0 > 0.5 and False else (color if u < 0.5 else ply2)
    m.paint_by(f, fn, CARD)
    turns = h / pitch
    steps = max(6, int(turns * 9))
    for k in range(steps):
        t0 = k / steps
        t1 = (k + 1) / steps
        a0 = (t0 * turns - ph) * math.tau
        a1 = (t1 * turns - ph) * math.tau
        p0 = Vector((x + math.cos(a0) * r, y + math.sin(a0) * r, z + t0 * h))
        p1 = Vector((x + math.cos(a1) * r, y + math.sin(a1) * r, z + t1 * h))
        nn = Vector((math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2), 0))
        m.tape(p0, p1, nn, 0.018, color=dark)
    for _ in range(scraps):
        # A scrap of toilet paper left stuck on, torn and lifting.
        a = m.rng.uniform(0, math.tau)
        zz = z + m.rng.uniform(0.2, 0.8) * h
        n = Vector((math.cos(a), math.sin(a), 0))
        hinge = Vector((x, y, zz)) + n * (r + 0.006)
        sc = m.plate(hinge, (-math.sin(a), math.cos(a), 0), (0, 0, -1), m.rng.uniform(0.18, 0.3), m.rng.uniform(0.12, 0.2),
                     srgb("#f4f1ea"), 0.004, PAPER, edge=srgb("#e6e2d8"), cuts=3)
        m.crumple(sc, 0.012, 14.0)
    if crush:
        m.crumple(f, crush, 6.0)
    return f


PRINTS = {
    # cereal-box card the cones were rolled from: (base colour, band colour, logo decal)
    "red": (srgb("#c4412f"), srgb("#f0c440"), "cer_crunch"),
    "blue": (srgb("#3f67a8"), srgb("#e8e2d0"), "cer_oat"),
    "purple": (srgb("#6e3078"), srgb("#f0c440"), "cer_honey"),
}


def cone_hat(m, base, r, h, style, flag_col=None):
    """A cone rolled from printed cereal-box card: the print wraps round it on the slant,
    the overlap seam stands proud with the card's grey core showing on its cut edge and
    strips of masking tape across it, the grey unprinted inside shows at the rim, and the
    scissor-cut bottom edge wanders."""
    x, y, z = base
    col, band, logo = PRINTS[style]
    segs = 28
    f = m.cylinder(base, r, h, col, segs, PAPER, caps=False, radius_top=0.0, cuts=7, jitter=0.0, smooth=True)
    for v in m._verts(f):
        if v.co.z < z + 0.01:
            a = math.atan2(v.co.y - y, v.co.x - x)
            v.co.z += 0.03 * math.sin(a * 3.0 + m.seed) + 0.015 * math.sin(a * 7.0)
    ph = m.rng.uniform(0, math.tau)

    def fn(p, n):
        a = math.atan2(p.y - y, p.x - x)
        t = (p.z - z) / h
        u = (a + t * 2.6 + ph) / math.tau % 1.0      # the print runs on the slant, the way the card was rolled
        if 0.38 < u < 0.6 or 0.8 < u < 0.86:
            return band
        if 0.34 < u < 0.38 or 0.6 < u < 0.64:
            return [col[i] * 0.7 for i in range(3)]
        sd = (a - (ph + 1.1)) % math.tau
        if sd < 0.07:
            return [col[i] * 0.55 for i in range(3)]      # the shadow under the overlap seam
        return col
    m.paint_by(f, fn, PAPER)
    # The inside, grey and unprinted, showing under the rim.
    m._begin()
    m2 = Matrix.Translation(Vector((x, y, z + h * 0.15)))
    bmesh.ops.create_cone(m.bm, cap_ends=False, segments=segs, radius1=r - 0.015, radius2=(r - 0.015) * 0.7, depth=h * 0.3, matrix=m2)
    ins = m._new()
    for g in ins:
        g.normal_flip()
    m._paint(ins, CEREAL_IN, PAPER, smooth=True)
    # The overlap seam: the edge of the card standing proud, its cut edge showing the grey core.
    sa = ph + 1.1
    bottom = Vector((x + math.cos(sa) * r * 1.01, y + math.sin(sa) * r * 1.01, z))
    tip = Vector((x, y, z + h * 0.97))
    side = Vector((-math.sin(sa), math.cos(sa), 0))
    seam = m.plate(bottom, (tip - bottom).normalized(), side, (tip - bottom).length, 0.08, col, 0.008, PAPER,
                   edge=srgb("#e2dccd"), cuts=3)
    m.transform(seam, Matrix.Translation(-(tip - bottom) * 0.5 * 0 + Vector((0, 0, 0))))
    for v in m._verts(seam):
        k = (v.co.z - z) / h
        cen = Vector((x, y, v.co.z))
        rr = r * (1.0 - k) + 0.012
        d = Vector((v.co.x - x, v.co.y - y, 0))
        if d.length > 1e-4:
            v.co = cen + d.normalized() * max(rr, 0.004)
    # Masking tape across the seam, a little crooked.
    for k, t in enumerate((0.12, 0.42, 0.68)):
        rr = r * (1.0 - t)
        a0 = sa - 0.32 * (1.0 - t * 0.5)
        a1 = sa + 0.36 * (1.0 - t * 0.5)
        zz = z + h * t
        p0 = Vector((x + math.cos(a0) * rr, y + math.sin(a0) * rr, zz + m.rng.uniform(-0.02, 0.02)))
        p1 = Vector((x + math.cos(a1) * rr, y + math.sin(a1) * rr, zz + m.rng.uniform(-0.02, 0.02)))
        nn = Vector((math.cos(sa), math.sin(sa), r / h)).normalized()
        m.tape(p0, p1, nn, 0.07 * (1.0 - t * 0.4), color=TAPE_COL)
    # A piece of the logo, cut off where the card was trimmed.
    la = sa + math.pi * 0.9
    lt = 0.3
    lr = r * (1.0 - lt) + 0.012
    ln = Vector((math.cos(la), math.sin(la), r / h)).normalized()
    m.decal(logo, (x + math.cos(la) * lr, y + math.sin(la) * lr, z + h * lt), ln, r * 0.95, up=(0, 0, 1), rot=-14, lift=0.012)
    if flag_col is not None:
        m.cylinder((x, y, z + h * 0.85), 0.018, 0.8, srgb("#d9b98a"), 6, PAPER, cuts=0)
        m.plate((x, y, z + h * 0.85 + 0.78), (0, 0, 1), (1, 0.25, 0), 0.3, 0.5, flag_col, 0.004, PAPER, edge=flag_col)
    return f


def pulp_wall(m, length, h, d, color=EGG_PULP):
    """An egg-box lid stood on edge: sloped sides, a rounded top lip."""
    body = m.box((0, 0, h / 2), (length, d, h), color, cuts=(int(length * 3), 2, 4), bevel=0.03, sag=0.01)
    # Taper: the lid's sides slope in toward the top.
    for v in m._verts(body):
        k = v.co.z / h
        v.co.y *= 1.0 - 0.18 * k
    m.crumple(body, 0.006, 9.0, ridged=False)
    return body


def wall(length, name, seed):
    m = Model(name, seed)
    d, h = 0.9, 1.75
    pulp_wall(m, length, h, d)
    cup_row(m, -length / 2 + 0.15, length / 2 - 0.15, -d * 0.08, h - 0.04, cup_r=0.2, cup_h=0.3, gap=0.24)
    bricks_along(m, length, d * 0.95, 0.08, h - 0.15)
    m.decal("egg_label", (length * 0.22, -d / 2 - 0.01, h * 0.55), (0, -1, 0.1), 0.8, lift=0.012)
    for x in (-length * 0.3, length * 0.35):
        m.decal("arrow_slit", (x, -d / 2 + 0.02, h * 0.62), (0, -1, 0.1), 0.09, lift=0.012)
        m.decal("arrow_slit", (x + 0.3, d / 2 - 0.02, h * 0.62), (0, 1, 0.1), 0.09, lift=0.012)
    m.tape((-length / 2 + 0.4, -d / 2 - 0.004, h + 0.01), (-length / 2 + 0.45, -d / 2 + 0.02, h - 0.4), FRONT, 0.09)
    return m.build()


def turret(seed=31):
    """A kitchen-roll tube on a toilet roll, with a red paper cone and a flag."""
    m = Model("turret", seed)
    roll(m, (0, 0, 0), 0.9, 1.2, crush=0.01, scraps=1)
    roll(m, (0, 0, 1.2), 0.72, 2.6, color=srgb("#c2a57d"))
    m.cylinder((0, 0, 3.78), 0.74, 0.04, EGG_PULP_DARK, 28, CARD, cuts=0, jitter=0.0)
    cup_ring(m, (0, 0), 0.62, 3.8, 7, cup_r=0.17, cup_h=0.26)
    cone_hat(m, (0, 0, 3.86), 0.86, 1.5, "red", YELLOW)
    for k in range(6):
        a = k * math.pi / 3 + 0.3
        n = (math.cos(a), math.sin(a), 0)
        m.decal("bricks" if k % 2 else "bricks2", (n[0] * 0.9, n[1] * 0.9, 0.6), n, 0.8, 0.5, lift=0.012)
        if k % 2 == 0:
            m.decal("arrow_slit", (n[0] * 0.72, n[1] * 0.72, 2.6), n, 0.1, lift=0.015)
    m.decal("win_arch", (0, -0.72, 3.1), FRONT, 0.26, lift=0.015)
    return m.build()


def gatehouse(seed=32):
    """A half-dozen egg box on end, its lid down over the moat, between two toilet rolls."""
    m = Model("gatehouse", seed)
    w, d, h = 2.3, 1.3, 2.4
    pulp_wall(m, w, h, d, EGG_PULP)
    cup_row(m, -w / 2 + 0.15, w / 2 - 0.15, -d * 0.28, h - 0.04, cup_r=0.2, cup_h=0.3, gap=0.22)
    cup_row(m, -w / 2 + 0.35, w / 2 - 0.35, d * 0.24, h - 0.04, cup_r=0.18, cup_h=0.27, gap=0.3)
    m.decal("portcullis", (0, -d / 2 - 0.01, 0.62), (0, -1, 0.08), 0.95, lift=0.008)
    m.decal("crown", (0, -d / 2 + 0.06, 1.7), (0, -1, 0.12), 0.45, lift=0.012)
    m.decal("egg_label", (0, d / 2 - 0.03, 1.3), (0, 1, 0.1), 1.2, lift=0.012)
    for x in (-w / 2 - 0.2, w / 2 + 0.2):
        roll(m, (x, -d / 2 + 0.3, 0), 0.42, 2.9, scraps=1 if x > 0 else 0)
        cone_hat(m, (x, -d / 2 + 0.3, 2.88), 0.5, 0.95, "blue")
    # The lid, let down for a drawbridge, cups underneath.
    m.flap((0, -d / 2 - 0.02, 0.03), (1, 0, 0), (0, -1, 0), -3, 1.05, 1.3, EGG_PULP, 0.04, under=EGG_PULP_DARK, cuts=4)
    for k in range(4):
        m.decal("bricks2", (0, -d / 2 - 0.2 - k * 0.27, 0.06), UP, 0.95, 0.22, up=(0, 1, 0), lift=0.012)
    return m.build()


def keep(seed=33):
    """The keep: a big box under an upturned 30-egg tray, toilet-roll towers on the
    corners, a kitchen roll in the middle with a flag."""
    m = Model("keep", seed)
    w, h = 3.9, 4.0
    body = m.box((0, 0, h / 2), (w, w, h), EGG_PULP, cuts=(6, 6, 6), bevel=0.03, sag=0.02)
    m.crumple(body, 0.008, 6.0, ridged=False)
    # Battlements round the top edge (cut cups with gaps), the bare top of the box inside them.
    m.box((0, 0, h - 0.01), (w - 0.1, w - 0.1, 0.03), EGG_PULP_DARK, cuts=(4, 4, 0), bevel=0.006)
    for side in range(4):
        a = side * math.pi / 2
        c, s_ = math.cos(a), math.sin(a)
        for t in (-1.45, -0.85, -0.25, 0.35, 0.95):
            px, py = c * t - s_ * (w / 2 - 0.22), s_ * t + c * (w / 2 - 0.22)
            cut_cup(m, (px, py, h - 0.02), 0.21 * m.rng.uniform(0.95, 1.05), 0.32 * m.rng.uniform(0.92, 1.08), twist=a)
    for side in range(4):
        a = side * math.pi / 2
        c, s = math.cos(a), math.sin(a)
        n = (s, -c, 0)
        for z in (0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25):
            for x in (-1.2, 0.0, 1.2):
                if side == 0 and abs(x) < 0.5 and z < 1.6:
                    continue
                m.decal("bricks" if (int(z * 2) + int(x)) % 2 else "bricks2",
                        (c * x + n[0] * w / 2, s * x + n[1] * w / 2, z), n, 1.18, 0.5, lift=0.006)
        for x in (-0.95, 0.95):
            m.decal("win_arch", (c * x + n[0] * w / 2, s * x + n[1] * w / 2, 2.7), n, 0.32, lift=0.012)
    m.decal("portcullis", (0, -w / 2, 0.75), FRONT, 1.15, lift=0.012)
    m.decal("crown", (0, -w / 2, 3.5), FRONT, 0.7, lift=0.012)
    m.decal("egg_label", (w / 2, 0.4, 1.6), (1, 0, 0), 1.4, rot=-4, lift=0.012)
    m.decal("lbl_donot", (-w / 2, -0.5, 0.4), (-1, 0, 0), 1.0, rot=4, lift=0.012)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (w / 2 - 0.05), sy * (w / 2 - 0.05)
            roll(m, (x, y, 0), 0.55, 1.15, crush=0.008)
            roll(m, (x, y, 1.15), 0.55, 1.15, scraps=1 if sx > 0 and sy < 0 else 0)
            roll(m, (x, y, 2.3), 0.55, 1.15)
            roll(m, (x, y, 3.45), 0.55, 1.15, crush=0.008)
            cone_hat(m, (x, y, 4.58), 0.68, 1.05, "blue" if sx * sy > 0 else ("purple" if sx > 0 else "red"))
    roll(m, (0.1, 0.15, h + 0.0), 0.9, 2.4, color=srgb("#c2a57d"), scraps=1)
    m.cylinder((0.1, 0.15, h + 2.36), 0.92, 0.04, EGG_PULP_DARK, 28, CARD, cuts=0, jitter=0.0)
    cup_ring(m, (0.1, 0.15), 0.76, h + 2.38, 8, cup_r=0.17, cup_h=0.26)
    cone_hat(m, (0.1, 0.15, h + 2.45), 1.05, 1.9, "red", YELLOW)
    m.tape((-w / 2 - 0.004, -0.8, h - 0.2), (-w / 2 - 0.004, -0.5, h - 1.0), (-1, 0, 0), 0.1)
    return m.build()


def build():
    return [wall(4.0, "wall_long", 34), wall(3.0, "wall_short", 35), turret(), gatehouse(), keep()]
