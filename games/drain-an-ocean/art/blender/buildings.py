"""Buildings and hard landmarks: the town's cottages, the drowned town (its
houses, chapel, clock tower and gate arch), the sea wall (the bay's hero
landmark), the river weir, the lighthouse and the bay's stones.
    python3 art/blender/buildings.py [names...]

Built like a model maker's buildings, not boxes with a pyramid on: walls
have thickness and real window openings (cut, with stone sills, lintels and
painted frames, the panes set back), roofs overhang at the eaves with
bargeboards and a ridge that sags in the middle, chimneys have caps and
pots, corners have quoins. The drowned town has lost slates and panes, has
weed hanging off every ledge, barnacles round its feet and the whole of it
stained by the sea. Fronts face Blender +Y (Godot -Z after export). The sea
wall is built in world coordinates from data/bay.json so it sits exactly on
its footing in the heightmap.
"""
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from kit import (PAL, ao, apply_mods, barnacle_cluster, box, cyl, export, fill_col, from_profile, hash3, join, lathe, lerp3,  # noqa: E402
                 mat, mix, paint, paint_mat, reset, ribbon, smooth, sphere, strut, tide_mark, torus, tube, vnoise3,
                 weed_strands, white, wobble)
from mathutils import Vector  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
BAY = os.path.normpath(os.path.join(HERE, "..", "..", "data", "bay.json"))


# --- Construction helpers --------------------------------------------------------------------
def cut(o, cutters):
    """Boolean-subtracts each cutter from o (real openings with depth)."""
    for c in cutters:
        mod = o.modifiers.new("cut", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.object = c
        apply_mods(o)
        bpy.data.objects.remove(c, do_unlink=True)
    return o


def slab(corners, thick, nu=6, nv=6, m=None, name="slab", sag=0.0, sag_axis=0):
    """A subdivided four-cornered panel (roof planes, decks) with thickness;
    `sag` pulls the middle of one edge-direction down (a tired ridge)."""
    c = [Vector(p) for p in corners]
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    n = (c[1] - c[0]).cross(c[3] - c[0]).normalized()
    grid_t = []
    grid_b = []
    for j in range(nv + 1):
        v = j / nv
        rt, rb = [], []
        for i in range(nu + 1):
            u = i / nu
            p = c[0].lerp(c[1], u).lerp(c[3].lerp(c[2], u), v)
            k = u if sag_axis == 0 else v
            p = p - Vector((0, 0, sag * math.sin(k * math.pi)))
            rt.append(bm.verts.new(p + n * thick * 0.5))
            rb.append(bm.verts.new(p - n * thick * 0.5))
        grid_t.append(rt)
        grid_b.append(rb)
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((grid_t[j][i], grid_t[j][i + 1], grid_t[j + 1][i + 1], grid_t[j + 1][i]))
            bm.faces.new((grid_b[j][i], grid_b[j + 1][i], grid_b[j + 1][i + 1], grid_b[j][i + 1]))
    for i in range(nu):
        for (j, a, b) in ((0, 0, 0), (nv, 0, 0)):
            bm.faces.new((grid_t[j][i], grid_b[j][i], grid_b[j][i + 1], grid_t[j][i + 1]))
    for j in range(nv):
        for i in (0, nu):
            bm.faces.new((grid_t[j][i], grid_t[j + 1][i], grid_b[j + 1][i], grid_b[j][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    if m:
        o.data.materials.append(m)
    return o


def gable_roof(w, d, eave_z, ridge_z, over=0.45, thick=0.16, m=None, sag=0.12, missing=None, seed=1):
    """Two roof planes over a w x d footprint (ridge along Y), overhanging
    the walls by `over`, the ridge sagging; bargeboards and ridge tiles.
    missing: (side, y0, y1) leaves a hole where slates have gone."""
    hw = w / 2 + over
    hd = d / 2 + over * 0.6
    drop = (ridge_z - eave_z) * over / (w / 2)
    ez = eave_z - drop
    parts = []
    for sx in (-1, 1):
        corners = [(sx * hw, -hd, ez), (0, -hd, ridge_z), (0, hd, ridge_z), (sx * hw, hd, ez)]
        if sx > 0:
            corners = [corners[1], corners[0], corners[3], corners[2]]
        p = slab(corners, thick, nu=4, nv=10, m=m, name="roof", sag=sag, sag_axis=1)
        if missing and missing[0] == sx:
            bm = bmesh.new()
            bm.from_mesh(p.data)
            kill = [f for f in bm.faces if missing[1] < f.calc_center_median().y < missing[2]
                    and abs(f.calc_center_median().x) < hw * 0.7]
            bmesh.ops.delete(bm, geom=kill, context="FACES")
            bm.to_mesh(p.data)
            bm.free()
        parts.append(p)
    trim = mat("barge", mix("paint_white", "wood_grey", 0.3), rough=0.8)
    for sy in (-1, 1):
        for sx in (-1, 1):
            parts.append(strut((sx * hw, sy * (hd + 0.03), ez - 0.06), (0, sy * (hd + 0.03), ridge_z + 0.02), 0.09, trim))
    ridge = []
    for k in range(11):
        y = -hd + 2 * hd * k / 10
        ridge.append(Vector((0, y, ridge_z + thick * 0.4 - sag * math.sin(k / 10 * math.pi))))
    parts.append(tube(ridge, [0.12] * len(ridge), mat("ridge", mix("roof_red", "rust", 0.3), rough=0.7), sides=6, flat=0.7))
    return parts


def window(x, y, z, w, h, depth, frame_m, wall_dir="y", arched=False, pane="glass_dark"):
    """Returns (cutter, parts): an opening to cut and its sill, lintel, frame
    and a recessed pane with glazing bars."""
    parts = []
    if wall_dir == "y":
        cutter = box((w, depth * 3, h), (x, y, z))
        sx, sy = 1, 0
        out = Vector((0, 1 if y > 0 else -1, 0))
    else:
        cutter = box((depth * 3, w, h), (x, y, z))
        sx, sy = 0, 1
        out = Vector((1 if x > 0 else -1, 0, 0))
    c = Vector((x, y, z))
    stone = mat("dress", mix("stone_pale", "paper", 0.2), rough=0.85)
    along = Vector((sx, sy, 0))
    # sill and lintel stones
    parts.append(box((w + 0.3 if sx else 0.22, 0.22 if sx else w + 0.3, 0.12), c + out * 0.06 + Vector((0, 0, -h / 2 - 0.06)), stone, bevel=0.02))
    if not arched:
        parts.append(box((w + 0.24 if sx else 0.18, 0.18 if sx else w + 0.24, 0.16), c + out * 0.02 + Vector((0, 0, h / 2 + 0.08)), stone, bevel=0.02))
    # the pane set back in the opening, with a frame and glazing bars
    pane_c = c - out * depth * 0.35
    pm = mat(pane, mix("ink", "teal", 0.35), rough=0.15)
    parts.append(box((w if sx else 0.04, 0.04 if sx else w, h), pane_c, pm))
    fw = 0.06
    for k in (-1, 1):
        parts.append(box((fw if sx else 0.07, 0.07 if sx else fw, h), pane_c + along * k * (w / 2 - fw / 2) + out * 0.03, frame_m))
        parts.append(box((w if sx else 0.07, 0.07 if sx else w, fw), pane_c + Vector((0, 0, k * (h / 2 - fw / 2))) + out * 0.03, frame_m))
    parts.append(box((0.04 if sx else 0.06, 0.06 if sx else 0.04, h), pane_c + out * 0.035, frame_m))
    parts.append(box((w if sx else 0.06, 0.06 if sx else w, 0.04), pane_c + out * 0.035 + Vector((0, 0, h * 0.08)), frame_m))
    return cutter, parts


def quoins(w, d, h, m, size=0.32, gap=0.0):
    """Alternating dressed stones up each corner."""
    parts = []
    z = size / 2
    k = 0
    while z < h - size * 0.3:
        for (cx, cy) in ((w / 2, d / 2), (-w / 2, d / 2), (w / 2, -d / 2), (-w / 2, -d / 2)):
            long_x = (k % 2 == 0)
            parts.append(box((size * (1.6 if long_x else 0.9), size * (0.9 if long_x else 1.6), size * 0.86),
                             (cx - math.copysign(size * (0.8 if long_x else 0.45), cx) + math.copysign(0.03, cx),
                              cy - math.copysign(size * (0.45 if long_x else 0.8), cy) + math.copysign(0.03, cy), z), m, bevel=0.025))
        z += size
        k += 1
    return parts


def chimney(x, y, z0, h, m, pots=2):
    parts = [box((0.7, 0.6, h), (x, y, z0 + h / 2), m, bevel=0.03)]
    parts.append(box((0.86, 0.76, 0.12), (x, y, z0 + h + 0.06), mat("dress"), bevel=0.02))
    for k in range(pots):
        parts.append(cyl(0.11, 0.42, (x - 0.15 + 0.3 * k, y, z0 + h + 0.32), mat("pot", mix("roof_red", "sand", 0.25), rough=0.7), verts=10, r2=0.09))
    return parts


def door(x, y, z0, w, h, m_door, wall_out=1):
    parts = []
    cutter = box((w, 1.2, h), (x, y, z0 + h / 2))
    stone = mat("dress")
    parts.append(box((w + 0.36, 0.2, 0.18), (x, y + wall_out * 0.04, z0 + h + 0.09), stone, bevel=0.02))
    parts.append(box((w + 0.5, 0.5, 0.14), (x, y + wall_out * 0.22, z0 + 0.07), stone, bevel=0.02))
    slab_ = box((w * 0.96, 0.08, h * 0.98), (x, y - wall_out * 0.12, z0 + h / 2), m_door, bevel=0.01)
    parts.append(slab_)
    parts.append(sphere(0.045, (x + w * 0.3, y - wall_out * 0.06, z0 + h * 0.5), mat("brass", metal=0.7, rough=0.3), segs=8, rings=6))
    return cutter, parts


def finish(o, seed, wob=0.012, dist=1.0, strength=0.6, angle=32):
    wobble(o, wob, seed)
    smooth(o, angle)
    ao(o, dist, rays=10, strength=strength, seed=seed, edge=0.6, top=0.1)
    return o


def courses(o, every=0.36, dark=0.88, stagger=0.9):
    """Paints stone courses: a faint line every `every` m of height with
    staggered joints between, and a little variation stone to stone."""
    def fn(co, n, mn):
        if mn not in ("stone", "stone_pale", "wallstone", "seawall", "towerstone"):
            return (1, 1, 1)
        row = math.floor(co.z / every)
        fz = (co.z / every) % 1.0
        along = co.x if abs(n.y) > abs(n.x) else co.y
        col = math.floor(along / stagger + row * 0.5)
        fa = (along / stagger + row * 0.5) % 1.0
        v = 0.94 + 0.08 * hash3(row, col, 3)
        if fz < 0.07 or fa < 0.035:
            v *= dark
        return (v, v * 0.995, v * 0.985)
    paint_mat(o, fn)


def roof_courses(o, every=0.3):
    def fn(co, n, mn):
        if mn not in ("slate", "roof_red", "roof_tile"):
            return (1, 1, 1)
        row = math.floor((co.z * 1.4 + abs(co.x) * 0.9) / every)
        v = 0.9 + 0.12 * hash3(row, math.floor(co.y / 0.35 + row * 0.5), 5)
        if ((co.z * 1.4 + abs(co.x) * 0.9) / every) % 1.0 < 0.12:
            v *= 0.8
        return (v, v, v)
    paint_mat(o, fn)


# --- The town's cottages (on the shore, lived in) -----------------------------------------------
def cottage(name, wallc, roofc, doorc, w, d, h, seed, porch=False, dormer=False, roof_kind="slate"):
    reset()
    rnd = random.Random(seed)
    wm = mat("render", PAL[wallc] if isinstance(wallc, str) else wallc, rough=0.9)
    shell = box((w, d, h), (0, 0, h / 2), wm, bevel=0.04, name="walls")
    inner = box((w - 0.5, d - 0.5, h - 0.2), (0, 0, h / 2 + 0.1))
    frame_m = mat("frame", mix("paint_white", "paper", 0.4), rough=0.7)
    cutters = [inner]
    parts = []
    dc, dp = door(w * 0.18 * (1 if seed % 2 else -1), d / 2, 0.0, 0.95, 1.95, mat("doorpaint", PAL[doorc], rough=0.65))
    cutters.append(dc)
    parts += dp
    for x in ((-w * 0.3, w * 0.33) if seed % 2 else (-w * 0.32, w * 0.3)):
        if abs(x - w * 0.18 * (1 if seed % 2 else -1)) < 0.9:
            continue
        c, wp = window(x, d / 2, 1.35, 0.85, 1.0, 0.25, frame_m)
        cutters.append(c)
        parts += wp
    for x in (-w * 0.25, w * 0.25):
        c, wp = window(x, d / 2, h - 0.75, 0.75, 0.85, 0.25, frame_m)
        cutters.append(c)
        parts += wp
    c, wp = window(w / 2, -0.2, 1.4, 0.7, 0.9, 0.25, frame_m, wall_dir="x")
    cutters.append(c)
    parts += wp
    cut(shell, cutters)
    parts.append(shell)
    parts += quoins(w, d, h, mat("dress"), size=0.3)
    parts.append(box((w + 0.12, d + 0.12, 0.3), (0, 0, 0.15), mat("plinth", mix("stone", "ink", 0.15), rough=0.9), bevel=0.03))
    rm = mat(roof_kind, PAL[roofc], rough=0.8)
    roof_h = h + w * 0.42
    parts += gable_roof(w, d, h, roof_h, over=0.42, m=rm, sag=0.1 + rnd.uniform(0, 0.06), seed=seed)
    parts += chimney(w * 0.22, -d * 0.2, h + 0.3, roof_h - h + 0.4, mat("stone", rough=0.9))
    if porch:
        for sx in (-1, 1):
            parts.append(box((0.12, 0.12, 2.1), (w * 0.18 * (1 if seed % 2 else -1) + sx * 0.75, d / 2 + 0.9, 1.05), frame_m, bevel=0.01))
        parts += [slab([(w * 0.18 * (1 if seed % 2 else -1) - 1.0, d / 2 + 1.2, 2.25), (w * 0.18 * (1 if seed % 2 else -1) + 1.0, d / 2 + 1.2, 2.25),
                        (w * 0.18 * (1 if seed % 2 else -1) + 1.0, d / 2 - 0.05, 2.6), (w * 0.18 * (1 if seed % 2 else -1) - 1.0, d / 2 - 0.05, 2.6)],
                       0.08, 3, 3, rm, sag=0.03)]
    if dormer:
        parts.append(box((1.2, 1.0, 0.9), (-w * 0.2, d * 0.18 + 0.4, h + 0.75), wm, bevel=0.03))
        parts += [from_profile([(-0.75, h + 1.15), (0.0, h + 1.7), (0.75, h + 1.15)], 1.3, rm, loc=(-w * 0.2, d * 0.18 + 0.35, 0))]
    # a lobster pot and a stacked oar by the door: lived in
    parts.append(cyl(0.3, 0.45, (w * 0.42, d / 2 + 0.55, 0.22), mat("wood", rough=0.9), verts=10))
    parts.append(strut((-w * 0.45, d / 2 + 0.3, 0.0), (-w * 0.4, d / 2 + 0.12, 2.3), 0.04, mat("wood")))
    o = join(parts, name)
    finish(o, seed, wob=0.012)
    roof_courses(o)

    def weather(co, n, mn):
        # damp at the foot of the walls, sun-bleached higher up
        if mn == "render":
            return lerp3((0.86, 0.85, 0.8), (1.02, 1.01, 0.98), min(1.0, co.z / 1.2)) if co.z < 1.2 else (1.0, 1.0, 0.99)
        return (1, 1, 1)
    paint_mat(o, weather)
    export([o], name)


def house_0():
    cottage("house_0", "paint_white", "slate", "paint_teal", 5.4, 4.4, 3.2, 81, porch=True)


def house_1():
    cottage("house_1", mix("paint_yellow", "paper", 0.35), "roof_red", "paint_red", 4.8, 4.2, 3.0, 82, dormer=True, roof_kind="roof_tile")


def house_2():
    cottage("house_2", mix("shoal", "paper", 0.55), "slate", "paint_yellow", 6.2, 4.6, 3.4, 83)


# --- The drowned town ------------------------------------------------------------------------------
def drowned(o, seed, anchors, line=99.0, weed_len=0.9):
    """The sea's marks on a drowned building: stain, weed hanging from its
    ledges, barnacles round its feet."""
    tide_mark(o, line, strength=0.5)
    weedm = mat("weed", mix("kelp", "ink", 0.2), rough=0.7)
    strands = weed_strands(anchors, length=weed_len, seed=seed, width=0.07, m=weedm)
    bar = mat("barnacle", mix("paper", "sand", 0.35), rough=0.75)
    bb = o.bound_box
    lo = Vector((min(v[0] for v in bb), min(v[1] for v in bb), min(v[2] for v in bb)))
    hi = Vector((max(v[0] for v in bb), max(v[1] for v in bb), max(v[2] for v in bb)))
    clusters = []
    rnd = random.Random(seed)
    for k in range(5):
        p = Vector((rnd.uniform(lo.x, hi.x), rnd.uniform(lo.y, hi.y), lo.z + 0.4))
        clusters += barnacle_cluster(o, 10, p, 0.5, seed=seed + k, size=0.05, m=bar)
    o = join([o] + strands + clusters, o.name)
    fill_col(o, ("weed", "barnacle"))
    return o


def town_house():
    reset()
    w, d, h = 5.2, 4.6, 4.4
    wm = mat("stone", rough=0.9)
    shell = box((w, d, h), (0, 0, h / 2), wm, bevel=0.04, name="walls")
    cutters = [box((w - 0.6, d - 0.6, h), (0, 0, h / 2 + 0.3))]
    frame_m = mat("frame_rot", mix("wood_grey", "kelp", 0.3), rough=0.9)
    parts = []
    dc, dp = door(-0.9, d / 2, 0.0, 1.0, 2.1, mat("door_rot", mix("wood_dark", "kelp", 0.3), rough=0.9))
    cutters.append(dc)
    parts += dp
    for x, z in ((1.1, 1.5), (-1.2, 3.3), (1.2, 3.3)):
        c, wp = window(x, d / 2, z, 0.85, 1.05, 0.3, frame_m, pane="pane_dark")
        cutters.append(c)
        parts += wp
    for y in (-1.0, 1.0):
        c, wp = window(w / 2, y, 2.4, 0.7, 1.0, 0.3, frame_m, wall_dir="x", pane="pane_dark")
        cutters.append(c)
        parts += wp
    cut(shell, cutters)
    parts.append(shell)
    parts += quoins(w, d, h, mat("dress"), size=0.36)
    # a broken-backed roof: a hole where slates went, rafters showing through
    rm = mat("slate", rough=0.75)
    parts += gable_roof(w, d, h, h + 2.2, over=0.38, m=rm, sag=0.28, missing=(1, -0.6, 1.4), seed=4)
    for y in (-0.4, 0.4, 1.2):
        parts.append(strut((0.2, y, h + 2.1), (w / 2 + 0.3, y, h - 0.1), 0.08, mat("wood_dark", rough=0.9)))
    parts += chimney(-1.4, -0.9, h + 0.6, 2.0, wm, pots=1)
    o = join(parts, "town_house")
    finish(o, 51, wob=0.03, dist=1.2)
    courses(o)
    roof_courses(o)
    anchors = [(x, d / 2 + 0.45, h - 0.15) for x in (-2.4, -1.5, -0.4, 0.8, 1.9)] + [(x, d / 2 + 0.1, 0.85) for x in (0.8, 1.4)]
    anchors += [(w / 2 + 0.45, y, h - 0.15) for y in (-1.6, 0.0, 1.5)] + [(x, d / 2 + 0.15, 2.7) for x in (-1.5, 1.4)]
    o = drowned(o, 51, anchors)
    export([o], "town_house")


def town_chapel():
    reset()
    w, d, h = 5.4, 9.0, 5.0
    wm = mat("stone_pale", rough=0.9)
    shell = box((w, d, h), (0, 0, h / 2), wm, bevel=0.04, name="walls")
    cutters = [box((w - 0.7, d - 0.7, h), (0, 0, h / 2 + 0.4))]
    frame_m = mat("lead", mix("ink", "steel", 0.4), rough=0.6)
    parts = []
    # lancet windows down both sides (pointed arches: a box and a rotated box)
    for y in (-2.8, -0.6, 1.6):
        for sx in (-1, 1):
            c, wp = window(sx * w / 2, y, 2.6, 0.7, 1.9, 0.35, frame_m, wall_dir="x", arched=True, pane="pane_dark")
            cutters.append(c)
            tip = box((0.5, 0.5, 0.5), (sx * w / 2, y, 3.55), rot=(math.radians(45), 0, 0))
            cutters.append(tip)
            parts += wp
    # the west door, arched, and a rose window over it
    dc, dp = door(0, d / 2, 0.0, 1.4, 2.6, mat("door_rot", mix("wood_dark", "kelp", 0.3), rough=0.9))
    cutters.append(dc)
    cutters.append(cyl(0.7, 1.2, (0, d / 2, 2.6), rot=(math.pi / 2, 0, 0), verts=16))
    parts += dp
    cutters.append(cyl(0.8, 1.2, (0, d / 2, 4.3), rot=(math.pi / 2, 0, 0), verts=20))
    cut(shell, cutters)
    parts.append(shell)
    rose = cyl(0.8, 0.08, (0, d / 2 - 0.2, 4.3), mat("pane_dark"), rot=(math.pi / 2, 0, 0), verts=20)
    parts.append(rose)
    for k in range(8):
        a = k * math.tau / 8
        parts.append(strut((0, d / 2 - 0.16, 4.3), (math.cos(a) * 0.78, d / 2 - 0.16, 4.3 + math.sin(a) * 0.78), 0.04, frame_m))
    parts.append(torus(0.82, 0.08, (0, d / 2 - 0.12, 4.3), mat("dress"), rot=(math.pi / 2, 0, 0), maj=24, mi=5))
    # buttresses
    for y in (-3.9, -1.7, 0.5, 2.7):
        for sx in (-1, 1):
            parts.append(box((0.6, 0.55, 3.2), (sx * (w / 2 + 0.3), y, 1.6), wm, bevel=0.04))
            parts.append(box((0.6, 0.55, 0.7), (sx * (w / 2 + 0.22), y, 3.4), wm, rot=(0, sx * math.radians(25), 0), bevel=0.04))
    # a steep slate roof and a bellcote on the west gable
    gable = from_profile([(-w / 2, h), (0.0, h + 3.4), (w / 2, h)], 0.5, wm, loc=(0, d / 2 - 0.25, 0))
    parts.append(gable)
    parts.append(from_profile([(-w / 2, h), (0.0, h + 3.4), (w / 2, h)], 0.5, wm, loc=(0, -d / 2 + 0.25, 0)))
    parts += gable_roof(w, d, h, h + 3.4, over=0.3, m=mat("slate", rough=0.75), sag=0.2, missing=(-1, -3.0, -1.6), seed=6)
    bell_base = Vector((0, d / 2 - 0.2, h + 3.3))
    parts.append(box((1.5, 0.6, 1.9), bell_base + Vector((0, 0, 0.95)), wm, bevel=0.04))
    cb = box((0.7, 1.4, 1.0), bell_base + Vector((0, 0, 1.0)))
    cut(parts[-1], [cb])
    parts.append(from_profile([(-0.9, 1.9), (0.0, 2.6), (0.9, 1.9)], 0.8, mat("slate"), loc=bell_base))
    bell = lathe([(0.0, -0.05), (0.08, -0.05), (0.12, -0.12), (0.26, -0.5), (0.3, -0.58), (0.0, -0.56)], 16, "bell", mat("bronze", mix("brass", "verdigris", 0.45), metal=0.6, rough=0.5))
    bell.location = bell_base + Vector((0, 0, 1.5))
    parts.append(bell)
    o = join(parts, "town_chapel")
    finish(o, 53, wob=0.03, dist=1.4)
    courses(o)
    roof_courses(o)
    anchors = [(sx * (w / 2 + 0.3), y, h - 0.1) for sx in (-1, 1) for y in (-4.0, -2.2, -0.2, 1.8, 3.8)]
    anchors += [(x, d / 2 + 0.2, 1.5 + 0.0) for x in (-0.5, 0.6)] + [(0, d / 2 + 0.3, h + 3.2), (-0.6, d / 2 + 0.3, h + 4.9)]
    o = drowned(o, 53, anchors, weed_len=1.1)
    export([o], "town_chapel")


def town_clocktower():
    """The lost town's clock tower: buttressed base, string courses, an arched
    door, slit windows, four clock faces, a louvred belfry and a flared lead
    pyramid roof, its weathervane gone (it's one of the finds)."""
    reset()
    sm = mat("towerstone", PAL["stone"], rough=0.9)
    dress = mat("dress", mix("stone_pale", "paper", 0.2), rough=0.85)
    parts = []
    W0, W1, H = 4.2, 3.7, 11.0
    rings = []
    me = bpy.data.meshes.new("tower")
    bm = bmesh.new()
    lv = []
    for z, wd in ((0.0, W0), (H, W1)):
        lv.append([bm.verts.new((sx * wd / 2, sy * wd / 2, z)) for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    for k in range(4):
        bm.faces.new((lv[0][k], lv[0][(k + 1) % 4], lv[1][(k + 1) % 4], lv[1][k]))
    bm.faces.new(list(reversed(lv[0])))
    bm.faces.new(lv[1])
    bm.to_mesh(me)
    bm.free()
    shaft = bpy.data.objects.new("shaft", me)
    bpy.context.collection.objects.link(shaft)
    shaft.data.materials.append(sm)
    m = shaft.modifiers.new("sub", "SUBSURF")
    m.subdivision_type = "SIMPLE"
    m.levels = 3
    apply_mods(shaft)
    cutters = []
    dc, dp = door(0, W0 / 2 - 0.02, 0.0, 1.3, 2.4, mat("door_rot", mix("wood_dark", "kelp", 0.3), rough=0.9))
    cutters.append(dc)
    cutters.append(cyl(0.65, 1.4, (0, W0 / 2, 2.4), rot=(math.pi / 2, 0, 0), verts=16))
    parts += dp
    for z in (4.6, 7.2):
        for (x, y, dirn) in ((0, W1 / 2 + 0.15, "y"), (W1 / 2 + 0.15, 0, "x"), (-W1 / 2 - 0.15, 0, "x")):
            c, wp = window(x, y, z, 0.32, 1.1, 0.4, dress, wall_dir=dirn, pane="pane_dark")
            cutters.append(c)
            parts += wp
    cut(shaft, cutters)
    parts.append(shaft)
    # corner buttresses at the foot, string courses up the shaft
    for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        parts.append(box((0.8, 0.8, 3.2), (sx * (W0 / 2 + 0.1), sy * (W0 / 2 + 0.1), 1.6), sm, bevel=0.05))
        parts.append(box((0.7, 0.7, 0.6), (sx * (W0 / 2 + 0.02), sy * (W0 / 2 + 0.02), 3.45), sm, rot=(sy * math.radians(20), -sx * math.radians(20), 0), bevel=0.05))
    for z in (3.6, 6.3, 9.0):
        wd = W0 + (W1 - W0) * z / H + 0.24
        parts.append(box((wd, wd, 0.2), (0, 0, z), dress, bevel=0.04))
    # the clock stage
    cs = 3.9
    parts.append(box((cs, cs, 2.6), (0, 0, H + 1.3), sm, bevel=0.06))
    parts.append(box((cs + 0.5, cs + 0.5, 0.3), (0, 0, H + 0.1), dress, bevel=0.05))
    parts.append(box((cs + 0.6, cs + 0.6, 0.35), (0, 0, H + 2.75), dress, bevel=0.05))
    dial = mat("dial", mix("paper", "sand", 0.15), rough=0.6)
    ink = mat("ink", rough=0.6)
    brass = mat("brass", metal=0.7, rough=0.35)
    for (rx, ry, rz) in ((0, 1, 0), (1, 0, math.pi / 2), (0, -1, math.pi), (-1, 0, -math.pi / 2)):
        c = Vector((rx * (cs / 2 + 0.02), ry * (cs / 2 + 0.02), H + 1.3))
        out = Vector((rx, ry, 0))
        parts.append(cyl(1.15, 0.1, c, dial, rot=(math.pi / 2, 0, rz), verts=28))
        parts.append(torus(1.18, 0.09, c + out * 0.04, brass, rot=(math.pi / 2, 0, rz), maj=28, mi=5))
        side = Vector((-ry, rx, 0))
        for k in range(12):
            a = k * math.tau / 12
            p = c + out * 0.07 + side * math.sin(a) * 0.95 + Vector((0, 0, math.cos(a) * 0.95))
            ln = 0.2 if k % 3 == 0 else 0.11
            q = c + out * 0.07 + side * math.sin(a) * (0.95 - ln) + Vector((0, 0, math.cos(a) * (0.95 - ln)))
            parts.append(strut(p, q, 0.035 if k % 3 == 0 else 0.022, ink))
        # hands stopped at ten to two, the hour the sea came in
        parts.append(strut(c + out * 0.1, c + out * 0.1 + side * -0.55 + Vector((0, 0, 0.32)), 0.05, ink))
        parts.append(strut(c + out * 0.12, c + out * 0.12 + side * 0.72 + Vector((0, 0, 0.5)), 0.035, ink))
        parts.append(sphere(0.07, c + out * 0.12, brass, segs=8, rings=6))
    # the belfry: arched openings with louvres
    bz = H + 2.9
    bel = box((3.5, 3.5, 2.6), (0, 0, bz + 1.3), sm, bevel=0.05)
    bcut = []
    for (rx, ry) in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        bcut.append(box((1.3 if ry else 2.0, 2.0 if ry else 1.3, 1.6), (rx * 1.75, ry * 1.75, bz + 1.1)))
        bcut.append(cyl(0.65, 2.0, (rx * 1.75, ry * 1.75, bz + 1.9), rot=(math.pi / 2, 0, 0) if ry else (0, math.pi / 2, 0), verts=14))
    cut(bel, bcut)
    parts.append(bel)
    louv = mat("louvre", mix("wood_grey", "kelp", 0.25), rough=0.9)
    for (rx, ry) in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        for k in range(5):
            z = bz + 0.5 + k * 0.32
            parts.append(box((1.25 if ry else 0.08, 0.08 if ry else 1.25, 0.24), (rx * 1.62, ry * 1.62, z), louv, rot=(ry * math.radians(-35), rx * math.radians(35), 0)))
    parts.append(box((3.9, 3.9, 0.3), (0, 0, bz + 2.7), dress, bevel=0.05))
    # the flared pyramid roof in old lead, with a bare spindle on top
    roof = lathe([(0.0, 0.0), (2.55, 0.0), (2.2, 0.35), (1.0, 2.4), (0.15, 3.9), (0.0, 4.0)], 4, "roof", mat("leadroof", mix("verdigris", "ink", 0.3), rough=0.55))
    roof.rotation_euler = (0, 0, math.pi / 4)
    roof.location = (0, 0, bz + 2.85)
    parts.append(roof)
    parts.append(cyl(0.05, 1.2, (0, 0, bz + 7.3), mat("iron", metal=0.5), verts=6))
    parts.append(sphere(0.12, (0, 0, bz + 6.9), brass, segs=8, rings=6))
    o = join(parts, "town_clocktower")
    finish(o, 57, wob=0.025, dist=1.4)
    courses(o, every=0.42)
    anchors = [(sx * (cs / 2 + 0.3), sy * 1.6, H + 2.6) for sx in (-1, 1) for sy in (-1, 0, 1)]
    anchors += [(sx * 1.6, sy * (cs / 2 + 0.3), H + 2.6) for sy in (-1, 1) for sx in (-1, 0, 1)]
    anchors += [(rx * 1.85, ry * 1.85, bz + 0.3) for (rx, ry) in ((0, 1), (1, 0), (-1, 0))]
    anchors += [(x, W1 / 2 + 0.35, z) for z in (3.7, 6.4, 9.1) for x in (-1.2, 0.4, 1.5)]
    o = drowned(o, 57, anchors, weed_len=1.4)
    export([o], "town_clocktower")


def town_arch():
    """The town gate: two piers with capitals and a round arch of real
    voussoirs (wedge stones) under a keystone, a parapet on top."""
    reset()
    sm = mat("stone_pale", rough=0.9)
    dress = mat("dress", mix("stone_pale", "paper", 0.2), rough=0.85)
    parts = []
    span, pier_h, depth = 3.6, 3.0, 1.0
    for sx in (-1, 1):
        parts.append(box((1.0, depth, pier_h), (sx * (span / 2 + 0.5), 0, pier_h / 2), sm, bevel=0.04))
        parts.append(box((1.2, depth + 0.2, 0.25), (sx * (span / 2 + 0.5), 0, pier_h + 0.12), dress, bevel=0.03))
        parts.append(box((1.2, depth + 0.2, 0.3), (sx * (span / 2 + 0.5), 0, 0.15), dress, bevel=0.03))
    r_in, r_out = span / 2, span / 2 + 0.75
    n = 13
    for k in range(n):
        a0 = math.pi * k / n
        a1 = math.pi * (k + 1) / n
        gap = 0.012
        pts = [(math.cos(a0 + gap) * r_in, math.sin(a0 + gap) * r_in), (math.cos(a0 + gap) * r_out, math.sin(a0 + gap) * r_out),
               (math.cos(a1 - gap) * r_out, math.sin(a1 - gap) * r_out), (math.cos(a1 - gap) * r_in, math.sin(a1 - gap) * r_in)]
        pts = [(x, z + pier_h + 0.25) for (x, z) in reversed(pts)]
        v = from_profile(pts, depth + (0.12 if k == n // 2 else 0.0), dress if k == n // 2 else sm, name="voussoir", bevel=0.03)
        if k == n // 2:
            v.location.z += 0.08
        parts.append(v)
    # spandrels and parapet
    parts.append(box((span + 2.0, depth, 0.9), (0, 0, pier_h + 0.25 + r_out + 0.2), sm, bevel=0.03))
    for sx in (-1, 1):
        sp = box((1.3, depth * 0.96, r_out), (sx * (span / 2 + 0.4), 0, pier_h + 0.25 + r_out / 2), sm)
        cutc = cyl(r_out, depth * 2, (0, 0, pier_h + 0.25), rot=(math.pi / 2, 0, 0), verts=32)
        cut(sp, [cutc])
        parts.append(sp)
    parts.append(box((span + 2.3, depth + 0.2, 0.2), (0, 0, pier_h + 0.25 + r_out + 0.75), dress, bevel=0.03))
    o = join(parts, "town_arch")
    finish(o, 59, wob=0.02, dist=1.2)
    courses(o)
    anchors = [(x, depth / 2 + 0.1, pier_h + 0.25 + r_out + 0.6) for x in (-2.2, -1.0, 0.3, 1.4, 2.4)] + [(0, depth / 2 + 0.1, pier_h + 0.25 + r_in)]
    o = drowned(o, 59, anchors, weed_len=1.0)
    export([o], "town_arch")


# --- The sea wall: the bay's hero landmark ------------------------------------------------------------
def sea_wall():
    """The old sea wall across the bay's mouth, built along its line in the
    level: a battered masonry face to the bay (weed line, barnacle band,
    buttresses, iron ladders and mooring rings), a cobbled walk on top with
    bollards, a parapet to seaward, rock armour where the sea breaks on it,
    and the old sluice gate in the middle with its winding gear."""
    reset()
    data = json.load(open(BAY))
    lm = data["landmarks"]
    crest = float(lm["wall_crest"])
    line = [Vector((p[0], -p[1], 0.0)) for p in lm["wall"]]          # Godot (x, z) -> Blender (x, -z)
    sm = mat("seawall", PAL["stone"], rough=0.9)
    dress = mat("dress", mix("stone_pale", "paper", 0.15), rough=0.85)
    parts = []
    n = len(line)
    tang = []
    for i in range(n):
        a = line[max(i - 1, 0)]
        b = line[min(i + 1, n - 1)]
        t = (b - a).normalized()
        tang.append(t)
    # Cross-section (offset towards the bay = +Y in Blender, i.e. Godot +Z/south):
    # bay face foot, bay face top, walk, parapet, sea face, sea toe.
    sec = [(3.6, -7.0), (2.55, crest - 0.05), (2.4, crest), (-1.6, crest), (-1.6, crest + 0.9), (-2.4, crest + 0.9),
           (-2.4, crest - 0.2), (-3.4, -1.0), (-4.6, -4.5)]
    rings = []
    for i in range(n):
        t = tang[i]
        bay = Vector((-t.y, t.x, 0))          # left of the line's direction (west to east) is the bay side
        if bay.y < 0:
            bay = -bay
        ring = [line[i] + bay * o + Vector((0, 0, z)) for (o, z) in sec]
        rings.append(ring)
    me = bpy.data.meshes.new("wall")
    bm = bmesh.new()
    vr = [[bm.verts.new(p) for p in r] for r in rings]
    m_ = len(sec)
    for i in range(n - 1):
        for k in range(m_ - 1):
            bm.faces.new((vr[i][k], vr[i][k + 1], vr[i + 1][k + 1], vr[i + 1][k]))
    for ring in (vr[0], vr[-1]):
        bm.faces.new(ring)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    wall = bpy.data.objects.new("wall", me)
    bpy.context.collection.objects.link(wall)
    wall.data.materials.append(sm)
    parts.append(wall)
    # buttresses on the bay face, bollards and rings along the walk, ladders
    iron = mat("iron", metal=0.5, rough=0.6)
    rnd = random.Random(91)
    total = 0.0
    cum = [0.0]
    for i in range(1, n):
        total += (line[i] - line[i - 1]).length
        cum.append(total)

    def at(s):
        i = 1
        while i < n - 1 and cum[i] < s:
            i += 1
        u = (s - cum[i - 1]) / max(cum[i] - cum[i - 1], 1e-6)
        p = line[i - 1].lerp(line[i], u)
        t = tang[i]
        bay = Vector((-t.y, t.x, 0))
        if bay.y < 0:
            bay = -bay
        return p, t, bay
    s = 5.0
    k = 0
    mid = total * 0.5
    while s < total - 4.0:
        p, t, bay = at(s)
        if abs(s - mid) > 4.5:
            # a buttress: a battered pier against the bay face
            b = box((1.6, 1.6, 9.4), p + bay * 3.2 + Vector((0, 0, crest - 4.9)), sm, bevel=0.06)
            b.rotation_euler = (0, 0, math.atan2(t.y, t.x))
            parts.append(b)
            parts.append(box((1.9, 1.9, 0.3), p + bay * 3.2 + Vector((0, 0, crest - 0.05)), dress, rot=(0, 0, math.atan2(t.y, t.x)), bevel=0.04))
        if k % 2 == 1 and abs(s - mid) > 4.5:
            # a mushroom bollard
            q = p + bay * 1.9 + t * 2.5 + Vector((0, 0, crest))
            parts.append(lathe([(0.0, 0.0), (0.24, 0.0), (0.2, 0.4), (0.18, 0.55), (0.3, 0.68), (0.28, 0.78), (0.0, 0.8)], 12, "bollard", iron, loc=q))
        if k % 3 == 2 and abs(s - mid) > 4.5:
            # an iron ladder down the bay face
            for sx in (-0.3, 0.3):
                parts.append(strut(p + bay * 2.62 + t * sx + Vector((0, 0, crest)), p + bay * 3.75 + t * sx + Vector((0, 0, -6.5)), 0.035, iron))
            for r in range(16):
                u = r / 15
                a = p + bay * (2.62 + 1.13 * u) + Vector((0, 0, crest - (crest + 6.5) * u))
                parts.append(strut(a - t * 0.3, a + t * 0.3, 0.025, iron))
        if k % 2 == 0:
            parts.append(torus(0.22, 0.04, p + bay * 2.62 + Vector((0, 0, crest - 1.6)), iron, rot=(math.pi / 2, 0, math.atan2(t.y, t.x)), maj=12, mi=4))
        s += 4.6 + rnd.uniform(-0.4, 0.4)
        k += 1
    # the sluice gate in the middle: a recess in the bay face, a timber gate, winding gear on top
    p, t, bay = at(mid)
    ang = math.atan2(t.y, t.x)
    gate_m = mat("gatewood", mix("wood_dark", "kelp", 0.25), rough=0.9)
    for sx in (-1, 1):
        parts.append(box((0.9, 1.4, 9.0), p + t * sx * 2.0 + bay * 3.0 + Vector((0, 0, crest - 4.4)), dress, rot=(0, 0, ang), bevel=0.05))
    gate = box((3.2, 0.35, 6.5), p + bay * 2.95 + Vector((0, 0, crest - 3.8)), gate_m, rot=(0, 0, ang))
    parts.append(gate)
    for z in range(6):
        parts.append(box((3.3, 0.12, 0.14), p + bay * 3.15 + Vector((0, 0, crest - 0.9 - z * 1.05)), iron, rot=(0, 0, ang)))
    parts.append(box((4.6, 1.2, 0.4), p + bay * 2.9 + Vector((0, 0, crest + 0.2)), dress, rot=(0, 0, ang), bevel=0.04))
    wheel_c = p + bay * 2.9 + Vector((0, 0, crest + 1.4))
    for sx in (-1, 1):
        parts.append(box((0.2, 0.3, 1.2), wheel_c + t * sx * 0.9 + Vector((0, 0, -0.6)), iron, rot=(0, 0, ang)))
    parts.append(torus(0.6, 0.06, wheel_c, iron, rot=(math.pi / 2, 0, ang + math.pi / 2), maj=18, mi=5))
    for kk in range(6):
        a = kk * math.pi / 3
        off = Vector((0, 0, math.sin(a) * 0.6)) + bay * math.cos(a) * 0.6
        parts.append(strut(wheel_c, wheel_c + off, 0.03, iron))
    parts.append(strut(wheel_c - t * 1.0, wheel_c + t * 1.0, 0.05, iron))
    # rock armour along the sea toe
    stone_m = mat("armour", mix("stone", "ink", 0.2), rough=0.95)
    s = 1.5
    while s < total - 1.0:
        p, t, bay = at(s)
        for j in range(2):
            q = p - bay * (4.2 + j * 1.5 + rnd.uniform(-0.3, 0.3)) + t * rnd.uniform(-0.6, 0.6) + Vector((0, 0, -1.6 - j * 1.2))
            r = sphere(rnd.uniform(0.9, 1.4), q, stone_m, scale=(1.3, 1.0, 0.75), segs=7, rings=5)
            r.rotation_euler = (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, 3))
            parts.append(r)
        s += rnd.uniform(1.6, 2.4)
    o = join(parts, "sea_wall")
    smooth(o, 30)
    ao(o, 2.0, rays=10, strength=0.6, seed=91, edge=0.6, top=0.1)
    courses(o, every=0.55, stagger=1.3)

    def sea_marks(co, nrm, mn):
        z = co.z
        # the bay face: a weed band at the old waterline, barnacles under it,
        # green-brown below, and salt above
        if -1.2 < z < 0.2:
            return lerp3(mix("kelp", "ink", 0.3), (1, 1, 1), 0.25 * vnoise3(co.x * 3, co.y * 3, z * 3))
        if z < -1.2:
            v = vnoise3(co.x * 1.6, co.y * 1.6, z * 1.6)
            c = lerp3(mix("kelp_light", "ink", 0.2), mix("sand", "paper", 0.3), 0.3 * v)
            if hash3(math.floor(co.x * 6), math.floor(co.y * 6), math.floor(z * 6)) > 0.8 and z > -3.5:
                c = lerp3(c, mix("paper", "sand", 0.3), 0.7)
            return c
        if z < 0.6:
            return (1.05, 1.04, 0.99)
        if mn == "seawall" and z > crest - 0.02 and abs(nrm.z) > 0.8:
            # setts on the walk
            v = 0.9 + 0.1 * hash3(math.floor(co.x * 2.4), math.floor(co.y * 2.4), 1)
            return (v, v, v * 0.98)
        return (1, 1, 1)
    paint_mat(o, sea_marks)
    weedm = mat("weed", mix("kelp", "ink", 0.2), rough=0.7)
    anchors = []
    s = 2.0
    while s < total - 2.0:
        p, t, bay = at(s)
        anchors.append(p + bay * (2.55 + 0.08) + t * rnd.uniform(-1, 1) + Vector((0, 0, 0.05)))
        s += rnd.uniform(0.7, 1.4)
    strands = weed_strands(anchors, length=1.0, seed=93, width=0.09, m=weedm, droop=(0, 0.15, -1))
    o = join([o] + strands, "sea_wall")
    fill_col(o, ("weed",))
    export([o], "sea_wall")


def weir():
    """The weir across the river mouth: a stepped stone sill laid block by
    block between two piers with pointed cutwaters, battered wing walls
    running into rubble, a plank sluice gate held shut in its grooves, a
    plank footbridge over the piers with the winding gear and its rack, a
    weed line at the old water level and salt above it."""
    reset()
    rnd = random.Random(95)
    sm = mat("seawall", PAL["stone"], rough=0.9)
    sd = mat("wallstone", mix("stone", "ink", 0.18), rough=0.92)
    dress = mat("dress", mix("stone_pale", "stone", 0.35), rough=0.85)
    gate_m = mat("gatewood", mix("wood_dark", "kelp", 0.2), rough=0.9)
    plank = mat("plank", mix("wood_grey", "sand", 0.15), rough=0.9)
    iron = mat("iron", metal=0.5, rough=0.6)
    rubble = mat("armour", mix("stone", "ink", 0.25), rough=0.95)
    parts = []

    def block(size, loc, jit=0.035, m=None):
        sx, sy, sz = size
        b = box((sx - rnd.uniform(0.02, 0.06), sy - rnd.uniform(0.0, 0.05), sz - rnd.uniform(0.0, 0.04)),
                (loc[0] + rnd.uniform(-jit, jit), loc[1] + rnd.uniform(-jit, jit), loc[2] + rnd.uniform(-jit * 0.5, jit * 0.5)),
                m or (sm if rnd.random() < 0.62 else sd), rot=(rnd.uniform(-0.02, 0.02), rnd.uniform(-0.02, 0.02), rnd.uniform(-0.03, 0.03)),
                bevel=0.05)
        parts.append(b)

    # The sill: three courses stepping down to the bay side (+Y), laid in running bond.
    for c, (z, y0, y1) in enumerate([(-0.55, -1.2, 1.9), (-0.05, -1.2, 1.2), (0.45, -1.2, 0.5)]):
        x = -4.6 + (0.45 if c % 2 else 0.0)
        while x < 4.6:
            w = rnd.uniform(0.75, 1.05)
            w = min(w, 4.6 - x)
            if w > 0.25:
                depth = y1 - y0
                rows = max(1, round(depth / 0.8))
                for r in range(rows):
                    dy = depth / rows
                    block((w, dy, 0.5), (x + w / 2, y0 + dy * (r + 0.5), z))
            x += w
    # The piers: coursed blocks, a pointed cutwater both ends, a dressed coping.
    for sx in (-1, 1):
        px = sx * 2.25
        for c in range(4):
            z = 0.95 + c * 0.62
            inset = c * 0.03
            block((1.5 - inset, 2.5 - inset, 0.62), (px, 0.0, z), jit=0.02)
            for ey in (-1, 1):
                nose = box((1.05 - inset * 0.7, 1.05 - inset * 0.7, 0.6), (px, ey * 1.25, z), sd if c % 2 else sm, rot=(0, 0, math.pi / 4), bevel=0.04)
                parts.append(nose)
        parts.append(box((1.8, 3.4, 0.22), (px, 0.0, 3.36), dress, bevel=0.05))
        # the gate grooves: iron channels on the pier faces
        parts.append(box((0.08, 0.3, 2.6), (px - sx * 0.78, 0.0, 1.95), iron))
    # Wing walls: battered courses out to rubble at each end.
    for sx in (-1, 1):
        for c in range(3):
            z = 0.95 + c * 0.55
            w = 2.3 - c * 0.45
            d = 2.6 - c * 0.3
            block((w, d, 0.55), (sx * (3.0 + w / 2 + c * 0.1), -0.1, z), jit=0.04)
        parts.append(box((1.9 - 0.9, 2.1, 0.18), (sx * 3.55, -0.1, 2.28), dress, bevel=0.04))
        for k in range(7):
            q = Vector((sx * rnd.uniform(4.7, 6.0), rnd.uniform(-1.4, 1.8), rnd.uniform(-0.4, 0.6)))
            r = sphere(rnd.uniform(0.35, 0.7), q, rubble, scale=(1.3, 1.0, 0.7), segs=7, rings=5)
            r.rotation_euler = (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, 3))
            parts.append(r)
    # The sluice gate: vertical planks, iron straps, a rack up to the gear.
    x = -1.42
    while x < 1.42:
        w = 0.44
        parts.append(box((w - 0.04, 0.22, 2.25 + rnd.uniform(-0.06, 0.06)), (x + w / 2, 0.0, 1.85 + rnd.uniform(-0.03, 0.03)), gate_m,
                         rot=(0, rnd.uniform(-0.015, 0.015), 0), bevel=0.02))
        x += w
    for z in (1.05, 1.8, 2.55):
        parts.append(box((3.0, 0.08, 0.12), (0, 0.14, z), iron))
    parts.append(box((0.16, 0.12, 2.2), (0, 0.2, 3.3), iron))
    for k in range(9):
        parts.append(box((0.22, 0.05, 0.05), (0, 0.27, 2.45 + k * 0.2), iron))
    # The footbridge over the piers: loose planks on two bearers, a rail.
    for sy in (-0.45, 0.45):
        parts.append(box((5.9, 0.16, 0.16), (0, sy, 3.55), mat("bearer", mix("wood_dark", "ink", 0.2), rough=0.9)))
    xx = -2.9
    while xx < 2.9:
        w = rnd.uniform(0.22, 0.3)
        parts.append(box((w - 0.03, 1.15, 0.07), (xx + w / 2, rnd.uniform(-0.03, 0.03), 3.66 + rnd.uniform(-0.01, 0.015)), plank,
                         rot=(0, 0, rnd.uniform(-0.03, 0.03))))
        xx += w
    for px in (-2.7, -0.9, 0.9, 2.7):
        parts.append(strut(Vector((px, -0.55, 3.66)), Vector((px + rnd.uniform(-0.04, 0.04), -0.56, 4.55)), 0.045, plank, sides=5))
    parts.append(strut(Vector((-2.75, -0.56, 4.5)), Vector((2.75, -0.56, 4.53)), 0.04, plank, sides=5))
    # The winding gear: two cheeks, a wheel with spokes, a pinion on the rack.
    wc = Vector((0, 0.15, 4.45))
    for sx in (-1, 1):
        parts.append(box((0.1, 0.42, 0.85), (sx * 0.32, 0.15, 4.05), iron, bevel=0.01))
    parts.append(torus(0.5, 0.045, wc + Vector((0.45, 0, 0)), iron, rot=(0, math.pi / 2, 0), maj=18, mi=5))
    for k in range(6):
        a = k * math.pi / 3
        parts.append(strut(wc + Vector((0.45, 0, 0)), wc + Vector((0.45, math.cos(a) * 0.5, math.sin(a) * 0.5)), 0.025, iron))
    parts.append(strut(wc - Vector((0.4, 0, 0)), wc + Vector((0.5, 0, 0)), 0.05, iron, sides=6))
    parts.append(cyl(0.16, 0.14, (0, 0.15, 4.45), iron, rot=(0, math.pi / 2, 0), verts=10))
    o = join(parts, "weir")
    smooth(o, 30)
    ao(o, 1.2, rays=10, strength=0.7, seed=95, edge=0.7, top=0.1)

    def marks(co, nrm, mn):
        z = co.z
        stone = mn in ("seawall", "wallstone", "dress", "armour")
        if not stone:
            return (1, 1, 1)
        # weed and slime at the river's old level, a darker wet band under it,
        # salt crust over it
        if 0.55 < z < 0.95:
            return lerp3(mix("kelp", "ink", 0.35), (1, 1, 1), 0.25 * vnoise3(co.x * 3, co.y * 3, z * 3))
        if z <= 0.55:
            v = vnoise3(co.x * 1.4, co.y * 1.4, z * 1.4)
            return lerp3(mix("kelp_light", "ink", 0.3), mix("stone", "sand", 0.3), 0.35 * v)
        if z < 1.25:
            return (1.03, 1.02, 0.97)
        v = 0.9 + 0.12 * vnoise3(co.x * 2.2, co.y * 2.2, z * 2.2)
        return (v, v * 0.99, v * 0.97)
    paint_mat(o, marks)
    weedm = mat("weed", mix("kelp", "ink", 0.2), rough=0.7)
    anchors = []
    xx = -4.4
    while xx < 4.4:
        if abs(abs(xx) - 2.25) > 0.8:
            anchors.append(Vector((xx, 1.25 + rnd.uniform(-0.05, 0.05), 0.9)))
        xx += rnd.uniform(0.25, 0.5)
    for sx in (-1, 1):
        for k in range(5):
            anchors.append(Vector((sx * 2.25 + rnd.uniform(-0.6, 0.6), 1.3, 0.92)))
    strands = weed_strands(anchors, length=0.55, seed=97, width=0.07, m=weedm, droop=(0, 0.25, -1))
    o = join([o] + strands, "weir")
    fill_col(o, ("weed",))
    export([o], "weir")


def lighthouse():
    reset()
    parts = []
    white_m = mat("lhwhite", mix("paper", "sand", 0.12), rough=0.8)
    tower = lathe([(0.0, 0.0), (2.1, 0.0), (2.0, 0.7), (1.5, 10.4), (1.75, 10.6), (1.75, 10.9), (0.0, 10.9)], 22, "tower", white_m)
    parts.append(tower)
    for z in (3.0, 6.2):
        parts.append(box((0.4, 0.2, 0.8), (0, 1.86 - z * 0.04, z), mat("pane_dark", mix("ink", "teal", 0.35), rough=0.2)))
    parts.append(lathe([(0.0, 10.9), (1.1, 10.9), (1.1, 12.3), (0.0, 12.3)], 16, "lamp", mat("lamp", mix("paper", "paint_yellow", 0.3), emit=2.0, rough=0.1)))
    for k in range(8):
        a = k * math.tau / 8
        parts.append(strut((math.cos(a) * 1.12, math.sin(a) * 1.12, 10.9), (math.cos(a) * 1.12, math.sin(a) * 1.12, 12.3), 0.035, mat("ink", rough=0.6)))
    parts.append(lathe([(0.0, 12.3), (1.35, 12.3), (0.7, 13.2), (0.2, 13.5), (0.0, 13.6)], 16, "cap", mat("capred", mix("roof_red", "ink", 0.2), rough=0.6)))
    parts.append(torus(1.85, 0.05, (0, 0, 11.5), mat("ink", rough=0.6), maj=24, mi=4))
    for k in range(16):
        a = k * math.tau / 16
        parts.append(strut((math.cos(a) * 1.85, math.sin(a) * 1.85, 10.9), (math.cos(a) * 1.85, math.sin(a) * 1.85, 11.5), 0.025, mat("ink", rough=0.6), sides=4))
    # the keeper's cottage against its foot
    hut = box((3.0, 3.6, 2.4), (2.6, -0.3, 1.2), white_m, bevel=0.05)
    hc, hp = door(2.6, 1.5, 0.0, 0.8, 1.8, mat("doorpaint", PAL["paint_teal"], rough=0.6))
    cut(hut, [hc])
    parts.append(hut)
    parts += hp
    roof = gable_roof(3.0, 3.6, 2.4, 3.6, over=0.3, m=mat("roof_tile", PAL["roof_red"], rough=0.8), sag=0.06)
    for p in roof:
        p.location.x += 2.6
        p.location.y -= 0.3
    parts += roof
    o = join(parts, "lighthouse")
    finish(o, 71, wob=0.015, dist=1.2)
    paint(o, lambda co, n: lerp3((1, 1, 1), mix("paint_red", "coral", 0.2), 1.0 if (int(co.z / 2.0) % 2 == 1 and co.z < 10.4 and math.hypot(co.x, co.y) < 2.2) else 0.0))
    roof_courses(o)
    export([o], "lighthouse")


# --- Stones ---------------------------------------------------------------------------------------------
def rock(name, scale, seed, strata=True, flat_top=0.0):
    """A weathered stone: a lumpy core, a facet or two sheared flat, strata
    lines, darker and weedier at the foot."""
    reset()
    o = sphere(1.0, (0, 0, 0), mat("rock", mix(mix("stone", "ink", 0.38), "rust", 0.08), rough=0.92), segs=12, rings=9)
    rnd = random.Random(seed)
    for v in o.data.vertices:
        p = v.co.copy()
        n = vnoise3(p.x * 1.3 + seed, p.y * 1.3, p.z * 1.3)
        n2 = vnoise3(p.x * 3.1, p.y * 3.1 + seed, p.z * 3.1)
        v.co = p * (0.82 + 0.3 * n + 0.08 * n2)
        v.co.x *= scale[0]
        v.co.y *= scale[1]
        v.co.z *= scale[2]
        if flat_top and v.co.z > flat_top:
            v.co.z = flat_top + (v.co.z - flat_top) * 0.15
        if v.co.z < -0.25 * scale[2]:
            v.co.z = -0.25 * scale[2] + (v.co.z + 0.25 * scale[2]) * 0.3
    # shear a facet off one side
    a = rnd.uniform(0, math.tau)
    nrm = Vector((math.cos(a), math.sin(a), 0.4)).normalized()
    for v in o.data.vertices:
        d = v.co.dot(nrm) - 0.7 * max(scale)
        if d > 0:
            v.co -= nrm * d * 0.85
    # two more shears for a broken, faceted stone
    for kk in range(2):
        a2 = rnd.uniform(0, math.tau)
        n2 = Vector((math.cos(a2), math.sin(a2), rnd.uniform(-0.2, 0.9))).normalized()
        for v in o.data.vertices:
            d = v.co.dot(n2) - rnd.uniform(0.55, 0.75) * max(scale) * 0 - 0.62 * max(scale)
            if d > 0:
                v.co -= n2 * d * 0.9
    smooth(o, 24)
    ao(o, 0.8, rays=10, strength=0.6, seed=seed, edge=1.1, top=0.15)
    tilt = rnd.uniform(-0.4, 0.4)

    def fn(co, n):
        c = (1, 1, 1)
        if strata:
            s = math.sin((co.z + co.x * tilt) * 7.0 + vnoise3(co.x, co.y, co.z) * 2.0)
            c = lerp3(c, (0.72, 0.7, 0.66), 0.6 * max(0.0, s - 0.55) * 2.2)
        if co.z < 0.0:
            c = lerp3(c, lerp3(mix("kelp", "ink", 0.25), (1, 1, 1), 0.3), min(1.0, -co.z / (0.25 * scale[2] + 1e-3)) * 0.7)
        if n.z > 0.6 and vnoise3(co.x * 3, co.y * 3, 2) > 0.62:
            c = lerp3(c, mix("paper", "sand", 0.35), 0.45)       # lichen and salt on top
        return c
    paint(o, fn)
    export([o], name)


def rock_round():
    rock("rock_round", (1.1, 0.95, 0.75), 21)


def rock_flat():
    rock("rock_flat", (1.4, 1.05, 0.5), 23, flat_top=0.28)


def rock_tall():
    rock("rock_tall", (0.75, 0.7, 1.15), 27)


ALL = {f.__name__: f for f in [house_0, house_1, house_2, town_house, town_chapel, town_clocktower, town_arch, sea_wall,
                               weir, lighthouse, rock_round, rock_flat, rock_tall]}

if __name__ == "__main__":
    names = sys.argv[1:] or list(ALL)
    for nm in names:
        ALL[nm]()
