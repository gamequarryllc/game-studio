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
from kit import (box, cyl, sphere, torus, join, wobble, export, reset, mat, bar, lathe, place, strut, ao, smooth,  # noqa: E402
                 from_profile, subdivide, white_col, apply_mods)
from kit import tube as ktube  # noqa: E402
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


def sink_shade(o, r, dark=0.38):
    """Multiplies the baked colour so the part of a piece under the rock line
    (z < 0) is in deep shadow, with a dark contact ring where it meets the
    rock: the piece reads as half buried, not stuck on."""
    me = o.data
    col = me.color_attributes["Col"]
    for poly in me.polygons:
        for li in poly.loop_indices:
            z = me.vertices[me.loops[li].vertex_index].co.z
            t = max(0.0, min(1.0, (z + 0.15 * r) / (0.75 * r)))
            k = dark + (1.0 - dark) * (t * t * (3 - 2 * t))
            c = col.data[li].color
            col.data[li].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)


def pebble():
    """A little nest of smooth, flattened stones (river-worn), half sunk in
    the rock: four sizes, each turned its own way, dark where they go in."""
    m = mat("cream", rough=0.85)
    rnd = random.Random(41)
    specs = [(0.06, (0.0, 0.0), (1.3, 0.95, 0.62)), (0.042, (0.088, 0.038), (1.15, 0.9, 0.66)),
             (0.03, (-0.064, 0.058), (1.0, 1.25, 0.7)), (0.022, (-0.03, -0.074), (1.1, 1.0, 0.8)),
             (0.016, (0.05, -0.06), (1.0, 1.0, 0.85))]
    parts = []
    for k, (r, (x, y), sc) in enumerate(specs):
        o = lump(r, Vector((0, 0, 0)), m, 11 + k, scale=sc, sub=2, rough=0.1)
        place(o, (x, y, -r * 0.18), (rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), rnd.uniform(0, math.tau)))
        parts.append(o)
    o = join(parts, "Pebble")
    bake(o)
    smooth(o, 85)
    ao(o, 0.05, rays=10, strength=0.55, edge=0.3)
    sink_shade(o, 0.05)
    return o


def rubble():
    """Angular chips of broken stone (Bedrock): sharp facets, one standing on
    its edge, sunk into the floor."""
    m = mat("cream", rough=0.8)
    rnd = random.Random(43)
    parts = []
    for k, (r, x, y) in enumerate([(0.07, 0, 0), (0.045, 0.1, 0.03), (0.035, -0.07, 0.06), (0.028, 0.02, -0.08), (0.02, -0.05, -0.05)]):
        o = lump(r, Vector((0, 0, 0)), m, 21 + k, scale=(1.3, 0.8, 0.7), sub=1, rough=0.5)
        place(o, (x, y, -r * 0.2), (rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), rnd.uniform(0, math.tau)))
        parts.append(o)
    o = join(parts, "Rubble")
    bake(o)
    ao(o, 0.05, rays=10, strength=0.55, edge=0.8)
    sink_shade(o, 0.06)
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


def quartz(r, length, sides=6, tip=0.32, taper=0.88, seed=0, double=False):
    """One quartz point along +Z from the origin: a six-sided prism a little
    narrower at the top, faces of slightly different widths, ending in a
    six-faced pyramid (both ends when it grew loose)."""
    rnd = random.Random(seed)
    radii = [r * rnd.uniform(0.82, 1.12) for _ in range(sides)]
    me = bpy.data.meshes.new("quartz")
    bm = bmesh.new()
    z_b = 0.0 if not double else length * tip * 0.6
    z_t = length * (1.0 - tip)
    def ring(z, k):
        return [bm.verts.new((math.cos(i / sides * math.tau) * radii[i] * k, math.sin(i / sides * math.tau) * radii[i] * k, z)) for i in range(sides)]
    bottom = ring(-0.03 if not double else z_b, 1.0)
    top = ring(z_t, taper)
    apex = bm.verts.new((rnd.uniform(-0.15, 0.15) * r, rnd.uniform(-0.15, 0.15) * r, length))
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
        bm.faces.new((top[i], top[j], apex))
    if double:
        apex2 = bm.verts.new((0, 0, 0))
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new((bottom[j], bottom[i], apex2))
    else:
        bm.faces.new(list(reversed(bottom)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("quartz", me)
    bpy.context.collection.objects.link(o)
    return o


def crystal_small():
    """A cluster of quartz points breaking out of the wall (Crystal Caves and
    the core): one tall leader, the rest shorter and splayed, a broken stub,
    dark at the root."""
    m = mat("cream", rough=0.15, metal=0.1)
    rnd = random.Random(31)
    parts = []
    specs = [(0.03, 0.26, 0.05), (0.022, 0.17, 0.45), (0.02, 0.14, 0.55), (0.016, 0.11, 0.7), (0.026, 0.07, 0.35), (0.012, 0.08, 0.8)]
    for i, (r, L, tilt) in enumerate(specs):
        c = quartz(r, L, seed=300 + i, tip=0.3 if i != 4 else 0.05)
        c.data.materials.append(m)
        a = i / len(specs) * math.tau + rnd.uniform(-0.4, 0.4)
        place(c, (math.cos(a) * 0.025 * (i > 0), math.sin(a) * 0.025 * (i > 0), -0.015),
              (math.cos(a + R90) * tilt, math.sin(a + R90) * tilt, rnd.uniform(0, 1)))
        parts.append(c)
    o = join(parts, "CrystalSmall")
    bake(o)
    ao(o, 0.06, rays=8, strength=0.45, edge=0.5)
    sink_shade(o, 0.08, 0.3)
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


def snapped(o, near, axis, r, seed):
    """Jags the end of a bone at `near` (a point) along `axis`: the vertices
    there pushed back and forth, a clean break gone ragged."""
    rnd = random.Random(seed)
    ax = Vector(axis).normalized()
    for v in o.data.vertices:
        d = (v.co - Vector(near))
        if d.length < r * 1.6:
            v.co -= ax * rnd.uniform(0.0, r * 0.9)


def bone():
    """Fossil bone weathering out of the wall (Fossil Bed and Graveyard
    decor): a snapped length of rib, flat in section, and a worn vertebra
    beside it, both sunk in."""
    m = mat("cream", rough=0.75)
    pts = []
    radii = []
    n = 9
    for i in range(n + 1):
        t = i / n
        a = t * 1.25
        pts.append(Vector((0.26 * (1 - math.cos(a)) - 0.05, 0.0, 0.22 * math.sin(a) - 0.04)))
        radii.append(0.021 * (1.0 - 0.45 * t) + 0.008 * math.exp(-t * 8))
    rib = ktube(pts, radii, m, sides=7, flat=0.62, name="rib")
    snapped(rib, pts[-1], (pts[-1] - pts[-2]), radii[-1], 5)
    parts = [rib]
    v = lathe([(0.0, -0.035), (0.024, -0.035), (0.03, -0.028), (0.022, 0.0), (0.03, 0.028), (0.024, 0.035), (0.0, 0.035)], 9, "vert", m)
    place(v, (0.06, 0.07, 0.0), (R90, 0.3, 0.4))
    parts.append(v)
    spine = strut((0.06, 0.07, 0.02), (0.05, 0.1, 0.07), 0.009, m, sides=5)
    parts.append(spine)
    o = join(parts, "Bone")
    bake(o)
    wobble(o, 0.002, 9)
    smooth(o, 60)
    ao(o, 0.05, rays=8, strength=0.5, edge=0.6)
    sink_shade(o, 0.05)
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
# Material names matter here: the game swaps in its own shaders by name
# (DigField.dress_landmark): "melt..." glowing lava or molten metal,
# "crystal_..." the faceted crystal shader, "corehot" the white-hot core.

def grain(o, axis, strength=0.22, scale=26.0, seed=1):
    """Wood grain baked into the vertex colour: long streaks along `axis`
    (fine lines and a few darker knots), on top of the AO already there."""
    me = o.data
    white_col([o])
    col = me.color_attributes["Col"]
    ax = Vector(axis).normalized()
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for poly in me.polygons:
        for li in poly.loop_indices:
            p = me.vertices[me.loops[li].vertex_index].co
            along = p.dot(ax)
            across = p - ax * along
            n = noise.noise(across * scale + off + ax * along * 1.2)
            lines = 0.5 + 0.5 * math.sin((across.length * scale * 2.2) + n * 3.0)
            knot = max(0.0, noise.noise(p * 3.0 + off) - 0.45) * 2.0
            k = 1.0 - strength * (0.6 * lines + 0.8 * knot)
            c = col.data[li].color
            col.data[li].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)


def beam(a, b, w, h, m, seed, cuts=8, split=0.0):
    """A squared, hand-hewn timber from a to b: chamfered, a little uneven
    along its length, grain baked in. split > 0 opens a check down one face."""
    a = Vector(a)
    b = Vector(b)
    d = b - a
    L = d.length
    o = box((w, L, h), (0, L / 2, 0), m, bevel=min(w, h) * 0.12, segs=1)
    bake(o)
    subdivide(o, cuts)
    rnd = random.Random(seed)
    for v in o.data.vertices:
        t = v.co.y / L
        sw = 1.0 + 0.05 * math.sin(t * 7 + seed) + rnd.uniform(-0.01, 0.01)
        v.co.x *= sw
        v.co.z *= 1.0 + 0.04 * math.sin(t * 5 + seed * 2)
        if split > 0 and v.co.z > h * 0.45 and abs(v.co.x) < w * 0.12 and 0.2 < t < 0.75:
            v.co.z -= split
    q = Vector((0, 1, 0)).rotation_difference(d.normalized())
    mm = q.to_matrix().to_4x4()
    mm.translation = a
    o.data.transform(mm)
    return o


def old_timbers():
    """An old miner's timber set, long abandoned in the clay (Clay): two
    splayed posts on foot blocks, a cap beam lapped over them and driven tight
    with wedges, lagging boards laid back over the cap, one post bowed and
    split under the load, an iron dog spike, and the lantern still on its
    hook, burning low."""
    old = mat("wood_grey", rough=0.92)
    dark = mat("wood_dark", rough=0.92)
    iron = mat("iron", metal=0.5, rough=0.6)
    rnd = random.Random(82)
    parts = []
    h = 2.05
    # Posts, battered out at the foot (they lean in at the top).
    pl = beam((-0.98, 0.0, 0.0), (-0.84, 0.03, h), 0.22, 0.22, old, 1, cuts=10)
    pr = beam((1.0, 0.02, 0.0), (0.86, -0.02, h - 0.04), 0.21, 0.21, dark, 2, cuts=10, split=0.025)
    # The right post bows under the cap.
    for v in pr.data.vertices:
        t = max(0.0, min(1.0, v.co.z / h))
        v.co.x += 0.07 * math.sin(t * math.pi)
    for o, at in ((pl, (-0.98, 0.0)), (pr, (1.0, 0.02))):
        grain(o, (0, 0, 1), 0.25, 30, rnd.randint(1, 99))
        parts.append(o)
        fb = box((0.36, 0.34, 0.12), (at[0], at[1], 0.03), dark, bevel=0.02)
        parts.append(fb)
    # The cap: heavier, lapped over both posts, its ends past them.
    cap = beam((-1.28, 0.0, h + 0.13), (1.25, 0.0, h + 0.1), 0.26, 0.24, old, 3, cuts=12)
    grain(cap, (1, 0, 0), 0.25, 30, 7)
    parts.append(cap)
    # Wedges driven between cap and post tops, and a block shim.
    for (x, s) in ((-0.84, -1), (0.9, 1)):
        for k in (-1, 1):
            wdg = from_profile([(-0.09, 0.0), (0.09, 0.0), (0.09, 0.035), (-0.09, 0.012)], 0.12, dark, bevel=0.004)
            place(wdg, (x + k * 0.06, k * 0.08, h - 0.01), (0, 0, rnd.uniform(-0.15, 0.15) + (0 if k > 0 else math.pi)))
            parts.append(wdg)
    # Lagging: boards laid from the cap back into the rock, uneven, one cracked.
    for i in range(7):
        x = -1.05 + i * 0.34 + rnd.uniform(-0.03, 0.03)
        L = rnd.uniform(0.9, 1.3)
        bd = beam((x + rnd.uniform(-0.04, 0.04), -L, h + 0.29 + rnd.uniform(-0.02, 0.03)), (x, 0.12, h + 0.27),
                  rnd.uniform(0.2, 0.28), 0.045, old if i % 2 else dark, 10 + i, cuts=4)
        grain(bd, (0, 1, 0), 0.3, 40, 20 + i)
        parts.append(bd)
    # A dog spike and an iron strap on the left joint.
    parts.append(strut((-0.84, 0.13, h - 0.05), (-0.84, 0.13, h + 0.2), 0.012, iron, sides=4))
    parts.append(box((0.05, 0.26, 0.3), (-0.84, 0.0, h + 0.02), iron, bevel=0.005))
    # The lantern on its hook under the cap.
    parts.append(place(torus(0.045, 0.009, (0, 0, 0), iron, (0, 0, 0), 8, 4), (0.25, 0.0, h - 0.04), (R90, 0, 0)))
    parts.append(strut((0.25, 0, h - 0.08), (0.25, 0, h - 0.2), 0.006, iron, sides=4))
    parts.append(lathe([(0.0, 0.0), (0.075, 0.0), (0.08, 0.02), (0.06, 0.03), (0.0, 0.04)], 8, "lbase", mat("soot")))
    parts[-1].data.transform(Matrix.Translation((0.25, 0.0, h - 0.5)))
    glass = lathe([(0.0, 0.0), (0.055, 0.0), (0.065, 0.1), (0.05, 0.19), (0.0, 0.2)], 10, "lglass", mat("glass", rough=0.3, emit=1.4))
    glass.data.transform(Matrix.Translation((0.25, 0.0, h - 0.47)))
    parts.append(glass)
    for k in range(4):
        a = k / 4 * math.tau + 0.4
        parts.append(strut((0.25 + math.cos(a) * 0.065, math.sin(a) * 0.065, h - 0.46), (0.25 + math.cos(a) * 0.055, math.sin(a) * 0.055, h - 0.26), 0.006, iron, sides=4))
    parts.append(lathe([(0.0, 0.0), (0.07, 0.0), (0.05, 0.05), (0.0, 0.07)], 8, "lcap", mat("soot")))
    parts[-1].data.transform(Matrix.Translation((0.25, 0.0, h - 0.27)))
    # A fallen board at the foot.
    fb2 = beam((-0.3, 0.3, 0.05), (0.45, 0.55, 0.12), 0.24, 0.045, dark, 30, cuts=4)
    grain(fb2, (1, 0.3, 0), 0.3, 40, 31)
    parts.append(fb2)
    white_col(parts)
    o = join(parts, "OldTimbers")
    bake(o)
    wobble(o, 0.006, 82)
    ao(o, 0.35, rays=10, strength=0.6)
    return o


def rail_profile(L, m, x):
    """A flat-bottomed rail along Y."""
    prof = [(-0.04, 0.0), (0.04, 0.0), (0.04, 0.008), (0.009, 0.016), (0.009, 0.05), (0.02, 0.056), (0.02, 0.072),
            (-0.02, 0.072), (-0.02, 0.056), (-0.009, 0.05), (-0.009, 0.016), (-0.04, 0.008)]
    r = from_profile(prof, L, m, bevel=0.0)
    place(r, (x, 0, 0))
    return r


def wheel(r, m, hub_m):
    """A flanged cast-iron mine-cart wheel, axis along X."""
    prof = [(0.0, -0.03), (r * 0.35, -0.03), (r * 0.4, -0.012), (r * 0.82, -0.012), (r * 0.86, -0.03), (r, -0.03),
            (r, 0.012), (r * 1.13, 0.016), (r * 1.13, 0.03), (r * 0.86, 0.03), (r * 0.8, 0.012), (r * 0.42, 0.012), (r * 0.36, 0.04), (0.0, 0.04)]
    w = lathe(prof, 18, "wheel", m)
    hub = cyl(r * 0.3, 0.1, (0, 0, 0.0), hub_m, (0, 0, 0), 10, bevel=0.006)
    o = join([w, hub], "Wheel")
    o.data.transform(Matrix.Rotation(R90, 4, "Y"))
    return o


def mine_cart():
    """A riveted ore tub on its chassis, four flanged wheels sitting on a run
    of rail with sleepers and spikes, a heap of ore still in it and the rail
    bent up at the far end (Bedrock)."""
    iron = mat("iron", metal=0.5, rough=0.7)
    rust = mat("umber", metal=0.3, rough=0.8)
    steel = mat("steel", metal=0.6, rough=0.5)
    wood = mat("wood_dark", rough=0.9)
    rock = mat("stone", rough=0.9)
    rnd = random.Random(83)
    parts = []
    gauge = 0.56
    # Track: sleepers, rails, spikes.
    for i in range(6):
        y = -1.25 + i * 0.5 + rnd.uniform(-0.04, 0.04)
        sl = beam((-0.48, y, -0.03), (0.5, y + rnd.uniform(-0.03, 0.03), -0.03), 0.14, 0.1, wood, 40 + i, cuts=4)
        grain(sl, (1, 0, 0), 0.3, 30, 50 + i)
        parts.append(sl)
        for s in (-1, 1):
            parts.append(box((0.022, 0.022, 0.07), (s * (gauge / 2 + 0.05), y, 0.03), iron, bevel=0.004))
    for s in (-1, 1):
        r = rail_profile(2.9, steel, s * gauge / 2)
        subdivide(r, 6)
        for v in r.data.vertices:
            if v.co.y > 1.1:
                v.co.z += (v.co.y - 1.1) ** 2 * (0.5 if s < 0 else 0.15)
        r.data.transform(Matrix.Translation((0, 0, 0.02)))
        parts.append(r)
    # Wheels on the rails, axles, chassis.
    wr = 0.15
    axle_z = 0.02 + 0.072 + wr
    for y in (-0.36, 0.36):
        for s in (-1, 1):
            w = wheel(wr, iron, rust)
            w.data.transform(Matrix.Translation((s * (gauge / 2 - 0.0), y, axle_z)))
            if s > 0:
                w.data.transform(Matrix.Translation((0, 0, 0)))
            parts.append(w)
        parts.append(place(cyl(0.028, gauge + 0.16, (0, 0, 0), steel, (0, 0, 0), 8), (0, y, axle_z), (0, R90, 0)))
    for s in (-1, 1):
        parts.append(box((0.07, 1.25, 0.09), (s * 0.24, 0, axle_z + 0.05), rust, bevel=0.01))
        for y in (-0.36, 0.36):
            parts.append(box((0.1, 0.13, 0.11), (s * 0.24, y, axle_z), iron, bevel=0.012))
    # The tub: wider at the top, rolled rim, strap bands with rivets.
    tw, tl, th = 0.82, 1.18, 0.56
    z0 = axle_z + 0.1
    tub = box((tw * 0.84, tl * 0.88, th), (0, 0, z0 + th / 2), rust, bevel=0.0)
    bake(tub)
    subdivide(tub, 3)
    # Open the top and give the walls a thickness.
    bm = bmesh.new()
    bm.from_mesh(tub.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z > 0.9 and f.calc_center_median().z > z0 + th * 0.95], context="FACES")
    bm.to_mesh(tub.data)
    bm.free()
    sol = tub.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.025
    apply_mods(tub)
    for v in tub.data.vertices:
        t = (v.co.z - z0) / th
        v.co.x *= 1.0 + 0.19 * t
        v.co.y *= 1.0 + 0.13 * t
        if abs(v.co.x) > 0.3 and t > 0.2:
            v.co.x -= 0.015 * math.sin(v.co.y * 9) * (1 if v.co.x > 0 else -1)   # dents
    parts.append(tub)
    inner = box((tw * 0.8, tl * 0.85, 0.02), (0, 0, z0 + th * 0.45), mat("soot"), bevel=0.0)
    parts.append(inner)
    rim = []
    hw, hl = tw * 0.84 * 1.19 / 2, tl * 0.88 * 1.13 / 2
    corners = [(-hw, -hl), (hw, -hl), (hw, hl), (-hw, hl), (-hw, -hl)]
    rim_pts = [Vector((x, y, z0 + th + 0.005)) for (x, y) in corners]
    parts.append(ktube(rim_pts, [0.022] * 5, iron, sides=6, cap=False, name="rim"))
    for y in (-0.38, 0.0, 0.38):
        for s in (-1, 1):
            parts.append(place(box((0.02, 0.07, th * 0.98), (0, 0, 0), iron, bevel=0.004), (s * (hw - 0.03), y, z0 + th / 2), (0, -s * 0.16, 0)))
            for k in range(4):
                zz = z0 + 0.08 + k * 0.14
                xx = s * (tw * 0.42 * (1 + 0.19 * (zz - z0) / th) + 0.012)
                parts.append(sphere(0.011, (xx, y, zz), mat("brass", metal=0.7, rough=0.4), segs=6, rings=4))
    # Couplings at the ends.
    for s in (-1, 1):
        parts.append(box((0.1, 0.12, 0.05), (0, s * 0.7, axle_z + 0.05), iron, bevel=0.01))
        parts.append(place(torus(0.045, 0.012, (0, 0, 0), iron, (0, 0, 0), 10, 4), (0, s * 0.8, axle_z + 0.05), (0, R90, 0)))
    # A heap of ore, a nugget or two catching the light.
    for k in range(9):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0, 0.28)
        parts.append(lump(rnd.uniform(0.08, 0.15), Vector((math.cos(a) * d * 1.2, math.sin(a) * d * 1.6, z0 + th * 0.62 + (0.28 - d) * 0.5)), rock, 90 + k, scale=(1.2, 1, 0.8), sub=1, rough=0.4))
    parts.append(lump(0.06, Vector((0.12, -0.15, z0 + th + 0.08)), mat("verdigris", rough=0.35, metal=0.3), 99, sub=1, rough=0.4))
    # The carbide lamp hung on the rim.
    parts.append(cyl(0.035, 0.09, (hw + 0.02, 0.35, z0 + th - 0.07), mat("brass", metal=0.7, rough=0.4), verts=10))
    parts.append(place(sphere(0.026, (0, 0, 0), mat("glass", rough=0.3, emit=1.5), segs=8, rings=5), (hw + 0.06, 0.35, z0 + th - 0.06)))
    white_col(parts)
    o = join(parts, "MineCart")
    bake(o)
    wobble(o, 0.004, 83)
    ao(o, 0.3, rays=10, strength=0.6)
    o.data.transform(Matrix.Rotation(0.05, 4, "Y"))
    return o


def vertebra(scale, m, spine_lean=0.4, seed=0):
    """One vertebra: a spool-shaped centrum along Y, a tall neural spine
    leaning back, two transverse processes. Centred on the centrum."""
    rnd = random.Random(seed)
    c = lathe([(0.0, -0.06), (0.06, -0.06), (0.068, -0.045), (0.05, 0.0), (0.068, 0.045), (0.06, 0.06), (0.0, 0.06)], 10, "centrum", m)
    c.data.transform(Matrix.Rotation(R90, 4, "X"))
    parts = [c]
    sp = rnd.uniform(0.16, 0.26)
    parts.append(ktube([Vector((0, 0, 0.04)), Vector((0, -0.02 - spine_lean * 0.04, 0.04 + sp * 0.5)), Vector((0, -spine_lean * 0.1, 0.04 + sp))],
                       [0.03, 0.022, 0.014], m, sides=6, flat=0.45, name="spine"))
    for s in (-1, 1):
        parts.append(ktube([Vector((s * 0.03, 0, 0.03)), Vector((s * 0.1, 0.0, 0.05)), Vector((s * 0.14, 0.01, 0.035))], [0.016, 0.012, 0.008], m, sides=5, name="tp"))
    o = join(parts, "vert")
    o.data.transform(Matrix.Scale(scale, 4))
    return o


def ribcage():
    """A big skeleton weathering out of a mound of ochre rock (Dinosaur
    Graveyard): the spine snakes in from the ground and back down, vertebrae
    of every size, a few knocked out of line; ribs of different lengths,
    curved and flat in section, some snapped off, some collapsed sideways,
    two lying loose; a thigh bone and a jaw on the mound."""
    bone_m = mat("bone", rough=0.75)
    stain = mat(None, color=(0.7, 0.6, 0.45), rough=0.8)
    matrix = mat(None, color=(0.5, 0.36, 0.2), rough=0.95)
    rnd = random.Random(84)
    parts = []
    # The mound it's in.
    mound = lump(0.85, Vector((0, 0.1, -0.3)), matrix, 840, scale=(1.05, 2.0, 0.45), sub=3, rough=0.12)
    parts.append(mound)
    for k in range(5):
        a = rnd.uniform(0, math.tau)
        parts.append(lump(rnd.uniform(0.15, 0.3), Vector((math.cos(a) * 1.0, math.sin(a) * 1.8, 0.0)), matrix, 841 + k, scale=(1.3, 1, 0.6), sub=1, rough=0.35))
    # The spine: a curve up out of the ground at the tail, over the hips,
    # down again at the neck.
    def spine_at(t):
        y = -1.9 + 3.8 * t
        z = -0.25 + 1.2 * math.sin(min(1.0, t * 1.15) * math.pi) ** 0.8
        x = 0.12 * math.sin(t * 5.0)
        return Vector((x, y, z))
    n = 19
    vert_pos = []
    for i in range(n):
        t = i / (n - 1)
        if i in (3, 13):
            continue   # lost
        p = spine_at(t)
        q = spine_at(min(1.0, t + 0.01))
        sc = 0.9 + 1.2 * math.sin(min(1.0, t * 1.1) * math.pi) * (1.0 if t > 0.25 else 0.7)
        v = vertebra(sc, bone_m if i % 4 else stain, spine_lean=0.4 + 0.5 * (t - 0.5), seed=i)
        d = (q - p).normalized()
        rq = Vector((0, 1, 0)).rotation_difference(d)
        mm = rq.to_matrix().to_4x4()
        # A few knocked out of line.
        if i in (6, 16):
            mm = Matrix.Rotation(rnd.uniform(-0.5, 0.5), 4, "Y") @ mm
            p = p + Vector((rnd.uniform(-0.12, 0.12), 0, -0.05))
        mm.translation = p
        v.data.transform(mm)
        parts.append(v)
        vert_pos.append((t, p, sc))
    # Ribs off the thorax: each its own length, arc and fate.
    fates = ["whole", "snap", "whole", "flat", "whole", "snap", "whole", "missing", "snap", "whole", "flat", "whole", "snap", "whole", "whole", "missing"]
    k = 0
    for i in range(8):
        t = 0.3 + i * 0.065
        p = spine_at(t)
        sz = 1.0 - abs(t - 0.5) * 1.3 + rnd.uniform(-0.08, 0.08)
        for s in (-1, 1):
            fate = fates[k % len(fates)]
            k += 1
            if fate == "missing":
                continue
            L = 1.45 * sz
            pts = []
            rad = []
            m_steps = 10
            end = m_steps if fate != "snap" else rnd.randint(4, 7)
            for j in range(end + 1):
                u = j / m_steps
                a = u * 2.0
                pts.append(p + Vector((s * (0.06 + math.sin(a) * 0.62 * L), 0.04 * j * 0.3 + 0.12 * u, (math.cos(a) - 1.0) * 0.55 * L + 0.03)))
                rad.append(0.05 * sz * (1.0 - 0.6 * u) + 0.01)
            r = ktube(pts, rad, bone_m if rnd.random() < 0.7 else stain, sides=7, flat=0.55, name="rib")
            if fate == "snap":
                snapped(r, pts[-1], pts[-1] - pts[-2], rad[-1], k)
            if fate == "flat":
                # Collapsed: swung down and out round its head.
                mm = Matrix.Translation(p) @ Matrix.Rotation(s * rnd.uniform(0.7, 1.0), 4, "Y") @ Matrix.Translation(-p)
                r.data.transform(mm)
            parts.append(r)
    # Two loose ribs on the mound, a thigh bone, a jaw half out.
    for j, (x, y, a) in enumerate(((0.75, -0.9, 0.4), (-0.85, 0.6, 2.2))):
        pts = [Vector((math.sin(u * 1.8) * 0.5, u * 0.1, 0.0)) for u in [q / 8 for q in range(9)]]
        r = ktube(pts, [0.03 * (1 - 0.5 * q / 8) + 0.006 for q in range(9)], stain, sides=6, flat=0.5, name="loose")
        place(r, (x, y, 0.12), (rnd.uniform(-0.2, 0.2), 0, a))
        parts.append(r)
    fem = ktube([Vector((0, -0.45, 0)), Vector((0, -0.2, 0.02)), Vector((0, 0.2, 0.02)), Vector((0, 0.45, 0))], [0.07, 0.045, 0.045, 0.07], bone_m, sides=8, name="femur")
    parts.append(place(fem, (0.95, 0.75, 0.18), (0.1, 0.0, 0.5)))
    for e in (-0.47, 0.47):
        parts.append(place(sphere(0.08, (0, 0, 0), bone_m, scale=(1.2, 0.8, 0.9), segs=10, rings=7), (0.95 - 0.48 * math.sin(0.5) * (e / 0.47), 0.75 + e * math.cos(0.5), 0.2)))
    jaw = ktube([Vector((0, -0.4, 0)), Vector((0.05, 0, 0.04)), Vector((0.02, 0.35, 0.0))], [0.08, 0.07, 0.04], stain, sides=8, flat=0.4, name="jaw")
    for q in range(7):
        jaw2 = place(cyl(0.018, 0.08, (0, 0, 0), bone_m, (0, 0, 0), 5, r2=0.002), (0.05 + 0.005 * q, -0.3 + q * 0.09, 0.09))
        parts.append(jaw2)
    parts.append(place(jaw, (0.05, 0, 0), (0, 0, 0)))
    parts[-1].data.transform(Matrix.Translation((-0.7, -1.2, 0.08)) @ Matrix.Rotation(0.7, 4, "Z"))
    for q in range(7):
        parts[-2 - q].data.transform(Matrix.Translation((-0.7, -1.2, 0.08)) @ Matrix.Rotation(0.7, 4, "Z"))
    o = join(parts, "Ribcage")
    bake(o)
    wobble(o, 0.006, 81)
    smooth(o, 55)
    ao(o, 0.5, rays=12, strength=0.7)
    return o


def ammonite(r, m, seed, turns=3.2):
    """An ammonite in relief: a coiled, ribbed tube flat on the XY plane."""
    pts = []
    radii = []
    steps = 60
    for i in range(steps + 1):
        t = i / steps
        a = t * turns * math.tau
        rr = r * (0.08 + 0.92 * t ** 1.2)
        pts.append((math.cos(a) * rr, math.sin(a) * rr, 0.0))
        radii.append(r * (0.04 + 0.26 * t ** 1.3) * (1.0 + 0.14 * math.sin(i * 2.3 + seed)))
    o = tube(pts, radii, m, res=8, name="ammonite")
    for v in o.data.vertices:
        v.co.z *= 0.55
    return o


def fossil_slab():
    """A fallen slab of shelly sandstone leaning on the wall (Fossil Bed): its
    face is a bedding plane crowded with fossils, three ammonites of different
    sizes, a fish's spine and ribs, and shell hash; a broken edge shows the
    layers; a big ammonite stands half out of the floor beside it."""
    sand = mat(None, color=(0.5, 0.4, 0.27), rough=0.92)
    sand_dark = mat(None, color=(0.4, 0.31, 0.2), rough=0.95)
    fossil = mat(None, color=(0.8, 0.7, 0.52), rough=0.7)
    rnd = random.Random(85)
    parts = []
    # The slab: three beds stacked, each a slightly different outline.
    for k in range(3):
        outline = []
        for i in range(11):
            a = i / 11 * math.tau
            rr = 1.0 + 0.12 * math.sin(a * 3 + k) + rnd.uniform(-0.06, 0.06)
            outline.append((math.cos(a) * 0.95 * rr, math.sin(a) * 0.62 * rr))
        bed = from_profile(outline, 0.07, sand if k != 1 else sand_dark, bevel=0.012)
        bake(bed)
        bed.data.transform(Matrix.Rotation(-R90, 4, "X"))
        bed.data.transform(Matrix.Translation((0.03 * k, -0.03 * k, -0.07 * k)))
        parts.append(bed)
    face = 0.04
    # Fossils on the top bed.
    for (x, y, r, a) in ((-0.35, 0.12, 0.26, 0.3), (0.42, -0.2, 0.16, 2.0), (0.15, 0.32, 0.1, 4.0)):
        am = ammonite(r, fossil, int(a * 10))
        place(am, (x, y, face), (0, 0, a))
        parts.append(am)
    # A fish: a curved spine of beads with fine ribs, a tail fan.
    sp = [Vector((0.1 + 0.6 * u, -0.38 + 0.1 * math.sin(u * 3), face + 0.005)) for u in [q / 14 for q in range(15)]]
    parts.append(ktube(sp, [0.01] * 15, fossil, sides=5, name="fishspine"))
    for q in range(1, 13):
        p = sp[q]
        L = 0.07 * math.sin(q / 13 * math.pi) + 0.02
        for s in (-1, 1):
            parts.append(strut(p, p + Vector((-0.02, s * L, 0.0)), 0.004, fossil, sides=4))
    tail = from_profile([(0.0, 0.0), (0.09, 0.06), (0.07, 0.0), (0.09, -0.06)], 0.008, fossil)
    bake(tail)
    tail.data.transform(Matrix.Rotation(-R90, 4, "X"))
    tail.data.transform(Matrix.Translation((sp[-1].x, sp[-1].y, face)))
    parts.append(tail)
    for q in range(26):
        x, y = rnd.uniform(-0.8, 0.8), rnd.uniform(-0.5, 0.5)
        if x * x / 0.64 + y * y / 0.25 > 0.85:
            continue
        sh = place(sphere(rnd.uniform(0.012, 0.025), (0, 0, 0), fossil, scale=(1, 0.6, 0.35), segs=6, rings=4), (x, y, face), (0, 0, rnd.uniform(0, 3)))
        parts.append(sh)
    slab = join(parts, "slab")
    bake(slab)
    # Leaning back against the wall.
    slab.data.transform(Matrix.Translation((0, 0.25, 0.62)) @ Matrix.Rotation(math.radians(68), 4, "X"))
    pieces = [slab]
    big = ammonite(0.34, fossil, 3, turns=3.4)
    bake(big)
    big.data.transform(Matrix.Rotation(R90, 4, "X"))
    big.data.transform(Matrix.Translation((1.05, -0.35, 0.15)) @ Matrix.Rotation(0.5, 4, "Z"))
    pieces.append(big)
    for k in range(6):
        a = rnd.uniform(0, math.tau)
        pieces.append(lump(rnd.uniform(0.07, 0.16), Vector((math.cos(a) * 1.1, -0.4 + math.sin(a) * 0.5, 0.0)), sand_dark, 850 + k, scale=(1.3, 1, 0.6), sub=1, rough=0.4))
    o = join(pieces, "FossilSlab")
    bake(o)
    wobble(o, 0.004, 86)
    smooth(o, 50)
    ao(o, 0.35, rays=12, strength=0.65)
    return o


def crystal_big():
    """A geode's worth of quartz in the Crystal Caves: a split boulder of dark
    rock with a lining of small points, out of which a spray of big crystals
    grows, one leader far taller than the rest, two loose double-terminated
    crystals on the floor. Teal, violet and pale, each its own material."""
    rock = mat("soot", rough=0.9)
    rnd = random.Random(33)
    ms = [mat("crystal_teal", color=(0.31, 0.64, 0.57), rough=0.15), mat("crystal_violet", color=(0.5, 0.4, 0.7), rough=0.15),
          mat("crystal_pale", color=(0.8, 0.86, 0.82), rough=0.15)]
    parts = [lump(0.75, Vector((0, 0, -0.32)), rock, 14, scale=(1.35, 1.1, 0.62), sub=3, rough=0.22)]
    parts.append(lump(0.4, Vector((0.85, 0.3, -0.12)), rock, 15, scale=(1.2, 1, 0.6), sub=2, rough=0.3))
    specs = [(0.17, 2.1, 0.08, 0.0, 0)]
    for i in range(12):
        specs.append((rnd.uniform(0.06, 0.13), rnd.uniform(0.4, 1.3), rnd.uniform(0.25, 0.75), rnd.uniform(0.0, 0.55), 1 + i % 2 + (i % 5 == 0)))
    for i, (r, L, tilt, d, mi) in enumerate(specs):
        c = quartz(r, L, seed=i * 7, tip=0.24)
        c.data.materials.append(ms[min(mi, 2) if i else 0])
        a = rnd.uniform(0, math.tau)
        place(c, (math.cos(a) * d, math.sin(a) * d, 0.02), (-math.sin(a) * tilt, math.cos(a) * tilt, rnd.uniform(0, 1)))
        parts.append(c)
    for i in range(16):
        r = rnd.uniform(0.025, 0.05)
        c = quartz(r, r * rnd.uniform(3, 5), seed=200 + i, tip=0.35)
        c.data.materials.append(ms[2])
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0.5, 0.85)
        place(c, (math.cos(a) * d * 1.2, math.sin(a) * d, 0.0), (-math.sin(a) * 0.9, math.cos(a) * 0.9, rnd.uniform(0, 1)))
        parts.append(c)
    for (x, y, a) in ((1.0, -0.6, 0.4), (-1.15, 0.5, 2.0)):
        c = quartz(0.07, 0.5, seed=int(a * 100), double=True)
        c.data.materials.append(ms[1])
        place(c, (x, y, 0.07), (R90, 0, a))
        parts.append(c)
    o = join(parts, "CrystalBig")
    bake(o)
    ao(o, 0.5, rays=12, strength=0.6)
    return o


def lava_pool():
    """A lake of lava under a crust (Lava Lakes; the Outer Core reuses it as
    molten iron): dark plates of crust, each its own shape, rafting on the
    melt with glowing gaps between, a few tilted and sinking at one edge;
    basalt boulders round the shore. The light sits over it in the game."""
    crust = mat("soot", rough=0.9)
    crust_hot = mat(None, color=(0.3, 0.12, 0.07), rough=0.8)
    melt = mat("melt", color=(0.95, 0.4, 0.1), rough=0.3, emit=4.0)
    rnd = random.Random(34)
    parts = []
    # The melt: a disc just under the crust.
    me = bpy.data.meshes.new("melt")
    bm = bmesh.new()
    c = bm.verts.new((0, 0, 0.0))
    ring = []
    R = 1.35
    for i in range(32):
        a = i / 32 * math.tau
        r = R * (1.0 + 0.16 * math.sin(a * 3 + 1.0) + 0.08 * math.sin(a * 5))
        ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r * 0.8, 0.0)))
    for i in range(32):
        bm.faces.new((c, ring[i], ring[(i + 1) % 32]))
    bm.to_mesh(me)
    bm.free()
    pool = bpy.data.objects.new("pool", me)
    bpy.context.collection.objects.link(pool)
    pool.data.materials.append(melt)
    parts.append(pool)
    # Crust plates on a jittered grid inside the shore line.
    sp = 0.36
    for gy in range(-5, 6):
        for gx in range(-5, 6):
            x = gx * sp + (sp * 0.5 if gy % 2 else 0.0) + rnd.uniform(-0.08, 0.08)
            y = gy * sp * 0.86 + rnd.uniform(-0.08, 0.08)
            a = math.atan2(y / 0.8, x)
            shore = R * (1.0 + 0.16 * math.sin(a * 3 + 1.0) + 0.08 * math.sin(a * 5))
            if math.hypot(x, y / 0.8) > shore * 0.9 or rnd.random() < 0.08:
                continue
            k = rnd.randint(5, 8)
            outline = []
            pr = sp * rnd.uniform(0.36, 0.5)
            for i in range(k):
                aa = i / k * math.tau + rnd.uniform(-0.2, 0.2)
                rr = pr * rnd.uniform(0.75, 1.15)
                outline.append((math.cos(aa) * rr, math.sin(aa) * rr))
            pl = from_profile(outline, rnd.uniform(0.04, 0.07), crust if rnd.random() < 0.75 else crust_hot, bevel=0.012)
            bake(pl)
            pl.data.transform(Matrix.Rotation(-R90, 4, "X"))
            for v in pl.data.vertices:
                v.co.z += 0.015 * math.cos(v.co.x * 9) * math.cos(v.co.y * 7)   # wrinkled skin
            tilt = (rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08), rnd.uniform(0, math.tau))
            if rnd.random() < 0.12:
                tilt = (rnd.uniform(0.25, 0.4), 0, rnd.uniform(0, math.tau))   # sinking
            place(pl, (x, y, 0.02), tilt)
            parts.append(pl)
    # Shore boulders.
    for i in range(22):
        a = i / 22 * math.tau + rnd.uniform(-0.1, 0.1)
        r = R * (1.0 + 0.16 * math.sin(a * 3 + 1.0) + 0.08 * math.sin(a * 5)) * rnd.uniform(1.0, 1.12)
        parts.append(lump(rnd.uniform(0.14, 0.3), Vector((math.cos(a) * r, math.sin(a) * r * 0.8, 0.02)), crust, 40 + i, scale=(1.3, 1.0, 0.6), sub=2, rough=0.3))
    o = join(parts, "LavaPool")
    bake(o)
    ao(o, 0.35, rays=10, strength=0.5)
    return o


def split_lump(r, scale, m, seed, gap, melt):
    """A pillow of rock split down the middle, the two halves eased apart and
    molten rock glowing in the crack between them."""
    a = lump(r, Vector((0, 0, 0)), m, seed, scale=scale, sub=3, rough=0.14)
    b = a.copy()
    b.data = a.data.copy()
    bpy.context.collection.objects.link(b)
    for o, keep_pos in ((a, True), (b, False)):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=0.0001,
                                     plane_co=(0, 0, 0), plane_no=(1, 0.15, 0), clear_outer=not keep_pos, clear_inner=keep_pos)
        edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
        if edges:
            bmesh.ops.holes_fill(bm, edges=edges)
        bm.to_mesh(o.data)
        bm.free()
        o.data.transform(Matrix.Translation((gap if keep_pos else -gap, 0, 0)))
    core = lump(r * 0.86, Vector((0, 0, 0)), melt, seed + 50, scale=(scale[0] * 0.5, scale[1] * 0.95, scale[2] * 0.9), sub=2, rough=0.15)
    return [a, b, core]


def mantle_rocks():
    """Rock that was moving a moment ago (the Mantle): pillowed columns, each
    a stack of swollen, wrinkled pillows of near-black crust, some split open
    with molten rock glowing in the crack, glowing seams where they part,
    leaning as if they'd oozed up and set; slumped lobes round their feet."""
    rock = mat(None, color=(0.14, 0.085, 0.065), rough=0.85)
    rock2 = mat(None, color=(0.19, 0.11, 0.075), rough=0.8)
    melt = mat("melt", color=(0.95, 0.42, 0.12), rough=0.3, emit=4.0)
    rnd = random.Random(35)
    parts = []
    cols = [(0.0, 0.0, 5, 0.34), (0.62, 0.25, 3, 0.26), (-0.55, 0.35, 4, 0.28), (0.3, -0.58, 2, 0.3), (-0.35, -0.5, 3, 0.22),
            (0.95, -0.25, 2, 0.2), (-0.95, -0.05, 2, 0.24)]
    for ci, (x, y, n, r0) in enumerate(cols):
        z = 0.0
        lean = Vector((rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0))
        p = Vector((x, y, 0))
        for k in range(n):
            r = r0 * (1.0 - 0.13 * k) * rnd.uniform(0.9, 1.1)
            hh = r * rnd.uniform(0.7, 0.95)
            m = rock if (k + ci) % 2 else rock2
            sc = (rnd.uniform(1.0, 1.25), rnd.uniform(0.85, 1.05), hh / r)
            if rnd.random() < 0.45:
                pieces = split_lump(r, sc, m, 500 + ci * 10 + k, r * 0.07, melt)
            else:
                pieces = [lump(r, Vector((0, 0, 0)), m, 500 + ci * 10 + k, scale=sc, sub=3, rough=0.16)]
            rot = (rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), rnd.uniform(0, 3))
            for pc in pieces:
                for v in pc.data.vertices:
                    if v.co.length > 1e-5:
                        v.co += v.co.normalized() * 0.01 * math.sin(v.co.z * 70 + ci)
                place(pc, tuple(p + Vector((0, 0, z + hh * 0.85))), rot)
                parts.append(pc)
            if k > 0:
                seam = lump(r * 0.98, Vector((0, 0, 0)), melt, 600 + ci * 10 + k, scale=(1.05, 0.95, 0.16), sub=2, rough=0.25)
                place(seam, tuple(p + Vector((0, 0, z + 0.03))), (0, 0, 0))
                parts.append(seam)
            z += hh * 1.5
            p = p + lean * hh
    for i in range(9):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0.7, 1.25)
        parts.append(lump(rnd.uniform(0.15, 0.28), Vector((math.cos(a) * d, math.sin(a) * d * 0.8, 0.02)), rock, 700 + i, scale=(1.5, 1.1, 0.45), sub=2, rough=0.2))
    o = join(parts, "MantleRocks")
    bake(o)
    smooth(o, 70)
    ao(o, 0.4, rays=10, strength=0.6)
    return o


def core_heart():
    """The middle of the planet (Inner Core): a pool of molten amber with a
    crown of big amber crystals round it, the tallest leaning over the melt,
    smaller points crowding their feet. The brightest thing in the game: in
    the game the crystals get the white-hot shader and the pool the amber
    melt, with a strong light."""
    hot = mat("corehot", color=(0.95, 0.66, 0.25), rough=0.2)
    melt = mat("melt_core", color=(1.0, 0.75, 0.3), rough=0.3, emit=5.0)
    rock = mat(None, color=(0.32, 0.2, 0.08), rough=0.8)
    rnd = random.Random(36)
    parts = []
    me = bpy.data.meshes.new("pool")
    bm = bmesh.new()
    c = bm.verts.new((0, 0, 0.0))
    ring = []
    for i in range(24):
        a = i / 24 * math.tau
        r = 0.75 * (1.0 + 0.12 * math.sin(a * 3))
        ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, 0.0)))
    for i in range(24):
        bm.faces.new((c, ring[i], ring[(i + 1) % 24]))
    bm.to_mesh(me)
    bm.free()
    pool = bpy.data.objects.new("pool", me)
    bpy.context.collection.objects.link(pool)
    pool.data.materials.append(melt)
    parts.append(pool)
    for i in range(14):
        a = i / 14 * math.tau + rnd.uniform(-0.15, 0.15)
        d = 0.78 + rnd.uniform(-0.05, 0.25)
        tall = i in (2, 7, 11)
        r = rnd.uniform(0.14, 0.22) if tall else rnd.uniform(0.07, 0.14)
        L = rnd.uniform(1.6, 2.4) if tall else rnd.uniform(0.4, 1.1)
        q = quartz(r, L, sides=6, seed=900 + i, tip=0.28)
        q.data.materials.append(hot)
        tilt = rnd.uniform(0.15, 0.4) if not tall else rnd.uniform(0.3, 0.5)
        # Lean in over the pool.
        place(q, (math.cos(a) * d, math.sin(a) * d, -0.05), (math.sin(a) * tilt, -math.cos(a) * tilt, rnd.uniform(0, 1)))
        parts.append(q)
    for i in range(18):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0.85, 1.25)
        r = rnd.uniform(0.03, 0.06)
        q = quartz(r, r * rnd.uniform(3, 6), seed=950 + i)
        q.data.materials.append(hot)
        place(q, (math.cos(a) * d, math.sin(a) * d, -0.02), (math.sin(a) * 0.5, -math.cos(a) * 0.5, rnd.uniform(0, 1)))
        parts.append(q)
    for i in range(10):
        a = i / 10 * math.tau
        parts.append(lump(rnd.uniform(0.12, 0.2), Vector((math.cos(a) * 0.86, math.sin(a) * 0.86, 0.0)), rock, 960 + i, scale=(1.3, 1, 0.5), sub=2, rough=0.3))
    o = join(parts, "CoreHeart")
    bake(o)
    ao(o, 0.35, rays=10, strength=0.5)
    return o


PROPS = [("pebble", pebble), ("rubble", rubble), ("nugget", nugget), ("crystal_small", crystal_small), ("root", root),
         ("bone", bone), ("shell", shell), ("magma_vent", magma_vent), ("ribcage", ribcage), ("fossil_slab", fossil_slab),
         ("crystal_big", crystal_big), ("lava_pool", lava_pool), ("mantle_rocks", mantle_rocks), ("old_timbers", old_timbers),
         ("mine_cart", mine_cart), ("core_heart", core_heart)]

if __name__ == "__main__":
    only = sys.argv[1:]
    for name, fn in PROPS:
        if only and name not in only:
            continue
        reset()
        o = fn()
        export([o], name)

