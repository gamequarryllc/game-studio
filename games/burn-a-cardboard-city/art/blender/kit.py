"""Papercraft modelling kit for Burn a Cardboard City (Blender 5.2, run headless via `import bpy`).

Every model is one mesh built from parts: bevelled boxes that sag a little,
flaps with lighter corrugated cut edges, torn masking tape, cardboard tubes,
paper cones, and marker drawings (decal quads mapped onto models/marker_sheet.png).

Vertex colours carry everything the game's shader needs:
  rgb   = the colour of the part, multiplied by ambient occlusion baked in Cycles
  alpha = what the part is made of (see MATERIAL_* below)
Surfaces: material 0 "card" (everything solid), material 1 "decal" (marker ink, alpha).
Units are metres, Z up, origin at the middle of the footprint on the floor.
"""
import json
import math
import os
import random

import bpy  # noqa: I001 (bpy first: it makes bmesh and mathutils importable)
import bmesh
from mathutils import Euler, Matrix, Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
MODELS = os.path.join(ROOT, "models")
SHEET_PNG = os.path.join(MODELS, "marker_sheet.png")
UV = json.load(open(os.path.join(ROOT, "art", "textures", "marker_sheet.json")))

# What a part is made of (vertex alpha). The game's shader reads this.
CARD = 1.0       # corrugated cardboard: corrugation, chars and burns
PAPER = 0.75     # thin paper and card stock: smooth, catches fast
TAPE = 0.5       # masking tape: a little sheen
SHINY = 0.25     # bottle caps, tin, brass, plastic: glossy, never chars
INKLINE = 0.1    # the drawn outline round the giant's hand and tools (inverted hull)
DARK = 0.0       # holes and insides (and glass, on the held tools)


def srgb(h):
    """'#rrggbb' -> linear rgb (vertex colours are stored linear)."""
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# The palette (see the art bible in NOTES.md).
KRAFT = srgb("#c89a64")
KRAFT_DARK = srgb("#a77a4a")
KRAFT_PALE = srgb("#dcbb8a")
KRAFT_EDGE = srgb("#e6cd9f")      # the cut edge of corrugated board, lighter
WHITE_BOARD = srgb("#e9e4d6")
GREY_BOARD = srgb("#9c9a92")
TAPE_COL = srgb("#e8d8a8")
INSIDE = srgb("#5a4430")
RED = srgb("#c8402f")
TOMATO = srgb("#e0623a")
BLUE = srgb("#3d6fb8")
SKYBLUE = srgb("#86b4d8")
YELLOW = srgb("#f0c440")
GREEN = srgb("#5f9a4a")
LEAF = srgb("#4f8a3c")
LEAF_LIGHT = srgb("#79b04f")
PINK = srgb("#e98aa0")
CREAM = srgb("#f3ead2")
BRASS = srgb("#c9a040")
STEEL = srgb("#7d8790")
WOOD = srgb("#a06a3a")
WAX = srgb("#f2ead8")
INK = srgb("#221d1b")
# Burnt (art bible: char is never black, ash is grey).
CHAR = srgb("#2a2420")
CHAR_LIGHT = srgb("#3e342c")
SCORCH = srgb("#5c3e26")
ASH = srgb("#8a8580")
ASH_LIGHT = srgb("#a8a39c")
# District materials.
EGG_PULP = srgb("#bdb3a2")       # moulded egg-box pulp
EGG_PULP_DARK = srgb("#9e9484")
ROLL = srgb("#b59a74")           # toilet-roll tube
ROLL_SEAM = srgb("#9a7f5c")
PAPER_WHITE = srgb("#efede6")    # copy-paper boxes
PAPER_SHADE = srgb("#dedbd2")
CEREAL_IN = srgb("#9c9284")      # the grey inside of a cereal box
SKIN = srgb("#dba68a")
SKIN_DARK = srgb("#c98a63")
DENIM = srgb("#3f5f86")


# =====================================================================================
# Scene
# =====================================================================================
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _materials()


_MATS = {}


def _materials():
    _MATS.clear()
    card = bpy.data.materials.new("card")
    card.use_nodes = True
    nt = card.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Color"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.82
    _MATS["card"] = card
    decal = bpy.data.materials.new("decal")
    decal.use_nodes = True
    nt = decal.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    if os.path.exists(SHEET_PNG):
        tex.image = bpy.data.images.load(SHEET_PNG, check_existing=True)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.7
    try:
        decal.blend_method = "BLEND"
    except Exception:
        pass
    _MATS["decal"] = decal


# =====================================================================================
# A model under construction
# =====================================================================================
class Model:
    def __init__(self, name, seed=1):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new("Color")
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.pid = self.bm.faces.layers.int.new("part")   # which part a face belongs to (0 = just made)
        self.cur = 0
        self.rng = random.Random(seed)
        self.seed = seed

    # --- bookkeeping: each part numbers its faces (bmesh operators clear tags, so not those) ----
    def _begin(self):
        self.cur += 1

    def _new(self):
        out = []
        for f in self.bm.faces:
            p = f[self.pid]
            if p == 0:
                f[self.pid] = self.cur
                out.append(f)
            elif p == self.cur:
                out.append(f)
        return out

    def _paint(self, faces, color, flag, mat=0, smooth=False):
        for f in faces:
            f.material_index = mat
            f.smooth = smooth
            for l in f.loops:
                l[self.col] = (color[0], color[1], color[2], flag)

    @staticmethod
    def _verts(faces):
        return list({v for f in faces for v in f.verts})

    def jitter(self, faces, amp, freq=6.0):
        """Nudge vertices with smooth noise: nothing hand-made is perfectly straight."""
        off = Vector((self.seed * 3.1, self.seed * 1.7, self.seed * 2.3))
        for v in self._verts(faces):
            v.co += noise.noise_vector(v.co * freq + off) * amp

    # --- parts ----------------------------------------------------------------------------
    def box(self, center, size, color, flag=CARD, bevel=0.01, cuts=(1, 1, 1), jitter=0.004, rot=(0, 0, 0),
            sag=0.0, edge=None, top_color=None):
        """A bevelled box. `cuts` subdivides it (x, y, z) so baked AO has somewhere to live.
        `sag` bows the top inward a little (old boxes do). `edge` colours thin side faces
        (for sheets and flaps: the corrugated cut edge)."""
        self._begin()
        m = Matrix.Translation(Vector(center)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1.0))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        faces = self._new()
        edges = list({e for f in faces for e in f.edges})
        axes = [Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))]
        rmat = Euler(rot).to_matrix()
        for ax, c in zip(axes, cuts):
            if c <= 0:
                continue
            d = rmat @ ax
            sel = [e for e in edges if abs((e.verts[1].co - e.verts[0].co).normalized().dot(d)) > 0.9]
            if sel:
                bmesh.ops.subdivide_edges(self.bm, edges=sel, cuts=c, use_grid_fill=True)
            faces = self._new()
            edges = list({e for f in faces for e in f.edges})
        if bevel > 0.0:
            sharp = [e for e in edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > 1.2]
            if sharp:
                bmesh.ops.bevel(self.bm, geom=sharp, offset=bevel, offset_type="OFFSET", segments=1,
                                profile=0.5, affect="EDGES", clamp_overlap=True)
        faces = self._new()
        if sag > 0.0:
            top = center[2] + size[2] * 0.5
            for v in self._verts(faces):
                if v.co.z > top - 0.02:
                    rel = Vector((v.co.x - center[0], v.co.y - center[1], 0))
                    k = 1.0 - min(1.0, max(abs(rel.x) / (size[0] * 0.5), abs(rel.y) / (size[1] * 0.5)))
                    v.co.z -= sag * k
        self._paint(faces, color, flag)
        if top_color is not None:
            up = rmat @ Vector((0, 0, 1))
            self._paint([f for f in faces if f.normal.dot(up) > 0.7], top_color, flag)
        if edge is not None:
            thin = min(range(3), key=lambda i: size[i])
            n = rmat @ axes[thin]
            self._paint([f for f in faces if abs(f.normal.dot(n)) < 0.3], edge, flag)
        if jitter > 0.0:
            # Big walls wobble less (and never through the marker drawings on them).
            self.jitter(faces, min(jitter, 0.0035) if max(size) > 0.9 else jitter)
        return faces

    def plate(self, hinge, along, out, length, width, color, thick=0.008, flag=CARD, edge=KRAFT_EDGE, jitter=0.002,
              under=None, cuts=2):
        """A flat sheet hinged on an edge: `hinge` is the middle of the hinge line,
        `along` the hinge direction, `out` the direction the sheet extends from it."""
        along = Vector(along).normalized()
        out = Vector(out).normalized()
        n = along.cross(out).normalized()
        c = Vector(hinge) + out * (width * 0.5)
        m = Matrix((
            (along.x * length, out.x * width, n.x * thick, c.x),
            (along.y * length, out.y * width, n.y * thick, c.y),
            (along.z * length, out.z * width, n.z * thick, c.z),
            (0, 0, 0, 1)))
        self._begin()
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        faces = self._new()
        edges = list({e for f in faces for e in f.edges})
        long_edges = [e for e in edges if abs((e.verts[1].co - e.verts[0].co).normalized().dot(along)) > 0.9]
        bmesh.ops.subdivide_edges(self.bm, edges=long_edges, cuts=cuts, use_grid_fill=True)
        if cuts > 2:
            faces = self._new()
            edges = list({e for f in faces for e in f.edges})
            wide = [e for e in edges if abs((e.verts[1].co - e.verts[0].co).normalized().dot(out)) > 0.9]
            bmesh.ops.subdivide_edges(self.bm, edges=wide, cuts=max(1, cuts // 2), use_grid_fill=True)
        faces = self._new()
        for f in faces:
            f.normal_update()
        self._paint(faces, color, flag)
        if under is not None:
            # "under" is the side facing down (or, for an upright flap, the side facing in).
            if abs(n.z) > 0.15:
                n_up = n if n.z > 0 else -n
            else:
                n_up = n if n.dot(Vector((c.x, c.y, 0))) >= 0 else -n
            self._paint([f for f in faces if f.normal.dot(n_up) < -0.4], under, flag)
        self._paint([f for f in faces if abs(f.normal.dot(n)) < 0.4], edge, flag)
        if jitter:
            self.jitter(faces, jitter, 9.0)
        return faces

    def flap(self, hinge, along, out_dir, angle_deg, length, width, color, thick=0.008, under=None, cuts=2):
        """A box flap: hinged at `hinge`, lying along `out_dir`, then swung up by `angle_deg`
        about the hinge (0 = flat outward, 90 = straight up, 180 = folded in)."""
        along = Vector(along).normalized()
        out_dir = Vector(out_dir).normalized()
        up = Vector((0, 0, 1))
        a = math.radians(angle_deg)
        out = (out_dir * math.cos(a) + up * math.sin(a)).normalized()
        return self.plate(hinge, along, out, length, width, color, thick, under=under, cuts=cuts)

    def tape(self, start, end, normal, width=0.07, color=TAPE_COL, wrap=None):
        """A strip of masking tape on a surface, with torn, zig-zag ends."""
        start, end, normal = Vector(start), Vector(end), Vector(normal).normalized()
        d = end - start
        length = d.length
        u = d.normalized()
        s = normal.cross(u).normalized() * (width * 0.5)
        lift = normal * 0.0025
        self._begin()
        teeth = 4
        pts_a = []
        pts_b = []
        for k in range(teeth + 1):
            t = k / teeth
            z0 = self.rng.uniform(-0.012, 0.012)
            z1 = self.rng.uniform(-0.012, 0.012)
            pts_a.append(start + lift - u * (0.006 + z0) + s * (1 - 2 * t))
            pts_b.append(end + lift + u * (0.006 + z1) + s * (1 - 2 * t))
        verts_a = [self.bm.verts.new(p) for p in pts_a]
        verts_b = [self.bm.verts.new(p) for p in reversed(pts_b)]
        # Long strip as quads between the two torn ends (through a few middle rows so it can bend).
        rows = max(1, int(length / 0.12))
        grid = [verts_a]
        for r in range(1, rows):
            t = r / rows
            row = [self.bm.verts.new(start + d * t + lift + s * (1 - 2 * (k / teeth))) for k in range(teeth + 1)]
            grid.append(row)
        grid.append(list(reversed(verts_b)))
        for r in range(len(grid) - 1):
            for k in range(teeth):
                a, b = grid[r][k], grid[r][k + 1]
                c, e = grid[r + 1][k + 1], grid[r + 1][k]
                try:
                    self.bm.faces.new((a, e, c, b))
                except ValueError:
                    pass
        faces = self._new()
        for f in faces:
            f.normal_update()
            if f.normal.dot(normal) < 0:
                f.normal_flip()
        self._paint(faces, color, TAPE)
        return faces

    def cylinder(self, base, radius, height, color, segs=16, flag=CARD, caps=True, smooth=True, cuts=1,
                 radius_top=None, rot=(0, 0, 0), jitter=0.003, top_color=None):
        self._begin()
        rt = radius if radius_top is None else radius_top
        m = Matrix.Translation(Vector(base)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Translation((0, 0, height * 0.5))
        bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=radius, radius2=rt,
                              depth=height, matrix=m)
        faces = self._new()
        if cuts > 0:
            up = Euler(rot).to_matrix() @ Vector((0, 0, 1))
            edges = list({e for f in faces for e in f.edges})
            vert = [e for e in edges if abs((e.verts[1].co - e.verts[0].co).normalized().dot(up)) > 0.5]
            if vert:
                bmesh.ops.subdivide_edges(self.bm, edges=vert, cuts=cuts)
            faces = self._new()
        up = Euler(rot).to_matrix() @ Vector((0, 0, 1))
        self._paint(faces, color, flag, smooth=False)
        for f in faces:
            f.smooth = smooth and abs(f.normal.dot(up)) < 0.9
        if top_color is not None:
            self._paint([f for f in faces if f.normal.dot(up) > 0.9], top_color, flag)
        for e in {e for f in faces for e in f.edges}:
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > 0.7:
                e.smooth = False
        if jitter:
            self.jitter(faces, jitter)
        return faces

    def tube(self, base, radius, height, color, inside=INSIDE, wall=0.012, segs=18, flag=CARD, rot=(0, 0, 0)):
        """An open cardboard tube (a toilet roll, a poster tube): outer wall, inner wall, rim."""
        f1 = self.cylinder(base, radius, height, color, segs, flag, caps=False, rot=rot)
        self._begin()
        m = Matrix.Translation(Vector(base)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Translation((0, 0, height * 0.5))
        bmesh.ops.create_cone(self.bm, cap_ends=False, segments=segs, radius1=radius - wall, radius2=radius - wall,
                              depth=height * 0.999, matrix=m)
        inner = self._new()
        for f in inner:
            f.normal_flip()
            f.smooth = True
        self._paint(inner, inside, flag, smooth=True)
        # The rim: a flat ring at the top.
        self._begin()
        up = Euler(rot).to_matrix() @ Vector((0, 0, 1))
        top = Vector(base) + up * height
        mr = Matrix.Translation(top) @ Euler(rot).to_matrix().to_4x4()
        ring_o = bmesh.ops.create_circle(self.bm, cap_ends=False, segments=segs, radius=radius, matrix=mr)["verts"]
        ring_i = bmesh.ops.create_circle(self.bm, cap_ends=False, segments=segs, radius=radius - wall, matrix=mr)["verts"]
        for k in range(segs):
            a, b = ring_o[k], ring_o[(k + 1) % segs]
            c, d = ring_i[(k + 1) % segs], ring_i[k]
            try:
                self.bm.faces.new((a, b, c, d))
            except ValueError:
                pass
        rim = self._new()
        for f in rim:
            f.normal_update()
            if f.normal.dot(up) < 0:
                f.normal_flip()
        self._paint(rim, KRAFT_EDGE, flag)
        return f1 + inner + rim

    def cone(self, base, radius, height, color, segs=16, flag=PAPER, rot=(0, 0, 0), jitter=0.004, seam=True):
        """A paper cone (a turret hat, a tree): rolled from a sheet, so it gets a seam line."""
        faces = self.cylinder(base, radius, height, color, segs, flag, caps=True, radius_top=0.0, rot=rot,
                              jitter=jitter, cuts=1)
        if seam:
            up = Euler(rot).to_matrix() @ Vector((0, 0, 1))
            side = Euler(rot).to_matrix() @ Vector((1, 0, 0))
            self.tape(Vector(base) + side * radius * 0.98, Vector(base) + up * height * 0.92 + side * 0.01, side,
                      width=0.025, color=(color[0] * 0.8, color[1] * 0.8, color[2] * 0.8))
        return faces

    def ball(self, center, radius, color, flag=PAPER, subdiv=2, crumple=0.25, smooth=False):
        """Crumpled tissue paper: an icosphere pushed about hard."""
        self._begin()
        bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=radius,
                                   matrix=Matrix.Translation(Vector(center)))
        faces = self._new()
        c = Vector(center)
        off = Vector((self.seed, self.seed * 2.0, 0.5))
        for v in self._verts(faces):
            d = (v.co - c)
            k = 1.0 + noise.noise(d * (3.5 / radius) + off) * crumple + self.rng.uniform(-0.06, 0.06)
            v.co = c + d * k
        self._paint(faces, color, flag, smooth=smooth)
        return faces

    def decal(self, name, center, normal, width, height=None, up=(0, 0, 1), rot=0.0, lift=0.007):
        """A marker drawing (models/marker_sheet.png) stuck on a surface facing `normal`."""
        u0, v0, u1, v1 = UV[name]
        if height is None:
            sw, sh = UV.get("_size", (1024, 1280))
            px_w = (u1 - u0) * sw
            px_h = (v1 - v0) * sh
            height = width * px_h / px_w
        n = Vector(normal).normalized()
        upv = Vector(up)
        if abs(upv.dot(n)) > 0.95:
            upv = Vector((0, 1, 0))
        right = upv.cross(n).normalized()
        upv = n.cross(right).normalized()
        a = math.radians(rot + self.rng.uniform(-2.5, 2.5))
        r2 = right * math.cos(a) + upv * math.sin(a)
        u2 = -right * math.sin(a) + upv * math.cos(a)
        c = Vector(center) + n * lift
        hw, hh = width * 0.5, height * 0.5
        self._begin()
        vs = [self.bm.verts.new(c - r2 * hw - u2 * hh), self.bm.verts.new(c + r2 * hw - u2 * hh),
              self.bm.verts.new(c + r2 * hw + u2 * hh), self.bm.verts.new(c - r2 * hw + u2 * hh)]
        f = self.bm.faces.new(vs)
        self._new()
        uvs = [(u0, 1.0 - v1), (u1, 1.0 - v1), (u1, 1.0 - v0), (u0, 1.0 - v0)]
        for l, uv in zip(f.loops, uvs):
            l[self.uv].uv = uv
        self._paint([f], (1, 1, 1), 1.0, mat=1)
        return [f]

    # --- shaping and painting what's already built -------------------------------------
    def crumple(self, faces, amp, freq=7.0, ridged=True):
        """Push vertices along their normals with folded (ridged) noise: crushed card."""
        off = Vector((self.seed * 1.37, self.seed * 2.11, self.seed * 0.53))
        self.bm.normal_update()
        for v in self._verts(faces):
            n = v.normal if v.normal.length > 0.1 else Vector((0, 0, 1))
            k = noise.noise(v.co * freq + off)
            if ridged:
                k = 0.5 - abs(k) * 1.6
            v.co += n * k * amp + noise.noise_vector(v.co * freq * 0.5 + off) * amp * 0.35

    def squash(self, faces, center, factor, bulge=0.0):
        """Flatten toward the floor (z) around `center`; `bulge` pushes the low part out."""
        c = Vector(center)
        for v in self._verts(faces):
            h = v.co.z
            v.co.z = h * factor
            if bulge:
                r = Vector((v.co.x - c.x, v.co.y - c.y, 0))
                v.co += r * bulge * max(0.0, 1.0 - h * 2.0)

    def curl(self, faces, hinge, along, out, radius):
        """Bend geometry that sticks out from a hinge line round a cylinder of `radius`
        (a flap that curled up in the heat)."""
        hinge, along, out = Vector(hinge), Vector(along).normalized(), Vector(out).normalized()
        up = along.cross(out).normalized()
        for v in self._verts(faces):
            rel = v.co - hinge
            t = rel.dot(out)
            if t <= 0:
                continue
            h = rel.dot(up)
            a = t / radius
            along_part = rel.dot(along)
            r = radius - h
            v.co = hinge + along * along_part + out * (math.sin(a) * r) + up * (radius - math.cos(a) * r)

    def transform(self, faces, matrix):
        m = Matrix(matrix)
        for v in self._verts(faces):
            v.co = m @ v.co

    def paint_by(self, faces, fn, flag=None):
        """Colour every corner by fn(position, normal) -> rgb (or rgba with a flag)."""
        for f in faces:
            for l in f.loops:
                c = fn(l.vert.co, f.normal)
                fl = l[self.col][3] if flag is None else flag
                l[self.col] = (c[0], c[1], c[2], c[3] if len(c) > 3 else fl)

    def streaks(self, faces, color, amount=0.12, freq=(3.0, 26.0, 3.0), under=None, misses=0.0):
        """Poster paint put on with a brush: streaky along one direction, thin where it
        missed (the print underneath shows through: `under`)."""
        off = Vector((self.seed * 0.7, self.seed * 1.3, 0.4))
        fx, fy, fz = freq

        def fn(p, n):
            q = Vector((p.x * fx, p.y * fy, p.z * fz)) + off
            k = 1.0 + noise.noise(q) * amount
            col = [color[i] * k for i in range(3)]
            if under is not None and misses > 0.0:
                m = noise.noise(p * 9.0 + off * 3.0)
                if m > 1.0 - misses * 2.0:
                    t = min(1.0, (m - (1.0 - misses * 2.0)) * 6.0)
                    col = [col[i] * (1 - t) + under[i] * t for i in range(3)]
            return col
        self.paint_by(faces, fn)

    def burnt(self, faces, ash_top=0.55, scorch_low=0.25, seed_off=0.0):
        """Char (#2a2420, never black) with grey ash settled on what faces up and a
        little scorched brown card left low down and on the edges."""
        off = Vector((self.seed * 2.3 + seed_off, self.seed * 0.9, 1.7))

        def fn(p, n):
            k = noise.noise(p * 11.0 + off)
            c = [CHAR[i] * (1.0 + k * 0.35) for i in range(3)]
            if k > 0.25:
                c = [c[i] * 0.4 + CHAR_LIGHT[i] * 0.6 for i in range(3)]
            low = max(0.0, 1.0 - p.z / 0.12) * scorch_low * (0.6 + 0.4 * noise.noise(p * 5.0 + off))
            c = [c[i] * (1 - low) + SCORCH[i] * low for i in range(3)]
            up = max(0.0, n.z) ** 2
            a = up * ash_top * (0.55 + 0.45 * noise.noise(p * 7.0 + off * 1.3))
            a = max(0.0, min(1.0, a))
            ash = ASH_LIGHT if noise.noise(p * 23.0) > 0.3 else ASH
            return [c[i] * (1 - a) + ash[i] * a for i in range(3)]
        self.paint_by(faces, fn)

    def add_mesh(self, me, matrix=None, color=(1, 1, 1), flag=CARD, smooth=True):
        """Append another mesh's geometry (e.g. a metaball hand) as a part."""
        self._begin()
        m = Matrix(matrix) if matrix is not None else Matrix.Identity(4)
        vmap = [self.bm.verts.new(m @ v.co) for v in me.vertices]
        for poly in me.polygons:
            try:
                self.bm.faces.new([vmap[i] for i in poly.vertices])
            except ValueError:
                pass
        faces = self._new()
        for f in faces:
            f.normal_update()
        self._paint(faces, color, flag, smooth=smooth)
        return faces

    def outline(self, faces, thickness=0.004):
        """An inverted-hull ink line round some parts (drawn-cartoon look on the held tools)."""
        self._begin()
        src = list(faces)
        vnorm = {}
        for f in src:
            for v in f.verts:
                vnorm.setdefault(v, Vector((0, 0, 0)))
                vnorm[v] += f.normal
        vmap = {}
        for v, n in vnorm.items():
            nn = n.normalized() if n.length > 1e-6 else Vector((0, 0, 1))
            vmap[v] = self.bm.verts.new(v.co + nn * thickness)
        for f in src:
            try:
                self.bm.faces.new([vmap[v] for v in reversed(f.verts)])
            except ValueError:
                pass
        hull = self._new()
        for f in hull:
            f.normal_update()
        self._paint(hull, INK, INKLINE, smooth=True)
        return hull

    # --- finish -----------------------------------------------------------------------------
    def build(self):
        me = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        me.materials.append(_MATS["card"])
        me.materials.append(_MATS["decal"])
        obj = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(obj)
        _use_color(me)
        return obj


# =====================================================================================
# Ambient occlusion, baked into the vertex colours
# =====================================================================================
def bake_ao(objs, distance=0.3, samples=24, floor=True):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    scene.world.light_settings.distance = distance
    ground = None
    if floor:
        bpy.ops.mesh.primitive_plane_add(size=200.0, location=(0, 0, -0.001))
        ground = bpy.context.active_object
    for obj in objs:
        me = obj.data
        base = me.color_attributes["Color"]
        ao = me.color_attributes.new("AO", "FLOAT_COLOR", "CORNER")
        me.color_attributes.active_color = ao
        for o in bpy.context.selected_objects:
            o.select_set(False)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
        except Exception as e:  # keep going without AO rather than fail the whole kit
            print("AO bake failed for", obj.name, e)
        base_d = base.data
        ao_d = ao.data
        for i in range(len(base_d)):
            c = base_d[i].color
            a = ao_d[i].color[0]
            k = 0.42 + 0.58 * a
            base_d[i].color = (c[0] * k, c[1] * k, c[2] * k, c[3])
        me.color_attributes.remove(ao)
        _use_color(me)
    if ground is not None:
        bpy.data.objects.remove(ground, do_unlink=True)


def _use_color(me):
    """Make "Color" both the active and the render colour (the exporter writes the render one)."""
    ca = me.color_attributes
    if ca.get("Color") is None:
        return
    ca.active_color = ca["Color"]
    for i, a in enumerate(ca):
        if a.name == "Color":
            ca.render_color_index = i
            ca.active_color_index = i


def metaball_mesh(elements, resolution=0.012, threshold=0.6):
    """A blobby organic mesh from metaball elements: [(type, co, radius, size_xyz, rot_quat)]."""
    mb = bpy.data.metaballs.new("mb")
    mb.resolution = resolution
    mb.render_resolution = resolution
    mb.threshold = threshold
    for kind, co, radius, size, rot in elements:
        e = mb.elements.new(type=kind)
        e.co = co
        e.radius = radius
        if size is not None:
            e.size_x, e.size_y, e.size_z = size
        if rot is not None:
            e.rotation = rot
    obj = bpy.data.objects.new("mb", mb)
    bpy.context.scene.collection.objects.link(obj)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    bpy.data.objects.remove(obj, do_unlink=True)
    return me


def export(objs, filename):
    path = os.path.join(MODELS, filename)
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_vertex_color="ACTIVE", export_all_vertex_colors=False, export_image_format="NONE", export_yup=True,
                              export_animations=False)
    print("exported", path, len(objs), "models")


def lay_out(objs, spacing=0.4, per_row=6):
    """Spread models out in rows (for the contact sheet), keeping each one's place in the file."""
    x = 0.0
    y = 0.0
    row_d = 0.0
    k = 0
    for o in objs:
        dims = o.dimensions
        if k and k % per_row == 0:
            x = 0.0
            y += row_d + spacing
            row_d = 0.0
        o.location = (x + dims.x * 0.5, y + dims.y * 0.5, 0)
        x += dims.x + spacing
        row_d = max(row_d, dims.y)
        k += 1
