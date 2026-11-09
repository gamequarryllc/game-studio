"""The cardboard castle in the middle of the city: wall segments with marker bricks,
poster-tube turrets with paper-cone hats, a gatehouse, and the keep (burning it is the ending).

The castle sits in a 30x30-cell (15 m) yard. Wall pieces are modelled running
along X; the game turns them for the east and west sides.
"""
import math

from kit import (BLUE, CARD, CREAM, INSIDE, KRAFT, KRAFT_DARK, KRAFT_EDGE, KRAFT_PALE, PAPER, RED, SHINY, WOOD,
                 YELLOW, Model, srgb)

FRONT = (0, -1, 0)
BACK = (0, 1, 0)
UP = (0, 0, 1)
WALL = srgb("#d1b083")
WALL_DARK = srgb("#b8935f")


def merlons(m, x0, x1, y, z, depth, color, size=0.24, gap=0.2):
    x = x0 + gap * 0.5
    k = 0
    while x + size <= x1 + 0.001:
        m.box((x + size / 2, y, z + 0.11), (size, depth, 0.22), color, cuts=(0, 0, 0), bevel=0.008,
              jitter=0.004, rot=(0, 0, m.rng.uniform(-0.03, 0.03)))
        x += size + gap
        k += 1


def bricks_along(m, length, d, z0, z1, names=("bricks", "bricks2"), faces=(FRONT, BACK)):
    band = 0.5
    z = z0
    k = 0
    while z + band <= z1 + 0.01:
        for face in faces:
            seg = 1.0
            x = -length / 2 + 0.05
            while x + seg <= length / 2 + 0.01:
                m.decal(names[(k + int(x * 3)) % 2], (x + seg / 2, face[1] * d / 2, z + band / 2), face, seg * 0.98, band * 0.95,
                        lift=0.004)
                x += seg
        z += band
        k += 1


def wall(length, name, seed):
    m = Model(name, seed)
    d, h = 0.9, 1.9
    m.box((0, 0, h / 2), (length, d, h), WALL, cuts=(int(length * 2), 2, 3), bevel=0.02, sag=0.01)
    m.box((0, 0, h - 0.005), (length - 0.05, d - 0.3, 0.012), WALL_DARK, bevel=0.0, cuts=(0, 0, 0), jitter=0.0)
    merlons(m, -length / 2, length / 2, -d / 2 + 0.1, h, 0.2, WALL)
    merlons(m, -length / 2, length / 2, d / 2 - 0.1, h, 0.2, WALL)
    bricks_along(m, length, d, 0.08, h - 0.2)
    for x in (-length * 0.25, length * 0.25):
        m.decal("arrow_slit", (x, -d / 2, h * 0.62), FRONT, 0.09, lift=0.007)
        m.decal("arrow_slit", (x + 0.3, d / 2, h * 0.62), BACK, 0.09, lift=0.007)
    m.tape((-length / 2 + 0.4, -d / 2 - 0.004, h + 0.01), (-length / 2 + 0.45, -d / 2 - 0.004, h - 0.4), FRONT, 0.09)
    m.tape((length / 2 - 0.6, d / 2 + 0.004, h - 0.3), (length / 2 - 0.3, d / 2 + 0.004, h - 0.35), BACK, 0.09)
    return m.build()


def turret(seed=31):
    m = Model("turret", seed)
    r, h = 0.92, 3.1
    m.tube((0, 0, 0), r, h, WALL_DARK, INSIDE, 0.03, 24)
    m.box((0, 0, h - 0.08), (r * 1.6, r * 1.6, 0.02), INSIDE, bevel=0.0, cuts=(0, 0, 0), jitter=0.0)
    m.cone((0, 0, h - 0.05), r * 1.14, 1.45, RED, 24)
    m.cylinder((0, 0, h + 1.3), 0.018, 0.75, srgb("#d9b98a"), 6, PAPER, cuts=0)  # a skewer for a flagpole
    m.plate((0.0, 0.0, h + 1.95), (0, 0, 1), (1, 0.2, 0), 0.32, 0.5, YELLOW, 0.004, PAPER, edge=YELLOW)
    for k in range(8):
        a = k * math.pi / 4
        n = (math.cos(a), math.sin(a), 0)
        for z in (0.55, 1.2, 1.85, 2.5):
            m.decal("bricks" if k % 2 else "bricks2", (n[0] * r, n[1] * r, z), n, 0.72, 0.5, lift=0.012)
        if k % 2 == 0:
            m.decal("arrow_slit", (n[0] * r, n[1] * r, 2.2), n, 0.1, lift=0.02)
    m.tape((r * 0.72, -r * 0.7, 2.9), (r * 0.7, -r * 0.72, 2.3), (0.7, -0.7, 0), 0.09)
    return m.build()


def gatehouse(seed=32):
    m = Model("gatehouse", seed)
    w, d, h = 2.9, 1.4, 2.5
    m.box((0, 0, h / 2), (w, d, h), WALL, cuts=(6, 2, 4), bevel=0.02)
    merlons(m, -w / 2, w / 2, -d / 2 + 0.1, h, 0.2, WALL)
    merlons(m, -w / 2, w / 2, d / 2 - 0.1, h, 0.2, WALL)
    bricks_along(m, w, d, 1.2, h - 0.2)
    m.decal("portcullis", (0, -d / 2, 0.62), FRONT, 1.0, lift=0.005)
    m.decal("portcullis", (0, d / 2, 0.62), BACK, 1.0, lift=0.005)
    m.decal("crown", (0, -d / 2, 1.65), FRONT, 0.45, lift=0.006)
    for x in (-w / 2, w / 2):
        m.tube((x, -d / 2 + 0.1, 0), 0.36, 3.0, WALL_DARK, INSIDE, 0.02, 16)
        m.cone((x, -d / 2 + 0.1, 2.97), 0.43, 0.75, BLUE, 16)
    # The drawbridge: a sheet of card down over the moat.
    m.flap((0, -d / 2, 0.02), (1, 0, 0), (0, -1, 0), -2, 1.0, 1.2, KRAFT_DARK, 0.02)
    for k in range(4):
        m.decal("bricks2", (0, -d / 2 - 0.25 - k * 0.25, 0.035), UP, 0.9, 0.2, up=(0, 1, 0), lift=0.012)
    return m.build()


def keep(seed=33):
    m = Model("keep", seed)
    w, h = 3.8, 4.1
    m.box((0, 0, h / 2), (w, w, h), WALL, cuts=(6, 6, 6), bevel=0.025, sag=0.02)
    m.box((0, 0, h - 0.006), (w - 0.3, w - 0.3, 0.012), WALL_DARK, bevel=0.0, cuts=(0, 0, 0), jitter=0.0)
    for side in range(4):
        a = side * math.pi / 2
        c, s = math.cos(a), math.sin(a)
        n = (s, -c, 0)
        for k in range(8):
            x = -w / 2 + 0.1 + k * 0.47
            px, py = c * x - s * (-w / 2 + 0.1), s * x + c * (-w / 2 + 0.1)
            if abs(x) < w / 2 - 0.35:
                m.box((px, py, h + 0.12), (0.26, 0.26, 0.24), WALL, cuts=(0, 0, 0), bevel=0.008, jitter=0.004)
        for z in (0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75):
            for x in (-1.2, 0.0, 1.2):
                m.decal("bricks" if (int(z * 2) + int(x)) % 2 else "bricks2",
                        (c * x + n[0] * w / 2, s * x + n[1] * w / 2, z), n, 1.18, 0.5, lift=0.005)
        for x in (-1.0, 1.0):
            m.decal("win_arch", (c * x + n[0] * w / 2, s * x + n[1] * w / 2, 2.6), n, 0.32, lift=0.01)
        m.decal("arrow_slit", (n[0] * w / 2, n[1] * w / 2, 1.6), n, 0.12, lift=0.01)
    m.decal("portcullis", (0, -w / 2, 0.75), FRONT, 1.2, lift=0.012)
    m.decal("crown", (0, -w / 2, 3.45), FRONT, 0.7, lift=0.012)
    m.decal("lbl_donot", (w / 2, 0.6, 0.35), (1, 0, 0), 0.9, rot=-5, lift=0.012)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (w / 2 - 0.1), sy * (w / 2 - 0.1)
            m.tube((x, y, 0), 0.5, 4.75, WALL_DARK, INSIDE, 0.02, 18)
            m.cone((x, y, 4.72), 0.6, 1.0, BLUE if sx * sy > 0 else RED, 18)
    m.tube((0.1, 0.15, h - 0.05), 0.85, 1.5, WALL_DARK, INSIDE, 0.025, 22)
    m.cone((0.1, 0.15, h + 1.42), 1.0, 1.7, RED, 22)
    m.cylinder((0.1, 0.15, h + 3.0), 0.02, 0.9, srgb("#d9b98a"), 6, PAPER, cuts=0)
    m.plate((0.1, 0.15, h + 3.85), (0, 0, 1), (1, -0.15, 0), 0.36, 0.62, YELLOW, 0.004, PAPER, edge=YELLOW)
    m.tape((-w / 2 - 0.004, -0.8, h - 0.2), (-w / 2 - 0.004, -0.5, h - 1.0), (-1, 0, 0), 0.1)
    m.tape((0.9, -w / 2 - 0.004, 2.0), (1.3, -w / 2 - 0.004, 1.7), FRONT, 0.1)
    return m.build()


def build():
    return [wall(4.0, "wall_long", 34), wall(3.0, "wall_short", 35), turret(), gatehouse(), keep()]
