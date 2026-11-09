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

    def cushion(self, center, R, H, lobes, seed, base, top, under, flag=LEAF, droop=0.4, belly=0.32,
                carve=(0.56,), segs=3, lump=0.07, tilt=(0.0, 0.0), squash=(1.0, 1.0), hang_var=0.5, inner=(0.33,)):
        """A carved storybook canopy: a domed cushion whose rim is cut into round
        scallops, each scallop drooping into a hanging point, with carved lines
        (thin lighter grooves that follow the scallops) across the dome, the way a
        linocut tree is cut. Colours: `top` on the dome, `base` at the rim, `under`
        below. Returns the vertices."""
        rng = random.Random(seed)
        c = Vector(center)
        nseg = lobes * segs
        phase = rng.uniform(0, 2 * math.pi)
        lscale = [rng.uniform(0.86, 1.14) for _ in range(lobes)]
        ldrop = [rng.uniform(1.0 - hang_var, 1.0 + hang_var) for _ in range(lobes)]
        off = Vector((seed * 1.37, seed * 0.71, seed * 2.11))
        rot = Matrix.Rotation(tilt[0], 3, 'X') @ Matrix.Rotation(tilt[1], 3, 'Y')

        def lobe(k):
            u = (k + 0.5) / segs          # half a step in: every scallop gets a vertex at its middle
            i = int(math.floor(u)) % lobes
            f = u - math.floor(u)
            return i, f

        # rows: (radius fraction, height fraction, colour mix 0 = base .. 1 = top, carved?)
        def dome(rf):
            # a round shoulder, not a flat parasol: nearly spherical toward the rim
            return max(0.0, 1.0 - rf * rf) ** 0.62 * 0.94 + 0.06
        rows = []
        for rf in inner:
            rows.append((rf, dome(rf), 1.0, False))
        for cv in carve:
            rows.append((cv - 0.05, dome(cv - 0.05), 0.85, False))
            rows.append((cv, dome(cv) - 0.04, 0.85, True))
            rows.append((cv + 0.05, dome(cv + 0.05), 0.8, False))
        if max(carve) < 0.8:
            rows.append((0.88, dome(0.88), 0.45, False))
        rows.append((1.0, 0.04, 0.0, False))           # the scalloped rim
        rows.append((0.96, -1.0, -0.3, False))          # the hanging points (z set per vertex)
        rows.append((0.62, -belly, -1.0, False))        # the underside
        rows = sorted(rows[:-2], key=lambda r: r[0]) + rows[-2:]
        grid = []
        for ri, (rf, zf, ct, carved) in enumerate(rows):
            ring = []
            for k in range(nseg):
                i, f = lobe(k)
                a = phase + 2 * math.pi * k / nseg
                bulge = math.sin(math.pi * f) ** 0.6
                r = R * rf * (0.8 + 0.2 * bulge) * (lscale[i] if rf > 0.4 else 1.0)
                if zf == -1.0:
                    point = max(0.0, 1.0 - abs(f - 0.5) * 2.0) ** 2.2
                    z = -(0.06 + droop * point * ldrop[i]) * H
                else:
                    z = zf * H
                p = Vector((math.cos(a) * r * squash[0], math.sin(a) * r * squash[1], z))
                if 0.0 < zf <= 1.0:
                    # cloud bumps across the dome (bigger toward the top), smaller ones round the rim
                    q = Vector((p.x, p.y, 0.0)) * (1.7 / max(R, 0.1)) + off
                    p += Vector((p.x * 0.4 / max(R, 0.1), p.y * 0.4 / max(R, 0.1), 1.0)) * lump * H * noise.noise(q) * (0.5 + zf)
                if carved:
                    p.z -= 0.025 * H
                if ct >= 0:
                    col = mix(base, top, ct)
                else:
                    col = mix(base, under, -ct)
                hi = 1.0 if carved else (0.35 if rf == 1.0 else 0.0)
                ring.append(self.vert(c + rot @ p, col, flag, hi))
            grid.append(ring)
        apex = self.vert(c + rot @ Vector((0, 0, H * (1.0 + lump * 0.5))), top, flag, 0.2)
        bottom = self.vert(c + rot @ Vector((0, 0, -belly * H * 1.08)), under, flag, 0.0)
        for k in range(nseg):
            k2 = (k + 1) % nseg
            self.face([apex, grid[0][k], grid[0][k2]])
            for ri in range(len(grid) - 1):
                a, b = grid[ri], grid[ri + 1]
                self.face([a[k], b[k], b[k2], a[k2]])
            self.face([grid[-1][k2], grid[-1][k], bottom])
        return [apex, bottom] + [v for ring in grid for v in ring]

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
    def curvature(self):
        """Per vertex: how convex (< 0, an edge that sticks out) or concave (> 0, a
        crease) the surface is there, from the neighbours' height over its tangent plane."""
        bm = self.bm
        bm.normal_update()
        out = {}
        for v in bm.verts:
            n = v.normal
            if n.length < 0.1 or not v.link_edges:
                out[v] = 0.0
                continue
            k = 0.0
            for e in v.link_edges:
                o = e.other_vert(v)
                d = o.co - v.co
                ln = d.length
                if ln > 1e-6:
                    k += d.dot(n) / ln
            out[v] = k / len(v.link_edges)
        return out

    def bake(self, ao_dist=1.2, ao_rays=24, ao_strength=0.75, ground=True, grad=None, hi_color=None,
             hi_strength=0.35, height=None, ground_dark=0.0, ao_floor=0.25, wear=0.0, wear_color=None,
             grime=0.0, paint=0.0, paint_scale=3.0):
        """Bake AO, the vertical gradient and the highlights into the vertex colours.
        grad = (bottom_mult, top_mult); colours are multiplied from bottom to top.
        hi_color: rims and tips are pulled toward this colour by their highlight weight.
        wear: edges that stick out are rubbed lighter (toward wear_color, or just lighter);
        grime: creases go darker; paint: a soft hand-painted mottle across the surface."""
        bm = self.bm
        bm.normal_update()
        curv = self.curvature() if (wear or grime) else None
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
            if paint:
                q = v.co * paint_scale
                pn = noise.noise(q) * 0.65 + noise.noise(q * 2.7 + Vector((5.1, 2.3, 7.7))) * 0.35
                rgb = scale(rgb, 1.0 + paint * pn)
            if curv is not None:
                k = curv[v]
                if wear and k < -0.04:
                    w = min(1.0, (-k - 0.04) * 3.0) * wear
                    rgb = mix(rgb, wear_color, w) if wear_color else scale(rgb, 1.0 + w * 0.9)
                if grime and k > 0.04:
                    rgb = scale(rgb, 1.0 - min(1.0, (k - 0.04) * 3.0) * grime)
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
