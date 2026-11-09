"""Downtown: office blocks made from shipping boxes, printed in one or two colours
by whoever sold what came in them (made-up brands, stencilled handling marks,
this-way-up arrows, barcode labels, the box maker's round certificate), with
windows drawn on in marker over the top: rows that wander, windows skipped.

Lots are 3x3 cells (about 1.35 m) or 4x3 for the wide one. Front = -Y.
"""
import math

from kit import (CARD, CREAM, INK, INSIDE, KRAFT, KRAFT_DARK, KRAFT_EDGE, KRAFT_PALE, PAPER, SHINY, STEEL, TAPE_COL,
                 WHITE_BOARD, Model, srgb)
from mathutils import Vector

FRONT = (0, -1, 0)
BACK = (0, 1, 0)
LEFT = (-1, 0, 0)
RIGHT = (1, 0, 0)
UP = (0, 0, 1)
SIDES = (FRONT, RIGHT, BACK, LEFT)
GROUND = 0.36
FLOOR = 0.29

BOARD_A = srgb("#c39462")
BOARD_B = srgb("#b4844f")
BOARD_C = srgb("#a8794a")
BOARD_D = srgb("#cfa877")
BOARD_WHITE = srgb("#e4dfd0")


def face_pos(face, w, d, along, z, off=(0.0, 0.0)):
    """A point on a box face: `along` runs left-to-right as you look at the face."""
    nx, ny, _ = face
    if ny != 0:
        return (off[0] + along * (-ny), off[1] + ny * d / 2, z)
    return (off[0] + nx * w / 2, off[1] + along * nx, z)


def span_of(face, w, d):
    return w if face[1] != 0 else d


def windows(m, w, d, z0, z1, sides=SIDES, skip=(), off=(0.0, 0.0)):
    """Floors of hand-drawn windows, a different row on every floor and face."""
    k = 0
    z = z0
    while z + FLOOR <= z1 + 0.01:
        for face in sides:
            if (face, int((z - z0) / FLOOR)) in skip:
                continue
            span = span_of(face, w, d)
            name = "off_g%d" % (1 + (k * 7 + SIDES.index(face) * 3 + m.seed) % 6)
            m.decal(name, face_pos(face, w, d, m.rng.uniform(-0.02, 0.02), z + FLOOR / 2, off), face,
                    span * m.rng.uniform(0.78, 0.88), FLOOR * 0.8)
        z += FLOOR
        k += 1


def shopfront(m, w, d, sign, door="door_shop", x=0.0, awning=CREAM):
    m.decal(door, (x - w * 0.2, -d / 2, 0.15), FRONT, 0.26)
    m.decal("win_sky", (x + w * 0.18, -d / 2, 0.16), FRONT, 0.26, 0.22)
    m.flap((x, -d / 2, GROUND - 0.02), (1, 0, 0), (0, -1, 0), -28, w * 0.8, 0.16, awning, 0.006, under=KRAFT_DARK)
    m.decal("awning", (x, -d / 2 - 0.07, GROUND - 0.055), (0, -0.47, 0.88), w * 0.78, 0.14, lift=0.006)
    if sign:
        m.decal(sign, (x, -d / 2, GROUND + 0.05), FRONT, w * 0.42)


def h_tape(m, w, d, h, off=(0.0, 0.0), width=0.075):
    """Packing tape down the seam across the top and down both ends."""
    ox, oy = off
    m.tape((ox - w / 2 - 0.004, oy, h - 0.17), (ox - w / 2 - 0.004, oy, h + 0.003), LEFT, width)
    m.tape((ox - w / 2, oy, h + 0.003), (ox + w / 2, oy, h + 0.003), UP, width)
    m.tape((ox + w / 2 + 0.004, oy, h + 0.003), (ox + w / 2 + 0.004, oy, h - 0.19), RIGHT, width)


def closed_top(m, w, d, h, color, off=(0.0, 0.0)):
    """The two long flaps meeting along the middle: a seam and a slight hump."""
    ox, oy = off
    for s in (-1, 1):
        m.box((ox, oy + s * d / 4, h + 0.004), (w - 0.01, d / 2 - 0.006, 0.008), color, cuts=(2, 1, 0), bevel=0.002,
              jitter=0.002, rot=(s * 0.02, 0, 0))


def open_flaps(m, w, d, h, color, angles, off=(0.0, 0.0)):
    ox, oy = off
    m.box((ox, oy, h - 0.004), (w - 0.03, d - 0.03, 0.006), INSIDE, bevel=0.0, cuts=(0, 0, 0), jitter=0.0)
    m.flap((ox, oy - d / 2, h), (1, 0, 0), (0, -1, 0), angles[0], w * 0.98, d * 0.48, color, under=KRAFT_PALE)
    m.flap((ox, oy + d / 2, h), (1, 0, 0), (0, 1, 0), angles[1], w * 0.98, d * 0.48, color, under=KRAFT_PALE)
    m.flap((ox - w / 2, oy, h), (0, 1, 0), (-1, 0, 0), angles[2], d * 0.96, w * 0.46, color, under=KRAFT_PALE)
    m.flap((ox + w / 2, oy, h), (0, 1, 0), (1, 0, 0), angles[3], d * 0.96, w * 0.46, color, under=KRAFT_PALE)


def marks(m, w, d, h, brand_faces, brand, z_brand, stencils=(), label_face=RIGHT, cert_face=BACK, off=(0.0, 0.0)):
    """The printing that came with the box."""
    for face in brand_faces:
        m.decal(brand, face_pos(face, w, d, 0.0, z_brand, off), face, span_of(face, w, d) * 0.74, lift=0.009)
    for face, name, along, z, width in stencils:
        m.decal(name, face_pos(face, w, d, along, z, off), face, width, lift=0.009)
    if label_face:
        m.decal("ship_label", face_pos(label_face, w, d, span_of(label_face, w, d) * 0.28, GROUND * 0.62, off), label_face,
                0.22, lift=0.009)
    if cert_face:
        m.decal("cert", face_pos(cert_face, w, d, -span_of(cert_face, w, d) * 0.34, 0.16, off), cert_face, 0.2, lift=0.009)


# =====================================================================================
def ship_kestrel(seed=11):
    """A lamp box, taped shut. The brand runs round the middle; windows above and below."""
    m = Model("ship_kestrel", seed)
    w, d, h = 1.3, 1.28, 2.04
    m.box((0, 0, h / 2), (w, d, h), BOARD_A, cuts=(4, 4, 8), bevel=0.016, sag=0.01)
    closed_top(m, w, d, h, BOARD_A)
    zb = GROUND + FLOOR * 2.5
    windows(m, w, d, GROUND, h - 0.05, skip=[(f, 2) for f in (FRONT, RIGHT)])
    marks(m, w, d, h, (FRONT, RIGHT), "brand_kestrel", zb,
          [(BACK, "st_handle", 0.0, h - 0.13, 0.9), (LEFT, "st_thisside", 0.0, h - 0.12, 0.8),
           (FRONT, "arrows_up", 0.5, h - 0.15, 0.16), (LEFT, "ic_umbrella", -0.48, GROUND * 0.55, 0.12)])
    shopfront(m, w, d, "lbl_bakery")
    h_tape(m, w, d, h)
    return m.build()


def ship_stack(seed=12):
    """A big freight box with a kitchen-goods box sat on top, a little skew."""
    m = Model("ship_stack", seed)
    w, d, h1 = 1.32, 1.3, 1.24
    m.box((0, 0, h1 / 2), (w, d, h1), BOARD_B, cuts=(4, 4, 5), bevel=0.016)
    closed_top(m, w, d, h1, BOARD_B)
    windows(m, w, d, GROUND, h1 - 0.03, skip=[(FRONT, 1)])
    marks(m, w, d, h1, (FRONT,), "brand_parcelo", GROUND + FLOOR * 1.5,
          [(RIGHT, "st_fragile", 0.0, h1 - 0.12, 0.6), (BACK, "st_lot", 0.3, 0.14, 0.42)], label_face=LEFT)
    shopfront(m, w, d, "lbl_toys", awning=srgb("#f0d9a8"))
    h_tape(m, w, d, h1)
    w2, d2, h2 = 1.0, 0.92, 0.78
    a = 0.1
    m.box((0.06, 0.05, h1 + h2 / 2), (w2, d2, h2), BOARD_D, cuts=(3, 3, 3), bevel=0.014, rot=(0, 0, a))
    ca, sa = math.cos(a), math.sin(a)
    n_front = (sa, -ca, 0)
    fc = (0.06 + sa * d2 / 2 + 0.0, 0.05 - ca * d2 / 2, 0)
    for k in range(2):
        z = h1 + 0.06 + (k + 0.5) * FLOOR
        m.decal("off_g%d" % (k + 3), (fc[0], fc[1], z), n_front, w2 * 0.8, FLOOR * 0.8, lift=0.01)
    m.decal("brand_tinworks", (0.06 + ca * w2 / 2, 0.05 + sa * w2 / 2, h1 + h2 * 0.55), (ca, sa, 0), d2 * 0.8, lift=0.01)
    m.tape((0.06 - ca * w2 / 2, 0.05 - sa * w2 / 2, h1 + h2 + 0.003), (0.06 + ca * w2 / 2, 0.05 + sa * w2 / 2,
                                                                        h1 + h2 + 0.003), UP, 0.07)
    return m.build()


def ship_open(seed=13):
    """A kettle box opened at the top: the flaps stand up at all angles."""
    m = Model("ship_open", seed)
    w, d, h = 1.3, 1.3, 1.82
    m.box((0, 0, h / 2), (w, d, h), BOARD_C, cuts=(4, 4, 7), bevel=0.016, sag=0.012)
    open_flaps(m, w, d, h, BOARD_C, (104, 132, 96, 148))
    windows(m, w, d, GROUND, h - 0.05, skip=[(LEFT, 3), (FRONT, 3)])
    marks(m, w, d, h, (LEFT, FRONT), "brand_mossy", GROUND + FLOOR * 3.5,
          [(RIGHT, "st_keepdry", 0.0, h - 0.12, 0.6), (RIGHT, "ic_umbrella", 0.45, GROUND * 0.55, 0.12),
           (BACK, "barcode", 0.35, h - 0.14, 0.3)])
    shopfront(m, w, d, "lbl_cafe", "door_blue")
    m.tape((w / 2 - 0.25, -d / 2 - 0.004, h + 0.02), (w / 2 - 0.22, -d / 2 - 0.004, h - 0.32), FRONT, 0.07)
    return m.build()


def ship_tall(seed=14):
    """A tall fan box, white-coated board, with a paper cup water tank on the roof."""
    m = Model("ship_tall", seed)
    w, d, h = 1.26, 1.26, 2.56
    m.box((0, 0, h / 2), (w, d, h), BOARD_WHITE, cuts=(4, 4, 9), bevel=0.016)
    closed_top(m, w, d, h, BOARD_WHITE)
    windows(m, w, d, GROUND, h - 0.05, skip=[(FRONT, 5), (BACK, 5)])
    marks(m, w, d, h, (FRONT, BACK), "brand_bluefin", GROUND + FLOOR * 5.5,
          [(RIGHT, "st_fragile", 0.0, h - 0.13, 0.62), (LEFT, "st_box3", 0.0, 0.16, 0.5), (LEFT, "ic_nostack", 0.42, h - 0.18, 0.13)])
    shopfront(m, w, d, "lbl_hotel", "door_blue", awning=srgb("#d5e3ea"))
    h_tape(m, w, d, h)
    m.cylinder((0.28, 0.24, h + 0.12), 0.13, 0.24, CREAM, 14, PAPER, radius_top=0.16)
    m.cylinder((0.28, 0.24, h + 0.36), 0.165, 0.012, srgb("#d04a3a"), 14, PAPER, cuts=0)
    for k in range(3):
        a = k * 2.094
        m.cylinder((0.28 + math.cos(a) * 0.1, 0.24 + math.sin(a) * 0.1, h), 0.012, 0.13, STEEL, 6, SHINY, cuts=0)
    return m.build()


def ship_wide(seed=15):
    """A long soap-flake box on its side: two shops at street level."""
    m = Model("ship_wide", seed)
    w, d, h = 1.82, 1.28, 1.9
    m.box((0, 0, h / 2), (w, d, h), BOARD_A, cuts=(6, 4, 7), bevel=0.016, sag=0.012)
    open_flaps(m, w, d, h, BOARD_A, (98, 101, 118, 128))
    windows(m, w, d, GROUND, h - 0.05, skip=[(FRONT, 2), (BACK, 2)])
    marks(m, w, d, h, (FRONT, BACK), "brand_no9", GROUND + FLOOR * 2.5,
          [(LEFT, "st_size", 0.0, h - 0.12, 0.6), (RIGHT, "st_thisside", 0.0, h - 0.12, 0.7)])
    shopfront(m, w, d, "lbl_bank", "door_shop", -0.45)
    shopfront(m, w, d, "lbl_books", "door_red", 0.45, srgb("#e9c7a0"))
    m.tape((-w / 2 - 0.004, 0.3, 0.6), (-w / 2 - 0.004, -0.25, 0.9), LEFT, 0.07)
    return m.build()


OFFICES = [ship_kestrel, ship_stack, ship_open, ship_tall, ship_wide]
