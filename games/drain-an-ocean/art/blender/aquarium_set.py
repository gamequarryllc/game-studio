"""The aquarium's tank, seen from the visitors' side: rockwork built up the
back and both ends with ledges and a cave, a sand floor sloping up to the
back, a few worn boulders and shells, and the pier's own timbers framing the
glass (posts, a deep lintel, knee braces, bolts, a rope, a brass plaque).
    python3 art/blender/aquarium_set.py

Exported as one model, origin at the middle of the tank's floor at the
glass, the tank running along X (14 m), back along Blender +Y (5 m), up +Z.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
import bmesh  # noqa: E402
from kit import (PAL, ao, box, cyl, export, join, lathe, lerp3, mat, mix, paint_mat, reset, smooth, sphere, strut,  # noqa: E402
                 torus, tube, vnoise3, wobble)
from mathutils import Vector  # noqa: E402

W, D, H = 14.0, 5.0, 6.2


def grid_surface(nx, ny, fn, m, name):
    """A height-field sheet: fn(u, v) -> Vector (u, v in 0..1)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [[bm.verts.new(fn(i / nx, j / ny)) for i in range(nx + 1)] for j in range(ny + 1)]
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    return o


def build():
    reset()
    rock = mat("tankrock", mix(mix("stone", "ink", 0.35), "teal", 0.12), rough=0.9)
    sand = mat("tanksand", mix("sand", "paper", 0.15), rough=0.95)
    wood = mat("piertimber", mix("wood_dark", "wood_grey", 0.35), rough=0.9)
    iron = mat("iron", metal=0.5, rough=0.6)
    brass = mat("brass", metal=0.75, rough=0.35)
    parts = []
    # the sand floor, rising to the back and heaped round the rocks
    def floor(u, v):
        x = -W / 2 + u * W
        y = v * D
        z = 0.15 + 0.85 * v ** 1.6 + 0.12 * math.sin(x * 0.9) * v + 0.08 * vnoise3(x * 0.8, y * 0.8, 0)
        return Vector((x, y, z))
    parts.append(grid_surface(56, 20, floor, sand, "floor"))
    # the rockwork: a back wall of piled, ledged rock, higher at the ends
    def back(u, v):
        x = -W / 2 + u * W
        z = v * (H + 0.4)
        end = abs(u - 0.5) * 2.0
        bulge = 0.6 * vnoise3(x * 0.6, z * 0.6, 1.0) + 0.35 * vnoise3(x * 1.7, z * 1.7, 2.0)
        ledge = 0.35 * max(0.0, math.sin(z * 1.9 + x * 0.3)) ** 3
        y = D - bulge - ledge - 0.6 * end ** 2 * (1.0 - v * 0.5)
        return Vector((x, y, z))
    parts.append(grid_surface(60, 26, back, rock, "back"))
    # (the ends are built up in the game from the bay's own stones)
    # boulders and an arch: the cave where the deep things hide
    rnd = random.Random(5)
    for (x, y, r, sq) in ((-4.8, 2.6, 1.3, 0.75), (-3.2, 3.6, 1.0, 0.8), (3.6, 2.4, 1.15, 0.7), (5.2, 3.3, 1.4, 0.9), (0.6, 4.1, 0.9, 0.7),
                          (-1.4, 1.4, 0.55, 0.6), (2.0, 1.2, 0.45, 0.55), (-5.9, 1.2, 0.7, 0.8)):
        b = sphere(r, (x, y, 0.2 + r * 0.35), rock, scale=(1.25, 1.0, sq), segs=12, rings=8)
        for v in b.data.vertices:
            v.co += v.normal * 0.22 * vnoise3(v.co.x * 1.4 + x, v.co.y * 1.4, v.co.z * 1.4) * r
        parts.append(b)
    arch = [Vector((2.3, 3.9, 0.3)), Vector((2.6, 3.7, 1.6)), Vector((3.5, 3.6, 2.3)), Vector((4.5, 3.7, 1.7)), Vector((4.8, 3.9, 0.3))]
    parts.append(tube(arch, [0.55, 0.6, 0.65, 0.6, 0.6], rock, sides=10))
    cave = sphere(1.0, (3.55, 4.6, 0.9), mat("cave", mix("ink", "teal", 0.3), rough=0.9), scale=(0.95, 0.4, 0.9), segs=12, rings=8)
    parts.append(cave)
    # a crevice for the moray, low on the left
    parts.append(sphere(0.5, (-4.6, 3.05, 0.75), mat("cave"), scale=(0.7, 0.3, 0.45), segs=10, rings=6))
    # shells strewn in threes on the sand
    shell = mat("shell", mix("paper", "coral", 0.25), rough=0.5)
    for k in range(9):
        x = rnd.uniform(-5.5, 5.5)
        y = rnd.uniform(0.6, 2.4)
        s = lathe([(0.0, 0.0), (0.12, 0.0), (0.1, 0.05), (0.0, 0.07)], 8, "shell", shell, loc=(x, y, 0.22 + 0.85 * (y / D) ** 1.6))
        parts.append(s)
    tank = join(parts, "Tank")
    smooth(tank, 45)
    ao(tank, 1.2, rays=10, strength=0.65, seed=7, edge=0.5, top=0.15)

    def marks(co, n, mn):
        if mn == "tankrock":
            v = vnoise3(co.x * 1.2, co.y * 1.2, co.z * 1.2)
            c = lerp3((1, 1, 1), mix("kelp_light", "sand", 0.3), 0.35 * max(0.0, n.z) + 0.15 * v)
            if n.z > 0.5 and vnoise3(co.x * 3, co.y * 3, co.z * 3) > 0.62:
                c = lerp3(c, mix("coral", "sand", 0.4), 0.45)       # encrusting coral on the ledges
            return c
        if mn == "tanksand":
            return lerp3((1, 1, 1), (0.85, 0.82, 0.74), 0.4 * vnoise3(co.x * 2, co.y * 2, 0))
        return (1, 1, 1)
    paint_mat(tank, marks)
    # the pier's timbers framing the glass
    frame = []
    post_w = 0.7
    for sx in (-1, 1):
        frame.append(box((post_w, 0.7, H + 1.6), (sx * (W / 2 + post_w / 2), -0.35, (H + 1.6) / 2 - 0.8), wood, bevel=0.06))
        frame.append(strut((sx * (W / 2 + 0.1), -0.55, H - 0.6), (sx * (W / 2 - 1.4), -0.55, H + 0.55), 0.18, wood))
        for z in (0.6, 2.4, 4.2):
            frame.append(sphere(0.07, (sx * (W / 2 + post_w / 2), -0.72, z), iron, segs=6, rings=4))
    frame.append(box((W + post_w * 2 + 0.6, 0.8, 1.1), (0, -0.4, H + 0.4), wood, bevel=0.06))
    frame.append(box((W + post_w * 2 + 0.6, 0.8, 0.9), (0, -0.4, -0.35), wood, bevel=0.06))
    for x in (-5.0, -1.6, 1.6, 5.0):
        frame.append(sphere(0.08, (x, -0.82, H + 0.4), iron, segs=6, rings=4))
    rope = [Vector((-W / 2 - 0.3, -0.85, H + 1.0)), Vector((-3.0, -0.95, H + 0.6)), Vector((0.0, -0.95, H + 0.75)), Vector((3.0, -0.95, H + 0.6)),
            Vector((W / 2 + 0.3, -0.85, H + 1.0))]
    frame.append(tube(rope, [0.07] * 5, mat("rope", rough=0.95), sides=6))
    frame.append(box((2.2, 0.08, 0.5), (0, -0.84, -0.35), brass, bevel=0.02))
    fr = join(frame, "Frame")
    smooth(fr, 35)
    ao(fr, 0.8, rays=8, strength=0.5, seed=8, edge=0.8)
    paint_mat(fr, lambda co, n, mn: lerp3((1, 1, 1), (0.78, 0.74, 0.66), 0.3 * vnoise3(co.x * 2, co.y * 2, co.z * 2)) if mn == "piertimber" else (1, 1, 1))
    export([tank, fr], "aquarium_set")


if __name__ == "__main__":
    build()
