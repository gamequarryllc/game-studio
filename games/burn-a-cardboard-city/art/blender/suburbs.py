"""The suburbs: houses made from the recycling bin and painted with poster paint.

Cereal boxes (painted on the front, the printed side left showing at the back,
roofs folded from another box with the print side up), a milk and a juice carton
glued together, a tissue box with a tissue still poking out, a cereal box turned
inside out, a painted shoebox with its lid for a roof, two boxes stacked into a
two-storey house. Trees are crumpled tissue paper pushed onto pencils stuck in a
blob of modelling clay.

Footprints follow the game's grid (houses on 2x2-cell lots, about 1 m, trees on
one cell). Front = -Y (the street side). Origin: middle of the footprint, on the floor.
"""
import math

from kit import (CARD, CEREAL_IN, CREAM, INK, INSIDE, KRAFT, KRAFT_DARK, KRAFT_EDGE, PAPER, SHINY, TAPE_COL, WHITE_BOARD,
                 Model, srgb)
from mathutils import Vector, noise

FRONT = (0, -1, 0)
BACK = (0, 1, 0)
LEFT = (-1, 0, 0)
RIGHT = (1, 0, 0)
UP = (0, 0, 1)

# Poster paint (muted, chalky) and the print under it.
TEAL = srgb("#4f8a86")
MUSTARD = srgb("#d3a640")
BRICK = srgb("#b4523c")
SAGE = srgb("#8fa878")
LILAC = srgb("#9c8db8")
CHALK = srgb("#ece2c8")
PRINT_BLUE = srgb("#2c5aa2")
PRINT_ORANGE = srgb("#e07a2c")
PRINT_PURPLE = srgb("#6e3078")
PRINT_RED = srgb("#c23a2b")


def faces_facing(faces, d, cos=0.8):
    d = Vector(d)
    return [f for f in faces if f.normal.dot(d) > cos]


def gable_solid(m, w, d, z0, rise, color, ridge="x"):
    """The triangular gable ends under a pitched roof, as one closed solid."""
    import bmesh
    m._begin()
    bm = m.bm
    if ridge == "x":
        a = [bm.verts.new((-w / 2, -d / 2, z0)), bm.verts.new((-w / 2, d / 2, z0)), bm.verts.new((-w / 2, 0, z0 + rise))]
        b = [bm.verts.new((w / 2, -d / 2, z0)), bm.verts.new((w / 2, d / 2, z0)), bm.verts.new((w / 2, 0, z0 + rise))]
    else:
        a = [bm.verts.new((-w / 2, -d / 2, z0)), bm.verts.new((w / 2, -d / 2, z0)), bm.verts.new((0, -d / 2, z0 + rise))]
        b = [bm.verts.new((-w / 2, d / 2, z0)), bm.verts.new((w / 2, d / 2, z0)), bm.verts.new((0, d / 2, z0 + rise))]
    bm.faces.new((a[0], a[2], a[1]))
    bm.faces.new((b[0], b[1], b[2]))
    bm.faces.new((a[0], a[1], b[1], b[0]))
    bm.faces.new((a[1], a[2], b[2], b[1]))
    bm.faces.new((a[2], a[0], b[0], b[2]))
    faces = m._new()
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    m._paint(faces, color, CARD)
    return faces


def folded_roof(m, w, d, z0, rise, top, under, ridge="x", over=0.06, thick=0.01):
    """A sheet of card from another box, folded over the ridge: printed side up."""
    peak = Vector((0, 0, z0 + rise + thick * 0.5))
    out_faces = []
    if ridge == "x":
        slope = math.hypot(d / 2, rise)
        for s in (-1, 1):
            out = Vector((0, s * d / 2, -rise)).normalized()
            out_faces += m.plate(peak, (1, 0, 0), out, w + over * 1.6, slope + over, top, thick, under=under, cuts=4)
    else:
        slope = math.hypot(w / 2, rise)
        for s in (-1, 1):
            out = Vector((s * w / 2, 0, -rise)).normalized()
            out_faces += m.plate(peak, (0, 1, 0), out, d + over * 1.6, slope + over, top, thick, under=under, cuts=4)
    return out_faces


def roof_decal(m, name, w, d, z0, rise, side, width, f=0.5, along=0.0, ridge="x", rot=0.0, thick=0.012):
    """A decal lying on one slope of a folded roof (side -1 or +1), `f` of the way down."""
    if ridge == "x":
        n = Vector((0, side * rise, d / 2)).normalized()
        p = Vector((along, side * f * d / 2, z0 + rise * (1 - f))) + n * thick
        m.decal(name, p, n, width, up=(0, -side, 0) if False else (0, 0, 1), rot=rot, lift=0.004)
    else:
        n = Vector((side * rise, 0, w / 2)).normalized()
        p = Vector((side * f * w / 2, along, z0 + rise * (1 - f))) + n * thick
        m.decal(name, p, n, width, up=(0, 0, 1), rot=rot, lift=0.004)


def corner_tape(m, x, y, z0, z1, nx, ny):
    m.tape((x, y, z1 + 0.03), (x, y, z0 + m.rng.uniform(0.12, 0.25)), (nx, ny, 0), 0.05)


# =====================================================================================
# Houses
# =====================================================================================
def house_cereal(seed=1):
    """A cereal box on its side, painted teal on the front; the printed end panel was
    left alone. The roof is folded from a box of Crunchos, print side up."""
    m = Model("house_cereal", seed)
    w, d, h = 0.8, 0.44, 0.5
    body = m.box((0, 0, h / 2), (w, d, h), TEAL, cuts=(10, 6, 7), bevel=0.01, sag=0.006)
    m.streaks([f for f in body if abs(f.normal.x) < 0.7], TEAL, 0.16, under=PRINT_BLUE, misses=0.12)
    m._paint(faces_facing(body, LEFT), PRINT_BLUE, CARD)
    gable_solid(m, w, d, h, 0.26, TEAL)
    folded_roof(m, w, d, h, 0.26, PRINT_ORANGE, CEREAL_IN, "x", 0.07)
    roof_decal(m, "cer_crunch", w, d, h, 0.26, -1, 0.7, 0.5, 0.02, rot=-3)
    roof_decal(m, "cer_burst", w, d, h, 0.26, 1, 0.3, 0.5, -0.16, rot=8)
    roof_decal(m, "cer_bowl", w, d, h, 0.26, 1, 0.28, 0.52, 0.2, rot=-4)
    m.decal("cer_nutri", (-w / 2, 0.08, 0.25), LEFT, 0.17)
    m.decal("cer_bowl", (-w / 2, -0.12, 0.33), LEFT, 0.14)
    m.decal("door_red", (-0.2, -d / 2, 0.15), FRONT, 0.14)
    m.decal("win_curtain", (0.06, -d / 2, 0.27), FRONT, 0.14)
    m.decal("win_lit", (0.26, -d / 2, 0.27), FRONT, 0.14, rot=2)
    m.decal("win_plain", (0.15, d / 2, 0.27), BACK, 0.15)
    m.decal("win_blue", (w / 2, 0.0, 0.25), RIGHT, 0.15)
    # A toothpaste box for a chimney.
    m.box((0.22, 0.1, h + 0.17), (0.07, 0.07, 0.26), WHITE_BOARD, cuts=(0, 0, 2), bevel=0.004, rot=(0, 0, 0.2))
    m.box((0.22, 0.1, h + 0.23), (0.072, 0.072, 0.05), PRINT_RED, cuts=(0, 0, 0), bevel=0.003, rot=(0, 0, 0.2))
    corner_tape(m, w / 2, -d / 2, 0, h, 0.7, -0.7)
    # A folded-card porch roof over the door.
    m.flap((-0.2, -d / 2, 0.3), (1, 0, 0), (0, -1, 0), -24, 0.22, 0.1, CHALK, 0.006, under=CEREAL_IN)
    return m.build()


def house_cartons(seed=2):
    """A milk carton and a juice carton glued side by side: semi-detached."""
    m = Model("house_cartons", seed)
    s, h = 0.36, 0.56
    for k, (x, label, body_col, top_col) in enumerate([(-0.2, "milk_label", srgb("#f1efe8"), srgb("#3d6cb3")),
                                                        (0.2, "juice_label", srgb("#f6ead6"), PRINT_ORANGE)]):
        hh = h + (0.06 if k else 0.0)
        m.box((x, 0, hh / 2), (s, s, hh), body_col, cuts=(3, 3, 5), bevel=0.008, flag=PAPER)
        # The gable top, and the sealed fin along its ridge.
        gable_solid(m, s, s, hh, 0.16, top_col, ridge="x" if k else "y")
        if k:
            m.plate((x, 0, hh + 0.16), (1, 0, 0), (0, 0, 1), s * 0.98, 0.05, top_col, 0.008, PAPER, edge=top_col)
        else:
            m.plate((x, 0, hh + 0.16), (0, 1, 0), (0, 0, 1), s * 0.98, 0.05, top_col, 0.008, PAPER, edge=top_col)
            m.cylinder((x - 0.08, -0.07, hh + 0.08), 0.032, 0.05, srgb("#e8e2d0"), 12, SHINY, rot=(0.0, -0.55, 0.0), cuts=0)
        m.decal(label, (x + (-s / 2 if k == 0 else s / 2), 0.0, hh * 0.48), LEFT if k == 0 else RIGHT, 0.3)
        m.decal(label, (x, -s / 2, hh * 0.3), FRONT, 0.32, lift=0.004)
        m.decal("door_blue" if k == 0 else "door_green", (x - 0.06, -s / 2, 0.13), FRONT, 0.11, lift=0.009)
        m.decal("win_lit" if k else "win_sky", (x + 0.08, -s / 2, 0.44), FRONT, 0.12, lift=0.009)
        m.decal("win_plain", (x, s / 2, 0.34), BACK, 0.13)
    m.tape((-0.02, -s / 2 - 0.003, 0.48), (0.02, -s / 2 - 0.003, 0.2), FRONT, 0.05)
    return m.build()


def house_tissue(seed=3):
    """A tissue box with flowers on it, one tissue still poking out of the top."""
    m = Model("house_tissue", seed)
    w, d, h = 0.82, 0.46, 0.36
    m.box((0, 0, h / 2), (w, d, h), srgb("#c4e2d6"), cuts=(6, 4, 3), bevel=0.01, sag=0.008, flag=PAPER)
    m.decal("tissue_print", (0, -d / 2, h * 0.5), FRONT, w * 0.97, h * 0.94, lift=0.004)
    m.decal("tissue_print", (0, d / 2, h * 0.5), BACK, w * 0.97, h * 0.94, lift=0.004)
    # The oval slot on top, and the tissue.
    m.decal("tissue_print", (-0.02, 0.0, h + 0.002), UP, w * 0.94, d * 0.9, up=(0, 1, 0))
    m.decal("win_round", (0.05, 0.0, h + 0.004), UP, 0.3, 0.18, up=(0, 1, 0))
    t = m.ball((0.05, 0.0, h + 0.15), 0.12, srgb("#f6f4ef"), PAPER, 2, 0.2, smooth=True)
    m.transform(t, ((1, 0, 0, 0), (0, 0.5, 0, 0), (0, 0, 1.3, -0.05), (0, 0, 0, 1)))
    m.crumple(t, 0.03, 12.0)
    m.decal("door_red", (-0.25, -d / 2, 0.13), FRONT, 0.13, lift=0.008)
    m.decal("win_curtain", (0.0, -d / 2, 0.2), FRONT, 0.13, lift=0.008)
    m.decal("win_curtain", (0.25, -d / 2, 0.2), FRONT, 0.13, lift=0.008)
    m.decal("win_lit", (w / 2, 0.0, 0.2), RIGHT, 0.14)
    m.decal("heart", (-w / 2, 0.08, 0.22), LEFT, 0.08)
    m.flap((-0.25, -d / 2, 0.27), (1, 0, 0), (0, -1, 0), -30, 0.22, 0.09, srgb("#e3a9b8"), 0.005, under=CEREAL_IN)
    corner_tape(m, -w / 2, d / 2, 0, h, -0.7, 0.7)
    return m.build()


def house_insideout(seed=4):
    """A cereal box turned inside out (plain grey card), its top flaps folded into a
    steep tent roof, drawn on in marker."""
    m = Model("house_insideout", seed)
    w, d, h = 0.6, 0.46, 0.64
    m.box((0, 0, h / 2), (w, d, h), CEREAL_IN, cuts=(3, 3, 5), bevel=0.008, sag=0.004)
    # The glue tab down one corner (a lighter strip, overlapping).
    m.box((w / 2 - 0.012, -d / 2 - 0.004, h / 2), (0.05, 0.006, h * 0.98), srgb("#b1a798"), cuts=(0, 0, 3), bevel=0.0,
          jitter=0.001)
    m.flap((0, -d / 2, h), (1, 0, 0), (0, -1, 0), 136, w * 0.98, d * 0.66, CEREAL_IN, 0.008, under=PRINT_PURPLE)
    m.flap((0, d / 2, h), (1, 0, 0), (0, 1, 0), 141, w * 0.98, d * 0.66, CEREAL_IN, 0.008, under=PRINT_PURPLE)
    m.flap((-w / 2, 0, h), (0, 1, 0), (-1, 0, 0), 40, d * 0.9, 0.09, CEREAL_IN, 0.008, under=PRINT_PURPLE)
    m.decal("door_green", (0.12, -d / 2, 0.15), FRONT, 0.14)
    m.decal("win_blue", (-0.13, -d / 2, 0.2), FRONT, 0.13)
    m.decal("win_lit", (-0.13, -d / 2, 0.46), FRONT, 0.13, rot=-3)
    m.decal("win_round", (0.13, -d / 2, 0.47), FRONT, 0.11)
    m.decal("smiley", (w / 2, -0.1, 0.48), RIGHT, 0.08)
    # A big felt-tip sun drawn on the front roof flap (someone small helped with this one).
    m.decal("sun", (0.02, -d / 2 + 0.108, h + 0.104), (0, -0.695, 0.719), 0.26, lift=0.012)
    m.decal("win_plain", (w / 2, 0.08, 0.25), RIGHT, 0.14)
    m.decal("lbl_no7", (-w / 2, 0.0, 0.3), LEFT, 0.2, rot=-6)
    m.decal("win_sky", (0, d / 2, 0.4), BACK, 0.14)
    return m.build()


def house_shoebox(seed=5):
    """A shoebox painted mustard, its lid on top for a flat roof."""
    m = Model("house_shoebox", seed)
    w, d, h = 0.88, 0.56, 0.34
    body = m.box((0, 0, h / 2), (w, d, h), MUSTARD, cuts=(10, 6, 4), bevel=0.01)
    m.streaks(body, MUSTARD, 0.18, (26.0, 3.0, 3.0), under=srgb("#e8e0cf"), misses=0.1)
    lid = srgb("#c8402f")
    m.box((0.01, -0.006, h + 0.032), (w + 0.04, d + 0.04, 0.07), lid, cuts=(4, 3, 0), bevel=0.008, rot=(0.0, 0.0, 0.03),
          sag=0.008)
    m.box((0.22, 0, h + 0.068), (0.18, d + 0.044, 0.004), srgb("#f2efe6"), bevel=0.0, cuts=(1, 1, 0), jitter=0.001,
          rot=(0, 0, 0.03))
    m.decal("lbl_shoes", (-0.12, 0.0, h + 0.069), UP, 0.5, up=(0, 1, 0), rot=3)
    m.decal("garage", (-0.22, -d / 2, 0.12), FRONT, 0.24)
    m.decal("door_red", (0.08, -d / 2, 0.13), FRONT, 0.12)
    m.decal("win_lit", (0.3, -d / 2, 0.19), FRONT, 0.14)
    m.decal("lbl_shoes", (w / 2, 0.0, 0.17), RIGHT, 0.36, rot=2)
    m.decal("win_blue", (0.1, d / 2, 0.18), BACK, 0.14)
    m.decal("star", (-w / 2, 0.1, 0.2), LEFT, 0.09)
    m.tape((-w / 2 + 0.12, -d / 2 - 0.022, h + 0.065), (-w / 2 + 0.12, -d / 2 - 0.022, h - 0.07), FRONT, 0.05)
    return m.build()


def house_stack(seed=6):
    """Two boxes stacked into a two-storey house: brick red below, chalk above, a roof
    folded from a box of Oat Loops."""
    m = Model("house_stack", seed)
    w, d, h1 = 0.72, 0.62, 0.42
    low = m.box((0, 0, h1 / 2), (w, d, h1), BRICK, cuts=(8, 7, 5), bevel=0.01)
    m.streaks(low, BRICK, 0.16, under=PRINT_BLUE, misses=0.1)
    w2, d2, h2 = 0.6, 0.52, 0.32
    up = m.box((0.02, 0.01, h1 + h2 / 2), (w2, d2, h2), CHALK, cuts=(7, 6, 4), bevel=0.01)
    m.streaks(up, CHALK, 0.1, under=PRINT_ORANGE, misses=0.08)
    gable_solid(m, w2, d2, h1 + h2, 0.22, CHALK, ridge="y")
    folded_roof(m, w2, d2, h1 + h2, 0.22, PRINT_BLUE, CEREAL_IN, "y", 0.06)
    roof_decal(m, "cer_oat", w2, d2, h1 + h2, 0.22, 1, 0.5, 0.5, -0.02, ridge="y", rot=2)
    roof_decal(m, "cer_honey", w2, d2, h1 + h2, 0.22, -1, 0.48, 0.5, 0.02, ridge="y", rot=-3)
    m.decal("door_blue", (0.15, -d / 2, 0.15), FRONT, 0.14)
    m.decal("win_curtain", (-0.15, -d / 2, 0.22), FRONT, 0.14)
    m.decal("win_blue", (-0.12, -d2 / 2 + 0.005, h1 + 0.16), FRONT, 0.13)
    m.decal("win_lit", (0.14, -d2 / 2 + 0.01, h1 + 0.16), FRONT, 0.13)
    m.decal("win_plain", (w / 2, 0.1, 0.22), RIGHT, 0.14)
    m.decal("win_sky", (-w / 2, -0.05, 0.22), LEFT, 0.14)
    m.decal("win_round", (0.0, d2 / 2 + 0.01, h1 + 0.17), BACK, 0.12)
    m.tube((-0.15, 0.12, h1 + h2 + 0.06), 0.045, 0.26, srgb("#b89a74"))
    corner_tape(m, -w / 2, -d / 2, 0, h1, -0.7, -0.7)
    return m.build()


# =====================================================================================
# Trees: crumpled tissue paper pushed onto hexagonal pencils stuck in a blob of clay
# =====================================================================================
# Tissue greens pulled toward the palette (sage and olive, not lime), with the creases paler.
TISSUE = srgb("#7d9a58")
TISSUE_LIGHT = srgb("#a2b878")
TISSUE_DARK = srgb("#5a7848")
TISSUE_OLIVE = srgb("#8a9248")


def pencil(m, base, length, color, lean=(0.0, 0.0)):
    """A hexagonal pencil standing in the clay, sharpened end up into the tissue: six
    flat painted faces (each catches the light differently), a thin gold band."""
    x, y, z = base
    shaft = m.cylinder((x, y, z), 0.024, length, color, 6, CARD, cuts=2, smooth=False, jitter=0.0)
    m.paint_by(shaft, lambda p, n: [color[i] * (0.82 + 0.18 * (0.5 + 0.5 * math.sin(math.atan2(n.y, n.x) * 3.0)))
                                    for i in range(3)])
    band = m.cylinder((x, y, z + length * 0.12), 0.0245, 0.012, srgb("#c9a040"), 6, SHINY, cuts=0, smooth=False, jitter=0.0)
    wood = m.cylinder((x, y, z + length), 0.024, 0.05, srgb("#e2c290"), 6, CARD, radius_top=0.005, cuts=0, smooth=False,
                      jitter=0.0)
    parts = shaft + band + wood
    if lean != (0.0, 0.0):
        from mathutils import Matrix
        m.transform(parts, Matrix.Translation((x, y, z)) @ Matrix.Rotation(lean[0], 4, "X") @ Matrix.Rotation(lean[1], 4, "Y")
                    @ Matrix.Translation((-x, -y, -z)))
    return parts


def clay(m, r=0.075, color=srgb("#b5603e")):
    """A blob of modelling clay, pressed down by a thumb."""
    b = m.ball((0, 0, 0.0), r, color, CARD, 2, 0.18, smooth=True)
    m.squash(b, (0, 0, 0), 0.5, 0.12)
    for v in m._verts(b):
        d = Vector((v.co.x - r * 0.3, v.co.y + r * 0.2, 0)).length
        if d < r * 0.45 and v.co.z > 0.0:
            v.co.z -= (r * 0.45 - d) * 0.35            # the thumbprint
    return b


def tissue_ball(m, c, r, color, seed_off=0, corners=3):
    """A scrunched sheet of tissue: soft lumps cut by sharp folds, a lumpy silhouette with
    a few corners of the sheet poking out; the ridges catch the light (paler), the valleys
    between them sit in shadow (darker), the way thin paper does."""
    b = m.ball(c, r, color, PAPER, 3, 0.1, smooth=True)
    cc = Vector(c)
    m.crumple(b, r * 0.3, 1.5 / r + seed_off * 0.13)
    m.crumple(b, r * 0.1, 4.5 / r)
    verts = m._verts(b)
    for k in range(corners):
        tip = m.rng.choice(verts)
        d0 = (tip.co - cc)
        if d0.length < 1e-4:
            continue
        dirn = d0.normalized()
        if dirn.z < -0.4:
            continue
        pull = r * m.rng.uniform(0.35, 0.6)
        for v in verts:
            dd = (v.co - tip.co).length
            if dd < r * 0.45:
                v.co += dirn * pull * (1.0 - dd / (r * 0.45)) ** 2
    m.bm.normal_update()
    # How far each corner stands out from its neighbours: ridges > 0, valleys < 0.
    relief = {}
    for v in verts:
        nb = [e.other_vert(v) for e in v.link_edges]
        if not nb:
            relief[v] = 0.0
            continue
        avg = sum((u.co for u in nb), Vector((0, 0, 0))) / len(nb)
        relief[v] = (v.co - avg).dot(v.normal) / (r * 0.06)
    off = Vector((m.seed * 0.7 + seed_off, 3.1, 1.7))
    for f in b:
        for l in f.loops:
            v = l.vert
            rel = max(-1.0, min(1.0, relief.get(v, 0.0)))
            tone = 0.9 + 0.12 * noise.noise(v.co * (6.0 / r) + off)
            k = tone + rel * 0.2 + 0.06 * max(0.0, v.normal.z)
            l[m.col] = (min(1.0, color[0] * k), min(1.0, color[1] * k), min(1.0, color[2] * k), PAPER)
    return b


def tree_tissue(seed=51):
    m = Model("tree_tissue", seed)
    clay(m)
    pencil(m, (0, 0, 0.02), 0.2, srgb("#f0c440"))
    tissue_ball(m, (0, 0, 0.4), 0.16, TISSUE, 0, 4)
    tissue_ball(m, (0.08, -0.06, 0.33), 0.1, TISSUE_LIGHT, 3, 2)
    tissue_ball(m, (-0.08, 0.05, 0.36), 0.09, TISSUE_DARK, 5, 2)
    return m.build()


def tree_tuft(seed=52):
    """Three scrunches of tissue on a red pencil, one olive."""
    m = Model("tree_tuft", seed)
    clay(m, 0.07, srgb("#4f7a8c"))
    pencil(m, (0, 0, 0.02), 0.17, srgb("#c8402f"), lean=(0.05, -0.04))
    for k, (x, y, z, r, col) in enumerate([(0, 0, 0.33, 0.12, TISSUE_DARK), (0.09, 0.03, 0.42, 0.095, TISSUE),
                                           (-0.06, 0.05, 0.46, 0.085, TISSUE_OLIVE)]):
        tissue_ball(m, (x, y, z), r, col, k * 2, 2)
    return m.build()


def tree_cone(seed=53):
    """Tissue twisted round a blue pencil into a fir: one spiral of paper, ragged at the hem."""
    m = Model("tree_cone", seed)
    clay(m, 0.065, srgb("#6b8a3e"))
    pencil(m, (0, 0, 0.02), 0.12, srgb("#3d6fb8"))
    z0, hh, r = 0.13, 0.46, 0.19
    c = m.cylinder((0, 0, z0), r, hh, TISSUE_DARK, 30, PAPER, caps=True, radius_top=0.01, cuts=10, smooth=False, jitter=0.0)
    for v in m._verts(c):
        t = (v.co.z - z0) / hh
        a = math.atan2(v.co.y, v.co.x)
        k = 1.0 + 0.2 * math.sin(a * 3.0 + t * 11.0) * (1.0 - t * 0.6)   # the twist: three spiralling folds
        if t < 0.05:
            k *= 1.0 + 0.12 * math.sin(a * 9.0 + m.seed)                 # a ragged hem
            v.co.z += 0.02 * math.sin(a * 5.0)
        v.co.x *= k
        v.co.y *= k
    m.crumple(c, 0.018, 16.0)
    cen = Vector((0, 0, z0))

    def fn(p, n):
        a = math.atan2(p.y, p.x)
        t = (p.z - z0) / hh
        ridge = 0.5 + 0.5 * math.sin(a * 3.0 + t * 11.0)
        base = [TISSUE_DARK[i] * (1 - ridge * 0.5) + TISSUE[i] * ridge * 0.5 for i in range(3)]
        return [min(1.0, base[i] * (0.88 + 0.28 * ridge + 0.1 * max(0.0, n.z))) for i in range(3)]
    m.paint_by(c, fn, PAPER)
    return m.build()


def tree_blossom(seed=54):
    """Pink tissue on a green pencil: someone ran out of green."""
    m = Model("tree_blossom", seed)
    clay(m, 0.07, srgb("#e0c46a"))
    pencil(m, (0, 0, 0.02), 0.18, srgb("#4f8a3c"), lean=(-0.04, 0.06))
    tissue_ball(m, (0, 0, 0.38), 0.15, srgb("#d993a6"), 1, 4)
    tissue_ball(m, (-0.08, 0.04, 0.32), 0.09, srgb("#ebb6c4"), 5, 2)
    return m.build()


HOUSES = [house_cereal, house_cartons, house_tissue, house_insideout, house_shoebox, house_stack]
TREES = [tree_tissue, tree_tuft, tree_cone, tree_blossom]
