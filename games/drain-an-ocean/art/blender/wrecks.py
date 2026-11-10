"""The three wrecks on the wreck shelf.
    python3 art/blender/wrecks.py [names...]

The Marigold, a galleon: a tumblehome hull with a high stern castle and
its gallery windows, a forecastle and beakhead, two rows of gun ports with
lids hanging, wales along her sides, a mast snapped off and another
leaning; she lies heeled over and broken open amidships, so her ribs and
her hold show. The SS Perpetua, a steamer: riveted plates, a raked funnel,
a bridge, cowl vents and portholes, broken in two with the plating torn at
the break. The Little Kittiwake, a trawler: on her side, wheelhouse,
gallows and a heap of net, stove in below the waterline. All stained,
weeded and barnacled to where the sand took them. Bows face Blender +Y.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from kit import (PAL, ao, apply_mods, barnacle_cluster, box, cyl, export, fill_col, from_profile, hash3, join, lathe,  # noqa: E402
                 lerp3, mat, mix, paint_mat, reset, ribbon, smooth, sphere, spline, strut, torus, tube, vnoise3,
                 weed_strands, wobble)
from mathutils import Vector  # noqa: E402


def section(t, beam, depth, sheer, tumble, flat=0.25, steps=10):
    """One side of a hull section (keel to gunwale) at t along the hull:
    returns points from the keel up the side (x >= 0)."""
    pts = []
    for k in range(steps + 1):
        u = k / steps                     # 0 keel .. 1 gunwale
        z = -depth + (depth + sheer) * u
        # the side swells to full beam just above the waterline then comes in (tumblehome)
        w = beam * math.sin(min(1.0, u * 1.35) * math.pi / 2) ** (0.8 + flat)
        if u > 0.74:
            w *= 1.0 - tumble * ((u - 0.74) / 0.26) ** 1.5
        pts.append(Vector((w, 0, z)))
    return pts


def hull(L, prof, hole=None, thick=0.14, m=None, name="hull", steps=10):
    """A hull lofted along Y from stern (t=0) to bow (t=1). prof: list of
    (t, (half_beam, keel_depth, sheer_height, tumblehome)). hole: (side,
    y_centre, z_centre, half_len, half_h): faces there are left out, a
    ragged break."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rows = []
    n = 34
    for i in range(n + 1):
        t = i / n
        beam, depth, sheer, tumble = spline(prof, t)
        y = -L / 2 + t * L
        sec = section(t, max(beam, 0.02), depth, sheer, tumble, steps=steps)
        right = [Vector((p.x, y, p.z)) for p in sec]
        left = [Vector((-p.x, y, p.z)) for p in reversed(sec)]
        rows.append([bm.verts.new(p) for p in left[:-1] + right])
    rnd = random.Random(5)
    for i in range(n):
        a, b = rows[i], rows[i + 1]
        for k in range(len(a) - 1):
            if hole:
                c = (a[k].co + b[k + 1].co) * 0.5
                side, yc, zc, hl, hh = hole
                if (c.x * side) > 0.05:
                    edge = 1.0 + 0.35 * math.sin(c.y * 3.1 + c.z * 2.3) + 0.2 * rnd.uniform(-1, 1)
                    if ((c.y - yc) / hl) ** 2 + ((c.z - zc) / hh) ** 2 < edge:
                        continue
            bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
    # transom at the stern
    bm.faces.new(list(reversed(rows[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if m:
        o.data.materials.append(m)
    sol = o.modifiers.new("s", "SOLIDIFY")
    sol.thickness = thick
    sol.offset = -1.0
    apply_mods(o)
    return o


def ribs(L, prof, y_list, m, inset=0.22, r=0.11, steps=10):
    out = []
    for y in y_list:
        t = (y + L / 2) / L
        beam, depth, sheer, tumble = spline(prof, t)
        sec = section(t, beam - inset, depth - inset * 0.6, sheer - 0.05, tumble, steps=steps)
        pts = [Vector((-p.x, y, p.z)) for p in reversed(sec)] + [Vector((p.x, y, p.z)) for p in sec[1:]]
        out.append(tube(pts, [r] * len(pts), m, sides=5))
    return out


def sea_stain(o, line, seed, burial=-0.6):
    """Everything is stained by the sea; weed is thickest along `line`, the
    lower hull crusted with barnacles above where the sand took it."""
    def fn(co, n, mn):
        if mn in ("weed", "barnacle", "lantern_glass"):
            return (1, 1, 1)
        v = vnoise3(co.x * 1.4, co.y * 1.4, co.z * 1.4)
        c = lerp3((1, 1, 1), mix("kelp_light", "ink", 0.15), 0.38 + 0.25 * v)
        if abs(co.z - line) < 0.35:
            c = lerp3(c, mix("kelp", "ink", 0.3), 0.55)
        if co.z < line - 0.35 and hash3(math.floor(co.x * 5), math.floor(co.y * 5), math.floor(co.z * 5)) > 0.82:
            c = lerp3(c, mix("paper", "sand", 0.3), 0.6)
        if co.z < burial + 0.4:
            c = lerp3(c, mix("sand", "ink", 0.3), 0.45)      # silt where she's sunk in
        streak = 0.5 + 0.5 * math.sin(co.x * 7.0 + co.y * 2.0)
        if co.z > line:
            c = lerp3(c, mix("rust", "sand", 0.3), 0.12 * streak)
        return c
    paint_mat(o, fn)


def finish(o, seed, dist=1.6):
    wobble(o, 0.03, seed)
    smooth(o, 35)
    ao(o, dist, rays=10, strength=0.62, seed=seed, edge=0.6, top=0.1)


def wreck_galleon():
    reset()
    L = 16.0
    tar = mat("hulltar", mix("wood_dark", "ink", 0.25), rough=0.85)
    ochre = mat("ochre", mix("sand", "rust", 0.45), rough=0.85)
    deckw = mat("deck", mix("wood_grey", "sand", 0.15), rough=0.9)
    rib_m = mat("rib", mix("wood_grey", "rust", 0.25), rough=0.9)
    iron = mat("iron", metal=0.45, rough=0.6)
    prof = [(0.0, (1.9, 1.6, 4.4, 0.24)), (0.1, (2.5, 2.4, 3.5, 0.24)), (0.35, (2.8, 2.7, 2.4, 0.22)), (0.6, (2.75, 2.7, 2.2, 0.2)),
            (0.85, (2.2, 2.4, 2.8, 0.18)), (0.96, (1.0, 1.8, 3.2, 0.1)), (1.0, (0.12, 1.2, 3.4, 0.0))]
    parts = [hull(L, prof, hole=(1, -0.4, 0.2, 2.6, 1.6), m=tar, name="hull")]
    parts += ribs(L, prof, [-2.8 + k * 0.62 for k in range(10)], rib_m)
    # the hold: barrels tumbled about inside the break
    rnd = random.Random(3)
    for k in range(7):
        bpos = Vector((rnd.uniform(-0.8, 1.6), rnd.uniform(-2.6, 1.6), rnd.uniform(-1.4, -0.6)))
        b = lathe([(0.0, -0.45), (0.34, -0.45), (0.42, 0.0), (0.34, 0.45), (0.0, 0.45)], 10, "barrel", mat("barrel", mix("wood", "rust", 0.2), rough=0.9))
        b.rotation_euler = (rnd.uniform(0, 1.5), rnd.uniform(0, 1.5), 0)
        b.location = bpos
        parts.append(b)
    # decks: the gun deck, the stern castle's decks, the forecastle
    parts.append(box((4.4, 9.5, 0.14), (0, 0.6, 2.05), deckw))
    parts.append(box((4.6, 3.2, 2.2), (0, -6.2, 3.3), tar, bevel=0.06))
    parts.append(box((4.3, 2.0, 1.3), (0, -6.6, 5.0), tar, bevel=0.05))
    parts.append(box((4.0, 2.4, 1.0), (0, 5.8, 2.7), tar, bevel=0.05))
    # stern gallery: a row of windows across the transom, a carved board, a lantern
    for k in range(5):
        x = -1.6 + k * 0.8
        parts.append(box((0.55, 0.12, 0.7), (x, -7.85, 3.6), mat("gallery_glass", mix("ink", "teal", 0.3), rough=0.2)))
        parts.append(box((0.68, 0.16, 0.08), (x, -7.88, 3.98), ochre))
    parts.append(box((4.2, 0.2, 0.3), (0, -7.92, 4.3), ochre, bevel=0.03))
    parts.append(box((4.4, 0.6, 0.2), (0, -8.0, 2.9), deckw))
    parts.append(lathe([(0.0, 0.0), (0.22, 0.05), (0.26, 0.5), (0.14, 0.75), (0.0, 0.85)], 8, "lantern", mat("lantern_glass", mix("paint_yellow", "paper", 0.3), emit=0.6, rough=0.3), loc=(0, -7.9, 5.7)))
    # wales and the ochre band at the gun deck
    for z, mm in ((0.9, tar), (1.9, ochre), (2.9, tar)):
        for sx in (-1, 1):
            pts = []
            for k in range(13):
                t = 0.06 + k * 0.07
                beam, depth, sheer, tumble = spline(prof, t)
                u = (z + depth) / (depth + sheer)
                w = beam * math.sin(min(1.0, u * 1.35) * math.pi / 2) ** 1.05
                if u > 0.74:
                    w *= 1.0 - tumble * ((u - 0.74) / 0.26) ** 1.5
                y = -L / 2 + t * L
                if sx > 0 and -3.2 < y < 2.4 and -1.6 < z < 2.2:
                    continue
                pts.append(Vector((sx * (w + 0.06), y, z)))
            if len(pts) > 2:
                parts.append(tube(pts, [0.12] * len(pts), mm, sides=6, flat=0.6))
    # gun ports with lids, a couple of cannons run out
    for (z, ys) in ((1.25, (-4.5, -3.0, 3.0, 4.4)), (2.5, (-5.0, -3.4, -1.8, -0.2, 1.4, 3.0))):
        for sx in (-1, 1):
            for y in ys:
                if sx > 0 and -3.2 < y < 2.4 and z < 2.2:
                    continue
                t = (y + L / 2) / L
                beam, depth, sheer, tumble = spline(prof, t)
                u = (z + depth) / (depth + sheer)
                w = beam * math.sin(min(1.0, u * 1.35) * math.pi / 2) ** 1.05
                if u > 0.74:
                    w *= 1.0 - tumble * ((u - 0.74) / 0.26) ** 1.5
                parts.append(box((0.12, 0.55, 0.5), (sx * (w + 0.02), y, z), mat("port", mix("coral", "rust", 0.5), rough=0.8)))
                lid = box((0.08, 0.6, 0.55), (sx * (w + 0.12), y, z + 0.38), tar)
                lid.rotation_euler = (0, sx * math.radians(rnd.uniform(40, 110)), 0)
                parts.append(lid)
                if rnd.random() < 0.3:
                    parts.append(cyl(0.12, 1.0, (sx * (w + 0.4), y, z), iron, rot=(0, math.pi / 2, 0), verts=8, r2=0.1))
    # beakhead and a broken bowsprit
    parts.append(box((0.9, 2.0, 0.5), (0, 8.4, 2.2), tar, rot=(math.radians(18), 0, 0), bevel=0.05))
    parts.append(tube([Vector((0, 7.6, 2.8)), Vector((0, 9.6, 3.9)), Vector((0.1, 10.8, 4.5))], [0.22, 0.18, 0.12], deckw, sides=7))
    # masts: the main snapped jagged, the fore leaning, the mizzen with a fallen yard
    def mast(base, height, lean, r0):
        top = base + Vector((lean[0], lean[1], height))
        m_ = tube([base, base.lerp(top, 0.5), top], [r0, r0 * 0.9, r0 * 0.8], deckw, sides=8)
        return m_, top
    mm, top = mast(Vector((0, 0.2, 2.0)), 4.6, (0.2, -0.1, 0), 0.32)
    parts.append(mm)
    for k in range(5):
        a = k * math.tau / 5
        parts.append(cyl(0.08, rnd.uniform(0.3, 0.7), top + Vector((math.cos(a) * 0.18, math.sin(a) * 0.18, 0.2)), deckw, verts=4, r2=0.01))
    mf, topf = mast(Vector((0, 4.6, 2.6)), 7.0, (-0.5, 1.6, 0), 0.26)
    parts.append(mf)
    parts.append(tube([topf - Vector((1.8, 0.2, 1.2)), topf - Vector((-1.6, -0.2, 0.9))], [0.1, 0.1], deckw, sides=6))
    mz, topz = mast(Vector((0, -5.6, 5.6)), 4.2, (0.1, -0.3, 0), 0.2)
    parts.append(mz)
    parts.append(tube([topz - Vector((0, 0, 0.6)), Vector((2.6, -5.2, 2.4))], [0.08, 0.08], deckw, sides=6))
    for sx in (-1, 1):
        for k in range(3):
            parts.append(strut(top - Vector((0, 0, 0.6)), Vector((sx * 2.5, -0.6 + k * 0.6, 2.3)), 0.025, mat("rope", rough=0.9), sides=4))
    # the rudder
    parts.append(box((0.3, 1.0, 3.6), (0, -8.4, 0.4), tar, bevel=0.04))
    o = join(parts, "Galleon")
    o.rotation_euler = (0, math.radians(20), 0)
    o.location = (0, 0, -0.9)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)
    finish(o, 31)
    sea_stain(o, 0.6, 31, burial=-2.2)
    weedm = mat("weed", mix("kelp", "ink", 0.2), rough=0.7)
    anchors = [Vector((2.7, y, 2.6)) for y in (-5.0, -2.0, 1.0, 3.8)] + [top - Vector((0, 0, 0.5)), topf - Vector((0, 0, 1.0)), Vector((0, 9.6, 3.9))]
    strands = weed_strands(anchors, length=1.6, seed=32, width=0.12, m=weedm)
    bar = mat("barnacle", mix("paper", "sand", 0.35), rough=0.75)
    clusters = []
    for p in ((2.6, -4.0, -0.4), (2.4, 4.0, -0.2), (-2.4, 0.0, 0.5), (1.5, 7.0, 0.0)):
        clusters += barnacle_cluster(o, 14, p, 0.8, seed=int(p[1] * 7 + 50), size=0.09, m=bar)
    o = join([o] + strands + clusters, "Galleon")
    fill_col(o, ("weed", "barnacle"))
    export([o], "wreck_galleon")


def wreck_steamer():
    reset()
    plate = mat("hullsteel", mix("ink", "rust", 0.35), rough=0.7, metal=0.25)
    red = mat("boot", mix("coral", "rust", 0.5), rough=0.75, metal=0.2)
    white_m = mat("whitepaint", mix("paint_white", "sand", 0.2), rough=0.8)
    funnel_m = mat("funnel", mix("paint_yellow", "rust", 0.25), rough=0.7)
    iron = mat("iron", metal=0.45, rough=0.6)
    glass = mat("port_glass", mix("ink", "teal", 0.35), rough=0.15)
    brass = mat("brass", metal=0.7, rough=0.35)
    bow_prof = [(0.0, (2.3, 2.6, 1.8, 0.0)), (0.6, (2.3, 2.6, 1.9, 0.0)), (0.88, (1.6, 2.4, 2.2, 0.0)), (1.0, (0.1, 2.2, 2.5, 0.0))]
    st_prof = [(0.0, (1.4, 1.8, 2.0, 0.0)), (0.15, (2.1, 2.4, 1.9, 0.0)), (1.0, (2.3, 2.6, 1.8, 0.0))]
    bow = hull(11.0, bow_prof, m=plate, name="bow", thick=0.1)
    stern = hull(9.0, st_prof, m=plate, name="stern", thick=0.1)
    # torn plating at the breaks: ragged ends
    for (o, end, sign) in ((bow, -5.5, 1), (stern, 4.5, -1)):
        for v in o.data.vertices:
            if abs(v.co.y - end) < 0.6:
                v.co.y += sign * (0.25 + 0.45 * math.sin(v.co.z * 4.3 + v.co.x * 2.1) ** 2)
    bow.location = (0, 6.0, 0)
    stern.location = (0.5, -5.2, -0.3)
    stern.rotation_euler = (0, math.radians(-24), math.radians(9))
    parts = [bow, stern]
    parts += [r for r in ribs(11.0, bow_prof, [-5.0, -4.4, -3.8], mat("frame", mix("rust", "ink", 0.3), rough=0.8), inset=0.12, r=0.09)]
    for r in parts[-3:]:
        r.location.y += 6.0
    # bow fittings: deck, a cowl vent, the anchor hawse
    parts.append(box((4.0, 9.0, 0.12), (0, 6.6, 1.82), mat("deck", mix("wood_grey", "sand", 0.15), rough=0.9)))
    cowl = [Vector((1.2, 6.0, 1.9)), Vector((1.2, 6.0, 3.0)), Vector((1.2, 6.25, 3.45)), Vector((1.2, 6.65, 3.5))]
    parts.append(tube(cowl, [0.22, 0.22, 0.26, 0.34], white_m, sides=10))
    parts.append(torus(0.25, 0.07, (1.4, 11.0, 1.2), iron, rot=(0, math.pi / 2, 0), maj=10, mi=4))
    # the bridge house and the funnel on the stern half, broken off and rolled with it
    sup = []
    sup.append(box((3.2, 3.2, 2.0), (0, -2.6, 2.9), white_m, bevel=0.06))
    for x in (-1.0, -0.33, 0.33, 1.0):
        sup.append(box((0.45, 0.1, 0.55), (x, -0.98, 3.3), glass))
    sup.append(box((3.6, 3.5, 0.15), (0, -2.6, 3.95), white_m, bevel=0.03))
    fun = lathe([(0.0, 0.0), (0.75, 0.0), (0.75, 3.6), (0.8, 3.65), (0.8, 3.9), (0.0, 3.9)], 16, "funnel", funnel_m)
    fun.rotation_euler = (math.radians(-10), 0, 0)
    fun.location = (0, -5.0, 3.0)
    sup.append(fun)
    sup.append(torus(0.78, 0.09, (0, -5.0 - 0.55, 3.0 + 3.1), mat("funnelband", mix("ink", "rust", 0.2), rough=0.7), rot=(math.radians(-10), 0, 0), maj=16, mi=4))
    sup.append(cyl(0.1, 5.0, (0, -7.4, 4.0), iron, verts=8))
    for s_ in sup:
        s_.location = Vector(s_.location)
    st_group = join(sup, "sup")
    st_group.parent = None
    st_group.location = (0.5, 0.0, -0.3)
    st_group.rotation_euler = (0, math.radians(-24), math.radians(9))
    parts.append(st_group)
    # portholes down both halves
    for (o_loc, ys, rot) in (((0, 6.0, 0), (-3.0, -1.5, 0.0, 1.5, 3.0), None),):
        for y in ys:
            for sx in (-1, 1):
                parts.append(torus(0.17, 0.05, (sx * 2.32, y + 6.0, 0.9), brass, rot=(0, math.pi / 2, 0), maj=10, mi=4))
                parts.append(cyl(0.15, 0.06, (sx * 2.3, y + 6.0, 0.9), glass, rot=(0, math.pi / 2, 0), verts=10))
    o = join(parts, "Steamer")
    o.rotation_euler = (0, math.radians(-8), 0)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)
    finish(o, 37)

    def plates(co, n, mn):
        if mn not in ("hullsteel", "boot"):
            return (1, 1, 1)
        c = (1, 1, 1)
        if co.z < -0.8:
            c = lerp3((1, 1, 1), (1.6, 0.85, 0.65), 0.55)          # red below the waterline
        if (co.z * 1.6) % 1.0 < 0.06 or (co.y * 0.5) % 1.0 < 0.03:
            c = lerp3(c, (0.6, 0.55, 0.5), 0.5)                      # plate seams
        streak = max(0.0, math.sin(co.y * 2.7 + co.x) - 0.6) * 2.5
        return lerp3(c, mix("rust", "sand", 0.25), 0.4 * streak)
    paint_mat(o, plates)
    sea_stain(o, 0.4, 37, burial=-2.0)
    weedm = mat("weed", mix("kelp", "ink", 0.2), rough=0.7)
    anchors = [Vector((2.3, y, 1.7)) for y in (2.0, 5.0, 8.0)] + [Vector((1.2, 6.6, 3.4)), Vector((0.0, 0.5, -0.5))]
    strands = weed_strands(anchors, length=1.4, seed=38, width=0.12, m=weedm)
    o = join([o] + strands, "Steamer")
    fill_col(o, ("weed",))
    export([o], "wreck_steamer")


def wreck_trawler():
    reset()
    L = 9.0
    paint_t = mat("trawlerpaint", mix("teal", "shoal", 0.45), rough=0.75)
    white_m = mat("whitepaint", mix("paint_white", "sand", 0.2), rough=0.8)
    red = mat("boot", mix("coral", "rust", 0.45), rough=0.75)
    deckw = mat("deck", mix("wood_grey", "sand", 0.15), rough=0.9)
    iron = mat("iron", metal=0.45, rough=0.6)
    prof = [(0.0, (1.3, 1.5, 1.2, 0.05)), (0.15, (1.6, 1.8, 1.0, 0.05)), (0.6, (1.7, 1.9, 1.0, 0.05)), (0.9, (1.0, 1.7, 1.4, 0.0)), (1.0, (0.08, 1.4, 1.6, 0.0))]
    parts = [hull(L, prof, hole=(1, 1.0, -0.6, 1.3, 0.8), m=paint_t, name="hull", thick=0.12)]
    parts += ribs(L, prof, [0.0, 0.5, 1.0, 1.5, 2.0], mat("rib", mix("wood_grey", "rust", 0.25), rough=0.9), inset=0.14, r=0.08)
    parts.append(box((3.0, 7.2, 0.1), (0, 0.2, 0.95), deckw))
    # wheelhouse with windows, a roof and a stove pipe
    wh = box((2.0, 1.8, 1.8), (0, -1.8, 1.9), white_m, bevel=0.05)
    parts.append(wh)
    for x in (-0.5, 0.5):
        parts.append(box((0.6, 0.06, 0.55), (x, -0.88, 2.35), mat("wh_glass", mix("ink", "teal", 0.35), rough=0.15)))
    parts.append(box((2.3, 2.1, 0.12), (0, -1.8, 2.86), mat("roofred", mix("roof_red", "rust", 0.2), rough=0.75), bevel=0.03))
    parts.append(cyl(0.08, 0.8, (0.6, -2.3, 3.2), iron, verts=8))
    # mast and the gallows frames
    parts.append(cyl(0.12, 4.2, (0, 1.6, 3.0), deckw, verts=8))
    for y in (-3.2, 2.6):
        for sx in (-1, 1):
            parts.append(tube([Vector((sx * 1.5, y, 0.95)), Vector((sx * 1.6, y, 2.4)), Vector((sx * 1.2, y + 0.3, 2.7))], [0.07, 0.07, 0.07], iron, sides=6))
    # a heap of net with floats, spilling over the side
    net = sphere(1.0, (0.3, 2.4, 1.3), mat("net", mix("rope", "kelp", 0.3), rough=0.95), scale=(1.1, 1.4, 0.5), segs=14, rings=8)
    for v in net.data.vertices:
        v.co.z += math.sin(v.co.x * 9) * math.sin(v.co.y * 7) * 0.08
    parts.append(net)
    for k in range(6):
        parts.append(sphere(0.17, (-0.6 + k * 0.38, 3.3 + 0.1 * math.sin(k), 1.45), mat("float", mix("paint_yellow", "coral", 0.3), rough=0.5), segs=8, rings=6))
    o = join(parts, "Trawler")
    o.rotation_euler = (0, math.radians(-34), 0)
    o.location = (0, 0, -0.4)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)
    finish(o, 41, dist=1.0)

    def hullpaint(co, n, mn):
        if mn != "trawlerpaint":
            return (1, 1, 1)
        if co.z < -0.4 - co.x * 0.5:
            return (1.5, 0.75, 0.6)
        if abs(co.z - (0.75 - co.x * 0.6)) < 0.12:
            return (1.5, 1.45, 1.35)        # the white sheer strake
        return (1, 1, 1)
    paint_mat(o, hullpaint)
    sea_stain(o, 0.2, 41, burial=-1.6)
    weedm = mat("weed", mix("kelp", "ink", 0.2), rough=0.7)
    strands = weed_strands([Vector((1.0, y, 1.0)) for y in (-3.0, -1.0, 1.2, 3.0)] + [Vector((0.2, 1.6, 4.4))], length=1.0, seed=42, width=0.1, m=weedm)
    o = join([o] + strands, "Trawler")
    fill_col(o, ("weed",))
    export([o], "wreck_trawler")


ALL = {f.__name__: f for f in [wreck_galleon, wreck_steamer, wreck_trawler]}

if __name__ == "__main__":
    names = sys.argv[1:] or list(ALL)
    for nm in names:
        ALL[nm]()
