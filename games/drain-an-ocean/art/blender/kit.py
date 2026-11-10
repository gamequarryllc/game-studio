"""Shared helpers for the Drain an Ocean model scripts (Blender 5.2 as a
Python module, headless).

Conventions: metres; Blender +Y is "forward" (it becomes Godot's -Z after the
glTF export), +Z is up. Each model is a few meshes with bevels, joined, given
hand-made wobble (nothing in this game is perfectly straight: it has all
been in the sea), and a vertex colour that bakes in ambient occlusion, edge
wear and painted detail. Materials are flat palette colours; Godot
multiplies them by the vertex colour. The geometry helpers started from the
studio's earlier model scripts.
"""
import math
import os
import random

import bpy  # noqa: F401  (must come before bmesh in the module build)
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))

# The art bible's seven swatches (sRGB). Every other colour is a mix of two.
SWATCH = {
    "teal": (0.059, 0.298, 0.361),      # Deep Teal
    "shoal": (0.31, 0.659, 0.608),      # Shoal Green
    "sand": (0.89, 0.769, 0.561),       # Warm Sand
    "paper": (0.953, 0.918, 0.827),     # Chart Paper
    "coral": (0.878, 0.376, 0.247),     # Coral
    "rust": (0.549, 0.267, 0.145),      # Rust
    "ink": (0.11, 0.165, 0.2),          # Chart Ink
}


def _look(c):
    if isinstance(c, str):
        return SWATCH[c] if c in SWATCH else PAL[c]
    return c


def mix(a, b, t):
    a = _look(a)
    b = _look(b)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


PAL = dict(SWATCH)
PAL.update({
    # timber: sea-greyed, sun-bleached, tarred
    "wood": mix("rust", "sand", 0.48),
    "wood_grey": mix(mix("ink", "sand", 0.52), "paper", 0.08),
    "wood_dark": mix("rust", "ink", 0.5),
    "tar": mix("ink", "rust", 0.2),
    # metals
    "iron": mix("ink", "paper", 0.18),
    "steel": mix("ink", "paper", 0.42),
    "rusty": mix("rust", "coral", 0.18),
    "brass": mix("sand", "rust", 0.32),
    "brass_light": mix("sand", "paper", 0.25),
    "copper": mix("coral", "rust", 0.5),
    "verdigris": mix("shoal", "paper", 0.2),
    # paint
    "paint_red": mix("coral", "rust", 0.25),
    "paint_white": mix("paper", "sand", 0.28),
    "paint_teal": mix("teal", "shoal", 0.45),
    "paint_yellow": mix("sand", "coral", 0.2),
    # stone
    "stone": mix(mix("paper", "ink", 0.48), "sand", 0.3),
    "stone_dark": mix("ink", "sand", 0.3),
    "stone_pale": mix("paper", "sand", 0.35),
    "slate": mix("ink", "teal", 0.35),
    "roof_red": mix("coral", "rust", 0.55),
    # sea life
    "kelp": mix(mix("shoal", "rust", 0.5), "ink", 0.25),
    "kelp_light": mix(mix("shoal", "sand", 0.4), "rust", 0.2),
    "coral_pink": mix("coral", "paper", 0.35),
    "coral_orange": mix("coral", "sand", 0.35),
    "coral_purple": mix(mix("coral", "teal", 0.5), "paper", 0.15),
    "shell": mix("paper", "coral", 0.25),
    "fish_orange": mix("coral", "sand", 0.2),
    "fish_grey": mix("teal", "paper", 0.45),
    "fish_dark": mix("ink", "teal", 0.4),
    "belly": mix("paper", "sand", 0.2),
    "eye": mix("ink", "teal", 0.1),
    "eye_white": SWATCH["paper"],
    "beak": mix("sand", "coral", 0.45),
    "glass": mix("shoal", "paper", 0.5),
    "rope": mix("sand", "rust", 0.25),
    "canvas": mix("paper", "sand", 0.4),
    "rubber": mix("ink", "rust", 0.12),
})

_mats = {}
_named = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    _named.clear()


def srgb_to_linear(c):
    return tuple(((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c)


def mat(name, color=None, metal=0.0, rough=0.7, emit=0.0):
    """A flat palette material. Godot multiplies it by the vertex colour.
    Palette values are sRGB (as picked); Blender and glTF want linear."""
    key = (name, metal, rough, emit)
    if key in _mats:
        return _mats[key]
    if color is None and name in _named:
        color = _named[name]
    if color is not None:
        _named[name] = color
    c = srgb_to_linear(PAL.get(name, (0.8, 0.8, 0.8)) if color is None else color)
    m = bpy.data.materials.new(name)
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
    if "Col" not in me.color_attributes:
        me.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
    col = me.color_attributes["Col"]
    me.color_attributes.active_color = col
    for poly in me.polygons:
        for li in poly.loop_indices:
            s = shade[me.loops[li].vertex_index]
            col.data[li].color = (s, s, s, 1.0)


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


def paint(o, fn):
    """Multiplies the baked shade in "Col" by a colour per vertex:
    fn(co: Vector, normal: Vector) -> (r, g, b) in sRGB. With a white
    material this paints stripes, spots and gradients straight onto a mesh."""
    me = o.data
    if "Col" not in me.color_attributes:
        me.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
        for d in me.color_attributes["Col"].data:
            d.color = (1, 1, 1, 1)
    col = me.color_attributes["Col"]
    me.color_attributes.active_color = col
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index]
            c = fn(v.co, v.normal)
            old = col.data[li].color
            col.data[li].color = (old[0] * c[0], old[1] * c[1], old[2] * c[2], 1.0)


def white():
    return mat("white", (1.0, 1.0, 1.0), rough=0.6)


# --- Second-generation helpers (art review 1) ------------------------------------------------
# Lofted bodies from cross-sections, fins with real thickness and rays,
# ribbons for weed, barnacle clusters and painting helpers. Everything a
# creature or a hull needs to have a silhouette and thickness instead of
# being spheres and flat boards.

def spline(points, t):
    """Catmull-Rom through (t, value) pairs (t ascending); value may be a tuple."""
    ts = [p[0] for p in points]
    if t <= ts[0]:
        return points[0][1]
    if t >= ts[-1]:
        return points[-1][1]
    k = 0
    while ts[k + 1] < t:
        k += 1
    p0 = points[max(k - 1, 0)][1]
    p1 = points[k][1]
    p2 = points[k + 1][1]
    p3 = points[min(k + 2, len(points) - 1)][1]
    u = (t - ts[k]) / (ts[k + 1] - ts[k])
    def cr(a, b, c, d):
        return 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u)
    if isinstance(p1, (tuple, list)):
        return tuple(cr(p0[i], p1[i], p2[i], p3[i]) for i in range(len(p1)))
    return cr(p0, p1, p2, p3)


def loft(rings, name="loft", m=None, cap0=True, cap1=True):
    """A mesh through a list of rings (each a list of Vectors, same count),
    with fan caps at the ends."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for i in range(len(vr) - 1):
        for k in range(n):
            bm.faces.new((vr[i][k], vr[i][(k + 1) % n], vr[i + 1][(k + 1) % n], vr[i + 1][k]))
    for (ring, on) in ((vr[0], cap0), (vr[-1], cap1)):
        if not on:
            continue
        c = Vector((0, 0, 0))
        for v in ring:
            c += v.co
        c /= len(ring)
        tip = bm.verts.new(c)
        for k in range(n):
            bm.faces.new((ring[k], ring[(k + 1) % n], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if m:
        o.data.materials.append(m)
    return o


def body(length, profile, segs=24, steps=28, name="body", m=None, axis_curve=None):
    """A creature's body along +Y (tail at -length/2, nose at +length/2).
    profile: list of (t 0..1 tail->nose, (half_width, half_height, z_offset,
    squareness)) control points; squareness 2 = ellipse, higher = boxier,
    lower = diamond. axis_curve(t) -> (dx, dz) bends the spine."""
    rings = []
    for i in range(steps + 1):
        t = i / steps
        w, hgt, zo, sq = spline(profile, t)
        w = max(w, 0.002)
        hgt = max(hgt, 0.002)
        y = -length / 2 + t * length
        dx, dz = axis_curve(t) if axis_curve else (0.0, 0.0)
        ring = []
        for k in range(segs):
            a = k / segs * math.tau
            ca, sa = math.cos(a), math.sin(a)
            e = 2.0 / max(sq, 0.5)
            x = math.copysign(abs(ca) ** e, ca) * w
            z = math.copysign(abs(sa) ** e, sa) * hgt
            ring.append(Vector((x + dx, y, z + zo + dz)))
        rings.append(ring)
    return loft(rings, name, m)


def fin(root_a, root_b, outline, up, thick=0.02, rays=0, ray_depth=0.35, steps=6, name="fin", m=None, scallop=0.0):
    """A fin with thickness: a fan from the root line (root_a..root_b) out to
    the outline (a list of Vectors along the free edge, from the root_a end
    to the root_b end). It is `thick` at the root and thins to an edge;
    `rays` ridges run from root to edge; `scallop` notches the edge between
    rays. `up` is the side the top surface faces."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    A = Vector(root_a)
    B = Vector(root_b)
    up = Vector(up).normalized()
    n = len(outline)
    top = []
    bot = []
    for i in range(n):
        u = i / (n - 1)
        r = A.lerp(B, u)
        e = Vector(outline[i])
        if scallop > 0 and rays > 0:
            ph = (u * rays) % 1.0
            e = r + (e - r) * (1.0 - scallop * (0.5 - 0.5 * math.cos(ph * math.tau)))
        rowt = []
        rowb = []
        for s in range(steps + 1):
            v = s / steps
            p = r.lerp(e, v)
            th = thick * (1.0 - v) ** 0.8 + 0.0015
            if rays > 0:
                th *= 1.0 + ray_depth * math.cos(u * rays * math.tau)
            rowt.append(bm.verts.new(p + up * th * 0.5))
            rowb.append(bm.verts.new(p - up * th * 0.5))
        top.append(rowt)
        bot.append(rowb)
    for i in range(n - 1):
        for s in range(steps):
            bm.faces.new((top[i][s], top[i + 1][s], top[i + 1][s + 1], top[i][s + 1]))
            bm.faces.new((bot[i][s], bot[i][s + 1], bot[i + 1][s + 1], bot[i + 1][s]))
    for i in range(n - 1):
        bm.faces.new((top[i][steps], top[i + 1][steps], bot[i + 1][steps], bot[i][steps]))
        bm.faces.new((top[i][0], bot[i][0], bot[i + 1][0], top[i + 1][0]))
    for i in (0, n - 1):
        for s in range(steps):
            bm.faces.new((top[i][s], top[i][s + 1], bot[i][s + 1], bot[i][s]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
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


def ribbon(points, widths, normal=(0, 0, 1), thick=0.01, m=None, name="ribbon"):
    """A flat strip through points (weed fronds, straps, kelp blades) with a
    little thickness so it shades from both sides."""
    pts = [Vector(p) for p in points]
    nrm = Vector(normal).normalized()
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rows = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = d.cross(nrm).normalized()
        if side.length < 0.1:
            side = Vector((1, 0, 0))
        w = widths[i]
        up = side.cross(d).normalized() * thick * 0.5
        rows.append([bm.verts.new(p - side * w + up), bm.verts.new(p + side * w + up),
                     bm.verts.new(p + side * w - up), bm.verts.new(p - side * w - up)])
    for i in range(len(rows) - 1):
        a, b = rows[i], rows[i + 1]
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(rows[-1])
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


def barnacle_cluster(surface_obj, count, near, radius, seed=1, size=0.05, m=None, up_only=False):
    """Barnacles stuck on a mesh: little cones with a hole, clustered round
    `near` (world point) within `radius`, sitting on the nearest surface."""
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new()
    bm.from_mesh(surface_obj.data)
    bm.transform(surface_obj.matrix_world)
    tree = BVHTree.FromBMesh(bm)
    rnd = random.Random(seed)
    out = []
    near = Vector(near)
    tries = 0
    while len(out) < count and tries < count * 20:
        tries += 1
        q = near + Vector((rnd.gauss(0, radius), rnd.gauss(0, radius), rnd.gauss(0, radius * 0.6)))
        loc, nrm, _i, _d = tree.find_nearest(q)
        if loc is None or (up_only and nrm.z < 0.2):
            continue
        s = size * rnd.uniform(0.55, 1.25)
        c = cyl(s, s * 1.1, loc + nrm * s * 0.4, m, verts=6, r2=s * 0.45)
        c.rotation_mode = "QUATERNION"
        c.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(nrm)
        out.append(c)
    bm.free()
    return out


def weed_strands(anchors, length=0.6, seed=1, width=0.05, m=None, droop=(0, 0, -1)):
    """Ribbons of weed hanging from anchor points (eaves, rails, hull edges),
    each a little different, drooping and curling."""
    rnd = random.Random(seed)
    out = []
    dv = Vector(droop).normalized()
    for a in anchors:
        a = Vector(a)
        L = length * rnd.uniform(0.5, 1.3)
        n = 6
        pts = []
        wob = rnd.uniform(0, math.tau)
        for i in range(n + 1):
            t = i / n
            off = Vector((math.sin(t * 3.0 + wob) * 0.08 * t, math.cos(t * 2.3 + wob) * 0.08 * t, 0))
            pts.append(a + dv * L * t + off)
        ws = [width * (1.0 - 0.75 * (i / n)) for i in range(n + 1)]
        out.append(ribbon(pts, ws, normal=(rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0.2), thick=0.006, m=m))
    return out


def paint_fn(o, fn):
    """Sets the vertex colour per corner from fn(co, normal) -> (r, g, b),
    multiplied over whatever shade is already baked (alias of paint)."""
    paint(o, fn)


def lerp3(a, b, t):
    a = _look(a)
    b = _look(b)
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def hash3(x, y, z, s=1.0):
    v = math.sin(x * 127.1 * s + y * 311.7 * s + z * 74.7 * s) * 43758.5453
    return v - math.floor(v)


def vnoise3(x, y, z):
    """Smooth value noise in 3D (for mottling, rust, weathering)."""
    ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    fx, fy, fz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    def h(a, b, c):
        return hash3(a, b, c)
    x00 = h(ix, iy, iz) * (1 - fx) + h(ix + 1, iy, iz) * fx
    x10 = h(ix, iy + 1, iz) * (1 - fx) + h(ix + 1, iy + 1, iz) * fx
    x01 = h(ix, iy, iz + 1) * (1 - fx) + h(ix + 1, iy, iz + 1) * fx
    x11 = h(ix, iy + 1, iz + 1) * (1 - fx) + h(ix + 1, iy + 1, iz + 1) * fx
    y0 = x00 * (1 - fy) + x10 * fy
    y1 = x01 * (1 - fy) + x11 * fy
    return y0 * (1 - fz) + y1 * fz


def tide_mark(o, line, weed="kelp_light", strength=0.55, band=0.25):
    """Sea marks on anything that's been under water: below `line` the
    surface is stained green-brown (patchy), with a darker band of weed at
    the line itself and a pale salt crust just above it."""
    def fn(co, n):
        z = co.z
        stain = vnoise3(co.x * 2.2, co.y * 2.2, co.z * 2.2)
        if z < line:
            k = strength * (0.65 + 0.35 * stain)
            if line - z < band:
                k = min(1.0, k + 0.25)
            return lerp3((1, 1, 1), lerp3(weed, "ink", 0.15), k)
        if z < line + 0.12:
            return lerp3((1, 1, 1), (1.08, 1.06, 1.0), 0.6)
        return (1, 1, 1)
    paint(o, fn)


def paint_mat(o, fn):
    """Like paint(), but fn(co, normal, material_name) -> (r, g, b) also
    knows which material each face uses (fins vs body, shell vs crab)."""
    me = o.data
    if "Col" not in me.color_attributes:
        me.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
        for d in me.color_attributes["Col"].data:
            d.color = (1, 1, 1, 1)
    col = me.color_attributes["Col"]
    me.color_attributes.active_color = col
    names = [m.name.split(".")[0] if m else "" for m in me.materials]
    for poly in me.polygons:
        mn = names[poly.material_index] if poly.material_index < len(names) else ""
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index]
            c = fn(v.co, v.normal, mn)
            old = col.data[li].color
            col.data[li].color = (old[0] * c[0], old[1] * c[1], old[2] * c[2], 1.0)


def fill_col(o, names, shade=(0.85, 0.85, 0.85)):
    """Sets (not multiplies) the vertex colour of faces using the named
    materials: parts joined on after the occlusion bake (weed, barnacles)
    would otherwise export black."""
    me = o.data
    if "Col" not in me.color_attributes:
        me.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
    col = me.color_attributes["Col"]
    me.color_attributes.active_color = col
    mats = [m.name.split(".")[0] if m else "" for m in me.materials]
    rnd = random.Random(7)
    for poly in me.polygons:
        if poly.material_index < len(mats) and mats[poly.material_index] in names:
            s = 0.85 + 0.15 * rnd.random()
            for li in poly.loop_indices:
                col.data[li].color = (shade[0] * s, shade[1] * s, shade[2] * s, 1.0)
