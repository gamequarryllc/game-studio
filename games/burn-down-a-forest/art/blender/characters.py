"""The fire-keeper, the tools, the helpers and the critters.

The keeper is built round the fire and kept round against the spiky cold
forest: a rust-red cape gone black with soot at the hem (a ragged, scorched
edge and an ochre patch stitched on the back, where the chase camera looks), a
fat knitted scarf in ember orange with a tail that flies out behind, a round
hood with a soft drooping tip over a soot-dark face with two warm eyes, chunky
boots, leather mittens, and a brass lantern hanging from a crooked pole in the
left hand. Parts are separate objects so the game can animate them
(scripts/keeper.gd puts them together). Tools are the real objects, bevelled
and worn at the edges, held with the grip at the origin and the business end
along the game's +Z (Blender -Y).

Vertex alpha: 0.5 glows fully (lantern glass, the face's eyes, sprite bodies),
0.3 glows faintly (the scarf's ember stripes), 0 is plain.

Run:  python3 art/blender/characters.py   (writes models/keeper.glb, tools.glb, creatures.glb)
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forest_lib as L  # noqa: E402
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector, noise  # noqa: E402

CAPE = L.srgb("#8E3A2C")
CAPE_DARK = L.srgb("#5E2420")
SOOT = L.srgb("#1E1618")
PATCH = L.srgb("#A0703C")
STITCH = L.srgb("#E3C99A")
HOOD = L.srgb("#8A3528")
FACE = L.srgb("#1C1420")
EYE = L.srgb("#FFC15E")
SCARF = L.srgb("#E8642C")
STRIPE = L.srgb("#FFC15E")
FRINGE = L.srgb("#C24A22")
CREAM = L.srgb("#EFE3C8")
INK = L.srgb("#2E1E14")
LEATHER = L.srgb("#6B4A35")
LEATHER_HI = L.srgb("#A07A58")
BOOT = L.srgb("#3E2A20")
SOLE = L.srgb("#1E1612")
BRASS = L.srgb("#C0913F")
BRASS_DARK = L.srgb("#7A5A2A")
BRASS_HI = L.srgb("#F0D08A")
GLASS = L.srgb("#FFC15E")
GLASS_CORE = L.srgb("#FFE2A0")
WOOD = L.srgb("#B58A57")
WOOD_DARK = L.srgb("#7A5636")
WOOD_HI = L.srgb("#D8B07A")
EMBER = L.srgb("#E8642C")
POPPY = L.srgb("#D9483B")
STEEL = L.srgb("#6D6A73")
STEEL_HI = L.srgb("#B8B4BE")
VIOLET = L.srgb("#6E4A9A")
MINT = L.srgb("#9FF0D0")
GOLD = L.srgb("#F2C14E")
WARM = 0.3                  # vertex alpha: a faint ember glow (the scarf's stripes)
Z = Vector((0, 0, 1))
F = Vector((0, -1, 0))      # the game's forward (+Z) in Blender


def rot_x(deg):
    return Matrix.Rotation(math.radians(deg), 4, 'X')


def ring_mesh(m, rings, faces_closed=True):
    """Join a list of vertex rings (same length) with quads."""
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        n = len(a)
        for k in range(n):
            k2 = (k + 1) % n
            m.face([a[k], a[k2], b[k2], b[k]])


# ------------------------------------------------------------------------------------
# The fire-keeper: one sculpted figure
# ------------------------------------------------------------------------------------
# The body is ONE mesh: a quad cage (cape, shoulder capelet, hood with a long
# floppy tip and a tassel, the face inside it, the knitted scarf round the
# neck, a satchel on the back with the notebook strapped to it), smoothed by
# subdivision, then painted part by part (soot creeping up the cape's hem,
# knit stripes, stitching, the notebook's cream page edges) and baked (AO,
# edge wear, crease grime). Only what has to move is separate: the mittens,
# the boots, the two scarf tails, the lantern and its pole.
OCHRE_WOOL = L.srgb("#B98A44")
OCHRE_DARK = L.srgb("#7E5A2A")
SKIN = L.srgb("#E2B08A")
CHEEK = L.srgb("#D9806E")
SATCHEL = L.srgb("#7A5034")
SATCHEL_HI = L.srgb("#A87A52")
BOOK = L.srgb("#3E2A20")
PAGE = L.srgb("#E9DCC0")
RIBBON = L.srgb("#A8322A")
MITTEN = L.srgb("#E3D3B0")

P_CAPE, P_CAPELET, P_HOOD, P_FACE, P_EYE, P_GLINT, P_SCARF, P_SATCHEL, P_BUCKLE, P_BOOK, P_PAGE, P_RIBBON, P_TASSEL, P_STRAP = range(14)


class Cage:
    """A quad cage under construction: vertices, faces with a part number each."""

    def __init__(self):
        self.v = []
        self.f = []          # (indices, part)

    def add(self, p):
        self.v.append(Vector(p))
        return len(self.v) - 1

    def ring(self, pts):
        return [self.add(p) for p in pts]

    def loft(self, rings, part, closed=True, cap_start=False, cap_end=False):
        for i in range(len(rings) - 1):
            a, b = rings[i], rings[i + 1]
            n = len(a)
            for k in range(n if closed else n - 1):
                k2 = (k + 1) % n
                self.f.append(([a[k], a[k2], b[k2], b[k]], part))
        if cap_start:
            self.f.append((list(reversed(rings[0])), part))
        if cap_end:
            self.f.append((list(rings[-1]), part))

    def box(self, c, size, part, rot=None):
        hx, hy, hz = size[0] * 0.5, size[1] * 0.5, size[2] * 0.5
        R = rot if rot is not None else Matrix.Identity(3)
        corners = [Vector((sx * hx, sy * hy, sz * hz)) for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
        idx = [self.add(Vector(c) + R @ q) for q in corners]
        for quad in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            self.f.append(([idx[q] for q in quad], part))
        return idx

    def ellipsoid(self, c, r, part, seg=8, rings=6):
        c = Vector(c)
        top = self.add(c + Vector((0, 0, r[2])))
        bot = self.add(c - Vector((0, 0, r[2])))
        rs = []
        for i in range(1, rings):
            phi = math.pi * i / rings
            rs.append(self.ring([c + Vector((math.sin(phi) * math.cos(2 * math.pi * k / seg) * r[0],
                                             math.sin(phi) * math.sin(2 * math.pi * k / seg) * r[1],
                                             math.cos(phi) * r[2])) for k in range(seg)]))
        for k in range(seg):
            k2 = (k + 1) % seg
            self.f.append(([top, rs[0][k], rs[0][k2]], part))
            self.f.append(([bot, rs[-1][k2], rs[-1][k]], part))
        self.loft(rs, part)

    def to_object(self, name, levels=2):
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in self.v]
        for idx, part in self.f:
            try:
                face = bm.faces.new([vs[i] for i in idx])
            except ValueError:
                continue
            face.material_index = part
            face.smooth = True
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        me = bpy.data.meshes.new(name + "_cage")
        bm.to_mesh(me)
        bm.free()
        for k in range(16):           # slots, so the part numbers survive the modifier
            me.materials.append(bpy.data.materials.get("part%d" % k) or bpy.data.materials.new("part%d" % k))
        ob = bpy.data.objects.new(name + "_cage", me)
        bpy.context.scene.collection.objects.link(ob)
        mod = ob.modifiers.new("smooth", 'SUBSURF')
        mod.levels = levels
        mod.render_levels = levels
        dg = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        bpy.data.objects.remove(ob)
        return me2


def model_from(name, me, seed, paint):
    """A forest_lib Model whose bmesh is a finished (subdivided) mesh; paint(v,
    part) gives each vertex its base colour, part flag and highlight weight."""
    m = L.Model(name, seed)
    m.bm.free()
    m.bm = bmesh.new()
    m.bm.from_mesh(me)
    m.col = m.bm.verts.layers.float_color.new("base")
    m.hi = m.bm.verts.layers.float.new("hi")
    part_of = {}
    for f in m.bm.faces:
        f.smooth = True
        for v in f.verts:
            part_of.setdefault(v, f.material_index)
        f.material_index = 0
    for v in m.bm.verts:
        rgb, flag, hi = paint(v.co, part_of.get(v, 0))
        v[m.col] = (rgb[0], rgb[1], rgb[2], flag)
        v[m.hi] = hi
    bpy.data.meshes.remove(me)
    return m


def keeper_body():
    """The fire-keeper, all of a piece: a rust cape belling out to a ragged,
    soot-black hem; a mustard wool capelet over the shoulders with a scalloped
    edge; a hood that frames a round, soot-smudged face (a real face: a nose,
    rosy cheeks, two dark eyes with a glint) and runs back into a long floppy
    tip that flops over to one side and ends in a tassel; a fat knitted ember
    scarf round the neck, knotted at the back; a leather satchel on the back,
    a strap across the chest, and the notebook strapped to the satchel's flap
    with its red ribbon hanging out. From behind: hood tip, capelet, satchel."""
    c = Cage()
    N = 16

    def ell_ring(z, rx, ry, cy=0.0, phase=0.0, jag=None, folds=0.0):
        pts = []
        for k in range(N):
            a = 2 * math.pi * k / N + phase
            zz = z + (jag(k) if jag else 0.0)
            back = 1.0 + 0.06 * max(0.0, math.sin(a))          # fuller at the back (+Y)
            fold = 1.0 + folds * math.cos(a * 8.0 + 0.4)       # the cloth falls in folds
            pts.append(Vector((math.cos(a) * rx * fold, cy + math.sin(a) * ry * back * fold, zz)))
        return pts

    # --- the cape: a bell from the neck to a ragged hem, with a lip of thickness
    rng = random.Random(5)
    jags = [rng.uniform(-0.05, 0.0) if k % 2 == 0 else rng.uniform(-0.015, 0.01) for k in range(N)]
    prof = [(0.08, 0.47, 0.44), (0.18, 0.48, 0.45), (0.33, 0.45, 0.43), (0.48, 0.4, 0.38), (0.62, 0.33, 0.31), (0.73, 0.25, 0.23), (0.81, 0.16, 0.15)]
    rings = []
    for i, (z, rx, ry) in enumerate(prof):
        folds = max(0.0, 0.05 * (1.0 - z / 0.6))
        rings.append(c.ring(ell_ring(z, rx, ry, jag=(lambda k: jags[k]) if i == 0 else None, folds=folds)))
    inner = c.ring([Vector((p.x * 0.88, p.y * 0.88, p.z + 0.07)) for p in (c.v[i] for i in rings[0])])
    c.loft([inner] + rings, P_CAPE, cap_end=True)

    # --- the capelet over the shoulders: a shorter bell with eight round scallops
    cprof = [(0.86, 0.18, 0.17), (0.79, 0.29, 0.27), (0.68, 0.4, 0.37), (0.58, 0.47, 0.44)]
    crings = []
    for i, (z, rx, ry) in enumerate(cprof):
        if i == len(cprof) - 1:
            crings.append(c.ring(ell_ring(z, rx, ry, jag=lambda k: -0.06 if k % 2 == 0 else 0.0)))
        else:
            crings.append(c.ring(ell_ring(z, rx, ry)))
    cin = c.ring([Vector((p.x * 0.9, p.y * 0.9, p.z + 0.06)) for p in (c.v[i] for i in crings[-1])])
    c.loft(crings + [cin], P_CAPELET)

    # --- the face: a round head deep in the hood, a button nose, eyes with a glint
    c.ellipsoid((0, -0.03, 1.12), (0.2, 0.19, 0.205), P_FACE, seg=10, rings=7)
    c.ellipsoid((0, -0.225, 1.095), (0.04, 0.035, 0.034), P_FACE, seg=6, rings=4)
    for sx in (-1, 1):
        c.ellipsoid((sx * 0.075, -0.205, 1.155), (0.026, 0.016, 0.032), P_EYE, seg=6, rings=4)
        c.ellipsoid((sx * 0.07, -0.22, 1.17), (0.008, 0.006, 0.008), P_GLINT, seg=4, rings=3)

    # --- the hood: rings from the face opening round the head to the back of the
    # neck, then on along a crooked spine into the long floppy tip
    hood_spine = [Vector((0, -0.22, 1.13)), Vector((0, -0.12, 1.15)), Vector((0, 0.0, 1.16)), Vector((0, 0.12, 1.15)),
                  Vector((0, 0.22, 1.18)), Vector((0.02, 0.32, 1.26)), Vector((0.07, 0.42, 1.3)), Vector((0.13, 0.5, 1.24)),
                  Vector((0.18, 0.55, 1.12)), Vector((0.21, 0.57, 0.99))]
    hood_r = [0.215, 0.29, 0.32, 0.31, 0.24, 0.17, 0.12, 0.085, 0.06, 0.04]
    hrings = []
    prev_x = None
    for i, p in enumerate(hood_spine):
        d = (hood_spine[min(i + 1, len(hood_spine) - 1)] - hood_spine[max(i - 1, 0)]).normalized()
        x = Vector((1, 0, 0)) if prev_x is None else prev_x - d * prev_x.dot(d)
        x.normalize()
        prev_x = x
        y = d.cross(x).normalized()
        pts = []
        for k in range(N):
            a = 2 * math.pi * k / N
            r = hood_r[i]
            if i <= 3:
                r *= 1.0 + 0.06 * max(0.0, -math.sin(a))     # the hood sags a little at its lower edge
            pts.append(p + (x * math.cos(a) + y * math.sin(a) * 1.08) * r)
        hrings.append(c.ring(pts))
    # a rolled rim round the face opening (the hood's edge turned back)
    rim_out = c.ring([Vector((q.x * 1.12, q.y - 0.03, (q.z - 1.13) * 1.12 + 1.13)) for q in (c.v[i] for i in hrings[0])])
    c.loft([rim_out, hrings[0]] + hrings[1:], P_HOOD, cap_end=True)
    # the tassel on the end of the tip
    tip = hood_spine[-1]
    c.ellipsoid(tip + Vector((0.01, 0.01, -0.06)), (0.055, 0.055, 0.06), P_TASSEL, seg=8, rings=5)

    # --- the scarf: a fat knitted roll round the neck, knotted at the back
    srings = []
    for i in range(N):
        a = 2 * math.pi * i / N
        cen = Vector((math.cos(a) * 0.205, math.sin(a) * 0.19, 0.88 + 0.015 * math.sin(a * 2)))
        tang = Vector((-math.sin(a), math.cos(a), 0))
        out = Vector((math.cos(a), math.sin(a), 0))
        ring = []
        for k in range(8):
            b = 2 * math.pi * k / 8
            rr = 0.075 * (1.0 + 0.1 * math.cos(i * 2.0))     # knit ribs
            ring.append(cen + (out * math.cos(b) + Vector((0, 0, 1)) * math.sin(b)) * rr)
        srings.append(c.ring(ring))
    for i in range(N):
        a, b = srings[i], srings[(i + 1) % N]
        for k in range(8):
            k2 = (k + 1) % 8
            c.f.append(([a[k], a[k2], b[k2], b[k]], P_SCARF))
    c.ellipsoid((0.07, 0.22, 0.86), (0.08, 0.07, 0.075), P_SCARF, seg=8, rings=5)

    # --- the satchel on the back, its flap, a buckle, and the strap over the shoulder
    R = Matrix.Rotation(-0.1, 3, 'Z') @ Matrix.Rotation(0.12, 3, 'X')
    c.box((0.04, 0.47, 0.33), (0.46, 0.2, 0.34), P_SATCHEL, rot=R)
    c.box((0.04, 0.575, 0.41), (0.48, 0.04, 0.22), P_SATCHEL, rot=R)          # the flap
    c.box((0.04, 0.605, 0.31), (0.08, 0.035, 0.08), P_BUCKLE, rot=R)           # the buckle
    # the notebook strapped on the flap, standing a little proud, ribbon hanging out
    RB = R @ Matrix.Rotation(0.1, 3, 'Y')
    c.box((-0.06, 0.635, 0.46), (0.24, 0.055, 0.3), P_BOOK, rot=RB)
    c.box((-0.06, 0.632, 0.465), (0.22, 0.062, 0.28), P_PAGE, rot=RB)
    c.box((0.0, 0.67, 0.27), (0.028, 0.01, 0.17), P_RIBBON, rot=RB)
    c.box((-0.06, 0.67, 0.47), (0.3, 0.014, 0.035), P_STRAP, rot=RB)           # the strap round the book
    # the satchel's strap: up over the left shoulder and down across the chest
    strap = [Vector((0.24, 0.42, 0.47)), Vector((0.05, 0.4, 0.62)), Vector((-0.17, 0.3, 0.66)), Vector((-0.31, 0.06, 0.58)),
             Vector((-0.25, -0.26, 0.5)), Vector((-0.02, -0.4, 0.4)), Vector((0.22, -0.36, 0.33)), Vector((0.36, -0.12, 0.3))]
    st_rings = []
    for i, p in enumerate(strap):
        d = (strap[min(i + 1, len(strap) - 1)] - strap[max(i - 1, 0)]).normalized()
        out = Vector((p.x, p.y, 0)).normalized()
        side = d.cross(out).normalized()
        st_rings.append(c.ring([p + out * 0.012 + side * 0.03, p + out * 0.012 - side * 0.03, p - out * 0.008 - side * 0.03, p - out * 0.008 + side * 0.03]))
    c.loft(st_rings, P_STRAP)

    me = c.to_object("k_body", levels=1)

    def paint(co, part):
        z = co.z
        n = noise.noise(Vector((co.x * 6.0, co.y * 6.0, co.z * 3.0)))
        if part == P_CAPE:
            soot = max(0.0, min(1.0, (0.3 - z) / 0.24 + n * 0.45))
            return L.mix(L.mix(CAPE_DARK, CAPE, min(1.0, z * 2.0)), SOOT, soot * 0.92), L.BARK, 0.0
        if part == P_CAPELET or part == P_HOOD:
            base = L.mix(OCHRE_DARK, OCHRE_WOOL, 0.75 + 0.25 * n)
            if part == P_HOOD:
                # the turned-back rim and the tip go a little sooty; the inside of the opening is shadowed
                if co.y < -0.2:
                    base = L.mix(base, OCHRE_DARK, 0.45)
                if co.y > 0.4:
                    base = L.mix(base, L.mix(OCHRE_DARK, SOOT, 0.3), min(1.0, (co.y - 0.4) * 3.0))
            elif z < 0.56:
                base = L.mix(base, SOOT, 0.3)
            return base, L.BARK, 0.0
        if part == P_FACE:
            col = SKIN
            cheek = max(0.0, 1.0 - min((Vector((abs(co.x), co.y, co.z)) - Vector((0.11, -0.19, 1.07))).length / 0.06, 1.0))
            col = L.mix(col, CHEEK, cheek * 0.6)
            smudge = max(0.0, noise.noise(Vector((co.x * 14.0, co.y * 14.0, co.z * 14.0 + 3.0))) - 0.25)
            col = L.mix(col, SOOT, min(0.5, smudge * 1.4))
            return col, L.BARK, 0.0
        if part == P_EYE:
            return INK, L.BARK, 0.0
        if part == P_GLINT:
            return CREAM, L.BARK, 0.0
        if part == P_SCARF:
            ang = math.atan2(co.y, co.x)
            stripe = (int((ang + math.pi) / (2 * math.pi) * 10.0) % 3 == 1) and z > 0.8
            return (STRIPE if stripe else SCARF), L.BARK, 0.0
        if part == P_SATCHEL:
            return L.mix(SATCHEL, SATCHEL_HI, 0.25 + 0.25 * n), L.BARK, 0.0
        if part == P_BUCKLE:
            return BRASS, L.BARK, 0.6
        if part == P_BOOK:
            return BOOK, L.BARK, 0.0
        if part == P_PAGE:
            return PAGE, L.BARK, 0.0
        if part == P_RIBBON:
            return RIBBON, L.BARK, 0.0
        if part == P_TASSEL:
            return L.mix(SCARF, CREAM, 0.3), L.BARK, 0.0
        if part == P_STRAP:
            return L.mix(SATCHEL, SOOT, 0.25), L.BARK, 0.0
        return CAPE, L.BARK, 0.0

    m = model_from("k_body", me, 31, paint)
    m.bake(ao_dist=0.35, ao_rays=20, ao_strength=0.7, ground=False, wear=0.3, wear_color=CREAM, grime=0.35, paint=0.14, paint_scale=7.0)
    print("k_body", m.tri_count(), "tris")
    return m.finish()


def keeper_scarf_tail():
    """The scarf's two loose ends, from the knot at the back of the neck (origin):
    a long one and a short one, flat knitted strips with stripes and a fringe,
    swinging and streaming out when the keeper walks (animated in the game)."""
    m = L.Model("k_scarf", 37)
    for k, (ln, side, sw) in enumerate(((0.62, 0.05, 1.0), (0.42, -0.06, 0.7))):
        pts = [Vector((side * 0.3, 0, 0))]
        for i in range(1, 7):
            t = i / 6
            # down over the capelet's slope (outward, +Y), not through it
            pts.append(Vector((side * (0.3 + t * 1.6) + 0.04 * math.sin(t * 5 + k), 0.08 + t * ln * 0.62 * sw, -t * ln)))
        n = len(pts)
        m.tube(pts, [0.06] * n, 6, SCARF, L.BARK, squash=(1.0, 0.32), cap_top=False,
               color_fn=lambda t, kk: STRIPE if (0.22 < t < 0.34 or 0.6 < t < 0.72) else SCARF)
        end = pts[-1]
        for f in range(5):
            q = end + Vector(((f - 2) * 0.022, 0.0, 0.0))
            m.tube([q, q + Vector((0.0, 0.01, -0.06))], [0.009, 0.005], 3, FRINGE, L.BARK, cap_top=False)
    m.bake(ao_dist=0.1, ao_strength=0.3, ground=False, paint=0.15, paint_scale=8.0)
    print("k_scarf", m.tri_count(), "tris")
    return m.finish()


def keeper_hand():
    """A knitted mitten: a fat round hand with a thumb, a ribbed cuff with a red band."""
    c = Cage()
    c.ellipsoid((0, -0.01, 0.0), (0.075, 0.07, 0.09), 0, seg=8, rings=6)
    c.ellipsoid((0.065, -0.035, 0.02), (0.03, 0.028, 0.04), 0, seg=6, rings=4)
    rings = []
    for z, r in ((0.05, 0.068), (0.09, 0.075), (0.13, 0.074), (0.15, 0.066)):
        rings.append(c.ring([Vector((math.cos(2 * math.pi * k / 10) * r, math.sin(2 * math.pi * k / 10) * r, z)) for k in range(10)]))
    c.loft(rings, 1)
    me = c.to_object("k_hand", levels=1)

    def paint(co, part):
        if part == 1:
            band = 0.085 < co.z < 0.115
            return (POPPY if band else L.mix(MITTEN, OCHRE_DARK, 0.15)), L.BARK, 0.0
        return MITTEN, L.BARK, 0.0
    m = model_from("k_hand", me, 34, paint)
    m.bake(ao_dist=0.1, ao_strength=0.4, ground=False, wear=0.3, grime=0.35, paint=0.2, paint_scale=30.0)
    print("k_hand", m.tri_count(), "tris")
    return m.finish()


def keeper_foot():
    """A chunky boot: a round toe cap, a heel, a thick dark sole, laces, a
    turned-down leather cuff."""
    c = Cage()
    c.ellipsoid((0, -0.06, 0.07), (0.095, 0.16, 0.07), 0, seg=10, rings=6)        # the foot
    c.ellipsoid((0, -0.05, 0.02), (0.105, 0.17, 0.028), 1, seg=10, rings=4)       # the sole
    rings = []
    for z, r in ((0.06, 0.08), (0.12, 0.078), (0.16, 0.076), (0.19, 0.09), (0.22, 0.095)):
        rings.append(c.ring([Vector((math.cos(2 * math.pi * k / 10) * r, 0.02 + math.sin(2 * math.pi * k / 10) * r, z)) for k in range(10)]))
    c.loft(rings, 2)
    me = c.to_object("k_foot", levels=1)

    def paint(co, part):
        if part == 1:
            return SOLE, L.BARK, 0.0
        if part == 2:
            return (LEATHER if co.z > 0.18 else BOOT), L.BARK, 0.0
        lace = abs(co.x) < 0.02 and co.y < -0.06 and co.z > 0.1 and int((co.y + 1.0) * 60) % 2 == 0
        return (CREAM if lace else BOOT), L.BARK, 0.0
    m = model_from("k_foot", me, 35, paint)
    m.bake(ao_dist=0.15, ao_strength=0.55, ground=True, wear=0.55, wear_color=LEATHER_HI, grime=0.35)
    print("k_foot", m.tri_count(), "tris")
    return m.finish()


def keeper_lantern():
    """A brass lantern; origin at its hanging ring, so it can sway from the pole."""
    m = L.Model("k_lantern", 36)
    o = Vector((0, 0, -0.3))
    m.lathe([(0.0, 0.2), (0.05, 0.19), (0.095, 0.15), (0.12, 0.12), (0.035, 0.12)], 6, BRASS, L.BARK, center=o, close_bottom=False)
    m.lathe([(0.085, -0.08), (0.095, 0.02), (0.085, 0.12)], 6, GLASS, L.GLOW, center=o, close_top=False, close_bottom=False,
            color_fn=lambda t, k: L.mix(GLASS, GLASS_CORE, 1.0 - abs(t - 0.5) * 2))
    m.lathe([(0.12, -0.13), (0.11, -0.08), (0.0, -0.08)], 6, BRASS_DARK, L.BARK, center=o, close_top=False)
    for k in range(6):
        a = 2 * math.pi * k / 6
        m.box(o + Vector((math.cos(a) * 0.098, math.sin(a) * 0.098, 0.02)), (0.016, 0.016, 0.21), BRASS_DARK, L.BARK, bevel=0.004,
              rot=Matrix.Rotation(a, 3, 'Z'))
    m.tube([o + Vector((-0.055, 0, 0.2)), Vector((0, 0, 0.0)), o + Vector((0.055, 0, 0.2))], [0.009, 0.009, 0.009], 4, BRASS_DARK, L.BARK)
    m.blob(o + Vector((0, 0, -0.16)), 0.03, BRASS, L.BARK, subdiv=1, rough=0.0, seed=4)
    m.bake(ao_dist=0.1, ao_strength=0.4, ground=False, wear=0.7, wear_color=BRASS_HI, grime=0.4)
    return m.finish()


def keeper_pole():
    """A crooked wooden pole with a hook at the top (origin at the grip)."""
    m = L.Model("k_pole", 38)
    rng = m.rng
    pts = [Vector((0, 0, -0.42)), Vector((0.01, 0.01, 0.0)), Vector((-0.015, 0.02, 0.45)), Vector((0.01, 0.0, 0.85)),
           Vector((0.0, -0.03, 1.08)), Vector((0.0, -0.12, 1.2)), Vector((0.0, -0.22, 1.19)), Vector((0.0, -0.26, 1.12))]
    pts = L.smooth_spine(pts)
    n = len(pts)
    m.tube(pts, [0.03 - 0.008 * (i / (n - 1)) for i in range(n)], 6, WOOD_DARK, L.BARK, cap_top=True, cap_bottom=True,
           wobble=0.06, color_fn=lambda t, k: L.mix(WOOD_DARK, WOOD, 0.3 * (k % 2) + 0.2 * rng.random()))
    # a leather grip wrap and a knot of twine below the hook
    m.lathe([(0.034, -0.08), (0.036, 0.0), (0.034, 0.08)], 8, LEATHER, L.BARK, close_top=False, close_bottom=False)
    m.lathe([(0.03, 1.0), (0.034, 1.03), (0.03, 1.06)], 8, CREAM, L.BARK, close_top=False, close_bottom=False)
    m.bake(ao_dist=0.1, ao_strength=0.3, ground=False, wear=0.5, wear_color=WOOD_HI, paint=0.15, paint_scale=12.0)
    return m.finish()


POLE_HOOK = Vector((0.0, -0.26, 1.13))   # where the lantern hangs (Blender coords, pole space)


# ------------------------------------------------------------------------------------
# Tools (grip at the origin, flame end toward -Y), bevelled, worn at the edges
# ------------------------------------------------------------------------------------
def along(m, verts):
    """Built pointing +Z (up), turned to point -Y (the game's +Z)."""
    m.transform(verts, Matrix.Rotation(math.radians(90), 4, 'X'))


def tool_match(sparkler=False):
    m = L.Model("tool_0s" if sparkler else "tool_0", 41)
    if sparkler:
        cols = [L.srgb("#D9483B"), L.srgb("#F2C14E"), L.srgb("#6FB3D9"), L.srgb("#8FAE5E")]
        for k in range(4):
            m.box(Vector((0, 0, 0.06 + k * 0.1)), (0.045, 0.045, 0.1), cols[k], L.BARK, bevel=0.008)
        # a twist of wire and a fizzing ball
        m.tube([Vector((0, 0, 0.4)), Vector((0.01, 0, 0.43)), Vector((-0.01, 0, 0.46))], [0.008, 0.008, 0.006], 4, STEEL, L.BARK)
        m.blob(Vector((0, 0, 0.47)), 0.045, CREAM, L.GLOW, subdiv=1, rough=0.25, seed=1, spikes=0.3)
    else:
        # a square-sawn stick with a little grain, and a fat red head going dark at the tip
        vs = m.box(Vector((0, 0, 0.2)), (0.042, 0.042, 0.4), L.srgb("#E6CF9C"), L.BARK, bevel=0.008)
        m.recolor(vs, lambda v: (L.mix(L.srgb("#E6CF9C"), L.srgb("#C9A86E"), 0.5 + 0.5 * math.sin(v.co.z * 60 + v.co.x * 40)), L.BARK))
        m.blob(Vector((0, 0, 0.43)), 0.048, POPPY, L.BARK, subdiv=2, rough=0.08, seed=2, squash=(1, 1, 1.4),
               color_fn=lambda d, p: L.mix(POPPY, L.srgb("#5A1A16"), max(0.0, d.z) ** 2 * 0.7))
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.05, ao_strength=0.3, ground=False, wear=0.4, grime=0.3)
    return m.finish()


def tool_lighter():
    m = L.Model("tool_1", 42)
    m.box(Vector((0, 0, 0.065)), (0.1, 0.062, 0.15), BRASS, L.BARK, bevel=0.014)
    m.box(Vector((0, 0, 0.142)), (0.104, 0.066, 0.012), BRASS_DARK, L.BARK, bevel=0.004)
    # the flip lid thrown open on its hinge
    m.box(Vector((0.058, 0, 0.19)), (0.1, 0.062, 0.055), BRASS, L.BARK, bevel=0.012, rot=Matrix.Rotation(-1.95, 3, 'Y'))
    m.lathe([(0.012, 0.15), (0.014, 0.16), (0.012, 0.17)], 8, BRASS_DARK, L.BARK, center=(0.05, 0, 0), close_top=False, close_bottom=False)
    # the chimney with its holes, and the striker wheel
    m.lathe([(0.022, 0.148), (0.022, 0.2), (0.019, 0.205)], 10, STEEL, L.BARK, center=(-0.012, 0, 0), close_bottom=False)
    for k in range(3):
        for side in (-1, 1):
            m.blob(Vector((-0.012 + side * 0.006, -0.022, 0.16 + k * 0.014)), 0.0045, INK, L.BARK, subdiv=0, rough=0.0, seed=k)
    m.tube([Vector((0.02, -0.018, 0.185)), Vector((0.02, 0.018, 0.185))], [0.013, 0.013], 10, STEEL_HI, L.BARK, cap_bottom=True,
           color_fn=lambda t, k: STEEL_HI if k % 2 else STEEL)
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.05, ao_strength=0.35, ground=False, wear=0.8, wear_color=BRASS_HI, grime=0.4)
    return m.finish()


def tool_tiki():
    m = L.Model("tool_2", 43)
    # a bamboo pole with swollen nodes
    m.tube([Vector((0, 0, -0.12)), Vector((0.004, 0, 0.35)), Vector((0, 0, 0.8))], [0.03, 0.029, 0.028], 7, WOOD, L.BARK,
           color_fn=lambda t, k: L.mix(WOOD, WOOD_DARK, 0.25 * (k % 2)))
    for z in (0.08, 0.32, 0.56):
        m.lathe([(0.029, z - 0.014), (0.037, z - 0.004), (0.036, z + 0.006), (0.029, z + 0.014)], 7, WOOD_DARK, L.BARK,
                close_top=False, close_bottom=False)
    # the woven basket head, a wrap of oily cloth, char round the lip
    m.lathe([(0.03, 0.72), (0.085, 0.78), (0.115, 0.88), (0.11, 0.95), (0.075, 0.975), (0.05, 0.97)], 12, L.srgb("#8C6A3C"), L.BARK,
            color_fn=lambda t, k: L.mix(L.mix(L.srgb("#8C6A3C"), L.srgb("#5E4426"), 0.45 * ((k + int(t * 6)) % 2)), SOOT, max(0.0, t - 0.7) * 2.5))
    m.lathe([(0.11, 0.8), (0.125, 0.845), (0.11, 0.89)], 12, L.srgb("#3A2A22"), L.BARK, close_top=False, close_bottom=False)
    m.tube([Vector((0.11, 0.0, 0.845)), Vector((0.14, -0.01, 0.8)), Vector((0.15, -0.02, 0.74))], [0.016, 0.012, 0.0], 4,
           L.srgb("#3A2A22"), L.BARK, cap_top=False)
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.1, ao_strength=0.45, ground=False, wear=0.5, wear_color=WOOD_HI, grime=0.35)
    return m.finish()


def tool_flamer():
    m = L.Model("tool_3", 44)
    # a riveted brass tank held at the hip, a hose, a long nozzle with a grip and a valve wheel
    m.lathe([(0.0, -0.06), (0.06, -0.05), (0.085, -0.02), (0.088, 0.0), (0.088, 0.29), (0.082, 0.32), (0.06, 0.345), (0.0, 0.355)],
            14, BRASS, L.BARK, color_fn=lambda t, k: L.mix(BRASS_DARK, BRASS, 0.55 + 0.45 * math.cos(k * 0.45)))
    for z in (0.05, 0.24):
        m.lathe([(0.088, z - 0.016), (0.094, z - 0.006), (0.094, z + 0.006), (0.088, z + 0.016)], 14, BRASS_DARK, L.BARK,
                close_top=False, close_bottom=False)
        for k in range(7):
            a = 2 * math.pi * k / 7
            m.blob(Vector((math.cos(a) * 0.096, math.sin(a) * 0.096, z)), 0.007, BRASS_HI, L.BARK, subdiv=0, rough=0.0, seed=k)
    m.tube([Vector((0, 0.0, 0.34)), Vector((0, -0.04, 0.42)), Vector((0, -0.065, 0.5)), Vector((0, -0.065, 0.72))],
           [0.028, 0.026, 0.024, 0.022], 8, STEEL, L.BARK, color_fn=lambda t, k: L.mix(STEEL, L.srgb("#4A474F"), 0.4 * (int(t * 8) % 2)))
    m.lathe([(0.022, 0.68), (0.036, 0.7), (0.038, 0.725), (0.03, 0.74)], 10, BRASS_DARK, L.BARK, center=(0, -0.065, 0), close_bottom=False,
            color_fn=lambda t, k: L.mix(BRASS_DARK, SOOT, t))
    m.box(Vector((0, -0.065, 0.56)), (0.036, 0.05, 0.08), L.srgb("#3A2A22"), L.BARK, bevel=0.012)
    wheel = []
    for k in range(13):
        a = 2 * math.pi * k / 12
        wheel.append(Vector((math.cos(a) * 0.035, -0.1, 0.42 + math.sin(a) * 0.035)))
    m.tube(wheel, [0.007] * len(wheel), 5, POPPY, L.BARK, cap_top=False, cap_bottom=False)
    m.tube([Vector((0, -0.06, 0.42)), Vector((0, -0.1, 0.42))], [0.008, 0.008], 5, STEEL, L.BARK)
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.1, ao_strength=0.45, ground=False, wear=0.75, wear_color=BRASS_HI, grime=0.4)
    return m.finish()


def tool_dragon():
    """A dragon hand puppet: a felt head with a snout, horns, gold eyes and a cuff."""
    m = L.Model("tool_4", 45)
    felt = VIOLET
    m.blob(Vector((0, 0, 0.13)), 0.15, felt, L.BARK, subdiv=2, rough=0.06, seed=1, squash=(1.0, 0.92, 1.5),
           color_fn=lambda d, p: L.mix(felt, L.srgb("#9A7AC8"), max(0.0, -d.y) * 0.45))
    m.blob(Vector((0, -0.02, 0.34)), 0.085, felt, L.BARK, subdiv=2, rough=0.03, seed=2, squash=(1.15, 0.8, 1.05))
    for sx in (-1, 1):
        m.blob(Vector((sx * 0.035, -0.07, 0.41)), 0.016, INK, L.BARK, subdiv=1, rough=0.0, seed=7)      # nostrils
        m.blob(Vector((sx * 0.085, 0.08, 0.25)), 0.036, GOLD, L.GLOW, subdiv=1, rough=0.0, seed=3)
        m.blob(Vector((sx * 0.085, 0.105, 0.255)), 0.015, INK, L.BARK, subdiv=1, rough=0.0, seed=4, squash=(0.6, 1.0, 1.4))
        m.tube([Vector((sx * 0.07, 0.07, 0.19)), Vector((sx * 0.13, 0.13, 0.13)), Vector((sx * 0.14, 0.21, 0.04))], [0.026, 0.015, 0.0], 6,
               CREAM, L.BARK, cap_top=False)
    for k in range(4):
        m.tube([Vector((0, 0.13, 0.3 - k * 0.08)), Vector((0, 0.2, 0.27 - k * 0.08))], [0.026, 0.0], 5, L.srgb("#4A3070"), L.BARK, cap_top=False)
    m.lathe([(0.125, -0.06), (0.14, -0.02), (0.14, 0.02), (0.13, 0.04)], 12, L.srgb("#4A3070"), L.BARK, close_top=False, close_bottom=False)
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.1, ao_strength=0.45, ground=False, wear=0.3, grime=0.35, paint=0.15, paint_scale=10.0)
    return m.finish()


def tool_meteor():
    m = L.Model("tool_5", 46)
    # a twisted staff, a gold collar, three claws holding a star
    pts = [Vector((0.012 * math.sin(i * 1.3), 0.012 * math.cos(i * 1.3), -0.1 + i * 0.1)) for i in range(10)]
    m.tube(pts, [0.028] * 10, 6, L.srgb("#3D2B55"), L.BARK, twist=4.0, color_fn=lambda t, k: L.mix(L.srgb("#3D2B55"), L.srgb("#5E4A80"), 0.4 * (k % 2)))
    m.lathe([(0.03, 0.8), (0.05, 0.84), (0.05, 0.87), (0.03, 0.9)], 8, GOLD, L.BARK, close_top=False, close_bottom=False)
    for k in range(3):
        a = 2 * math.pi * k / 3
        d = Vector((math.cos(a), math.sin(a), 0))
        m.tube([Vector((0, 0, 0.88)) + d * 0.03, Vector((0, 0, 0.95)) + d * 0.09, Vector((0, 0, 1.05)) + d * 0.06], [0.012, 0.01, 0.0], 4,
               GOLD, L.BARK, cap_top=False)
    for plane in (0, 1):
        for face in (-1, 1):
            pts = []
            for k in range(10):
                a = math.pi * 0.5 + math.pi * k / 5
                r = 0.13 if k % 2 == 0 else 0.055
                if plane == 0:
                    pts.append(Vector((math.cos(a) * r, math.sin(a) * r, 1.0 + face * 0.025)))
                else:
                    pts.append(Vector((math.cos(a) * r, face * 0.025, 1.0 + math.sin(a) * r)))
            c = Vector((0, 0, 1.0 + face * 0.045)) if plane == 0 else Vector((0, face * 0.045, 1.0))
            m.fan(c, pts if face > 0 else list(reversed(pts)), GLASS_CORE, GOLD, L.GLOW)
    along(m, list(m.bm.verts))
    m.bake(ao_dist=0.1, ao_strength=0.3, ground=False, wear=0.6, wear_color=BRASS_HI, grime=0.3)
    return m.finish()


# ------------------------------------------------------------------------------------
# Helpers and critters (all face -Y)
# ------------------------------------------------------------------------------------
def sprite():
    """A fire sprite: a plump teardrop flame with a curled tip, two side tongues
    for arms and two ink eyes. Its body glows."""
    m = L.Model("sprite", 51)
    prof = [(0.0, -0.17), (0.1, -0.155), (0.17, -0.09), (0.195, 0.0), (0.18, 0.09), (0.13, 0.18), (0.075, 0.26), (0.03, 0.32), (0.0, 0.34)]
    rings = m.lathe(prof, 14, EMBER, L.GLOW, color_fn=lambda t, k: L.mix(GLASS_CORE, EMBER, min(1.0, t * 1.5)))
    for v in m.bm.verts:
        if v.co.z > 0.1:
            u = (v.co.z - 0.1) / 0.24
            v.co.y += u * u * 0.09          # the tip curls back
            v.co.x += u * u * 0.04
    for sx in (-1, 1):
        m.tube([Vector((sx * 0.16, 0.0, -0.02)), Vector((sx * 0.24, -0.02, 0.04)), Vector((sx * 0.27, 0.0, 0.12))], [0.045, 0.03, 0.0], 7,
               EMBER, L.GLOW, cap_top=False, color_fn=lambda t, k: L.mix(GLASS, EMBER, t))
        m.blob(Vector((sx * 0.062, -0.178, 0.03)), 0.028, INK, L.BARK, subdiv=1, rough=0.0, seed=2, squash=(0.75, 0.45, 1.25))
    # a little curl of flame on the crown
    m.tube([Vector((0.0, 0.07, 0.3)), Vector((0.04, 0.14, 0.36)), Vector((0.09, 0.15, 0.33))], [0.03, 0.018, 0.0], 6, EMBER, L.GLOW, cap_top=False)
    m.bake(ao_dist=0.1, ao_strength=0.25, ground=False)
    return m.finish()


def salamander():
    m = L.Model("salamander", 52)
    spine = [Vector((0, 0.62, 0.08)), Vector((0.07, 0.45, 0.1)), Vector((0.0, 0.25, 0.14)), Vector((-0.04, 0.0, 0.16)),
             Vector((0.0, -0.22, 0.17)), Vector((0.0, -0.36, 0.18))]
    radii = [0.0, 0.045, 0.085, 0.11, 0.1, 0.0]

    def col(t, k):
        belly = k in (5, 6, 7)
        base = L.srgb("#F2C09A") if belly else EMBER
        if not belly and (k + int(t * 9)) % 4 == 0 and 0.2 < t < 0.8:
            base = L.srgb("#3A1E16")
        return base
    m.tube(spine, radii, 10, EMBER, L.BARK, cap_top=False, squash=(1.2, 0.8), color_fn=col)
    m.blob(Vector((0, -0.4, 0.18)), 0.1, EMBER, L.BARK, subdiv=2, rough=0.0, seed=1, squash=(1.0, 1.35, 0.72))
    for sx in (-1, 1):
        m.blob(Vector((sx * 0.065, -0.45, 0.24)), 0.035, GOLD, L.GLOW, subdiv=1, rough=0.0, seed=2)
        m.blob(Vector((sx * 0.075, -0.475, 0.245)), 0.015, INK, L.BARK, subdiv=1, rough=0.0, seed=3)
        m.blob(Vector((sx * 0.025, -0.52, 0.19)), 0.008, INK, L.BARK, subdiv=0, rough=0.0, seed=4)
    for k in range(5):
        p = L.point_on(spine, 0.25 + 0.12 * k) + Vector((0, 0, 0.09))
        m.tube([p, p + Vector((0, 0.04, 0.09)), p + Vector((0, 0.08, 0.11))], [0.035, 0.015, 0.0], 5, GLASS, L.GLOW, cap_top=False)
    m.bake(ao_dist=0.15, ao_strength=0.5, wear=0.3, grime=0.3)
    ob = m.finish()
    leg = L.Model("salamander_leg", 53)
    leg.tube([Vector((0, 0, 0)), Vector((0.08, -0.02, -0.02)), Vector((0.12, -0.03, -0.1))], [0.035, 0.03, 0.025], 6, EMBER, L.BARK)
    for k in range(3):
        a = -0.6 + k * 0.6
        leg.tube([Vector((0.12, -0.03, -0.1)), Vector((0.12 + math.cos(a) * 0.05, -0.03 - math.sin(a) * 0.05, -0.11))], [0.012, 0.006], 4,
                 EMBER, L.BARK)
    leg.bake(ao_dist=0.05, ao_strength=0.3, ground=False)
    return [ob, leg.finish()]


def eye(m, at, r, toward=F):
    """A dark eye with a small cream glint, so critters look alive."""
    m.blob(at, r, INK, L.BARK, subdiv=1, rough=0.0, seed=3)
    m.blob(at + Vector(toward) * r * 0.7 + Vector((0, 0, r * 0.35)), r * 0.32, CREAM, L.BARK, subdiv=0, rough=0.0, seed=4)


def leg(m, top, foot, r0, r1, color, paw=None, paw_color=None):
    m.tube([top, top.lerp(foot, 0.5) + Vector((0, 0.01, 0)), foot], [r0, (r0 + r1) * 0.5, r1], 6, color, L.BARK, cap_bottom=False)
    if paw is not None:
        m.blob(foot + Vector((0, -paw * 0.4, -paw * 0.2)), paw, paw_color or color, L.BARK, subdiv=1, rough=0.0, seed=8,
               squash=(0.9, 1.4, 0.6))


def rabbit():
    """A wild rabbit: a pear of a body on big folded haunches, long hind feet,
    slim front legs, a proper head with cheeks and a pink nose, tall ears with
    pink insides, and a cream scut."""
    m = L.Model("rabbit", 54)
    fur = L.srgb("#A8977F")
    belly = L.srgb("#D9CDB6")
    pink = L.srgb("#E2A9A0")
    m.blob(Vector((0, 0.05, 0.17)), 0.15, fur, L.BARK, subdiv=2, rough=0.05, seed=1, squash=(0.82, 1.25, 0.95),
           color_fn=lambda d, p: L.mix(fur, belly, max(0.0, -d.z) * 0.8))
    for sx in (-1, 1):
        m.blob(Vector((sx * 0.085, 0.11, 0.13)), 0.09, fur, L.BARK, subdiv=2, rough=0.03, seed=2, squash=(0.6, 1.1, 1.0))
        m.blob(Vector((sx * 0.08, 0.06, 0.03)), 0.05, fur, L.BARK, subdiv=1, rough=0.0, seed=5, squash=(0.7, 2.0, 0.5),
               color_fn=lambda d, p: L.mix(fur, belly, 0.5))
        leg(m, Vector((sx * 0.055, -0.08, 0.14)), Vector((sx * 0.055, -0.11, 0.025)), 0.03, 0.022, fur, paw=0.026, paw_color=belly)
    # the head, a little forward and up, with cheeks and a snout
    hc = Vector((0, -0.15, 0.3))
    m.blob(hc, 0.1, fur, L.BARK, subdiv=2, rough=0.02, seed=3, squash=(0.9, 1.15, 0.92))
    for sx in (-1, 1):
        m.blob(hc + Vector((sx * 0.04, -0.07, -0.03)), 0.045, belly, L.BARK, subdiv=1, rough=0.0, seed=6)
        eye(m, hc + Vector((sx * 0.06, -0.05, 0.03)), 0.018, toward=Vector((sx * 0.4, -1, 0)).normalized())
        m.tube([hc + Vector((sx * 0.03, 0.02, 0.07)), hc + Vector((sx * 0.05, 0.05, 0.2)), hc + Vector((sx * 0.07, 0.1, 0.3))],
               [0.032, 0.036, 0.0], 7, fur, L.BARK, squash=(1.0, 0.42), cap_top=False,
               color_fn=lambda t, k: L.mix(fur, pink, 0.55) if k in (2, 3, 4) else fur)
    m.blob(hc + Vector((0, -0.11, -0.01)), 0.016, pink, L.BARK, subdiv=1, rough=0.0, seed=7)
    m.blob(Vector((0, 0.22, 0.2)), 0.05, CREAM, L.BARK, subdiv=1, rough=0.2, seed=4)
    m.bake(ao_dist=0.15, ao_strength=0.6, grime=0.3, paint=0.15, paint_scale=14.0)
    return m.finish()


def fox():
    """A red fox: a slim body with a cream chest, a narrow head with a pointed
    snout and a black nose, tall ears, four thin legs in black socks, and a big
    brush of a tail with a cream tip."""
    m = L.Model("fox", 55)
    rust = L.srgb("#C8642E")
    sock = L.srgb("#2A1A14")
    m.tube([Vector((0, 0.2, 0.24)), Vector((0, 0.05, 0.25)), Vector((0, -0.12, 0.27)), Vector((0, -0.2, 0.3))], [0.08, 0.1, 0.1, 0.085], 10,
           rust, L.BARK, squash=(0.85, 1.0), color_fn=lambda t, k: CREAM if (k in (6, 7, 8) and t > 0.4) else rust)
    for sx in (-1, 1):
        for fy, tilt in ((-0.15, -0.02), (0.16, 0.03)):
            top = Vector((sx * 0.05, fy, 0.22))
            foot = Vector((sx * 0.055, fy + tilt, 0.0))
            m.tube([top, top.lerp(foot, 0.5), foot], [0.03, 0.022, 0.018], 6, rust, L.BARK,
                   color_fn=lambda t, k: sock if t > 0.45 else rust)
            m.blob(foot + Vector((0, -0.012, 0.008)), 0.02, sock, L.BARK, subdiv=1, rough=0.0, seed=9, squash=(0.9, 1.4, 0.6))
    hc = Vector((0, -0.27, 0.34))
    m.blob(hc, 0.085, rust, L.BARK, subdiv=2, rough=0.0, seed=1, squash=(1.05, 1.1, 0.9),
           color_fn=lambda d, p: L.mix(rust, CREAM, max(0.0, -d.z - 0.2) * 1.2))
    m.tube([hc + Vector((0, -0.05, -0.02)), hc + Vector((0, -0.12, -0.035)), hc + Vector((0, -0.17, -0.045))], [0.05, 0.03, 0.0], 8, rust,
           L.BARK, cap_top=False, color_fn=lambda t, k: CREAM if k in (4, 5, 6) else rust)
    m.blob(hc + Vector((0, -0.17, -0.04)), 0.016, sock, L.BARK, subdiv=1, rough=0.0, seed=2)
    for sx in (-1, 1):
        eye(m, hc + Vector((sx * 0.045, -0.06, 0.02)), 0.015, toward=Vector((sx * 0.4, -1, 0)).normalized())
        m.tube([hc + Vector((sx * 0.045, 0.0, 0.05)), hc + Vector((sx * 0.06, 0.01, 0.15))], [0.04, 0.0], 5, rust, L.BARK, cap_top=False,
               squash=(1.0, 0.5), color_fn=lambda t, k: sock if t > 0.6 else rust)
    m.tube([Vector((0, 0.2, 0.25)), Vector((0.04, 0.34, 0.26)), Vector((0.09, 0.47, 0.32)), Vector((0.12, 0.56, 0.4)), Vector((0.13, 0.6, 0.46))],
           [0.05, 0.085, 0.085, 0.06, 0.0], 9, rust, L.BARK, cap_top=False, color_fn=lambda t, k: CREAM if t > 0.78 else rust)
    m.bake(ao_dist=0.15, ao_strength=0.6, grime=0.3, paint=0.15, paint_scale=14.0)
    return m.finish()


def hedgehog():
    """A hedgehog: a round body under a coat of spines, a long snout with a
    shiny nose, small round ears, bright eyes and four stubby legs."""
    m = L.Model("hedgehog", 56)
    spines = L.srgb("#5C4636")
    tips = L.srgb("#C9AE8A")
    face = L.srgb("#D9B48C")
    m.blob(Vector((0, 0.02, 0.13)), 0.155, spines, L.BARK, subdiv=2, rough=0.06, seed=1, squash=(1.0, 1.25, 0.8))
    for sx in (-1, 1):
        for fy in (-0.09, 0.1):
            m.tube([Vector((sx * 0.08, fy, 0.08)), Vector((sx * 0.09, fy - 0.01, 0.0))], [0.028, 0.022], 6, face, L.BARK)
            m.blob(Vector((sx * 0.09, fy - 0.02, 0.01)), 0.022, L.srgb("#3A2A22"), L.BARK, subdiv=1, rough=0.0, seed=9, squash=(1.0, 1.3, 0.5))
    hc = Vector((0, -0.15, 0.11))
    m.blob(hc, 0.08, face, L.BARK, subdiv=2, rough=0.0, seed=2, squash=(1.0, 1.25, 0.88))
    m.tube([hc + Vector((0, -0.05, -0.01)), hc + Vector((0, -0.12, -0.02))], [0.04, 0.016], 8, face, L.BARK)
    m.blob(hc + Vector((0, -0.13, -0.02)), 0.02, INK, L.BARK, subdiv=1, rough=0.0, seed=3)
    for sx in (-1, 1):
        eye(m, hc + Vector((sx * 0.045, -0.055, 0.03)), 0.014, toward=Vector((sx * 0.3, -1, 0)).normalized())
        m.blob(hc + Vector((sx * 0.06, 0.01, 0.065)), 0.022, face, L.BARK, subdiv=1, rough=0.0, seed=5, squash=(1.0, 0.6, 1.0))
    rng = m.rng
    for k in range(44):
        u = rng.uniform(0.0, 1.0)
        a = rng.uniform(-2.4, 2.4)
        d = Vector((math.sin(a) * 0.9, 0.3 + 0.7 * u, math.cos(a) * 0.9 + 0.1)).normalized()
        if d.z < -0.15:
            continue
        base = Vector((0, 0.04, 0.13)) + Vector((d.x * 0.14, d.y * 0.17, d.z * 0.11))
        tip = base + (d + Vector((0, 0.9, 0.2))).normalized() * rng.uniform(0.09, 0.13)
        m.tube([base, tip], [0.02, 0.0], 4, spines, L.BARK, cap_top=False, color_fn=lambda t, kk: L.mix(spines, tips, t))
    m.bake(ao_dist=0.12, ao_strength=0.6, grime=0.3, paint=0.12, paint_scale=14.0)
    return m.finish()


def main():
    L.reset()
    L.export([keeper_body(), keeper_hand(), keeper_foot(), keeper_lantern(), keeper_pole(), keeper_scarf_tail()], "keeper.glb")
    L.reset()
    L.export([tool_match(), tool_match(True), tool_lighter(), tool_tiki(), tool_flamer(), tool_dragon(), tool_meteor()], "tools.glb")
    L.reset()
    L.export([sprite()] + salamander() + [rabbit(), fox(), hedgehog()], "creatures.glb")


if __name__ == "__main__":
    main()
