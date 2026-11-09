"""The fire-keeper, the tools, the helpers and the critters.

The keeper is built round the fire and kept round against the spiky cold
forest: a rust-red cape gone black with soot at the hem (a ragged, scorched
edge and an ochre patch stitched on the back, where the chase camera looks), a
fat knitted scarf in ember orange with a tail that flies out behind, a round
hood with a soft drooping tip over a soot-dark face with two warm eyes, chunky
boots, leather mittens, and a brass lantern hanging from a crooked pole in the
left hand. Parts are separate objects so the game can animate them
(scripts/keeper.gd puts them together). Tools are the real objects, bevelled
and worn at the edges, held with the grip at the origin and the business end
along the game's +Z (Blender -Y).

Vertex alpha: 0.5 glows fully (lantern glass, the face's eyes, sprite bodies),
0.3 glows faintly (the scarf's ember stripes), 0 is plain.

Run:  python3 art/blender/characters.py   (writes models/keeper.glb, tools.glb, creatures.glb)
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forest_lib as L  # noqa: E402
from mathutils import Matrix, Vector, noise  # noqa: E402

CAPE = L.srgb("#8E3A2C")
CAPE_DARK = L.srgb("#5E2420")
SOOT = L.srgb("#1E1618")
PATCH = L.srgb("#A0703C")
STITCH = L.srgb("#E3C99A")
HOOD = L.srgb("#8A3528")
FACE = L.srgb("#1C1420")
EYE = L.srgb("#FFC15E")
SCARF = L.srgb("#E8642C")
STRIPE = L.srgb("#FFC15E")
FRINGE = L.srgb("#C24A22")
CREAM = L.srgb("#EFE3C8")
INK = L.srgb("#2E1E14")
LEATHER = L.srgb("#6B4A35")
LEATHER_HI = L.srgb("#A07A58")
BOOT = L.srgb("#3E2A20")
SOLE = L.srgb("#1E1612")
BRASS = L.srgb("#C0913F")
BRASS_DARK = L.srgb("#7A5A2A")
BRASS_HI = L.srgb("#F0D08A")
GLASS = L.srgb("#FFC15E")
GLASS_CORE = L.srgb("#FFE2A0")
WOOD = L.srgb("#B58A57")
WOOD_DARK = L.srgb("#7A5636")
WOOD_HI = L.srgb("#D8B07A")
EMBER = L.srgb("#E8642C")
POPPY = L.srgb("#D9483B")
STEEL = L.srgb("#6D6A73")
STEEL_HI = L.srgb("#B8B4BE")
VIOLET = L.srgb("#6E4A9A")
MINT = L.srgb("#9FF0D0")
GOLD = L.srgb("#F2C14E")
WARM = 0.3                  # vertex alpha: a faint ember glow (the scarf's stripes)
Z = Vector((0, 0, 1))
F = Vector((0, -1, 0))      # the game's forward (+Z) in Blender


def rot_x(deg):
    return Matrix.Rotation(math.radians(deg), 4, 'X')


def ring_mesh(m, rings, faces_closed=True):
    """Join a list of vertex rings (same length) with quads."""
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        n = len(a)
        for k in range(n):
            k2 = (k + 1) % n
            m.face([a[k], a[k2], b[k2], b[k]])


# ------------------------------------------------------------------------------------
# The fire-keeper
# ------------------------------------------------------------------------------------
def keeper_body():
    """The cape (a round bell from the shoulders, ragged and sooty at the hem,
    a patch on the back), a clasp at the throat, and the scarf rolled round the
    neck with one tail down the chest."""
    m = L.Model("k_body", 31)
    rng = m.rng
    sides = 20
    # (radius, height) from the hem up to the neck
    prof = [(0.43, 0.1), (0.445, 0.2), (0.43, 0.34), (0.395, 0.48), (0.35, 0.62), (0.3, 0.73), (0.22, 0.81), (0.14, 0.86)]
    rings = []
    for i, (r, z) in enumerate(prof):
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            rr = r * (1.0 + 0.025 * math.sin(a * 3 + i))
            zz = z
            if i == 0:
                # a ragged, scorched hem: torn points of different lengths
                zz = z - (0.035 if k % 2 == 0 else 0.0) * (0.6 + 0.8 * rng.random())
            p = Vector((math.cos(a) * rr, math.sin(a) * rr * 0.92, zz))
            # soot creeps up from the hem in tongues; darker at the back of the hem where it drags
            n = noise.noise(Vector((p.x * 5.0, p.y * 5.0, p.z * 2.0)))
            soot = max(0.0, min(1.0, (0.36 - z) / 0.26 + n * 0.45))
            col = L.mix(L.mix(CAPE_DARK, CAPE, min(1.0, z * 2.2)), SOOT, soot * 0.9)
            ring.append(m.vert(p, col, L.BARK, 0.0))
        rings.append(ring)
    ring_mesh(m, rings)
    # the hem's underside, so the cape has thickness when seen from below
    inner = [m.vert(Vector((v.co.x * 0.9, v.co.y * 0.9, v.co.z + 0.02)), SOOT, L.BARK) for v in rings[0]]
    ring_mesh(m, [inner, rings[0]])
    # a seam down the front where the cape closes, and a brass clasp at the throat
    for z0, z1 in ((0.12, 0.76),):
        pts = [Vector((0, -prof[j][0] * 0.92 - 0.004, prof[j][1])) for j in range(len(prof)) if z0 <= prof[j][1] <= z1]
        m.tube(pts, [0.012] * len(pts), 4, CAPE_DARK, L.BARK, cap_top=False)
    m.blob(Vector((0, -0.215, 0.79)), 0.035, BRASS, L.BARK, subdiv=1, rough=0.0, seed=3, squash=(1.2, 0.6, 1.0))
    # an ochre patch stitched on the back
    pc = Vector((0.06, 0.39, 0.4))
    pw, ph = 0.13, 0.11
    corners = [pc + Vector((-pw, 0, -ph)), pc + Vector((pw, 0.0, -ph)), pc + Vector((pw, -0.02, ph)), pc + Vector((-pw, -0.02, ph))]
    rot = Matrix.Rotation(0.12, 3, 'Y')
    cv = [m.vert(pc + rot @ (c - pc) + Vector((0, 0.012, 0)), PATCH, L.BARK) for c in corners]
    m.face(cv[::-1])
    for k in range(4):
        a, b = corners[k], corners[(k + 1) % 4]
        for s in range(4):
            q = a.lerp(b, (s + 0.5) / 4)
            q = pc + rot @ (q - pc) + Vector((0, 0.016, 0))
            m.box(q, (0.018, 0.006, 0.006), STITCH, L.BARK, rot=Matrix.Rotation(math.atan2(b.z - a.z, b.x - a.x), 3, 'Y'))
    # the scarf: a fat knitted roll round the neck with ember stripes
    roll = []
    for i in range(14):
        a = 2 * math.pi * i / 14
        roll.append(Vector((math.cos(a) * 0.19, math.sin(a) * 0.17, 0.88 + 0.015 * math.sin(a * 2))))
    roll.append(roll[0])
    for i in range(14):
        p0, p1 = roll[i], roll[i + 1]
        col = STRIPE if i % 4 == 1 else SCARF
        flag = WARM if i % 4 == 1 else L.BARK
        m.tube([p0, p1], [0.075, 0.075], 8, col, flag, cap_top=False, cap_bottom=False)
    # the front tail, hanging down the chest, with a fringe
    tail = [Vector((0.08, -0.2, 0.86)), Vector((0.11, -0.3, 0.74)), Vector((0.12, -0.36, 0.6)), Vector((0.13, -0.39, 0.5))]
    m.tube(tail, [0.05, 0.05, 0.048, 0.045], 6, SCARF, L.BARK, squash=(1.0, 0.4), cap_top=False,
           color_fn=lambda t, k: STRIPE if 0.3 < t < 0.5 else SCARF)
    for k in range(4):
        q = tail[-1] + Vector(((k - 1.5) * 0.022, 0, 0))
        m.tube([q, q + Vector((0, -0.01, -0.06))], [0.009, 0.006], 3, FRINGE, L.BARK, cap_top=False)
    m.bake(ao_dist=0.35, ao_strength=0.7, ground=False, wear=0.25, grime=0.3, paint=0.18, paint_scale=6.0)
    return m.finish()


def keeper_scarf_tail():
    """The scarf's long tail that flies out behind (animated); origin at the knot."""
    m = L.Model("k_scarf", 37)
    pts = [Vector((0, 0, 0)), Vector((0.03, 0.08, -0.03)), Vector((0.06, 0.18, -0.06)), Vector((0.08, 0.3, -0.1)), Vector((0.09, 0.42, -0.16))]
    m.tube(pts, [0.055, 0.055, 0.052, 0.05, 0.048], 6, SCARF, L.BARK, squash=(1.0, 0.35), cap_top=False,
           color_fn=lambda t, k: STRIPE if (0.18 < t < 0.32 or 0.6 < t < 0.74) else SCARF)
    end = pts[-1]
    for k in range(5):
        q = end + Vector(((k - 2) * 0.02, 0.0, 0.0))
        m.tube([q, q + Vector((0.0, 0.05, -0.04))], [0.009, 0.005], 3, FRINGE, L.BARK, cap_top=False)
    m.bake(ao_dist=0.1, ao_strength=0.3, ground=False, paint=0.15, paint_scale=8.0)
    return m.finish()


def keeper_head():
    """Only the face shows, deep in the hood: soot-dark, with two warm eyes."""
    m = L.Model("k_head", 32)
    m.blob(Vector((0, 0, 0)), 0.22, FACE, L.BARK, subdiv=2, rough=0.0, seed=1, squash=(1.0, 0.95, 0.98))
    for sx in (-1, 1):
        m.blob(Vector((sx * 0.075, -0.205, 0.015)), 0.034, EYE, L.GLOW, subdiv=1, rough=0.0, seed=2, squash=(0.8, 0.5, 1.15))
    m.bake(ao_dist=0.2, ao_strength=0.3, ground=False)
    return m.finish()


def keeper_hood():
    """A round hood (origin = the head's centre): a soft shell open at the face
    with a rolled, scorched rim, and a short rounded tip drooping at the back."""
    m = L.Model("k_hood", 33)
    prof = [(0.2, 0.235), (0.27, 0.17), (0.315, 0.06), (0.32, -0.06), (0.29, -0.17), (0.21, -0.27), (0.1, -0.33), (0.0, -0.345)]
    m.lathe(prof, 18, HOOD, L.BARK, close_top=False, close_bottom=False,
            color_fn=lambda t, k: L.mix(L.mix(HOOD, SOOT, 0.35), HOOD, min(1.0, t * 3.0)))
    m.transform(list(m.bm.verts), rot_x(90))
    # stretch it a little taller than wide, and let it sit back over the neck
    for v in m.bm.verts:
        v.co.z *= 1.08
        v.co.z += 0.02
    # the rolled rim round the face, a darker scorched band
    rim = []
    for i in range(18):
        a = 2 * math.pi * i / 18
        rim.append(Vector((math.cos(a) * 0.205, -0.235, math.sin(a) * 0.205 * 1.08 + 0.02)))
    rim.append(rim[0])
    m.tube(rim, [0.04] * len(rim), 6, L.mix(HOOD, SOOT, 0.55), L.BARK, cap_top=False, cap_bottom=False)
    # the soft drooping tip at the back
    tip = [Vector((0, 0.2, 0.2)), Vector((0, 0.33, 0.22)), Vector((0.02, 0.43, 0.13)), Vector((0.03, 0.46, 0.04))]
    m.tube(tip, [0.15, 0.1, 0.06, 0.0], 10, HOOD, L.BARK, cap_top=False, color_fn=lambda t, k: L.mix(HOOD, L.mix(HOOD, SOOT, 0.4), t))
    # a capelet over the shoulders, attached to the hood's base
    rows = []
    for z, r in ((-0.26, 0.27), (-0.36, 0.34), (-0.44, 0.38)):
        row = []
        for k in range(18):
            a = 2 * math.pi * k / 18
            rr = r * (1.0 + (0.06 if (k % 2 == 0 and z < -0.4) else 0.0))
            row.append(m.vert(Vector((math.cos(a) * rr, math.sin(a) * rr * 0.92, z - (0.03 if (k % 2 == 0 and z < -0.4) else 0.0))),
                              L.mix(HOOD, SOOT, 0.25 if z < -0.4 else 0.0), L.BARK))
        rows.append(row)
    ring_mesh(m, rows)
    m.bake(ao_dist=0.3, ao_strength=0.65, ground=False, wear=0.2, grime=0.35, paint=0.18, paint_scale=7.0)
    return m.finish()


def keeper_hand():
    m = L.Model("k_hand", 34)
    m.blob(Vector((0, 0, 0)), 0.085, LEATHER, L.BARK, subdiv=2, rough=0.05, seed=1, squash=(1.0, 1.1, 0.9))
    m.blob(Vector((0.065, -0.04, 0.03)), 0.036, LEATHER, L.BARK, subdiv=1, rough=0.0, seed=2)
    m.lathe([(0.07, 0.05), (0.085, 0.08), (0.088, 0.12), (0.075, 0.14)], 10, L.mix(LEATHER, SOOT, 0.35), L.BARK,
            center=(0, 0.02, 0.0), close_top=False, close_bottom=False)
    m.bake(ao_dist=0.1, ao_strength=0.4, ground=False, wear=0.5, wear_color=LEATHER_HI, grime=0.3)
    return m.finish()


def keeper_foot():
    """A chunky round boot: a fat toe, a dark sole, a turned-down cuff."""
    m = L.Model("k_foot", 35)
    m.blob(Vector((0, -0.05, 0.06)), 0.11, BOOT, L.BARK, subdiv=2, rough=0.04, seed=1, squash=(0.92, 1.45, 0.62))
    m.blob(Vector((0, -0.05, 0.018)), 0.115, SOLE, L.BARK, subdiv=1, rough=0.0, seed=2, squash=(0.95, 1.5, 0.18))
    m.lathe([(0.075, 0.06), (0.08, 0.14), (0.078, 0.17)], 10, BOOT, L.BARK, center=(0, 0.02, 0), close_top=True, close_bottom=False)
    m.lathe([(0.082, 0.15), (0.098, 0.17), (0.1, 0.2), (0.086, 0.21)], 10, LEATHER, L.BARK, center=(0, 0.02, 0),
            close_top=False, close_bottom=False)
    for k in range(3):
        m.blob(Vector((0, -0.11 + k * 0.035, 0.115 - k * 0.012)), 0.012, CREAM, L.BARK, subdiv=0, rough=0.0, seed=k)
    m.bake(ao_dist=0.15, ao_strength=0.55, ground=True, wear=0.55, wear_color=LEATHER_HI, grime=0.35)
    return m.finish()


def keeper_lantern():
    """A brass lantern; origin at its hanging ring, so it can sway from the pole."""
    m = L.Model("k_lantern", 36)
    o = Vector((0, 0, -0.3))
    m.lathe([(0.0, 0.2), (0.05, 0.19), (0.095, 0.15), (0.12, 0.12), (0.035, 0.12)], 6, BRASS, L.BARK, center=o, close_bottom=False)
    m.lathe([(0.085, -0.08), (0.095, 0.02), (0.085, 0.12)], 6, GLASS, L.GLOW, center=o, close_top=False, close_bottom=False,
            color_fn=lambda t, k: L.mix(GLASS, GLASS_CORE, 1.0 - abs(t - 0.5) * 2))
    m.lathe([(0.12, -0.13), (0.11, -0.08), (0.0, -0.08)], 6, BRASS_DARK, L.BARK, center=o, close_top=False)
    for k in range(6):
        a = 2 * math.pi * k / 6
        m.box(o + Vector((math.cos(a) * 0.098, math.sin(a) * 0.098, 0.02)), (0.016, 0.016, 0.21), BRASS_DARK, L.BARK, bevel=0.004,
              rot=Matrix.Rotation(a, 3, 'Z'))
    m.tube([o + Vector((-0.055, 0, 0.2)), Vector((0, 0, 0.0)), o + Vector((0.055, 0, 0.2))], [0.009, 0.009, 0.009], 4, BRASS_DARK, L.BARK)
    m.blob(o + Vector((0, 0, -0.16)), 0.03, BRASS, L.BARK, subdiv=1, rough=0.0, seed=4)
    m.bake(ao_dist=0.1, ao_strength=0.4, ground=False, wear=0.7, wear_color=BRASS_HI, grime=0.4)
    return m.finish()


def keeper_pole():
    """A crooked wooden pole with a hook at the top (origin at the grip)."""
    m = L.Model("k_pole", 38)
    rng = m.rng
    pts = [Vector((0, 0, -0.42)), Vector((0.01, 0.01, 0.0)), Vector((-0.015, 0.02, 0.45)), Vector((0.01, 0.0, 0.85)),
           Vector((0.0, -0.03, 1.08)), Vector((0.0, -0.12, 1.2)), Vector((0.0, -0.22, 1.19)), Vector((0.0, -0.26, 1.12))]
    pts = L.smooth_spine(pts)
    n = len(pts)
    m.tube(pts, [0.03 - 0.008 * (i / (n - 1)) for i in range(n)], 6, WOOD_DARK, L.BARK, cap_top=True, cap_bottom=True,
           wobble=0.06, color_fn=lambda t, k: L.mix(WOOD_DARK, WOOD, 0.3 * (k % 2) + 0.2 * rng.random()))
    # a leather grip wrap and a knot of twine below the hook
    m.lathe([(0.034, -0.08), (0.036, 0.0), (0.034, 0.08)], 8, LEATHER, L.BARK, close_top=False, close_bottom=False)
    m.lathe([(0.03, 1.0), (0.034, 1.03), (0.03, 1.06)], 8, CREAM, L.BARK, close_top=False, close_bottom=False)
    m.bake(ao_dist=0.1, ao_strength=0.3, ground=False, wear=0.5, wear_color=WOOD_HI, paint=0.15, paint_scale=12.0)
    return m.finish()


POLE_HOOK = Vector((0.0, -0.26, 1.13))   # where the lantern hangs (Blender coords, pole space)


# ------------------------------------------------------------------------------------
# Tools (grip at the origin, flame end toward -Y), bevelled, worn at the edges
# ------------------------------------------------------------------------------------
def along(m, verts):
    """Built pointing +Z (up), turned to point -Y (the game's +Z)."""
    m.transform(verts, Matrix.Rotation(math.radians(90), 4, 'X'))


def tool_match(sparkler=False):
    m = L.Model("tool_0s" if sparkler else "tool_0", 41)
    if sparkler:
        cols = [L.srgb("#D9483B"), L.srgb("#F2C14E"), L.srgb("#6FB3D9"), L.srgb("#8FAE5E")]
        for k in range(4):
            m.box(Vector((0, 0, 0.06 + k * 0.1)), (0.045, 0.045, 0.1), cols[k], L.BARK, bevel=0.008)
        # a twist of wire and a fizzing ball
        m.tube([Vector((0, 0, 0.4)), Vector((0.01, 0, 0.43)), Vector((-0.01, 0, 0.46))], [0.008, 0.008, 0.006], 4, STEEL, L.BARK)
        m.blob(Vector((0, 0, 0.47)), 0.045, CREAM, L.GLOW, subdiv=1, rough=0.25, seed=1, spikes=0.3)
    else:
        # a square-sawn stick with a little grain, and a fat red head going dark at the tip
        vs = m.box(Vector((0, 0, 0.2)), (0.042, 0.042, 0.4), L.srgb("#E6CF9C"), L.BARK, bevel=0.008)
        m.recolor(vs, lambda v: (L.mix(L.srgb("#E6CF9C"), L.srgb("#C9A86E"), 0.5 + 0.5 * math.sin(v.co.z * 60 + v.co.x * 40)), L.BARK))
        m.blob(Vector((0, 0, 0.43)), 0.048, POPPY, L.BARK, subdiv=2, rough=0.08, seed=2, squash=(1, 1, 1.4),
               color_fn=lambda d, p: L.mix(POPPY, L.srgb("#5A1A16"), max(0.0, d.z) ** 2 * 0.7))
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.05, ao_strength=0.3, ground=False, wear=0.4, grime=0.3)
    return m.finish()


def tool_lighter():
    m = L.Model("tool_1", 42)
    m.box(Vector((0, 0, 0.065)), (0.1, 0.062, 0.15), BRASS, L.BARK, bevel=0.014)
    m.box(Vector((0, 0, 0.142)), (0.104, 0.066, 0.012), BRASS_DARK, L.BARK, bevel=0.004)
    # the flip lid thrown open on its hinge
    m.box(Vector((0.058, 0, 0.19)), (0.1, 0.062, 0.055), BRASS, L.BARK, bevel=0.012, rot=Matrix.Rotation(-1.95, 3, 'Y'))
    m.lathe([(0.012, 0.15), (0.014, 0.16), (0.012, 0.17)], 8, BRASS_DARK, L.BARK, center=(0.05, 0, 0), close_top=False, close_bottom=False)
    # the chimney with its holes, and the striker wheel
    m.lathe([(0.022, 0.148), (0.022, 0.2), (0.019, 0.205)], 10, STEEL, L.BARK, center=(-0.012, 0, 0), close_bottom=False)
    for k in range(3):
        for side in (-1, 1):
            m.blob(Vector((-0.012 + side * 0.006, -0.022, 0.16 + k * 0.014)), 0.0045, INK, L.BARK, subdiv=0, rough=0.0, seed=k)
    m.tube([Vector((0.02, -0.018, 0.185)), Vector((0.02, 0.018, 0.185))], [0.013, 0.013], 10, STEEL_HI, L.BARK, cap_bottom=True,
           color_fn=lambda t, k: STEEL_HI if k % 2 else STEEL)
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.05, ao_strength=0.35, ground=False, wear=0.8, wear_color=BRASS_HI, grime=0.4)
    return m.finish()


def tool_tiki():
    m = L.Model("tool_2", 43)
    # a bamboo pole with swollen nodes
    m.tube([Vector((0, 0, -0.12)), Vector((0.004, 0, 0.35)), Vector((0, 0, 0.8))], [0.03, 0.029, 0.028], 7, WOOD, L.BARK,
           color_fn=lambda t, k: L.mix(WOOD, WOOD_DARK, 0.25 * (k % 2)))
    for z in (0.08, 0.32, 0.56):
        m.lathe([(0.029, z - 0.014), (0.037, z - 0.004), (0.036, z + 0.006), (0.029, z + 0.014)], 7, WOOD_DARK, L.BARK,
                close_top=False, close_bottom=False)
    # the woven basket head, a wrap of oily cloth, char round the lip
    m.lathe([(0.03, 0.72), (0.085, 0.78), (0.115, 0.88), (0.11, 0.95), (0.075, 0.975), (0.05, 0.97)], 12, L.srgb("#8C6A3C"), L.BARK,
            color_fn=lambda t, k: L.mix(L.mix(L.srgb("#8C6A3C"), L.srgb("#5E4426"), 0.45 * ((k + int(t * 6)) % 2)), SOOT, max(0.0, t - 0.7) * 2.5))
    m.lathe([(0.11, 0.8), (0.125, 0.845), (0.11, 0.89)], 12, L.srgb("#3A2A22"), L.BARK, close_top=False, close_bottom=False)
    m.tube([Vector((0.11, 0.0, 0.845)), Vector((0.14, -0.01, 0.8)), Vector((0.15, -0.02, 0.74))], [0.016, 0.012, 0.0], 4,
           L.srgb("#3A2A22"), L.BARK, cap_top=False)
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.1, ao_strength=0.45, ground=False, wear=0.5, wear_color=WOOD_HI, grime=0.35)
    return m.finish()


def tool_flamer():
    m = L.Model("tool_3", 44)
    # a riveted brass tank held at the hip, a hose, a long nozzle with a grip and a valve wheel
    m.lathe([(0.0, -0.06), (0.06, -0.05), (0.085, -0.02), (0.088, 0.0), (0.088, 0.29), (0.082, 0.32), (0.06, 0.345), (0.0, 0.355)],
            14, BRASS, L.BARK, color_fn=lambda t, k: L.mix(BRASS_DARK, BRASS, 0.55 + 0.45 * math.cos(k * 0.45)))
    for z in (0.05, 0.24):
        m.lathe([(0.088, z - 0.016), (0.094, z - 0.006), (0.094, z + 0.006), (0.088, z + 0.016)], 14, BRASS_DARK, L.BARK,
                close_top=False, close_bottom=False)
        for k in range(7):
            a = 2 * math.pi * k / 7
            m.blob(Vector((math.cos(a) * 0.096, math.sin(a) * 0.096, z)), 0.007, BRASS_HI, L.BARK, subdiv=0, rough=0.0, seed=k)
    m.tube([Vector((0, 0.0, 0.34)), Vector((0, -0.04, 0.42)), Vector((0, -0.065, 0.5)), Vector((0, -0.065, 0.72))],
           [0.028, 0.026, 0.024, 0.022], 8, STEEL, L.BARK, color_fn=lambda t, k: L.mix(STEEL, L.srgb("#4A474F"), 0.4 * (int(t * 8) % 2)))
    m.lathe([(0.022, 0.68), (0.036, 0.7), (0.038, 0.725), (0.03, 0.74)], 10, BRASS_DARK, L.BARK, center=(0, -0.065, 0), close_bottom=False,
            color_fn=lambda t, k: L.mix(BRASS_DARK, SOOT, t))
    m.box(Vector((0, -0.065, 0.56)), (0.036, 0.05, 0.08), L.srgb("#3A2A22"), L.BARK, bevel=0.012)
    wheel = []
    for k in range(13):
        a = 2 * math.pi * k / 12
        wheel.append(Vector((math.cos(a) * 0.035, -0.1, 0.42 + math.sin(a) * 0.035)))
    m.tube(wheel, [0.007] * len(wheel), 5, POPPY, L.BARK, cap_top=False, cap_bottom=False)
    m.tube([Vector((0, -0.06, 0.42)), Vector((0, -0.1, 0.42))], [0.008, 0.008], 5, STEEL, L.BARK)
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.1, ao_strength=0.45, ground=False, wear=0.75, wear_color=BRASS_HI, grime=0.4)
    return m.finish()


def tool_dragon():
    """A dragon hand puppet: a felt head with a snout, horns, gold eyes and a cuff."""
    m = L.Model("tool_4", 45)
    felt = VIOLET
    m.blob(Vector((0, 0, 0.13)), 0.15, felt, L.BARK, subdiv=2, rough=0.06, seed=1, squash=(1.0, 0.92, 1.5),
           color_fn=lambda d, p: L.mix(felt, L.srgb("#9A7AC8"), max(0.0, -d.y) * 0.45))
    m.blob(Vector((0, -0.02, 0.34)), 0.085, felt, L.BARK, subdiv=2, rough=0.03, seed=2, squash=(1.15, 0.8, 1.05))
    for sx in (-1, 1):
        m.blob(Vector((sx * 0.035, -0.07, 0.41)), 0.016, INK, L.BARK, subdiv=1, rough=0.0, seed=7)      # nostrils
        m.blob(Vector((sx * 0.085, 0.08, 0.25)), 0.036, GOLD, L.GLOW, subdiv=1, rough=0.0, seed=3)
        m.blob(Vector((sx * 0.085, 0.105, 0.255)), 0.015, INK, L.BARK, subdiv=1, rough=0.0, seed=4, squash=(0.6, 1.0, 1.4))
        m.tube([Vector((sx * 0.07, 0.07, 0.19)), Vector((sx * 0.13, 0.13, 0.13)), Vector((sx * 0.14, 0.21, 0.04))], [0.026, 0.015, 0.0], 6,
               CREAM, L.BARK, cap_top=False)
    for k in range(4):
        m.tube([Vector((0, 0.13, 0.3 - k * 0.08)), Vector((0, 0.2, 0.27 - k * 0.08))], [0.026, 0.0], 5, L.srgb("#4A3070"), L.BARK, cap_top=False)
    m.lathe([(0.125, -0.06), (0.14, -0.02), (0.14, 0.02), (0.13, 0.04)], 12, L.srgb("#4A3070"), L.BARK, close_top=False, close_bottom=False)
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.1, ao_strength=0.45, ground=False, wear=0.3, grime=0.35, paint=0.15, paint_scale=10.0)
    return m.finish()


def tool_meteor():
    m = L.Model("tool_5", 46)
    # a twisted staff, a gold collar, three claws holding a star
    pts = [Vector((0.012 * math.sin(i * 1.3), 0.012 * math.cos(i * 1.3), -0.1 + i * 0.1)) for i in range(10)]
    m.tube(pts, [0.028] * 10, 6, L.srgb("#3D2B55"), L.BARK, twist=4.0, color_fn=lambda t, k: L.mix(L.srgb("#3D2B55"), L.srgb("#5E4A80"), 0.4 * (k % 2)))
    m.lathe([(0.03, 0.8), (0.05, 0.84), (0.05, 0.87), (0.03, 0.9)], 8, GOLD, L.BARK, close_top=False, close_bottom=False)
    for k in range(3):
        a = 2 * math.pi * k / 3
        d = Vector((math.cos(a), math.sin(a), 0))
        m.tube([Vector((0, 0, 0.88)) + d * 0.03, Vector((0, 0, 0.95)) + d * 0.09, Vector((0, 0, 1.05)) + d * 0.06], [0.012, 0.01, 0.0], 4,
               GOLD, L.BARK, cap_top=False)
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
    m.bake(ao_dist=0.1, ao_strength=0.3, ground=False, wear=0.6, wear_color=BRASS_HI, grime=0.3)
    return m.finish()


# ------------------------------------------------------------------------------------
# Helpers and critters (all face -Y)
# ------------------------------------------------------------------------------------
def sprite():
    """A fire sprite: a plump teardrop flame with a curled tip, two side tongues
    for arms and two ink eyes. Its body glows."""
    m = L.Model("sprite", 51)
    prof = [(0.0, -0.17), (0.1, -0.155), (0.17, -0.09), (0.195, 0.0), (0.18, 0.09), (0.13, 0.18), (0.075, 0.26), (0.03, 0.32), (0.0, 0.34)]
    rings = m.lathe(prof, 14, EMBER, L.GLOW, color_fn=lambda t, k: L.mix(GLASS_CORE, EMBER, min(1.0, t * 1.5)))
    for v in m.bm.verts:
        if v.co.z > 0.1:
            u = (v.co.z - 0.1) / 0.24
            v.co.y += u * u * 0.09          # the tip curls back
            v.co.x += u * u * 0.04
    for sx in (-1, 1):
        m.tube([Vector((sx * 0.16, 0.0, -0.02)), Vector((sx * 0.24, -0.02, 0.04)), Vector((sx * 0.27, 0.0, 0.12))], [0.045, 0.03, 0.0], 7,
               EMBER, L.GLOW, cap_top=False, color_fn=lambda t, k: L.mix(GLASS, EMBER, t))
        m.blob(Vector((sx * 0.062, -0.178, 0.03)), 0.028, INK, L.BARK, subdiv=1, rough=0.0, seed=2, squash=(0.75, 0.45, 1.25))
    # a little curl of flame on the crown
    m.tube([Vector((0.0, 0.07, 0.3)), Vector((0.04, 0.14, 0.36)), Vector((0.09, 0.15, 0.33))], [0.03, 0.018, 0.0], 6, EMBER, L.GLOW, cap_top=False)
    m.bake(ao_dist=0.1, ao_strength=0.25, ground=False)
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
            base = L.srgb("#3A1E16")
        return base
    m.tube(spine, radii, 10, EMBER, L.BARK, cap_top=False, squash=(1.2, 0.8), color_fn=col)
    m.blob(Vector((0, -0.4, 0.18)), 0.1, EMBER, L.BARK, subdiv=2, rough=0.0, seed=1, squash=(1.0, 1.35, 0.72))
    for sx in (-1, 1):
        m.blob(Vector((sx * 0.065, -0.45, 0.24)), 0.035, GOLD, L.GLOW, subdiv=1, rough=0.0, seed=2)
        m.blob(Vector((sx * 0.075, -0.475, 0.245)), 0.015, INK, L.BARK, subdiv=1, rough=0.0, seed=3)
        m.blob(Vector((sx * 0.025, -0.52, 0.19)), 0.008, INK, L.BARK, subdiv=0, rough=0.0, seed=4)
    for k in range(5):
        p = L.point_on(spine, 0.25 + 0.12 * k) + Vector((0, 0, 0.09))
        m.tube([p, p + Vector((0, 0.04, 0.09)), p + Vector((0, 0.08, 0.11))], [0.035, 0.015, 0.0], 5, GLASS, L.GLOW, cap_top=False)
    m.bake(ao_dist=0.15, ao_strength=0.5, wear=0.3, grime=0.3)
    ob = m.finish()
    leg = L.Model("salamander_leg", 53)
    leg.tube([Vector((0, 0, 0)), Vector((0.08, -0.02, -0.02)), Vector((0.12, -0.03, -0.1))], [0.035, 0.03, 0.025], 6, EMBER, L.BARK)
    for k in range(3):
        a = -0.6 + k * 0.6
        leg.tube([Vector((0.12, -0.03, -0.1)), Vector((0.12 + math.cos(a) * 0.05, -0.03 - math.sin(a) * 0.05, -0.11))], [0.012, 0.006], 4,
                 EMBER, L.BARK)
    leg.bake(ao_dist=0.05, ao_strength=0.3, ground=False)
    return [ob, leg.finish()]


def eye(m, at, r, toward=F):
    """A dark eye with a small cream glint, so critters look alive."""
    m.blob(at, r, INK, L.BARK, subdiv=1, rough=0.0, seed=3)
    m.blob(at + Vector(toward) * r * 0.7 + Vector((0, 0, r * 0.35)), r * 0.32, CREAM, L.BARK, subdiv=0, rough=0.0, seed=4)


def leg(m, top, foot, r0, r1, color, paw=None, paw_color=None):
    m.tube([top, top.lerp(foot, 0.5) + Vector((0, 0.01, 0)), foot], [r0, (r0 + r1) * 0.5, r1], 6, color, L.BARK, cap_bottom=False)
    if paw is not None:
        m.blob(foot + Vector((0, -paw * 0.4, -paw * 0.2)), paw, paw_color or color, L.BARK, subdiv=1, rough=0.0, seed=8,
               squash=(0.9, 1.4, 0.6))


def rabbit():
    """A wild rabbit: a pear of a body on big folded haunches, long hind feet,
    slim front legs, a proper head with cheeks and a pink nose, tall ears with
    pink insides, and a cream scut."""
    m = L.Model("rabbit", 54)
    fur = L.srgb("#A8977F")
    belly = L.srgb("#D9CDB6")
    pink = L.srgb("#E2A9A0")
    m.blob(Vector((0, 0.05, 0.17)), 0.15, fur, L.BARK, subdiv=2, rough=0.05, seed=1, squash=(0.82, 1.25, 0.95),
           color_fn=lambda d, p: L.mix(fur, belly, max(0.0, -d.z) * 0.8))
    for sx in (-1, 1):
        m.blob(Vector((sx * 0.085, 0.11, 0.13)), 0.09, fur, L.BARK, subdiv=2, rough=0.03, seed=2, squash=(0.6, 1.1, 1.0))
        m.blob(Vector((sx * 0.08, 0.06, 0.03)), 0.05, fur, L.BARK, subdiv=1, rough=0.0, seed=5, squash=(0.7, 2.0, 0.5),
               color_fn=lambda d, p: L.mix(fur, belly, 0.5))
        leg(m, Vector((sx * 0.055, -0.08, 0.14)), Vector((sx * 0.055, -0.11, 0.025)), 0.03, 0.022, fur, paw=0.026, paw_color=belly)
    # the head, a little forward and up, with cheeks and a snout
    hc = Vector((0, -0.15, 0.3))
    m.blob(hc, 0.1, fur, L.BARK, subdiv=2, rough=0.02, seed=3, squash=(0.9, 1.15, 0.92))
    for sx in (-1, 1):
        m.blob(hc + Vector((sx * 0.04, -0.07, -0.03)), 0.045, belly, L.BARK, subdiv=1, rough=0.0, seed=6)
        eye(m, hc + Vector((sx * 0.06, -0.05, 0.03)), 0.018, toward=Vector((sx * 0.4, -1, 0)).normalized())
        m.tube([hc + Vector((sx * 0.03, 0.02, 0.07)), hc + Vector((sx * 0.05, 0.05, 0.2)), hc + Vector((sx * 0.07, 0.1, 0.3))],
               [0.032, 0.036, 0.0], 7, fur, L.BARK, squash=(1.0, 0.42), cap_top=False,
               color_fn=lambda t, k: L.mix(fur, pink, 0.55) if k in (2, 3, 4) else fur)
    m.blob(hc + Vector((0, -0.11, -0.01)), 0.016, pink, L.BARK, subdiv=1, rough=0.0, seed=7)
    m.blob(Vector((0, 0.22, 0.2)), 0.05, CREAM, L.BARK, subdiv=1, rough=0.2, seed=4)
    m.bake(ao_dist=0.15, ao_strength=0.6, grime=0.3, paint=0.15, paint_scale=14.0)
    return m.finish()


def fox():
    """A red fox: a slim body with a cream chest, a narrow head with a pointed
    snout and a black nose, tall ears, four thin legs in black socks, and a big
    brush of a tail with a cream tip."""
    m = L.Model("fox", 55)
    rust = L.srgb("#C8642E")
    sock = L.srgb("#2A1A14")
    m.tube([Vector((0, 0.2, 0.24)), Vector((0, 0.05, 0.25)), Vector((0, -0.12, 0.27)), Vector((0, -0.2, 0.3))], [0.08, 0.1, 0.1, 0.085], 10,
           rust, L.BARK, squash=(0.85, 1.0), color_fn=lambda t, k: CREAM if (k in (6, 7, 8) and t > 0.4) else rust)
    for sx in (-1, 1):
        for fy, tilt in ((-0.15, -0.02), (0.16, 0.03)):
            top = Vector((sx * 0.05, fy, 0.22))
            foot = Vector((sx * 0.055, fy + tilt, 0.0))
            m.tube([top, top.lerp(foot, 0.5), foot], [0.03, 0.022, 0.018], 6, rust, L.BARK,
                   color_fn=lambda t, k: sock if t > 0.45 else rust)
            m.blob(foot + Vector((0, -0.012, 0.008)), 0.02, sock, L.BARK, subdiv=1, rough=0.0, seed=9, squash=(0.9, 1.4, 0.6))
    hc = Vector((0, -0.27, 0.34))
    m.blob(hc, 0.085, rust, L.BARK, subdiv=2, rough=0.0, seed=1, squash=(1.05, 1.1, 0.9),
           color_fn=lambda d, p: L.mix(rust, CREAM, max(0.0, -d.z - 0.2) * 1.2))
    m.tube([hc + Vector((0, -0.05, -0.02)), hc + Vector((0, -0.12, -0.035)), hc + Vector((0, -0.17, -0.045))], [0.05, 0.03, 0.0], 8, rust,
           L.BARK, cap_top=False, color_fn=lambda t, k: CREAM if k in (4, 5, 6) else rust)
    m.blob(hc + Vector((0, -0.17, -0.04)), 0.016, sock, L.BARK, subdiv=1, rough=0.0, seed=2)
    for sx in (-1, 1):
        eye(m, hc + Vector((sx * 0.045, -0.06, 0.02)), 0.015, toward=Vector((sx * 0.4, -1, 0)).normalized())
        m.tube([hc + Vector((sx * 0.045, 0.0, 0.05)), hc + Vector((sx * 0.06, 0.01, 0.15))], [0.04, 0.0], 5, rust, L.BARK, cap_top=False,
               squash=(1.0, 0.5), color_fn=lambda t, k: sock if t > 0.6 else rust)
    m.tube([Vector((0, 0.2, 0.25)), Vector((0.04, 0.34, 0.26)), Vector((0.09, 0.47, 0.32)), Vector((0.12, 0.56, 0.4)), Vector((0.13, 0.6, 0.46))],
           [0.05, 0.085, 0.085, 0.06, 0.0], 9, rust, L.BARK, cap_top=False, color_fn=lambda t, k: CREAM if t > 0.78 else rust)
    m.bake(ao_dist=0.15, ao_strength=0.6, grime=0.3, paint=0.15, paint_scale=14.0)
    return m.finish()


def hedgehog():
    """A hedgehog: a round body under a coat of spines, a long snout with a
    shiny nose, small round ears, bright eyes and four stubby legs."""
    m = L.Model("hedgehog", 56)
    spines = L.srgb("#5C4636")
    tips = L.srgb("#C9AE8A")
    face = L.srgb("#D9B48C")
    m.blob(Vector((0, 0.02, 0.13)), 0.155, spines, L.BARK, subdiv=2, rough=0.06, seed=1, squash=(1.0, 1.25, 0.8))
    for sx in (-1, 1):
        for fy in (-0.09, 0.1):
            m.tube([Vector((sx * 0.08, fy, 0.08)), Vector((sx * 0.09, fy - 0.01, 0.0))], [0.028, 0.022], 6, face, L.BARK)
            m.blob(Vector((sx * 0.09, fy - 0.02, 0.01)), 0.022, L.srgb("#3A2A22"), L.BARK, subdiv=1, rough=0.0, seed=9, squash=(1.0, 1.3, 0.5))
    hc = Vector((0, -0.15, 0.11))
    m.blob(hc, 0.08, face, L.BARK, subdiv=2, rough=0.0, seed=2, squash=(1.0, 1.25, 0.88))
    m.tube([hc + Vector((0, -0.05, -0.01)), hc + Vector((0, -0.12, -0.02))], [0.04, 0.016], 8, face, L.BARK)
    m.blob(hc + Vector((0, -0.13, -0.02)), 0.02, INK, L.BARK, subdiv=1, rough=0.0, seed=3)
    for sx in (-1, 1):
        eye(m, hc + Vector((sx * 0.045, -0.055, 0.03)), 0.014, toward=Vector((sx * 0.3, -1, 0)).normalized())
        m.blob(hc + Vector((sx * 0.06, 0.01, 0.065)), 0.022, face, L.BARK, subdiv=1, rough=0.0, seed=5, squash=(1.0, 0.6, 1.0))
    rng = m.rng
    for k in range(44):
        u = rng.uniform(0.0, 1.0)
        a = rng.uniform(-2.4, 2.4)
        d = Vector((math.sin(a) * 0.9, 0.3 + 0.7 * u, math.cos(a) * 0.9 + 0.1)).normalized()
        if d.z < -0.15:
            continue
        base = Vector((0, 0.04, 0.13)) + Vector((d.x * 0.14, d.y * 0.17, d.z * 0.11))
        tip = base + (d + Vector((0, 0.9, 0.2))).normalized() * rng.uniform(0.09, 0.13)
        m.tube([base, tip], [0.02, 0.0], 4, spines, L.BARK, cap_top=False, color_fn=lambda t, kk: L.mix(spines, tips, t))
    m.bake(ao_dist=0.12, ao_strength=0.6, grime=0.3, paint=0.12, paint_scale=14.0)
    return m.finish()


def main():
    L.reset()
    L.export([keeper_body(), keeper_head(), keeper_hood(), keeper_hand(), keeper_foot(), keeper_lantern(), keeper_pole(),
              keeper_scarf_tail()], "keeper.glb")
    L.reset()
    L.export([tool_match(), tool_match(True), tool_lighter(), tool_tiki(), tool_flamer(), tool_dragon(), tool_meteor()], "tools.glb")
    L.reset()
    L.export([sprite()] + salamander() + [rabbit(), fox(), hedgehog()], "creatures.glb")


if __name__ == "__main__":
    main()
