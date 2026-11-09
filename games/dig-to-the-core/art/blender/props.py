"""Things in the rock: the small pieces scattered over every dug wall (pebbles,
ore nuggets, and one kind of decor per layer) and each layer's landmark.
Run: python3 art/blender/props.py [name ...]

The scattered pieces are drawn many times over (MultiMesh), so they are low
poly and neutral in colour: the game tints each copy (the rock's colour for a
pebble, the ore's colour for a nugget). Their origin is where they meet the
rock; +Z points out of the wall. Landmarks are drawn once each and carry their
own palette colours."""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector, noise  # noqa: E402
from kit import (box, cyl, sphere, torus, join, wobble, export, reset, mat, bar, lathe, place, strut, ao, smooth)  # noqa: E402
from world_models import bake, lump  # noqa: E402

R90 = math.radians(90)


def tube(points, radii, m, res=6, name="tube"):
    """A smooth tube through points, its radius tapering per point."""
    cd = bpy.data.curves.new(name, "CURVE")
    cd.dimensions = "3D"
    cd.bevel_depth = 1.0
    cd.bevel_resolution = max(1, res // 4)
    cd.resolution_u = 3
    cd.use_fill_caps = True
    sp = cd.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for i, (p, r) in enumerate(zip(points, radii)):
        sp.points[i].co = (p[0], p[1], p[2], 1.0)
        sp.points[i].radius = r
    ob = bpy.data.objects.new(name, cd)
    bpy.context.collection.objects.link(ob)
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.active_object
    o.data.materials.clear()
    o.data.materials.append(m)
    return o


def pebble():
    """Three half-buried stones of different sizes in one cluster."""
    m = mat("cream", rough=0.9)
    parts = [lump(0.05, Vector((0, 0, 0.005)), m, 1, scale=(1.2, 0.9, 0.62), sub=1, rough=0.3),
             lump(0.032, Vector((0.07, 0.03, 0.0)), m, 2, scale=(1.0, 1.1, 0.7), sub=1, rough=0.3),
             lump(0.022, Vector((-0.05, 0.05, 0.0)), m, 3, scale=(1.1, 0.9, 0.7), sub=1, rough=0.35)]
    o = join(parts, "Pebble")
    bake(o)
    ao(o, 0.05, rays=8, strength=0.5)
    return o


def nugget():
    """An ore nugget breaking out of the wall: a fat chunk and two smaller
    shards, faceted so the headlamp catches the faces."""
    m = mat("cream", rough=0.4, metal=0.3)
    parts = [lump(0.06, Vector((0, 0, 0.02)), m, 4, scale=(1.0, 0.85, 1.25), sub=1, rough=0.35),
             lump(0.035, Vector((0.055, -0.02, 0.0)), m, 5, scale=(0.8, 0.8, 1.6), sub=1, rough=0.3),
             lump(0.03, Vector((-0.045, 0.035, 0.0)), m, 6, scale=(0.9, 0.9, 1.4), sub=1, rough=0.3)]
    o = join(parts, "Nugget")
    bake(o)
    ao(o, 0.05, rays=8, strength=0.45)
    return o


def _prism(r, length, sides=6, tip=0.35):
    """A crystal: a hexagonal prism with a pointed tip, along +Z from the origin."""
    prof = [(0.0, -0.02), (r * 0.9, -0.02), (r, 0.0), (r, length * (1 - tip)), (0.0, length)]
    return lathe(prof, sides, "prism")


def crystal_small():
    """A cluster of five crystals fanning out of the rock (Crystal Caves decor)."""
    m = mat("cream", rough=0.15, metal=0.1)
    rnd = random.Random(31)
    parts = []
    for i in range(5):
        r = rnd.uniform(0.018, 0.035)
        L = rnd.uniform(0.09, 0.2)
        c = _prism(r, L)
        c.data.materials.append(m)
        a = i / 5 * math.tau + rnd.uniform(-0.3, 0.3)
        tilt = rnd.uniform(0.2, 0.6) if i else 0.05
        place(c, (math.cos(a) * 0.02, math.sin(a) * 0.02, -0.01), (math.cos(a + R90) * tilt, math.sin(a + R90) * tilt, rnd.uniform(0, 1)))
        parts.append(c)
    o = join(parts, "CrystalSmall")
    bake(o)
    ao(o, 0.06, rays=8, strength=0.4)
    return o


def root():
    """Tree roots hanging out of the topsoil: three tapering, wandering strands."""
    m = mat("cream", rough=0.9)
    rnd = random.Random(32)
    parts = []
    for k in range(3):
        pts = []
        p = Vector((rnd.uniform(-0.04, 0.04), rnd.uniform(-0.04, 0.04), -0.02))
        d = Vector((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), 1.0)).normalized()
        for i in range(9):
            pts.append(p.copy())
            d = (d + Vector((rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), 0.0)) * 0.35).normalized()
            p = p + d * rnd.uniform(0.035, 0.06)
        radii = [0.016 * (1.0 - i / 9) + 0.002 for i in range(9)]
        parts.append(tube(pts, radii, m, name="strand"))
    o = join(parts, "Root")
    bake(o)
    ao(o, 0.05, rays=6, strength=0.4)
    return o


def bone():
    """A fossil rib sticking out of the rock (Fossil Bed and Graveyard decor):
    a curved, tapering bone with a knobbed head."""
    m = mat("cream", rough=0.7)
    pts = []
    radii = []
    n = 10
    for i in range(n + 1):
        t = i / n
        a = t * 1.5
        pts.append((0.24 * (1 - math.cos(a)), 0.0, 0.24 * math.sin(a)))
        radii.append(0.02 * (1.0 - 0.65 * t) + 0.006 + 0.008 * math.exp(-t * 10))
    parts = [tube(pts, radii, m, name="rib")]
    parts.append(sphere(0.03, (0, 0, 0), m, scale=(1.3, 1.0, 0.9), segs=8, rings=5))
    o = join(parts, "Bone")
    bake(o)
    ao(o, 0.05, rays=6, strength=0.4)
    return o


def shell():
    """A small ammonite in the wall (Fossil Bed decor): a coiled, ribbed tube."""
    m = mat("cream", rough=0.7)
    turns = 2.7
    steps = 56
    pts = []
    radii = []
    for i in range(steps + 1):
        t = i / steps
        a = t * turns * math.tau
        r = 0.006 + 0.062 * t
        pts.append((math.cos(a) * r, 0.0, math.sin(a) * r))
        radii.append((0.003 + 0.015 * t) * (1.0 + 0.15 * math.sin(i * 1.9)))
    o = tube(pts, radii, m, res=8, name="Shell")
    bake(o)
    o.data.transform(Matrix.Rotation(R90, 4, "X"))
    ao(o, 0.04, rays=6, strength=0.4)
    return o


def magma_vent():
    """A crusted basalt blister with a glowing split (Lava Lakes and Mantle decor)."""
    crust = mat("soot", rough=0.85)
    glow = mat("glow_red", rough=0.4, emit=3.5)
    parts = [lump(0.09, Vector((0, 0, 0.01)), crust, 7, scale=(1.3, 1.0, 0.55), sub=1, rough=0.35)]
    parts.append(lump(0.05, Vector((0.01, 0, 0.04)), glow, 8, scale=(1.4, 0.4, 0.6), sub=1, rough=0.25))
    o = join(parts, "MagmaVent")
    bake(o)
    ao(o, 0.05, rays=6, strength=0.4)
    return o


# --- Landmarks (one per layer, placed in the game) ------------------------------------------------
def ribcage():
    """A dinosaur's spine and ribs, half out of the floor (Dinosaur Graveyard)."""
    b = mat("bone", rough=0.7)
    dark = mat("umber", rough=0.8)
    parts = []
    L = 3.2
    for i in range(14):
        t = i / 13
        y = -L / 2 + t * L
        z = 0.9 + 0.25 * math.sin(t * math.pi)
        parts.append(box((0.2, 0.17, 0.16), (0, y, z), b, bevel=0.03))
        parts.append(box((0.05, 0.08, 0.16), (0, y, z + 0.13), b, bevel=0.015))
    for i in range(8):
        t = 0.12 + i / 8 * 0.76
        y = -L / 2 + t * L
        z0 = 0.9 + 0.25 * math.sin(t * math.pi)
        sz = 1.0 - abs(t - 0.45) * 0.9
        for s in (-1, 1):
            prev = Vector((s * 0.1, y, z0))
            for k in range(1, 8):
                a = k / 7 * 2.1
                p = Vector((s * (0.1 + math.sin(a) * 0.85 * sz), y + 0.04 * k, z0 + (math.cos(a) - 1) * 0.6 * sz))
                parts.append(strut(prev, p, 0.05 * (1 - k / 9), b, sides=6))
                prev = p
    parts.append(lump(0.6, Vector((0, L / 2 + 0.3, 0.5)), b, 12, scale=(0.7, 1.3, 0.6), sub=2, rough=0.2))
    parts.append(lump(0.25, Vector((0.0, L / 2 + 0.75, 0.38)), dark, 13, scale=(1.2, 0.6, 0.5), sub=1, rough=0.2))
    o = join(parts, "Ribcage")
    bake(o)
    wobble(o, 0.01, 81)
    ao(o, 0.6, rays=10, strength=0.7)
    return o


def crystal_big():
    """A cave cluster of tall crystals, verdigris and cream (Crystal Caves)."""
    ms = [mat("verdigris", rough=0.15, emit=0.5), mat("cream", rough=0.15, emit=0.3), mat("verdigris", rough=0.2, emit=0.8)]
    rnd = random.Random(33)
    parts = [lump(0.7, Vector((0, 0, -0.25)), mat("soot", rough=0.9), 14, scale=(1.3, 1.1, 0.6), sub=2, rough=0.3)]
    for i in range(13):
        r = rnd.uniform(0.07, 0.17)
        L = rnd.uniform(0.5, 1.6) * (1.3 if i < 3 else 1.0)
        c = _prism(r, L)
        c.data.materials.append(ms[i % 3])
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0.0, 0.55)
        tilt = 0.1 + d * 0.9
        place(c, (math.cos(a) * d, math.sin(a) * d, 0.0), (math.cos(a + R90) * tilt * -1, math.sin(a + R90) * tilt * -1, rnd.uniform(0, 1)))
        parts.append(c)
    o = join(parts, "CrystalBig")
    bake(o)
    ao(o, 0.5, rays=10, strength=0.6)
    return o


def lava_pool():
    """A pool of lava in a crust of basalt (Lava Lakes): the light in the game
    sits over it."""
    crust = mat("soot", rough=0.85)
    glow = mat("glow_red", rough=0.3, emit=4.0)
    hot = mat("amber", rough=0.3, emit=5.0)
    rnd = random.Random(34)
    parts = []
    me = bpy.data.meshes.new("pool")
    bm = bmesh.new()
    c = bm.verts.new((0, 0, 0.05))
    ring = []
    for i in range(24):
        a = i / 24 * math.tau
        r = 1.2 * (1.0 + 0.18 * math.sin(a * 3 + 1.0) + 0.1 * math.sin(a * 5))
        ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r * 0.8, 0.05)))
    for i in range(24):
        bm.faces.new((c, ring[i], ring[(i + 1) % 24]))
    bm.to_mesh(me)
    bm.free()
    pool = bpy.data.objects.new("pool", me)
    bpy.context.collection.objects.link(pool)
    pool.data.materials.append(glow)
    parts.append(pool)
    for i in range(18):
        a = i / 18 * math.tau
        r = 1.25 * (1.0 + 0.18 * math.sin(a * 3 + 1.0) + 0.1 * math.sin(a * 5))
        parts.append(lump(rnd.uniform(0.18, 0.32), Vector((math.cos(a) * r, math.sin(a) * r * 0.8, 0.02)), crust, 40 + i, scale=(1.3, 1.0, 0.6), sub=1, rough=0.3))
    for i in range(5):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(0.1, 0.7)
        parts.append(lump(rnd.uniform(0.1, 0.18), Vector((math.cos(a) * r, math.sin(a) * r * 0.8, 0.06)), crust, 60 + i, scale=(1.4, 1.1, 0.35), sub=1, rough=0.25))
    parts.append(lump(0.25, Vector((0.2, -0.1, 0.06)), hot, 70, scale=(1.6, 1.0, 0.15), sub=1, rough=0.2))
    o = join(parts, "LavaPool")
    bake(o)
    ao(o, 0.4, rays=8, strength=0.5)
    return o


def basalt():
    """Basalt columns pushing up through the floor (the Mantle)."""
    rock = [mat("soot", rough=0.85), mat("iron", rough=0.8)]
    glow = mat("glow_red", rough=0.4, emit=3.0)
    rnd = random.Random(35)
    parts = []
    for i in range(16):
        a = i * 2.39996
        d = 0.32 * math.sqrt(i + 0.5)
        h = rnd.uniform(0.4, 2.0) * (1.0 - d / 2.0)
        c = cyl(0.17, h, (0, 0, h / 2), rock[i % 2], verts=6)
        c.rotation_euler = (rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), rnd.uniform(0, 1))
        c.location = (math.cos(a) * d, math.sin(a) * d, h / 2)
        bake(c)
        parts.append(c)
        if i % 4 == 1:
            parts.append(cyl(0.12, 0.03, (math.cos(a) * d, math.sin(a) * d, h + 0.01), glow, verts=6))
    o = join(parts, "Basalt")
    bake(o)
    ao(o, 0.4, rays=8, strength=0.6)
    return o


def old_timbers():
    """An older miner's shoring, long abandoned, found in the clay: two posts
    and a cap with a rusted lamp hook (Clay)."""
    old = mat("wood_grey", rough=0.92)
    dark = mat("wood_dark", rough=0.92)
    parts = [strut((-0.9, 0, 0), (-0.8, 0.05, 1.9), 0.11, old), strut((0.9, 0, 0), (0.85, -0.05, 1.85), 0.11, dark),
             strut((-1.15, 0, 1.95), (1.1, 0, 1.9), 0.12, old)]
    parts.append(place(torus(0.05, 0.01, (0, 0, 0), mat("iron", metal=0.4), (0, 0, 0), 8, 4), (0.2, 0, 1.75), (R90, 0, 0)))
    # An old miner's lantern still hanging from the hook, burning low.
    parts.append(box((0.13, 0.13, 0.18), (0.2, 0, 1.55), mat("glass", rough=0.3, emit=1.2), bevel=0.012))
    parts.append(box((0.16, 0.16, 0.025), (0.2, 0, 1.66), mat("soot")))
    parts.append(box((0.16, 0.16, 0.025), (0.2, 0, 1.45), mat("soot")))
    parts.append(box((0.3, 0.06, 0.25), (-0.3, -0.12, 0.12), dark, rot=(0, 0.4, 0.2), bevel=0.02))
    o = join(parts, "OldTimbers")
    bake(o)
    wobble(o, 0.01, 82)
    ao(o, 0.3, rays=8)
    return o


def mine_cart():
    """A rusted mine cart on a scrap of rail, lost in the bedrock (Bedrock)."""
    iron = mat("iron", metal=0.5, rough=0.7)
    rust = mat("umber", metal=0.3, rough=0.8)
    parts = []
    body = lathe([(0.0, 0.0), (0.45, 0.0), (0.55, 0.5), (0.0, 0.5)], 4, "tub", rust)
    place(body, (0, 0, 0.25), (0, 0, math.radians(45)))
    body.data.transform(Matrix.Scale(1.4, 4, (0, 1, 0)))
    parts.append(body)
    parts.append(box((0.82, 1.1, 0.06), (0, 0, 0.75), iron, bevel=0.02))
    for s in (-1, 1):
        for y in (-0.35, 0.35):
            parts.append(place(cyl(0.14, 0.05, (0, 0, 0), iron, verts=12), (s * 0.36, y, 0.16), (0, R90, 0)))
        parts.append(box((0.05, 2.2, 0.06), (s * 0.36, 0, 0.02), iron, bevel=0.01))
    for y in (-0.8, -0.3, 0.2, 0.7):
        parts.append(box((1.0, 0.14, 0.06), (0, y, -0.03), mat("wood_dark", rough=0.9), bevel=0.01))
    # A miner's carbide lamp left on the rim.
    parts.append(cyl(0.04, 0.1, (0.3, 0.45, 0.83), mat("brass", metal=0.7, rough=0.4), verts=10))
    parts.append(place(sphere(0.03, (0, 0, 0), mat("glass", rough=0.3, emit=1.5), segs=8, rings=5), (0.3, 0.5, 0.9)))
    o = join(parts, "MineCart")
    bake(o)
    o.data.transform(Matrix.Rotation(0.12, 4, "Y"))
    wobble(o, 0.008, 83)
    ao(o, 0.3, rays=8)
    return o


def core_spires():
    """Cream-gold crystal spires that light the inner core (Inner Core)."""
    ms = [mat("amber", rough=0.3, emit=0.35), mat("cream", rough=0.25, emit=0.2)]
    rnd = random.Random(36)
    parts = []
    for i in range(9):
        r = rnd.uniform(0.12, 0.25)
        L = rnd.uniform(1.0, 2.4)
        c = _prism(r, L, sides=5, tip=0.45)
        c.data.materials.append(ms[i % 2])
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0.0, 0.7)
        tilt = d * 0.5
        place(c, (math.cos(a) * d, math.sin(a) * d, 0.0), (-math.sin(a) * tilt, math.cos(a) * tilt, rnd.uniform(0, 1)))
        parts.append(c)
    o = join(parts, "CoreSpires")
    bake(o)
    ao(o, 0.4, rays=8, strength=0.5)
    return o


PROPS = [("pebble", pebble), ("nugget", nugget), ("crystal_small", crystal_small), ("root", root), ("bone", bone),
         ("shell", shell), ("magma_vent", magma_vent), ("ribcage", ribcage), ("crystal_big", crystal_big),
         ("lava_pool", lava_pool), ("basalt", basalt), ("old_timbers", old_timbers), ("mine_cart", mine_cart),
         ("core_spires", core_spires)]

if __name__ == "__main__":
    only = sys.argv[1:]
    for name, fn in PROPS:
        if only and name not in only:
            continue
        reset()
        o = fn()
        export([o], name)
