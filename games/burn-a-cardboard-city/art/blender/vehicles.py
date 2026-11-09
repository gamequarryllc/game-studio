"""Things with wheels and wings: cardboard cars (bottle-cap wheels), a milk-carton van,
a taxi, the toy fire truck that sprays water, the giant's wind-up helper car, a paper
plane, and a firework rocket.

Cars sit on 1x2-cell parking spots (0.5 x 1.0 m) facing -Y; the fire truck on 1x3.
"""
import math

from kit import (BLUE, CARD, CREAM, INK, INSIDE, KRAFT, KRAFT_DARK, KRAFT_EDGE, KRAFT_PALE, PAPER, PINK, RED,
                 SHINY, SKYBLUE, STEEL, TAPE_COL, TOMATO, WHITE_BOARD, YELLOW, Model, srgb, BRASS)

FRONT = (0, -1, 0)
BACK = (0, 1, 0)
LEFT = (-1, 0, 0)
RIGHT = (1, 0, 0)
UP = (0, 0, 1)
CAP_COLORS = [srgb("#d8463a"), srgb("#f1efe8"), srgb("#3a72c2"), srgb("#e8b534"), srgb("#4a9a52")]


def bottle_cap(m, x, y, r=0.062, w=0.032, color=None):
    """A bottle cap for a wheel: ridged rim, flat face, a pin through the middle."""
    col = color or CAP_COLORS[m.rng.randrange(len(CAP_COLORS))]
    side = 1 if x > 0 else -1
    m.cylinder((x - side * w / 2, y, r), r, w, col, 14, SHINY, rot=(0, math.pi / 2, 0), cuts=0, smooth=False, jitter=0.001)
    m.cylinder((x + side * (w / 2 + 0.002), y, r), 0.012, 0.006, srgb("#c0c4c6"), 8, SHINY, rot=(0, math.pi / 2, 0),
               cuts=0)


def car_sedan(seed=41):
    m = Model("car_sedan", seed)
    body = srgb("#3d6fb8")
    m.box((0, 0, 0.13), (0.38, 0.84, 0.14), body, cuts=(1, 3, 1), bevel=0.012)
    m.box((0, 0.06, 0.255), (0.34, 0.44, 0.12), body, cuts=(1, 2, 1), bevel=0.014, sag=0.004)
    m.decal("car_windows", (-0.19, 0.06, 0.255), LEFT, 0.42, 0.11)
    m.decal("car_windows", (0.19, 0.06, 0.255), RIGHT, 0.42, 0.11)
    m.decal("win_sky", (0, -0.16, 0.255), FRONT, 0.26, 0.09)
    m.decal("car_face", (0, -0.42, 0.13), FRONT, 0.32, 0.12)
    for x in (-0.2, 0.2):
        for y in (-0.27, 0.27):
            bottle_cap(m, x, y)
    m.tape((-0.15, 0.3, 0.32), (0.15, 0.28, 0.32), UP, 0.04)
    return m.build()


def car_van(seed=42):
    """A milk carton, turned into a delivery van."""
    m = Model("car_van", seed)
    m.box((0, 0.03, 0.2), (0.36, 0.78, 0.28), WHITE_BOARD, cuts=(1, 3, 2), bevel=0.01)
    # The carton's gable top and fin, running along the length.
    m.plate((0, 0.03, 0.42), (0, 1, 0), (1, 0, -1.1), 0.78, 0.2, WHITE_BOARD, 0.006, CARD, edge=WHITE_BOARD)
    m.plate((0, 0.03, 0.42), (0, 1, 0), (-1, 0, -1.1), 0.78, 0.2, WHITE_BOARD, 0.006, CARD, edge=WHITE_BOARD)
    m.box((0, 0.03, 0.445), (0.012, 0.78, 0.05), WHITE_BOARD, cuts=(0, 2, 0), bevel=0.0, jitter=0.001)
    m.box((-0.181, 0.03, 0.2), (0.004, 0.7, 0.07), SKYBLUE, bevel=0.0, cuts=(0, 2, 0), jitter=0.001)
    m.box((0.181, 0.03, 0.2), (0.004, 0.7, 0.07), SKYBLUE, bevel=0.0, cuts=(0, 2, 0), jitter=0.001)
    m.decal("win_sky", (0, -0.36, 0.27), FRONT, 0.26, 0.11)
    m.decal("car_face", (0, -0.36, 0.12), FRONT, 0.3, 0.11)
    m.decal("lbl_no7", (-0.183, 0.1, 0.29), LEFT, 0.2)
    m.decal("smiley", (0.183, -0.15, 0.29), RIGHT, 0.09)
    for x in (-0.19, 0.19):
        for y in (-0.25, 0.28):
            bottle_cap(m, x, y, color=CAP_COLORS[2])
    return m.build()


def car_taxi(seed=43):
    m = Model("car_taxi", seed)
    body = srgb("#efc23e")
    m.box((0, 0, 0.13), (0.38, 0.84, 0.14), body, cuts=(1, 3, 1), bevel=0.012, sag=0.003)
    m.box((0, 0.04, 0.255), (0.34, 0.42, 0.12), body, cuts=(1, 2, 1), bevel=0.014)
    m.box((0, 0.04, 0.345), (0.16, 0.08, 0.06), WHITE_BOARD, cuts=(0, 0, 0), bevel=0.006)
    m.decal("lbl_taxi", (0, 0.0, 0.345), FRONT, 0.15, lift=0.004)
    m.decal("car_windows", (-0.19, 0.04, 0.255), LEFT, 0.4, 0.11)
    m.decal("car_windows", (0.19, 0.04, 0.255), RIGHT, 0.4, 0.11)
    m.decal("car_face", (0, -0.42, 0.13), FRONT, 0.32, 0.12)
    m.box((0, 0, 0.13), (0.386, 0.1, 0.03), INK, cuts=(0, 0, 0), bevel=0.0, jitter=0.001)
    for x in (-0.2, 0.2):
        for y in (-0.27, 0.27):
            bottle_cap(m, x, y, color=CAP_COLORS[1])
    return m.build()


def fire_truck(seed=44):
    m = Model("fire_truck", seed)
    red = srgb("#d23a2c")
    m.box((0, 0.12, 0.17), (0.42, 1.05, 0.22), red, cuts=(1, 4, 1), bevel=0.014)
    m.box((0, -0.5, 0.21), (0.42, 0.34, 0.3), red, cuts=(1, 1, 1), bevel=0.016, sag=0.004)
    m.decal("win_sky", (0, -0.67, 0.28), FRONT, 0.3, 0.11)
    m.decal("car_face", (0, -0.67, 0.11), FRONT, 0.32, 0.12)
    m.decal("car_windows", (-0.21, -0.5, 0.27), LEFT, 0.3, 0.1)
    m.decal("car_windows", (0.21, -0.5, 0.27), RIGHT, 0.3, 0.1)
    m.decal("lbl_fire", (-0.212, 0.15, 0.17), LEFT, 0.6, 0.15)
    m.decal("lbl_fire", (0.212, 0.15, 0.17), RIGHT, 0.6, 0.15)
    # A paper-cup water tank and a lolly-stick ladder.
    m.cylinder((0.0, 0.42, 0.28), 0.12, 0.16, CREAM, 14, PAPER, radius_top=0.14)
    m.cylinder((0.0, 0.42, 0.44), 0.145, 0.012, srgb("#d8d0bc"), 14, PAPER, cuts=0)
    lad = srgb("#e3c792")
    for x in (-0.07, 0.07):
        m.box((x, 0.02, 0.33), (0.025, 0.78, 0.015), lad, cuts=(0, 3, 0), bevel=0.004, rot=(0.16, 0, 0), jitter=0.002)
    for k in range(6):
        y = -0.32 + k * 0.13
        m.box((0, y, 0.33 + (y - 0.02) * 0.16), (0.16, 0.02, 0.012), lad, cuts=(0, 0, 0), bevel=0.003, rot=(0.16, 0, 0))
    m.cylinder((0.12, -0.38, 0.38), 0.03, 0.04, srgb("#3a72c2"), 10, SHINY, cuts=0)  # the siren: a blue cap
    # The hose: a bendy straw from the tank.
    m.cylinder((0.13, 0.42, 0.42), 0.014, 0.28, srgb("#f2f0ea"), 8, SHINY, rot=(0.9, 0.0, 0.3), cuts=1)
    for y in (-0.5, 0.05, 0.45):
        for x in (-0.22, 0.22):
            bottle_cap(m, x, y, color=CAP_COLORS[1])
    return m.build()


def windup_car(seed=45):
    """The helper: a tin wind-up car with a sparkler taped to its back."""
    m = Model("windup_car", seed)
    tin = srgb("#2f8f8a")
    m.box((0, 0, 0.09), (0.18, 0.34, 0.09), tin, SHINY, cuts=(1, 2, 1), bevel=0.03, jitter=0.0)
    m.box((0, 0.03, 0.155), (0.15, 0.17, 0.06), srgb("#e8e2cf"), SHINY, cuts=(0, 0, 0), bevel=0.025, jitter=0.0)
    m.box((0, 0.03, 0.155), (0.155, 0.12, 0.035), SKYBLUE, SHINY, cuts=(0, 0, 0), bevel=0.012, jitter=0.0)
    m.box((0, -0.12, 0.1), (0.186, 0.06, 0.03), srgb("#e8b534"), SHINY, cuts=(0, 0, 0), bevel=0.01, jitter=0.0)
    for x in (-0.095, 0.095):
        for y in (-0.11, 0.11):
            m.cylinder((x - (0.012 if x > 0 else -0.012), y, 0.045), 0.045, 0.024, srgb("#2a2a2a"), 12, SHINY,
                       rot=(0, math.pi / 2, 0), cuts=0, jitter=0.0)
    # The key: a brass stem and two loops.
    m.cylinder((0, 0.14, 0.13), 0.008, 0.08, BRASS, 8, SHINY, cuts=0, jitter=0.0)
    m.box((0, 0.14, 0.23), (0.11, 0.012, 0.05), BRASS, SHINY, cuts=(0, 0, 0), bevel=0.02, jitter=0.0)
    # Sparkler holder taped on the back.
    m.cylinder((0, 0.17, 0.1), 0.006, 0.26, srgb("#6b6b6b"), 6, SHINY, rot=(-0.5, 0, 0), cuts=1, jitter=0.0)
    m.tape((-0.05, 0.175, 0.12), (0.05, 0.175, 0.12), BACK, 0.03)
    return m.build()


def paper_plane(seed=46):
    m = Model("paper_plane", seed)
    paper = srgb("#f4efe2")
    bm = m.bm
    m._begin()
    pts = {
        "nose": (0, -0.25, 0.02), "lw": (-0.17, 0.2, 0.05), "rw": (0.17, 0.2, 0.05),
        "lt": (-0.02, 0.22, 0.03), "rt": (0.02, 0.22, 0.03), "keel": (0, 0.22, -0.05), "kn": (0, -0.2, 0.0),
    }
    v = {k: bm.verts.new(p) for k, p in pts.items()}
    for tri in (("nose", "lw", "lt"), ("nose", "rt", "rw"), ("nose", "lt", "keel"), ("nose", "keel", "rt")):
        f = bm.faces.new([v[k] for k in tri])
    faces = m._new()
    m._paint(faces, paper, PAPER)
    m.decal("heart", (-0.08, 0.08, 0.04), UP, 0.06, up=(0, -1, 0), lift=0.004)
    return m.build()


def rocket(seed=47):
    m = Model("rocket", seed)
    m.cylinder((0, 0, 0.0), 0.006, 0.34, srgb("#d9b98a"), 6, PAPER, cuts=1, jitter=0.0)  # the stick
    m.cylinder((0, 0, 0.2), 0.03, 0.15, RED, 12, PAPER, cuts=1, jitter=0.0)
    m.box((0, 0, 0.27), (0.062, 0.062, 0.02), YELLOW, PAPER, cuts=(0, 0, 0), bevel=0.0, jitter=0.0)
    m.cone((0, 0, 0.35), 0.034, 0.08, YELLOW, 12, PAPER, seam=False, jitter=0.0)
    return m.build()


def build_vehicles():
    return [car_sedan(), car_van(), car_taxi(), fire_truck()]


def build_helpers():
    return [windup_car(), paper_plane(), rocket()]
