"""Shared helpers for the Dig to the Core model scripts (Blender 5.2, run headless).

Conventions: metres; Blender +Y is "forward" (it becomes Godot's -Z after the
glTF export), +Z is up. Each model is built from a few meshes with bevels,
joined, given hand-made wobble, and a vertex colour that bakes in cheap
ambient occlusion and edge wear (concave creases darker, convex edges lighter,
a little top light). Materials are flat palette colours with roughness and
metal; Godot multiplies them by the vertex colour.
"""
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))

# The art bible's seven swatches (sRGB). Every other colour below is a tint
# or a mix of these, so the models stay on palette.
SWATCH = {
    "amber": (0.949, 0.71, 0.267),      # Lamp Amber
    "brass": (0.753, 0.541, 0.243),     # Hoist Brass
    "cream": (0.937, 0.89, 0.784),      # Enamel Cream
    "red": (0.71, 0.2, 0.165),          # Signal Red
    "soot": (0.141, 0.11, 0.09),        # Soot Iron
    "verdigris": (0.31, 0.639, 0.569),  # Verdigris
    "umber": (0.42, 0.29, 0.18),        # Topsoil Umber
}


def mix(a, b, t):
    a = SWATCH.get(a, a) if isinstance(a, str) else a
    b = SWATCH.get(b, b) if isinstance(b, str) else b
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


PAL = dict(SWATCH)
PAL.update({
    # metals: soot iron worn toward cream
    "iron": mix("soot", "cream", 0.16),
    "steel": mix("soot", "cream", 0.42),
    "bright_steel": mix("soot", "cream", 0.64),
    # tool steel: a touch of verdigris cools it, so it doesn't turn gold under the lamp
    "tool_steel": mix(mix("soot", "cream", 0.66), "verdigris", 0.14),
    "dark_steel": mix("soot", "cream", 0.08),
    # timber: umber toward amber (fresh) or soot (old)
    "wood": mix(mix("umber", "amber", 0.28), "cream", 0.08),
    "wood_dark": mix("umber", "soot", 0.42),
    "wood_grey": mix(mix("umber", "cream", 0.32), "soot", 0.12),
    "leather": mix("umber", "amber", 0.42),
    "leather_dark": mix("umber", "soot", 0.25),
    "canvas": mix("umber", "soot", 0.55),
    "work_shirt": mix(mix("verdigris", "umber", 0.55), "soot", 0.25),
    "work_shirt_dark": mix(mix("verdigris", "umber", 0.55), "soot", 0.55),
    "leather_worn": mix(mix("umber", "amber", 0.42), "cream", 0.22),
    "tape": mix("soot", "umber", 0.3),
    "rubber": mix("soot", "umber", 0.15),
    "rope": mix("brass", "cream", 0.35),
    # living things
    "fur": mix("soot", "umber", 0.55),
    "fur_light": mix("umber", "cream", 0.25),
    "pink": mix("red", "cream", 0.55),
    "leaf": mix(mix("verdigris", "umber", 0.45), "amber", 0.18),
    "leaf_dark": mix(mix(mix("verdigris", "umber", 0.45), "amber", 0.12), "soot", 0.35),
    "pine": mix("verdigris", "soot", 0.58),
    "leaf_maple": mix(mix("verdigris", "umber", 0.4), "amber", 0.26),
    "leaf_birch": mix(mix("verdigris", "amber", 0.42), "umber", 0.12),
    "birch_bark": mix("cream", "soot", 0.08),
    "bark": mix("umber", "soot", 0.35),
    # stone and bone
    "stone": mix(mix("soot", "cream", 0.5), "umber", 0.15),
    "bone": mix("cream", "umber", 0.16),
    "tin": mix("soot", "cream", 0.55),
    # light
    "glass": mix("amber", "cream", 0.35),
    "glow_red": mix("red", "amber", 0.35),
    "laser": mix("red", "amber", 0.15),
})

_mats = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()


def srgb_to_linear(c):
    return tuple(((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c)


def mat(name, color=None, metal=0.0, rough=0.7, emit=0.0):
    """A flat palette material. Godot multiplies it by the vertex colour.
    Palette values are sRGB (as picked); Blender and glTF want linear."""
    key = (name, tuple(color) if color is not None else None, metal, rough, emit)
    if key in _mats:
        return _mats[key]
    c = srgb_to_linear(PAL.get(name, (0.8, 0.8, 0.8)) if color is None else color)
    m = bpy.data.materials.new(name or "paint")
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (c[0], c[1], c[2], 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emit > 0.0:
        bsdf.inputs["Emission Color"].default_value = (c[0], c[1], c[2], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit
    # Use the vertex colour in the material too, so Cycles previews show the wear.
    nodes = m.node_tree.nodes
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs[6].default_value = (c[0], c[1], c[2], 1.0)
    m.node_tree.links.new(attr.outputs["Color"], mix.inputs[7])
    m.node_tree.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    _mats[key] = m
    return m


def _set_mat(obj, m):
    obj.data.materials.clear()
    obj.data.materials.append(m)


def box(size, loc=(0, 0, 0), m=None, rot=(0, 0, 0), bevel=0.0, segs=2, name="box"):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        bevel_obj(o, bevel, segs)
    if m:
        _set_mat(o, m)
    return o


def cyl(r, depth, loc=(0, 0, 0), m=None, rot=(0, 0, 0), verts=12, r2=None, bevel=0.0, segs=2, name="cyl"):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    if bevel > 0:
        bevel_obj(o, bevel, segs)
    if m:
        _set_mat(o, m)
    return o


def sphere(r, loc=(0, 0, 0), m=None, scale=(1, 1, 1), segs=16, rings=10, name="sphere"):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if m:
        _set_mat(o, m)
    return o


def torus(r_major, r_minor, loc=(0, 0, 0), m=None, rot=(0, 0, 0), maj=16, mi=6, name="torus"):
    bpy.ops.mesh.primitive_torus_add(major_radius=r_major, minor_radius=r_minor, major_segments=maj, minor_segments=mi,
                                     location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    if m:
        _set_mat(o, m)
    return o


def from_profile(points, depth, m=None, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, name="profile"):
    """Extrudes a 2D outline (x, z pairs) along y by `depth`, centred."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((p[0], -depth / 2, p[1])) for p in points]
    face = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.y += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    if bevel > 0:
        bevel_obj(o, bevel, 2)
    if m:
        _set_mat(o, m)
    return o


def bar(sides, radius, length, rings, loc=(0, 0, 0), m=None, name="bar"):
    """A prism along +Y from loc, with `rings` segments along its length (so
    it can be twisted or bent)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    layers = []
    for r in range(rings + 1):
        y = length * r / rings
        ring = [bm.verts.new((math.cos(a) * radius, y, math.sin(a) * radius))
                for a in [i / sides * math.tau + math.pi / sides for i in range(sides)]]
        layers.append(ring)
    for r in range(rings):
        a, b = layers[r], layers[r + 1]
        for i in range(sides):
            bm.faces.new((a[i], a[(i + 1) % sides], b[(i + 1) % sides], b[i]))
    bm.faces.new(list(reversed(layers[0])))
    bm.faces.new(layers[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.location = loc
    bpy.context.view_layer.objects.active = o
    if m:
        _set_mat(o, m)
    return o


def bevel_obj(o, width, segs=2):
    mod = o.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segs
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(35)
    apply_mods(o)


def apply_mods(o):
    bpy.context.view_layer.objects.active = o
    for mod in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def taper(o, axis="Y", amount=0.5):
    mod = o.modifiers.new("taper", "SIMPLE_DEFORM")
    mod.deform_method = "TAPER"
    mod.factor = amount
    mod.deform_axis = axis
    apply_mods(o)


def bend(o, angle, axis="Z"):
    mod = o.modifiers.new("bend", "SIMPLE_DEFORM")
    mod.deform_method = "BEND"
    mod.angle = angle
    mod.deform_axis = axis
    apply_mods(o)


def twist(o, angle, axis="Y"):
    mod = o.modifiers.new("twist", "SIMPLE_DEFORM")
    mod.deform_method = "TWIST"
    mod.angle = angle
    mod.deform_axis = axis
    apply_mods(o)


def subdivide(o, cuts=1):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.subdivide(number_cuts=cuts)
    bpy.ops.object.mode_set(mode="OBJECT")


def wobble(o, amount, seed=1):
    """Hand-made imperfection: nudges every vertex a little (same nudge for
    vertices at the same spot, so nothing tears)."""
    rnd = random.Random(seed)
    cache = {}
    for v in o.data.vertices:
        key = (round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4))
        if key not in cache:
            cache[key] = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * amount
        v.co += cache[key]


def attach(child, parent, pivot):
    """Parents `child` to `parent` with its origin at `pivot` (world), keeping
    it where it is: the node a game script rotates (a wheel, a pair of paws)."""
    from mathutils import Matrix, Vector
    pv = Vector(pivot)
    child.data.transform(Matrix.Translation(child.matrix_world.translation - pv))
    child.location = pv
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def join(objs, name):
    # Detail painted into some parts' vertex colour must survive: give the
    # rest a plain white one first (else they'd come out black).
    if any(o.type == "MESH" and "Col" in o.data.color_attributes for o in objs):
        white_col([o for o in objs if o.type == "MESH"])
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    # Bake the first part's rotation and scale in, so later edits are in world axes.
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return o


def lathe(profile, segs=16, name="lathe", m=None, loc=(0, 0, 0)):
    """Spins a profile of (radius, z) points round the Z axis (closed at the
    ends when the radius there is 0)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for (r, z) in profile:
        if r <= 1e-5:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((math.cos(a) * r, math.sin(a) * r, z))
                          for a in [i / segs * math.tau for i in range(segs)]])
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for j in range(segs):
                bm.faces.new((a[0], b[j], b[(j + 1) % segs]))
        elif len(b) == 1:
            for j in range(segs):
                bm.faces.new((a[j], b[0], a[(j + 1) % segs]))
        else:
            for j in range(segs):
                bm.faces.new((a[j], a[(j + 1) % segs], b[(j + 1) % segs], b[j]))
    if len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.location = loc
    bpy.context.view_layer.objects.active = o
    if m:
        _set_mat(o, m)
    return o


def place(o, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    """Moves, turns and scales an object, then bakes that into its mesh."""
    o.location = loc
    o.rotation_euler = rot
    o.scale = scale
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def smooth(o, angle=40):
    """Smooth shading below `angle` degrees, flat above (crisp bevels)."""
    me = o.data
    for p in me.polygons:
        p.use_smooth = True
    try:
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        pass


def strut(a, b, r, m=None, sides=4, name="strut"):
    """A square (or n-sided) timber or rod from point a to point b."""
    a = Vector(a)
    b = Vector(b)
    o = bar(sides, r, 1.0, 1, (0, 0, 0), m, name=name)
    d = b - a
    o.scale = (1.0, d.length, 1.0)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 1, 0)).rotation_difference(d.normalized())
    o.location = a
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def tube(points, radii, m=None, sides=8, cap=True, flat=1.0, name="tube"):
    """A smooth tube through `points` (Vectors) with a radius per point,
    oriented by parallel transport so it never twists; rounded caps. `flat`
    squashes the cross-section (1 = round). One continuous mesh, so it can be
    shaded smooth: fingers, cables, forged steel."""
    pts = [Vector(p) for p in points]
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    n = len(pts)
    tang = []
    for i in range(n):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n - 1)]
        tang.append((b - a).normalized())
    ref = Vector((0, 0, 1)) if abs(tang[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = (ref - tang[0] * ref.dot(tang[0])).normalized()
    rings = []
    for i in range(n):
        if i > 0:
            q = tang[i - 1].rotation_difference(tang[i])
            nrm = (q @ nrm)
            nrm = (nrm - tang[i] * nrm.dot(tang[i])).normalized()
        bi = tang[i].cross(nrm).normalized()
        ring = []
        for k in range(sides):
            a = k / sides * math.tau
            off = nrm * (math.cos(a) * radii[i] * flat) + bi * (math.sin(a) * radii[i])
            ring.append(bm.verts.new(pts[i] + off))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(sides):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
    if cap:
        for (ring, p, t, r) in ((rings[0], pts[0], -tang[0], radii[0]), (rings[-1], pts[-1], tang[-1], radii[-1])):
            tip = bm.verts.new(p + t * r * 0.8)
            for k in range(sides):
                f = (ring[k], ring[(k + 1) % sides], tip) if t.dot(tang[0]) > 0 else (ring[(k + 1) % sides], ring[k], tip)
                bm.faces.new(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if m:
        o.data.materials.append(m)
    for poly in me.polygons:
        poly.use_smooth = True
    return o


def arc(center, axis_u, axis_v, radius, a0, a1, steps):
    """Points on an arc round `center` in the plane of axis_u/axis_v (degrees)."""
    out = []
    for i in range(steps):
        a = math.radians(a0 + (a1 - a0) * i / (steps - 1))
        out.append(Vector(center) + Vector(axis_u) * math.cos(a) * radius + Vector(axis_v) * math.sin(a) * radius)
    return out


def glove(m_leather=None, m_cuff=None, m_sleeve=None, r=0.022, name="Glove", sleeve_len=0.32):
    """A worn leather work glove gripping a handle of radius r that runs along
    X through the origin, and the work-shirt sleeve behind it. The back of the
    hand faces -Y/+Z (towards the viewer), the forearm runs back along -Y and
    down. Built from smooth tubes and a rounded hand block: knuckles standing
    up across the back of the hand, four fingers curled round the handle with
    a crease at each joint, a thumb hooked over them, a stitched seam and a
    wrist strap with a brass stud, a flared gauntlet cuff with a rolled edge;
    then the sleeve, bunched in soft folds, with a turned-back cuff, its seam
    and a button. Returns one object."""
    m_leather = m_leather or mat("leather", rough=0.85)
    m_cuff = m_cuff or mat("leather_dark", rough=0.9)
    m_sleeve = m_sleeve or mat("work_shirt", rough=0.95)
    m_stitch = mat("rope", rough=0.9)
    m_brass = mat("brass", metal=0.8, rough=0.35)
    parts = []
    # The hand: a rounded block behind and above the handle.
    hand = box((0.098, 0.062, 0.07), (0, -0.048, 0.016), m_leather, rot=(0.35, 0, 0), bevel=0.024, segs=3, name="hand")
    for v in hand.data.vertices:
        t = (v.co.y + 0.048) / 0.06
        v.co.x *= 1.0 - 0.12 * max(0.0, -t)
    parts.append(hand)
    xs = (-0.034, -0.0115, 0.0115, 0.0335)
    # Knuckles: a ridge of four bumps where the fingers start, worn pale.
    for k, x in enumerate(xs):
        kn = sphere(0.0128 - 0.001 * abs(k - 1.5), (x * 0.96, -0.024, 0.04 + 0.002 * (k % 2)), mat("leather_worn", rough=0.8), scale=(1.0, 0.95, 0.72), segs=10, rings=6, name="knuckle")
        parts.append(kn)
    # Fingers: one smooth tube each, over the top of the handle and round
    # under it, narrowing at the two joints, slightly fanned and uneven.
    for k, x in enumerate(xs):
        fr = 0.0118 - 0.0009 * abs(k - 1.3)
        rr = r + fr * 0.92
        a0 = 128 + k * 3
        a1 = -78 + (k - 1.5) * 6
        pts = [Vector((x * 0.95, -0.05, 0.03))] + arc((x, 0, 0), (0, 1, 0), (0, 0, 1), rr, a0, a1, 10)
        rad = [fr * 1.15]
        for i in range(10):
            t = i / 9
            joint = 0.86 if i in (3, 6) else 1.0
            rad.append(fr * (1.1 - 0.2 * t) * joint)
        parts.append(tube(pts, rad, m_leather, sides=8, name="finger"))
    # Thumb: out of the side of the hand, hooked round the front over the fingers.
    tp = [Vector((-0.042, -0.06, -0.004)), Vector((-0.05, -0.03, -0.024)), Vector((-0.046, 0.0, -0.034)),
          Vector((-0.032, 0.026, -0.03)), Vector((-0.016, 0.036, -0.016))]
    parts.append(tube(tp, [0.016, 0.0145, 0.0118, 0.012, 0.0105], m_leather, sides=8, name="thumb"))
    # Stitched seams down the back of the hand, between the fingers.
    for x in (-0.023, 0.0, 0.023):
        seam = [Vector((x, -0.085, 0.03)), Vector((x * 1.02, -0.06, 0.044)), Vector((x * 1.05, -0.035, 0.048))]
        parts.append(tube(seam, [0.0022] * 3, m_stitch, sides=4, name="seam"))
    # Wrist strap with a brass stud.
    strap = arc((0, -0.098, 0.0), (1, 0, 0), (0, 0.32, 0.95), 0.05, -100, 100, 9)
    parts.append(tube(strap, [0.0068] * 9, m_cuff, sides=6, flat=0.4, name="strap"))
    parts.append(sphere(0.0065, (0.0, -0.1, 0.05), m_brass, segs=8, rings=5, name="stud"))
    # Gauntlet cuff, flaring back from the wrist, with a rolled edge.
    wrist = Vector((0, -0.105, -0.004))
    back = Vector((0, -1.0, -0.32)).normalized()
    cuff_pts = [wrist + back * (i * 0.028) for i in range(4)]
    parts.append(tube(cuff_pts, [0.038, 0.044, 0.05, 0.054], m_cuff, sides=12, cap=False, flat=0.86, name="cuff"))
    edge = cuff_pts[-1]
    side = back.cross(Vector((1, 0, 0))).normalized()
    ring = arc(edge, Vector((1, 0, 0)), side, 0.054, 0, 360, 15)
    parts.append(tube(ring, [0.0065] * 15, m_cuff, sides=6, cap=False, name="cuffroll"))
    # The sleeve: bunched in soft folds near the wrist, easing out further back.
    n = 12
    sl = [edge + back * 0.004 + back * (sleeve_len * i / (n - 1)) for i in range(n)]
    srad = [0.05 + 0.011 * min(1.0, i / 3) for i in range(n)]
    sleeve = tube(sl, srad, m_sleeve, sides=16, cap=False, flat=0.9, name="sleeve")
    rnd = random.Random(int(sleeve_len * 1000))
    ph = rnd.uniform(0, 6)
    for v in sleeve.data.vertices:
        d = v.co - edge
        along = d.dot(back)
        radial = d - back * along
        if radial.length < 1e-5:
            continue
        a = math.atan2(radial.dot(side), radial.dot(Vector((1, 0, 0))))
        bunch = math.exp(-along / (sleeve_len * 0.45))
        fold = math.sin(along * 70.0 + 1.8 * math.sin(a * 2.0 + ph)) * (0.0055 * bunch + 0.0018)
        crease = 0.0025 * math.sin(a * 3.0 + along * 25.0)
        v.co += radial.normalized() * (fold + crease)
    parts.append(sleeve)
    # Turned-back shirt cuff over the glove's gauntlet, with its seam and a button.
    cb = [edge + back * 0.006 + back * (0.05 * i / 3) for i in range(4)]
    parts.append(tube(cb, [0.064, 0.066, 0.066, 0.064], m_sleeve, sides=16, cap=False, flat=0.9, name="shirtcuff"))
    seam_ring = arc(edge + back * 0.058, Vector((1, 0, 0)), side, 0.064, 0, 360, 17)
    parts.append(tube(seam_ring, [0.0025] * 17, mat("work_shirt_dark", rough=0.95), sides=4, cap=False, name="cuffseam"))
    parts.append(sphere(0.0075, tuple(edge + back * 0.03 + side * 0.066), mat("bone", rough=0.5), scale=(1, 1, 0.5), segs=8, rings=5, name="button"))
    o = join(parts, name)
    smooth(o, 70)
    wobble(o, 0.0008, 77)
    ao(o, 0.05, strength=0.6, edge=0.5)
    return o


def grain(o, axis, strength=0.22, scale=26.0, seed=1):
    """Wood grain baked into the vertex colour: long streaks along `axis`
    (fine lines and a few darker knots), under whatever AO comes later."""
    from mathutils import noise as _noise
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
            n = _noise.noise(across * scale + off + ax * along * 1.2)
            lines = 0.5 + 0.5 * math.sin((across.length * scale * 2.2) + n * 3.0 + along * 3.0)
            knot = max(0.0, _noise.noise(p * 3.0 + off) - 0.45) * 2.0
            k = 1.0 - strength * (0.6 * lines + 0.8 * knot)
            c = col.data[li].color
            col.data[li].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)


def paint_by(o, fn):
    """Multiplies the vertex colour by fn(position) (worn steel edges, rust)."""
    me = o.data
    white_col([o])
    col = me.color_attributes["Col"]
    for poly in me.polygons:
        for li in poly.loop_indices:
            p = me.vertices[me.loops[li].vertex_index].co
            k = fn(p)
            c = col.data[li].color
            col.data[li].color = (c[0] * k, c[1] * k, c[2] * k, 1.0)


def handle(a, b, r0, r1, m, sides=12, rings=28, name="handle"):
    """A turned wooden handle from a to b (radius r0 to r1), with enough rings
    for the grain to show along it."""
    a = Vector(a)
    b = Vector(b)
    L = (b - a).length
    o = bar(sides, 1.0, L, rings, (0, 0, 0), m, name=name)
    for v in o.data.vertices:
        t = v.co.y / L
        rr = r0 + (r1 - r0) * t
        v.co.x *= rr
        v.co.z *= rr
    q = Vector((0, 1, 0)).rotation_difference((b - a).normalized())
    mm = q.to_matrix().to_4x4()
    mm.translation = a
    o.data.transform(mm)
    grain(o, b - a, 0.28, 60.0, sides + rings)
    smooth(o, 50)
    return o


def tape_wrap(a, b, r, turns, m, width=0.006, name="tape"):
    """Cloth grip tape wound round a handle from a to b: a flat ribbon in a
    tight spiral, each wrap overlapping the last."""
    a = Vector(a)
    b = Vector(b)
    d = (b - a)
    L = d.length
    ax = d.normalized()
    ref = Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((1, 0, 0))
    u = (ref - ax * ref.dot(ax)).normalized()
    w = ax.cross(u)
    pts = []
    steps = int(turns * 14)
    for i in range(steps + 1):
        t = i / steps
        ang = t * turns * math.tau
        pts.append(a + ax * (t * L) + (u * math.cos(ang) + w * math.sin(ang)) * r)
    o = tube(pts, [width] * len(pts), m, sides=4, cap=False, flat=0.35, name=name)
    return o


def ao(o, dist=0.2, rays=14, strength=0.75, seed=5, edge=0.6, top=0.1):
    """Bakes ambient occlusion (rays cast from each vertex over its normal's
    hemisphere) and edge wear (convex edges lighter, creases darker) into the
    "Col" vertex colour. Cheap and good enough for small props."""
    from mathutils.bvhtree import BVHTree
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    rnd = random.Random(seed)
    dirs = []
    while len(dirs) < rays:
        v = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
        if 0.05 < v.length <= 1.0:
            dirs.append(v.normalized())
    shade = {}
    for v in bm.verts:
        n = v.normal
        if n.length < 0.5:
            shade[v.index] = 1.0
            continue
        hit = 0
        tot = 0
        for d in dirs:
            if d.dot(n) < 0:
                d = -d
            tot += 1
            loc, _nrm, _i, _dd = tree.ray_cast(v.co + n * 0.0015, d, dist)
            if loc is not None:
                hit += 1
        occ = hit / max(tot, 1)
        conv = 0.0
        if v.link_edges:
            for e in v.link_edges:
                dv = e.other_vert(v).co - v.co
                if dv.length > 1e-6:
                    conv += -dv.normalized().dot(n)
            conv /= len(v.link_edges)
        s = (1.0 - strength * occ) * (1.0 + edge * 0.5 * conv) + top * n.z
        s *= 1.0 - 0.06 * rnd.random()
        shade[v.index] = max(0.28, min(1.0, s))
    bm.free()
    had = "Col" in me.color_attributes
    if not had:
        me.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
    col = me.color_attributes["Col"]
    me.color_attributes.active_color = col
    for poly in me.polygons:
        for li in poly.loop_indices:
            s = shade[me.loops[li].vertex_index]
            if had:
                # Detail painted in before (wood grain, rust): keep it under the AO.
                c = col.data[li].color
                col.data[li].color = (c[0] * s, c[1] * s, c[2] * s, 1.0)
            else:
                col.data[li].color = (s, s, s, 1.0)


def white_col(objs):
    """Gives every object a plain white "Col" so detail painted into some of
    them survives a join (the others would otherwise come out black)."""
    for o in objs:
        me = o.data
        if "Col" not in me.color_attributes:
            col = me.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
            for d in col.data:
                d.color = (1.0, 1.0, 1.0, 1.0)
            me.color_attributes.active_color = col


def wear(o, strength=1.0, top=0.12, seed=3):
    """Bakes cheap AO and edge wear into a vertex colour: concave creases
    darker, convex edges lighter, the top a touch lighter, plus a little
    per-vertex grime so flat faces aren't perfectly flat."""
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    rnd = random.Random(seed)
    shade = {}
    for v in bm.verts:
        if not v.link_edges:
            shade[v.index] = 1.0
            continue
        conv = 0.0
        for e in v.link_edges:
            d = e.other_vert(v).co - v.co
            if d.length > 1e-6:
                conv += -d.normalized().dot(v.normal)
        conv /= len(v.link_edges)
        s = 1.0 + strength * (0.55 * conv)
        s += top * v.normal.z
        s *= 1.0 - 0.08 * rnd.random()
        shade[v.index] = max(0.35, min(1.3, s))
    bm.free()
    if "Col" not in me.color_attributes:
        me.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
    col = me.color_attributes["Col"]
    me.color_attributes.active_color = col
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            s = min(1.0, shade[vi])
            col.data[li].color = (s, s, s, 1.0)


def export(objs, name):
    """Exports the given objects (with children) as models/<name>.glb."""
    os.makedirs(MODELS, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        for c in o.children_recursive:
            c.select_set(True)
    path = os.path.join(MODELS, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True, use_selection=True,
                              export_vertex_color="ACTIVE", export_yup=True)
    print("exported", name)


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)
