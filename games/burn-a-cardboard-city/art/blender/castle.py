"""The cardboard castle in the middle of the city, built from egg boxes and the
tubes out of toilet rolls and kitchen rolls, standing on a pallet.

Walls are egg-box lids stood on edge with a row of upturned egg cups along the top
for battlements, drawn on with marker bricks. Turrets are kitchen-roll tubes with
paper-cone hats. The gatehouse is a half-dozen egg box with its lid let down for a
drawbridge between two toilet rolls. The keep is a big box under an upturned
30-egg tray, toilet-roll towers on its corners and a kitchen roll in the middle
with a flag on a skewer (burning it is the ending).

The castle sits in a 30x30-cell (15 m) yard. Wall pieces run along X; the game
turns them for the east and west sides.
"""
import math

from kit import (BLUE, CARD, EGG_PULP, EGG_PULP_DARK, INSIDE, KRAFT, KRAFT_DARK, KRAFT_EDGE, PAPER, RED, ROLL, ROLL_SEAM,
                 SHINY, YELLOW, Model, srgb)
from mathutils import Vector

FRONT = (0, -1, 0)
BACK = (0, 1, 0)
UP = (0, 0, 1)
CONE_RED = srgb("#c4412f")
CONE_BLUE = srgb("#3f67a8")
CONE_GREEN = srgb("#4f8a3c")


def egg_cup(m, c, r, h, color=EGG_PULP, inside=EGG_PULP_DARK):
    """One open egg cup: a flared, slightly squarish pulp cup with its hollow showing."""
    x, y, z = c
    outer = m.cylinder((x, y, z), r * 0.78, h, color, 10, CARD, caps=False, radius_top=r, cuts=1, smooth=True, jitter=0.0)
    inner = m.cylinder((x, y, z + h * 0.25), r * 0.6, h * 0.76, inside, 10, CARD, caps=True, radius_top=r * 0.88, cuts=0,
                       smooth=True, jitter=0.0)
    for f in inner:
        f.normal_flip()
    rim = m.cylinder((x, y, z + h - 0.012), r * 1.02, 0.024, color, 10, CARD, caps=False, cuts=0, smooth=True, jitter=0.0)
    return outer + inner + rim


def egg_cups(m, x0, x1, y, z, depth, cup_r=0.17, cup_h=0.24, pitch=0.42, color=EGG_PULP, rows=1):
    """The bottom of an egg box sat on a wall top: a row (or grid) of open cups with the
    tall pointed posts between them sticking up like battlements."""
    n = max(1, int((x1 - x0) / pitch))
    pitch = (x1 - x0) / n
    out = []
    for r in range(rows):
        yy = y + (r - (rows - 1) / 2) * pitch
        for k in range(n):
            x = x0 + (k + 0.5) * pitch
            out += egg_cup(m, (x, yy, z), cup_r, cup_h, color)
            if k < n - 1 and (rows == 1 or r < rows - 1):
                py = yy + (pitch * 0.5 if rows > 1 else 0.0)
                post = m.cylinder((x + pitch * 0.5, py, z), cup_r * 0.42, cup_h * 1.75, color, 8, CARD, caps=True,
                                  radius_top=cup_r * 0.08, cuts=1, smooth=True, jitter=0.0)
                out += post
    m.crumple(out, 0.006, 14.0, ridged=False)
    # The flat of the tray they're moulded into.
    m.box(((x0 + x1) / 2, y, z + 0.02), (x1 - x0 + cup_r, depth, 0.04), EGG_PULP_DARK, cuts=(int(n), 1, 0), bevel=0.006,
          jitter=0.004)
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


def roll(m, base, r, h, color=ROLL, seam=ROLL_SEAM, inside=INSIDE, crush=0.0):
    """A cardboard roll tube with its spiral seam."""
    f = m.tube(base, r, h, color, inside, 0.02, 20)
    x, y, z = base
    turns = h / (r * 2.2)
    steps = max(6, int(turns * 10))
    for k in range(steps):
        t0 = k / steps
        t1 = (k + 1) / steps
        a0 = t0 * turns * math.tau
        a1 = t1 * turns * math.tau
        p0 = Vector((x + math.cos(a0) * r, y + math.sin(a0) * r, z + t0 * h))
        p1 = Vector((x + math.cos(a1) * r, y + math.sin(a1) * r, z + t1 * h))
        n = Vector((math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2), 0))
        m.tape(p0, p1, n, 0.012, color=seam)
    if crush:
        m.crumple(f, crush, 6.0)
    return f


def cone_hat(m, base, r, h, color, flag_col=None):
    m.cone(base, r, h, color, 20, PAPER)
    if flag_col is not None:
        x, y, z = base
        m.cylinder((x, y, z + h * 0.85), 0.018, 0.8, srgb("#d9b98a"), 6, PAPER, cuts=0)
        m.plate((x, y, z + h * 0.85 + 0.78), (0, 0, 1), (1, 0.25, 0), 0.3, 0.5, flag_col, 0.004, PAPER, edge=flag_col)


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
    egg_cups(m, -length / 2 + 0.05, length / 2 - 0.05, 0.0, h, d * 0.82, cup_r=0.16, cup_h=0.26, pitch=0.44)
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
    roll(m, (0, 0, 0), 0.9, 1.2, crush=0.01)
    roll(m, (0, 0, 1.2), 0.72, 2.6, color=srgb("#c2a57d"))
    egg_cups(m, -0.6, 0.6, 0.0, 3.8, 0.7, cup_r=0.13, cup_h=0.18, pitch=0.4, rows=2)
    cone_hat(m, (0, 0, 3.86), 0.86, 1.5, CONE_RED, YELLOW)
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
    egg_cups(m, -w / 2 + 0.1, w / 2 - 0.1, 0.0, h, d * 0.8, cup_r=0.18, cup_h=0.28, pitch=0.46, rows=2)
    m.decal("portcullis", (0, -d / 2 - 0.01, 0.62), (0, -1, 0.08), 0.95, lift=0.008)
    m.decal("crown", (0, -d / 2 + 0.06, 1.7), (0, -1, 0.12), 0.45, lift=0.012)
    m.decal("egg_label", (0, d / 2 - 0.03, 1.3), (0, 1, 0.1), 1.2, lift=0.012)
    for x in (-w / 2 - 0.2, w / 2 + 0.2):
        roll(m, (x, -d / 2 + 0.3, 0), 0.42, 2.9)
        cone_hat(m, (x, -d / 2 + 0.3, 2.88), 0.5, 0.95, CONE_BLUE)
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
    egg_cups(m, -w / 2 + 0.2, w / 2 - 0.2, 0.0, h, w - 0.2, cup_r=0.18, cup_h=0.3, pitch=0.5, rows=6)
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
            roll(m, (x, y, 1.15), 0.55, 1.15)
            roll(m, (x, y, 2.3), 0.55, 1.15)
            roll(m, (x, y, 3.45), 0.55, 1.15, crush=0.008)
            cone_hat(m, (x, y, 4.58), 0.68, 1.05, CONE_BLUE if sx * sy > 0 else CONE_RED)
    roll(m, (0.1, 0.15, h + 0.1), 0.9, 2.3, color=srgb("#c2a57d"))
    egg_cups(m, -0.5, 0.6, 0.15, h + 2.4, 0.6, cup_r=0.13, cup_h=0.16, pitch=0.36, rows=2)
    cone_hat(m, (0.1, 0.15, h + 2.45), 1.05, 1.9, CONE_RED, YELLOW)
    m.tape((-w / 2 - 0.004, -0.8, h - 0.2), (-w / 2 - 0.004, -0.5, h - 1.0), (-1, 0, 0), 0.1)
    return m.build()


def build():
    return [wall(4.0, "wall_long", 34), wall(3.0, "wall_short", 35), turret(), gatehouse(), keep()]
