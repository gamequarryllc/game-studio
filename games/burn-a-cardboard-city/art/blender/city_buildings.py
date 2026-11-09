"""The city's buildings: suburb box houses, downtown office boxes, skyscraper row.

Footprints follow the game's grid (0.5 m cells): houses sit on 2x2-cell lots,
office boxes on 3x3 (or 4x3), skyscrapers on 4x4 (or 4x8). Front = -Y (the
street side), which the game turns to face the street.
"""
import math

from kit import (BLUE, CARD, CREAM, GREEN, GREY_BOARD, INK, INSIDE, KRAFT, KRAFT_DARK, KRAFT_EDGE, KRAFT_PALE,
                 PAPER, RED, SHINY, SKYBLUE, STEEL, TAPE_COL, TOMATO, WHITE_BOARD, YELLOW, Model, srgb)
from mathutils import Vector

FRONT = (0, -1, 0)
BACK = (0, 1, 0)
LEFT = (-1, 0, 0)
RIGHT = (1, 0, 0)
UP = (0, 0, 1)


# =====================================================================================
# Pieces shared by the houses
# =====================================================================================
def gable(m, w, d, z0, rise, color, ridge="x"):
    """The triangular gable ends (and hidden slopes) of a pitched roof, as one solid."""
    m._begin()
    bm = m.bm
    if ridge == "x":
        ends = [(-w / 2, ), (w / 2, )]
        pts = []
        for (x,) in ends:
            pts.append([bm.verts.new((x, -d / 2, z0)), bm.verts.new((x, d / 2, z0)), bm.verts.new((x, 0, z0 + rise))])
    else:
        pts = []
        for y in (-d / 2, d / 2):
            pts.append([bm.verts.new((-w / 2, y, z0)), bm.verts.new((w / 2, y, z0)), bm.verts.new((0, y, z0 + rise))])
    a, b = pts
    bm.faces.new((a[0], a[2], a[1]))
    bm.faces.new((b[0], b[1], b[2]))
    bm.faces.new((a[0], a[1], b[1], b[0]))
    bm.faces.new((a[1], a[2], b[2], b[1]))
    bm.faces.new((a[2], a[0], b[0], b[2]))
    faces = m._new()
    for f in faces:
        f.normal_update()
    import bmesh
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    m._paint(faces, color, CARD)
    m.jitter(faces, 0.003)
    return faces


def pitched_roof(m, w, d, z0, rise, color, wall, ridge="x", over=0.07, thick=0.014):
    """Two sheets of card folded over the ridge, with overhanging eaves."""
    gable(m, w, d, z0, rise, wall, ridge)
    top = Vector((0, 0, z0 + rise + thick * 0.5))
    if ridge == "x":
        for s in (-1, 1):
            out = Vector((0, s * d / 2, -rise)).normalized()
            slope = math.hypot(d / 2, rise)
            m.plate(top, (1, 0, 0), out, w + over * 1.6, slope + over, color, thick)
    else:
        for s in (-1, 1):
            out = Vector((s * w / 2, 0, -rise)).normalized()
            slope = math.hypot(w / 2, rise)
            m.plate(top, (0, 1, 0), out, d + over * 1.6, slope + over, color, thick)


def corner_tape(m, x, y, z0, z1, nx, ny):
    """Tape running down a box corner, half on each face."""
    m.tape((x, y, z1 + 0.04), (x, y, z0 + m.rng.uniform(0.15, 0.3)), (nx, ny, 0), 0.06)


def windows_on(m, face, w, d, zs, names, width, spread=0.55, skip_middle=False):
    """Marker windows across one face of a box (face: FRONT/BACK/LEFT/RIGHT)."""
    nx, ny, _ = face
    span = w if ny != 0 else d
    for z in zs:
        count = len(names)
        for k, name in enumerate(names):
            t = (k + 0.5) / count - 0.5
            off = t * span * spread * 2.0 / max(1, count) * count * 0.5
            if ny != 0:
                pos = (off, ny * d / 2, z)
            else:
                pos = (nx * w / 2, off, z)
            m.decal(name, pos, face, width)


# =====================================================================================
# Suburbs: box houses (2x2-cell lots, about 0.9 m across, knee high on the giant)
# =====================================================================================
def house_gable(seed=1):
    m = Model("house_gable", seed)
    w, d, h = 0.84, 0.76, 0.5
    m.box((0, 0, h / 2), (w, d, h), KRAFT, cuts=(3, 3, 2), bevel=0.012)
    pitched_roof(m, w, d, h, 0.3, KRAFT_DARK, KRAFT)
    m.tube((0.22, 0.14, h + 0.12), 0.055, 0.24, srgb("#b9a17f"))
    m.decal("door_red", (-0.2, -d / 2, 0.15), FRONT, 0.15)
    m.decal("win_blue", (0.17, -d / 2, 0.3), FRONT, 0.17)
    m.decal("win_lit", (-0.16, d / 2, 0.3), BACK, 0.17)
    m.decal("win_plain", (0.18, d / 2, 0.28), BACK, 0.16)
    m.decal("win_curtain", (w / 2, -0.12, 0.27), RIGHT, 0.15)
    m.decal("lbl_kitchen", (-w / 2, 0.05, 0.36), LEFT, 0.34, rot=-4)
    m.decal("win_sky", (-w / 2, -0.17, 0.2), LEFT, 0.14)
    m.decal("arrows_up", (w / 2, 0.22, 0.32), RIGHT, 0.14)
    corner_tape(m, w / 2, -d / 2, 0, h, 0.7, -0.7)
    m.tape((-0.3, -d / 2 - 0.02, h + 0.02), (-0.3, -d / 2 - 0.02, h - 0.12), FRONT, 0.05)
    return m.build()


def house_flaps(seed=2):
    m = Model("house_flaps", seed)
    w, d, h = 0.82, 0.8, 0.6
    m.box((0, 0, h / 2), (w, d, h), WHITE_BOARD, cuts=(3, 3, 2), bevel=0.012, sag=0.01)
    m.box((0, 0, h - 0.004), (w - 0.03, d - 0.03, 0.006), INSIDE, bevel=0.0, cuts=(0, 0, 0), jitter=0.0)
    m.flap((0, -d / 2, h), (1, 0, 0), (0, -1, 0), 118, w * 0.98, d * 0.48, WHITE_BOARD)
    m.flap((0, d / 2, h), (1, 0, 0), (0, 1, 0), 132, w * 0.98, d * 0.48, WHITE_BOARD)
    m.flap((-w / 2, 0, h), (0, 1, 0), (-1, 0, 0), 96, d * 0.96, w * 0.44, srgb("#ddd6c4"))
    m.flap((w / 2, 0, h), (0, 1, 0), (1, 0, 0), 150, d * 0.96, w * 0.44, srgb("#ddd6c4"))
    m.decal("door_blue", (0.18, -d / 2, 0.16), FRONT, 0.15)
    m.decal("win_lit", (-0.18, -d / 2, 0.36), FRONT, 0.17)
    m.decal("win_lit", (-0.18, -d / 2, 0.15), FRONT, 0.15, rot=3)
    m.decal("lbl_fragile", (0.1, d / 2, 0.42), BACK, 0.36, rot=-6)
    m.decal("glass", (-0.25, d / 2, 0.3), BACK, 0.1)
    m.decal("win_blue", (w / 2, 0.15, 0.33), RIGHT, 0.17)
    m.decal("win_round", (-w / 2, -0.1, 0.38), LEFT, 0.16)
    m.decal("heart", (-w / 2, 0.2, 0.18), LEFT, 0.09)
    corner_tape(m, -w / 2, -d / 2, 0, h, -0.7, -0.7)
    m.tape((w / 2 + 0.003, -0.25, 0.05), (w / 2 + 0.003, -0.25, 0.25), RIGHT, 0.05)
    return m.build()


def house_tall(seed=3):
    m = Model("house_tall", seed)
    w, d, h = 0.74, 0.7, 0.82
    m.box((0, 0, h / 2), (w, d, h), KRAFT_PALE, cuts=(2, 2, 3), bevel=0.012)
    pitched_roof(m, w, d, h, 0.26, RED, KRAFT_PALE, ridge="y", over=0.06)
    m.decal("win_round", (0, -d / 2, h + 0.09), FRONT, 0.12)
    m.decal("door_green", (0.16, -d / 2, 0.15), FRONT, 0.14)
    m.decal("win_curtain", (-0.16, -d / 2, 0.2), FRONT, 0.14)
    m.decal("win_blue", (-0.15, -d / 2, 0.56), FRONT, 0.15)
    m.decal("win_lit", (0.16, -d / 2, 0.56), FRONT, 0.15)
    m.decal("win_plain", (0, d / 2, 0.58), BACK, 0.16)
    m.decal("win_blue", (0, d / 2, 0.24), BACK, 0.16)
    m.decal("lbl_books", (w / 2, 0.0, 0.42), RIGHT, 0.3, rot=90 - 4)
    m.decal("win_lit", (-w / 2, 0.12, 0.55), LEFT, 0.15)
    m.decal("win_sky", (-w / 2, -0.12, 0.25), LEFT, 0.14)
    corner_tape(m, w / 2, d / 2, 0, h, 0.7, 0.7)
    m.tape((-w / 2 - 0.003, 0.05, h - 0.1), (-w / 2 - 0.003, 0.3, h - 0.08), LEFT, 0.05)
    return m.build()


def house_shoebox(seed=4):
    m = Model("house_shoebox", seed)
    w, d, h = 0.88, 0.58, 0.34
    body = srgb("#5f86a8")
    m.box((0, 0, h / 2), (w, d, h), body, cuts=(3, 2, 1), bevel=0.01)
    lid = srgb("#6f95b5")
    m.box((0.01, -0.006, h + 0.03), (w + 0.04, d + 0.04, 0.075), lid, cuts=(3, 2, 0), bevel=0.008,
          rot=(0.0, 0.0, 0.035), sag=0.008)
    m.box((0.24, 0, h + 0.075), (0.2, d + 0.045, 0.004), WHITE_BOARD, bevel=0.0, cuts=(1, 1, 0), jitter=0.001,
          rot=(0, 0, 0.035))
    m.decal("garage", (-0.22, -d / 2, 0.12), FRONT, 0.24)
    m.decal("door_red", (0.08, -d / 2, 0.13), FRONT, 0.13)
    m.decal("win_lit", (0.3, -d / 2, 0.19), FRONT, 0.15)
    m.decal("lbl_shoes", (0.0, d / 2, 0.2), BACK, 0.4, rot=2)
    m.decal("win_blue", (w / 2, 0.0, 0.18), RIGHT, 0.15)
    m.decal("star", (-w / 2, 0.1, 0.2), LEFT, 0.1)
    m.tape((-w / 2 + 0.12, -d / 2 - 0.022, h + 0.07), (-w / 2 + 0.12, -d / 2 - 0.022, h - 0.08), FRONT, 0.05)
    m.tape((w / 2 - 0.1, d / 2 + 0.022, h + 0.07), (w / 2 - 0.1, d / 2 + 0.022, h - 0.06), BACK, 0.05)
    return m.build()


def house_cottage(seed=5):
    m = Model("house_cottage", seed)
    w, d, h = 0.8, 0.84, 0.44
    m.box((0, 0, h / 2), (w, d, h), KRAFT, cuts=(3, 3, 1), bevel=0.012, sag=0.006)
    pitched_roof(m, w, d, h, 0.34, srgb("#4e7a9c"), KRAFT, ridge="y", over=0.06)
    m.decal("win_arch", (0, -d / 2, h + 0.12), FRONT, 0.09)
    m.decal("door_blue", (-0.16, -d / 2, 0.15), FRONT, 0.15)
    m.decal("win_curtain", (0.18, -d / 2, 0.24), FRONT, 0.15)
    m.decal("heart", (0.18, -d / 2, 0.1), FRONT, 0.07)
    m.decal("win_plain", (w / 2, -0.15, 0.25), RIGHT, 0.15)
    m.decal("win_lit", (w / 2, 0.18, 0.25), RIGHT, 0.15)
    m.decal("lbl_misc", (-w / 2, 0.02, 0.26), LEFT, 0.28, rot=6)
    m.decal("win_blue", (0, d / 2, 0.25), BACK, 0.16)
    m.tube((-0.18, 0.22, h + 0.1), 0.05, 0.26, srgb("#c9b08a"))
    corner_tape(m, -w / 2, d / 2, 0, h, -0.7, 0.7)
    m.tape((w / 2 + 0.003, -0.35, h - 0.05), (w / 2 + 0.003, -0.35, h - 0.25), RIGHT, 0.05)
    return m.build()


# =====================================================================================
# Downtown: office boxes (3x3-cell lots, about 1.35 m across, chest high)
# =====================================================================================
GROUND = 0.36
FLOOR = 0.3


def office_floors(m, w, d, floors, rows, sides=(FRONT, BACK, LEFT, RIGHT), z0=GROUND):
    for fl in range(floors):
        z = z0 + (fl + 0.5) * FLOOR
        for face in sides:
            span = w if face[1] != 0 else d
            name = rows[(fl + (0 if face in (FRONT, BACK) else 1)) % len(rows)]
            nx, ny, _ = face
            pos = (0, ny * d / 2, z) if ny != 0 else (nx * w / 2, 0, z)
            m.decal(name, pos, face, span * 0.84, FLOOR * 0.78)


def shopfront(m, w, d, sign, door="door_shop"):
    m.decal(door, (-w * 0.22, -d / 2, 0.15), FRONT, 0.26)
    m.decal("win_sky", (w * 0.2, -d / 2, 0.16), FRONT, 0.26, 0.22)
    # A folded-card awning over the shop window.
    m.flap((0, -d / 2, GROUND - 0.02), (1, 0, 0), (0, -1, 0), -28, w * 0.86, 0.17, CREAM, 0.006)
    m.decal("awning", (0, -d / 2 - 0.075, GROUND - 0.055), (0, -0.47, 0.88), w * 0.84, 0.15, lift=0.006)
    m.decal(sign, (0, -d / 2, GROUND + 0.06), FRONT, w * 0.5)


def top_flaps(m, w, d, h, color, angles=(110, 125, 95, 140)):
    m.box((0, 0, h - 0.004), (w - 0.03, d - 0.03, 0.006), INSIDE, bevel=0.0, cuts=(0, 0, 0), jitter=0.0)
    m.flap((0, -d / 2, h), (1, 0, 0), (0, -1, 0), angles[0], w * 0.98, d * 0.48, color)
    m.flap((0, d / 2, h), (1, 0, 0), (0, 1, 0), angles[1], w * 0.98, d * 0.48, color)
    m.flap((-w / 2, 0, h), (0, 1, 0), (-1, 0, 0), angles[2], d * 0.96, w * 0.46, color)
    m.flap((w / 2, 0, h), (0, 1, 0), (1, 0, 0), angles[3], d * 0.96, w * 0.46, color)


def h_tape(m, w, d, h):
    """Box tape: one strip along the seam over the top, running down the ends."""
    m.tape((-w / 2 - 0.004, 0, h - 0.16), (-w / 2 - 0.004, 0, h + 0.003), LEFT, 0.08)
    m.tape((-w / 2, 0, h + 0.003), (w / 2, 0, h + 0.003), UP, 0.08)
    m.tape((w / 2 + 0.004, 0, h + 0.003), (w / 2 + 0.004, 0, h - 0.18), RIGHT, 0.08)


def office_a(seed=11):
    m = Model("office_a", seed)
    w, d, floors = 1.32, 1.3, 5
    h = GROUND + floors * FLOOR
    m.box((0, 0, h / 2), (w, d, h), KRAFT, cuts=(3, 3, floors + 1), bevel=0.016)
    office_floors(m, w, d, floors, ["office_a", "office_a2"])
    shopfront(m, w, d, "lbl_bakery")
    top_flaps(m, w, d, h, KRAFT, (112, 128, 100, 146))
    m.decal("lbl_thisway", (-w / 2, 0.3, GROUND * 0.5), LEFT, 0.42)
    m.decal("arrows_up", (w / 2, -0.4, GROUND * 0.5), RIGHT, 0.2)
    corner_tape(m, w / 2, -d / 2, 0, h, 0.7, -0.7)
    return m.build()


def office_b(seed=12):
    m = Model("office_b", seed)
    w, d, floors = 1.3, 1.28, 4
    h = GROUND + floors * FLOOR
    m.box((0, 0, h / 2), (w, d, h), WHITE_BOARD, cuts=(3, 3, floors + 1), bevel=0.016, sag=0.012)
    office_floors(m, w, d, floors, ["office_b", "office_c"])
    shopfront(m, w, d, "lbl_cafe")
    h_tape(m, w, d, h)
    m.decal("lbl_fragile", (0.25, d / 2, GROUND * 0.55), BACK, 0.4, rot=-5)
    m.decal("recycle", (w / 2, 0.4, GROUND * 0.5), RIGHT, 0.18)
    # A paper-cup water tank on the roof.
    m.cylinder((0.3, 0.25, h + 0.1), 0.13, 0.22, CREAM, 14, PAPER, radius_top=0.16)
    for k in range(3):
        a = k * 2.094
        m.cylinder((0.3 + math.cos(a) * 0.1, 0.25 + math.sin(a) * 0.1, h), 0.012, 0.11, STEEL, 6, SHINY, cuts=0)
    return m.build()


def office_stack(seed=13):
    m = Model("office_stack", seed)
    w, d = 1.32, 1.3
    h1 = GROUND + 3 * FLOOR
    m.box((0, 0, h1 / 2), (w, d, h1), KRAFT_DARK, cuts=(3, 3, 4), bevel=0.016)
    office_floors(m, w, d, 3, ["office_a2", "office_b"])
    shopfront(m, w, d, "lbl_toys")
    w2, d2, h2 = 1.06, 1.0, 2 * FLOOR + 0.08
    m.box((0.05, 0.04, h1 + h2 / 2), (w2, d2, h2), KRAFT_PALE, cuts=(3, 3, 2), bevel=0.014, rot=(0, 0, 0.07))
    for fl in range(2):
        z = h1 + 0.04 + (fl + 0.5) * FLOOR
        m.decal("office_a", (0.05 - 0.04, 0.04 - d2 / 2 - 0.035, z), (0.07, -1, 0), w2 * 0.8, FLOOR * 0.76)
    m.decal("lbl_xmas", (w2 / 2 + 0.06, 0.08, h1 + h2 * 0.5), (1, 0.07, 0), 0.4, rot=4)
    h_tape(m, w, d, h1)
    corner_tape(m, -w / 2, -d / 2, 0, h1, -0.7, -0.7)
    return m.build()


def office_tall(seed=14):
    m = Model("office_tall", seed)
    w, d, floors = 1.3, 1.3, 7
    h = GROUND + floors * FLOOR
    m.box((0, 0, h / 2), (w, d, h), srgb("#b98d5b"), cuts=(3, 3, floors + 1), bevel=0.016)
    office_floors(m, w, d, floors, ["office_c", "office_a", "office_a2"])
    shopfront(m, w, d, "lbl_hotel", "door_blue")
    m.box((-0.22, 0.2, h + 0.14), (0.4, 0.42, 0.28), KRAFT_PALE, cuts=(1, 1, 1), bevel=0.01, rot=(0, 0, -0.1))
    m.decal("win_plain", (-0.22, 0.2 - 0.21 - 0.02, h + 0.14), (-0.1, -1, 0), 0.14)
    m.tape((-w / 2, -0.3, h + 0.003), (w / 2, -0.25, h + 0.003), UP, 0.08)
    m.tape((0.35, -d / 2 - 0.004, h - 0.5), (0.5, -d / 2 - 0.004, h - 0.35), FRONT, 0.06)
    m.decal("lbl_no7", (w / 2, 0.35, GROUND * 0.5), RIGHT, 0.24)
    return m.build()


def office_wide(seed=15):
    m = Model("office_wide", seed)
    w, d, floors = 1.82, 1.3, 4
    h = GROUND + floors * FLOOR
    m.box((0, 0, h / 2), (w, d, h), KRAFT, cuts=(4, 3, floors + 1), bevel=0.016, sag=0.01)
    office_floors(m, w, d, floors, ["office_a", "office_b", "office_a2"])
    m.decal("door_shop", (0, -d / 2, 0.15), FRONT, 0.28)
    m.decal("win_sky", (-0.55, -d / 2, 0.16), FRONT, 0.3, 0.22)
    m.decal("win_sky", (0.55, -d / 2, 0.16), FRONT, 0.3, 0.22)
    m.decal("lbl_bank", (0, -d / 2, GROUND + 0.02), FRONT, 0.6)
    top_flaps(m, w, d, h, KRAFT, (100, 100, 118, 132))
    m.decal("lbl_books", (0.2, d / 2, GROUND * 0.55), BACK, 0.45, rot=3)
    corner_tape(m, w / 2, d / 2, 0, h, 0.7, 0.7)
    return m.build()


# =====================================================================================
# Skyscraper row (4x4-cell lots, about 1.8 m across, head high and up)
# =====================================================================================
def sky_grid(m, w, d, z0, z1, names, sides=(FRONT, BACK, LEFT, RIGHT), band=0.6, off=(0, 0)):
    z = z0
    k = 0
    while z + band <= z1 + 0.01:
        for face in sides:
            span = w if face[1] != 0 else d
            nx, ny, _ = face
            pos = (off[0], off[1] + ny * d / 2, z + band / 2) if ny != 0 else (off[0] + nx * w / 2, off[1], z + band / 2)
            m.decal(names[(k + (face[0] != 0)) % len(names)], pos, face, span * 0.86, band * 0.86)
        z += band
        k += 1


def sky_setback(seed=21):
    m = Model("sky_setback", seed)
    w, d, h = 1.72, 1.7, 3.0
    m.box((0, 0, h / 2), (w, d, h), KRAFT, cuts=(3, 3, 6), bevel=0.02)
    sky_grid(m, w, d, 0.3, h - 0.1, ["sky_a", "sky_a2"])
    m.decal("door_shop", (0, -d / 2, 0.15), FRONT, 0.3)
    w2, d2, h2 = 1.18, 1.16, 0.96
    m.box((0, 0, h + h2 / 2), (w2, d2, h2), KRAFT_PALE, cuts=(2, 2, 2), bevel=0.016)
    sky_grid(m, w2, d2, h + 0.05, h + h2, ["sky_a2"], band=0.45)
    m.cylinder((0.25, 0.1, h + h2), 0.02, 0.9, srgb("#f2f0ea"), 8, SHINY, cuts=2)  # a drinking straw
    m.cylinder((0.25, 0.1, h + h2 + 0.9), 0.02, 0.14, srgb("#e05a5a"), 8, SHINY, cuts=0, rot=(0.6, 0, 0))
    h_tape(m, w, d, h)
    m.decal("lbl_thisway", (-w / 2, 0.3, 0.2), LEFT, 0.5)
    return m.build()


def sky_white(seed=22):
    m = Model("sky_white", seed)
    w, d, h = 1.6, 1.6, 4.0
    m.box((0, 0, h / 2), (w, d, h), WHITE_BOARD, cuts=(3, 3, 8), bevel=0.02, sag=0.015)
    sky_grid(m, w, d, 0.42, h - 0.2, ["sky_b"], band=0.56)
    m.decal("door_blue", (0.2, -d / 2, 0.17), FRONT, 0.2)
    m.decal("lbl_lofts", (-0.25, -d / 2, 0.24), FRONT, 0.5)
    top_flaps(m, w, d, h, WHITE_BOARD, (175, 172, 168, 178))
    m.tape((-0.5, -d / 2 - 0.004, h - 0.02), (-0.45, -d / 2 - 0.004, h - 0.4), FRONT, 0.07)
    m.tape((w / 2 + 0.004, 0.5, h * 0.4), (w / 2 + 0.004, 0.2, h * 0.4 - 0.25), RIGHT, 0.07)
    return m.build()


def sky_tube(seed=23):
    m = Model("sky_tube", seed)
    r, h = 0.78, 3.6
    m.tube((0, 0, 0), r, h, srgb("#b88e5e"), srgb("#4d3a28"), 0.03, 24)
    m.box((0, 0, h - 0.06), (r * 1.6, r * 1.6, 0.02), INSIDE, bevel=0.0, cuts=(0, 0, 0), jitter=0.0)
    m.cone((0, 0, h), r * 1.12, 1.1, BLUE, 24)
    for fl in range(6):
        z = 0.5 + fl * 0.52
        for k in range(6):
            a = k * math.pi / 3 + (fl % 2) * 0.5
            n = (math.cos(a), math.sin(a), 0)
            m.decal("win_lit" if (fl + k) % 3 == 0 else "win_sky", (n[0] * r, n[1] * r, z), n, 0.28, lift=0.01)
    m.decal("lbl_hotel", (0, -r, 0.22), FRONT, 0.6, lift=0.02)
    m.tape((r * 0.7, -r * 0.71, 1.4), (r * 0.71, -r * 0.7, 2.2), (0.7, -0.7, 0), 0.08)
    return m.build()


def sky_ziggurat(seed=24):
    m = Model("sky_ziggurat", seed)
    tiers = [(1.76, 1.74, 1.5, KRAFT_DARK), (1.38, 1.36, 1.4, KRAFT), (1.0, 0.98, 1.2, KRAFT_PALE)]
    z = 0.0
    for k, (w, d, h, col) in enumerate(tiers):
        m.box((0, 0, z + h / 2), (w, d, h), col, cuts=(3, 3, 3), bevel=0.018, rot=(0, 0, (k - 1) * 0.04))
        sky_grid(m, w, d, z + (0.3 if k == 0 else 0.08), z + h - 0.05, ["sky_a", "sky_a2"], band=0.5)
        if k < 2:
            h_tape(m, w, d, z + h)
        z += h
    m.decal("door_shop", (0, -0.87, 0.15), FRONT, 0.3)
    m.cylinder((-0.2, 0.1, z), 0.02, 0.7, srgb("#f2f0ea"), 8, SHINY, cuts=1)
    m.decal("lbl_misc", (0.88, -0.2, 0.2), RIGHT, 0.5)
    return m.build()


def sky_wide(seed=25):
    m = Model("sky_wide", seed)
    w, d, h = 1.74, 3.6, 3.2
    m.box((0, 0, h / 2), (w, d, h), KRAFT, cuts=(3, 6, 6), bevel=0.02, sag=0.02)
    sky_grid(m, w, d, 0.36, h - 0.1, ["sky_a", "sky_b", "sky_a2"], band=0.55)
    m.decal("door_shop", (0, -d / 2, 0.15), FRONT, 0.32)
    m.decal("lbl_bank", (0, -d / 2, 0.36), FRONT, 0.6)
    top_flaps(m, w, d, h, KRAFT, (98, 104, 120, 130))
    m.decal("lbl_donot", (w / 2, 0.8, 0.2), RIGHT, 0.6, rot=-3)
    corner_tape(m, -w / 2, -d / 2, 0, h, -0.7, -0.7)
    return m.build()


HOUSES = [house_gable, house_flaps, house_tall, house_shoebox, house_cottage]
OFFICES = [office_a, office_b, office_stack, office_tall, office_wide]
SKYSCRAPERS = [sky_setback, sky_white, sky_tube, sky_ziggurat, sky_wide]
