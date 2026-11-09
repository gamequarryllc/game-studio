"""The seven digging tools, as held in first person. Origin at the hands,
pointing along +Y (Godot's forward). Run: python3 art/blender/tools.py

Shape language: chunky, slightly oversized working ends, bevelled hard edges,
worn paint. Parts that move in game are separate named nodes ("Bit")."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from kit import (PAL, box, cyl, sphere, torus, from_profile, join, wear, wobble, export, reset, mat,  # noqa: E402
                 taper, twist, bend, subdivide, bar, attach)

R90 = math.radians(90)


def shovel():
    wood = mat("wood", rough=0.8)
    steel = mat("steel", metal=0.85, rough=0.45)
    parts = [cyl(0.02, 0.92, (0, 0.14, 0), wood, (R90, 0, 0), 10)]
    # D-grip at the back.
    parts.append(cyl(0.017, 0.14, (0, -0.44, 0), wood, (0, R90, 0), 8))
    for s in (-1, 1):
        parts.append(cyl(0.014, 0.15, (s * 0.045, -0.375, 0), wood, (R90, 0, -s * 0.5), 8))
    parts.append(cyl(0.024, 0.06, (0, -0.31, 0), steel, (R90, 0, 0), 10))
    # Collar and the spade.
    collar = cyl(0.03, 0.16, (0, 0.66, -0.004), steel, (R90, 0, 0), 10, r2=0.022)
    parts.append(collar)
    outline = [(-0.125, 0.0), (-0.04, 0.0), (0.0, 0.02), (0.04, 0.0), (0.125, 0.0), (0.13, 0.19),
               (0.085, 0.28), (0.0, 0.33), (-0.085, 0.28), (-0.13, 0.19)]
    blade = from_profile(outline, 0.009, steel, loc=(0, 0.72, -0.01), rot=(R90 + 0.22, 0, 0), bevel=0.003, name="blade")
    subdivide(blade, 2)
    bend(blade, math.radians(-25), "Y")   # a little cupped
    parts.append(blade)
    o = join(parts, "Shovel")
    wobble(o, 0.0015, 11)
    wear(o)
    return o


def pickaxe():
    wood = mat("wood", rough=0.8)
    steel = mat("dark_steel", metal=0.8, rough=0.4)
    parts = [cyl(0.022, 0.8, (0, 0.1, 0), wood, (-R90, 0, 0), 10, r2=0.03)]
    parts.append(torus(0.026, 0.006, (0, -0.24, 0), mat("soot", rough=0.9), (R90, 0, 0), 12, 4))
    # The head, seen from the side: a curved pick on top, a chisel below.
    side = [(0.07, 0.34), (0.035, 0.2), (0.0, 0.07), (-0.04, 0.02), (-0.045, -0.06), (-0.03, -0.17),
            (0.0, -0.27), (0.075, -0.31), (0.05, -0.18), (0.045, -0.06), (0.05, 0.05), (0.07, 0.19)]
    head = from_profile(side, 0.046, steel, bevel=0.006, name="head")
    head.rotation_euler = (0, 0, R90)
    head.location = (0, 0.52, 0.0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)
    parts.append(head)
    parts.append(box((0.07, 0.08, 0.1), (0, 0.5, 0.0), steel, bevel=0.008))
    o = join(parts, "Pickaxe")
    wobble(o, 0.0015, 12)
    wear(o, 1.2)
    return o


def jackhammer():
    yellow = mat("yellow", rough=0.55)
    dark = mat("dark_steel", metal=0.7, rough=0.45)
    rubber = mat("rubber", rough=0.9)
    parts = [cyl(0.066, 0.34, (0, 0.02, 0), yellow, (R90, 0, 0), 16, bevel=0.01)]
    for i in range(4):
        parts.append(torus(0.068, 0.007, (0, -0.1 + i * 0.05, 0), dark, (R90, 0, 0), 16, 4))
    parts.append(cyl(0.066, 0.1, (0, 0.24, 0), dark, (-R90, 0, 0), 16, r2=0.034))
    parts.append(cyl(0.05, 0.05, (0, -0.17, 0), dark, (R90, 0, 0), 12))
    # T handle.
    parts.append(cyl(0.022, 0.12, (0, -0.24, 0), dark, (R90, 0, 0), 10))
    parts.append(cyl(0.019, 0.42, (0, -0.3, 0), dark, (0, R90, 0), 10))
    for s in (-1, 1):
        parts.append(cyl(0.027, 0.11, (s * 0.15, -0.3, 0), rubber, (0, R90, 0), 10, bevel=0.006))
    # Air fitting.
    parts.append(cyl(0.016, 0.06, (0.07, -0.1, 0.03), dark, (0, R90, 0), 8))
    parts.append(torus(0.02, 0.006, (0.1, -0.1, 0.03), mat("red", rough=0.6), (0, R90, 0), 10, 4))
    # Hex chisel.
    parts.append(cyl(0.017, 0.3, (0, 0.43, 0), mat("steel", metal=0.9, rough=0.35), (R90, 0, 0), 6))
    parts.append(cyl(0.017, 0.07, (0, 0.615, 0), mat("steel", metal=0.9, rough=0.35), (-R90, 0, 0), 6, r2=0.002))
    o = join(parts, "Jackhammer")
    wobble(o, 0.001, 13)
    wear(o, 1.1)
    return o


def drill():
    orange = mat("orange", rough=0.5)
    rubber = mat("rubber", rough=0.9)
    dark = mat("dark_steel", metal=0.7, rough=0.45)
    parts = [box((0.09, 0.24, 0.11), (0, 0.0, 0.0), orange, bevel=0.02, segs=3)]
    for i in range(4):
        for s in (-1, 1):
            parts.append(box((0.006, 0.05, 0.008), (s * 0.046, -0.07, 0.03 - i * 0.017), dark))
    grip = box((0.058, 0.07, 0.17), (0, -0.04, -0.11), rubber, rot=(math.radians(-18), 0, 0), bevel=0.015)
    parts.append(grip)
    parts.append(box((0.1, 0.14, 0.055), (0, -0.065, -0.205), dark, bevel=0.01))
    parts.append(box((0.102, 0.03, 0.012), (0, -0.065, -0.19), mat("amber", rough=0.5)))
    parts.append(box((0.016, 0.03, 0.035), (0, 0.025, -0.07), mat("red", rough=0.5), bevel=0.004))
    parts.append(cyl(0.034, 0.06, (0, 0.15, 0), dark, (R90, 0, 0), 14, bevel=0.005))
    parts.append(cyl(0.034, 0.04, (0, 0.2, 0), dark, (-R90, 0, 0), 14, r2=0.018))
    body = join(parts, "Drill")
    wobble(body, 0.001, 14)
    wear(body)
    # The spinning bit: a twisted bar with a point, its own node.
    bit = bar(4, 0.016, 0.3, 24, (0, 0, 0), mat("steel", metal=0.9, rough=0.3), name="bitbar")
    twist(bit, math.radians(900), "Y")
    tip = cyl(0.016, 0.05, (0, 0.325, 0), mat("steel", metal=0.9, rough=0.3), (-R90, 0, 0), 4, r2=0.0)
    b = join([bit, tip], "Bit")
    wear(b, 0.8)
    for v in b.data.vertices:
        v.co.y += 0.2
    attach(b, body, (0, 0.2, 0))
    return body


def dynamite():
    red = mat("red", rough=0.75)
    tape = mat("soot", rough=0.9)
    parts = []
    for i, (x, y) in enumerate([(-0.024, 0.0), (0.024, 0.0), (0.0, 0.04)]):
        parts.append(cyl(0.023, 0.21, (x, y, 0), red, (0, 0, 0), 12, bevel=0.004))
        parts.append(cyl(0.021, 0.004, (x, y, 0.106), mat("cream", rough=0.9), (0, 0, 0), 12))
    for z in (-0.05, 0.05):
        for (x, y) in [(-0.024, 0.0), (0.024, 0.0), (0.0, 0.04)]:
            parts.append(cyl(0.0245, 0.02, (x, y, z), tape, (0, 0, 0), 12))
    # Fuse: a curling wick.
    bpy.ops.curve.primitive_bezier_curve_add(location=(0, 0.04, 0.105))
    c = bpy.context.active_object
    pts = c.data.splines[0].bezier_points
    pts[0].co = (0, 0, 0)
    pts[0].handle_right = (0.0, 0.0, 0.06)
    pts[1].co = (0.05, -0.02, 0.09)
    pts[1].handle_left = (0.01, 0.02, 0.1)
    c.data.bevel_depth = 0.004
    c.data.bevel_resolution = 2
    bpy.ops.object.convert(target="MESH")
    fuse = bpy.context.active_object
    fuse.data.materials.append(mat("cream", rough=0.9))
    parts.append(fuse)
    o = join(parts, "Dynamite")
    wobble(o, 0.0012, 15)
    wear(o)
    return o


def laser():
    enamel = mat("cream", rough=0.35)
    brass = mat("brass", metal=0.85, rough=0.35)
    dark = mat("dark_steel", metal=0.7, rough=0.45)
    rubber = mat("rubber", rough=0.9)
    parts = [cyl(0.05, 0.3, (0, 0.0, 0), enamel, (R90, 0, 0), 16, bevel=0.01)]
    for y in (-0.12, 0.0, 0.12):
        parts.append(torus(0.052, 0.008, (0, y, 0), brass, (R90, 0, 0), 16, 4))
    for i in range(6):
        parts.append(cyl(0.065, 0.006, (0, -0.2 + i * 0.016, 0), dark, (R90, 0, 0), 16))
    parts.append(cyl(0.05, 0.12, (0, 0.21, 0), dark, (-R90, 0, 0), 14, r2=0.03))
    parts.append(cyl(0.024, 0.012, (0, 0.275, 0), mat("laser", rough=0.2, emit=4.0), (R90, 0, 0), 14))
    grip = box((0.05, 0.065, 0.15), (0, -0.05, -0.1), rubber, rot=(math.radians(-15), 0, 0), bevel=0.012)
    parts.append(grip)
    # A glowing coolant vial on top.
    parts.append(cyl(0.02, 0.16, (0, 0.0, 0.065), mat("verdigris", rough=0.2, emit=1.5), (R90, 0, 0), 10, bevel=0.005))
    for y in (-0.08, 0.08):
        parts.append(box((0.02, 0.012, 0.03), (0, y, 0.055), brass))
    o = join(parts, "Laser")
    wobble(o, 0.001, 16)
    wear(o)
    return o


def borer():
    orange = mat("orange", rough=0.55)
    dark = mat("dark_steel", metal=0.7, rough=0.45)
    steel = mat("steel", metal=0.9, rough=0.35)
    parts = [cyl(0.13, 0.32, (0, 0.0, 0), orange, (R90, 0, 0), 20, bevel=0.015)]
    for y in (-0.14, 0.14):
        parts.append(torus(0.132, 0.012, (0, y, 0), dark, (R90, 0, 0), 20, 4))
        for k in range(10):
            a = k / 10 * math.tau
            parts.append(sphere(0.008, (math.cos(a) * 0.133, y + (0.02 if y < 0 else -0.02), math.sin(a) * 0.133), dark, segs=6, rings=4))
    for s in (-1, 1):
        parts.append(torus(0.07, 0.016, (s * 0.15, -0.06, 0), dark, (0, R90, 0), 12, 6))
    body = join(parts, "Borer")
    wobble(body, 0.0015, 17)
    wear(body)
    head = cyl(0.14, 0.3, (0, 0.15, 0), steel, (-R90, 0, 0), 12, r2=0.012)
    flutes = []
    for k in range(3):
        fl = bar(3, 0.022, 0.3, 16, (0, 0, 0), mat("dark_steel", metal=0.8, rough=0.4), name="flute")
        for v in fl.data.vertices:
            t = v.co.y / 0.3
            rr = 0.135 * (1.0 - t) + 0.01
            ang = k / 3 * math.tau + t * 3.4
            v.co.x += math.cos(ang) * rr
            v.co.z += math.sin(ang) * rr
        flutes.append(fl)
    teeth = []
    for k in range(8):
        a = k / 8 * math.tau
        teeth.append(cyl(0.018, 0.05, (math.cos(a) * 0.125, 0.02, math.sin(a) * 0.125), mat("amber", metal=0.6, rough=0.4), (-R90, 0, 0), 6, r2=0.0))
    teeth += flutes
    b = join([head] + teeth, "Bit")
    wear(b, 1.0)
    bpy.context.view_layer.objects.active = b
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    attach(b, body, (0, 0.0, 0))
    return body


if __name__ == "__main__":
    for name, fn in [("shovel", shovel), ("pickaxe", pickaxe), ("jackhammer", jackhammer), ("drill", drill),
                     ("dynamite", dynamite), ("laser", laser), ("borer", borer)]:
        reset()
        o = fn()
        export([o], "tool_" + name)
