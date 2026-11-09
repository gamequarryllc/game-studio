"""The sixteen buried finds, as they pop out of the rock and spin.
Run: python3 art/blender/finds.py [name ...]   (writes models/find_<icon>.glb)

Each is about 0.3 to 0.5 m across, centred on its origin, facing +Y, in the
art bible palette. Chunky and readable from a few metres away; a little
humour in the details (the keys have a fob, the subway car has its route
board)."""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from kit import (box, cyl, sphere, torus, join, wobble, export, reset, mat, bar, lathe, place, strut, ao, smooth,  # noqa: E402
                 from_profile, subdivide)
from world_models import bake, lump  # noqa: E402
from props import tube, _prism  # noqa: E402

R90 = math.radians(90)


def finish(parts, name, d=0.12, edge=0.6):
    o = join(parts, name)
    bake(o)
    # Centre it on its bounding box.
    lo = Vector((min(v.co.x for v in o.data.vertices), min(v.co.y for v in o.data.vertices), min(v.co.z for v in o.data.vertices)))
    hi = Vector((max(v.co.x for v in o.data.vertices), max(v.co.y for v in o.data.vertices), max(v.co.z for v in o.data.vertices)))
    o.data.transform(Matrix.Translation(-(lo + hi) / 2))
    wobble(o, 0.0015, hash(name) % 97)
    ao(o, d, rays=10, edge=edge)
    return o


def keys():
    brass = mat("brass", metal=0.8, rough=0.35)
    steel = mat("bright_steel", metal=0.7, rough=0.4)
    parts = [place(torus(0.07, 0.009, (0, 0, 0), steel, (0, 0, 0), 20, 5), (0, 0, 0.1), (R90, 0, 0))]
    for k, (a, m) in enumerate([(-0.5, brass), (0.25, steel), (0.9, brass)]):
        key = []
        key.append(place(torus(0.035, 0.012, (0, 0, 0), m, (0, 0, 0), 14, 5), (0, 0, 0.0), (R90, 0, 0)))
        key.append(box((0.026, 0.012, 0.2), (0, 0, -0.13), m, bevel=0.003))
        for i in range(4):
            key.append(box((0.03 + 0.01 * (i % 2), 0.012, 0.018), (0.025, 0, -0.17 + i * 0.03), m))
        kk = join(key, "key")
        bake(kk)
        kk.data.transform(Matrix.Translation((0, 0, 0.07)))
        kk.data.transform(Matrix.Rotation(a, 4, "Y"))
        kk.data.transform(Matrix.Translation((math.sin(a) * 0.07, 0.0, 0.1 + math.cos(a) * 0.07 - 0.07)))
        parts.append(kk)
    # A red leather fob with a brass tag.
    parts.append(place(box((0.08, 0.02, 0.13), (0, 0, 0), mat("red", rough=0.7), bevel=0.012), (-0.12, 0, 0.0), (0, -0.4, 0)))
    parts.append(place(cyl(0.025, 0.01, (0, 0, 0), brass, verts=12), (-0.13, -0.012, -0.03), (R90, 0, 0)))
    return finish(parts, "Keys", 0.08)


def cassette():
    """The 1999 time capsule: a dented tin canister with a cream label band,
    a red cap, and a cassette tape taped to the side."""
    tin = mat("tin", metal=0.6, rough=0.45)
    parts = [cyl(0.11, 0.34, (0, 0, 0), tin, verts=20, bevel=0.01)]
    parts.append(cyl(0.113, 0.1, (0, 0, 0.02), mat("cream", rough=0.6), verts=20))
    parts.append(cyl(0.12, 0.05, (0, 0, 0.185), mat("red", rough=0.5), verts=20, bevel=0.01))
    parts.append(place(box((0.2, 0.03, 0.13), (0, 0, 0), mat("soot", rough=0.5), bevel=0.008), (0, 0.125, -0.06)))
    parts.append(place(box((0.15, 0.01, 0.06), (0, 0, 0), mat("cream", rough=0.5)), (0, 0.142, -0.05)))
    for s in (-1, 1):
        parts.append(place(cyl(0.017, 0.012, (0, 0, 0), mat("iron"), verts=10), (s * 0.04, 0.146, -0.05), (R90, 0, 0)))
    parts.append(place(box((0.24, 0.006, 0.03), (0, 0, 0), mat("amber", rough=0.6)), (0, 0.15, -0.0), (0, 0.15, 0)))
    o = finish(parts, "Cassette", 0.1)
    return o


def chest():
    wood = [mat("wood", rough=0.85), mat("wood_dark", rough=0.85)]
    brass = mat("brass", metal=0.8, rough=0.35)
    parts = [box((0.5, 0.32, 0.24), (0, 0, 0), wood[0], bevel=0.012)]
    for i in range(4):
        parts.append(box((0.52, 0.335, 0.012), (0, 0, -0.1 + i * 0.065), wood[1]))
    lid = cyl(0.165, 0.5, (0, 0, 0), wood[1], verts=16)
    place(lid, (0, 0, 0), (0, R90, 0))
    bm = bmesh.new()
    bm.from_mesh(lid.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.001], context="VERTS")
    bmesh.ops.contextual_create(bm, geom=[e for e in bm.edges if e.is_boundary])
    bm.to_mesh(lid.data)
    bm.free()
    lid.data.transform(Matrix.Translation((0, 0, 0.12)) @ Matrix.Scale(0.7, 4, (0, 0, 1)) @ Matrix.Scale(0.97, 4, (0, 1, 0)))
    parts.append(lid)
    for x in (-0.18, 0.18):
        parts.append(box((0.04, 0.34, 0.26), (x, 0, 0), brass, bevel=0.005))
        parts.append(place(lathe([(0.17, -0.02), (0.175, 0.0), (0.17, 0.02)], 12, "band", brass), (x, 0, 0.12), (0, R90, 0)))
    parts.append(box((0.07, 0.03, 0.09), (0, 0.17, 0.08), brass, bevel=0.008))
    parts.append(place(cyl(0.01, 0.01, (0, 0, 0), mat("soot"), verts=8), (0, 0.187, 0.075), (R90, 0, 0)))
    return finish(parts, "Chest", 0.12)


def subway():
    body = mat("cream", rough=0.5)
    red = mat("red", rough=0.5)
    soot = mat("soot", rough=0.6)
    glass = mat("glass", rough=0.2, emit=0.8)
    parts = [box((0.2, 0.56, 0.2), (0, 0, 0.03), body, bevel=0.03)]
    parts.append(box((0.205, 0.565, 0.03), (0, 0, -0.03), red))
    parts.append(lathe([(0.0, -0.28), (0.1, -0.28), (0.1, 0.28), (0.0, 0.28)], 12, "roof", body))
    bpy.context.view_layer.objects.active = parts[-1]
    place(parts[-1], (0, 0, 0.13), (R90, 0, 0))
    parts[-1].data.transform(Matrix.Scale(0.3, 4, (0, 0, 1)))
    for i in range(5):
        for s in (-1, 1):
            parts.append(box((0.01, 0.07, 0.06), (s * 0.101, -0.2 + i * 0.1, 0.07), glass))
    parts.append(box((0.12, 0.01, 0.08), (0, 0.281, 0.06), glass))
    parts.append(box((0.1, 0.01, 0.025), (0, 0.283, 0.125), mat("amber", rough=0.4, emit=1.0)))
    for y in (-0.18, 0.18):
        for s in (-1, 1):
            parts.append(place(cyl(0.035, 0.03, (0, 0, 0), soot, verts=12), (s * 0.08, y, -0.08), (0, R90, 0)))
    return finish(parts, "Subway", 0.12)


def sword():
    steel = mat("bright_steel", metal=0.7, rough=0.35)
    brass = mat("brass", metal=0.8, rough=0.35)
    leather = mat("leather_dark", rough=0.85)
    blade = from_profile([(-0.025, 0.0), (0.025, 0.0), (0.022, 0.36), (0.0, 0.42), (-0.022, 0.36)], 0.012, steel, bevel=0.003)
    parts = [blade]
    parts.append(box((0.006, 0.014, 0.3), (0, 0, 0.17), mat("iron")))
    parts.append(box((0.16, 0.035, 0.03), (0, 0, -0.01), brass, bevel=0.008))
    parts.append(cyl(0.017, 0.1, (0, 0, -0.075), leather, verts=8))
    parts.append(sphere(0.026, (0, 0, -0.14), brass, scale=(1.2, 0.8, 0.9), segs=10, rings=6))
    o = finish(parts, "Sword", 0.08)
    o.data.transform(Matrix.Rotation(0.5, 4, "Y"))
    return o


def tusk():
    m = mat("bone", rough=0.6)
    pts = []
    radii = []
    for i in range(13):
        t = i / 12
        a = t * 2.1
        pts.append((0.25 * math.sin(a), 0.0, 0.25 * (1 - math.cos(a)) - 0.05 * t))
        radii.append(0.05 * (1.0 - t) + 0.005)
    parts = [tube(pts, radii, m, res=8, name="tusk")]
    parts.append(lump(0.06, Vector((0, 0, 0)), mat("umber", rough=0.9), 5, scale=(1.1, 1.1, 0.7), sub=1))
    return finish(parts, "Tusk", 0.1)


def mosquito():
    """A drop of glowing amber with a mosquito caught in it."""
    amber = mat("amber", rough=0.15, emit=1.2)
    parts = [lump(0.12, Vector((0, 0, 0)), amber, 6, scale=(1.0, 0.8, 1.25), sub=2, rough=0.12)]
    body = mat("soot", rough=0.5)
    parts.append(place(sphere(0.02, (0, 0, 0), body, scale=(1, 1, 2.2), segs=8, rings=6), (0, 0.088, 0.0), (0.4, 0, 0)))
    parts.append(place(sphere(0.012, (0, 0, 0), body, segs=6, rings=4), (0, 0.09, 0.05)))
    for s in (-1, 1):
        parts.append(place(box((0.05, 0.004, 0.02), (0, 0, 0), mat("cream", rough=0.3)), (s * 0.03, 0.095, 0.02), (0, s * 0.4, 0)))
        for k in range(3):
            parts.append(strut((s * 0.01, 0.092, 0.01 - k * 0.015), (s * 0.05, 0.092, -0.03 - k * 0.02), 0.002, body, sides=4))
    return finish(parts, "Mosquito", 0.05, edge=0.3)


def ammonite():
    m = mat("brass", rough=0.6, metal=0.2)
    rock = mat("stone", rough=0.9)
    turns = 2.6
    steps = 60
    pts = []
    radii = []
    for i in range(steps + 1):
        t = i / steps
        a = t * turns * math.tau
        r = 0.02 + 0.17 * t
        pts.append((math.cos(a) * r, 0.0, math.sin(a) * r))
        radii.append((0.008 + 0.05 * t) * (1.0 + 0.1 * math.sin(i * 2.1)))
    parts = [tube(pts, radii, m, res=8, name="coil")]
    parts.append(place(cyl(0.21, 0.06, (0, 0, 0), rock, verts=10), (0, -0.07, -0.02), (R90, 0, 0)))
    return finish(parts, "Ammonite", 0.1)


def trex():
    """A T. rex skull: long jaw, big eye socket, a row of teeth."""
    bone_m = mat("bone", rough=0.65)
    dark = mat("soot", rough=0.8)
    parts = [lump(0.14, Vector((0, -0.08, 0.04)), bone_m, 21, scale=(0.85, 1.25, 1.0), sub=2, rough=0.12)]
    parts.append(lump(0.1, Vector((0, 0.16, -0.0)), bone_m, 22, scale=(0.7, 1.9, 0.75), sub=2, rough=0.1))
    parts.append(lump(0.08, Vector((0, 0.12, -0.11)), bone_m, 23, scale=(0.8, 2.3, 0.45), sub=2, rough=0.1))
    for s in (-1, 1):
        parts.append(place(sphere(0.045, (0, 0, 0), dark, scale=(0.5, 1.0, 1.0), segs=10, rings=6), (s * 0.1, -0.06, 0.08)))
        parts.append(place(sphere(0.03, (0, 0, 0), dark, scale=(0.5, 1.4, 0.8), segs=8, rings=5), (s * 0.075, 0.12, 0.0)))
        for k in range(6):
            parts.append(place(cyl(0.011, 0.05, (0, 0, 0), mat("cream", rough=0.4), verts=5, r2=0.001), (s * 0.06, 0.02 + k * 0.05, -0.065), (math.pi, 0, 0)))
    parts.append(place(sphere(0.022, (0, 0, 0), dark, segs=8, rings=5), (0, 0.33, 0.02)))
    return finish(parts, "TRex", 0.12)


def egg():
    """A dinosaur egg, cream with umber speckles, sitting in a nest of grit."""
    m = mat("cream", rough=0.6)
    spot = mat("umber", rough=0.7)
    o = lathe([(0.0, -0.17), (0.08, -0.155), (0.12, -0.1), (0.13, -0.02), (0.115, 0.07), (0.08, 0.14), (0.0, 0.19)], 18, "egg", m)
    parts = [o]
    rnd = random.Random(9)
    def rad(z):
        pts = [(-0.17, 0.0), (-0.155, 0.08), (-0.1, 0.12), (-0.02, 0.13), (0.07, 0.115), (0.14, 0.08), (0.19, 0.0)]
        for (z0, r0), (z1, r1) in zip(pts, pts[1:]):
            if z0 <= z <= z1:
                return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return 0.0
    for i in range(22):
        a = rnd.uniform(0, math.tau)
        z = rnd.uniform(-0.12, 0.15)
        r = rad(z)
        n = Vector((math.cos(a), math.sin(a), 0.0))
        d = place(sphere(rnd.uniform(0.012, 0.024), (0, 0, 0), spot, scale=(1, 1, 0.25), segs=8, rings=4),
                  (n.x * r, n.y * r, z), (0, R90, a))
        parts.append(d)
    parts.append(lump(0.1, Vector((0, 0, -0.17)), mat("umber", rough=0.9), 31, scale=(1.5, 1.5, 0.45), sub=1))
    return finish(parts, "Egg", 0.08)


def alien_egg():
    m = mat("verdigris", rough=0.3, emit=0.9)
    glow = mat("amber", rough=0.3, emit=2.0)
    o = lathe([(0.0, -0.17), (0.09, -0.15), (0.13, -0.08), (0.13, 0.02), (0.1, 0.12), (0.05, 0.18), (0.0, 0.2)], 16, "egg", m)
    parts = [o]
    rnd = random.Random(10)
    for i in range(16):
        a = rnd.uniform(0, math.tau)
        z = rnd.uniform(-0.1, 0.12)
        r = 0.125 * (1 - (z / 0.2) ** 2) + 0.005
        parts.append(place(sphere(0.022, (0, 0, 0), glow if i % 4 == 0 else m, segs=8, rings=5), (math.cos(a) * r, math.sin(a) * r, z)))
    parts.append(lump(0.1, Vector((0, 0, -0.17)), mat("soot", rough=0.8), 11, scale=(1.4, 1.4, 0.5), sub=1))
    return finish(parts, "AlienEgg", 0.08)


def geode():
    """A geode split open: a rough stone shell with crystals inside."""
    rock = mat("stone", rough=0.9)
    parts = [lump(0.2, Vector((0, 0, 0)), rock, 12, sub=2, rough=0.2)]
    bm = bmesh.new()
    bm.from_mesh(parts[0].data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > 0.03], context="VERTS")
    bm.to_mesh(parts[0].data)
    bm.free()
    rnd = random.Random(12)
    ms = [mat("verdigris", rough=0.15, emit=0.6), mat("cream", rough=0.15, emit=0.4)]
    for i in range(22):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0.0, 0.13)
        c = _prism(rnd.uniform(0.012, 0.025), rnd.uniform(0.05, 0.1))
        c.data.materials.append(ms[i % 2])
        place(c, (math.cos(a) * d, 0.0 - (0.13 - d) * 0.6, math.sin(a) * d), (-R90 + rnd.uniform(-0.4, 0.4), 0, rnd.uniform(-0.4, 0.4)))
        parts.append(c)
    o = finish(parts, "Geode", 0.1)
    o.data.transform(Matrix.Rotation(-0.5, 4, "X"))
    return o


def scale():
    """A dragon scale: a big curved shield of red with a dark rim, still warm."""
    red = mat("red", rough=0.35, metal=0.2)
    rim = mat("soot", rough=0.6)
    prof = [(0.0, -0.26), (0.08, -0.17), (0.15, -0.04), (0.17, 0.08), (0.12, 0.18), (0.0, 0.22), (-0.12, 0.18), (-0.17, 0.08), (-0.15, -0.04), (-0.08, -0.17)]
    s = from_profile(prof, 0.03, red, bevel=0.01, name="scale")
    subdivide(s, 2)
    bake(s)
    for v in s.data.vertices:
        v.co.y -= 0.9 * (v.co.x ** 2) + 0.3 * (v.co.z ** 2)
    parts = [s]
    for i in range(5):
        z = -0.14 + i * 0.075
        w = 0.22 - abs(z) * 0.6
        parts.append(place(box((w, 0.012, 0.014), (0, 0, 0), mat("glow_red", rough=0.4, emit=1.2)), (0, 0.022 - 0.3 * z * z, z)))
    parts.append(tube([(0.0, 0.03, -0.22), (0.0, 0.03 - 0.3 * 0.0, 0.0), (0.0, 0.02, 0.2)], [0.014, 0.012, 0.004], rim, name="ridge"))
    return finish(parts, "Scale", 0.08)


def crown():
    brass = mat("amber", metal=0.7, rough=0.3)
    red = mat("red", rough=0.2)
    green = mat("verdigris", rough=0.2)
    band = lathe([(0.15, 0.0), (0.155, 0.01), (0.155, 0.07), (0.15, 0.08), (0.14, 0.08), (0.14, 0.0)], 24, "band", brass)
    parts = [band]
    for k in range(6):
        a = k / 6 * math.tau
        tip = cyl(0.04, 0.12, (0, 0, 0), brass, verts=4, r2=0.0)
        place(tip, (math.cos(a) * 0.148, math.sin(a) * 0.148, 0.135), (0, 0, a + math.radians(45)))
        parts.append(tip)
        parts.append(place(sphere(0.014, (0, 0, 0), brass, segs=8, rings=5), (math.cos(a) * 0.148, math.sin(a) * 0.148, 0.2)))
        parts.append(place(sphere(0.018, (0, 0, 0), red if k % 2 else green, scale=(0.7, 1, 1), segs=8, rings=6), (math.cos(a + 0.52) * 0.158, math.sin(a + 0.52) * 0.158, 0.04), (0, 0, a + 0.52)))
    # A tiny mole-sized lining.
    parts.append(lathe([(0.14, 0.0), (0.14, 0.06), (0.0, 0.1)], 16, "cap", mat("red", rough=0.9)))
    return finish(parts, "Crown", 0.1)


def satellite():
    foil = mat("brass", metal=0.7, rough=0.3)
    panel = mat("soot", rough=0.35, metal=0.3)
    grid = mat("verdigris", rough=0.3)
    parts = [box((0.16, 0.16, 0.2), (0, 0, 0), foil, bevel=0.012)]
    for s in (-1, 1):
        parts.append(strut((s * 0.08, 0, 0), (s * 0.13, 0, 0), 0.008, mat("iron"), sides=4))
        parts.append(box((0.2, 0.01, 0.14), (s * 0.24, 0, 0), panel, bevel=0.004))
        for i in range(3):
            parts.append(box((0.003, 0.012, 0.13), (s * (0.17 + i * 0.07), 0, 0), grid))
    parts.append(place(lathe([(0.0, 0.0), (0.07, 0.03), (0.075, 0.035), (0.0, 0.012)], 14, "dish", mat("cream", rough=0.4)), (0, 0, 0.12)))
    parts.append(strut((0, 0, 0.13), (0, 0, 0.2), 0.004, mat("iron"), sides=4))
    parts.append(place(sphere(0.012, (0, 0, 0), mat("red", rough=0.3, emit=1.5), segs=8, rings=5), (0, 0, 0.205)))
    o = finish(parts, "Satellite", 0.1)
    o.data.transform(Matrix.Rotation(0.4, 4, "Y") @ Matrix.Rotation(-0.3, 4, "X"))
    return o


def core():
    """The core itself: a faceted ball of molten gold with glowing seams."""
    hot = mat("amber", rough=0.25, emit=2.5)
    seam = mat("cream", rough=0.2, emit=4.0)
    parts = [lump(0.3, Vector((0, 0, 0)), hot, 30, sub=2, rough=0.08)]
    rnd = random.Random(30)
    for i in range(8):
        a = rnd.uniform(0, math.tau)
        z = rnd.uniform(-0.25, 0.25)
        r = math.sqrt(max(0.0, 0.3 ** 2 - z * z)) + 0.005
        parts.append(place(sphere(0.04, (0, 0, 0), seam, scale=(1.5, 1.5, 0.4), segs=8, rings=5), (math.cos(a) * r, math.sin(a) * r, z)))
    return finish(parts, "Core", 0.2, edge=0.3)


FINDS = [("keys", keys), ("cassette", cassette), ("chest", chest), ("subway", subway), ("sword", sword), ("tusk", tusk),
         ("mosquito", mosquito), ("ammonite", ammonite), ("trex", trex), ("egg", egg), ("alien_egg", alien_egg),
         ("geode", geode), ("scale", scale), ("crown", crown), ("satellite", satellite), ("core", core)]

if __name__ == "__main__":
    only = sys.argv[1:]
    for name, fn in FINDS:
        if only and name not in only:
            continue
        reset()
        o = fn()
        export([o], "find_" + name)
