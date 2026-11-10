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
                 from_profile, subdivide, white_col, apply_mods, paint_rgb, paint_faces, fill_col, edge_wear,
                 srgb_to_linear)
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


def _stone_paint(o, rnd, base, var=0.12, warm=0.04):
    """One stone's colour: its own value and a touch warmer or cooler, lighter
    on top where the lamp and the dust catch it, flecks of a second mineral."""
    v = rnd.uniform(1.0 - var, 1.0 + var * 0.6)
    w = rnd.uniform(-warm, warm)
    c = (base[0] * v * (1 + w), base[1] * v, base[2] * v * (1 - w))
    fill_col(o, c)
    off = Vector((rnd.uniform(0, 50), rnd.uniform(0, 50), rnd.uniform(0, 50)))
    def f(p, n):
        top = 0.86 + 0.24 * max(0.0, n.z)
        fl = noise.noise(p * 90.0 + off)
        fleck = 1.18 if fl > 0.55 else (0.82 if fl < -0.6 else 1.0)
        return (top * fleck, top * fleck, top * fleck)
    paint_rgb(o, f)


def pebble():
    """A little nest of river-worn stones half sunk in the rock: five sizes,
    each turned its own way and its own shade of grey-brown, lighter on top,
    flecked, dark where it goes in. (Neutral enough that the game can tint
    them to each layer's own stone.)"""
    m = mat("cream", color=(1.0, 1.0, 1.0), rough=0.85)
    rnd = random.Random(41)
    specs = [(0.06, (0.0, 0.0), (1.3, 0.95, 0.62)), (0.042, (0.088, 0.038), (1.15, 0.9, 0.66)),
             (0.03, (-0.064, 0.058), (1.0, 1.25, 0.7)), (0.022, (-0.03, -0.074), (1.1, 1.0, 0.8)),
             (0.016, (0.05, -0.06), (1.0, 1.0, 0.85))]
    tones = [(0.95, 0.9, 0.84), (0.78, 0.76, 0.74), (1.0, 0.94, 0.84), (0.7, 0.68, 0.7), (0.9, 0.82, 0.72)]
    parts = []
    for k, (r, (x, y), sc) in enumerate(specs):
        o = lump(r, Vector((0, 0, 0)), m, 11 + k, scale=sc, sub=2, rough=0.1)
        _stone_paint(o, rnd, tones[k])
        place(o, (x, y, -r * 0.18), (rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), rnd.uniform(0, math.tau)))
        parts.append(o)
    o = join(parts, "Pebble")
    bake(o)
    smooth(o, 85)
    ao(o, 0.05, rays=10, strength=0.55, edge=0.5)
    sink_shade(o, 0.05)
    return o


def rubble():
    """Angular chips of broken stone (Bedrock): sharp facets, each face its
    own value (fresh breaks pale, weathered faces darker), bright worn edges,
    one chip standing on its edge, sunk into the floor."""
    m = mat("cream", color=(1.0, 1.0, 1.0), rough=0.8)
    rnd = random.Random(43)
    parts = []
    for k, (r, x, y) in enumerate([(0.07, 0, 0), (0.045, 0.1, 0.03), (0.035, -0.07, 0.06), (0.028, 0.02, -0.08), (0.02, -0.05, -0.05)]):
        o = lump(r, Vector((0, 0, 0)), m, 21 + k, scale=(1.3, 0.8, 0.7), sub=1, rough=0.5)
        base = (0.92, 0.92, 0.9) if k % 2 == 0 else (0.8, 0.79, 0.79)
        fill_col(o, base)
        fr = random.Random(400 + k)
        paint_faces(o, lambda c, n, i: (lambda v: (v, v, v * 0.98))(
            (1.22 if fr.random() < 0.3 else fr.uniform(0.78, 1.0)) * (0.85 + 0.2 * max(0.0, n.z))))
        place(o, (x, y, -r * 0.2), (rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), rnd.uniform(0, math.tau)))
        parts.append(o)
    o = join(parts, "Rubble")
    bake(o)
    edge_wear(o, 1.3, 0.8)
    ao(o, 0.05, rays=10, strength=0.55, edge=0.4)
    sink_shade(o, 0.06)
    return o


def nugget():
    """An ore nugget breaking out of the wall: a fat chunk and two smaller
    shards, faceted, each face catching the lamp differently, bright on the
    edges, dull and dark at the root. (Neutral: the game tints it the ore's
    colour.)"""
    m = mat("cream", color=(1.0, 1.0, 1.0), rough=0.4, metal=0.3)
    parts = [lump(0.06, Vector((0, 0, 0.02)), m, 4, scale=(1.0, 0.85, 1.25), sub=1, rough=0.35),
             lump(0.035, Vector((0.055, -0.02, 0.0)), m, 5, scale=(0.8, 0.8, 1.6), sub=1, rough=0.3),
             lump(0.03, Vector((-0.045, 0.035, 0.0)), m, 6, scale=(0.9, 0.9, 1.4), sub=1, rough=0.3)]
    o = join(parts, "Nugget")
    bake(o)
    fill_col(o, (0.82, 0.82, 0.82))
    fr = random.Random(77)
    paint_faces(o, lambda c, n, i: (lambda v: (v, v, v))(fr.choice([0.62, 0.78, 0.9, 1.0, 1.15, 1.22])))
    edge_wear(o, 1.35, 0.7)
    ao(o, 0.05, rays=8, strength=0.45)
    sink_shade(o, 0.06, 0.45)
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
    the core): one tall leader, the rest shorter and splayed, a broken stub;
    milky and dark at the root, clearing to a pale tip, each face its own
    value. (The game tints it teal, violet or amber.)"""
    m = mat("cream", color=(1.0, 1.0, 1.0), rough=0.15, metal=0.1)
    rnd = random.Random(31)
    parts = []
    specs = [(0.03, 0.26, 0.05), (0.022, 0.17, 0.45), (0.02, 0.14, 0.55), (0.016, 0.11, 0.7), (0.026, 0.07, 0.35), (0.012, 0.08, 0.8)]
    for i, (r, L, tilt) in enumerate(specs):
        c = quartz(r, L, seed=300 + i, tip=0.3 if i != 4 else 0.05)
        c.data.materials.append(m)
        fill_col(c, (1.0, 1.0, 1.0))
        # milky and dark at the root, clearing to the tip, with a phantom band
        paint_rgb(c, lambda p, n, L=L: (lambda t: (lambda v: (v, v, v * 1.03))((0.3 + 0.7 * t) * (0.82 if abs(t - 0.45) < 0.05 else 1.0)))(
            max(0.0, min(1.0, p.z / L)) ** 0.6))
        fr = random.Random(310 + i)
        paint_faces(c, lambda cc, n, k: (lambda v: (v, v, v))(fr.uniform(0.8, 1.15)))
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
    """Tree roots hanging out of the topsoil: a thick root forking into three
    tapering, wandering strands, each with side rootlets; dark bark at the
    wall going paler and redder towards the fine tips, ringed where it grew
    in fits."""
    m = mat("cream", color=(1.0, 1.0, 1.0), rough=0.9)
    rnd = random.Random(32)
    parts = []
    bark = (0.34, 0.24, 0.15)
    for k in range(3):
        pts = []
        p = Vector((rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), -0.02))
        d = Vector((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), 1.0)).normalized()
        for i in range(10):
            pts.append(p.copy())
            d = (d + Vector((rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), 0.0)) * 0.35).normalized()
            p = p + d * rnd.uniform(0.035, 0.06)
        radii = [(0.02 if k == 0 else 0.014) * (1.0 - i / 10) ** 1.2 + 0.0015 for i in range(10)]
        parts.append(tube(pts, radii, m, name="strand"))
        for j in (3, 6):
            q = pts[j]
            dd = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0.6)).normalized()
            lp = [q, q + dd * 0.03, q + dd * 0.055 + Vector((0, 0, 0.02))]
            parts.append(tube(lp, [radii[j] * 0.5, radii[j] * 0.3, 0.001], m, name="rootlet"))
    o = join(parts, "Root")
    bake(o)
    zs = [v.co.z for v in o.data.vertices]
    z1 = max(zs)
    fill_col(o, bark)
    paint_rgb(o, lambda p, n: (lambda t, ring: (ring * (1.0 + 0.55 * t), ring * (1.0 + 0.4 * t), ring * (1.0 + 0.25 * t)))(
        max(0.0, min(1.0, p.z / z1)), 0.82 if math.sin(p.z * 160.0) > 0.85 else 1.0))
    edge_wear(o, 1.2, 0.8)
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


def metaball_mesh(elements, res, name, m):
    """A smooth organic solid from metaball elements [(kind, co, radius,
    size_x, rotation quaternion or None)], converted to a mesh."""
    mb = bpy.data.metaballs.new(name)
    mb.resolution = res
    mb.render_resolution = res
    mb.threshold = 0.6
    ob = bpy.data.objects.new(name, mb)
    bpy.context.collection.objects.link(ob)
    for (kind, co, rad, sx, q) in elements:
        e = mb.elements.new(type=kind)
        e.co = co
        e.radius = rad
        e.stiffness = 2.0
        if kind == "CAPSULE":
            e.size_x = sx
        elif kind == "ELLIPSOID":
            # an ellipsoid's surface sits at about 0.57 x radius x size: scale
            # so `rad` is its real half-width, like a ball's
            e.radius = rad * 1.75
            e.size_x, e.size_y, e.size_z = sx
        if q is not None:
            e.rotation = q
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.active_object
    o.name = name
    o.data.materials.clear()
    o.data.materials.append(m)
    return o


def bone():
    """A fossil limb bone weathering out of the wall (Fossil Bed and
    Graveyard decor): a long, slightly bowed shaft flaring to two knuckles
    at one end and a ball on a short neck at the other, with a knob beside
    it, lying half sunk in the rock. Ivory on top going tan, stained brown
    where it lay in the ground, the knuckles rubbed pale."""
    from mathutils import Quaternion
    m = mat("cream", color=(1.0, 1.0, 1.0), rough=0.75)
    q1 = Quaternion((0, 0, 1), 0.06)
    q2 = Quaternion((0, 0, 1), -0.08)
    # A femur, not a dog's chew: a shaft that bows and pinches at its waist;
    # at one end the two condyles as flattened lobes grown into a broad knee
    # with a notch between; at the other a head turned up on a neck, the
    # trochanter a ridge beside it. Lobes are squashed ellipsoids, not balls.
    els = [("CAPSULE", (0.05, 0.0, 0.0), 0.017, 0.05, q1),
           ("CAPSULE", (-0.045, 0.004, 0.0), 0.015, 0.05, q2),
           ("ELLIPSOID", (0.098, 0.0, 0.0), 0.024, (1.0, 1.35, 0.8), None),      # the knee flares
           ("ELLIPSOID", (0.124, 0.017, -0.002), 0.02, (1.05, 0.8, 0.72), None),  # condyles, the inner one smaller
           ("ELLIPSOID", (0.122, -0.016, -0.002), 0.018, (1.0, 0.8, 0.7), None),
           ("ELLIPSOID", (-0.098, 0.004, 0.0), 0.02, (1.1, 1.2, 0.85), None),     # the hip end flares
           ("CAPSULE", (-0.117, 0.02, 0.003), 0.012, 0.014, Quaternion((0, 0, 1), 1.0)),   # the neck
           ("ELLIPSOID", (-0.13, 0.036, 0.004), 0.021, (0.95, 0.95, 0.9), None),  # the head
           ("ELLIPSOID", (-0.118, -0.016, 0.0), 0.016, (1.4, 0.7, 0.75), None)]   # the trochanter ridge
    o = metaball_mesh(els, 0.007, "Bone", m)
    bake(o)
    dec = o.modifiers.new("dec", "DECIMATE")
    dec.ratio = 0.35
    apply_mods(o)
    o.data.transform(Matrix.Translation((0, 0, -0.006)) @ Matrix.Rotation(0.35, 4, "Z"))
    smooth(o, 60)
    fill_col(o, (0.86, 0.79, 0.64))
    def stain(p, nrm):
        s_ = noise.noise(p * 40.0 + Vector((3, 1, 7)))
        low = max(0.0, min(1.0, (0.012 - p.z) / 0.02))           # where it lay in the ground
        top = max(0.0, nrm.z)
        k = (0.86 + 0.18 * top) * (1.0 - 0.14 * max(0.0, s_)) * (1.0 - 0.3 * low)
        return (k, k * (0.97 - 0.06 * low), k * (0.9 - 0.14 * low))
    paint_rgb(o, stain)
    edge_wear(o, 1.15, 0.8)
    ao(o, 0.05, rays=8, strength=0.5, edge=0.4)
    sink_shade(o, 0.02)
    return o


def shell():
    """A scallop weathering out of the wall (Fossil Bed decor): a fan of
    sixteen radial ribs rising from the hinge, the two little ears either
    side of it, growth lines in rings, the margin sunk into the rock. Ivory
    on the rib crests, tan in the furrows, browner towards the hinge."""
    m = mat("cream", color=(1.0, 1.0, 1.0), rough=0.7)
    L = 0.075
    A = math.radians(58)
    me = bpy.data.meshes.new("shell")
    bm = bmesh.new()
    na, nt = 34, 8
    cols = []
    grid = []
    for i in range(na + 1):
        a = -A - 0.42 + (2 * A + 0.84) * i / na
        ear = abs(a) > A
        lim = (0.24 if ear else 1.0 - 0.05 * (a / A) ** 4) * L
        row = []
        for j in range(1, nt + 1):
            t = j / nt
            rr = lim * t
            if ear:
                z = 0.006 * (1.0 - t) + 0.002
                v = 0.8
            else:
                dome = 0.024 * (t ** 0.55) * (1.0 - t ** 5) * math.cos(a / A * math.pi / 2) ** 0.4
                rib = (0.5 + 0.5 * math.cos(a / A * 8.0 * math.pi)) ** 2
                z = dome + 0.006 * t ** 0.8 * rib - 0.005 * t ** 8
                band = 0.9 if int(t * 7.0 + 0.3 * math.sin(a * 5)) % 2 else 1.0
                v = (0.74 + 0.36 * rib) * band * (0.82 + 0.18 * t)
            row.append(bm.verts.new((math.sin(a) * rr, math.cos(a) * rr - 0.03, z)))
            cols.append((0.86 * v, 0.79 * v, 0.64 * v))
        grid.append(row)
    hinge = bm.verts.new((0.0, -0.03, 0.006))
    cols.append((0.6, 0.53, 0.42))
    for i in range(na):
        a, b2 = grid[i], grid[i + 1]
        bm.faces.new((hinge, a[0], b2[0]))
        for j in range(nt - 1):
            bm.faces.new((a[j], a[j + 1], b2[j + 1], b2[j]))
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("Shell", me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    if sum(pp.normal.z for pp in o.data.polygons) < 0:
        o.data.flip_normals()
    fill_col(o, (1.0, 1.0, 1.0))
    col = o.data.color_attributes["Col"]
    lin = [srgb_to_linear(c) for c in cols]
    for li, lp in enumerate(o.data.loops):
        c = lin[lp.vertex_index]
        col.data[li].color = (c[0], c[1], c[2], 1.0)
    smooth(o, 60)
    edge_wear(o, 1.15, 0.8)
    sink_shade(o, 0.03, 0.55)
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


def loft(sections, m, name="loft", cap=True):
    """A closed solid through cross-sections: each [(x, y, z), ...] with the
    same number of points, in order round the section."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in sec] for sec in sections]
    n = len(rings[0])
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if m:
        o.data.materials.append(m)
    return o


def carve(o, cutter):
    """Boolean difference (exact): cuts `cutter` out of `o`, then deletes the cutter."""
    mod = o.modifiers.new("cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    apply_mods(o)
    bpy.data.objects.remove(cutter, do_unlink=True)


def skull(bone_m, tooth_m):
    """A theropod skull, snout along +Y, resting on its jaw line at z = 0:
    lofted from rounded sections (deep at the back, a long narrowing snout),
    the eye socket, the big opening in front of it, the hole behind it and
    the nostril cut right through; a lower jaw dropped a little open; curved
    teeth of uneven sizes along both jaws. About 0.9 m long."""
    prof = [(-0.53, 0.04, 0.22, 0.12), (-0.5, 0.1, 0.27, 0.05), (-0.44, 0.15, 0.3, 0.02), (-0.36, 0.19, 0.36, -0.01), (-0.24, 0.18, 0.37, 0.0), (-0.1, 0.145, 0.32, 0.02),
            (0.04, 0.12, 0.27, 0.03), (0.18, 0.1, 0.22, 0.035), (0.3, 0.085, 0.19, 0.04), (0.4, 0.075, 0.16, 0.045),
            (0.46, 0.05, 0.12, 0.05)]
    secs = []
    for (y, w, top, bot) in prof:
        sec = []
        for i in range(14):
            a = i / 14 * math.tau
            sa, ca = math.sin(a), math.cos(a)
            mid = (top + bot) * 0.5
            h = (top - bot) * 0.5
            x = w * ca * (1.0 - 0.38 * max(0.0, sa))
            z = mid + h * (sa if sa > 0 else sa * 0.85)
            sec.append((x, y, z))
        secs.append(sec)
    sk = loft(secs, bone_m, "skull")
    subdivide(sk, 1)
    # Brow ridge and a bump over the eye.
    for v in sk.data.vertices:
        if v.co.z > 0.3 and -0.3 < v.co.y < -0.12:
            v.co.z += 0.025 * math.cos((v.co.y + 0.21) / 0.09 * math.pi * 0.5)
    for (y, z, r, sy, sz) in ((-0.22, 0.25, 0.072, 1.0, 1.15), (-0.02, 0.17, 0.068, 2.0, 1.0), (-0.36, 0.13, 0.045, 0.9, 1.6),
                              (0.37, 0.125, 0.024, 1.5, 1.0)):
        c = cyl(r, 0.6, (0, y, z), None, (0, R90, 0), verts=12)
        c.scale = (1.0, sz, sy)
        bpy.context.view_layer.objects.active = c
        bake(c)
        carve(sk, c)
    parts = [sk]
    # Lower jaw: two blades from the hinge to the chin, joined at the front.
    jaw_secs = []
    for (y, w, h) in ((-0.42, 0.16, 0.1), (-0.3, 0.165, 0.12), (-0.15, 0.135, 0.1), (0.0, 0.11, 0.085), (0.15, 0.09, 0.07),
                      (0.3, 0.075, 0.06), (0.42, 0.055, 0.05)):
        sec = []
        for i in range(10):
            a = i / 10 * math.tau
            sec.append((w * math.cos(a) * (0.98 - 0.18 * max(0.0, -math.sin(a))), y, 0.0 - h * 0.5 + h * 0.5 * math.sin(a) * 0.9))
        jaw_secs.append(sec)
    jaw = loft(jaw_secs, bone_m, "jaw")
    # hollow it: cut the inside out so it reads as two rami and a chin
    inner = loft([[(x * 0.72, y, z * 0.8 + 0.03) for (x, y, z) in s] for s in jaw_secs[:-1]], None, "jawcut")
    carve(jaw, inner)
    c = cyl(0.04, 0.5, (0, -0.28, -0.01), None, (0, R90, 0), verts=10)
    c.scale = (1.0, 0.8, 1.7)
    bake(c)
    carve(jaw, c)
    parts.append(jaw)
    teeth = []
    rnd = random.Random(912)
    for side in (-1, 1):
        for k in range(9):
            y = -0.12 + k * 0.065
            w = 0.145 - (y + 0.1) * 0.13
            L = (0.07 if 1 <= k <= 4 else 0.05) * rnd.uniform(0.75, 1.1)
            base = Vector((side * w * 0.9, y, 0.035))
            t = ktube([base, base + Vector((0, -0.01, -L * 0.55)), base + Vector((0, -0.025, -L))], [0.014, 0.009, 0.001], tooth_m,
                      sides=5, name="tooth")
            teeth.append(t)
        for k in range(8):
            y = -0.08 + k * 0.065
            w = 0.135 - (y + 0.1) * 0.12
            L = 0.05 * rnd.uniform(0.75, 1.1)
            base = Vector((side * w * 0.85, y, 0.035))
            t = ktube([base, base + Vector((0, -0.01, L * 0.55)), base + Vector((0, -0.02, L))], [0.012, 0.008, 0.001], tooth_m,
                      sides=5, name="tooth")
            teeth.append(("low", t))
    up = [t for t in teeth if not isinstance(t, tuple)]
    low = [t[1] for t in teeth if isinstance(t, tuple)]
    jaw_all = join([jaw] + low, "jaw_all")
    bake(jaw_all)
    jaw_all.data.transform(Matrix.Translation((0, -0.42, 0.0)) @ Matrix.Rotation(-0.18, 4, "X") @ Matrix.Translation((0, 0.42, 0.0)))
    jaw_all.data.transform(Matrix.Translation((0, 0, -0.03)))
    o = join([sk, jaw_all] + up, "Skull")
    bake(o)
    o.data.transform(Matrix.Translation((0, 0, 0.09)))
    return o


def bone_paint(o, z_ground=0.0):
    """Fossil bone colour: ivory on top, going tan then brown where it's
    still in the ground, stained in patches; worn edges pale."""
    fill_col(o, (0.86, 0.79, 0.63))
    off = Vector((5.0, 2.0, 9.0))
    def f(p, n):
        low = max(0.0, min(1.0, (z_ground + 0.35 - p.z) / 0.45))
        s = noise.noise(p * 6.0 + off)
        k = 1.0 - 0.14 * max(0.0, s) - 0.22 * low
        return (k * (1.0 - 0.04 * low), k * (0.97 - 0.1 * low), k * (0.93 - 0.2 * low))
    paint_rgb(o, f)
    edge_wear(o, 1.2, 0.78)


def ribcage():
    """A dinosaur skeleton half dug out of the rock (Dinosaur Graveyard): the
    spine arches up out of an ochre bank at the tail, over the hips and the
    chest and down the neck to the skull resting on its jaw; pairs of ribs,
    curved and tapering, arch out and down from every chest vertebra into the
    rock, longest in the middle, a few snapped or missing; the hip blades and
    a thigh bone; the dig marked out with stakes and string, a trowel and a
    brush left by the skull."""
    bone_m = mat("bone_paint", color=(1.0, 1.0, 1.0), rough=0.75)
    tooth_m = mat("tooth", color=(0.95, 0.9, 0.78), rough=0.5)
    matrix_m = mat("matrix_paint", color=(1.0, 1.0, 1.0), rough=0.95)
    wood = mat("wood", rough=0.85)
    rope = mat("rope", rough=0.9)
    iron = mat("steel", metal=0.6, rough=0.45)
    rnd = random.Random(84)
    bones = []
    # The bank it lies in: low, long, its top worn flat where it was dug.
    mound = lump(0.85, Vector((0, -0.1, -0.12)), matrix_m, 840, scale=(1.55, 2.6, 0.32), sub=3, rough=0.1)
    for v in mound.data.vertices:
        if v.co.z > 0.08:
            v.co.z = 0.08 + (v.co.z - 0.08) * 0.25
    rocks = [mound]
    for k in range(7):
        a = rnd.uniform(0, math.tau)
        rocks.append(lump(rnd.uniform(0.1, 0.22), Vector((math.cos(a) * 1.25, math.sin(a) * 2.0, 0.02)), matrix_m, 841 + k,
                          scale=(1.3, 1, 0.6), sub=1, rough=0.35))

    def spine_at(t):
        # tail (t=0) out of the bank, up over hips and chest, down the neck (t=1)
        y = -1.95 + 3.35 * t
        h = 1.05 * math.sin(min(1.0, max(0.0, (t - 0.04) / 0.86)) * math.pi) ** 0.75
        z = -0.1 + h + 0.12
        x = 0.1 * math.sin(t * 4.0 + 0.5)
        return Vector((x, y, z))

    n = 24
    for i in range(n):
        t = i / (n - 1)
        if i in (5,):
            continue
        p = spine_at(t)
        q = spine_at(min(1.0, t + 0.01))
        body = math.sin(min(1.0, max(0.0, (t - 0.05) / 0.8)) * math.pi)
        sc = 0.55 + 0.75 * body + (0.15 if t > 0.82 else 0.0)
        lean = 0.5 - 0.9 * t
        v = vertebra(sc, bone_m, spine_lean=lean, seed=i)
        d = (q - p).normalized()
        mm = Vector((0, 1, 0)).rotation_difference(d).to_matrix().to_4x4()
        if i in (3, 21):
            mm = Matrix.Rotation(rnd.uniform(-0.4, 0.4), 4, "Y") @ mm
        mm.translation = p
        v.data.transform(mm)
        bones.append(v)
    # Ribs: a pair off each chest vertebra.
    k = 0
    for i in range(10):
        t = 0.36 + i * 0.042
        p = spine_at(t)
        size = math.sin((i + 0.5) / 10 * math.pi) ** 0.6
        W = 0.42 + 0.38 * size
        H = p.z + 0.06
        for s in (-1, 1):
            k += 1
            if (i, s) in ((7, 1),):
                continue      # lost
            u_end = 1.0
            if (i, s) in ((2, -1), (5, 1), (8, -1)):
                u_end = rnd.uniform(0.55, 0.75)     # snapped
            steps = 14
            pts, rad = [], []
            sweep = rnd.uniform(0.1, 0.2)
            for j in range(steps + 1):
                u = u_end * j / steps
                x = s * (0.05 + W * math.sin(math.pi * u * 0.82))
                z = p.z - H * (u ** 1.55)
                pts.append(Vector((p.x + x, p.y - sweep * u, z)))
                rad.append(0.036 * size * (1.0 - 0.65 * u) + 0.01)
            r = ktube(pts, rad, bone_m, sides=7, flat=0.55, name="rib")
            if u_end < 1.0:
                snapped(r, pts[-1], pts[-1] - pts[-2], rad[-1], k)
            bones.append(r)
    # Hip blades over the back of the arch, and a thigh bone lying out.
    hp = spine_at(0.22)
    for s in (-1, 1):
        il = lump(0.22, Vector((0, 0, 0)), bone_m, 870 + s, scale=(0.25, 1.4, 0.75), sub=2, rough=0.12)
        place(il, (hp.x + s * 0.16, hp.y, hp.z - 0.12), (0, s * 0.25, 0))
        bones.append(il)
    fem = ktube([Vector((0, -0.42, 0)), Vector((0.02, -0.2, 0.03)), Vector((0.0, 0.2, 0.03)), Vector((0, 0.42, 0))],
                [0.07, 0.042, 0.045, 0.068], bone_m, sides=9, name="femur")
    place(fem, (0.85, -1.05, 0.12), (0.0, 0.0, 0.55))
    bones.append(fem)
    for e in (-0.44, 0.44):
        bones.append(place(sphere(0.075, (0, 0, 0), bone_m, scale=(1.2, 0.9, 0.85), segs=10, rings=7),
                           (0.85 - e * math.sin(0.55), -1.05 + e * math.cos(0.55), 0.13)))
    sk = skull(bone_m, tooth_m)
    sk.data.transform(Matrix.Scale(1.1, 4))
    sk.data.transform(Matrix.Translation((0.05, 1.95, 0.0)) @ Matrix.Rotation(0.18, 4, "Z") @ Matrix.Rotation(0.12, 4, "Y"))
    bones.append(sk)
    b = join(bones, "bones")
    bake(b)
    bone_paint(b, 0.0)
    # The bank: ochre in thin beds, dusty on top.
    m = join(rocks, "bank")
    bake(m)
    fill_col(m, (0.56, 0.41, 0.24))
    paint_rgb(m, lambda p, nn: (lambda k: (k, k * 0.98, k * 0.95))(
        (0.9 if int((p.z + 2.0) / 0.06) % 2 else 1.04) * (0.85 + 0.25 * max(0.0, nn.z))))
    edge_wear(m, 1.15, 0.85)
    # The dig: stakes at the corners, string between, tools by the skull.
    kit_parts = []
    corners = [(-1.3, -1.9), (1.3, -1.9), (1.35, 2.7), (-1.25, 2.65)]
    tops = []
    for (x, y) in corners:
        st = box((0.04, 0.04, 0.5), (x, y, 0.2), wood, rot=(rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08), rnd.uniform(0, 1)), bevel=0.006)
        kit_parts.append(st)
        tops.append(Vector((x, y, 0.4)))
    for a, bb in zip(tops, tops[1:] + tops[:1]):
        mid = (a + bb) * 0.5 - Vector((0, 0, 0.06))
        kit_parts.append(ktube([a, (a + mid) * 0.5 - Vector((0, 0, 0.02)), mid, (mid + bb) * 0.5 - Vector((0, 0, 0.02)), bb],
                               [0.005] * 5, rope, sides=4, name="string"))
    trowel = from_profile([(0.0, 0.0), (0.05, 0.1), (0.0, 0.16), (-0.05, 0.1)], 0.006, iron)
    place(trowel, (-0.55, 1.75, 0.1), (R90 * 0.05, 0, 0.6))
    kit_parts.append(trowel)
    kit_parts.append(place(cyl(0.012, 0.13, (0, 0, 0), wood, (R90, 0, 0), verts=8), (-0.62, 1.62, 0.1), (0, 0, 0.6)))
    brush = box((0.05, 0.14, 0.03), (0, 0, 0), wood, bevel=0.008)
    place(brush, (-0.35, 2.4, 0.1), (0, 0, -0.4))
    kit_parts.append(brush)
    kit_parts.append(place(box((0.048, 0.12, 0.03), (0, 0, 0), mat("leather_dark", rough=0.95), bevel=0.004), (-0.35, 2.4, 0.07), (0, 0, -0.4)))
    kt = join(kit_parts, "kit")
    o = join([m, b, kt], "Ribcage")
    bake(o)
    o.data.transform(Matrix.Scale(0.9, 4))
    wobble(o, 0.004, 81)
    smooth(o, 55)
    ao(o, 0.45, rays=12, strength=0.7, edge=0.3)
    return o


def relief(name, m, rings, segs, height_col, center=True):
    """A displaced disc on a polar grid: rings = [radius, ...] from the rim
    inwards, segs points round each. height_col(rho, phi) -> (z, (r, g, b))
    gives each point's height out of the face (+Z) and its colour (sRGB).
    Writes the colour straight into "Col" (one per vertex)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    grid = []
    cols = []
    for rho in rings:
        row = []
        for k in range(segs):
            phi = k / segs * math.tau
            z, c = height_col(rho, phi)
            row.append(bm.verts.new((math.cos(phi) * rho, math.sin(phi) * rho, z)))
            cols.append(c)
        grid.append(row)
    for j in range(len(grid) - 1):
        a, b = grid[j], grid[j + 1]
        for k in range(segs):
            k2 = (k + 1) % segs
            bm.faces.new((a[k], a[k2], b[k2], b[k]))
    if center:
        z, c = height_col(0.0, 0.0)
        cv = bm.verts.new((0.0, 0.0, z))
        cols.append(c)
        last = grid[-1]
        for k in range(segs):
            bm.faces.new((last[k], last[(k + 1) % segs], cv))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    # face normals must point out of the face (+Z)
    if sum(pp.normal.z for pp in o.data.polygons) < 0:
        o.data.flip_normals()
    fill_col(o, (1.0, 1.0, 1.0))
    col = o.data.color_attributes["Col"]
    lin = [srgb_to_linear(c) for c in cols]
    for li, lp in enumerate(o.data.loops):
        c = lin[lp.vertex_index]
        col.data[li].color = (c[0], c[1], c[2], 1.0)
    smooth(o, 70)
    return o


def ammonite(r, m, seed, turns=4.0, ribs=24, segs=144, per_whorl=8, shell=(0.82, 0.75, 0.6),
             matrix=(0.5, 0.42, 0.3)):
    """An ammonite weathering out of the rock face, as a relief on the XY
    plane (+Z out of the face), radius r. The shell is a logarithmic coil
    (each whorl 1.75 times the one inside it), every whorl a rounded tube
    with a groove between it and the next, crossed by ribs that sweep
    forward as they reach the outer edge; the coil ends at the opening, so
    the outline is a spiral, not a circle. Round it, a shallow chipped
    hollow in the matrix sinks into the rock. Ivory on the rib crests,
    browner down in the grooves and into the coil."""
    rnd = random.Random(seed)
    W = 1.75
    b = math.log(W) / math.tau
    tmax = turns * math.tau
    rim = 1.16
    lift = 0.07
    rot = rnd.uniform(0, math.tau)

    def hc(rho, phi):
        rho = rho / r
        if rho < 1e-4:
            return (lift + 0.02) * r, tuple(c * 0.62 for c in shell)
        ph = (phi + rot) % math.tau
        k = math.ceil((tmax + math.log(rho) / b - ph) / math.tau)
        th = ph + math.tau * k
        if th > tmax:
            # the matrix round the shell: a chipped hollow sinking into the rock at the rim
            out = max(0.0, (rho - 0.94) / (rim - 0.94))
            z = -0.012 - 0.07 * out * out
            v = 0.72 + 0.12 * out
            return z * r, tuple(c * v for c in matrix)
        ro = math.exp(b * (th - tmax))
        ri = ro / W
        sx = (rho - ri) / (ro - ri)
        w = ro - ri
        prof = math.sin(math.pi * sx) ** 0.55
        phase = ribs * th + 1.6 * sx * sx
        rib = (0.5 + 0.5 * math.cos(phase)) ** 2.5
        z = lift * (1.0 - 0.5 * (1.0 - ro)) + w * (0.42 * prof + 0.16 * rib * (0.25 + 0.75 * prof))
        # the opening: a flared lip on the last few degrees of the coil
        if tmax - th < 0.25:
            z += w * 0.12 * (1.0 - (tmax - th) / 0.25)
        groove = 1.0 - prof
        inner = 1.0 - 0.18 * (1.0 - ro)
        v = (0.72 + 0.4 * rib * prof) * (1.0 - 0.45 * groove ** 3) * inner
        c = (shell[0] * v, shell[1] * v * (0.98 - 0.04 * groove), shell[2] * v * (0.94 - 0.1 * groove))
        return z * r, c

    rings = [rim * r, 1.08 * r, 1.0 * r]
    rho = 1.0
    step = math.exp(-math.log(W) / per_whorl)
    while rho > math.exp(-turns * math.log(W)) * 0.8:
        rho *= step
        rings.append(rho * r)
    return relief("ammonite", m, rings, segs, hc)


def fossil_slab():
    """A wall of shelly sandstone in the Fossil Bed, ammonites standing out of
    it in relief: an outcrop of five beds, each its own thickness and colour
    with a ledge where it overhangs the one below; a big ammonite, two middle
    ones and a scatter of small ones weathering out of the face, each in its
    own shallow hollow; a fallen one and broken slabs at the foot. Its face
    is -Y (the game turns it to face the shaft)."""
    sand_m = mat("sand_paint", color=(1.0, 1.0, 1.0), rough=0.92)
    fossil_m = mat("fossil_paint", color=(1.0, 1.0, 1.0), rough=0.7)
    rnd = random.Random(85)
    beds = []
    z = 0.0
    tones = [(0.6, 0.5, 0.36), (0.7, 0.6, 0.44), (0.64, 0.54, 0.4), (0.74, 0.64, 0.48), (0.66, 0.55, 0.4)]
    faces = []
    for k, hb in enumerate((0.42, 0.3, 0.46, 0.34, 0.36)):
        w = 1.35 - 0.06 * k + rnd.uniform(-0.05, 0.05)
        front = -0.32 + rnd.uniform(-0.06, 0.06) + 0.02 * k
        outline = []
        for i in range(14):
            a = i / 14 * math.tau
            x = math.cos(a) * w * (1.0 + 0.06 * math.sin(a * 3 + k))
            y = math.sin(a) * 0.36
            if y < 0:
                y = max(y, front) if abs(x) < w * 0.85 else y * 0.8
            outline.append((x, y))
        me = bpy.data.meshes.new("bed")
        bm = bmesh.new()
        bot = [bm.verts.new((x, y, z)) for (x, y) in outline]
        top = [bm.verts.new((x * 0.98, y * 0.98, z + hb)) for (x, y) in outline]
        for i in range(len(outline)):
            j = (i + 1) % len(outline)
            bm.faces.new((bot[i], bot[j], top[j], top[i]))
        bm.faces.new(list(reversed(bot)))
        bm.faces.new(top)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        bed = bpy.data.objects.new("bed", me)
        bpy.context.collection.objects.link(bed)
        bed.data.materials.append(sand_m)
        subdivide(bed, 2)
        off = Vector((k * 3.0, 1.0, 2.0))
        for v in bed.data.vertices:
            v.co += v.normal * 0.025 * noise.noise(v.co * 3.0 + off)
        fill_col(bed, tones[k])
        paint_rgb(bed, lambda p, nn: (lambda kk: (kk, kk, kk))(0.86 + 0.26 * max(0.0, nn.z) - 0.1 * max(0.0, -nn.z)))
        beds.append(bed)
        faces.append((z, z + hb, front))
        z += hb
    rock = join(beds, "rock")
    bake(rock)
    # Ammonites on the face, each in a hollow (the rock round it painted
    # darker, as if it had been chipped out).
    ams = []
    hollows = []
    specs = [(-0.42, 0.95, 0.42), (0.55, 1.35, 0.26), (0.48, 0.42, 0.22), (-0.95, 0.4, 0.14), (0.05, 1.7, 0.12),
             (-0.75, 1.55, 0.1), (0.95, 0.85, 0.12), (0.15, 0.28, 0.09)]
    for (x, zc, r) in specs:
        fy = None
        for (z0, z1, front) in faces:
            if z0 <= zc <= z1:
                fy = front
        if fy is None:
            fy = -0.3
        am = ammonite(r, fossil_m, int(r * 100), turns=4.0 if r > 0.2 else 3.4,
                      ribs=24 if r > 0.2 else 18, segs=160 if r > 0.3 else (112 if r > 0.2 else 64),
                      per_whorl=9 if r > 0.2 else 6)
        bake(am)
        am.data.transform(Matrix.Rotation(R90, 4, "X"))
        am.data.transform(Matrix.Rotation(rnd.uniform(0, math.tau), 4, "Y"))
        am.data.transform(Matrix.Translation((x, fy - r * 0.02, zc)))
        ams.append(am)
        hollows.append((Vector((x, fy, zc)), r))
    def hollow(p, nn):
        k = 1.0
        for (c, r) in hollows:
            d = (Vector((p.x, 0, p.z)) - Vector((c.x, 0, c.z))).length
            if p.y < c.y + 0.12:
                if d < r * 1.25:
                    k *= 0.72 + 0.28 * max(0.0, (d - r) / (r * 0.25)) if d > r else 0.72
        return (k, k, k * 0.96)
    paint_rgb(rock, hollow)
    edge_wear(rock, 1.18, 0.8)
    a_all = join(ams, "ammonites")
    bake(a_all)
    # At its foot: a fallen block with an ammonite on its broken face, and broken slabs.
    foot = []
    fb = lump(0.2, Vector((0, 0, 0)), sand_m, 77, scale=(1.5, 1.1, 0.75), sub=2, rough=0.22, flat_bottom=-0.08)
    fill_col(fb, tones[1])
    paint_rgb(fb, lambda p, nn: (lambda kk: (kk, kk, kk))(0.85 + 0.25 * max(0.0, nn.z)))
    big = ammonite(0.17, fossil_m, 3, turns=3.6, ribs=20, segs=96, per_whorl=7)
    bake(big)
    big.data.transform(Matrix.Translation((0.0, 0.0, 0.12)))
    fbj = join([fb, big], "fallen")
    bake(fbj)
    fbj.data.transform(Matrix.Translation((1.12, -0.72, 0.1)) @ Matrix.Rotation(-0.5, 4, "Z") @ Matrix.Rotation(0.35, 4, "X"))
    foot.append(fbj)
    for kk in range(7):
        a = rnd.uniform(math.pi * 1.1, math.pi * 1.9)
        sl = lump(rnd.uniform(0.1, 0.22), Vector((math.cos(a) * 1.25, -0.2 + math.sin(a) * 0.65, 0.02)), sand_m, 850 + kk,
                  scale=(1.4, 1.0, 0.45), sub=1, rough=0.3)
        fill_col(sl, tones[kk % 5])
        foot.append(sl)
    o = join([rock, a_all] + foot, "FossilSlab")
    bake(o)
    # Lean back a little so the face catches the headlamp.
    o.data.transform(Matrix.Rotation(math.radians(-8), 4, "X"))
    smooth(o, 45)
    ao(o, 0.35, rays=12, strength=0.65, edge=0.3)
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
    """A lake of lava skinned over (Lava Lakes; the Outer Core reuses it as
    molten iron): a cooled black crust broken into plates that fit together
    like a cracked plate, the melt glowing in every crack, the plates' edges
    scorched red and turned up; an open, glowing patch where the crust has
    sunk; a raised rim of cooled rock and basalt boulders round the shore.
    In the game the light sits low over it (it lights the walls) and embers
    rise from the cracks."""
    from scipy.spatial import Voronoi
    crust = mat("crust_paint", color=(1.0, 1.0, 1.0), rough=0.88)
    melt = mat("melt", color=(0.95, 0.4, 0.1), rough=0.3, emit=4.0)
    rnd = random.Random(34)
    R = 1.4

    def shore(a):
        return R * (1.0 + 0.14 * math.sin(a * 3 + 1.0) + 0.07 * math.sin(a * 5 + 2.0))

    parts = []
    # The melt: a disc just under the crust.
    me = bpy.data.meshes.new("melt")
    bm = bmesh.new()
    c = bm.verts.new((0, 0, 0.0))
    ring = []
    for i in range(40):
        a = i / 40 * math.tau
        r = shore(a) * 1.02
        ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r * 0.8, 0.0)))
    for i in range(40):
        bm.faces.new((c, ring[i], ring[(i + 1) % 40]))
    bm.to_mesh(me)
    bm.free()
    pool = bpy.data.objects.new("pool", me)
    bpy.context.collection.objects.link(pool)
    pool.data.materials.append(melt)
    parts.append(pool)
    # Crust plates: Voronoi cells over the lake, shrunk to leave cracks.
    pts = []
    while len(pts) < 46:
        x, y = rnd.uniform(-R * 1.2, R * 1.2), rnd.uniform(-R, R)
        pts.append((x, y))
    for i in range(24):
        a = i / 24 * math.tau
        pts.append((math.cos(a) * R * 2.2, math.sin(a) * R * 1.8))
    vor = Voronoi(pts)
    open_c = Vector((0.35, -0.15, 0))
    plates = []
    for pi_, reg_i in enumerate(vor.point_region[:46]):
        reg = vor.regions[reg_i]
        if -1 in reg or len(reg) < 3:
            continue
        poly = [Vector((vor.vertices[v][0], vor.vertices[v][1], 0)) for v in reg]
        cen = sum(poly, Vector()) / len(poly)
        a = math.atan2(cen.y / 0.8, cen.x)
        if math.hypot(cen.x, cen.y / 0.8) > shore(a) * 0.92:
            continue
        if (cen - open_c).length < 0.32:
            continue     # the open patch where the crust has gone down
        gap = rnd.uniform(0.035, 0.06)
        shrunk = []
        for p in poly:
            d = p - cen
            L = d.length
            q = cen + d * max(0.2, (L - gap) / max(L, 1e-4))
            aa = math.atan2(q.y / 0.8, q.x)
            lim = shore(aa) * 0.98
            rr = math.hypot(q.x, q.y / 0.8)
            if rr > lim:
                q = Vector((q.x * lim / rr, q.y * lim / rr, 0))
            shrunk.append(q)
        th = rnd.uniform(0.05, 0.08)
        me = bpy.data.meshes.new("plate")
        bm = bmesh.new()
        b0 = [bm.verts.new((p.x, p.y, -0.01)) for p in shrunk]
        # top: edges turned up a little, the middle sagging
        t0 = [bm.verts.new((p.x, p.y, th + 0.015)) for p in shrunk]
        tc = bm.verts.new((cen.x, cen.y, th - 0.01))
        nn = len(shrunk)
        for i in range(nn):
            j = (i + 1) % nn
            bm.faces.new((b0[i], b0[j], t0[j], t0[i]))
            bm.faces.new((t0[i], t0[j], tc))
        bm.faces.new(list(reversed(b0)))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        pl = bpy.data.objects.new("plate", me)
        bpy.context.collection.objects.link(pl)
        pl.data.materials.append(crust)
        subdivide(pl, 1)
        off = Vector((pi_ * 1.7, 0.3, 0.9))
        for v in pl.data.vertices:
            if v.co.z > 0.02:
                v.co.z += 0.012 * noise.noise(v.co * 9.0 + off) + 0.006 * math.sin(v.co.x * 30 + v.co.y * 11)
        # scorched red towards the cracks, near-black in the middle
        cen2 = cen.copy()
        fill_col(pl, (0.13, 0.11, 0.1))
        maxd = max((p - cen2).length for p in shrunk)
        paint_rgb(pl, lambda p, nrm, c0=cen2, md=maxd: (lambda t: (1.0 + 2.6 * t, 1.0 + 0.5 * t, 1.0 - 0.3 * t))(
            max(0.0, min(1.0, ((Vector((p.x, p.y, 0)) - c0).length / md - 0.7) / 0.3)) ** 1.5))
        tilt = (rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), 0)
        if (cen - open_c).length < 0.6 and rnd.random() < 0.6:
            tilt = (rnd.uniform(0.15, 0.3), rnd.uniform(-0.15, 0.15), 0)    # tipping into the open patch
        pl.data.transform(Matrix.Translation(cen) @ Matrix.Rotation(tilt[0], 4, "X") @ Matrix.Rotation(tilt[1], 4, "Y") @ Matrix.Translation(-cen))
        plates.append(pl)
    parts += plates
    # The rim: cooled rock heaped round the shore, and boulders.
    rim = []
    for i in range(30):
        a = i / 30 * math.tau + rnd.uniform(-0.05, 0.05)
        r = shore(a) * rnd.uniform(1.0, 1.08)
        rim.append(lump(rnd.uniform(0.12, 0.2), Vector((math.cos(a) * r, math.sin(a) * r * 0.8, 0.0)), crust, 40 + i,
                        scale=(1.6, 1.0, 0.5), sub=2, rough=0.25))
    for i in range(8):
        a = rnd.uniform(0, math.tau)
        r = shore(a) * rnd.uniform(1.15, 1.35)
        rim.append(lump(rnd.uniform(0.15, 0.3), Vector((math.cos(a) * r, math.sin(a) * r * 0.8, 0.05)), crust, 80 + i,
                        scale=(1.2, 1.0, 0.8), sub=2, rough=0.3))
    rj = join(rim, "rim")
    bake(rj)
    fill_col(rj, (0.16, 0.14, 0.13))
    paint_rgb(rj, lambda p, nn: (lambda inner: (1.0 + 1.6 * inner, 1.0 + 0.3 * inner, 1.0))(
        max(0.0, min(1.0, 1.0 - (math.hypot(p.x, p.y / 0.8) - R * 0.95) / 0.25)) * max(0.0, -nn.z * 0.5 + 0.5)))
    edge_wear(rj, 1.35, 0.8)
    parts.append(rj)
    o = join(parts, "LavaPool")
    bake(o)
    ao(o, 0.3, rays=10, strength=0.5, edge=0.3)
    return o


def _bed_slab(z0, z1, sx, sy, n=48):
    """A closed slab between two surfaces z0(x) < z1(x), running right
    through in Y, wider than the block it will be cut from."""
    me = bpy.data.meshes.new("slab")
    bm = bmesh.new()
    cols = []
    for i in range(n + 1):
        x = -sx + 2 * sx * i / n
        cols.append([bm.verts.new((x, y, z)) for (y, z) in ((-sy, z0(x)), (sy, z0(x)), (sy, z1(x)), (-sy, z1(x)))])
    for i in range(n):
        a, b2 = cols[i], cols[i + 1]
        for k in range(4):
            k2 = (k + 1) % 4
            bm.faces.new((a[k], b2[k], b2[k2], a[k2]))
    bm.faces.new(cols[0])
    bm.faces.new(list(reversed(cols[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("slab", me)
    bpy.context.collection.objects.link(o)
    return o


def _intersect(block, slab):
    """A copy of `block` cut down to where it overlaps `slab` (exact boolean)."""
    piece = block.copy()
    piece.data = block.data.copy()
    bpy.context.collection.objects.link(piece)
    mod = piece.modifiers.new("cut", "BOOLEAN")
    mod.operation = "INTERSECT"
    mod.solver = "EXACT"
    mod.object = slab
    apply_mods(piece)
    return piece


def fold_block(size, seed, rock, melt, tones, shear=0.25, curve=0.95, cuts=30):
    """A rough block of mantle rock cut through a fold, like a road cutting:
    the beds sag into a trough (and lean over to one side) and run right
    through the block, so every face shows them. Each bed is its own solid
    (the block cut by a slab between two fold surfaces), so the bedding
    lines are crisp curves and each bed one flat shade, lit on top; molten
    rock fills a thin seam between some of the beds and glows on every face
    it reaches. Returns [beds, seams]."""
    rnd = random.Random(seed)
    sx, sy, sz = size
    block = box(size, (0, 0, sz / 2), rock, bevel=0.0)
    subdivide(block, 6)
    off = Vector((seed * 1.3, 2.0, 0.7))
    for v in block.data.vertices:
        top = max(0.0, (v.co.z - sz * 0.6) / (sz * 0.4))
        ends = max(0.0, (abs(v.co.x) - sx * 0.3) / (sx * 0.2))
        n = noise.noise(v.co * (2.4 / max(sz, 0.5)) + off)
        v.co.z -= (0.25 * sz) * top * max(0.0, n + 0.3)
        v.co.x -= math.copysign(0.18 * sx * ends * max(0.0, n + 0.2), v.co.x)
        v.co += v.normal * 0.02 * noise.noise(v.co * 5.0 + off)
        if v.co.z < 0.02:
            v.co.z = min(v.co.z, 0.0)
    bounds = [0.0]
    while bounds[-1] < 3.0 * sz:
        bounds.append(bounds[-1] + rnd.uniform(0.08, 0.17) * sz)
    hot = set(i for i in range(1, len(bounds) - 1) if rnd.random() < 0.3)
    w = 0.022 * sz / 1.6

    def base_z(x):
        u = x / (sx * 0.5)
        return -curve * sz * 0.6 * (1.0 - u * u) + shear * x - 0.6 * sz

    beds, seams = [], []
    for i in range(len(bounds) - 1):
        lo = bounds[i] + (w / 2 if i in hot else 0.0)
        hi = bounds[i + 1] - (w / 2 if (i + 1) in hot else 0.0)
        slab = _bed_slab(lambda x, lo=lo: base_z(x) + lo, lambda x, hi=hi: base_z(x) + hi, sx, sy)
        piece = _intersect(block, slab)
        bpy.data.objects.remove(slab)
        if len(piece.data.polygons) == 0:
            bpy.data.objects.remove(piece)
            continue
        t = tones[i % len(tones)]
        fill_col(piece, t)
        paint_rgb(piece, lambda p, nn: (lambda k: (k, k, k))((0.82 + 0.3 * max(0.0, nn.z) - 0.08 * max(0.0, -nn.z)) * 1.1))
        beds.append(piece)
        if (i + 1) in hot:
            sl = _bed_slab(lambda x, hi=hi: base_z(x) + hi, lambda x, hi=hi: base_z(x) + hi + w, sx, sy)
            sp = _intersect(block, sl)
            bpy.data.objects.remove(sl)
            if len(sp.data.polygons) == 0:
                bpy.data.objects.remove(sp)
            else:
                sp.data.materials.clear()
                sp.data.materials.append(melt)
                fill_col(sp, (1.0, 1.0, 1.0))
                seams.append(sp)
    bpy.data.objects.remove(block)
    bj = join(beds, "beds")
    edge_wear(bj, 1.3, 0.72)
    return [bj] + ([join(seams, "seams")] if seams else [])


def mantle_rocks():
    """Rock that flows (the Mantle): a block of dark olive peridotite cut
    across a fold, its beds bowed up into an arch and leaning over where the
    rock crept, each bed its own shade, molten rock glowing in the seams
    between some of them; a smaller fallen block showing the same beds, and
    hot rubble round their feet. The light sits in front of it in the game."""
    rock = mat("peridotite_paint", color=(1.0, 1.0, 1.0), rough=0.85)
    melt = mat("melt", color=(0.95, 0.42, 0.12), rough=0.3, emit=4.0)
    rnd = random.Random(35)
    tones = [(0.48, 0.49, 0.28), (0.3, 0.31, 0.18), (0.56, 0.54, 0.32), (0.38, 0.39, 0.23), (0.25, 0.26, 0.15), (0.52, 0.49, 0.29),
             (0.35, 0.36, 0.21)]
    big = fold_block((2.5, 1.0, 1.6), 1, rock, melt, tones)
    small = fold_block((1.0, 0.7, 0.75), 7, rock, melt, tones, shear=-0.3, cuts=16)
    for piece in small:
        piece.data.transform(Matrix.Translation((1.45, -0.7, -0.08)) @ Matrix.Rotation(0.7, 4, "Z") @ Matrix.Rotation(0.25, 4, "Y"))
    rub = []
    for i in range(12):
        a = rnd.uniform(math.pi * 1.05, math.pi * 1.95)
        d = rnd.uniform(0.9, 1.6)
        rb = lump(rnd.uniform(0.07, 0.16), Vector((math.cos(a) * d, math.sin(a) * d * 0.6 - 0.3, 0.0)), rock, 700 + i,
                  scale=(1.4, 1.0, 0.55), sub=1, rough=0.35)
        fill_col(rb, tones[i % len(tones)])
        rub.append(rb)
    for i in range(4):
        a = rnd.uniform(math.pi * 1.2, math.pi * 1.8)
        rub.append(lump(rnd.uniform(0.05, 0.09), Vector((math.cos(a) * 0.8, math.sin(a) * 0.5 - 0.35, -0.02)), melt, 750 + i,
                        scale=(1.5, 1.0, 0.3), sub=1, rough=0.3))
    rj = join(rub, "rubble")
    bake(rj)
    edge_wear(rj, 1.25, 0.8)
    o = join(big + small + [rj], "MantleRocks")
    bake(o)
    ao(o, 0.35, rays=8, strength=0.55, edge=0.3)
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

