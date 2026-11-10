"""The three big pumps: the diesel, the giant siphon and the whirlpool engine.
    python3 art/blender/engines.py [names...]

The pumps are the game's verb, so they're chunky, busy machines you can
read from across the bay: the diesel is a stationary engine on a timber
skid with two big spoked flywheels, a finned cylinder, a water hopper, a
belt to a snail-shell pump and a tall exhaust; the siphon is a riveted,
flanged iron pipe as wide as a lane on timber trestles with a priming
engine and its valve wheel; the whirlpool engine is a copper drum banded in
brass with a spinning rotor, gauges, a ladder and a stack. Each has an
"Exhaust" empty where the game puts its smoke, a suction flange at its
front (Blender +Y, towards the water) where the hose couples on, and the
moving parts the game animates as named children: Flywheel (spins about X),
Valve (turns about Z), Rotor (spins about Z).
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from kit import (PAL, ao, attach, box, cyl, export, from_profile, join, lathe, lerp3, mat, mix, paint_mat, reset,  # noqa: E402
                 ribbon, smooth, sphere, strut, torus, tube, vnoise3, wobble)
from mathutils import Vector  # noqa: E402


def finish(o, seed, dist=0.5, wob=0.004):
    wobble(o, wob, seed)
    smooth(o, 36)
    ao(o, dist, rays=12, strength=0.6, seed=seed, edge=0.8)
    return o


def exhaust(parent, at):
    e = bpy.data.objects.new("Exhaust", None)
    bpy.context.collection.objects.link(e)
    e.location = at
    e.parent = parent
    return e


def grime(o, low=0.5):
    """Oil and rust at the foot, chipped paint on the edges, salt here and there."""
    def fn(co, n, mn):
        if mn in ("brass", "glassg", "gauge"):
            return (1, 1, 1)
        v = vnoise3(co.x * 6, co.y * 6, co.z * 6)
        c = (1, 1, 1)
        if co.z < low:
            c = lerp3(c, (0.62, 0.48, 0.38), (low - co.z) / low * 0.6 * (0.5 + 0.5 * v))
        if v > 0.72:
            c = lerp3(c, mix("rust", "sand", 0.3), 0.35)
        return c
    paint_mat(o, fn)


def spoked_wheel(r, width, spokes, m, hub_m=None):
    parts = [torus(r, width * 0.5, (0, 0, 0), m, rot=(0, math.pi / 2, 0), maj=28, mi=6)]
    parts.append(cyl(r * 0.16, width * 1.6, (0, 0, 0), hub_m or m, rot=(0, math.pi / 2, 0), verts=12))
    for k in range(spokes):
        a = k * math.tau / spokes
        parts.append(strut((0, 0, 0), (0, math.cos(a) * r * 0.97, math.sin(a) * r * 0.97), width * 0.28, m, sides=6))
    return parts


def flange_ring(c, axis, r, m, bolts=8, bolt_m=None):
    a = Vector(axis).normalized()
    ring = torus(r * 1.18, r * 0.12, c, m, maj=20, mi=5)
    ring.rotation_mode = "QUATERNION"
    ring.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(a)
    parts = [ring]
    side = a.cross(Vector((0, 0, 1)))
    if side.length < 0.1:
        side = a.cross(Vector((1, 0, 0)))
    side.normalize()
    up = a.cross(side).normalized()
    for k in range(bolts):
        t = k * math.tau / bolts
        p = Vector(c) + (side * math.cos(t) + up * math.sin(t)) * r * 1.22
        parts.append(sphere(r * 0.07, p, bolt_m or m, segs=6, rings=4))
    return parts


def pump_diesel():
    reset()
    green = mat("enginepaint", mix(mix("teal", "shoal", 0.35), "ink", 0.1), rough=0.6)
    iron = mat("iron", metal=0.5, rough=0.55)
    brass = mat("brass", metal=0.75, rough=0.35)
    red = mat("redpaint", mix("coral", "rust", 0.35), rough=0.6)
    wood = mat("skid", mix("wood_dark", "rust", 0.1), rough=0.9)
    parts = []
    # the skid: two heavy runners, cross timbers, bolted down
    for x in (-0.75, 0.75):
        parts.append(box((0.26, 2.9, 0.24), (x, -0.1, 0.12), wood, bevel=0.03))
    for y in (-1.3, -0.3, 0.7):
        parts.append(box((1.8, 0.24, 0.12), (0, y, 0.28), wood, bevel=0.02))
    # the engine bed and the finned horizontal cylinder
    parts.append(box((1.0, 1.5, 0.5), (0, -0.55, 0.6), green, bevel=0.08))
    cylb = cyl(0.36, 1.0, (0, -0.25, 1.05), green, rot=(math.pi / 2, 0, 0), verts=20, bevel=0.03)
    parts.append(cylb)
    for k in range(6):
        parts.append(torus(0.4, 0.035, (0, -0.65 + k * 0.16, 1.05), green, rot=(math.pi / 2, 0, 0), maj=22, mi=5))
    parts.append(lathe([(0.0, 0.0), (0.34, 0.0), (0.38, 0.06), (0.24, 0.2), (0.0, 0.22)], 18, "head", green, loc=(0, 0.3, 1.05)))
    parts[-1].rotation_euler = (-math.pi / 2, 0, 0)
    # the water hopper on top, flared, with a lid
    parts.append(lathe([(0.0, 0.0), (0.24, 0.0), (0.38, 0.55), (0.42, 0.6), (0.0, 0.6)], 4, "hopper", green, loc=(0, -0.45, 1.3)))
    parts[-1].rotation_euler = (0, 0, math.pi / 4)
    # crank case at the back
    parts.append(box((0.8, 0.6, 0.8), (0, -1.1, 0.95), green, bevel=0.1))
    parts.append(cyl(0.1, 2.0, (0, -1.1, 1.0), iron, rot=(0, math.pi / 2, 0), verts=10))
    # the exhaust: down pipe, a silencer drum, a tall stack with a rain cap
    parts.append(tube([Vector((0.2, 0.0, 1.4)), Vector((0.35, -0.2, 1.75)), Vector((0.42, -0.6, 1.95))], [0.07, 0.07, 0.07], iron, sides=8))
    parts.append(cyl(0.2, 0.6, (0.45, -0.85, 1.95), iron, rot=(math.pi / 2, 0, 0), verts=14, bevel=0.02))
    parts.append(cyl(0.085, 1.8, (0.45, -1.15, 2.85), iron, verts=10))
    parts.append(lathe([(0.0, 0.0), (0.24, 0.02), (0.05, 0.22), (0.0, 0.24)], 12, "cap", iron, loc=(0.45, -1.15, 3.85)))
    # the pump: a snail-shell volute in red, its suction flange to the front
    vol = lathe([(0.0, -0.2), (0.42, -0.2), (0.5, -0.12), (0.52, 0.12), (0.42, 0.2), (0.0, 0.2)], 24, "volute", red)
    vol.rotation_euler = (0, math.pi / 2, 0)
    vol.location = (0.15, 0.9, 0.78)
    for v in vol.data.vertices:
        ang = math.atan2(v.co.z, v.co.y)
        v.co.y *= 1.0 + 0.18 * (ang + math.pi) / math.tau
        v.co.z *= 1.0 + 0.18 * (ang + math.pi) / math.tau
    parts.append(vol)
    parts.append(tube([Vector((0.15, 1.15, 0.9)), Vector((0.15, 1.45, 0.75)), Vector((0.15, 1.6, 0.45))], [0.17, 0.17, 0.16], iron, sides=12))
    parts += flange_ring((0.15, 1.6, 0.42), (0, 0.3, -1), 0.16, iron, bolt_m=brass)
    # outlet pipe over the back to the sea, a gate valve on it
    parts.append(tube([Vector((0.15, 0.85, 1.25)), Vector((0.15, 0.6, 1.75)), Vector((-0.55, 0.0, 1.95)), Vector((-0.6, -1.4, 1.5)), Vector((-0.6, -1.7, 0.6))],
                      [0.13] * 5, iron, sides=10))
    parts.append(torus(0.16, 0.025, (-0.58, -0.6, 1.98), brass, rot=(0, math.pi / 2, 0), maj=12, mi=4))
    # a fuel drum on a cradle, an oil can, a gauge
    parts.append(cyl(0.3, 0.9, (-0.95, -0.6, 0.7), red, rot=(math.pi / 2, 0, 0), verts=16, bevel=0.02))
    for y in (-0.95, -0.25):
        parts.append(torus(0.305, 0.02, (-0.95, y, 0.7), red, rot=(math.pi / 2, 0, 0), maj=16, mi=4))
    parts.append(box((0.5, 1.0, 0.1), (-0.95, -0.6, 0.38), wood, bevel=0.02))
    parts.append(lathe([(0.0, 0.0), (0.08, 0.0), (0.08, 0.14), (0.03, 0.2), (0.01, 0.32), (0.0, 0.32)], 10, "oilcan", brass, loc=(0.7, 0.9, 0.34)))
    parts.append(cyl(0.09, 0.04, (0.38, 0.1, 1.42), mat("gauge", mix("paper", "sand", 0.2), rough=0.4), rot=(math.radians(60), 0, 0), verts=14))
    body = join(parts, "PumpDiesel")
    finish(body, 31)
    grime(body)
    # the flywheels: one each side of the crank, the big spoked silhouette
    fw = []
    for x in (-0.62, 0.62):
        ww = spoked_wheel(0.62, 0.11, 6, iron, hub_m=brass)
        for w in ww:
            w.location = Vector(w.location) + Vector((x, 0, 0))
        fw += ww
    fly = join(fw, "Flywheel")
    fly.location = (0, -1.1, 1.0)
    finish(fly, 32, dist=0.2)
    attach(fly, body, (0, -1.1, 1.0))
    # the belt from the right flywheel to the pump's pulley
    belt = ribbon([Vector((0.72, -1.1, 1.62)), Vector((0.72, 0.0, 1.25)), Vector((0.72, 0.85, 0.95)), Vector((0.72, 0.9, 0.6)),
                   Vector((0.72, 0.0, 0.62)), Vector((0.72, -1.1, 0.38))], [0.06] * 6, normal=(1, 0, 0), thick=0.02, m=mat("belt", mix("ink", "rust", 0.25), rough=0.8))
    belt.parent = body
    exhaust(body, (0.45, -1.15, 4.1))
    export([body], "pump_diesel")


def pump_siphon():
    reset()
    iron = mat("castiron", mix("ink", "steel", 0.4), metal=0.4, rough=0.6)
    rusty = mat("rusty", mix("rust", "coral", 0.18), metal=0.25, rough=0.75)
    wood = mat("skid", mix("wood_dark", "rust", 0.1), rough=0.9)
    brass = mat("brass", metal=0.75, rough=0.35)
    red = mat("redpaint", mix("coral", "rust", 0.35), rough=0.6)
    parts = []
    # the great pipe: up from the water at the front, over a crown, down the back
    path = [Vector((0, 2.0, 0.4)), Vector((0, 1.6, 2.0)), Vector((0, 0.8, 3.6)), Vector((0, -0.4, 4.2)), Vector((0, -1.6, 3.6)),
            Vector((0, -2.4, 2.0)), Vector((0, -2.7, 0.3))]
    smooth_path = []
    for i in range(len(path) - 1):
        for k in range(6):
            u = k / 6
            p0 = path[max(i - 1, 0)]
            p1 = path[i]
            p2 = path[i + 1]
            p3 = path[min(i + 2, len(path) - 1)]
            q = 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)
            smooth_path.append(q)
    smooth_path.append(path[-1])
    R = 0.55
    parts.append(tube(smooth_path, [R] * len(smooth_path), iron, sides=16))
    # flanges every few sections, studded with bolts
    for i in range(3, len(smooth_path) - 2, 5):
        d = (smooth_path[i + 1] - smooth_path[i - 1]).normalized()
        parts += flange_ring(smooth_path[i], d, R, iron, bolts=10, bolt_m=rusty)
    parts += flange_ring(smooth_path[0] + Vector((0, 0.05, -0.1)), (0, 0.25, -1), R, iron, bolts=10, bolt_m=brass)
    # timber trestles under the crown
    for y in (0.6, -1.4):
        for sx in (-1, 1):
            parts.append(strut((sx * 1.1, y, 0.0), (sx * 0.3, y, 3.3 if y > 0 else 3.0), 0.12, wood))
        parts.append(strut((-0.9, y, 1.2), (0.9, y, 1.2), 0.09, wood))
        parts.append(box((1.4, 0.3, 0.25), (0, y, 3.45 if y > 0 else 3.15), wood, bevel=0.03))
    # the priming engine: a little donkey boiler with a valve wheel and a stack
    parts.append(cyl(0.45, 1.3, (1.3, 0.2, 0.65), red, verts=16, bevel=0.03))
    parts.append(lathe([(0.0, 0.0), (0.47, 0.0), (0.3, 0.25), (0.0, 0.3)], 16, "dome", brass, loc=(1.3, 0.2, 1.3)))
    parts.append(cyl(0.09, 1.6, (1.3, -0.1, 2.1), iron, verts=10))
    parts.append(tube([Vector((1.0, 0.2, 1.0)), Vector((0.6, 0.6, 1.8)), Vector((0.3, 0.9, 2.6))], [0.06] * 3, brass, sides=8))
    parts.append(cyl(0.12, 0.05, (1.3, 0.66, 0.9), mat("gauge", mix("paper", "sand", 0.2), rough=0.4), rot=(math.pi / 2, 0, 0), verts=14))
    for x in (-1.0, 1.0):
        parts.append(box((0.3, 4.8, 0.25), (x, -0.3, 0.12), wood, bevel=0.03))
    body = join(parts, "PumpSiphon")
    finish(body, 41, dist=0.8)

    def marks(co, n, mn):
        if mn in ("brass", "gauge"):
            return (1, 1, 1)
        v = vnoise3(co.x * 2.5, co.y * 2.5, co.z * 2.5)
        c = (1, 1, 1)
        if mn == "castiron":
            # rust weeping from every flange
            c = lerp3(c, mix("rust", "sand", 0.2), 0.45 * max(0.0, v - 0.45) * 2.0)
        if co.z < 0.6:
            c = lerp3(c, (0.6, 0.5, 0.4), 0.5)
        return c
    paint_mat(body, marks)
    valve = join([torus(0.32, 0.035, (0, 0, 0), brass, maj=18, mi=5)] +
                 [strut((0, 0, 0), (math.cos(a) * 0.31, math.sin(a) * 0.31, 0), 0.02, brass, sides=4) for a in [k * math.tau / 5 for k in range(5)]] +
                 [cyl(0.05, 0.14, (0, 0, 0), brass, verts=8)], "Valve")
    valve.location = (0.0, -0.4, 4.85)
    finish(valve, 42, dist=0.15)
    attach(valve, body, (0.0, -0.4, 4.85))
    stem = cyl(0.04, 0.6, (0.0, -0.4, 4.55), brass, verts=8)
    stem.parent = body
    exhaust(body, (1.3, -0.1, 3.0))
    export([body], "pump_siphon")


def pump_whirlpool():
    reset()
    copper = mat("copper", mix("coral", "rust", 0.5), metal=0.7, rough=0.4)
    brass = mat("brass", metal=0.75, rough=0.35)
    iron = mat("iron", metal=0.5, rough=0.55)
    verd = mat("verdigris", rough=0.6)
    parts = []
    drum = lathe([(0.0, 0.0), (1.45, 0.0), (1.5, 0.2), (1.28, 0.4), (1.2, 2.2), (1.32, 2.34), (1.0, 2.8), (0.45, 3.05), (0.0, 3.08)], 28, "drum", copper)
    parts.append(drum)
    for z in (0.7, 1.3, 1.9):
        parts.append(torus(1.23, 0.06, (0, 0, z), brass, maj=32, mi=6))
        for k in range(16):
            a = k * math.tau / 16
            parts.append(sphere(0.035, (math.cos(a) * 1.27, math.sin(a) * 1.27, z + 0.12), brass, segs=6, rings=4))
    for a in (0.5, 2.1, 3.7, 5.3):
        p = Vector((math.cos(a) * 1.22, math.sin(a) * 1.22, 1.45))
        rim = torus(0.24, 0.05, p, brass, maj=16, mi=5)
        rim.rotation_mode = "QUATERNION"
        rim.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((math.cos(a), math.sin(a), 0)))
        parts.append(rim)
        parts.append(sphere(0.21, p, mat("glassg", mix("shoal", "paper", 0.4), emit=0.8, rough=0.08), segs=12, rings=8))
    # the intake: a heavy flanged mouth at the front, where the hose couples on
    parts.append(tube([Vector((0, 1.0, 0.7)), Vector((0, 1.6, 0.6)), Vector((0, 2.0, 0.3))], [0.28, 0.28, 0.26], copper, sides=14))
    parts += flange_ring((0, 2.02, 0.25), (0, 0.4, -1), 0.26, brass, bolts=10)
    # gauges on a brass manifold, a ladder up the side, a stack
    for k, a in enumerate((0.9, 1.3)):
        p = Vector((math.cos(a) * 1.3, math.sin(a) * 1.3, 2.1))
        g = cyl(0.17, 0.08, p, mat("gauge", mix("paper", "sand", 0.2), rough=0.4), verts=16)
        g.rotation_mode = "QUATERNION"
        g.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((math.cos(a), math.sin(a), 0.2)))
        parts.append(g)
        parts.append(torus(0.18, 0.03, p, brass, maj=14, mi=4))
        parts[-1].rotation_mode = "QUATERNION"
        parts[-1].rotation_quaternion = g.rotation_quaternion
    for sx in (-0.25, 0.25):
        parts.append(strut((-1.45 + 0.0, sx, 0.0), (-1.28, sx, 2.6), 0.03, iron))
    for k in range(9):
        z = 0.25 + k * 0.28
        parts.append(strut((-1.44 + 0.02 * k, -0.25, z), (-1.44 + 0.02 * k, 0.25, z), 0.022, iron))
    parts.append(cyl(0.16, 2.2, (0.9, -0.7, 3.4), iron, verts=12))
    parts.append(lathe([(0.0, 0.0), (0.3, 0.0), (0.24, 0.12), (0.0, 0.14)], 12, "stackcap", iron, loc=(0.9, -0.7, 4.5)))
    for a in (0.0, 1.57, 3.14, 4.71):
        parts.append(strut((math.cos(a) * 1.55, math.sin(a) * 1.55, 0.0), (math.cos(a) * 1.22, math.sin(a) * 1.22, 0.5), 0.09, verd))
    body = join(parts, "PumpWhirlpool")
    finish(body, 51, dist=0.7)

    def patina(co, n, mn):
        if mn != "copper":
            return (1, 1, 1)
        v = vnoise3(co.x * 3, co.y * 3, co.z * 3)
        k = max(0.0, (0.6 - co.z) * 1.0) * 0.8 + max(0.0, v - 0.6) * 1.5
        return lerp3((1, 1, 1), (0.6, 0.85, 0.78), min(1.0, k))
    paint_mat(body, patina)
    vanes = []
    for k in range(6):
        a = k * math.tau / 6
        v = from_profile([(0.0, 0.0), (0.85, 0.06), (0.9, 0.3), (0.12, 0.4)], 0.05, brass, name="vane")
        v.rotation_euler = (0.4, 0, a)
        vanes.append(v)
    vanes.append(cyl(0.16, 0.55, (0, 0, 0.2), brass, verts=14))
    vanes.append(sphere(0.18, (0, 0, 0.52), brass, segs=12, rings=8))
    rot = join(vanes, "Rotor")
    rot.location = (0, 0, 3.0)
    finish(rot, 52, dist=0.2)
    attach(rot, body, (0, 0, 3.0))
    exhaust(body, (0.9, -0.7, 4.7))
    export([body], "pump_whirlpool")


ALL = {f.__name__: f for f in [pump_diesel, pump_siphon, pump_whirlpool]}

if __name__ == "__main__":
    names = sys.argv[1:] or list(ALL)
    for nm in names:
        ALL[nm]()
