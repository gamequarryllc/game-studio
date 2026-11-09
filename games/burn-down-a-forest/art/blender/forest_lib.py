"""Shared helpers for the Burn Down a Forest model scripts.

Every model is built from code with bmesh, then its detail is baked into
vertex colours so it reads well in Godot's Compatibility renderer, which has
no real-time AO or shadows on phones:

  final colour = base colour (sRGB swatch from the art bible)
                 x ambient occlusion (ray cast against the model and a ground plane)
                 x a vertical gradient (plum at the roots, moonlit at the top)
                 + a highlight on rims and tips (the "carved" edge of a linocut)

Vertex alpha tells the game's shaders what a part is:
  1.0 = foliage (bends in the wind, shrinks when it burns, rim-inked)
  0.5 = glow (cursed mint knots and hearts, lit cottage windows, the lantern)
  0.0 = bark, stone, cloth and everything else

Blender is Z-up; the glTF exporter turns that into Godot's Y-up, and Blender's
-Y becomes Godot's +Z (the way characters and tools face).
"""
import math
import os
import random

import bpy  # noqa: F401  (must come first: it makes bmesh and mathutils importable)
import bmesh
from mathutils import Matrix, Vector, noise
from mathutils.bvhtree import BVHTree

LEAF = 1.0
GLOW = 0.5
BARK = 0.0

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "models"))


# ------------------------------------------------------------------------------------
# Colour
# ------------------------------------------------------------------------------------
def srgb(hexstr):
    """'#2F5C66' -> linear RGB tuple (Blender colour attributes are linear)."""
    h = hexstr.lstrip("#")
    out = []
    for k in range(3):
        c = int(h[k * 2:k * 2 + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def mix(a, b, t):
    return tuple(a[k] + (b[k] - a[k]) * t for k in range(3))


def scale(a, s):
    return tuple(c * s for c in a)


# ------------------------------------------------------------------------------------
# A model under construction
# ------------------------------------------------------------------------------------
class Model:
    """One bmesh plus, per vertex, a base colour, a part flag and a highlight weight."""

    def __init__(self, name, seed=1):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.verts.layers.float_color.new("base")
        self.hi = self.bm.verts.layers.float.new("hi")      # 0..1 rim/tip highlight
        self.rng = random.Random(seed)
        self.uv_fn = None        # (vertex index, position) -> (u, v), if the model needs a UV map

    # --- low level ---------------------------------------------------------------
    def vert(self, co, color, flag, hi=0.0):
        v = self.bm.verts.new(Vector(co))
        v[self.col] = (color[0], color[1], color[2], flag)
        v[self.hi] = hi
        return v

    def face(self, verts, smooth=True):
        try:
            f = self.bm.faces.new(verts)
        except ValueError:
            return None
        f.smooth = smooth
        return f

    def recolor(self, verts, fn):
        """fn(vert) -> (rgb, flag) for each vert."""
        for v in verts:
            rgb, flag = fn(v)
            v[self.col] = (rgb[0], rgb[1], rgb[2], flag)

    # --- sweeps ------------------------------------------------------------------
    def tube(self, spine, radii, sides, color, flag, smooth=True, cap_top=True, cap_bottom=False,
             twist=0.0, wobble=0.0, color_fn=None, hi_fn=None, squash=None):
        """A tapered tube along a polyline. radii: one per spine point.
        color_fn(t, k) -> rgb lets the colour change along the tube (t 0..1 along it)."""
        rings = []
        n = len(spine)
        prev_x = None
        for i, p in enumerate(spine):
            p = Vector(p)
            if i == 0:
                d = Vector(spine[1]) - p
            elif i == n - 1:
                d = p - Vector(spine[i - 1])
            else:
                d = Vector(spine[i + 1]) - Vector(spine[i - 1])
            d.normalize()
            # A stable frame: reuse the last side vector, made perpendicular.
            if prev_x is None:
                up = Vector((0, 0, 1)) if abs(d.z) < 0.95 else Vector((1, 0, 0))
                x = d.cross(up)
                if x.length < 1e-6:
                    x = Vector((1, 0, 0))
                x.normalize()
            else:
                x = prev_x - d * prev_x.dot(d)
                if x.length < 1e-6:
                    x = d.orthogonal()
                x.normalize()
            prev_x = x
            y = d.cross(x).normalized()
            t = i / max(1, n - 1)
            ring = []
            for k in range(sides):
                a = 2 * math.pi * k / sides + twist * t
                r = radii[i] * (1.0 + (self.rng.uniform(-wobble, wobble) if wobble else 0.0))
                sx, sy = (squash if squash else (1.0, 1.0))
                off = x * math.cos(a) * r * sx + y * math.sin(a) * r * sy
                rgb = color_fn(t, k) if color_fn else color
                hi = hi_fn(t, k) if hi_fn else 0.0
                ring.append(self.vert(p + off, rgb, flag, hi))
            rings.append(ring)
        for i in range(n - 1):
            a, b = rings[i], rings[i + 1]
            for k in range(sides):
                k2 = (k + 1) % sides
                self.face([a[k], a[k2], b[k2], b[k]], smooth)
        if cap_top and radii[-1] > 1e-4:
            tip = Vector(spine[-1])
            rgb = color_fn(1.0, 0) if color_fn else color
            c = self.vert(tip, rgb, flag, hi_fn(1.0, 0) if hi_fn else 0.0)
            last = rings[-1]
            for k in range(sides):
                self.face([last[k], last[(k + 1) % sides], c], smooth)
        if cap_bottom:
            c = self.vert(Vector(spine[0]), color_fn(0.0, 0) if color_fn else color, flag)
            first = rings[0]
            for k in range(sides):
                self.face([first[(k + 1) % sides], first[k], c], smooth)
        return rings

    def blob(self, center, radius, color, flag, subdiv=1, rough=0.18, seed=0, squash=(1, 1, 1),
             droop=0.0, color_fn=None, hi_top=0.0, smooth=True, spikes=0.0, scallop=0.0, lobes=6):
        """A lumpy ball: an icosphere pushed around by noise. droop pulls the
        underside down into hanging points; spikes pushes a few vertices out."""
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=1.0)
        c = Vector(center)
        off = Vector((seed * 3.17, seed * 1.91, seed * 2.33))
        vmap = {}
        rng = random.Random(seed * 7 + 3)
        for v in tmp.verts:
            d = v.co.normalized()
            n = noise.noise(d * 1.7 + off)
            k = 1.0 + rough * n
            if spikes and rng.random() < spikes:
                k *= 1.35 + rng.random() * 0.3
            p = Vector((d.x * radius * squash[0] * k, d.y * radius * squash[1] * k, d.z * radius * squash[2] * k))
            if scallop:
                # a scalloped, pointed rim round the middle (a carved linocut canopy)
                band = max(0.0, 1.0 - abs(d.z + 0.1) / 0.55)
                ang = math.atan2(d.y, d.x) * lobes + seed * 1.7
                lobe = abs(math.sin(ang * 0.5)) ** 3
                p += Vector((d.x, d.y, -0.25)) * scallop * radius * band * lobe
            if droop and d.z < -0.2:
                # hanging points under the canopy
                hang = (-d.z - 0.2) * droop * radius * (0.6 + 0.8 * abs(noise.noise(d * 3.1 + off)))
                p.z -= hang
            rgb = color_fn(d, p + c) if color_fn else color
            hi = max(0.0, d.z) * hi_top
            vmap[v] = self.vert(c + p, rgb, flag, hi)
        for f in tmp.faces:
            self.face([vmap[v] for v in f.verts], smooth)
        tmp.free()
        return list(vmap.values())

    def box(self, center, size, color, flag, bevel=0.0, smooth=False, rot=None):
        """An axis-aligned box (optionally rotated by a Matrix), with a rounded bevel."""
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        if bevel > 0:
            bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel, segments=2, affect='EDGES', profile=0.5)
        m = Matrix.Diagonal(Vector((size[0], size[1], size[2], 1.0)))
        if rot is not None:
            m = rot.to_4x4() @ m
        m = Matrix.Translation(Vector(center)) @ m
        vmap = {}
        for v in tmp.verts:
            vmap[v] = self.vert(m @ v.co, color, flag)
        for f in tmp.faces:
            self.face([vmap[v] for v in f.verts], smooth)
        tmp.free()
        return list(vmap.values())

    def lathe(self, profile, sides, color, flag, center=(0, 0, 0), smooth=True, color_fn=None, rot=0.0,
              squash=(1.0, 1.0), wobble=0.0, close_top=True, close_bottom=True):
        """Spin a (radius, height) profile round the Z axis."""
        c = Vector(center)
        rings = []
        for i, (r, z) in enumerate(profile):
            ring = []
            for k in range(sides):
                a = 2 * math.pi * k / sides + rot
                rr = r * (1.0 + (self.rng.uniform(-wobble, wobble) if wobble and 0 < i < len(profile) - 1 else 0.0))
                rgb = color_fn(i / max(1, len(profile) - 1), k) if color_fn else color
                ring.append(self.vert(c + Vector((math.cos(a) * rr * squash[0], math.sin(a) * rr * squash[1], z)), rgb, flag))
            rings.append(ring)
        for i in range(len(rings) - 1):
            a, b = rings[i], rings[i + 1]
            for k in range(sides):
                k2 = (k + 1) % sides
                self.face([a[k], a[k2], b[k2], b[k]], smooth)
        if close_top and profile[-1][0] > 1e-4:
            v = self.vert(c + Vector((0, 0, profile[-1][1])), color_fn(1.0, 0) if color_fn else color, flag)
            for k in range(sides):
                self.face([rings[-1][k], rings[-1][(k + 1) % sides], v], smooth)
        if close_bottom and profile[0][0] > 1e-4:
            v = self.vert(c + Vector((0, 0, profile[0][1])), color_fn(0.0, 0) if color_fn else color, flag)
            for k in range(sides):
                self.face([rings[0][(k + 1) % sides], rings[0][k], v], smooth)
        return rings

    def quad_strip(self, pts_l, pts_r, color_fn, flag, smooth=True, double=True):
        """A ribbon between two polylines (blades, petals). color_fn(t) per row."""
        rows = []
        n = len(pts_l)
        for i in range(n):
            t = i / max(1, n - 1)
            rgb = color_fn(t)
            rows.append((self.vert(pts_l[i], rgb, flag, t), self.vert(pts_r[i], rgb, flag, t)))
        for i in range(n - 1):
            a, b = rows[i], rows[i + 1]
            self.face([a[0], a[1], b[1], b[0]], smooth)
            if double:
                self.face([b[0], b[1], a[1], a[0]], smooth)
        return rows

    def fan(self, center, pts, color_c, color_e, flag, smooth=True, double=False, hi_edge=0.0):
        c = self.vert(center, color_c, flag)
        ring = [self.vert(p, color_e, flag, hi_edge) for p in pts]
        for k in range(len(ring)):
            k2 = (k + 1) % len(ring)
            self.face([c, ring[k], ring[k2]], smooth)
            if double:
                self.face([c, ring[k2], ring[k]], smooth)
        return [c] + ring

    def transform(self, verts, m):
        for v in verts:
            v.co = m @ v.co

    # --- finishing ---------------------------------------------------------------
    def bake(self, ao_dist=1.2, ao_rays=24, ao_strength=0.75, ground=True, grad=None, hi_color=None,
             hi_strength=0.35, height=None, ground_dark=0.0, ao_floor=0.25):
        """Bake AO, the vertical gradient and the highlights into the vertex colours.
        grad = (bottom_mult, top_mult); colours are multiplied from bottom to top.
        hi_color: rims and tips are pulled toward this colour by their highlight weight."""
        bm = self.bm
        bm.normal_update()
        tree_bm = bm.copy()
        if ground:
            # a big ground quad so roots and trunks get contact shadow
            g = 50.0
            vs = [tree_bm.verts.new(Vector(p)) for p in ((-g, -g, -0.02), (g, -g, -0.02), (g, g, -0.02), (-g, g, -0.02))]
            tree_bm.faces.new(vs)
        tree = BVHTree.FromBMesh(tree_bm)
        tree_bm.free()
        zs = [v.co.z for v in bm.verts]
        z0, z1 = min(zs), max(zs)
        if height is not None:
            z1 = max(z1, height)
        span = max(1e-3, z1 - z0)
        rng = random.Random(1234)
        dirs = []
        for k in range(ao_rays):
            # cosine-weighted hemisphere samples around +Z, rotated per vertex
            u, w = (k + 0.5) / ao_rays, rng.random()
            r = math.sqrt(u)
            a = 2 * math.pi * (w + k * 0.618)
            dirs.append(Vector((r * math.cos(a), r * math.sin(a), math.sqrt(max(0.0, 1 - u)))))
        for v in bm.verts:
            n = v.normal if v.normal.length > 0.1 else Vector((0, 0, 1))
            rot = Vector((0, 0, 1)).rotation_difference(n).to_matrix()
            origin = v.co + n * 0.02
            hit = 0.0
            for d in dirs:
                dd = rot @ d
                loc, nor, idx, dist = tree.ray_cast(origin, dd, ao_dist)
                if loc is not None:
                    hit += 1.0 - (dist / ao_dist) * 0.5
            ao = 1.0 - ao_strength * hit / len(dirs)
            ao = max(ao_floor, ao)
            c = v[self.col]
            rgb = (c[0] * ao, c[1] * ao, c[2] * ao)
            t = (v.co.z - z0) / span
            if grad:
                g = grad[0] + (grad[1] - grad[0]) * t
                rgb = scale(rgb, g)
            if ground_dark and v.co.z < 0.4:
                rgb = scale(rgb, 1.0 - ground_dark * (1.0 - v.co.z / 0.4))
            if hi_color and v[self.hi] > 0:
                rgb = mix(rgb, hi_color, min(1.0, v[self.hi] * hi_strength))
            v[self.col] = (rgb[0], rgb[1], rgb[2], c[3])

    def finish(self, collection=None):
        """Turn the bmesh into an object with a 'Col' colour attribute."""
        me = bpy.data.meshes.new(self.name)
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if not self._is_double(f)])
        bm.to_mesh(me)
        lay = bm.verts.layers.float_color["base"]
        bm.verts.ensure_lookup_table()
        colors = [tuple(v[lay]) for v in bm.verts]
        # drop the helper layers from the mesh first (removing one resets the active colour)
        for name in ("base", "hi"):
            a = me.attributes.get(name)
            if a is not None:
                me.attributes.remove(a)
        ca = me.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
        for i, c in enumerate(colors):
            ca.data[i].color = c
        me.color_attributes.active_color_name = "Col"
        me.color_attributes.render_color_index = me.color_attributes.find("Col")
        if self.uv_fn is not None:
            uv = me.uv_layers.new(name="UVMap")
            for poly in me.polygons:
                for li in poly.loop_indices:
                    vi = me.loops[li].vertex_index
                    uv.data[li].uv = self.uv_fn(vi, me.vertices[vi].co)
        me.materials.append(vertex_color_material())
        ob = bpy.data.objects.new(self.name, me)
        (collection or bpy.context.scene.collection).objects.link(ob)
        bm.free()
        return ob

    @staticmethod
    def _is_double(f):
        return False

    def tri_count(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)


# ------------------------------------------------------------------------------------
# Scene and export
# ------------------------------------------------------------------------------------
def vertex_color_material():
    """One shared material that shows the baked vertex colours (the game
    replaces it with its own shaders; this keeps the files tidy elsewhere)."""
    mat = bpy.data.materials.get("baked_vertex_colour")
    if mat is not None:
        return mat
    mat = bpy.data.materials.new("baked_vertex_colour")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    return mat


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def export(objects, filename, folder=None):
    """Export just these objects as a .glb into the game's models/ folder (or `folder`)."""
    folder = folder or MODELS
    os.makedirs(folder, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    path = os.path.join(folder, filename)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True, use_selection=True,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                              export_materials='EXPORT', export_texcoords=True, export_normals=True,
                              export_yup=True)
    tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in objects)
    print("exported %s (%d objects, %d tris)" % (filename, len(objects), tris))
    return path


def smooth_spine(points, k=0.5):
    """Catmull-Rom-ish resample of a polyline (for crooked trunks and hooks)."""
    out = []
    pts = [Vector(p) for p in points]
    for i in range(len(pts) - 1):
        p0 = pts[max(0, i - 1)]
        p1 = pts[i]
        p2 = pts[i + 1]
        p3 = pts[min(len(pts) - 1, i + 2)]
        for s in range(3):
            t = s / 3.0
            t2, t3 = t * t, t * t * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append(q)
    out.append(pts[-1])
    return out


def crooked_spine(height, bends, sway, rng, segments=6, lean=(0.0, 0.0), hook=0.0, hook_dir=0.0):
    """A trunk's centre line: up `height`, wandering sideways by `sway`, optionally
    hooking over at the top (hook = how far, in metres, the tip bends sideways)."""
    pts = []
    ph = rng.uniform(0, 6.28)
    ph2 = rng.uniform(0, 6.28)
    for i in range(segments + 1):
        t = i / segments
        x = math.sin(t * bends * math.pi + ph) * sway * t + lean[0] * t
        y = math.cos(t * bends * math.pi * 0.8 + ph2) * sway * t + lean[1] * t
        z = t * height
        if hook and t > 0.7:
            h = (t - 0.7) / 0.3
            x += math.cos(hook_dir) * hook * h * h
            y += math.sin(hook_dir) * hook * h * h
            z -= hook * 0.35 * h * h * h
        pts.append(Vector((x, y, z)))
    return pts


def point_on(spine, t):
    """A point part-way (0..1) along a polyline, by length."""
    pts = [Vector(p) for p in spine]
    lens = [0.0]
    for i in range(1, len(pts)):
        lens.append(lens[-1] + (pts[i] - pts[i - 1]).length)
    target = lens[-1] * max(0.0, min(1.0, t))
    for i in range(1, len(pts)):
        if lens[i] >= target:
            seg = lens[i] - lens[i - 1]
            u = 0.0 if seg < 1e-6 else (target - lens[i - 1]) / seg
            return pts[i - 1].lerp(pts[i], u)
    return pts[-1]
