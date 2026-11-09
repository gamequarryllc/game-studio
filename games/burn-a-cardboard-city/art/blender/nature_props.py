"""Paper trees for the suburbs, and the warehouse props around the city: a big floor fan
(the wind), pallets, a stack of flattened boxes, a roll of masking tape, a marker pen
and a pair of scissors left lying about, as if whoever built the city just stepped out.
"""
import math

from kit import (BRASS, CARD, CREAM, INK, INSIDE, KRAFT, KRAFT_DARK, KRAFT_EDGE, KRAFT_PALE, LEAF, LEAF_LIGHT,
                 PAPER, PINK, RED, SHINY, STEEL, TAPE, TAPE_COL, WOOD, YELLOW, Model, srgb)

UP = (0, 0, 1)


# =====================================================================================
# Trees (1x1-cell lots, 0.5 m)
# =====================================================================================
def tree_cone(seed=51):
    m = Model("tree_cone", seed)
    m.cylinder((0, 0, 0), 0.022, 0.24, srgb("#f2f0ea"), 8, SHINY, cuts=1)
    m.cone((0, 0, 0.16), 0.19, 0.38, LEAF, 14)
    m.cone((0.005, 0, 0.36), 0.15, 0.32, LEAF_LIGHT, 14, rot=(0.05, 0.03, 0.4))
    m.box((0, 0, 0.008), (0.16, 0.16, 0.016), KRAFT_DARK, cuts=(0, 0, 0), bevel=0.004)
    return m.build()


def tree_ball(seed=52):
    m = Model("tree_ball", seed)
    # A yellow pencil for a trunk.
    m.cylinder((0, 0, 0), 0.026, 0.3, srgb("#f0c440"), 6, CARD, cuts=1, smooth=False)
    m.ball((0, 0, 0.42), 0.19, LEAF_LIGHT, crumple=0.28)
    m.ball((0.08, 0.05, 0.36), 0.12, LEAF, crumple=0.3)
    m.box((0, 0, 0.008), (0.14, 0.14, 0.016), KRAFT_DARK, cuts=(0, 0, 0), bevel=0.004)
    return m.build()


def tree_pom(seed=53):
    m = Model("tree_pom", seed)
    m.cylinder((0, 0, 0), 0.02, 0.2, srgb("#c99a5c"), 6, CARD, cuts=1)
    for k, (x, y, z, r) in enumerate([(0, 0, 0.3, 0.14), (0.07, -0.03, 0.42, 0.1), (-0.05, 0.04, 0.45, 0.09)]):
        m.ball((x, y, z), r, LEAF if k % 2 else srgb("#8cbf5a"), crumple=0.3)
    m.box((0, 0, 0.008), (0.14, 0.14, 0.016), KRAFT_DARK, cuts=(0, 0, 0), bevel=0.004)
    return m.build()


# =====================================================================================
# Warehouse props
# =====================================================================================
def fan_body(seed=61):
    """A big industrial floor fan on a stand (the blades are their own model, they spin)."""
    m = Model("fan_body", seed)
    grey = srgb("#5d6873")
    m.box((0, 0, 0.06), (1.6, 0.9, 0.12), grey, SHINY, cuts=(0, 0, 0), bevel=0.03, jitter=0.0)
    for x in (-0.55, 0.55):
        m.box((x, 0, 1.3), (0.08, 0.08, 2.5), grey, SHINY, cuts=(0, 0, 2), bevel=0.015, jitter=0.0)
    m.cylinder((0, 0.05, 2.6), 0.22, 0.4, grey, 16, SHINY, rot=(math.pi / 2, 0, 0), cuts=0, jitter=0.0)
    # The guard: rings and spokes of steel wire.
    for r in (0.5, 0.9, 1.3):
        segs = 28
        for k in range(segs):
            a0 = k * math.tau / segs
            a1 = (k + 1) * math.tau / segs
            p0 = (math.cos(a0) * r, -0.28, 2.6 + math.sin(a0) * r)
            p1 = (math.cos(a1) * r, -0.28, 2.6 + math.sin(a1) * r)
            mid = ((p0[0] + p1[0]) / 2, -0.28, (p0[2] + p1[2]) / 2)
            ln = math.hypot(p1[0] - p0[0], p1[2] - p0[2])
            m.box(mid, (ln, 0.025, 0.025), STEEL, SHINY, cuts=(0, 0, 0), bevel=0.0, jitter=0.0,
                  rot=(0, -(a0 + a1) / 2 - math.pi / 2, 0))
    for k in range(8):
        a = k * math.tau / 8
        mid = (math.cos(a) * 0.68, -0.28, 2.6 + math.sin(a) * 0.68)
        m.box(mid, (1.36, 0.02, 0.02), STEEL, SHINY, cuts=(0, 0, 0), bevel=0.0, jitter=0.0, rot=(0, -a, 0))
    m.decal("lbl_thisway", (0, 0.46, 0.06), (0, 1, 0), 0.6)
    return m.build()


def fan_blades(seed=62):
    m = Model("fan_blades", seed)
    blade = srgb("#8e9aa5")
    m.cylinder((0, 0.02, 0), 0.14, 0.12, srgb("#3c444c"), 14, SHINY, rot=(math.pi / 2, 0, 0), cuts=0, jitter=0.0)
    for k in range(3):
        a = k * math.tau / 3
        c = (math.cos(a) * 0.62, -0.03, math.sin(a) * 0.62)
        m.box(c, (1.0, 0.03, 0.38), blade, SHINY, cuts=(1, 0, 0), bevel=0.02, jitter=0.0, rot=(0.35, -a, 0))
    return m.build()


def pallet(seed=63):
    m = Model("pallet", seed)
    w = srgb("#b98a55")
    for x in (-0.5, 0.0, 0.5):
        m.box((x, 0, 0.05), (0.1, 1.2, 0.1), w, cuts=(0, 3, 0), bevel=0.008, jitter=0.004)
    for k in range(7):
        y = -0.54 + k * 0.18
        m.box((0, y, 0.12), (1.2, 0.12, 0.025), srgb("#c79c66") if k % 2 else w, cuts=(3, 0, 0), bevel=0.005,
              jitter=0.004, rot=(0, 0, m.rng.uniform(-0.01, 0.01)))
    return m.build()


def card_stack(seed=64):
    """Flattened boxes, stacked and waiting to become more city."""
    m = Model("card_stack", seed)
    z = 0.14
    pallet_faces = None
    for k in range(9):
        col = [KRAFT, KRAFT_PALE, KRAFT_DARK][k % 3]
        th = 0.035
        m.box((m.rng.uniform(-0.04, 0.04), m.rng.uniform(-0.04, 0.04), z + th / 2), (1.15, 0.85, th), col,
              cuts=(2, 2, 0), bevel=0.004, jitter=0.003, rot=(0, 0, m.rng.uniform(-0.06, 0.06)), edge=KRAFT_EDGE)
        z += th
    m.decal("lbl_misc", (0.0, 0.0, z + 0.002), UP, 0.5, up=(0, 1, 0), rot=12)
    m.tape((-0.45, -0.2, z), (-0.45, 0.35, z), UP, 0.08)
    for x in (-0.45, 0.0, 0.45):
        m.box((x, 0, 0.05), (0.1, 0.9, 0.1), srgb("#b98a55"), cuts=(0, 2, 0), bevel=0.008)
    m.box((0, 0, 0.12), (1.0, 0.9, 0.025), srgb("#c79c66"), cuts=(2, 2, 0), bevel=0.005)
    return m.build()


def tape_roll(seed=65):
    m = Model("tape_roll", seed)
    m.tube((0, 0, 0), 0.32, 0.22, TAPE_COL, KRAFT_DARK, 0.11, 28, TAPE)
    m.tube((0, 0, 0.0), 0.2, 0.222, KRAFT, KRAFT_DARK, 0.02, 24)
    m.plate((0.32, 0, 0.11), (0, 0, 1), (0.3, -1, 0), 0.22, 0.28, TAPE_COL, 0.004, TAPE, edge=TAPE_COL)
    return m.build()


def marker_pen(seed=66):
    m = Model("marker_pen", seed)
    rot = (0, math.pi / 2, 0.15)
    m.cylinder((-0.45, 0, 0.06), 0.06, 0.72, srgb("#f2efe6"), 14, SHINY, rot=rot, cuts=2)
    m.cylinder((0.25, 0.1, 0.06), 0.065, 0.26, RED, 14, SHINY, rot=rot, cuts=0)
    m.box((0.0, 0.0, 0.061), (0.36, 0.122, 0.002), RED, SHINY, cuts=(0, 0, 0), bevel=0.0, rot=(0, 0, 0.15), jitter=0.0)
    return m.build()


def scissors(seed=67):
    m = Model("scissors", seed)
    for s, col in ((1, srgb("#e06030")), (-1, srgb("#e06030"))):
        a = s * 0.18
        m.box((math.cos(a) * 0.35, math.sin(a) * 0.35, 0.015), (0.6, 0.06, 0.012), srgb("#c4cacf"), SHINY,
              cuts=(1, 0, 0), bevel=0.004, jitter=0.0, rot=(0, 0, a))
        cx, cy = -math.cos(a) * 0.18, math.sin(a) * 0.2 * s + s * 0.05
        m.tube((cx, cy, 0.0), 0.11, 0.04, col, col, 0.03, 16, SHINY)
    m.cylinder((0, 0, 0.02), 0.025, 0.02, srgb("#9aa0a6"), 8, SHINY, cuts=0)
    return m.build()


def build_trees():
    return [tree_cone(), tree_ball(), tree_pom()]


def build_props():
    return [fan_body(), fan_blades(), pallet(), card_stack(), tape_roll(), marker_pen(), scissors()]
