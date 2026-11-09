"""The twelve finds, each lying on the seabed until salvaged.
    python3 art/blender/finds.py [names...]
Sized to read from the diorama camera (a little larger than life), worn by
the sea: barnacles, verdigris, rust, a tilt.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import (PAL, ao, box, cyl, export, from_profile, join, lathe, mat, mix, paint, reset, smooth,  # noqa: E402
                 sphere, strut, torus, tube, wobble)
from mathutils import Vector  # noqa: E402


def barnacles(n, centre, radius, seed=1, z_min=0.0):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        a = rnd.uniform(0, math.tau)
        p = Vector((centre[0] + math.cos(a) * radius * rnd.uniform(0.5, 1.0), centre[1] + math.sin(a) * radius * rnd.uniform(0.5, 1.0), z_min + rnd.uniform(0, radius * 0.4)))
        out.append(cyl(rnd.uniform(0.02, 0.04), 0.03, p, mat("stone_pale", rough=0.9), r2=0.01, verts=6))
    return out


def done(parts, name, seed, dist=0.25, verd=0.0):
    o = join(parts, name)
    wobble(o, 0.004, seed)
    smooth(o, 40)
    ao(o, dist, rays=10, strength=0.6, seed=seed, edge=0.8)
    if verd > 0:
        paint(o, lambda co, n: mix((1, 1, 1), (0.7, 0.92, 0.85), verd * max(0.0, 0.5 + 0.5 * math.sin(co.x * 31 + co.y * 17 + co.z * 11))))
    export([o], name)


def find_bottle():
    reset()
    b = lathe([(0.0, 0.0), (0.11, 0.0), (0.12, 0.03), (0.12, 0.3), (0.07, 0.4), (0.035, 0.46), (0.035, 0.56), (0.045, 0.58), (0.0, 0.6)], 16, "bottle", mat("glass", rough=0.1))
    cork = cyl(0.034, 0.07, (0, 0, 0.6), mat("wood", rough=0.9), verts=10)
    note = cyl(0.04, 0.22, (0, 0, 0.17), mat("paper", rough=0.9), verts=10)
    parts = [b, cork, note]
    o = join(parts, "find_bottle")
    o.rotation_euler = (math.radians(88), 0, math.radians(20))
    done([o], "find_bottle", 101)


def find_anchor():
    reset()
    iron = mat("rusty", metal=0.3, rough=0.75)
    parts = [cyl(0.05, 1.3, (0, 0, 0.65), iron, verts=8)]
    parts.append(torus(0.12, 0.03, (0, 0, 1.38), iron, rot=(math.pi / 2, 0, 0), maj=14, mi=5))
    parts.append(strut((-0.38, 0, 1.12), (0.38, 0, 1.12), 0.04, iron, sides=6))
    arc = []
    for i in range(11):
        a = math.radians(-160 + i * 14)
        arc.append(Vector((math.cos(a) * 0.5, 0, 0.42 + math.sin(a) * 0.38)))
    parts.append(tube(arc, [0.05] * 11, iron, sides=8))
    for sx in (-1, 1):
        parts.append(from_profile([(0, 0), (0.18 * sx, 0.12), (0.05 * sx, 0.2)], 0.05, iron, loc=(sx * 0.46, 0, 0.3)))
    parts += barnacles(10, (0.0, 0.0), 0.4, 3, 0.1)
    o = join(parts, "anchor")
    o.rotation_euler = (math.radians(80), 0, math.radians(-25))
    o.location = (0, 0, 0.1)
    done([o], "find_anchor", 102, 0.35)


def find_figurehead():
    reset()
    wood = mat("wood", rough=0.8)
    parts = [sphere(0.18, (0, 0.1, 1.05), wood, scale=(0.85, 1.0, 1.1), segs=14, rings=10)]
    parts.append(tube([Vector((0, 0.0, 0.0)), Vector((0, 0.15, 0.4)), Vector((0, 0.2, 0.75)), Vector((0, 0.12, 0.95))], [0.2, 0.24, 0.2, 0.1], wood, sides=10))
    hair = tube([Vector((0, 0.05, 1.15)), Vector((0, -0.15, 1.05)), Vector((0, -0.25, 0.7)), Vector((0, -0.2, 0.4))], [0.12, 0.14, 0.12, 0.06], mat("paint_red", rough=0.7), sides=8)
    parts.append(hair)
    for sx in (-1, 1):
        parts.append(tube([Vector((sx * 0.18, 0.18, 0.75)), Vector((sx * 0.22, 0.32, 0.6)), Vector((sx * 0.1, 0.42, 0.55))], [0.05, 0.045, 0.04], wood, sides=6))
    parts.append(sphere(0.03, (0.06, 0.26, 1.08), mat("paint_white"), segs=6, rings=4))
    parts.append(sphere(0.03, (-0.06, 0.26, 1.08), mat("paint_white"), segs=6, rings=4))
    parts += barnacles(8, (0, 0), 0.2, 5, 0.0)
    o = join(parts, "fig")
    o.rotation_euler = (math.radians(-75), 0, math.radians(30))
    o.location = (0, 0, 0.25)
    done([o], "find_figurehead", 103, 0.3)


def find_helmet():
    reset()
    brass = mat("brass", metal=0.8, rough=0.35)
    parts = [sphere(0.3, (0, 0, 0.35), brass, segs=18, rings=12)]
    parts.append(lathe([(0.0, 0.0), (0.34, 0.0), (0.36, 0.06), (0.28, 0.12), (0.0, 0.12)], 18, "collar", brass))
    for a, r in ((0, 0.13), (1.6, 0.09), (-1.6, 0.09)):
        p = Vector((math.sin(a) * 0.29, -math.cos(a) * 0.29, 0.38))
        rim = torus(r, 0.025, p, mat("brass_light", metal=0.8, rough=0.3), maj=16, mi=4)
        rim.rotation_mode = "QUATERNION"
        rim.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(p - Vector((0, 0, 0.38)))
        parts.append(rim)
        parts.append(sphere(r * 0.9, p, mat("glass", rough=0.05), segs=10, rings=6))
    for k in range(12):
        a = k * math.tau / 12
        parts.append(sphere(0.022, (math.cos(a) * 0.32, math.sin(a) * 0.32, 0.08), mat("iron", metal=0.5), segs=6, rings=4))
    o = join(parts, "helmet")
    o.rotation_euler = (math.radians(15), math.radians(-10), 0)
    done([o], "find_helmet", 104, 0.2, verd=0.45)


def find_bell():
    reset()
    brass = mat("brass", metal=0.8, rough=0.4)
    b = lathe([(0.0, 0.62), (0.12, 0.62), (0.18, 0.55), (0.2, 0.35), (0.28, 0.1), (0.34, 0.02), (0.33, 0.0), (0.26, 0.02), (0.17, 0.3), (0.1, 0.55), (0.0, 0.56)], 20, "bell", brass)
    parts = [b, torus(0.06, 0.02, (0, 0, 0.68), brass, rot=(math.pi / 2, 0, 0), maj=10, mi=4)]
    parts.append(sphere(0.06, (0, 0, 0.08), mat("iron", metal=0.5), segs=8, rings=6))
    o = join(parts, "bell")
    o.rotation_euler = (math.radians(70), 0, math.radians(40))
    o.location = (0, 0, 0.3)
    done([o], "find_bell", 105, 0.25, verd=0.55)


def find_compass():
    reset()
    wood = mat("wood_dark", rough=0.7)
    brass = mat("brass", metal=0.8, rough=0.35)
    parts = [lathe([(0.0, 0.0), (0.22, 0.0), (0.24, 0.05), (0.18, 0.5), (0.25, 0.58), (0.25, 0.62), (0.0, 0.62)], 16, "post", wood)]
    parts.append(sphere(0.26, (0, 0, 0.78), brass, scale=(1, 1, 0.62), segs=18, rings=10))
    parts.append(cyl(0.2, 0.02, (0, 0, 0.92), mat("glass", rough=0.05), verts=18))
    for sx in (-1, 1):
        parts.append(sphere(0.08, (sx * 0.36, 0, 0.78), mat("paint_red" if sx > 0 else "paint_teal", rough=0.4), segs=10, rings=6))
    o = join(parts, "compass")
    o.rotation_euler = (math.radians(75), 0, math.radians(-10))
    o.location = (0, 0, 0.2)
    done([o], "find_compass", 106, 0.25, verd=0.3)


def find_lens():
    reset()
    brass = mat("brass", metal=0.8, rough=0.35)
    glass = mat("glass", rough=0.04, emit=0.35)
    parts = []
    for i in range(6):
        z = 0.08 + i * 0.13
        r = 0.42 - abs(i - 2.5) * 0.06
        parts.append(torus(r, 0.05, (0, 0, z), glass, maj=24, mi=6))
        parts.append(torus(r + 0.03, 0.012, (0, 0, z + 0.06), brass, maj=24, mi=4))
    for k in range(6):
        a = k * math.tau / 6
        parts.append(strut((math.cos(a) * 0.44, math.sin(a) * 0.44, 0.0), (math.cos(a) * 0.4, math.sin(a) * 0.4, 0.82), 0.025, brass, sides=4))
    parts.append(lathe([(0.0, 0.82), (0.42, 0.82), (0.2, 0.98), (0.0, 1.0)], 18, "cap", brass))
    o = join(parts, "lens")
    o.rotation_euler = (math.radians(25), 0, 0)
    done([o], "find_lens", 107, 0.3)


def find_chest():
    reset()
    wood = mat("wood_dark", rough=0.8)
    iron = mat("iron", metal=0.5, rough=0.6)
    parts = [box((0.8, 0.5, 0.42), (0, 0, 0.21), wood, bevel=0.03)]
    lid = cyl(0.25, 0.8, (0, 0, 0.42), wood, rot=(0, math.pi / 2, 0), verts=16)
    for v in lid.data.vertices:
        if v.co.z < 0.42:
            v.co.z = 0.42
    parts.append(lid)
    for x in (-0.3, 0.0, 0.3):
        parts.append(box((0.05, 0.52, 0.44), (x, 0, 0.22), iron, bevel=0.01))
        band = torus(0.255, 0.018, (x, 0, 0.42), iron, rot=(0, math.pi / 2, 0), maj=16, mi=4)
        parts.append(band)
    parts.append(box((0.12, 0.04, 0.14), (0, 0.27, 0.38), mat("brass", metal=0.8), bevel=0.01))
    rnd = random.Random(8)
    for _ in range(9):
        parts.append(cyl(0.05, 0.015, (rnd.uniform(-0.6, 0.6), rnd.uniform(0.32, 0.6), 0.01), mat("brass_light", metal=0.85, rough=0.3), verts=10))
    o = join(parts, "chest")
    o.rotation_euler = (0, math.radians(-8), 0)
    done([o], "find_chest", 108, 0.25)


def find_wheel():
    reset()
    wood = mat("wood", rough=0.75)
    parts = [torus(0.5, 0.05, (0, 0, 0), wood, maj=28, mi=6), cyl(0.12, 0.16, (0, 0, 0), mat("brass", metal=0.8), verts=14)]
    for k in range(8):
        a = k * math.tau / 8
        d = Vector((math.cos(a), math.sin(a), 0))
        parts.append(strut(d * 0.1, d * 0.5, 0.025, wood, sides=6))
        parts.append(lathe([(0.0, 0.0), (0.035, 0.0), (0.03, 0.08), (0.04, 0.14), (0.0, 0.18)], 8, "grip", wood, loc=tuple(d * 0.52)))
        g = parts[-1]
        g.rotation_mode = "QUATERNION"
        g.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    o = join(parts, "wheel")
    o.rotation_euler = (math.radians(12), 0, 0)
    o.location = (0, 0, 0.12)
    done([o], "find_wheel", 109, 0.2)


def find_cannon():
    reset()
    bronze = mat("brass", metal=0.75, rough=0.45)
    barrel = lathe([(0.0, -0.05), (0.2, -0.05), (0.22, 0.05), (0.19, 0.12), (0.17, 0.9), (0.19, 0.95), (0.15, 1.6), (0.18, 1.66), (0.18, 1.72), (0.09, 1.74), (0.09, 1.65), (0.0, 1.65)], 16, "barrel", bronze)
    barrel.rotation_euler = (math.radians(-90), 0, 0)
    barrel.location = (0, -0.8, 0.3)
    parts = [barrel, sphere(0.09, (0, -0.9, 0.3), bronze, segs=10, rings=6)]
    for sx in (-1, 1):
        parts.append(cyl(0.05, 0.12, (sx * 0.2, -0.3, 0.3), bronze, rot=(0, math.pi / 2, 0), verts=10))
    parts += barnacles(12, (0, 0), 0.35, 9, 0.2)
    o = join(parts, "cannon")
    o.rotation_euler = (0, math.radians(12), math.radians(20))
    done([o], "find_cannon", 110, 0.3, verd=0.6)


def find_statue():
    reset()
    stone = mat("stone_pale", rough=0.85)
    parts = [box((0.6, 0.6, 0.3), (0, 0, 0.15), mat("stone"), bevel=0.04)]
    parts.append(tube([Vector((0, 0, 0.3)), Vector((0, 0.05, 0.6)), Vector((0, 0.0, 0.95)), Vector((0, -0.05, 1.2))], [0.18, 0.2, 0.17, 0.12], stone, sides=10))
    parts.append(sphere(0.13, (0, 0.0, 1.35), stone, segs=12, rings=8))
    tail_pts = [Vector((0, 0, 0.32)), Vector((0.25, 0.1, 0.35)), Vector((0.4, 0.05, 0.5)), Vector((0.45, -0.05, 0.62))]
    parts.append(tube(tail_pts, [0.15, 0.12, 0.08, 0.04], stone, sides=8))
    parts.append(from_profile([(0, 0), (0.18, 0.12), (0.12, -0.05)], 0.03, stone, loc=(0.45, -0.05, 0.62)))
    for sx in (-1, 1):
        parts.append(tube([Vector((sx * 0.15, 0.0, 1.1)), Vector((sx * 0.25, 0.1, 1.25)), Vector((sx * 0.12, 0.15, 1.45))], [0.045, 0.04, 0.035], stone, sides=6))
    parts.append(sphere(0.07, (0, 0.12, 1.5), mat("shell", rough=0.5), scale=(1.4, 0.6, 1.0), segs=10, rings=6))
    o = join(parts, "statue")
    o.rotation_euler = (math.radians(70), 0, math.radians(-35))
    o.location = (0, 0, 0.25)
    done([o], "find_statue", 111, 0.3, verd=0.35)


def find_weathervane():
    reset()
    iron = mat("iron", metal=0.5, rough=0.6)
    copper = mat("copper", metal=0.7, rough=0.45)
    parts = [cyl(0.03, 1.2, (0, 0, 0.6), iron, verts=8)]
    parts.append(strut((-0.35, 0, 0.7), (0.35, 0, 0.7), 0.015, iron, sides=4))
    parts.append(strut((0, -0.35, 0.7), (0, 0.35, 0.7), 0.015, iron, sides=4))
    bird = from_profile([(-0.35, 0.0), (-0.1, 0.05), (0.05, 0.25), (0.15, 0.22), (0.2, 0.32), (0.28, 0.2), (0.2, 0.1), (0.3, -0.05), (0.1, -0.1),
                         (-0.15, -0.08), (-0.35, 0.15)], 0.08, copper, loc=(0, 0, 1.25), name="cock")
    bird.scale = (1.8, 1.8, 1.8)
    parts.append(bird)
    parts.append(sphere(0.06, (0, 0, 1.1), copper, segs=10, rings=6))
    o = join(parts, "vane")
    o.rotation_euler = (math.radians(78), 0, math.radians(60))
    o.location = (0, 0, 0.1)
    done([o], "find_weathervane", 112, 0.25, verd=0.7)


ALL = {k: v for k, v in globals().items() if k.startswith("find_") and callable(v)}

if __name__ == "__main__":
    names = sys.argv[1:] or list(ALL)
    for n in names:
        ALL[n]()
