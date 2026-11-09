"""The fire-keeper, the tools, the helpers and the critters.

The keeper is round and warm against the spiky cold forest: a madder-red robe,
a cream scarf, a tall hood whose tip flops back, mittens, boots and a brass
lantern on the back. Parts are separate objects so the game can animate them
(scripts/keeper.gd puts them together). Tools are the real objects, held with
the grip at the origin and the business end along the game's +Z (Blender -Y).

Run:  python3 art/blender/characters.py   (writes models/keeper.glb, tools.glb, creatures.glb)
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forest_lib as L  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

ROBE = L.srgb("#9A3B2E")
ROBE_DARK = L.srgb("#6E2721")
HOOD = L.srgb("#8C3328")
CREAM = L.srgb("#EFE3C8")
SKIN = L.srgb("#E9BE94")
CHEEK = L.srgb("#D9776A")
INK = L.srgb("#2E1E14")
LEATHER = L.srgb("#6B4A35")
BOOT = L.srgb("#3E2A20")
BRASS = L.srgb("#C0913F")
BRASS_DARK = L.srgb("#7A5A2A")
GLASS = L.srgb("#FFC15E")
GLASS_CORE = L.srgb("#FFE2A0")
WOOD = L.srgb("#B58A57")
WOOD_DARK = L.srgb("#7A5636")
EMBER = L.srgb("#E8642C")
POPPY = L.srgb("#D9483B")
STEEL = L.srgb("#6D6A73")
VIOLET = L.srgb("#6E4A9A")
MINT = L.srgb("#9FF0D0")
GOLD = L.srgb("#F2C14E")

F = Vector((0, -1, 0))   # the game's forward (+Z) in Blender


# ------------------------------------------------------------------------------------
# The fire-keeper
# ------------------------------------------------------------------------------------
def keeper_body():
    m = L.Model("k_body", 31)
    prof = [(0.0, 0.08), (0.37, 0.08), (0.39, 0.15), (0.34, 0.38), (0.28, 0.6), (0.22, 0.78), (0.15, 0.88), (0.0, 0.9)]
    m.lathe(prof, 12, ROBE, L.BARK, color_fn=lambda t, k: L.mix(ROBE_DARK, ROBE, min(1.0, t * 2.5)), close_top=False, close_bottom=False)
    # a cream hem band with a stitched look (alternating shades)
    m.lathe([(0.385, 0.1), (0.395, 0.14), (0.385, 0.18)], 12, CREAM, L.BARK,
            color_fn=lambda t, k: CREAM if k % 2 else L.scale(CREAM, 0.85), close_top=False, close_bottom=False)
    # belt with a brass buckle
    m.lathe([(0.325, 0.42), (0.33, 0.45), (0.32, 0.48)], 12, LEATHER, L.BARK, close_top=False, close_bottom=False)
    m.box(Vector((0, -0.33, 0.45)), (0.09, 0.03, 0.07), BRASS, L.BARK, bevel=0.01)
    # the scarf: a soft roll round the neck and a tail down the back
    m.lathe([(0.17, 0.8), (0.24, 0.84), (0.25, 0.9), (0.19, 0.95)], 12, CREAM, L.BARK, close_top=False, close_bottom=False,
            color_fn=lambda t, k: L.mix(L.scale(CREAM, 0.8), CREAM, t))
    m.tube([Vector((0.08, 0.2, 0.86)), Vector((0.1, 0.27, 0.68)), Vector((0.13, 0.3, 0.5))], [0.06, 0.055, 0.045], 5, CREAM, L.BARK,
           squash=(1.0, 0.45))
    # a satchel on the left hip
    m.box(Vector((-0.33, 0.04, 0.38)), (0.1, 0.22, 0.18), LEATHER, L.BARK, bevel=0.03)
    m.tube([Vector((-0.3, 0.0, 0.47)), Vector((-0.05, -0.2, 0.75)), Vector((0.18, -0.12, 0.84))], [0.018, 0.018, 0.018], 4, LEATHER, L.BARK)
    m.bake(ao_dist=0.35, ao_strength=0.7)
    return m.finish()


def keeper_head():
    m = L.Model("k_head", 32)
    m.blob(Vector((0, 0, 0)), 0.24, SKIN, L.BARK, subdiv=2, rough=0.0, seed=1, squash=(1.0, 0.95, 0.95),
           color_fn=lambda d, p: L.mix(SKIN, L.scale(SKIN, 0.8), max(0.0, -d.z) * 0.6))
    for sx in (-1, 1):
        m.blob(Vector((sx * 0.085, -0.212, 0.02)), 0.032, INK, L.BARK, subdiv=1, rough=0.0, seed=2, squash=(0.8, 0.5, 1.3))
        m.blob(Vector((sx * 0.14, -0.175, -0.06)), 0.045, CHEEK, L.BARK, subdiv=1, rough=0.0, seed=3, squash=(1.0, 0.4, 0.6))
    m.blob(Vector((0, -0.235, -0.02)), 0.035, L.scale(SKIN, 0.92), L.BARK, subdiv=1, rough=0.0, seed=4)
    m.bake(ao_dist=0.2, ao_strength=0.5, ground=False)
    return m.finish()


def keeper_hood():
    """A tall hood round the head (origin = the head's centre): it rises into a
    long point that flops back and to one side, with a cream lining at the face."""
    m = L.Model("k_hood", 33)
    spine = [Vector((0, 0.03, 0.0)), Vector((0, 0.1, 0.24)), Vector((0, 0.17, 0.48)), Vector((0.03, 0.26, 0.7)),
             Vector((0.1, 0.4, 0.8)), Vector((0.2, 0.52, 0.74))]
    radii = [0.315, 0.27, 0.18, 0.1, 0.05, 0.0]
    m.tube(spine, radii, 12, HOOD, L.BARK, cap_top=False,
           color_fn=lambda t, k: L.mix(HOOD, L.srgb("#B04A38"), 0.35 * t), hi_fn=lambda t, k: t * 0.5)
    # lining: a cream band just inside the face opening
    d = (spine[1] - spine[0]).normalized()
    x = Vector((1, 0, 0))
    y = d.cross(x).normalized()
    ring_o, ring_i = [], []
    for k in range(12):
        a = 2 * math.pi * k / 12
        off = x * math.cos(a) + y * math.sin(a)
        ring_o.append(m.vert(spine[0] + off * 0.316, CREAM, L.BARK))
        ring_i.append(m.vert(spine[0] + off * 0.27 + d * 0.03, L.scale(CREAM, 0.8), L.BARK))
    for k in range(12):
        k2 = (k + 1) % 12
        m.face([ring_o[k2], ring_o[k], ring_i[k], ring_i[k2]])
    # the drape over the back of the neck and shoulders
    rows = []
    for z, r in ((-0.02, 0.315), (-0.16, 0.32), (-0.3, 0.36)):
        row = []
        for k in range(8):
            a = math.radians(200 + 140 * k / 7)
            p = Vector((math.cos(a) * r, -math.sin(a) * r * -1.0, z))
            p.y = abs(p.y) + 0.02
            row.append(m.vert(p, HOOD, L.BARK))
        rows.append(row)
    for i in range(2):
        for k in range(7):
            m.face([rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]])
            m.face([rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1], rows[i][k]])
    # a little tassel at the tip
    m.blob(spine[-1] + Vector((0.02, 0.02, -0.05)), 0.055, CREAM, L.BARK, subdiv=1, rough=0.15, seed=7)
    m.bake(ao_dist=0.25, ao_strength=0.5, ground=False)
    return m.finish()


def keeper_hand():
    m = L.Model("k_hand", 34)
    m.blob(Vector((0, 0, 0)), 0.085, LEATHER, L.BARK, subdiv=1, rough=0.05, seed=1, squash=(1.0, 1.1, 0.9))
    m.blob(Vector((0.06, -0.04, 0.03)), 0.035, LEATHER, L.BARK, subdiv=1, rough=0.0, seed=2)
    m.lathe([(0.075, 0.05), (0.08, 0.1), (0.07, 0.13)], 8, CREAM, L.BARK, center=(0, 0.03, -0.0), close_top=False, close_bottom=False)
    m.bake(ao_dist=0.1, ao_strength=0.4, ground=False)
    return m.finish()


def keeper_foot():
    m = L.Model("k_foot", 35)
    m.blob(Vector((0, -0.04, 0.06)), 0.11, BOOT, L.BARK, subdiv=1, rough=0.05, seed=1, squash=(0.9, 1.4, 0.65))
    m.lathe([(0.07, 0.06), (0.075, 0.16), (0.065, 0.18)], 8, BOOT, L.BARK, center=(0, 0.02, 0), close_top=True, close_bottom=False)
    m.bake(ao_dist=0.15, ao_strength=0.5)
    return m.finish()


def keeper_lantern():
    m = L.Model("k_lantern", 36)
    m.lathe([(0.0, 0.17), (0.07, 0.14), (0.1, 0.11), (0.03, 0.11)], 6, BRASS, L.BARK, close_bottom=False)
    m.lathe([(0.075, -0.09), (0.085, 0.0), (0.075, 0.11)], 6, GLASS, L.GLOW, close_top=False, close_bottom=False,
            color_fn=lambda t, k: L.mix(GLASS, GLASS_CORE, 1.0 - abs(t - 0.5) * 2))
    m.lathe([(0.11, -0.13), (0.1, -0.09), (0.0, -0.09)], 6, BRASS_DARK, L.BARK, close_top=False)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.3
        m.box(Vector((math.cos(a) * 0.088, math.sin(a) * 0.088, 0.01)), (0.018, 0.018, 0.21), BRASS_DARK, L.BARK)
    m.tube([Vector((-0.06, 0, 0.17)), Vector((0, 0, 0.26)), Vector((0.06, 0, 0.17))], [0.01, 0.01, 0.01], 4, BRASS_DARK, L.BARK)
    m.bake(ao_dist=0.1, ao_strength=0.4, ground=False)
    return m.finish()


# ------------------------------------------------------------------------------------
# Tools (grip at the origin, flame end toward -Y)
# ------------------------------------------------------------------------------------
def along(m, verts):
    """Built pointing +Z (up), turned to point -Y (the game's +Z)."""
    m.transform(verts, Matrix.Rotation(math.radians(90), 4, 'X'))


def tool_match(sparkler=False):
    m = L.Model("tool_0s" if sparkler else "tool_0", 41)
    start = len(m.bm.verts)
    if sparkler:
        cols = [L.srgb("#D9483B"), L.srgb("#F2C14E"), L.srgb("#6FB3D9"), L.srgb("#8FAE5E")]
        for k in range(4):
            m.box(Vector((0, 0, 0.06 + k * 0.1)), (0.045, 0.045, 0.1), cols[k], L.BARK, bevel=0.005)
        m.blob(Vector((0, 0, 0.46)), 0.05, CREAM, L.GLOW, subdiv=1, rough=0.1, seed=1)
    else:
        m.box(Vector((0, 0, 0.21)), (0.045, 0.045, 0.42), L.srgb("#E6CF9C"), L.BARK, bevel=0.006)
        m.blob(Vector((0, 0, 0.44)), 0.05, POPPY, L.BARK, subdiv=1, rough=0.08, seed=2, squash=(1, 1, 1.35))
    along(m, list(m.bm.verts)[start:])
    m.bake(ao_dist=0.05, ao_strength=0.3, ground=False)
    return m.finish()


def tool_lighter():
    m = L.Model("tool_1", 42)
    m.box(Vector((0, 0, 0.06)), (0.1, 0.06, 0.15), BRASS, L.BARK, bevel=0.012)
    m.box(Vector((0, 0, 0.0)), (0.104, 0.064, 0.02), BRASS_DARK, L.BARK, bevel=0.004)
    # the flip lid, thrown open
    m.box(Vector((0.05, 0, 0.17)), (0.1, 0.06, 0.06), BRASS, L.BARK, bevel=0.01, rot=Matrix.Rotation(-1.9, 3, 'Y'))
    m.lathe([(0.02, 0.135), (0.02, 0.175)], 8, STEEL, L.BARK, center=(-0.015, 0, 0))
    m.lathe([(0.012, 0.15), (0.0, 0.15)], 6, STEEL, L.BARK, center=(0.02, 0, 0.0))
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.05, ao_strength=0.3, ground=False)
    return m.finish()


def tool_tiki():
    m = L.Model("tool_2", 43)
    m.tube([Vector((0, 0, -0.1)), Vector((0, 0, 0.8))], [0.032, 0.03], 6, WOOD, L.BARK,
           color_fn=lambda t, k: L.mix(WOOD, WOOD_DARK, 0.2 * (k % 2)))
    for z in (0.12, 0.38, 0.62):
        m.lathe([(0.03, z - 0.012), (0.04, z), (0.03, z + 0.012)], 6, WOOD_DARK, L.BARK, close_top=False, close_bottom=False)
    # the woven basket head with a wrap of oily cloth
    m.lathe([(0.03, 0.74), (0.09, 0.8), (0.115, 0.9), (0.1, 0.96), (0.06, 0.97)], 8, L.srgb("#8C6A3C"), L.BARK,
            color_fn=lambda t, k: L.mix(L.srgb("#8C6A3C"), L.srgb("#5E4426"), 0.4 * ((k + int(t * 5)) % 2)))
    m.lathe([(0.105, 0.82), (0.12, 0.86), (0.105, 0.9)], 8, L.srgb("#3A2A22"), L.BARK, close_top=False, close_bottom=False)
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.1, ao_strength=0.4, ground=False)
    return m.finish()


def tool_flamer():
    m = L.Model("tool_3", 44)
    # a brass tank held at the hip, a hose, a long nozzle
    m.lathe([(0.0, -0.05), (0.07, -0.04), (0.085, 0.0), (0.085, 0.3), (0.07, 0.34), (0.0, 0.35)], 10, BRASS, L.BARK,
            color_fn=lambda t, k: L.mix(BRASS_DARK, BRASS, 0.5 + 0.5 * math.cos(k * 0.6)), center=(0, 0.0, 0))
    for z in (0.06, 0.24):
        m.lathe([(0.088, z - 0.015), (0.092, z), (0.088, z + 0.015)], 10, BRASS_DARK, L.BARK, close_top=False, close_bottom=False)
    m.tube([Vector((0, 0.0, 0.3)), Vector((0, -0.06, 0.44)), Vector((0, -0.06, 0.7))], [0.03, 0.026, 0.024], 6, STEEL, L.BARK)
    m.lathe([(0.024, 0.66), (0.038, 0.7), (0.034, 0.72)], 8, BRASS_DARK, L.BARK, center=(0, -0.06, 0), close_bottom=False)
    m.box(Vector((0, 0.07, 0.14)), (0.03, 0.06, 0.1), L.srgb("#3A2A22"), L.BARK, bevel=0.01)
    m.blob(Vector((0, -0.09, 0.2)), 0.035, POPPY, L.BARK, subdiv=1, rough=0.0, seed=1)
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.1, ao_strength=0.4, ground=False)
    return m.finish()


def tool_dragon():
    m = L.Model("tool_4", 45)
    m.blob(Vector((0, 0, 0.14)), 0.15, VIOLET, L.BARK, subdiv=2, rough=0.08, seed=1, squash=(1.0, 0.9, 1.6),
           color_fn=lambda d, p: L.mix(VIOLET, L.srgb("#9A7AC8"), max(0.0, -d.y) * 0.5))
    m.blob(Vector((0, 0.05, 0.36)), 0.07, VIOLET, L.BARK, subdiv=1, rough=0.0, seed=2, squash=(1.2, 0.6, 1.0))
    for sx in (-1, 1):
        m.blob(Vector((sx * 0.08, 0.09, 0.24)), 0.035, GOLD, L.GLOW, subdiv=1, rough=0.0, seed=3)
        m.blob(Vector((sx * 0.08, 0.11, 0.245)), 0.014, INK, L.BARK, subdiv=1, rough=0.0, seed=4)
        m.tube([Vector((sx * 0.07, 0.07, 0.18)), Vector((sx * 0.12, 0.13, 0.12)), Vector((sx * 0.13, 0.2, 0.02))], [0.025, 0.015, 0.0], 5,
               CREAM, L.BARK, cap_top=False)
    for k in range(4):
        m.tube([Vector((0, 0.13, 0.3 - k * 0.08)), Vector((0, 0.19, 0.27 - k * 0.08))], [0.025, 0.0], 4, L.srgb("#4A3070"), L.BARK, cap_top=False)
    m.lathe([(0.13, -0.05), (0.14, 0.03)], 10, L.srgb("#4A3070"), L.BARK, close_top=False, close_bottom=False)
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.1, ao_strength=0.4, ground=False)
    return m.finish()


def tool_meteor():
    m = L.Model("tool_5", 46)
    m.tube([Vector((0, 0, -0.1)), Vector((0.02, 0, 0.45)), Vector((0, 0, 0.88))], [0.028, 0.026, 0.022], 6, L.srgb("#3D2B55"), L.BARK)
    m.lathe([(0.03, 0.84), (0.05, 0.88), (0.03, 0.92)], 6, GOLD, L.BARK, close_top=False, close_bottom=False)
    # a five-pointed star facing along the staff (so the keeper's view sees it
    # face-on), and a second one crossed through it so it reads from the side too
    for plane in (0, 1):
        for face in (-1, 1):
            pts = []
            for k in range(10):
                a = math.pi * 0.5 + math.pi * k / 5
                r = 0.13 if k % 2 == 0 else 0.055
                if plane == 0:
                    pts.append(Vector((math.cos(a) * r, math.sin(a) * r, 1.0 + face * 0.025)))
                else:
                    pts.append(Vector((math.cos(a) * r, face * 0.025, 1.0 + math.sin(a) * r)))
            c = Vector((0, 0, 1.0 + face * 0.045)) if plane == 0 else Vector((0, face * 0.045, 1.0))
            m.fan(c, pts if face > 0 else list(reversed(pts)), GLASS_CORE, GOLD, L.GLOW)
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.1, ao_strength=0.3, ground=False)
    return m.finish()


# ------------------------------------------------------------------------------------
# Helpers and critters (all face -Y)
# ------------------------------------------------------------------------------------
def sprite():
    """A fire sprite: a round flame spirit with a curl on top and a face."""
    m = L.Model("sprite", 51)
    spine = [Vector((0, 0, -0.18)), Vector((0, 0, 0.0)), Vector((0, 0.02, 0.14)), Vector((0.04, 0.05, 0.27)), Vector((0.1, 0.07, 0.33))]
    m.tube(spine, [0.0, 0.2, 0.15, 0.07, 0.0], 10, EMBER, L.GLOW, cap_top=False,
           color_fn=lambda t, k: L.mix(GLASS_CORE, EMBER, min(1.0, t * 1.4)))
    for sx in (-1, 1):
        m.blob(Vector((sx * 0.065, -0.185, 0.02)), 0.03, INK, L.BARK, subdiv=1, rough=0.0, seed=2, squash=(0.8, 0.5, 1.3))
        m.tube([Vector((sx * 0.17, 0, -0.03)), Vector((sx * 0.26, -0.03, 0.03))], [0.035, 0.02], 5, EMBER, L.GLOW)
    m.blob(Vector((0, -0.19, -0.06)), 0.03, POPPY, L.BARK, subdiv=1, rough=0.0, seed=3, squash=(1.3, 0.5, 0.6))
    m.bake(ao_dist=0.1, ao_strength=0.3, ground=False)
    return m.finish()


def salamander():
    m = L.Model("salamander", 52)
    spine = [Vector((0, 0.62, 0.08)), Vector((0.07, 0.45, 0.1)), Vector((0.0, 0.25, 0.14)), Vector((-0.04, 0.0, 0.16)),
             Vector((0.0, -0.22, 0.17)), Vector((0.0, -0.36, 0.18))]
    radii = [0.0, 0.045, 0.085, 0.11, 0.1, 0.0]

    def col(t, k):
        belly = k in (5, 6, 7)
        base = L.srgb("#F2C09A") if belly else EMBER
        if not belly and (k + int(t * 9)) % 4 == 0 and 0.2 < t < 0.8:
            base = L.srgb("#3A1E16")     # dark spots
        return base
    m.tube(spine, radii, 10, EMBER, L.BARK, cap_top=False, squash=(1.2, 0.8), color_fn=col)
    m.blob(Vector((0, -0.4, 0.18)), 0.1, EMBER, L.BARK, subdiv=2, rough=0.0, seed=1, squash=(1.0, 1.3, 0.75))
    for sx in (-1, 1):
        m.blob(Vector((sx * 0.065, -0.45, 0.24)), 0.035, GOLD, L.GLOW, subdiv=1, rough=0.0, seed=2)
        m.blob(Vector((sx * 0.075, -0.475, 0.245)), 0.015, INK, L.BARK, subdiv=1, rough=0.0, seed=3)
    # a ridge of ember flames along the back
    for k in range(5):
        p = L.point_on(spine, 0.25 + 0.12 * k) + Vector((0, 0, 0.09))
        m.tube([p, p + Vector((0, 0.04, 0.09))], [0.035, 0.0], 5, GLASS, L.GLOW, cap_top=False)
    m.bake(ao_dist=0.15, ao_strength=0.5)
    ob = m.finish()
    leg = L.Model("salamander_leg", 53)
    leg.tube([Vector((0, 0, 0)), Vector((0.08, -0.02, -0.02)), Vector((0.12, -0.03, -0.1))], [0.035, 0.03, 0.025], 5, EMBER, L.BARK)
    for k in range(3):
        a = -0.6 + k * 0.6
        leg.tube([Vector((0.12, -0.03, -0.1)), Vector((0.12 + math.cos(a) * 0.05, -0.03 - math.sin(a) * 0.05, -0.11))], [0.012, 0.006], 4,
                 EMBER, L.BARK)
    leg.bake(ao_dist=0.05, ao_strength=0.3, ground=False)
    return [ob, leg.finish()]


def rabbit():
    m = L.Model("rabbit", 54)
    fur = L.srgb("#B9A894")
    m.blob(Vector((0, 0.04, 0.17)), 0.16, fur, L.BARK, subdiv=2, rough=0.05, seed=1, squash=(0.9, 1.25, 1.0))
    m.blob(Vector((0, -0.15, 0.3)), 0.11, fur, L.BARK, subdiv=2, rough=0.03, seed=2)
    for sx in (-1, 1):
        m.tube([Vector((sx * 0.04, -0.12, 0.38)), Vector((sx * 0.07, -0.08, 0.52)), Vector((sx * 0.09, -0.02, 0.6))], [0.035, 0.04, 0.0], 6,
               fur, L.BARK, squash=(1.0, 0.45), cap_top=False, color_fn=lambda t, k: L.mix(fur, L.srgb("#E2A9A0"), 0.4 if k in (2, 3) else 0.0))
        m.blob(Vector((sx * 0.055, -0.24, 0.33)), 0.02, INK, L.BARK, subdiv=1, rough=0.0, seed=3)
    m.blob(Vector((0, 0.22, 0.2)), 0.06, CREAM, L.BARK, subdiv=1, rough=0.1, seed=4)
    m.bake(ao_dist=0.15, ao_strength=0.6)
    return m.finish()


def fox():
    m = L.Model("fox", 55)
    rust = L.srgb("#C8642E")
    m.tube([Vector((0, 0.22, 0.2)), Vector((0, 0.0, 0.22)), Vector((0, -0.2, 0.24))], [0.09, 0.12, 0.1], 8, rust, L.BARK, squash=(0.9, 1.0),
           color_fn=lambda t, k: CREAM if k in (5, 6, 7) else rust)
    m.blob(Vector((0, -0.28, 0.3)), 0.1, rust, L.BARK, subdiv=2, rough=0.0, seed=1, squash=(1.0, 1.1, 0.9))
    m.tube([Vector((0, -0.34, 0.28)), Vector((0, -0.46, 0.26))], [0.05, 0.0], 6, CREAM, L.BARK, cap_top=False)
    m.blob(Vector((0, -0.46, 0.265)), 0.018, INK, L.BARK, subdiv=1, rough=0.0, seed=2)
    for sx in (-1, 1):
        m.tube([Vector((sx * 0.05, -0.27, 0.37)), Vector((sx * 0.07, -0.26, 0.47))], [0.04, 0.0], 4, rust, L.BARK, cap_top=False)
        m.blob(Vector((sx * 0.045, -0.36, 0.33)), 0.016, INK, L.BARK, subdiv=1, rough=0.0, seed=3)
        for fy in (-0.15, 0.15):
            m.tube([Vector((sx * 0.06, fy, 0.16)), Vector((sx * 0.06, fy, 0.0))], [0.03, 0.025], 5, INK, L.BARK)
    m.tube([Vector((0, 0.22, 0.22)), Vector((0.04, 0.38, 0.28)), Vector((0.1, 0.5, 0.36)), Vector((0.12, 0.58, 0.42))], [0.05, 0.08, 0.07, 0.0], 8,
           rust, L.BARK, cap_top=False, color_fn=lambda t, k: CREAM if t > 0.8 else rust)
    m.bake(ao_dist=0.15, ao_strength=0.6)
    return m.finish()


def hedgehog():
    """A round hedgehog: a soft dome of a body, a pointed snout, and a coat of
    spines fanning back over it."""
    m = L.Model("hedgehog", 56)
    spines = L.srgb("#5C4636")
    tips = L.srgb("#C9AE8A")
    face = L.srgb("#D9B48C")
    m.blob(Vector((0, 0.02, 0.13)), 0.16, spines, L.BARK, subdiv=2, rough=0.06, seed=1, squash=(1.0, 1.25, 0.8))
    m.blob(Vector((0, -0.16, 0.1)), 0.075, face, L.BARK, subdiv=2, rough=0.0, seed=2, squash=(1.0, 1.5, 0.85))
    m.blob(Vector((0, -0.285, 0.095)), 0.022, INK, L.BARK, subdiv=1, rough=0.0, seed=3)
    for sx in (-1, 1):
        m.blob(Vector((sx * 0.045, -0.205, 0.135)), 0.014, INK, L.BARK, subdiv=1, rough=0.0, seed=4)
        m.blob(Vector((sx * 0.07, -0.13, 0.17)), 0.022, face, L.BARK, subdiv=1, rough=0.0, seed=5)
    rng = m.rng
    for k in range(34):
        # spines on the back and sides, leaning backwards (+Y)
        u = rng.uniform(0.0, 1.0)
        a = rng.uniform(-2.3, 2.3)
        d = Vector((math.sin(a) * 0.9, 0.35 + 0.65 * u, math.cos(a) * 0.9 + 0.1)).normalized()
        if d.z < -0.1:
            continue
        base = Vector((0, 0.04, 0.13)) + Vector((d.x * 0.15, d.y * 0.18, d.z * 0.12))
        tip = base + (d + Vector((0, 0.9, 0.15))).normalized() * rng.uniform(0.09, 0.13)
        m.tube([base, tip], [0.022, 0.0], 4, spines, L.BARK, cap_top=False, color_fn=lambda t, kk: L.mix(spines, tips, t))
    m.bake(ao_dist=0.12, ao_strength=0.6)
    return m.finish()


def main():
    L.reset()
    L.export([keeper_body(), keeper_head(), keeper_hood(), keeper_hand(), keeper_foot(), keeper_lantern()], "keeper.glb")
    L.reset()
    L.export([tool_match(), tool_match(True), tool_lighter(), tool_tiki(), tool_flamer(), tool_dragon(), tool_meteor()], "tools.glb")
    L.reset()
    L.export([sprite()] + salamander() + [rabbit(), fox(), hedgehog()], "creatures.glb")


if __name__ == "__main__":
    main()
