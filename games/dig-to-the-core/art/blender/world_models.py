"""Helpers, buildings and props for Dig to the Core.
Run: python3 art/blender/world_models.py [name ...]

Shape language: chunky and a little top-heavy, bevelled, nothing perfectly
straight (boards lean, roofs sag, posts tilt). Round only where it's alive.
Creatures face +Y (Godot's forward). Nodes that animate are named: "Claws"
(the crew), "Sheave" (the lift wheel). Colours: the art bible palette and
tints of it only (kit.PAL); AO and edge wear are baked into vertex colours."""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector, noise  # noqa: E402
from kit import (box, cyl, sphere, torus, join, wear, wobble, export, reset, mat, taper, subdivide, bar, attach,  # noqa: E402
                 lathe, place, strut, ao, smooth, tube, arc)

R90 = math.radians(90)


def bake(o):
    bpy.context.view_layer.update()
    o.data.transform(o.matrix_world)
    o.matrix_world = Matrix.Identity(4)
    return o


def lump(r, loc, m, seed, scale=(1, 1, 1), sub=2, rough=0.25, flat_bottom=None, name="lump"):
    """A lumpy faceted blob: an icosphere pushed about by noise."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    off = Vector((seed * 1.37, seed * 2.11, seed * 0.73))
    for v in o.data.vertices:
        n = noise.noise(v.co * (2.2 / r) + off)
        v.co *= 1.0 + rough * n
        v.co.x *= scale[0]
        v.co.y *= scale[1]
        v.co.z *= scale[2]
        if flat_bottom is not None and v.co.z < flat_bottom:
            v.co.z = flat_bottom
    o.data.transform(Matrix.Translation(loc))
    if m:
        o.data.materials.append(m)
    return o


# --- The crew --------------------------------------------------------------------------------
def mole():
    """A pear-shaped mole standing up out of its hole: big spade hands with
    claws, a long pink snout, squinty eyes and a miner's hard hat."""
    fur = mat("fur", rough=0.95)
    belly = mat("fur_light", rough=0.95)
    pink = mat("pink", rough=0.7)
    claw = mat("bone", rough=0.5)
    hat = mat("amber", rough=0.45)
    parts = []
    body = lathe([(0.0, 0.0), (0.15, 0.005), (0.205, 0.05), (0.215, 0.11), (0.2, 0.18), (0.168, 0.25),
                  (0.135, 0.31), (0.112, 0.36), (0.085, 0.405), (0.04, 0.435), (0.0, 0.44)], 20, "body", fur)
    for v in body.data.vertices:
        # A pot belly at the front, a flatter back.
        if v.co.y > 0:
            v.co.y *= 1.0 + 0.18 * math.exp(-((v.co.z - 0.12) / 0.09) ** 2)
        else:
            v.co.y *= 0.9
    parts.append(body)
    parts.append(place(sphere(0.12, (0, 0, 0), belly, scale=(1.0, 0.45, 1.25), segs=14, rings=10), (0, 0.13, 0.14)))
    # Snout: long, a little upturned, pale on top, with a big pink nose and whiskers.
    sn = tube([Vector((0, 0.1, 0.34)), Vector((0, 0.17, 0.33)), Vector((0, 0.235, 0.318)), Vector((0, 0.28, 0.322))],
              [0.07, 0.052, 0.036, 0.028], belly, sides=12, name="snout")
    parts.append(sn)
    parts.append(place(sphere(0.042, (0, 0, 0), pink, scale=(1.2, 0.8, 0.95), segs=14, rings=8), (0, 0.3, 0.325)))
    for s in (-1, 1):
        parts.append(place(sphere(0.008, (0, 0, 0), mat("soot"), segs=6, rings=4), (s * 0.016, 0.332, 0.322)))
        for k in range(3):
            a = (k - 1) * 0.28
            w = [Vector((s * 0.03, 0.25, 0.322)), Vector((s * (0.08 + 0.01 * k), 0.255 + 0.02 * math.sin(a), 0.322 + 0.03 * a)),
                 Vector((s * (0.13 + 0.015 * k), 0.24 + 0.04 * math.sin(a), 0.315 + 0.06 * a))]
            parts.append(tube(w, [0.0022, 0.0018, 0.0012], mat("cream", rough=0.6), sides=4, name="whisker"))
    # Squinty eyes: little dark slits under the hat brim.
    for s in (-1, 1):
        parts.append(place(box((0.032, 0.01, 0.008), (0, 0, 0), mat("soot", rough=0.4), bevel=0.003), (s * 0.055, 0.115, 0.38), (0, 0, s * 0.25)))
    # Feet, tucked under the belly.
    for s in (-1, 1):
        parts.append(place(sphere(0.05, (0, 0, 0), pink, scale=(0.9, 1.4, 0.45), segs=10, rings=6), (s * 0.09, 0.12, 0.02)))
    # Hard hat: a dome with a ridge, a brim and a lamp.
    dome = sphere(0.115, (0, 0, 0), hat, scale=(1.0, 1.1, 0.9), segs=18, rings=10)
    bm = bmesh.new()
    bm.from_mesh(dome.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.002], context="VERTS")
    bm.to_mesh(dome.data)
    bm.free()
    parts.append(place(dome, (0, 0.01, 0.405), (-0.15, 0, 0)))
    parts.append(place(cyl(0.13, 0.014, (0, 0, 0), hat, verts=20), (0, 0.025, 0.405), (-0.15, 0, 0)))
    parts.append(place(box((0.025, 0.2, 0.02), (0, 0, 0), hat, bevel=0.006), (0, 0.0, 0.485), (-0.15, 0, 0)))
    parts.append(place(cyl(0.03, 0.035, (0, 0, 0), mat("iron", metal=0.5), verts=10), (0, 0.115, 0.45), (-R90 - 0.15, 0, 0)))
    parts.append(place(cyl(0.024, 0.006, (0, 0, 0), mat("glass", rough=0.2, emit=3.0), verts=10), (0, 0.134, 0.453), (-R90 - 0.15, 0, 0)))
    o = join(parts, "Mole")
    bake(o)
    wobble(o, 0.002, 21)
    ao(o, 0.12, edge=0.4, top=0.15)
    # Spade hands: big flat palms with five long claws, held up in front.
    paws = []
    for s in (-1, 1):
        palm = sphere(0.075, (0, 0, 0), pink, scale=(1.0, 0.42, 0.85), segs=12, rings=8)
        place(palm, (s * 0.13, 0.17, 0.2), (0.35, 0, s * 0.45))
        paws.append(palm)
        arm = strut((s * 0.15, 0.06, 0.22), (s * 0.13, 0.15, 0.2), 0.04, fur, sides=8)
        paws.append(arm)
        for k in range(5):
            a = (k - 2) * 0.32
            base = Vector((s * 0.13 + math.sin(a) * 0.055 * s, 0.19, 0.2 + math.cos(a) * 0.055))
            tip = base + Vector((math.sin(a) * 0.03 * s, 0.075, math.cos(a) * 0.03 - 0.02))
            c = cyl(0.011, 1.0, (0, 0, 0), claw, verts=5, r2=0.002)
            c.data.transform(Matrix.Translation((0, 0, 0.5)))
            bake(c)
            d = tip - base
            q = Vector((0, 0, 1)).rotation_difference(d.normalized())
            m = q.to_matrix().to_4x4() @ Matrix.Scale(d.length, 4, (0, 0, 1))
            m.translation = base
            c.data.transform(m)
            paws.append(c)
    claws = join(paws, "Claws")
    bake(claws)
    ao(claws, 0.06, edge=0.4)
    attach(claws, o, (0, 0.1, 0.21))
    return o


def robomole():
    """The Robo-Mole: a little steam tunnelling engine. A riveted brass boiler
    lying along its length on two iron caterpillar tracks, a smokestack and a
    pressure dome on top, porthole lamps for eyes either side of a fat iron
    collar, and the business end: a fluted steel drill cone with two scoop
    claws, which nods as it digs (the "Claws" node). Faces +Y."""
    brass = mat("brass", metal=0.75, rough=0.35)
    iron = mat("iron", metal=0.6, rough=0.5)
    dark = mat("dark_steel", metal=0.5, rough=0.6)
    rubber = mat("rubber", rough=0.9)
    parts = []
    zc = 0.2
    # Boiler: a cylinder along Y with a domed back end.
    boiler = lathe([(0.0, -0.3), (0.06, -0.295), (0.115, -0.27), (0.148, -0.23), (0.158, -0.18), (0.16, 0.0),
                    (0.16, 0.12), (0.0, 0.12)], 22, "boiler", brass)
    place(boiler, (0, 0, zc), (-R90, 0, 0))
    parts.append(boiler)
    # Riveted seams round the boiler.
    for y in (-0.17, -0.04, 0.09):
        parts.append(place(torus(0.162, 0.009, (0, 0, 0), iron, (0, 0, 0), 22, 4), (0, y, zc), (R90, 0, 0)))
        for k in range(14):
            a = k / 14 * math.tau
            parts.append(sphere(0.0065, (math.cos(a) * 0.168, y + 0.016, zc + math.sin(a) * 0.168), brass, segs=6, rings=4))
    # Smokestack (flared, sooty at the top) and the pressure dome.
    parts.append(cyl(0.026, 0.16, (0, -0.16, zc + 0.22), iron, verts=10, r2=0.032))
    parts.append(cyl(0.05, 0.035, (0, -0.16, zc + 0.31), dark, verts=12, r2=0.034))
    parts.append(place(sphere(0.055, (0, 0, 0), brass, scale=(1, 1, 0.8), segs=14, rings=8), (0, 0.0, zc + 0.15)))
    parts.append(cyl(0.012, 0.04, (0, 0.0, zc + 0.21), iron, verts=8))
    # A gauge on one flank and a red valve wheel on the other.
    parts.append(place(cyl(0.034, 0.02, (0, 0, 0), brass, verts=14), (0.162, 0.05, zc + 0.04), (0, R90, 0)))
    parts.append(place(cyl(0.027, 0.006, (0, 0, 0), mat("cream", rough=0.4), verts=14), (0.174, 0.05, zc + 0.04), (0, R90, 0)))
    parts.append(place(torus(0.032, 0.006, (0, 0, 0), mat("red", rough=0.5), (0, 0, 0), 12, 4), (-0.175, -0.08, zc + 0.05), (0, R90, 0)))
    for k in range(3):
        a = k / 3 * math.pi
        parts.append(place(box((0.004, 0.06, 0.006), (0, 0, 0), mat("red", rough=0.5)), (-0.175, -0.08, zc + 0.05), (a, 0, 0)))
    # Front collar and porthole lamps for eyes.
    parts.append(place(cyl(0.13, 0.05, (0, 0, 0), iron, verts=18, bevel=0.01), (0, 0.14, zc), (-R90, 0, 0)))
    for sx in (-1, 1):
        parts.append(place(torus(0.03, 0.008, (0, 0, 0), iron, (0, 0, 0), 14, 4), (sx * 0.09, 0.115, zc + 0.12), (R90 - 0.3, 0, sx * 0.3)))
        parts.append(place(sphere(0.026, (0, 0, 0), mat("glass", rough=0.2, emit=3.0), scale=(1, 0.55, 1), segs=10, rings=6), (sx * 0.09, 0.118, zc + 0.12), (-0.3, 0, sx * 0.3)))
    # Tracks: a rounded block each side with road wheels and a ribbed tread.
    for sx in (-1, 1):
        x = sx * 0.165
        tread = box((0.07, 0.46, 0.11), (x, -0.05, 0.06), rubber, bevel=0.045, segs=3)
        parts.append(tread)
        for k in range(10):
            parts.append(box((0.074, 0.012, 0.012), (x, -0.25 + k * 0.045, 0.006), rubber))
        for k in range(4):
            parts.append(place(cyl(0.035, 0.02, (0, 0, 0), dark, verts=12), (x + sx * 0.038, -0.2 + k * 0.1, 0.06), (0, R90, 0)))
            parts.append(place(cyl(0.012, 0.024, (0, 0, 0), brass, verts=8), (x + sx * 0.04, -0.2 + k * 0.1, 0.06), (0, R90, 0)))
        parts.append(box((0.04, 0.4, 0.035), (sx * 0.12, -0.05, 0.11), iron, bevel=0.01))
    o = join(parts, "RoboMole")
    bake(o)
    wobble(o, 0.0012, 22)
    ao(o, 0.12, edge=0.6)
    smooth(o, 40)
    # The drill cone and the two scoops: the part that nods.
    steel = mat("bright_steel", metal=0.8, rough=0.3)
    nose = [place(cyl(0.11, 0.24, (0, 0, 0), steel, verts=14, r2=0.006), (0, 0.29, zc - 0.01), (-R90, 0, 0))]
    for k in range(2):
        fl = []
        for i in range(14):
            t = i / 13
            rr = 0.108 * (1.0 - t) + 0.006
            a = k * math.pi + t * 7.5
            fl.append(Vector((math.cos(a) * rr, 0.17 + t * 0.24, zc - 0.01 + math.sin(a) * rr)))
        nose.append(tube(fl, [0.014 * (1.0 - 0.7 * i / 13) for i in range(14)], iron, sides=5, name="flute"))
    for sx in (-1, 1):
        arm = [Vector((sx * 0.1, 0.12, zc - 0.07)), Vector((sx * 0.15, 0.2, zc - 0.11)), Vector((sx * 0.15, 0.28, zc - 0.15))]
        nose.append(tube(arm, [0.02, 0.018, 0.016], iron, sides=8, name="arm"))
        nose.append(place(box((0.09, 0.07, 0.022), (0, 0, 0), dark, bevel=0.012), (sx * 0.15, 0.31, zc - 0.16), (0.45, 0, sx * 0.15)))
        for k in range(3):
            nose.append(place(cyl(0.009, 0.05, (0, 0, 0), steel, verts=5, r2=0.0), (sx * 0.15 + (k - 1) * 0.026, 0.35, zc - 0.175), (-R90 + 0.6, 0, 0)))
    claws = join(nose, "Claws")
    bake(claws)
    smooth(claws, 35)
    ao(claws, 0.06)
    attach(claws, o, (0, 0.15, zc))
    return o


# --- Buildings ---------------------------------------------------------------------------------
def shack():
    rnd = random.Random(5)
    w, d, h = 6.0, 5.0, 3.2
    woods = [mat("wood", rough=0.85), mat("wood_dark", rough=0.85), mat("umber", rough=0.9)]
    parts = [box((w + 0.3, d + 0.3, 0.3), (0, 0, 0.15), mat("stone", rough=0.95), bevel=0.04)]
    parts.append(box((w - 0.1, d - 0.1, h), (0, 0, 0.3 + h / 2), mat("wood_dark", rough=0.9)))
    # Vertical boards, each a little different: width, lean, length.
    for side in range(4):
        length = w if side % 2 == 0 else d
        across = d if side % 2 == 0 else w
        n = int(length / 0.26)
        for i in range(n):
            t = -length / 2 + (i + 0.5) * length / n
            bw = length / n - 0.012
            bh = h + rnd.uniform(-0.06, 0.04)
            lean = rnd.uniform(-0.012, 0.012)
            if side == 0:
                loc, size = (t, -across / 2 - 0.01, 0.3 + bh / 2), (bw, 0.05, bh)
            elif side == 2:
                loc, size = (t, across / 2 + 0.01, 0.3 + bh / 2), (bw, 0.05, bh)
            elif side == 1:
                loc, size = (across / 2 + 0.01, t, 0.3 + bh / 2), (0.05, bw, bh)
            else:
                loc, size = (-across / 2 - 0.01, t, 0.3 + bh / 2), (0.05, bw, bh)
            # The door and windows are on the +x side: leave a gap for the door.
            if side == 1 and abs(t) < 0.65:
                continue
            b = box(size, loc, woods[rnd.randrange(3)], rot=(lean, lean, 0), bevel=0.008)
            parts.append(b)
    # Corner posts.
    for cx in (-1, 1):
        for cy in (-1, 1):
            parts.append(box((0.16, 0.16, h + 0.1), (cx * (w / 2 + 0.03), cy * (d / 2 + 0.03), 0.3 + h / 2), woods[1], bevel=0.02))
    # Door: planks with a Z brace and a brass knob.
    door = []
    for i in range(4):
        door.append(box((0.06, 0.29, 2.2), (w / 2 + 0.03, -0.45 + i * 0.3, 0.3 + 1.1), woods[i % 2], bevel=0.01))
    door.append(box((0.04, 1.1, 0.12), (w / 2 + 0.08, 0.0, 0.3 + 0.5), woods[2], bevel=0.01))
    door.append(box((0.04, 1.1, 0.12), (w / 2 + 0.08, 0.0, 0.3 + 1.8), woods[2], bevel=0.01))
    door.append(box((0.04, 0.12, 1.45), (w / 2 + 0.08, 0.0, 0.3 + 1.15), woods[2], rot=(0.75, 0, 0), bevel=0.01))
    door.append(sphere(0.045, (w / 2 + 0.12, 0.4, 0.3 + 1.1), mat("brass", metal=0.9, rough=0.3), segs=10, rings=6))
    parts += door
    parts.append(box((0.14, 1.45, 0.14), (w / 2 + 0.05, 0.0, 0.3 + 2.28), woods[1], bevel=0.02))
    # Windows: warm glass, frames, crossbars.
    glass = mat("glass", rough=0.2, emit=1.6)
    for wy in (-1.65, 1.65):
        parts.append(box((0.05, 0.85, 0.75), (w / 2 + 0.02, wy, 0.3 + 1.7), glass))
        parts.append(box((0.1, 1.0, 0.1), (w / 2 + 0.06, wy, 0.3 + 2.12), woods[1], bevel=0.015))
        parts.append(box((0.12, 1.05, 0.1), (w / 2 + 0.08, wy, 0.3 + 1.28), woods[1], bevel=0.015))
        parts.append(box((0.08, 0.05, 0.8), (w / 2 + 0.06, wy, 0.3 + 1.7), woods[1]))
        parts.append(box((0.08, 0.9, 0.05), (w / 2 + 0.06, wy, 0.3 + 1.7), woods[1]))
    # The sign board over the door (the lettering is added in the game).
    parts.append(box((0.08, 3.5, 0.66), (w / 2 + 0.1, 0.0, 0.3 + h - 0.12), mat("soot", rough=0.8), bevel=0.02))
    parts.append(box((0.06, 3.3, 0.5), (w / 2 + 0.13, 0.0, 0.3 + h - 0.12), mat("cream", rough=0.5), bevel=0.01))
    # Corrugated tin roof, sagging a little.
    for s in (-1, 1):
        roof = _corrugated(w + 0.9, 3.15, 0.035, 34)
        roof.data.materials.append(mat("tin", metal=0.6, rough=0.45))
        roof.rotation_euler = (-s * math.atan2(1.4, d / 2), 0, 0)
        roof.location = (0, s * d * 0.25, 0.3 + h + 0.72)
        bpy.context.view_layer.objects.active = roof
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)
        for v in roof.data.vertices:
            v.co.z -= 0.05 * math.sin(math.pi * (v.co.x / (w + 0.9) + 0.5))
        parts.append(roof)
    parts.append(box((w + 1.0, 0.25, 0.08), (0, 0, 0.3 + h + 1.44), mat("tin", metal=0.6, rough=0.45), bevel=0.02))
    for gx in (-1, 1):
        gable = bpy.data.meshes.new("gable")
        bm = bmesh.new()
        vs = [bm.verts.new((gx * w / 2, -d / 2, 0.3 + h)), bm.verts.new((gx * w / 2, d / 2, 0.3 + h)), bm.verts.new((gx * w / 2, 0, 0.3 + h + 1.4))]
        bm.faces.new(vs if gx > 0 else list(reversed(vs)))
        bm.to_mesh(gable)
        bm.free()
        go = bpy.data.objects.new("gable", gable)
        bpy.context.collection.objects.link(go)
        go.data.materials.append(woods[0])
        parts.append(go)
    # Stove pipe.
    parts.append(cyl(0.12, 1.4, (-1.5, 1.0, 0.3 + h + 1.3), mat("dark_steel", metal=0.7, rough=0.5), verts=10))
    parts.append(cyl(0.2, 0.08, (-1.5, 1.0, 0.3 + h + 2.02), mat("dark_steel", metal=0.7, rough=0.5), verts=10, r2=0.12))
    # Lantern by the door and a porch step.
    parts.append(box((0.18, 0.18, 0.26), (w / 2 + 0.25, 0.95, 2.75), mat("glass", rough=0.2, emit=3.0)))
    parts.append(box((0.22, 0.22, 0.04), (w / 2 + 0.25, 0.95, 2.9), mat("soot")))
    parts.append(box((0.9, 1.6, 0.12), (w / 2 + 0.5, 0, 0.12), woods[0], bevel=0.02))
    o = join(parts, "Shack")
    wobble(o, 0.006, 31)
    wear(o, 0.9, 0.1)
    return o


def _corrugated(width, depth, amp, waves):
    me = bpy.data.meshes.new("tin")
    bm = bmesh.new()
    nx = waves * 4
    rows = []
    for j in range(2):
        row = []
        for i in range(nx + 1):
            x = -width / 2 + width * i / nx
            z = amp * math.sin(i / 4 * math.tau)
            row.append(bm.verts.new((x, -depth / 2 + depth * j, z)))
        rows.append(row)
    for i in range(nx):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.012)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("tin", me)
    bpy.context.collection.objects.link(o)
    return o


def _corrugated(width, depth, amp, waves):
    me = bpy.data.meshes.new("tin")
    bm = bmesh.new()
    nx = waves * 4
    rows = []
    for j in range(2):
        row = []
        for i in range(nx + 1):
            x = -width / 2 + width * i / nx
            z = amp * math.sin(i / 4 * math.tau)
            row.append(bm.verts.new((x, -depth / 2 + depth * j, z)))
        rows.append(row)
    for i in range(nx):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.012)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("tin", me)
    bpy.context.collection.objects.link(o)
    return o


def headframe():
    """A timber headframe: four heavy squared posts, two back legs raked out
    behind to take the cable's pull, girts and X-braces, a big sheave wheel on
    top, the cable down to the cage, and the back cable to a winding drum."""
    timber = mat("wood_dark", rough=0.88)
    old = mat("wood_grey", rough=0.9)
    iron = mat("iron", metal=0.6, rough=0.5)
    red = mat("red", rough=0.55)
    cable = mat("dark_steel", metal=0.5, rough=0.5)
    rnd = random.Random(41)
    top = 6.9
    parts = []
    w0, w1 = 1.75, 1.2           # half-width at the foot and at the deck: a broad, squat tower
    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for (cx, cy) in corners:
        foot = Vector((cx * w0, cy * w0, 0.0))
        head = Vector((cx * w1, cy * w1, top))
        parts.append(strut(foot, head, 0.3, timber, name="post"))
        parts.append(box((0.85, 0.85, 0.36), (foot.x, foot.y, 0.14), mat("stone", rough=0.95), bevel=0.06))
    # Girts every couple of metres, X-braces between them on each face.
    levels = [0.6, 3.5, top - 0.2]
    def at(cx, cy, z):
        k = 1.0 - (w0 - w1) / w0 * z / top
        return Vector((cx * w0 * k, cy * w0 * k, z))
    for li, z in enumerate(levels):
        for i in range(4):
            a, b = corners[i], corners[(i + 1) % 4]
            if li == 0 and i == 3:
                continue          # the side you walk in by stays open at the bottom
            parts.append(strut(at(*a, z), at(*b, z), 0.21, old if li % 2 else timber, name="girt"))
    for li in range(len(levels) - 1):
        z0, z1 = levels[li], levels[li + 1]
        for i in range(4):
            if li == 0 and i == 3:
                continue
            a, b = corners[i], corners[(i + 1) % 4]
            if li == 1 and i % 2 == 1:
                continue          # the top tier is braced front and back only
            parts.append(strut(at(*a, z0 + 0.2), at(*b, z1 - 0.2), 0.14, old, name="brace"))
            if li == 0:
                parts.append(strut(at(*b, z0 + 0.2), at(*a, z1 - 0.2), 0.14, old, name="brace"))
    # Back legs, raked out behind (towards -y), with a tie halfway.
    for cx in (-1, 1):
        hd = at(cx, -1, top - 0.6)
        ft = Vector((cx * 2.0, -6.2, 0.0))
        parts.append(strut(ft, hd, 0.28, timber, name="backleg"))
        parts.append(box((0.8, 0.8, 0.34), (ft.x, ft.y, 0.14), mat("stone", rough=0.95), bevel=0.06))
        mid = ft.lerp(hd, 0.45)
        parts.append(strut(mid, at(cx, -1, mid.z), 0.17, old))
    parts.append(strut(Vector((-2.0, -6.2, 0.2)).lerp(at(-1, -1, top - 0.6), 0.45), Vector((2.0, -6.2, 0.2)).lerp(at(1, -1, top - 0.6), 0.45), 0.17, old))
    # The deck and the bearing blocks the sheave turns in.
    parts.append(box((2.9, 2.9, 0.22), (0, 0, top + 0.06), timber, bevel=0.04))
    for i in range(8):
        parts.append(box((3.0, 0.34, 0.06), (0, -1.2 + i * 0.34, top + 0.2), old if i % 2 else timber, rot=(0, 0, rnd.uniform(-0.02, 0.02)), bevel=0.012))
    for s in (-1, 1):
        parts.append(box((0.38, 0.9, 0.95), (s * 0.5, -1.3, top + 0.62), timber, bevel=0.04))
        parts.append(box((0.42, 0.34, 0.16), (s * 0.5, -1.3, top + 1.16), iron, bevel=0.02))
    # The cage cable: from the front of the sheave straight down to the cage.
    parts.append(cyl(0.028, top + 1.3 - 2.62, (0, 0, (top + 1.3 + 2.62) / 2), cable, verts=6))
    parts.append(place(cyl(0.05, 0.12, (0, 0, 0), iron, verts=8), (0, 0, 2.68)))
    # The back cable: from the top of the sheave down to the winding drum.
    drum_c = Vector((0, -9.5, 0.9))
    parts.append(strut(Vector((0, -2.9, top + 1.9)), drum_c + Vector((0, 0.3, 0.3)), 0.028, cable, sides=6))
    # Winding drum on a timber frame, with a brake lever.
    parts.append(place(cyl(0.45, 1.1, (0, 0, 0), timber, verts=18), tuple(drum_c), (0, R90, 0)))
    for s in (-1, 1):
        parts.append(place(cyl(0.58, 0.06, (0, 0, 0), iron, verts=18), tuple(drum_c + Vector((s * 0.58, 0, 0))), (0, R90, 0)))
        parts.append(box((0.18, 1.6, 0.18), (s * 0.78, drum_c.y, 0.12), timber, bevel=0.02))
        parts.append(strut(Vector((s * 0.78, drum_c.y - 0.6, 0.2)), Vector((s * 0.72, drum_c.y, drum_c.z)), 0.08, timber))
        parts.append(strut(Vector((s * 0.78, drum_c.y + 0.6, 0.2)), Vector((s * 0.72, drum_c.y, drum_c.z)), 0.08, timber))
    parts.append(strut(Vector((0.95, drum_c.y + 0.3, 0.3)), Vector((1.15, drum_c.y - 0.2, 1.7)), 0.03, iron, sides=6))
    parts.append(place(sphere(0.06, (0, 0, 0), red, segs=8, rings=6), (1.15, drum_c.y - 0.2, 1.75)))
    # A ladder up one side, to the deck.
    lx = w0 + 0.3
    lt = w1 + 0.3
    for sx in (-0.22, 0.22):
        parts.append(strut(Vector((lx, sx, 0.0)), Vector((lt, sx, top + 0.1)), 0.045, old, name="rail"))
    for k in range(int(top / 0.35)):
        z = 0.3 + k * 0.35
        x = lx + (lt - lx) * z / top
        parts.append(strut(Vector((x, -0.22, z)), Vector((x, 0.22, z)), 0.025, old, name="rung"))
    frame_o = join(parts, "Headframe")
    bake(frame_o)
    wobble(frame_o, 0.012, 41)
    ao(frame_o, 0.6, rays=10, edge=0.5)
    # The sheave: a big spoked wheel, painted signal red.
    R = 1.6
    wheel = [place(torus(R, 0.11, (0, 0, 0), red, (0, 0, 0), 40, 6), (0, 0, 0), (0, R90, 0))]
    wheel.append(place(torus(R - 0.1, 0.035, (0, 0, 0), red, (0, 0, 0), 32, 4), (0, 0, 0), (0, R90, 0)))
    wheel.append(place(cyl(0.16, 0.26, (0, 0, 0), iron, verts=14), (0, 0, 0), (0, R90, 0)))
    wheel.append(place(cyl(0.05, 1.2, (0, 0, 0), iron, verts=8), (0, 0, 0), (0, R90, 0)))
    for k in range(8):
        a = k / 8 * math.pi
        wheel.append(place(box((0.045, 2 * R - 0.15, 0.07), (0, 0, 0), red), (0, 0, 0), (a, 0, 0)))
    sheave = join(wheel, "Sheave")
    bake(sheave)
    ao(sheave, 0.3, rays=8)
    sheave.data.transform(Matrix.Translation((0, -1.3, top + 1.3)))
    attach(sheave, frame_o, (0, -1.3, top + 1.3))
    return frame_o


def cage():
    """The lift cage: an iron frame with brass corner caps, a plank floor,
    bars on three sides (open towards +y), a roof with the cable bail and a
    caged lamp."""
    iron = mat("iron", metal=0.6, rough=0.5)
    brass = mat("brass", metal=0.8, rough=0.35)
    plank = mat("wood", rough=0.85)
    plank2 = mat("wood_dark", rough=0.85)
    rnd = random.Random(42)
    parts = [box((1.92, 1.92, 0.1), (0, 0, 0.05), iron, bevel=0.02)]
    for i in range(7):
        parts.append(box((1.84, 0.25, 0.04), (0, -0.78 + i * 0.26, 0.12), plank if i % 2 else plank2, rot=(0, 0, rnd.uniform(-0.01, 0.01)), bevel=0.008))
    parts.append(box((2.0, 2.0, 0.1), (0, 0, 2.5), iron, bevel=0.02))
    for i in range(5):
        parts.append(box((1.9, 0.34, 0.03), (0, -0.7 + i * 0.35, 2.57), plank2, bevel=0.006))
    for cx in (-1, 1):
        for cy in (-1, 1):
            parts.append(box((0.09, 0.09, 2.5), (cx * 0.93, cy * 0.93, 1.25), iron, bevel=0.015))
            parts.append(box((0.12, 0.12, 0.08), (cx * 0.93, cy * 0.93, 2.6), brass, bevel=0.02))
    for side in range(3):
        for i in range(7):
            off = -0.78 + i * 0.26
            pos = [(off, -0.93), (-0.93, off), (0.93, off)][side]
            parts.append(cyl(0.014, 2.36, (pos[0], pos[1], 1.3), iron, verts=6))
        rail = [(0, -0.93), (-0.93, 0), (0.93, 0)][side]
        for z in (0.95, 1.9):
            size = (1.9, 0.07, 0.06) if side == 0 else (0.07, 1.9, 0.06)
            parts.append(box(size, (rail[0], rail[1], z), iron, bevel=0.01))
    # Bail and shackle for the cable.
    for s in (-1, 1):
        parts.append(strut((s * 0.9, 0, 2.55), (0, 0, 2.95), 0.03, iron, sides=6))
    parts.append(place(torus(0.06, 0.015, (0, 0, 0), brass, (0, 0, 0), 10, 4), (0, 0, 3.0), (R90, 0, 0)))
    # A caged lamp under the roof.
    parts.append(box((0.24, 0.24, 0.05), (0, 0.4, 2.42), mat("soot")))
    parts.append(place(sphere(0.07, (0, 0, 0), mat("glass", rough=0.2, emit=3.0), segs=10, rings=6), (0, 0.4, 2.33)))
    for k in range(4):
        a = k / 4 * math.tau
        parts.append(strut((0, 0.4, 2.42), (math.cos(a) * 0.08, 0.4 + math.sin(a) * 0.08, 2.25), 0.006, iron, sides=4))
    o = join(parts, "Cage")
    bake(o)
    wobble(o, 0.003, 42)
    ao(o, 0.35, rays=10)
    return o


def liftstop():
    """The bottom end of the lift: a timber post with a cross arm, a caged
    lantern, a brass bell and a blank enamel plate (lettering in the game)."""
    timber = mat("wood_dark", rough=0.88)
    old = mat("wood_grey", rough=0.9)
    iron = mat("iron", metal=0.5, rough=0.5)
    parts = [box((0.16, 0.16, 2.3), (0, 0, 1.15), timber, bevel=0.02)]
    parts.append(box((0.95, 0.12, 0.12), (0.32, 0, 2.18), timber, bevel=0.02))
    parts.append(strut((0.05, 0, 1.85), (0.45, 0, 2.12), 0.035, old))
    # Sole plate and wedges where it stands on the rock.
    parts.append(box((0.7, 0.24, 0.1), (0, 0, 0.05), old, bevel=0.02))
    parts.append(box((0.24, 0.7, 0.1), (0, 0, 0.05), timber, bevel=0.02))
    for s in (-1, 1):
        parts.append(place(box((0.2, 0.08, 0.12), (0, 0, 0), old, bevel=0.01), (s * 0.15, 0.0, 0.15), (0, s * 0.5, 0)))
    # Hanging lantern.
    parts.append(cyl(0.006, 0.18, (0.62, 0, 2.02), iron, verts=4))
    parts.append(box((0.16, 0.16, 0.22), (0.62, 0, 1.82), mat("glass", rough=0.2, emit=3.0), bevel=0.02))
    for cx in (-1, 1):
        for cy in (-1, 1):
            parts.append(box((0.02, 0.02, 0.27), (0.62 + cx * 0.085, cy * 0.085, 1.82), mat("soot")))
    parts.append(box((0.22, 0.22, 0.03), (0.62, 0, 1.96), mat("soot")))
    parts.append(cyl(0.12, 0.04, (0.62, 0, 1.69), mat("soot"), verts=8, r2=0.08))
    # Bell and the enamel plate.
    parts.append(cyl(0.085, 0.12, (-0.02, 0.13, 1.75), mat("brass", metal=0.85, rough=0.3), verts=12, r2=0.04))
    parts.append(box((0.03, 0.03, 0.08), (-0.02, 0.08, 1.85), iron))
    parts.append(box((0.03, 0.5, 0.3), (0.095, -0.0, 1.42), mat("soot", rough=0.6), bevel=0.012))
    parts.append(box((0.02, 0.46, 0.26), (0.105, -0.0, 1.42), mat("cream", rough=0.45), bevel=0.01))
    o = join(parts, "LiftStop")
    bake(o)
    wobble(o, 0.003, 43)
    ao(o, 0.25, rays=10)
    return o


def timber_post():
    """A weathered fence post: squared, chamfered top, an iron staple for the rope."""
    old = mat("wood_grey", rough=0.92)
    iron = mat("iron", metal=0.5, rough=0.6)
    parts = [box((0.13, 0.13, 1.15), (0, 0, 0.575), old, bevel=0.02)]
    cap = cyl(0.095, 0.08, (0, 0, 1.18), old, verts=4, r2=0.02)
    cap.rotation_euler = (0, 0, math.radians(45))
    parts.append(cap)
    parts.append(place(torus(0.035, 0.007, (0, 0, 0), iron, (0, 0, 0), 8, 4), (0, 0.07, 0.92), (0, R90, 0)))
    parts.append(box((0.135, 0.135, 0.06), (0, 0, 0.06), mat("wood_dark", rough=0.95), bevel=0.01))
    o = join(parts, "TimberPost")
    bake(o)
    for v in o.data.vertices:
        # Split and weathered: a little crooked, a crack down one face.
        v.co.x += 0.012 * math.sin(v.co.z * 3.1)
    wobble(o, 0.004, 61)
    ao(o, 0.15, rays=8)
    return o


def shaft_sign():
    """The enamel "Open shaft" sign on its own post (lettering in the game):
    a cream plate with a red border, chipped to the iron at the corners."""
    old = mat("wood_grey", rough=0.92)
    parts = [box((0.13, 0.13, 1.5), (0, 0, 0.75), old, bevel=0.02)]
    parts.append(box((0.9, 0.035, 0.52), (0.0, -0.09, 1.25), mat("soot", rough=0.6), bevel=0.015))
    parts.append(box((0.86, 0.02, 0.48), (0.0, -0.105, 1.25), mat("red", rough=0.4), bevel=0.01))
    parts.append(box((0.78, 0.02, 0.4), (0.0, -0.112, 1.25), mat("cream", rough=0.4), bevel=0.008))
    for (x, z) in [(-0.4, 1.47), (0.4, 1.47), (-0.4, 1.03), (0.4, 1.03)]:
        parts.append(place(sphere(0.014, (0, 0, 0), mat("brass", metal=0.8), segs=6, rings=4), (x, -0.12, z)))
    # Chips: bare iron showing through at two corners.
    parts.append(place(box((0.06, 0.01, 0.04), (0, 0, 0), mat("soot"), bevel=0.004), (0.36, -0.122, 1.44), (0, 0.3, 0)))
    parts.append(place(box((0.04, 0.01, 0.05), (0, 0, 0), mat("soot"), bevel=0.004), (-0.37, -0.122, 1.06), (0, -0.2, 0)))
    o = join(parts, "ShaftSign")
    bake(o)
    wobble(o, 0.002, 64)
    ao(o, 0.15, rays=8)
    return o


# --- Trees and props --------------------------------------------------------------------------------
def _bough(base, ang, length, width, droop, m, seed):
    """One pine bough: a flat, jagged, drooping blade of needles, thicker at
    the trunk, its tip bent down."""
    rnd = random.Random(seed)
    me = bpy.data.meshes.new("bough")
    bm = bmesh.new()
    d = Vector((math.cos(ang), math.sin(ang), 0.0))
    sd = Vector((-d.y, d.x, 0.0))
    steps = 6
    top, left, right, under = [], [], [], []
    for i in range(steps + 1):
        t = i / steps
        c = Vector(base) + d * (length * t) + Vector((0, 0, -droop * t * t))
        w = width * (1.0 - t) ** 0.8 * (1.0 + (0.35 if i % 2 else -0.1)) * rnd.uniform(0.85, 1.1)
        top.append(bm.verts.new(c + Vector((0, 0, 0.06 * (1 - t)))))
        left.append(bm.verts.new(c + sd * w - Vector((0, 0, 0.05 + 0.08 * t))))
        right.append(bm.verts.new(c - sd * w - Vector((0, 0, 0.05 + 0.08 * t))))
        under.append(bm.verts.new(c - Vector((0, 0, 0.09 * (1 - t) + 0.02))))
    for i in range(steps):
        bm.faces.new((top[i], left[i], left[i + 1], top[i + 1]))
        bm.faces.new((top[i], top[i + 1], right[i + 1], right[i]))
        bm.faces.new((under[i], under[i + 1], left[i + 1], left[i]))
        bm.faces.new((under[i], right[i], right[i + 1], under[i + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("bough", me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    return o


def pine():
    """A Scots-pine-ish conifer: a bare, slightly leaning trunk and whorls of
    separate drooping boughs, longer and darker low down, gaps between the
    whorls so the trunk shows, and a ragged leader at the top."""
    rnd = random.Random(7)
    bark = mat("bark", rough=0.9)
    needles = [mat("pine", rough=0.9), mat("leaf_dark", rough=0.9)]
    lean = Vector((0.12, 0.05, 0.0))
    H = 6.6
    trunk = [Vector((0, 0, 0)) + lean * (z / H) ** 2 * 1.0 + Vector((0, 0, z)) for z in (0.0, 1.5, 3.0, 4.5, 6.0, H)]
    parts = [tube(trunk, [0.17, 0.13, 0.1, 0.07, 0.045, 0.02], bark, sides=8, name="trunk")]
    whorls = 7
    for k in range(whorls):
        t = k / (whorls - 1)
        z = 1.6 + t * (H - 2.1)
        c = lean * (z / H) ** 2 + Vector((0, 0, z))
        n = 9 if k < 4 else 7
        length = 2.2 * (1.0 - t * 0.78) * rnd.uniform(0.9, 1.05)
        rot = rnd.uniform(0, math.tau)
        for i in range(n):
            a = rot + i / n * math.tau + rnd.uniform(-0.25, 0.25)
            L = length * rnd.uniform(0.75, 1.15)
            parts.append(_bough(c + Vector((0, 0, rnd.uniform(-0.15, 0.15))), a, L, 0.55 * (1.0 - t * 0.45), 0.5 * L * (1.0 - t * 0.4),
                                needles[1 if (k < 2 or rnd.random() < 0.25) else 0], k * 31 + i))
    # The leader: a short spike with two little sprigs.
    tip = lean + Vector((0, 0, H))
    parts.append(cyl(0.14, 0.9, tuple(tip + Vector((0, 0, 0.1))), needles[0], verts=6, r2=0.0))
    for a in (0.6, 3.4):
        parts.append(_bough(tip - Vector((0, 0, 0.25)), a, 0.45, 0.12, 0.1, needles[0], int(a * 10)))
    o = join(parts, "Pine")
    bake(o)
    wobble(o, 0.03, 51)
    ao(o, 0.9, rays=10, strength=0.8, top=0.25)
    return o


def oak():
    """A broad field oak: a short gnarled trunk forking into four crooked
    limbs, each carrying its own flat-bottomed, faceted clump of leaves with
    gaps between them (so limbs show through), smaller tufts breaking the
    outline, darker clumps underneath. Not a ball, not a cloud."""
    rnd = random.Random(8)
    bark = mat("bark", rough=0.9)
    leaf = mat("leaf", rough=0.9)
    leaf_dark = mat("leaf_dark", rough=0.9)
    parts = [tube([Vector((0, 0, 0)), Vector((0.05, 0.02, 0.8)), Vector((-0.04, 0.05, 1.5)), Vector((0.02, 0.0, 2.0))],
                  [0.3, 0.24, 0.22, 0.2], bark, sides=9, name="trunk")]
    ends = []
    for i, (a, rise, out) in enumerate(((0.3, 1.4, 1.6), (2.0, 1.7, 1.4), (3.6, 1.2, 1.7), (5.0, 1.9, 1.1))):
        d = Vector((math.cos(a), math.sin(a), 0))
        p0 = Vector((0, 0, 1.85))
        p1 = p0 + d * out * 0.45 + Vector((0, 0, rise * 0.55)) + Vector((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0))
        p2 = p0 + d * out + Vector((0, 0, rise))
        parts.append(tube([p0, p1, p2], [0.15, 0.1, 0.06], bark, sides=7, name="limb"))
        ends.append(p2)
    for i, e in enumerate(ends):
        r = rnd.uniform(1.0, 1.25)
        cl = lump(r, e + Vector((0, 0, 0.35)), leaf, i + 3, scale=(1.15, 1.15, 0.62), sub=1, rough=0.3, flat_bottom=-r * 0.32)
        parts.append(cl)
        # A darker underside layer, a little wider and lower.
        under = lump(r * 0.85, e + Vector((0, 0, 0.0)), leaf_dark, i + 13, scale=(1.25, 1.25, 0.45), sub=1, rough=0.25, flat_bottom=-r * 0.3)
        parts.append(under)
        # Tufts round the rim, breaking the outline.
        for k in range(3):
            a = k * 2.1 + i
            tp = e + Vector((math.cos(a) * r * 1.1, math.sin(a) * r * 1.1, rnd.uniform(0.0, 0.5)))
            parts.append(lump(rnd.uniform(0.35, 0.5), tp, leaf if k % 2 else leaf_dark, i * 7 + k + 30, scale=(1.1, 1.1, 0.7), sub=1, rough=0.3))
    # A crown clump in the middle, higher, so the top isn't flat.
    parts.append(lump(1.1, Vector((0.1, 0.1, 4.25)), leaf, 99, scale=(1.1, 1.1, 0.7), sub=1, rough=0.3, flat_bottom=-0.35))
    o = join(parts, "Oak")
    bake(o)
    wobble(o, 0.03, 52)
    ao(o, 1.2, rays=12, strength=0.85, top=0.25)
    return o


def barrel():
    """A bulging stave barrel: sixteen staves with seams, four iron hoops that
    follow the bulge, and a planked head."""
    woods = [mat("wood", rough=0.85), mat("wood_dark", rough=0.85)]
    iron = mat("iron", metal=0.5, rough=0.55)
    H, R0, R1 = 0.9, 0.29, 0.345
    def rad(z):
        t = (z / H) * 2 - 1
        return R0 + (R1 - R0) * (1 - t * t)
    parts = []
    n = 16
    for k in range(n):
        a0 = k / n * math.tau + 0.01
        a1 = (k + 1) / n * math.tau - 0.01
        me = bpy.data.meshes.new("stave")
        bm = bmesh.new()
        rows = []
        for j in range(9):
            z = H * j / 8
            r = rad(z)
            rows.append([bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)) for a in (a0, (a0 + a1) / 2, a1)]
                        + [bm.verts.new((math.cos(a) * (r - 0.025), math.sin(a) * (r - 0.025), z)) for a in (a1, a0)])
        for j in range(8):
            ra, rb = rows[j], rows[j + 1]
            for i in range(5):
                bm.faces.new((ra[i], ra[(i + 1) % 5], rb[(i + 1) % 5], rb[i]))
        bm.faces.new(list(reversed(rows[0])))
        bm.faces.new(rows[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new("stave", me)
        bpy.context.collection.objects.link(ob)
        ob.data.materials.append(woods[k % 2 if k % 5 else 1])
        parts.append(ob)
    for z in (0.07, 0.25, H - 0.25, H - 0.07):
        r = rad(z) + 0.006
        parts.append(place(lathe([(r, -0.025), (r + 0.008, -0.02), (r + 0.008, 0.02), (r, 0.025)], 32, "hoop", iron), (0, 0, z)))
    for i in range(5):
        parts.append(box((0.11, 0.56, 0.03), (-0.22 + i * 0.11, 0, H - 0.04), woods[i % 2], bevel=0.005))
    head = cyl(R0 - 0.01, 0.02, (0, 0, H - 0.045), woods[1], verts=24)
    parts.append(head)
    o = join(parts, "Barrel")
    bake(o)
    # Trim the head planks to the round.
    for v in o.data.vertices:
        if v.co.z > H - 0.07:
            l = math.hypot(v.co.x, v.co.y)
            if l > R0 - 0.012:
                v.co.x *= (R0 - 0.012) / l
                v.co.y *= (R0 - 0.012) / l
    wobble(o, 0.003, 63)
    ao(o, 0.2, rays=10)
    return o


def crate():
    """A planked crate: boards with gaps, edge battens, a diagonal brace,
    nails, and a stencilled red band."""
    rnd = random.Random(62)
    woods = [mat("wood", rough=0.85), mat("wood_grey", rough=0.88)]
    dark = mat("wood_dark", rough=0.88)
    S, Hh = 0.8, 0.7
    parts = [box((S - 0.06, S - 0.06, Hh - 0.06), (0, 0, Hh / 2), mat("soot", rough=0.9))]
    for face in range(4):
        rot = face * R90
        for i in range(4):
            z = 0.06 + i * (Hh - 0.04) / 4 + 0.08
            b = box((S - 0.02, 0.025, (Hh - 0.04) / 4 - 0.02), (0, -S / 2 + 0.012, z), woods[(i + face) % 2], rot=(0, 0, 0), bevel=0.005)
            b.rotation_euler = (rnd.uniform(-0.012, 0.012), 0, rnd.uniform(-0.01, 0.01))
            bake(b)
            b.data.transform(Matrix.Rotation(rot, 4, "Z"))
            parts.append(b)
        for x in (-1, 1):
            bt = box((0.08, 0.035, Hh), (x * (S / 2 - 0.04), -S / 2 - 0.005, Hh / 2), dark, bevel=0.008)
            bake(bt)
            bt.data.transform(Matrix.Rotation(rot, 4, "Z"))
            parts.append(bt)
        for z in (0.04, Hh - 0.04):
            bt = box((S, 0.035, 0.08), (0, -S / 2 - 0.005, z), dark, bevel=0.008)
            bake(bt)
            bt.data.transform(Matrix.Rotation(rot, 4, "Z"))
            parts.append(bt)
        if face % 2 == 0:
            br = strut((-S / 2 + 0.08, -S / 2 - 0.015, 0.1), (S / 2 - 0.08, -S / 2 - 0.015, Hh - 0.1), 0.028, dark)
            br.data.transform(Matrix.Rotation(rot, 4, "Z"))
            parts.append(br)
        else:
            band = box((0.42, 0.01, 0.1), (0, -S / 2 - 0.016, Hh * 0.55), mat("red", rough=0.6))
            bake(band)
            band.data.transform(Matrix.Rotation(rot, 4, "Z"))
            parts.append(band)
        for x in (-1, 1):
            for z in (0.04, Hh - 0.04):
                nl = place(sphere(0.008, (0, 0, 0), mat("iron", metal=0.5), segs=6, rings=4), (x * (S / 2 - 0.04), -S / 2 - 0.025, z))
                nl.data.transform(Matrix.Rotation(rot, 4, "Z"))
                parts.append(nl)
    for i in range(4):
        parts.append(box((S - 0.02, S / 4 - 0.02, 0.025), (0, -S / 2 + S / 8 + i * S / 4, Hh + 0.01), woods[i % 2], bevel=0.005))
    o = join(parts, "Crate")
    bake(o)
    wobble(o, 0.003, 62)
    ao(o, 0.2, rays=10)
    return o


def spoil_heap():
    """The pile of dirt by the dig site: a lumpy mound with stones in it."""
    dirt = mat("umber", rough=0.95)
    parts = [lump(1.0, Vector((0, 0, -0.1)), dirt, 9, scale=(2.0, 1.6, 1.25), sub=3, rough=0.22, flat_bottom=-0.05)]
    parts.append(lump(0.7, Vector((1.5, 0.7, -0.1)), mat("wood_dark", rough=0.95), 10, scale=(1.4, 1.2, 0.9), sub=2, rough=0.25, flat_bottom=-0.05))
    rnd = random.Random(9)
    for i in range(14):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(0.4, 2.4)
        x, y = math.cos(a) * r, math.sin(a) * r * 0.75
        z = max(0.0, 1.1 * (1 - (r / 2.2) ** 2)) - 0.05
        parts.append(lump(rnd.uniform(0.08, 0.2), Vector((x, y, z)), mat("stone", rough=0.9), i + 30, sub=1, rough=0.3))
    o = join(parts, "SpoilHeap")
    bake(o)
    ao(o, 0.6, rays=10, top=0.2)
    return o


def grass_tuft():
    """A clump of grass blades leaning out, for scattering on the field."""
    rnd = random.Random(11)
    mats_ = [mat("leaf", rough=0.9), mat("leaf_dark", rough=0.9)]
    parts = []
    for i in range(9):
        a = i / 9 * math.tau + rnd.uniform(-0.3, 0.3)
        h = rnd.uniform(0.16, 0.3)
        lean = rnd.uniform(0.04, 0.12)
        me = bpy.data.meshes.new("blade")
        bm = bmesh.new()
        w = 0.016
        base = Vector((math.cos(a) * 0.03, math.sin(a) * 0.03, 0))
        side = Vector((-math.sin(a), math.cos(a), 0)) * w
        out = Vector((math.cos(a), math.sin(a), 0))
        v0 = bm.verts.new(base - side)
        v1 = bm.verts.new(base + side)
        v2 = bm.verts.new(base + out * lean * 0.5 + side * 0.6 + Vector((0, 0, h * 0.55)))
        v3 = bm.verts.new(base + out * lean * 0.5 - side * 0.6 + Vector((0, 0, h * 0.55)))
        v4 = bm.verts.new(base + out * lean + Vector((0, 0, h)))
        bm.faces.new((v0, v1, v2, v3))
        bm.faces.new((v3, v2, v4))
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new("blade", me)
        bpy.context.collection.objects.link(ob)
        ob.data.materials.append(mats_[i % 2])
        parts.append(ob)
    o = join(parts, "GrassTuft")
    bake(o)
    me = o.data
    if "Col" not in me.color_attributes:
        me.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
    col = me.color_attributes["Col"]
    for poly in me.polygons:
        for li in poly.loop_indices:
            z = me.vertices[me.loops[li].vertex_index].co.z
            s = 0.45 + 0.55 * min(1.0, z / 0.25)
            col.data[li].color = (s, s, s, 1.0)
    return o


def timber_set():
    """One set of shaft timbering for the lift shaft: a square frame of heavy
    timbers with lagging boards behind (seen from inside the shaft)."""
    timber = mat("wood_dark", rough=0.9)
    old = mat("wood_grey", rough=0.9)
    rnd = random.Random(70)
    parts = []
    h = 1.45
    for i in range(4):
        rot = i * R90
        b = box((2 * h + 0.3, 0.24, 0.24), (0, h, 0), timber, bevel=0.02)
        bake(b)
        b.data.transform(Matrix.Rotation(rot, 4, "Z"))
        parts.append(b)
        for k in range(6):
            lg = box((0.4, 0.04, 1.4), (-h + 0.2 + k * 0.5 + rnd.uniform(-0.03, 0.03), h + 0.16, -0.75), old if k % 2 else timber, rot=(rnd.uniform(-0.02, 0.02), 0, 0), bevel=0.008)
            bake(lg)
            lg.data.transform(Matrix.Rotation(rot, 4, "Z"))
            parts.append(lg)
    o = join(parts, "TimberSet")
    bake(o)
    wobble(o, 0.008, 71)
    ao(o, 0.4, rays=8)
    return o


MODELS_LIST = [("mole", mole), ("robomole", robomole), ("shack", shack), ("headframe", headframe), ("cage", cage),
               ("liftstop", liftstop), ("pine", pine), ("oak", oak), ("timber_post", timber_post), ("shaft_sign", shaft_sign),
               ("crate", crate), ("barrel", barrel), ("spoil_heap", spoil_heap), ("grass_tuft", grass_tuft), ("timber_set", timber_set)]

if __name__ == "__main__":
    only = sys.argv[1:]
    for name, fn in MODELS_LIST:
        if only and name not in only:
            continue
        reset()
        o = fn()
        export([o], name)
