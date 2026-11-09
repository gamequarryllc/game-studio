"""Skyscraper row: towers of white copy-paper boxes, stacked two to three times as
high as downtown. Every box has its lid on (a lip all round, two hand holes at the
ends) and the paper company's blue band on some sides; windows are drawn on in
marker, in grids that never quite line up, some left out.

Lots are 4x4 cells (2 m) or 4x8 for the long one. Front = -Y.
"""
import math

from kit import (CARD, INK, INSIDE, KRAFT, KRAFT_DARK, PAPER, PAPER_SHADE, PAPER_WHITE, SHINY, TAPE_COL, Model, srgb)
from mathutils import Matrix, Vector

FRONT = (0, -1, 0)
BACK = (0, 1, 0)
LEFT = (-1, 0, 0)
RIGHT = (1, 0, 0)
UP = (0, 0, 1)
BLUE_LID = srgb("#dfe6ee")


def paper_box(m, c, w, d, h, yaw=0.0, print_sides=(0, 2), side_text=(1,), windows=True, lid=True, rows=None):
    """One copy-paper box at c (x, y, z0), w along its own x. Returns its top z."""
    x, y, z0 = c
    rot = (0, 0, yaw)
    m.box((x, y, z0 + h / 2), (w, d, h), PAPER_WHITE, PAPER, cuts=(3, 2, 3), bevel=0.012, rot=rot, sag=0.006)
    lh = min(0.16, h * 0.17)
    if lid:
        m.box((x, y, z0 + h - lh / 2 + 0.012), (w + 0.03, d + 0.03, lh), BLUE_LID if m.rng.random() < 0.3 else PAPER_SHADE,
              PAPER, cuts=(3, 2, 0), bevel=0.008, rot=rot, jitter=0.002)
    ca, sa = math.cos(yaw), math.sin(yaw)
    # The four faces: 0 front (-y), 1 right (+x), 2 back (+y), 3 left (-x), in the box's own frame.
    faces = [((sa, -ca, 0), w, d / 2), ((ca, sa, 0), d, w / 2), ((-sa, ca, 0), w, d / 2), ((-ca, -sa, 0), d, w / 2)]
    zw0 = z0 + 0.05
    zw1 = z0 + h - (lh + 0.02 if lid else 0.04)
    for k, (n, span, half) in enumerate(faces):
        cx, cy = x + n[0] * (half + 0.0), y + n[1] * (half + 0.0)
        if lid and k in (1, 3):
            # Hand holes in the lid's ends.
            m.decal("arrow_slit", (cx + n[0] * 0.016, cy + n[1] * 0.016, z0 + h - lh * 0.5), n, 0.05, 0.12, rot=90, lift=0.006)
        if k in print_sides and m.rng.random() < 0.85:
            m.decal("paper_brand", (cx, cy, z0 + h * 0.46), n, span * 0.82, lift=0.008)
            if windows:
                m.decal("sky_g%d" % (1 + (k + m.seed) % 5), (cx, cy, zw1 - 0.13), n, span * 0.84, 0.24, lift=0.012)
            continue
        if k in side_text and m.rng.random() < 0.6:
            m.decal("paper_side", (cx, cy, z0 + h * 0.3), n, span * 0.6, lift=0.008)
        if windows:
            band = rows or max(1, int((zw1 - zw0) / 0.42))
            bh = (zw1 - zw0) / band
            for r in range(band):
                m.decal("sky_g%d" % (1 + (k * 3 + r + m.seed) % 5), (cx, cy, zw0 + (r + 0.5) * bh), n,
                        span * m.rng.uniform(0.8, 0.9), bh * 0.9, lift=0.012)
    return z0 + h + (0.012 if lid else 0.0)


def straw(m, x, y, z, length=0.9, bend=True):
    m.cylinder((x, y, z), 0.022, length, srgb("#f2f0ea"), 8, SHINY, cuts=2)
    for k in range(4):
        m.cylinder((x, y, z + 0.1 + k * 0.2), 0.0225, 0.05, srgb("#d84a4a"), 8, SHINY, cuts=0, caps=False, jitter=0.0)
    if bend:
        m.cylinder((x, y, z + length), 0.022, 0.16, srgb("#f2f0ea"), 8, SHINY, cuts=0, rot=(0.7, 0, 0))


def sky_stack(seed=21):
    """Six copy-paper boxes stacked crosswise, each turned a little."""
    m = Model("sky_stack", seed)
    z = 0.0
    for k in range(6):
        yaw = (math.pi / 2 if k % 2 else 0.0) + m.rng.uniform(-0.05, 0.05)
        z = paper_box(m, (m.rng.uniform(-0.04, 0.04), m.rng.uniform(-0.04, 0.04), z), 1.76, 1.2, 0.9, yaw,
                      print_sides=(0,) if k % 2 else (2,), side_text=(1,) if k % 3 == 0 else ())
    straw(m, 0.3, -0.1, z)
    m.tape((0.88, -0.3, 1.6), (0.88, -0.25, 2.2), RIGHT, 0.08)
    return m.build()


def sky_tower(seed=22):
    """Three tall bulk boxes stood on end, straight up, lids on."""
    m = Model("sky_tower", seed)
    z = 0.0
    for k in range(3):
        z = paper_box(m, (0.0, 0.0, z), 1.62 - k * 0.04, 1.62 - k * 0.04, 1.92, m.rng.uniform(-0.03, 0.03),
                      print_sides=(1,) if k != 1 else (0, 2), side_text=(3,))
    m.box((0.0, 0.0, z + 0.25), (0.5, 0.5, 0.5), PAPER_SHADE, PAPER, cuts=(1, 1, 1), bevel=0.01, rot=(0, 0, 0.3))
    m.decal("sky_g2", (0.0 + math.sin(0.3) * 0.25, -math.cos(0.3) * 0.25, z + 0.25), (math.sin(0.3), -math.cos(0.3), 0), 0.42,
            0.3, lift=0.01)
    straw(m, -0.1, 0.1, z + 0.5, 0.7)
    return m.build()


def sky_setback(seed=23):
    """Stepped: big boxes at the bottom, smaller ones up top, a toner box for a crown."""
    m = Model("sky_setback", seed)
    z = 0.0
    for k, (w, d, h) in enumerate([(1.82, 1.82, 1.15), (1.78, 1.78, 1.15), (1.36, 1.36, 1.05), (1.3, 1.3, 1.05),
                                   (0.92, 0.92, 0.95)]):
        z = paper_box(m, (0.0, 0.0, z), w, d, h, m.rng.uniform(-0.04, 0.04) + (0.06 if k == 4 else 0.0),
                      print_sides=(0,) if k % 2 == 0 else (1,), side_text=(2,))
    straw(m, 0.15, 0.1, z, 0.8)
    m.tape((0.6, -0.69, 2.6), (0.69, -0.6, 2.0), (0.7, -0.7, 0), 0.08)
    return m.build()


def sky_tube(seed=24):
    """A white mailing tube on a copy-paper box, its plastic end cap on top."""
    m = Model("sky_tube", seed)
    z = paper_box(m, (0, 0, 0), 1.8, 1.8, 1.0, 0.02, print_sides=(0, 2), side_text=(1,))
    r, h = 0.72, 4.3
    m.cylinder((0, 0, z), r, h, PAPER_WHITE, 28, PAPER, caps=True, cuts=6)
    # The spiral seam of a wound tube.
    for k in range(9):
        a0 = k * 0.62
        zz = z + 0.2 + k * 0.48
        m.tape((math.cos(a0) * r, math.sin(a0) * r, zz), (math.cos(a0 + 0.6) * r, math.sin(a0 + 0.6) * r, zz + 0.25),
               (math.cos(a0 + 0.3), math.sin(a0 + 0.3), 0), 0.02, color=PAPER_SHADE)
    m.cylinder((0, 0, z + h - 0.02), r + 0.03, 0.22, srgb("#e8e6e0"), 28, SHINY, cuts=0)
    m.cylinder((0, 0, z + h + 0.2), r + 0.03, 0.14, srgb("#e8e6e0"), 28, SHINY, cuts=0, radius_top=r * 0.5)
    for fl in range(8):
        zz = z + 0.35 + fl * 0.48
        for k in range(7):
            a = k * math.tau / 7 + (fl % 2) * 0.45
            n = (math.cos(a), math.sin(a), 0)
            if m.rng.random() < 0.12:
                continue
            m.decal("win_lit" if m.rng.random() < 0.2 else "win_sky", (n[0] * r, n[1] * r, zz), n, 0.24, lift=0.012)
    m.decal("st_handle", (0, -r, z + 0.2), FRONT, 0.9, lift=0.03)
    return m.build()


def sky_wide(seed=25):
    """A long block: two columns of copy-paper boxes, end to end, five high."""
    m = Model("sky_wide", seed)
    for col in (-1, 1):
        z = 0.0
        for k in range(5):
            z = paper_box(m, (m.rng.uniform(-0.03, 0.03), col * 0.9 + m.rng.uniform(-0.03, 0.03), z), 1.72, 1.76, 1.0,
                          math.pi / 2 + m.rng.uniform(-0.03, 0.03), print_sides=(0,) if col < 0 else (2,), side_text=(1,))
    m.box((0.0, 0.0, z + 0.2), (0.7, 0.7, 0.4), PAPER_SHADE, PAPER, cuts=(1, 1, 1), bevel=0.01)
    straw(m, -0.4, 1.0, z, 0.7)
    m.tape((-0.87, -0.2, 2.5), (-0.87, 0.2, 2.4), LEFT, 0.08)
    return m.build()


SKYSCRAPERS = [sky_stack, sky_tower, sky_setback, sky_tube, sky_wide]
