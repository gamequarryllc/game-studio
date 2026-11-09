"""The pumps, the pump pad, the barge and the salvage crate.
    python3 art/blender/pumps.py [names...]
Each pump's front (Blender +Y) faces the water; its hose leaves from there.
Moving parts are their own child objects with the names the game animates:
Buckets (bobs), Lever (rocks about X), Flywheel (spins about X), Valve
(turns about Z), Rotor (spins about Z).
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import (PAL, ao, attach, bar, box, cyl, export, from_profile, join, lathe, mat, mix, paint,  # noqa: E402
                 reset, smooth, sphere, strut, torus, tube, wobble, wear)
from mathutils import Vector  # noqa: E402


def finish(o, seed=1, wob=0.004, ao_dist=0.35, strength=0.6):
    wobble(o, wob, seed)
    smooth(o, 38)
    ao(o, ao_dist, rays=12, strength=strength, seed=seed, edge=0.7)
    return o


def bucket(loc, r=0.17, h=0.3, tilt=(0, 0, 0), seed=1):
    """A staved wooden bucket with two iron hoops and a rope handle."""
    prof = [(0.0, 0.0), (r * 0.82, 0.0), (r * 0.86, 0.02), (r, h), (r * 0.9, h), (r * 0.78, 0.05), (0.0, 0.05)]
    b = lathe(prof, 14, "bucket", mat("wood", rough=0.85))
    parts = [b]
    for z in (h * 0.22, h * 0.78):
        rr = r * 0.82 + (r - r * 0.82) * (z / h)
        parts.append(torus(rr + 0.008, 0.009, (0, 0, z), mat("iron", metal=0.5, rough=0.6), maj=16, mi=4))
    parts.append(tube([Vector((-r, 0, h)), Vector((0, 0, h + r * 0.9)), Vector((r, 0, h))], [0.01, 0.01, 0.01], mat("rope", rough=0.95), sides=5))
    o = join(parts, "bucket")
    o.rotation_euler = tilt
    o.location = loc
    return o


def pump_bucket():
    reset()
    wood = mat("wood_grey", rough=0.9)
    parts = []
    # A-frame: two splayed legs each side and a ridge beam.
    for sx in (-0.75, 0.75):
        parts.append(strut((sx, -0.55, 0.0), (sx * 0.85, 0.0, 1.75), 0.055, wood))
        parts.append(strut((sx, 0.55, 0.0), (sx * 0.85, 0.0, 1.75), 0.055, wood))
        parts.append(strut((sx, -0.45, 0.45), (sx, 0.45, 0.45), 0.035, wood))
    parts.append(strut((-0.8, 0.0, 1.78), (0.8, 0.0, 1.78), 0.06, wood))
    # pulley block
    parts.append(box((0.12, 0.14, 0.22), (0.0, 0.0, 1.62), mat("wood_dark"), bevel=0.02))
    parts.append(cyl(0.1, 0.05, (0.0, 0.0, 1.6), mat("iron", metal=0.5, rough=0.5), rot=(0, math.pi / 2, 0), verts=14))
    # buckets waiting on the ground: a cluster of four, one on its side
    parts.append(bucket((0.45, 0.42, 0.0), seed=2))
    parts.append(bucket((0.7, 0.18, 0.0), r=0.15, h=0.27, seed=3))
    parts.append(bucket((-0.55, 0.5, 0.12), tilt=(math.radians(85), 0, math.radians(30)), seed=4))
    parts.append(bucket((-0.62, -0.35, 0.0), r=0.16, seed=5))
    # a half barrel trough at the back, where the water's tipped
    tr = lathe([(0.0, 0.0), (0.42, 0.0), (0.47, 0.32), (0.43, 0.32), (0.38, 0.04), (0.0, 0.04)], 16, "trough", mat("wood", rough=0.85))
    tr.location = (0.1, -0.75, 0.0)
    parts.append(tr)
    parts.append(torus(0.46, 0.012, (0.1, -0.75, 0.24), mat("iron", metal=0.5)))
    body = join(parts, "PumpBucket")
    finish(body, 11)
    # the hanging bucket on its rope (bobs)
    hang = join([bucket((0.0, 0.0, 0.62), r=0.16, h=0.28, seed=6),
                 strut((0.0, 0.0, 1.55), (0.0, 0.0, 0.92), 0.012, mat("rope", rough=0.95), sides=5)], "Buckets")
    finish(hang, 12, ao_dist=0.2)
    attach(hang, body, (0.0, 0.0, 1.55))
    export([body], "pump_bucket")


def pump_hand():
    reset()
    iron = mat("iron", metal=0.55, rough=0.55)
    parts = []
    parts.append(box((0.9, 0.9, 0.35), (0, 0, 0.175), mat("stone"), bevel=0.06))
    col = lathe([(0.0, 0.35), (0.2, 0.35), (0.2, 0.42), (0.14, 0.48), (0.12, 1.2), (0.16, 1.26), (0.16, 1.34), (0.1, 1.42), (0.0, 1.48)], 12, "column", iron)
    parts.append(col)
    # fluting rings
    for z in (0.62, 0.9):
        parts.append(torus(0.128, 0.014, (0, 0, z), iron, maj=14, mi=4))
    # spout to the back, over a trough
    parts.append(tube([Vector((0, -0.08, 1.12)), Vector((0, -0.3, 1.1)), Vector((0, -0.42, 0.98))], [0.05, 0.045, 0.04], iron, sides=8))
    tr = box((0.5, 0.36, 0.24), (0, -0.62, 0.12), mat("wood_grey", rough=0.9), bevel=0.02)
    parts.append(tr)
    parts.append(box((0.44, 0.3, 0.02), (0, -0.62, 0.22), mat("glass", rough=0.1)))
    body = join(parts, "PumpHand")
    finish(body, 21)
    # the lever: a pivot at the top, the arm running forward to a wooden grip
    lev = join([strut((0, -0.12, 1.38), (0, 0.95, 1.5), 0.03, iron, sides=6),
                cyl(0.04, 0.32, (0, 1.02, 1.5), mat("wood", rough=0.7), rot=(0, math.pi / 2, 0), verts=8),
                cyl(0.035, 0.12, (0, 0.0, 1.4), iron, rot=(0, math.pi / 2, 0), verts=10)], "Lever")
    finish(lev, 22, ao_dist=0.15)
    attach(lev, body, (0, 0.0, 1.4))
    export([body], "pump_hand")


def pump_diesel():
    reset()
    teal = mat("paint_teal", rough=0.6)
    iron = mat("iron", metal=0.5, rough=0.55)
    parts = []
    for x in (-0.55, 0.55):
        parts.append(box((0.18, 2.0, 0.16), (x, 0, 0.08), mat("wood_dark", rough=0.9), bevel=0.02))
    blk = box((0.9, 1.2, 0.7), (0, -0.1, 0.52), teal, bevel=0.06, segs=2)
    parts.append(blk)
    for i in range(2):
        parts.append(box((0.62, 0.36, 0.26), (0, -0.4 + i * 0.5, 1.0), teal, bevel=0.04))
        parts.append(box((0.66, 0.4, 0.05), (0, -0.4 + i * 0.5, 1.15), iron, bevel=0.01))
    # exhaust stack with a rain cap
    parts.append(cyl(0.07, 1.3, (0.25, -0.55, 1.65), iron, verts=10))
    parts.append(cyl(0.16, 0.12, (0.25, -0.55, 2.32), iron, r2=0.02, verts=10))
    # fuel drum, red, beside it
    dr = cyl(0.26, 0.82, (-0.62, -0.75, 0.41 + 0.16), mat("paint_red", rough=0.65), verts=16, bevel=0.02)
    parts.append(dr)
    for z in (0.35, 0.82):
        parts.append(torus(0.265, 0.015, (-0.62, -0.75, z), mat("paint_red", rough=0.65), maj=16, mi=4))
    # pump housing at the front, the intake pipe dropping to the beach
    parts.append(cyl(0.28, 0.4, (0, 0.72, 0.5), iron, rot=(math.pi / 2, 0, 0), verts=14, bevel=0.03))
    parts.append(tube([Vector((0, 0.9, 0.5)), Vector((0, 1.15, 0.45)), Vector((0, 1.3, 0.2))], [0.11, 0.11, 0.1], iron, sides=10))
    parts.append(tube([Vector((0.1, 0.6, 0.8)), Vector((0.3, 0.0, 1.2)), Vector((0.25, -0.55, 1.05))], [0.04, 0.04, 0.04], iron, sides=6))
    body = join(parts, "PumpDiesel")
    wobble(body, 0.003, 31)
    smooth(body, 35)
    ao(body, 0.4, rays=12, strength=0.6, seed=31, edge=0.8)
    # rust streaks and oil down low
    paint(body, lambda co, n: mix((1, 1, 1), (0.75, 0.55, 0.42), max(0.0, min(1.0, (0.45 - co.z) * 1.6)) * (0.5 + 0.5 * math.sin(co.x * 23 + co.y * 17))))
    fw = join([torus(0.36, 0.05, (0, 0, 0), iron, rot=(0, math.pi / 2, 0), maj=20, mi=6)] +
              [strut((0, 0, 0), (0, math.cos(a) * 0.34, math.sin(a) * 0.34), 0.025, iron, sides=4) for a in [k * math.tau / 6 for k in range(6)]] +
              [cyl(0.07, 0.14, (0, 0, 0), iron, rot=(0, math.pi / 2, 0), verts=10)], "Flywheel")
    fw.location = (0.6, -0.15, 0.62)
    finish(fw, 32, ao_dist=0.15)
    attach(fw, body, (0.6, -0.15, 0.62))
    export([body], "pump_diesel")


def pump_siphon():
    reset()
    pipe = mat("rusty", metal=0.3, rough=0.7)
    wood = mat("wood_grey", rough=0.9)
    parts = []
    pts = []
    for i in range(15):
        a = math.pi * i / 14
        pts.append(Vector((0.0, math.cos(a) * 1.7 + 0.2, 0.2 + math.sin(a) * 3.3)))
    parts.append(tube(pts, [0.36] * len(pts), pipe, sides=14, cap=False))
    for i in range(1, 14, 3):
        p = pts[i]
        d = (pts[i + 1] - pts[i - 1]).normalized()
        o = torus(0.4, 0.06, p, mat("iron", metal=0.5, rough=0.5), maj=18, mi=5)
        o.rotation_mode = "QUATERNION"
        o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
        parts.append(o)
    # the mouth at the front, bell-shaped, into the sand
    bell = lathe([(0.36, 0.0), (0.5, -0.3), (0.62, -0.42), (0.56, -0.44), (0.32, -0.05)], 16, "bell", pipe)
    bell.location = (0, 1.9, 0.45)
    parts.append(bell)
    # timber trestle under the crown
    for sx in (-0.7, 0.7):
        parts.append(strut((sx, 0.6, 0.0), (sx * 0.4, 0.2, 3.3), 0.08, wood))
        parts.append(strut((sx, -0.2, 0.0), (sx * 0.4, 0.2, 3.3), 0.08, wood))
        parts.append(strut((sx * 0.9, 0.5, 1.2), (sx * 0.9, -0.1, 1.2), 0.05, wood))
    parts.append(strut((-0.35, 0.2, 3.3), (0.35, 0.2, 3.3), 0.08, wood))
    # a ladder up the side
    for z in [0.3 + 0.35 * k for k in range(8)]:
        parts.append(strut((0.55, -0.55, z), (0.85, -0.55, z), 0.025, wood))
    parts.append(strut((0.55, -0.55, 0.0), (0.55, -0.55, 3.0), 0.035, wood))
    parts.append(strut((0.85, -0.55, 0.0), (0.85, -0.55, 3.0), 0.035, wood))
    body = join(parts, "PumpSiphon")
    wobble(body, 0.006, 41)
    smooth(body, 40)
    ao(body, 0.6, rays=12, strength=0.6, seed=41, edge=0.7)
    paint(body, lambda co, n: mix((1, 1, 1), (0.78, 0.6, 0.5), max(0.0, n.z * -0.6) + 0.15 * (0.5 + 0.5 * math.sin(co.z * 9 + co.y * 4))))
    vl = join([torus(0.3, 0.035, (0, 0, 0), mat("paint_red", rough=0.5), maj=18, mi=5)] +
              [strut((0, 0, 0), (math.cos(a) * 0.29, math.sin(a) * 0.29, 0), 0.02, mat("paint_red"), sides=4) for a in [k * math.tau / 5 for k in range(5)]] +
              [cyl(0.05, 0.3, (0, 0, -0.15), mat("iron", metal=0.5), verts=8)], "Valve")
    vl.location = (0, 0.2, 3.95)
    finish(vl, 42, ao_dist=0.1)
    attach(vl, body, (0, 0.2, 3.95))
    export([body], "pump_siphon")


def pump_whirlpool():
    reset()
    copper = mat("copper", metal=0.7, rough=0.4)
    brass = mat("brass", metal=0.75, rough=0.35)
    verd = mat("verdigris", rough=0.6)
    parts = []
    drum = lathe([(0.0, 0.0), (1.05, 0.0), (1.1, 0.15), (0.92, 0.3), (0.86, 1.6), (0.95, 1.7), (0.7, 2.05), (0.3, 2.25), (0.0, 2.28)], 24, "drum", copper)
    parts.append(drum)
    for z in (0.5, 1.0, 1.5):
        parts.append(torus(0.88, 0.04, (0, 0, z), brass, maj=28, mi=5))
    # portholes round the drum
    for a in (0.6, 2.2, 3.8, 5.2):
        p = (math.cos(a) * 0.87, math.sin(a) * 0.87, 1.05)
        rim = torus(0.17, 0.035, p, brass, maj=16, mi=4)
        rim.rotation_mode = "QUATERNION"
        rim.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((math.cos(a), math.sin(a), 0)))
        parts.append(rim)
        g = sphere(0.15, p, mat("glass", rough=0.08, emit=0.6), scale=(1, 1, 1), segs=10, rings=6)
        parts.append(g)
    # a pressure gauge and pipes
    parts.append(tube([Vector((0, 0.8, 0.5)), Vector((0, 1.3, 0.45)), Vector((0, 1.6, 0.2))], [0.16, 0.16, 0.15], copper, sides=12))
    parts.append(cyl(0.14, 0.06, (0.55, 0.7, 1.45), brass, rot=(math.pi / 2.2, 0, 0.6), verts=16))
    for a in (0.0, 1.57, 3.14, 4.71):
        parts.append(strut((math.cos(a) * 1.0, math.sin(a) * 1.0, 0.0), (math.cos(a) * 0.86, math.sin(a) * 0.86, 0.35), 0.06, verd))
    body = join(parts, "PumpWhirlpool")
    wobble(body, 0.004, 51)
    smooth(body, 40)
    ao(body, 0.5, rays=12, strength=0.55, seed=51, edge=0.7)
    paint(body, lambda co, n: mix((1, 1, 1), (0.62, 0.85, 0.78), max(0.0, min(1.0, (0.4 - co.z) * 1.2)) * 0.7))
    vanes = []
    for k in range(5):
        a = k * math.tau / 5
        v = from_profile([(0.0, 0.0), (0.62, 0.05), (0.66, 0.22), (0.1, 0.3)], 0.04, brass, name="vane")
        v.rotation_euler = (0.35, 0, a)
        v.location = (0, 0, 0)
        vanes.append(v)
    vanes.append(cyl(0.12, 0.42, (0, 0, 0.15), brass, verts=12))
    vanes.append(sphere(0.13, (0, 0, 0.4), brass, segs=12, rings=8))
    rot = join(vanes, "Rotor")
    rot.location = (0, 0, 2.2)
    finish(rot, 52, ao_dist=0.15)
    attach(rot, body, (0, 0, 2.2))
    export([body], "pump_whirlpool")


def pad():
    reset()
    parts = []
    rnd = random.Random(7)
    for i in range(9):
        y = -1.4 + i * 0.35
        ln = 3.0 + rnd.uniform(-0.15, 0.2)
        parts.append(box((ln, 0.31, 0.07), (rnd.uniform(-0.08, 0.08), y, 0.31), mat("wood_grey" if i % 3 else "wood", rough=0.92), bevel=0.012))
    for x in (-1.3, 1.3):
        parts.append(box((0.16, 3.1, 0.14), (x, 0, 0.2), mat("wood_dark", rough=0.9), bevel=0.02))
    for (x, y) in [(-1.35, -1.4), (1.35, -1.4), (-1.35, 1.4), (1.35, 1.4)]:
        parts.append(cyl(0.09, 0.9, (x, y, 0.15), mat("wood_dark", rough=0.9), verts=8))
        parts.append(cyl(0.1, 0.04, (x, y, 0.6), mat("tar", rough=0.6), verts=8))
    # a coil of rope and a small painted number board
    parts.append(torus(0.22, 0.04, (1.0, -1.1, 0.39), mat("rope", rough=0.95), maj=16, mi=5))
    parts.append(torus(0.16, 0.04, (1.0, -1.1, 0.45), mat("rope", rough=0.95), maj=14, mi=5))
    parts.append(box((0.5, 0.05, 0.3), (-1.0, -1.48, 0.62), mat("paint_white", rough=0.8), bevel=0.01))
    parts.append(cyl(0.025, 0.5, (-1.0, -1.46, 0.35), mat("wood_dark"), verts=6))
    o = join(parts, "Pad")
    finish(o, 61, wob=0.006, ao_dist=0.3)
    export([o], "pad")


def barge():
    reset()
    parts = []
    hull = box((2.0, 3.2, 0.55), (0, 0, 0.0), mat("paint_teal", rough=0.7), bevel=0.14, segs=3)
    for v in hull.data.vertices:
        if v.co.y > 1.0:
            v.co.x *= 0.82 - (v.co.y - 1.0) * 0.35
            v.co.z += (v.co.y - 1.0) * 0.18
    parts.append(hull)
    parts.append(box((1.95, 3.1, 0.06), (0, -0.05, 0.12), mat("rusty", rough=0.8), bevel=0.02))
    for i in range(7):
        parts.append(box((1.6, 0.36, 0.05), (0, -1.2 + i * 0.38, 0.3), mat("wood_grey", rough=0.9), bevel=0.01))
    for (x, y) in [(-0.75, -1.35), (0.75, -1.35), (-0.6, 1.2), (0.6, 1.2)]:
        parts.append(cyl(0.07, 0.22, (x, y, 0.42), mat("iron", metal=0.5), verts=8))
    parts.append(torus(0.25, 0.05, (0.5, -0.9, 0.38), mat("rope", rough=0.95), maj=16, mi=5))
    parts.append(box((0.5, 0.5, 0.3), (0, 0.2, 0.47), mat("stone"), bevel=0.03))
    parts.append(lathe([(0.0, 0.6), (0.11, 0.6), (0.09, 1.3), (0.12, 1.35), (0.0, 1.42)], 10, "col", mat("iron", metal=0.55)))
    parts[-1].location = (0, 0.2, 0.0)
    parts.append(tube([Vector((0, 0.1, 1.15)), Vector((0, -0.25, 1.1)), Vector((0, -0.6, 0.6)), Vector((0, -1.2, 0.3)), Vector((0, -1.6, 0.05))], [0.06] * 5, mat("rubber"), sides=6))
    parts.append(cyl(0.02, 1.1, (-0.8, -1.3, 0.85), mat("wood_dark"), verts=6))
    flag = from_profile([(0.0, 0.0), (0.42, 0.1), (0.0, 0.22)], 0.01, mat("coral", rough=0.8), name="flag")
    flag.rotation_euler = (0, 0, math.radians(90))
    flag.location = (-0.8, -1.3, 1.25)
    parts.append(flag)
    o = join(parts, "Barge")
    finish(o, 71, ao_dist=0.35)
    lev = join([strut((0, 0.2, 1.33), (0, 0.95, 1.45), 0.025, mat("iron", metal=0.5), sides=6),
                cyl(0.035, 0.26, (0, 1.0, 1.45), mat("wood"), rot=(0, math.pi / 2, 0), verts=8)], "Lever")
    finish(lev, 72, ao_dist=0.1)
    attach(lev, o, (0, 0.2, 1.33))
    export([o], "barge")


def crate():
    reset()
    parts = [box((0.9, 0.7, 0.6), (0, 0, 0.3), mat("wood", rough=0.9), bevel=0.03)]
    for z in (0.12, 0.48):
        parts.append(box((0.94, 0.74, 0.08), (0, 0, z), mat("wood_dark", rough=0.9), bevel=0.01))
    parts.append(torus(0.36, 0.02, (0, 0, 0.3), mat("rope"), rot=(math.pi / 2, 0, 0), maj=16, mi=4))
    o = join(parts, "Crate")
    finish(o, 81, ao_dist=0.2)
    export([o], "crate")


ALL = {"pump_bucket": pump_bucket, "pump_hand": pump_hand, "pump_diesel": pump_diesel, "pump_siphon": pump_siphon,
       "pump_whirlpool": pump_whirlpool, "pad": pad, "barge": barge, "crate": crate}

if __name__ == "__main__":
    names = sys.argv[1:] or list(ALL)
    for n in names:
        ALL[n]()
