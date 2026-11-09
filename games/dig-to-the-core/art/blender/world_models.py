"""Helpers, buildings and props for Dig to the Core.
Run: python3 art/blender/world_models.py

Shape language: chunky and a little top-heavy, bevelled, nothing perfectly
straight (boards lean, roofs sag). Creatures face +Y (Godot's forward).
Nodes that animate are named: "Claws" (helpers), "Sheave" (the lift wheel)."""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from kit import (box, cyl, sphere, torus, join, wear, wobble, export, reset, mat, taper, subdivide, bar, attach)  # noqa: E402

R90 = math.radians(90)


# --- Helpers ---------------------------------------------------------------------------------
def _mole_body(m, robo=False):
    body = sphere(0.2, (0, 0, 0.17), m, scale=(1.0, 1.35, 0.85), segs=18, rings=12, name="body")
    # Plump at the back, narrowing to the snout.
    for v in body.data.vertices:
        t = v.co.y / 0.27
        k = 1.0 - 0.18 * max(0.0, t)
        v.co.x *= k
        v.co.z = 0.17 + (v.co.z - 0.17) * (k if t > 0 else 1.0 + 0.06 * -t)
    snout = cyl(0.075, 0.13, (0, 0.3, 0.17), m, (-R90, 0, 0), 12, r2=0.04)
    return [body, snout]


def mole():
    fur = mat("fur", rough=0.95)
    pink = mat("pink", rough=0.7)
    parts = _mole_body(fur)
    parts.append(sphere(0.04, (0, 0.375, 0.17), pink, scale=(1.0, 0.7, 0.85), segs=12, rings=8))
    for k in range(10):
        a = k / 10 * math.tau
        parts.append(cyl(0.008, 0.03, (math.cos(a) * 0.035, 0.392, 0.17 + math.sin(a) * 0.03), pink, (-R90, 0, 0), 5, r2=0.002))
    for s in (-1, 1):
        parts.append(sphere(0.012, (s * 0.07, 0.26, 0.24), mat("soot", rough=0.3), segs=8, rings=6))
    parts.append(cyl(0.02, 0.06, (0, -0.27, 0.14), fur, (R90, 0, 0), 6, r2=0.004))
    for s in (-1, 1):
        parts.append(sphere(0.045, (s * 0.1, -0.15, 0.04), pink, scale=(1.0, 1.3, 0.5), segs=10, rings=6))
    # Hard hat with a brim and a lamp.
    hat = sphere(0.13, (0, 0.13, 0.28), mat("yellow", rough=0.45), scale=(1.0, 1.1, 0.75), segs=16, rings=8)
    bm = bmesh.new()
    bm.from_mesh(hat.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.0], context="VERTS")
    bm.to_mesh(hat.data)
    bm.free()
    parts.append(hat)
    parts.append(cyl(0.155, 0.014, (0, 0.14, 0.28), mat("yellow", rough=0.45), (0, 0, 0), 18))
    parts.append(cyl(0.028, 0.03, (0, 0.27, 0.33), mat("soot", rough=0.6), (-R90, 0, 0), 10))
    parts.append(cyl(0.022, 0.006, (0, 0.287, 0.33), mat("glass", rough=0.2, emit=3.0), (-R90, 0, 0), 10))
    body = join(parts, "Mole")
    wobble(body, 0.003, 21)
    wear(body, 0.8, 0.2)
    # Big digging paws, their own node.
    paws = []
    for s in (-1, 1):
        paws.append(sphere(0.07, (s * 0.15, 0.06, 0.0), pink, scale=(1.0, 0.8, 0.45), segs=12, rings=8))
        for k in range(5):
            x = s * 0.15 + (k - 2) * 0.022
            paws.append(cyl(0.01, 0.06, (x, 0.12, -0.01), mat("cream", rough=0.5), (-R90 + 0.3, 0, 0), 5, r2=0.001))
    claws = join(paws, "Claws")
    wear(claws, 0.6)
    bpy.context.view_layer.objects.active = claws
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    attach(claws, body, (0, 0.08, 0.06))
    return body


def robomole():
    steel = mat("steel", metal=0.85, rough=0.4)
    dark = mat("dark_steel", metal=0.8, rough=0.45)
    parts = _mole_body(steel, True)
    # Rivets in rings and a seam.
    for ring in range(3):
        y = -0.15 + ring * 0.13
        for k in range(10):
            a = k / 10 * math.tau
            parts.append(sphere(0.008, (math.cos(a) * 0.19 * (1.0 - 0.1 * ring), y, 0.17 + math.sin(a) * 0.16), dark, segs=6, rings=4))
    drill = cyl(0.045, 0.16, (0, 0.44, 0.17), mat("brass", metal=0.9, rough=0.3), (-R90, 0, 0), 8, r2=0.0)
    parts.append(drill)
    for s in (-1, 1):
        parts.append(sphere(0.022, (s * 0.075, 0.26, 0.25), mat("laser", rough=0.2, emit=3.0), segs=10, rings=6))
    parts.append(box((0.42, 0.34, 0.07), (0, -0.02, 0.03), dark, bevel=0.02))
    for s in (-1, 1):
        for k in range(5):
            parts.append(cyl(0.035, 0.05, (s * 0.2, -0.15 + k * 0.075, 0.03), mat("rubber", rough=0.9), (0, R90, 0), 8))
    parts.append(cyl(0.01, 0.12, (0.06, -0.12, 0.38), dark, (0.3, 0, 0), 6))
    parts.append(sphere(0.018, (0.06, -0.14, 0.44), mat("amber", rough=0.3, emit=2.0), segs=8, rings=6))
    body = join(parts, "RoboMole")
    wobble(body, 0.002, 22)
    wear(body, 1.0)
    paws = []
    for s in (-1, 1):
        paws.append(box((0.1, 0.09, 0.03), (s * 0.15, 0.08, 0.0), dark, bevel=0.01))
        for k in range(3):
            paws.append(cyl(0.012, 0.06, (s * 0.15 + (k - 1) * 0.03, 0.15, -0.005), mat("steel", metal=0.9, rough=0.3), (-R90, 0, 0), 4, r2=0.0))
    claws = join(paws, "Claws")
    wear(claws, 0.8)
    bpy.context.view_layer.objects.active = claws
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    attach(claws, body, (0, 0.08, 0.06))
    return body


# --- Buildings -------------------------------------------------------------------------------
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


def headframe():
    timber = mat("wood_dark", rough=0.85)
    iron = mat("dark_steel", metal=0.7, rough=0.5)
    red = mat("red", rough=0.6)
    top, w = 9.0, 1.9
    parts = []
    feet = [(-w, -w), (w, -w), (w, w), (-w, w)]
    for (x, y) in feet:
        leg = bar(4, 0.15, 1.0, 1, (0, 0, 0), timber, name="leg")
        foot = (x, y, 0.0)
        head = (x * 0.26, y * 0.26, top)
        import mathutils
        dv = mathutils.Vector(head) - mathutils.Vector(foot)
        leg.scale = (1.0, dv.length, 1.0)
        leg.rotation_mode = "QUATERNION"
        leg.rotation_quaternion = mathutils.Vector((0, 1, 0)).rotation_difference(dv.normalized())
        leg.location = foot
        bpy.context.view_layer.objects.active = leg
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        parts.append(leg)
        parts.append(box((0.5, 0.5, 0.25), (x, y, 0.12), mat("stone", rough=0.95), bevel=0.03))
    # X bracing on each side at two heights.
    import mathutils
    for (z0, z1) in [(0.4, 4.4), (4.4, 8.2)]:
        for side in range(4):
            a = feet[side]
            b = feet[(side + 1) % 4]
            k0 = 1.0 - 0.74 * z0 / top
            k1 = 1.0 - 0.74 * z1 / top
            p0 = mathutils.Vector((a[0] * k0, a[1] * k0, z0))
            p1 = mathutils.Vector((b[0] * k1, b[1] * k1, z1))
            q0 = mathutils.Vector((b[0] * k0, b[1] * k0, z0))
            q1 = mathutils.Vector((a[0] * k1, a[1] * k1, z1))
            for (s, e) in [(p0, p1), (q0, q1), (p1, q1)]:
                br = bar(4, 0.06, 1.0, 1, (0, 0, 0), timber, name="brace")
                dv = e - s
                br.scale = (1.0, dv.length, 1.0)
                br.rotation_mode = "QUATERNION"
                br.rotation_quaternion = mathutils.Vector((0, 1, 0)).rotation_difference(dv.normalized())
                br.location = s
                bpy.context.view_layer.objects.active = br
                bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
                parts.append(br)
    parts.append(box((1.6, 1.6, 0.14), (0, 0, top), timber, bevel=0.02))
    parts.append(box((1.5, 0.22, 0.22), (0, 0, top + 0.18), iron, bevel=0.02))
    parts.append(cyl(0.025, top - 2.6, (0, 0, 2.6 + (top - 2.6) / 2), iron, verts=6))
    frame = join(parts, "Headframe")
    wobble(frame, 0.01, 41)
    wear(frame, 1.0)
    wheel = [torus(0.8, 0.07, (0, 0, 0), red, (0, R90, 0), 24, 6)]
    wheel.append(cyl(0.12, 0.2, (0, 0, 0), iron, (0, R90, 0), 12))
    for k in range(6):
        a = k / 6 * math.pi
        wheel.append(box((0.05, 1.5, 0.06), (0, 0, 0), red, rot=(a, 0, 0)))
    sheave = join(wheel, "Sheave")
    wear(sheave, 0.8)
    for v in sheave.data.vertices:
        v.co.z += top + 0.45
    bpy.context.view_layer.objects.active = sheave
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    attach(sheave, frame, (0, 0, top + 0.45))
    return frame


def cage():
    yellow = mat("yellow", rough=0.55)
    bars_m = mat("dark_steel", metal=0.75, rough=0.45)
    parts = [box((1.9, 1.9, 0.12), (0, 0, 0.06), mat("dark_steel", metal=0.6, rough=0.6), bevel=0.02)]
    # Treadplate bumps.
    for i in range(7):
        for j in range(7):
            parts.append(box((0.12, 0.03, 0.012), (-0.75 + i * 0.25, -0.75 + j * 0.25, 0.125), bars_m, rot=(0, 0, 0.8 if (i + j) % 2 else -0.8)))
    parts.append(box((2.0, 2.0, 0.12), (0, 0, 2.5), yellow, bevel=0.02))
    for cx in (-1, 1):
        for cy in (-1, 1):
            parts.append(box((0.1, 0.1, 2.5), (cx * 0.93, cy * 0.93, 1.25), yellow, bevel=0.015))
    # Bars on three sides; the side facing +y (towards the shack) is open.
    for side in range(3):
        for i in range(6):
            off = -0.75 + i * 0.3
            ang = [0.0, R90, -R90][side]
            pos = [(off, -0.93), (-0.93, off), (0.93, off)][side]
            parts.append(cyl(0.018, 2.4, (pos[0], pos[1], 1.25), bars_m, verts=6))
        rail = [(0, -0.93), (-0.93, 0), (0.93, 0)][side]
        size = (1.9, 0.08, 0.08) if side == 0 else (0.08, 1.9, 0.08)
        parts.append(box(size, (rail[0], rail[1], 1.05), yellow, bevel=0.01))
    parts.append(box((0.3, 0.3, 0.06), (0, 0, 2.43), mat("soot")))
    parts.append(sphere(0.08, (0, 0, 2.36), mat("glass", rough=0.2, emit=3.0), segs=10, rings=6))
    o = join(parts, "Cage")
    wobble(o, 0.004, 42)
    wear(o, 1.0)
    return o


def liftstop():
    timber = mat("wood_dark", rough=0.85)
    parts = [box((0.16, 0.16, 2.3), (0, 0, 1.15), timber, bevel=0.02)]
    parts.append(box((0.95, 0.12, 0.12), (0.32, 0, 2.18), timber, bevel=0.02))
    parts.append(box((0.4, 0.06, 0.06), (0.2, 0, 1.95), timber, rot=(0, 0.8, 0)))
    # Hazard base plate: yellow and black stripes.
    for i in range(6):
        parts.append(box((0.7 / 6, 0.7, 0.05), (-0.35 + (i + 0.5) * 0.7 / 6, 0, 0.025), mat("yellow" if i % 2 == 0 else "soot", rough=0.7)))
    # Hanging lantern.
    parts.append(cyl(0.006, 0.18, (0.62, 0, 2.02), mat("dark_steel"), verts=4))
    parts.append(box((0.18, 0.18, 0.24), (0.62, 0, 1.82), mat("glass", rough=0.2, emit=3.0), bevel=0.02))
    for cx in (-1, 1):
        for cy in (-1, 1):
            parts.append(box((0.02, 0.02, 0.28), (0.62 + cx * 0.09, cy * 0.09, 1.82), mat("soot")))
    parts.append(box((0.22, 0.22, 0.03), (0.62, 0, 1.96), mat("soot")))
    # A signal bell and a cream enamel sign (lettering added in the game).
    parts.append(cyl(0.09, 0.12, (-0.02, 0.12, 1.75), mat("brass", metal=0.9, rough=0.3), verts=12, r2=0.04))
    parts.append(box((0.04, 0.5, 0.3), (0.0, -0.1, 1.45), mat("cream", rough=0.5), rot=(0, 0, 0), bevel=0.01))
    o = join(parts, "LiftStop")
    wobble(o, 0.003, 43)
    wear(o, 1.0)
    return o


# --- Props -----------------------------------------------------------------------------------------
def pine():
    rnd = random.Random(7)
    parts = [cyl(0.14, 1.4, (0, 0, 0.7), mat("wood_dark", rough=0.9), verts=7, r2=0.09)]
    for k in range(4):
        r = 1.45 - k * 0.32
        c = cyl(r, 1.5, (rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), 1.55 + k * 0.85), mat("pine", rough=0.9), verts=8, r2=0.05)
        c.rotation_euler = (rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), rnd.uniform(0, 1))
        parts.append(c)
    o = join(parts, "Pine")
    wobble(o, 0.06, 51)
    wear(o, 0.6, 0.25)
    return o


def oak():
    rnd = random.Random(8)
    parts = [cyl(0.17, 2.0, (0, 0, 1.0), mat("wood_dark", rough=0.9), verts=7, r2=0.11)]
    parts.append(cyl(0.06, 0.9, (0.25, 0, 1.8), mat("wood_dark", rough=0.9), (0, 0.7, 0), 5))
    for k in range(5):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=rnd.uniform(0.75, 1.05),
                                              location=(rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), 2.4 + rnd.uniform(0, 0.9)))
        s = bpy.context.active_object
        s.data.materials.append(mat("leaf", rough=0.9))
        parts.append(s)
    o = join(parts, "Oak")
    wobble(o, 0.07, 52)
    wear(o, 0.6, 0.3)
    return o


def fence_post():
    parts = [cyl(0.065, 1.0, (0, 0, 0.5), mat("yellow", rough=0.6), verts=8)]
    for z in (0.62, 0.86):
        parts.append(cyl(0.068, 0.1, (0, 0, z), mat("soot", rough=0.7), verts=8))
    parts.append(cyl(0.075, 0.05, (0, 0, 1.02), mat("soot", rough=0.7), verts=8, r2=0.03))
    o = join(parts, "FencePost")
    wobble(o, 0.003, 61)
    wear(o)
    return o


def crate():
    wood = mat("wood", rough=0.85)
    dark = mat("wood_dark", rough=0.85)
    parts = [box((0.8, 0.8, 0.7), (0, 0, 0.35), wood, bevel=0.01)]
    for (sx, sy) in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
        for z in (0.06, 0.64):
            size = (0.06, 0.84, 0.1) if sx else (0.84, 0.06, 0.1)
            parts.append(box(size, (sx * 0.41, sy * 0.41, z), dark, bevel=0.01))
        size = (0.06, 0.1, 0.62) if sx else (0.1, 0.06, 0.62)
        for t in (-0.36, 0.36):
            loc = (sx * 0.41, t, 0.35) if sx else (t, sy * 0.41, 0.35)
            parts.append(box(size, loc, dark, bevel=0.01))
    o = join(parts, "Crate")
    wobble(o, 0.004, 62)
    wear(o)
    return o


def barrel():
    b = cyl(0.33, 0.9, (0, 0, 0.45), mat("wood", rough=0.85), verts=14)
    subdivide(b, 3)
    for v in b.data.vertices:
        z = (v.co.z - 0.45) / 0.45
        k = 1.0 + 0.1 * (1.0 - z * z)
        v.co.x *= k
        v.co.y *= k
    parts = [b]
    for z in (0.12, 0.45, 0.78):
        zz = (z - 0.45) / 0.45
        parts.append(torus(0.33 * (1.0 + 0.1 * (1.0 - zz * zz)) + 0.005, 0.015, (0, 0, z), mat("dark_steel", metal=0.6, rough=0.5), (0, 0, 0), 16, 4))
    o = join(parts, "Barrel")
    wobble(o, 0.004, 63)
    wear(o)
    return o


if __name__ == "__main__":
    for name, fn in [("mole", mole), ("robomole", robomole), ("shack", shack), ("headframe", headframe), ("cage", cage),
                     ("liftstop", liftstop), ("pine", pine), ("oak", oak), ("fence_post", fence_post), ("crate", crate),
                     ("barrel", barrel)]:
        reset()
        o = fn()
        export([o], name)
