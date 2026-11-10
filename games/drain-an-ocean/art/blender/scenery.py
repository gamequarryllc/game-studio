"""The bay's scenery: kelp, coral, rocks, the three wrecks, the lost town,
the pier, the aquarium, the lighthouse and the town's cottages.
    python3 art/blender/scenery.py [names...]
Fronts face Blender +Y. Nothing straight: pilings lean, hulls are broken
along a line, roofs sag, the old town has lost its roofs to the sea.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from kit import (PAL, ao, bend, box, cyl, export, from_profile, join, lathe, mat, mix, paint, reset,  # noqa: E402
                 smooth, sphere, strut, taper, torus, tube, twist, white, wobble)
from mathutils import Vector  # noqa: E402


def finish(o, seed, wob=0.01, dist=0.6, strength=0.6, angle=35):
    wobble(o, wob, seed)
    smooth(o, angle)
    ao(o, dist, rays=10, strength=strength, seed=seed, edge=0.8)
    return o


def lerpc(a, b, t):
    a = PAL[a] if isinstance(a, str) else a
    b = PAL[b] if isinstance(b, str) else b
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def hashf(x, y, z):
    v = math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
    return v - math.floor(v)


def silt(o, line=0.0, strength=0.5):
    """Sea marks: everything below `line` is stained green-brown with a tide line."""
    paint(o, lambda co, n: lerpc((1, 1, 1), lerpc("kelp_light", "sand", 0.4), strength * (1.0 if co.z < line else max(0.0, 1.0 - (co.z - line) * 3.0)) * (0.7 + 0.3 * hashf(round(co.x * 3), round(co.y * 3), round(co.z * 3)))))


# --- Sea life -------------------------------------------------------------------------------
def kelp():
    reset()
    parts = [sphere(0.14, (0, 0, 0.04), mat("kelp", rough=0.8), scale=(1.2, 1.2, 0.5), segs=10, rings=6)]
    rnd = random.Random(3)
    for k in range(4):
        a = k * math.tau / 4 + rnd.uniform(-0.3, 0.3)
        h = 3.2 * rnd.uniform(0.75, 1.0)
        pts = []
        n = 10
        for i in range(n + 1):
            t = i / n
            pts.append(Vector((math.cos(a) * 0.06 + math.sin(t * 4 + k) * 0.08, math.sin(a) * 0.06 + math.cos(t * 3 + k) * 0.06, t * h)))
        parts.append(tube(pts, [0.02] * (n + 1), mat("kelp", rough=0.7), sides=4))
        for i in range(1, n, 2):
            t = i / n
            p = pts[i]
            bl = from_profile([(0.0, 0.0), (0.09, 0.14), (0.05, 0.62), (0.0, 0.7), (-0.04, 0.4)], 0.008, white(), name="blade")
            bl.rotation_euler = (0.2, 0, a + i * 1.9)
            bl.location = p
            parts.append(bl)
            parts.append(sphere(0.035, p + Vector((0, 0, 0.02)), mat("kelp_light", rough=0.5), segs=6, rings=4))
    o = join(parts, "Kelp")
    smooth(o, 60)
    ao(o, 0.2, rays=6, strength=0.3, seed=5)
    paint(o, lambda co, n: lerpc("kelp", "kelp_light", co.z / 3.2))
    export([o], "kelp")


def coral_brain():
    """A brain coral: a lumpy dome sat on a flattened foot, covered in deep
    meandering valleys (a domain-warped ridge pattern), pale on the ridges,
    dark in the valleys."""
    reset()
    from kit import vnoise3
    b = sphere(0.6, (0, 0, 0.1), white(), scale=(1.0, 0.92, 0.66), segs=84, rings=42)

    def ridge(co):
        wx = co.x + 0.35 * (vnoise3(co.x * 3.1, co.y * 3.1, co.z * 3.1) - 0.5)
        wy = co.y + 0.35 * (vnoise3(co.y * 3.3 + 7, co.z * 3.3, co.x * 3.3) - 0.5)
        f = math.sin(wx * 19.0 + math.sin(wy * 11.0) * 2.6 + vnoise3(co.x * 2, co.y * 2, 3) * 4.0)
        return 1.0 - abs(f)              # 1 on a ridge's crest, 0 deep in a valley

    for v in b.data.vertices:
        co = v.co.copy()
        d = co.normalized()
        lump = 0.06 * (vnoise3(co.x * 2.2, co.y * 2.2, co.z * 2.2) - 0.5)
        if co.z > -0.05:
            g = ridge(co)
            v.co += d * (lump + 0.055 * (g ** 0.6) - 0.03)
        else:
            v.co.z = max(v.co.z, -0.12) + lump * 0.3
    o = join([b], "CoralBrain")
    smooth(o, 80)
    ao(o, 0.12, rays=10, strength=0.85, seed=7)

    def col(co, n):
        if co.z < -0.08:
            return mix("coral_orange", "ink", 0.45)
        g = ridge(co)
        return lerpc(mix("coral_orange", "rust", 0.65), mix("coral_orange", "sand", 0.35), g ** 1.5)
    paint(o, col)
    export([o], "coral_brain")


def coral_branch():
    reset()
    rnd = random.Random(11)
    parts = []

    def grow(p, d, r, depth):
        if depth == 0 or r < 0.02:
            parts.append(sphere(r * 1.2, p, white(), segs=6, rings=4))
            return
        ln = rnd.uniform(0.22, 0.38)
        q = p + d * ln
        parts.append(tube([p, p + d * ln * 0.5, q], [r, r * 0.9, r * 0.82], white(), sides=6))
        for _ in range(2):
            nd = (d + Vector((rnd.uniform(-0.7, 0.7), rnd.uniform(-0.7, 0.7), rnd.uniform(0.1, 0.6)))).normalized()
            grow(q, nd, r * 0.72, depth - 1)

    for k in range(3):
        a = k * math.tau / 3
        grow(Vector((math.cos(a) * 0.15, math.sin(a) * 0.15, 0)), Vector((math.cos(a) * 0.3, math.sin(a) * 0.3, 1)).normalized(), 0.08, 4)
    o = join(parts, "CoralBranch")
    smooth(o, 60)
    ao(o, 0.2, rays=6, strength=0.5, seed=13)
    paint(o, lambda co, n: lerpc("coral_pink", "paper", co.z * 0.6))
    export([o], "coral_branch")


def coral_fan():
    reset()
    pts = [(0.0, 0.0)]
    for i in range(13):
        a = math.radians(20 + i * 11.5)
        r = 0.9 + 0.12 * math.sin(i * 1.7)
        pts.append((math.cos(a) * r, math.sin(a) * r + 0.1))
    fan = from_profile(pts, 0.03, white(), name="fan")
    fan.location = (-0.1, 0, 0)
    parts = [fan, cyl(0.06, 0.25, (0, 0, 0.12), white(), verts=8)]
    for i in range(7):
        a = math.radians(30 + i * 20)
        parts.append(strut((0, 0, 0.1), (math.cos(a) * 0.85 - 0.1, 0.02, math.sin(a) * 0.85 + 0.1), 0.018, white(), sides=4))
    o = join(parts, "CoralFan")
    bend(o, math.radians(25), axis="Z")
    smooth(o, 60)
    ao(o, 0.15, rays=6, strength=0.4, seed=17)
    paint(o, lambda co, n: lerpc("coral_purple", "coral_pink", co.z * 0.8) if hashf(round(co.x * 16), round(co.z * 16), 0) > 0.25 else PAL["ink"])
    export([o], "coral_fan")


def rock(name, scale, seed):
    reset()
    r = sphere(0.6, (0, 0, 0.2), white(), scale=scale, segs=18, rings=12)
    rnd = random.Random(seed)
    for v in r.data.vertices:
        d = v.co.normalized()
        n = math.sin(v.co.x * 5 + seed) * math.sin(v.co.y * 4.3) * math.sin(v.co.z * 6.1 + seed) * 0.12
        v.co += d * (n + rnd.uniform(-0.02, 0.02))
        if v.co.z < 0.0:
            v.co.z *= 0.4
    o = join([r], name)
    smooth(o, 45)
    ao(o, 0.3, rays=8, strength=0.6, seed=seed, top=0.2)
    paint(o, lambda co, n: lerpc(mix("stone", "stone_dark", 0.35), "stone_dark", 0.55 - n.z * 0.4 + 0.25 * hashf(round(co.x * 6), round(co.y * 6), round(co.z * 6))) if n.z < 0.65 else lerpc(mix("stone", "sand", 0.3), "kelp", 0.35))
    export([o], name)


def rock_round():
    rock("rock_round", (1.0, 0.9, 0.75), 19)


def rock_flat():
    rock("rock_flat", (1.3, 1.0, 0.38), 23)


# --- Wrecks -------------------------------------------------------------------------------------
def hull(length, beam, depth, m, sheer=0.3, segs=18, rings=10, name="hull", split=None):
    """A boat hull lofted along Y: pointed bow at +Y, transom at -Y."""
    me = bpy.data.meshes.new(name)
    import bmesh
    bm = bmesh.new()
    rows = []
    for i in range(segs + 1):
        t = i / segs
        y = -length / 2 + t * length
        if split and split[0] < t < split[1]:
            continue
        w = beam / 2 * (math.sin(min(1.0, (1.0 - t) * 1.6 + 0.05) * math.pi / 2) ** 0.8) * (0.85 + 0.15 * min(1.0, t * 4))
        top = depth + sheer * (2 * t - 1) ** 2
        ring = []
        for k in range(rings + 1):
            a = math.pi * k / rings
            x = -math.cos(a) * w
            z = top - math.sin(a) * depth * (0.95 if t < 0.85 else 0.95 - (t - 0.85) * 2)
            ring.append(bm.verts.new((x, y, z)))
        rows.append(ring)
    for i in range(len(rows) - 1):
        for k in range(rings):
            bm.faces.new((rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    sol = o.modifiers.new("s", "SOLIDIFY")
    sol.thickness = 0.12
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier="s")
    return o


def wreck_galleon():
    reset()
    wood = mat("wood_dark", rough=0.85)
    parts = [hull(15.0, 5.0, 2.6, wood, sheer=0.9, split=(0.18, 0.3))]
    # exposed ribs where she broke
    for y in (-3.9, -3.3, -2.7):
        pts = [Vector((-2.2, y, 2.4)), Vector((-2.4, y, 1.2)), Vector((-1.4, y, 0.15)), Vector((0, y, -0.1)), Vector((1.4, y, 0.15)), Vector((2.3, y, 1.0)), Vector((2.0, y, 2.0))]
        parts.append(tube(pts, [0.12] * len(pts), mat("wood_grey", rough=0.9), sides=5))
    # decks, a stern castle, gun ports, the stump of a mast
    parts.append(box((4.2, 6.0, 0.15), (0, 3.2, 2.3), mat("wood_grey", rough=0.9)))
    parts.append(box((4.4, 2.6, 1.6), (0, -6.2, 3.2), wood, bevel=0.1))
    for y in (0.8, 2.6, 4.4):
        for sx in (-1, 1):
            parts.append(box((0.3, 0.6, 0.5), (sx * 2.45, y, 1.4), mat("ink", rough=0.9)))
    parts.append(cyl(0.3, 4.5, (0.2, 2.0, 4.2), mat("wood", rough=0.85), rot=(0.25, 0.4, 0), verts=10, r2=0.22))
    parts.append(strut((-1.5, 2.3, 5.4), (1.9, 1.9, 5.8), 0.1, mat("wood")))
    parts.append(tube([Vector((0, 7.4, 2.6)), Vector((0, 9.0, 3.6)), Vector((0, 10.2, 4.2))], [0.16, 0.12, 0.08], mat("wood"), sides=6))
    o = join(parts, "Galleon")
    o.rotation_euler = (0, math.radians(18), 0)
    o.location = (0, 0, -0.3)
    finish(o, 31, wob=0.05, dist=1.6)
    silt(o, 1.5, 0.55)
    paint(o, lambda co, n: (0.9, 0.95, 0.9) if hashf(round(co.x * 2), round(co.y * 2), round(co.z * 2)) > 0.92 else (1, 1, 1))
    export([o], "wreck_galleon")


def wreck_steamer():
    reset()
    steel = mat("rusty", metal=0.35, rough=0.75)
    parts = []
    bow = hull(10.0, 4.6, 3.0, steel, sheer=0.5)
    for v in bow.data.vertices:
        if v.co.y < -3.5:
            v.co.y = -3.5 + (v.co.y + 3.5) * 0.3 + math.sin(v.co.z * 4 + v.co.x * 3) * 0.3
    bow.location = (0, 4.0, 0)
    parts.append(bow)
    stern = hull(9.0, 4.6, 3.0, steel, sheer=0.4)
    for v in stern.data.vertices:
        if v.co.y > 3.0:
            v.co.y = 3.0 + (v.co.y - 3.0) * 0.2 + math.sin(v.co.z * 5 + v.co.x * 2) * 0.35
    stern.rotation_euler = (0, math.radians(-25), math.radians(8))
    stern.location = (0.6, -5.5, -0.3)
    parts.append(stern)
    parts.append(cyl(0.8, 3.0, (0.3, -4.0, 4.2), mat("paint_red", rough=0.7), rot=(0.15, -0.35, 0), verts=14))
    parts.append(torus(0.82, 0.08, (0.6, -4.15, 5.5), mat("ink"), rot=(0.15, -0.35, 0), maj=14, mi=4))
    parts.append(box((3.0, 2.6, 1.8), (0, 2.0, 3.6), mat("paint_white", rough=0.8), bevel=0.08))
    for x in (-0.9, 0.0, 0.9):
        parts.append(torus(0.2, 0.05, (x, 3.32, 3.8), mat("brass", metal=0.7), rot=(math.pi / 2, 0, 0), maj=10, mi=4))
    for y in (6.0, 1.0, -6.5):
        for sx in (-1, 1):
            parts.append(torus(0.18, 0.05, (sx * 2.25, y, 1.8), mat("brass", metal=0.6), rot=(0, math.pi / 2, 0), maj=10, mi=4))
    o = join(parts, "Steamer")
    o.rotation_euler = (0, math.radians(-12), 0)
    finish(o, 37, wob=0.04, dist=1.6)
    silt(o, 1.8, 0.5)
    paint(o, lambda co, n: lerpc((1, 1, 1), (0.85, 0.6, 0.45), 0.4 * (0.5 + 0.5 * math.sin(co.z * 6 + co.y * 0.7))))
    export([o], "wreck_steamer")


def wreck_trawler():
    reset()
    parts = [hull(8.5, 3.2, 1.9, mat("paint_teal", rough=0.75), sheer=0.6)]
    parts.append(box((3.0, 7.0, 0.1), (0, 0.0, 1.8), mat("wood_grey", rough=0.9)))
    parts.append(box((2.0, 1.8, 1.7), (0, -1.6, 2.7), mat("paint_white", rough=0.8), bevel=0.06))
    parts.append(box((2.2, 2.0, 0.12), (0, -1.6, 3.6), mat("roof_red", rough=0.8), bevel=0.03))
    for x in (-0.55, 0.55):
        parts.append(box((0.6, 0.05, 0.5), (x, -0.68, 3.0), mat("glass", rough=0.1)))
    parts.append(cyl(0.12, 4.0, (0, 1.4, 3.6), mat("wood", rough=0.85), verts=8))
    parts.append(strut((0, 1.4, 4.8), (0.2, 3.6, 2.2), 0.06, mat("wood")))
    # a heap of net on the deck
    net = sphere(0.9, (0.4, 2.2, 2.1), mat("rope", rough=0.95), scale=(1.0, 1.3, 0.45), segs=12, rings=8)
    for v in net.data.vertices:
        v.co.z += math.sin(v.co.x * 9) * math.sin(v.co.y * 7) * 0.08
    parts.append(net)
    for k in range(4):
        parts.append(sphere(0.18, (-0.9 + k * 0.4, 3.0, 2.3), mat("paint_yellow", rough=0.5), segs=8, rings=6))
    o = join(parts, "Trawler")
    o.rotation_euler = (0, math.radians(-28), 0)
    o.location = (0, 0, -0.2)
    finish(o, 41, wob=0.03, dist=1.0)
    silt(o, 1.2, 0.5)
    export([o], "wreck_trawler")


# --- The lost town ---------------------------------------------------------------------------------
def stone_walls(w, d, h, m, door=True, broken=0.0, seed=1):
    parts = []
    rnd = random.Random(seed)
    for (sx, sy, lw, ld) in [(0, d / 2, w, 0.4), (0, -d / 2, w, 0.4), (w / 2, 0, 0.4, d), (-w / 2, 0, 0.4, d)]:
        hh = h - (rnd.uniform(0, broken) if broken else 0)
        parts.append(box((lw, ld, hh), (sx, sy, hh / 2), m, bevel=0.08))
    # windows and the door as dark insets on the front
    for x in (-w * 0.28, w * 0.28):
        parts.append(box((0.8, 0.12, 1.1), (x, d / 2 + 0.16, h * 0.62), mat("ink", rough=0.9)))
    if door:
        parts.append(box((1.0, 0.12, 1.9), (0, d / 2 + 0.16, 0.95), mat("ink", rough=0.9)))
    return parts


def town_house():
    reset()
    stone = mat("stone", rough=0.9)
    parts = stone_walls(5.0, 4.4, 4.0, stone, broken=1.4, seed=3)
    # what's left of the roof: a few rafters
    for i in range(5):
        y = -1.8 + i * 0.9
        parts.append(strut((-2.6, y, 3.7), (0, y + 0.1, 5.6 - (i % 2) * 0.8), 0.1, mat("wood_dark")))
    parts.append(box((5.4, 1.5, 0.12), (0, -1.4, 4.6), mat("slate", rough=0.8), rot=(0, math.radians(35), 0)))
    o = join(parts, "TownHouse")
    finish(o, 51, wob=0.04, dist=1.0)
    silt(o, 99.0, 0.45)
    export([o], "town_house")


def town_chapel():
    reset()
    stone = mat("stone_pale", rough=0.9)
    parts = stone_walls(4.6, 7.0, 4.6, stone, seed=5)
    roof = from_profile([(-2.7, 4.5), (0.0, 7.2), (2.7, 4.5)], 7.4, mat("slate", rough=0.8))
    parts.append(roof)
    parts.append(box((1.4, 1.2, 2.0), (0, 3.4, 7.8), stone, bevel=0.06))
    parts.append(from_profile([(-0.8, 8.8), (0.0, 10.0), (0.8, 8.8)], 1.4, mat("slate"), loc=(0, 3.4, 0)))
    parts.append(lathe([(0.0, 0.0), (0.25, 0.0), (0.3, 0.3), (0.0, 0.32)], 10, "bell", mat("brass", metal=0.7)))
    parts[-1].location = (0, 3.4, 7.9)
    o = join(parts, "Chapel")
    finish(o, 53, wob=0.03, dist=1.0)
    silt(o, 99.0, 0.4)
    export([o], "town_chapel")


def town_clocktower():
    reset()
    stone = mat("stone", rough=0.9)
    parts = [box((3.2, 3.2, 9.0), (0, 0, 4.5), stone, bevel=0.1)]
    parts.append(box((3.6, 3.6, 0.5), (0, 0, 9.2), mat("stone_pale"), bevel=0.06))
    parts.append(box((3.0, 3.0, 2.4), (0, 0, 10.6), stone, bevel=0.08))
    roof = cyl(2.5, 3.2, (0, 0, 13.4), mat("verdigris", rough=0.6), r2=0.05, verts=4)
    roof.rotation_euler = (0, 0, math.pi / 4)
    parts.append(roof)
    for (rx, ry, rz) in [(0, 1, 0), (1, 0, math.pi / 2), (0, -1, math.pi), (-1, 0, -math.pi / 2)]:
        face = cyl(1.0, 0.12, (rx * 1.55, ry * 1.55, 10.6), mat("paper", rough=0.6), rot=(math.pi / 2, 0, rz), verts=20)
        parts.append(face)
        parts.append(torus(1.0, 0.07, (rx * 1.6, ry * 1.6, 10.6), mat("brass", metal=0.7), rot=(math.pi / 2, 0, rz), maj=20, mi=4))
        hand_dir = Vector((rx * 1.7, ry * 1.7, 10.6))
        parts.append(strut(hand_dir, hand_dir + Vector((0, 0, 0.75)), 0.05, mat("ink")))
        parts.append(strut(hand_dir, hand_dir + Vector((ry * 0.5, -rx * 0.5, -0.2)) * 1.0 if False else hand_dir + Vector((ry * 0.5, rx * -0.5, 0.25)), 0.05, mat("ink")))
    parts.append(box((1.2, 0.2, 2.2), (0, 1.62, 1.1), mat("ink", rough=0.9)))
    for z in (4.0, 6.5):
        parts.append(box((0.5, 0.2, 1.1), (0, 1.62, z), mat("ink", rough=0.9)))
    o = join(parts, "ClockTower")
    finish(o, 57, wob=0.03, dist=1.2)
    silt(o, 99.0, 0.4)
    export([o], "town_clocktower")


def town_arch():
    reset()
    stone = mat("stone_pale", rough=0.9)
    parts = [box((1.0, 1.0, 3.4), (-1.9, 0, 1.7), stone, bevel=0.08), box((1.0, 1.0, 3.4), (1.9, 0, 1.7), stone, bevel=0.08)]
    pts = [Vector((math.cos(a) * 1.9, 0, 3.4 + math.sin(a) * 1.4)) for a in [math.pi * k / 10 for k in range(11)]]
    parts.append(tube(pts, [0.5] * 11, stone, sides=4))
    parts.append(box((1.0, 0.6, 0.6), (0, 0, 4.95), mat("stone"), bevel=0.05))
    o = join(parts, "Arch")
    finish(o, 59, wob=0.03, dist=1.0)
    silt(o, 99.0, 0.45)
    export([o], "town_arch")


# --- The town shore ------------------------------------------------------------------------------
def pier():
    reset()
    wood = mat("wood_grey", rough=0.9)
    dark = mat("wood_dark", rough=0.9)
    parts = []
    rnd = random.Random(61)
    length = 21.0
    n = int(length / 0.42)
    for i in range(n):
        y = i * 0.42 + 0.2
        parts.append(box((3.0 + rnd.uniform(-0.1, 0.12), 0.38, 0.1), (rnd.uniform(-0.05, 0.05), y, 2.1), wood if i % 4 else mat("wood"), bevel=0.01))
    for sx in (-1.35, 1.35):
        parts.append(box((0.22, length, 0.3), (sx, length / 2, 1.9), dark))
    for i in range(8):
        y = 1.0 + i * 2.8
        for sx in (-1.4, 1.4):
            lean = rnd.uniform(-0.06, 0.06)
            parts.append(cyl(0.16, 7.5, (sx, y, -1.6), dark, rot=(lean, lean * 0.5, 0), verts=8))
            parts.append(cyl(0.17, 0.4, (sx, y, -0.2), mat("kelp_light", rough=0.9), verts=8))
        parts.append(strut((-1.4, y, 1.6), (1.4, y, 0.2), 0.07, dark))
        # railing posts
        for sx in (-1.4, 1.4):
            parts.append(box((0.12, 0.12, 1.0), (sx, y, 2.65), wood, bevel=0.02))
    for sx in (-1.4, 1.4):
        parts.append(strut((sx, 1.0, 3.1), (sx, length - 0.6, 3.1), 0.05, wood))
        parts.append(strut((sx, 1.0, 2.7), (sx, length - 0.6, 2.7), 0.035, mat("rope", rough=0.95), sides=5))
    for y in (6.0, 15.0):
        parts.append(cyl(0.06, 2.6, (1.4, y, 3.4), mat("iron", metal=0.5), verts=6))
        parts.append(sphere(0.2, (1.4, y, 4.75), mat("paint_yellow", emit=0.8, rough=0.3), segs=8, rings=6))
    for sx in (-0.9, 0.9):
        parts.append(cyl(0.16, 0.45, (sx, length - 0.4, 2.35), mat("iron", metal=0.5), verts=8))
    parts.append(torus(0.35, 0.06, (0, length - 0.5, 2.2), mat("rope"), maj=14, mi=4))
    o = join(parts, "Pier")
    finish(o, 61, wob=0.012, dist=0.8)
    export([o], "pier")


def aquarium():
    reset()
    wall = mat("paint_white", rough=0.85)
    trim = mat("paint_teal", rough=0.7)
    parts = [box((10.0, 7.0, 4.6), (0, 0, 2.3), wall, bevel=0.1)]
    parts.append(box((10.6, 7.6, 0.4), (0, 0, 0.2), mat("stone"), bevel=0.05))
    vault = from_profile([(5.25 * math.cos(math.pi * k / 16), 4.55 + 2.4 * math.sin(math.pi * k / 16)) for k in range(17)], 7.4,
                         mat("verdigris", rough=0.6), name="vault")
    parts.append(vault)
    for y in (-3.0, -1.0, 1.0, 3.0):
        rib = [Vector((5.3 * math.cos(math.pi * k / 16), y, 4.55 + 2.45 * math.sin(math.pi * k / 16))) for k in range(17)]
        parts.append(tube(rib, [0.07] * 17, mat("paint_teal", rough=0.6), sides=5))
    for x in (-3.4, 0.0, 3.4):
        parts.append(box((2.0, 0.2, 2.6), (x, 3.55, 2.2), mat("glass", rough=0.1, emit=0.25)))
        arch = cyl(1.0, 0.2, (x, 3.55, 3.5), mat("glass", rough=0.1, emit=0.25), rot=(math.pi / 2, 0, 0), verts=16)
        parts.append(arch)
        parts.append(torus(1.05, 0.1, (x, 3.62, 3.5), trim, rot=(math.pi / 2, 0, 0), maj=16, mi=4))
        for k in range(3):
            parts.append(box((0.08, 0.1, 2.6), (x - 0.6 + k * 0.6, 3.66, 2.2), trim))
    # the sign board: a painted fish over the door
    parts.append(box((5.0, 0.25, 1.1), (0, 3.7, 5.2), mat("paper", rough=0.7), bevel=0.04))
    fish = sphere(0.5, (0, 3.86, 5.2), mat("coral", rough=0.6), scale=(1.6, 0.12, 0.65), segs=14, rings=8)
    parts.append(fish)
    parts.append(from_profile([(-0.75, 0.0), (-1.2, 0.35), (-1.2, -0.35)], 0.12, mat("coral"), loc=(0, 3.86, 5.2)))
    parts.append(box((0.6, 0.12, 0.6), (0, 3.86, 4.5), mat("ink")))
    parts.append(cyl(0.08, 4.0, (4.6, 2.8, 6.5), mat("iron", metal=0.5), verts=6))
    flag = from_profile([(0.0, 0.0), (1.2, 0.3), (0.0, 0.7)], 0.02, mat("coral"), loc=(4.6, 2.8, 7.8), name="pennant")
    flag.rotation_euler = (0, 0, math.radians(-90))
    parts.append(flag)
    o = join(parts, "AquariumHouse")
    finish(o, 67, wob=0.02, dist=1.2)
    export([o], "aquarium")


def lighthouse():
    reset()
    parts = []
    tower = lathe([(0.0, 0.0), (2.0, 0.0), (1.9, 0.6), (1.45, 10.0), (1.6, 10.2), (1.6, 10.5), (0.0, 10.5)], 20, "tower", white())
    parts.append(tower)
    parts.append(lathe([(0.0, 10.5), (1.1, 10.5), (1.1, 12.0), (0.0, 12.0)], 16, "lamp", mat("glass", emit=1.5, rough=0.1)))
    parts.append(lathe([(0.0, 12.0), (1.3, 12.0), (0.6, 12.9), (0.2, 13.2), (0.0, 13.3)], 16, "cap", mat("ink", rough=0.6)))
    parts.append(torus(1.75, 0.06, (0, 0, 11.0), mat("ink"), maj=24, mi=4))
    for k in range(12):
        a = k * math.tau / 12
        parts.append(strut((math.cos(a) * 1.75, math.sin(a) * 1.75, 10.5), (math.cos(a) * 1.75, math.sin(a) * 1.75, 11.0), 0.03, mat("ink"), sides=4))
    parts.append(box((2.4, 3.0, 2.2), (2.2, 0, 1.1), mat("paint_white", rough=0.85), bevel=0.06))
    parts.append(from_profile([(0.9, 2.2), (2.2, 3.1), (3.5, 2.2)], 3.2, mat("roof_red", rough=0.8)))
    o = join(parts, "Lighthouse")
    finish(o, 71, wob=0.02, dist=1.2)
    paint(o, lambda co, n: lerpc("paint_white", "paint_red", 1.0 if (int(co.z / 1.9) % 2 == 1 and co.z < 10.0 and math.hypot(co.x, co.y) < 2.1) else 0.0))
    export([o], "lighthouse")


def house(name, wallc, roofc, seed):
    reset()
    parts = [box((5.0, 4.2, 3.0), (0, 0, 1.5), mat(wallc, rough=0.85), bevel=0.08)]
    roof = from_profile([(-2.8, 2.9), (0.0, 5.0), (2.8, 2.9)], 4.8, mat(roofc, rough=0.8))
    for v in roof.data.vertices:
        v.co.z -= 0.15 * math.sin((v.co.y / 4.8 + 0.5) * math.pi)
    parts.append(roof)
    parts.append(box((0.6, 0.6, 1.6), (1.4, -1.0, 4.6), mat("stone"), bevel=0.04))
    for x in (-1.4, 1.4):
        parts.append(box((0.8, 0.1, 0.9), (x, 2.12, 1.9), mat("glass", rough=0.1, emit=0.3)))
        parts.append(box((1.0, 0.12, 0.1), (x, 2.15, 1.4), mat("paint_white")))
    parts.append(box((0.9, 0.1, 1.8), (0, 2.12, 0.9), mat("paint_teal" if seed % 2 else "paint_red", rough=0.7)))
    o = join(parts, name)
    finish(o, seed, wob=0.02, dist=0.9)
    export([o], name)


def house_0():
    house("house_0", "paint_white", "roof_red", 81)


def house_1():
    house("house_1", "paint_yellow", "slate", 82)


# Rocks, wrecks, the lost town, the lighthouse and the cottages are built by
# buildings.py and wrecks.py now (the first versions here are kept for
# reference only).
ALL = {"kelp": kelp, "coral_brain": coral_brain, "coral_branch": coral_branch, "coral_fan": coral_fan,
       "pier": pier, "aquarium": aquarium}

if __name__ == "__main__":
    names = sys.argv[1:] or list(ALL)
    for n in names:
        ALL[n]()
