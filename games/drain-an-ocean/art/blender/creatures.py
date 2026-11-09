"""Every rescuable creature, the salvage crab helper and the pelican.
    python3 art/blender/creatures.py [names...]
Creatures face Blender +Y (the game's forward). Bodies use a white material
with their markings painted into the vertex colours over baked occlusion
(countershading, bands, spots); eyes are their own glossy materials and a
size up from life, for character. The pelican's wings are child objects
(WingL, WingR) that the game flaps.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import (PAL, ao, attach, box, cyl, export, from_profile, join, lathe, mat, mix, paint,  # noqa: E402
                 reset, smooth, sphere, strut, torus, tube, white, wobble)
from mathutils import Vector  # noqa: E402


def hashf(x, y, z, s=1.0):
    v = math.sin(x * 127.1 * s + y * 311.7 * s + z * 74.7 * s) * 43758.5453
    return v - math.floor(v)


def lerpc(a, b, t):
    a = PAL[a] if isinstance(a, str) else a
    b = PAL[b] if isinstance(b, str) else b
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def eyes(at_y, at_z, half_w, r, pupil=0.62, look=(0, 0.35, 0)):
    out = []
    for sx in (-1, 1):
        c = Vector((sx * half_w, at_y, at_z))
        out.append(sphere(r, c, mat("eye_white", rough=0.25), segs=12, rings=8))
        pd = Vector((sx * 0.75, look[1], look[2])).normalized()
        out.append(sphere(r * pupil, c + pd * r * 0.55, mat("eye", rough=0.08), segs=10, rings=6))
    return out


def fin(points, thick, loc, rot, m):
    """A flat fin from an outline of (x, z) points, turned into place."""
    f = from_profile(points, thick, m, name="fin")
    f.rotation_euler = rot
    f.location = loc
    return f


def fish_body(L, H, Wd, taper=1.35, nose=0.15, segs=20, rings=26):
    # Poles along the length (Y), so painted bands follow the rings.
    import bpy
    b = sphere(0.5, (0, 0, 0), white(), scale=(1, 1, 1), segs=segs, rings=rings)
    b.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.view_layer.objects.active = b
    bpy.ops.object.select_all(action="DESELECT")
    b.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    for v in b.data.vertices:
        v.co.x *= Wd
        v.co.y *= L
        v.co.z *= H
    for v in b.data.vertices:
        t = v.co.y / (L * 0.5)       # -1 tail .. 1 head
        if t < 0:
            k = max(0.16, 1.0 + t * taper * 0.62)
            v.co.x *= k
            v.co.z *= k
            v.co.z += (1 - k) * H * 0.04
        else:
            v.co.y -= nose * L * t * t * 0.3
    return b


def tail(kind, s, at_y, m):
    if kind == "fork":
        pts = [(0.0, -0.03), (-0.34, -0.3), (-0.22, 0.0), (-0.34, 0.3), (0.0, 0.03)]
    elif kind == "lobed":
        pts = [(0.0, -0.05), (-0.3, -0.26), (-0.28, -0.08), (-0.42, 0.0), (-0.28, 0.08), (-0.3, 0.26), (0.0, 0.05)]
    else:
        pts = [(0.0, -0.05), (-0.18, -0.2), (-0.3, -0.12), (-0.33, 0.0), (-0.3, 0.12), (-0.18, 0.2), (0.0, 0.05)]
    pts = [(x * s, z * s) for (x, z) in pts]
    return fin(pts, 0.012 * s * 3, (0, at_y, 0), (0, 0, math.pi / 2), m)


def generic_fish(name, L, H, Wd, tail_kind, colour_fn, dorsal="soft", eye_r=0.05, extras=None, fin_col="white", seed=1):
    reset()
    parts = []
    body = fish_body(L, H, Wd)
    parts.append(body)
    fm = white() if fin_col == "white" else mat(fin_col, rough=0.6)
    parts.append(tail(tail_kind, L * 0.8, -L * 0.46, fm))
    if dorsal == "spiny":
        pts = [(-0.18, 0.0), (-0.14, 0.13), (-0.06, 0.1), (0.0, 0.15), (0.06, 0.09), (0.12, 0.12), (0.18, 0.0)]
    elif dorsal == "tall":
        pts = [(-0.14, 0.0), (0.0, 0.22), (0.12, 0.0)]
    else:
        pts = [(-0.2, 0.0), (-0.05, 0.11), (0.12, 0.0)]
    pts = [(x * L, z * L) for (x, z) in pts]
    parts.append(fin(pts, 0.012, (0, 0, H * 0.4), (0, 0, math.pi / 2), fm))
    parts.append(fin([(x * L, z * L) for (x, z) in [(-0.1, 0.0), (0.0, -0.08), (0.08, 0.0)]], 0.01, (0, -L * 0.1, -H * 0.4), (0, 0, math.pi / 2), fm))
    for sx in (-1, 1):
        parts.append(fin([(0.0, 0.0), (0.09 * L, -0.03 * L), (0.07 * L, 0.04 * L)], 0.01,
                         (sx * Wd * 0.42, L * 0.15, -H * 0.1), (0.4, sx * 0.5, -math.pi / 2 + sx * 0.6), fm))
    parts += eyes(L * 0.3, H * 0.12, Wd * 0.4, eye_r)
    if extras:
        parts += extras()
    o = join(parts, name)
    wobble(o, 0.002 * L, seed)
    smooth(o, 60)
    ao(o, L * 0.25, rays=10, strength=0.5, seed=seed, edge=0.5, top=0.15)
    paint(o, colour_fn)
    export([o], name)


def countershade(back, belly, k=6.0):
    return lambda co, n: lerpc(back, belly, 0.5 - co.z * k * 0.5 + (n.z < -0.3) * 0.3)


def bass():
    def col(co, n):
        c = lerpc(mix("kelp", "fish_grey", 0.35), "belly", 0.5 - co.z * 5.0)
        blot = hashf(round(co.y * 9), round(co.z * 9), 0) > 0.72 and co.z > -0.02
        return lerpc(c, "fish_dark", 0.45) if blot else c
    generic_fish("bass", 0.78, 0.26, 0.13, "fork", col, "spiny", 0.045, seed=3)


def clownfish():
    def col(co, n):
        c = lerpc("fish_orange", mix("fish_orange", "paper", 0.25), 0.4 - co.z * 4)
        for band in (0.11, -0.02, -0.14):
            d = abs(co.y - band)
            if d < 0.028:
                return (0.97, 0.94, 0.88)
            if d < 0.038:
                return PAL["ink"]
        return c
    generic_fish("clownfish", 0.42, 0.22, 0.13, "round", col, "soft", 0.04, seed=5)


def puffer():
    def spikes():
        out = []
        rnd = random.Random(9)
        for _ in range(26):
            th = rnd.uniform(0, math.tau)
            ph = rnd.uniform(-1.2, 1.2)
            d = Vector((math.cos(th) * math.cos(ph), math.sin(th) * math.cos(ph) * 0.9 + 0.05, math.sin(ph)))
            p = Vector((d.x * 0.18, d.y * 0.2, d.z * 0.18))
            c = cyl(0.012, 0.07, p + d * 0.03, white(), r2=0.0, verts=5)
            c.rotation_mode = "QUATERNION"
            c.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
            out.append(c)
        return out

    def col(co, n):
        c = lerpc(mix("sand", "kelp_light", 0.3), "belly", 0.5 - co.z * 4)
        spot = hashf(round(co.x * 14), round(co.y * 14), round(co.z * 14)) > 0.8 and co.z > 0
        return lerpc(c, "fish_dark", 0.6) if spot else c
    generic_fish("puffer", 0.45, 0.38, 0.38, "round", col, "tall", 0.06, extras=spikes, seed=7)


def lantern():
    def lights():
        out = []
        for i in range(6):
            out.append(sphere(0.006, (0.034, 0.08 - i * 0.04, -0.025), mat("shoal", emit=1.6), segs=6, rings=4))
            out.append(sphere(0.006, (-0.034, 0.08 - i * 0.04, -0.025), mat("shoal", emit=1.6), segs=6, rings=4))
        return out
    generic_fish("lantern", 0.34, 0.1, 0.07, "fork", countershade("fish_dark", "fish_grey", 10.0), "soft", 0.035, extras=lights, seed=11)


def coelacanth():
    def lobes():
        out = []
        for (y, z, sx) in [(0.18, -0.12, 1), (0.18, -0.12, -1), (-0.1, -0.16, 1), (-0.1, -0.16, -1), (-0.25, 0.14, 0)]:
            lb = sphere(0.06, (sx * 0.11, y, z), white(), scale=(0.7, 1.6, 0.7), segs=8, rings=6)
            out.append(lb)
            out.append(fin([(0.0, 0.0), (-0.08, -0.12), (0.05, -0.1)], 0.01, (sx * 0.12, y - 0.05, z - 0.04), (0, 0, math.pi / 2), white()))
        return out

    def col(co, n):
        c = lerpc(mix("teal", "ink", 0.35), mix("teal", "fish_grey", 0.4), 0.5 - co.z * 3)
        spot = hashf(round(co.y * 7), round(co.z * 7), round(co.x * 7)) > 0.82
        return lerpc(c, "paper", 0.6) if spot else c
    generic_fish("coelacanth", 1.25, 0.34, 0.2, "lobed", col, "soft", 0.06, extras=lobes, seed=13)


def angler():
    reset()
    parts = []
    body = sphere(0.3, (0, 0, 0), white(), scale=(0.85, 1.1, 0.9), segs=18, rings=12)
    for v in body.data.vertices:
        if v.co.y < 0:
            k = max(0.3, 1 + v.co.y * 1.6)
            v.co.x *= k
            v.co.z *= k
    parts.append(body)
    jaw = sphere(0.24, (0, 0.18, -0.12), white(), scale=(1.0, 0.8, 0.45), segs=14, rings=8)
    parts.append(jaw)
    for i in range(9):
        a = math.radians(-70 + i * 17.5)
        p = Vector((math.sin(a) * 0.22, 0.24 + math.cos(a) * 0.1, -0.04))
        t = cyl(0.014, 0.08, p, mat("paper", rough=0.3), r2=0.0, verts=5)
        t.rotation_euler = (math.radians(180), 0, 0)
        parts.append(t)
    parts.append(tail("fork", 0.5, -0.32, white()))
    parts.append(tube([Vector((0, 0.05, 0.25)), Vector((0, 0.2, 0.42)), Vector((0, 0.38, 0.4)), Vector((0, 0.44, 0.3))], [0.012, 0.011, 0.01, 0.009], white(), sides=5))
    parts.append(sphere(0.045, (0, 0.44, 0.27), mat("sand", emit=4.0, rough=0.3), segs=10, rings=6))
    parts += eyes(0.16, 0.1, 0.16, 0.045)
    o = join(parts, "angler")
    wobble(o, 0.003, 17)
    smooth(o, 60)
    ao(o, 0.15, rays=10, strength=0.5, seed=17)
    paint(o, lambda co, n: lerpc(mix("ink", "rust", 0.25), mix("ink", "teal", 0.3), 0.5 + co.z * 2) if co.z < 0.24 or co.y < 0.35 else (1, 1, 1))
    export([o], "angler")


def flounder():
    reset()
    parts = []
    b = sphere(0.5, (0, 0, 0), white(), scale=(0.42, 0.62, 0.07), segs=20, rings=10)
    parts.append(b)
    fr = torus(0.27, 0.035, (0, 0, -0.005), white(), maj=24, mi=4)
    fr.scale = (0.85, 1.18, 0.3)
    parts.append(fr)
    parts.append(tail("round", 0.5, -0.32, white()))
    for sx, y in ((0.06, 0.2), (-0.04, 0.17)):
        parts.append(sphere(0.03, (sx, y, 0.035), mat("eye_white", rough=0.25), segs=10, rings=6))
        parts.append(sphere(0.019, (sx, y + 0.01, 0.055), mat("eye", rough=0.08), segs=8, rings=5))
    o = join(parts, "flounder")
    wobble(o, 0.002, 19)
    smooth(o, 60)
    ao(o, 0.1, rays=10, strength=0.4, seed=19)

    def col(co, n):
        c = lerpc(mix("sand", "kelp", 0.25), "belly", 0.0 if co.z > -0.01 else 1.0)
        s = hashf(round(co.x * 22), round(co.y * 22), 0)
        if s > 0.84 and co.z > 0:
            return lerpc(c, "coral", 0.55)
        if s < 0.12 and co.z > 0:
            return lerpc(c, "fish_dark", 0.4)
        return c
    paint(o, col)
    export([o], "flounder")


def crab_parts(body_col, shell=True):
    parts = []
    body = sphere(0.13, (0, 0.04, 0.09), white(), scale=(1.25, 0.9, 0.6), segs=14, rings=8)
    parts.append(body)
    for sx in (-1, 1):
        # claws: an arm and a pincer, one bigger
        big = 1.25 if sx > 0 else 0.9
        parts.append(tube([Vector((sx * 0.12, 0.08, 0.08)), Vector((sx * 0.2, 0.17, 0.1)), Vector((sx * 0.2, 0.26, 0.09))], [0.03 * big, 0.028 * big, 0.026 * big], white(), sides=6))
        parts.append(sphere(0.06 * big, (sx * 0.2, 0.3, 0.09), white(), scale=(0.8, 1.2, 0.7), segs=10, rings=6))
        parts.append(cyl(0.022 * big, 0.08 * big, (sx * 0.17, 0.38, 0.09), white(), r2=0.005, rot=(-math.pi / 2, 0, 0), verts=6))
        for k in range(3):
            y = 0.06 - k * 0.07
            parts.append(tube([Vector((sx * 0.12, y, 0.07)), Vector((sx * 0.25, y - 0.02, 0.12)), Vector((sx * 0.33, y - 0.04, 0.0))], [0.018, 0.016, 0.01], white(), sides=5))
        parts.append(strut((sx * 0.04, 0.12, 0.13), (sx * 0.06, 0.15, 0.22), 0.01, white(), sides=5))
        parts.append(sphere(0.025, (sx * 0.06, 0.15, 0.23), mat("eye", rough=0.1), segs=8, rings=5))
    return parts


def crab():
    """The hermit crab, in a borrowed whelk shell."""
    reset()
    parts = crab_parts("coral")
    prof = []
    for i in range(14):
        t = i / 13
        prof.append((0.17 * math.sin(t * math.pi) ** 0.8 * (1.0 - 0.45 * t) + 0.01, t * 0.42))
    sh = lathe(prof, 14, "shell", white())
    from kit import twist as tw
    tw(sh, math.radians(220), axis="Z")
    sh.rotation_euler = (math.radians(-70), 0, 0)
    sh.location = (0, -0.1, 0.16)
    parts.append(sh)
    o = join(parts, "crab")
    wobble(o, 0.002, 23)
    smooth(o, 55)
    ao(o, 0.1, rays=10, strength=0.5, seed=23)
    paint(o, lambda co, n: lerpc("shell", "sand", 0.5 + 0.5 * math.sin(co.z * 60 + co.x * 9)) if co.y < -0.03 and co.z > 0.1 else lerpc("coral", "rust", 0.3 - co.z))
    export([o], "crab")


def crab_helper():
    """The salvage crab: red, broad, in a yellow sou'wester."""
    reset()
    parts = crab_parts("coral")
    hat = lathe([(0.0, 0.0), (0.16, 0.0), (0.18, -0.02), (0.1, 0.02), (0.08, 0.1), (0.0, 0.12)], 14, "hat", mat("paint_yellow", rough=0.5))
    hat.location = (0, 0.06, 0.17)
    hat.rotation_euler = (math.radians(-12), 0, 0)
    parts.append(hat)
    o = join(parts, "crab_helper")
    o.scale = (1.4, 1.4, 1.4)
    wobble(o, 0.002, 25)
    smooth(o, 55)
    ao(o, 0.1, rays=10, strength=0.5, seed=25)
    paint(o, lambda co, n: lerpc("paint_red", "coral", 0.5 + co.z * 2))
    export([o], "crab_helper")


def starfish():
    reset()
    pts = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        r = 0.26 if k % 2 == 0 else 0.1
        pts.append((math.cos(a) * r, math.sin(a) * r))
    s = from_profile(pts, 0.06, white(), name="star")
    s.rotation_euler = (math.pi / 2, 0, 0)
    from kit import bevel_obj
    bevel_obj(s, 0.02, 2)
    for v in s.data.vertices:
        d = math.hypot(v.co.x, v.co.z) if False else math.hypot(v.co.x, v.co.y)
    o = join([s], "starfish")
    for v in o.data.vertices:
        d = math.hypot(v.co.x, v.co.y)
        v.co.z = v.co.z * (1.4 - d * 3.0) + max(0.0, 0.05 - d * 0.15)
    wobble(o, 0.004, 29)
    smooth(o, 60)
    ao(o, 0.08, rays=8, strength=0.4, seed=29)
    paint(o, lambda co, n: (0.96, 0.92, 0.85) if hashf(round(co.x * 40), round(co.y * 40), 0) > 0.86 and co.z > 0.01 else lerpc("coral", "coral_orange", 0.5 + co.x))
    export([o], "starfish")


def urchin():
    reset()
    parts = [sphere(0.13, (0, 0, 0.1), white(), scale=(1, 1, 0.8), segs=18, rings=12)]
    rnd = random.Random(31)
    for _ in range(46):
        th = rnd.uniform(0, math.tau)
        ph = rnd.uniform(-0.3, 1.4)
        d = Vector((math.cos(th) * math.cos(ph), math.sin(th) * math.cos(ph), math.sin(ph)))
        c = cyl(0.008, 0.2, Vector((0, 0, 0.1)) + d * 0.18, white(), r2=0.0, verts=4)
        c.rotation_mode = "QUATERNION"
        c.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
        parts.append(c)
    o = join(parts, "urchin")
    smooth(o, 50)
    ao(o, 0.1, rays=8, strength=0.5, seed=31)
    paint(o, lambda co, n: lerpc("coral_purple", mix("coral_purple", "ink", 0.5), 1.0 - co.z * 3))
    export([o], "urchin")


def seahorse():
    reset()
    parts = []
    spine = [Vector((0, 0.02, 0.5)), Vector((0, -0.02, 0.4)), Vector((0, 0.0, 0.3)), Vector((0, 0.03, 0.2)), Vector((0, 0.02, 0.1)),
             Vector((0, -0.04, 0.03)), Vector((0, -0.1, 0.02)), Vector((0, -0.12, 0.07)), Vector((0, -0.08, 0.1))]
    rad = [0.045, 0.06, 0.07, 0.06, 0.045, 0.03, 0.022, 0.016, 0.01]
    parts.append(tube(spine, rad, white(), sides=8))
    parts.append(tube([Vector((0, 0.03, 0.5)), Vector((0, 0.1, 0.49)), Vector((0, 0.17, 0.47))], [0.03, 0.02, 0.018], white(), sides=6))
    parts.append(fin([(0.0, 0.0), (-0.06, 0.05), (-0.08, 0.0)], 0.008, (0, -0.06, 0.3), (0, 0, math.pi / 2), white()))
    for sx in (-1, 1):
        parts.append(sphere(0.018, (sx * 0.03, 0.04, 0.51), mat("eye", rough=0.08), segs=8, rings=5))
    parts.append(cyl(0.012, 0.05, (0, 0.0, 0.56), white(), r2=0.002, verts=5))
    o = join(parts, "seahorse")
    wobble(o, 0.002, 37)
    smooth(o, 60)
    ao(o, 0.08, rays=8, strength=0.4, seed=37)
    paint(o, lambda co, n: lerpc("paint_yellow", "coral_orange", 0.5 + math.sin(co.z * 70) * 0.5))
    export([o], "seahorse")


def octopus():
    reset()
    parts = [sphere(0.18, (0, -0.05, 0.28), white(), scale=(1.0, 1.15, 1.25), segs=16, rings=10)]
    for k in range(8):
        a = k * math.tau / 8 + 0.2
        d = Vector((math.cos(a), math.sin(a), 0))
        pts = [Vector((0, 0, 0.12)) + d * 0.08]
        for i in range(1, 6):
            t = i / 5
            curl = d * (0.1 + t * 0.32) + d.cross(Vector((0, 0, 1))) * math.sin(t * 3.0 + k) * 0.08
            pts.append(Vector((curl.x, curl.y, 0.1 - t * 0.08 + (0.07 * t * t if t > 0.7 else 0))))
        parts.append(tube(pts, [0.05, 0.045, 0.035, 0.026, 0.018, 0.01], white(), sides=7))
    parts += eyes(0.06, 0.22, 0.12, 0.045, look=(0, 0.8, 0.1))
    o = join(parts, "octopus")
    wobble(o, 0.003, 41)
    smooth(o, 60)
    ao(o, 0.15, rays=10, strength=0.5, seed=41)
    paint(o, lambda co, n: lerpc("coral", "coral_pink", 0.5 + 0.5 * math.sin(co.x * 30) * math.sin(co.y * 30)) if n.z > -0.4 else PAL["shell"])
    export([o], "octopus")


def turtle():
    reset()
    parts = []
    sh = sphere(0.5, (0, 0, 0.12), white(), scale=(1.0, 1.3, 0.42), segs=44, rings=26)
    for v in sh.data.vertices:
        if v.co.z < 0.12:
            v.co.z = 0.12 - (0.12 - v.co.z) * 0.25
    parts.append(sh)
    parts.append(sphere(0.12, (0, 0.72, 0.13), white(), scale=(0.9, 1.25, 0.8), segs=12, rings=8))
    for sx in (-1, 1):
        parts.append(fin([(0.0, 0.0), (0.48, -0.12), (0.52, -0.04), (0.08, 0.12)], 0.04, (sx * 0.38, 0.3, 0.1), (0, 0, -0.5 * sx - (math.pi if sx < 0 else 0)), white()))
        parts.append(fin([(0.0, 0.0), (0.22, -0.08), (0.2, 0.05)], 0.03, (sx * 0.34, -0.42, 0.08), (0, 0, 0.6 * sx + (math.pi if sx < 0 else 0)), white()))
        parts.append(sphere(0.025, (sx * 0.07, 0.83, 0.17), mat("eye", rough=0.1), segs=8, rings=5))
    o = join(parts, "turtle")
    wobble(o, 0.004, 43)
    smooth(o, 50)
    ao(o, 0.25, rays=10, strength=0.5, seed=43)

    def col(co, n):
        if co.z > 0.16 and abs(co.y) < 0.62:
            # scutes: a soft hex-ish cell pattern
            cx = math.floor(co.x * 5.5 + 0.5 * (math.floor(co.y * 5.5) % 2))
            cy = math.floor(co.y * 5.5)
            f = hashf(cx, cy, 0)
            edge = min(abs(co.x * 5.5 + 0.5 * (math.floor(co.y * 5.5) % 2) - cx - 0.5), abs(co.y * 5.5 - cy - 0.5))
            base = lerpc(mix("kelp", "rust", 0.35), mix("sand", "rust", 0.3), f)
            return lerpc(base, "ink", 0.5) if edge > 0.42 else base
        return lerpc(mix("shoal", "sand", 0.4), "belly", 0.5 - co.z * 4)
    paint(o, col)
    export([o], "turtle")


def moray():
    reset()
    pts = []
    n = 22
    for i in range(n):
        t = i / (n - 1)
        pts.append(Vector((math.sin(t * 5.0) * 0.12, 0.7 - t * 1.4, 0.06 + math.sin(t * 3.0) * 0.03)))
    rad = [0.07 + 0.015 * math.sin(min(1.0, i / (n - 1) * 3.0) * math.pi / 2) - 0.07 * max(0.0, i / (n - 1) - 0.55) for i in range(n)]
    parts = [tube(pts, rad, white(), sides=12, flat=1.3)]
    parts.append(fin([(0.0, 0.0), (-1.2, 0.05), (-1.25, 0.0)], 0.01, (0, 0.55, 0.12), (0, 0, math.pi / 2), white()))
    jaw = sphere(0.06, (0, 0.74, 0.02), white(), scale=(0.9, 1.4, 0.4), segs=10, rings=6)
    parts.append(jaw)
    parts += eyes(0.68, 0.11, 0.05, 0.022)
    o = join(parts, "moray")
    wobble(o, 0.003, 47)
    smooth(o, 60)
    ao(o, 0.12, rays=8, strength=0.45, seed=47)
    paint(o, lambda co, n: lerpc(mix("kelp_light", "sand", 0.3), "fish_dark", 0.55) if hashf(round(co.x * 18), round(co.y * 18), round(co.z * 18)) > 0.55 else lerpc("kelp_light", "sand", 0.35))
    export([o], "moray")


def lobster():
    reset()
    parts = [sphere(0.11, (0, 0.12, 0.09), white(), scale=(0.9, 1.6, 0.8), segs=12, rings=8)]
    for i in range(5):
        parts.append(sphere(0.085 - i * 0.01, (0, -0.06 - i * 0.07, 0.08 - i * 0.005), white(), scale=(1.0, 0.7, 0.6), segs=10, rings=6))
    parts.append(fin([(0.0, -0.05), (-0.1, -0.1), (-0.12, 0.0), (-0.1, 0.1), (0.0, 0.05)], 0.015, (0, -0.4, 0.06), (math.pi / 2, 0, math.pi / 2), white()))
    for sx in (-1, 1):
        parts.append(tube([Vector((sx * 0.06, 0.25, 0.08)), Vector((sx * 0.14, 0.36, 0.08)), Vector((sx * 0.14, 0.46, 0.08))], [0.025, 0.022, 0.02], white(), sides=6))
        parts.append(sphere(0.06, (sx * 0.15, 0.55, 0.08), white(), scale=(0.75, 1.5, 0.55), segs=10, rings=6))
        parts.append(tube([Vector((sx * 0.03, 0.3, 0.12)), Vector((sx * 0.12, 0.6, 0.2)), Vector((sx * 0.3, 0.8, 0.15))], [0.006, 0.005, 0.003], white(), sides=4))
        for k in range(3):
            y = 0.14 - k * 0.07
            parts.append(tube([Vector((sx * 0.07, y, 0.06)), Vector((sx * 0.17, y, 0.08)), Vector((sx * 0.22, y - 0.02, 0.0))], [0.012, 0.01, 0.007], white(), sides=4))
        parts.append(sphere(0.018, (sx * 0.04, 0.29, 0.15), mat("eye", rough=0.1), segs=8, rings=5))
    o = join(parts, "lobster")
    wobble(o, 0.002, 53)
    smooth(o, 55)
    ao(o, 0.1, rays=8, strength=0.5, seed=53)
    paint(o, lambda co, n: lerpc(mix("teal", "shoal", 0.35), mix("teal", "ink", 0.3), 0.5 - co.z * 3))
    export([o], "lobster")


def whale():
    reset()
    parts = []
    b = sphere(0.5, (0, 0, 0), white(), scale=(1.3, 5.2, 1.25), segs=24, rings=14)
    for v in b.data.vertices:
        t = v.co.y / 2.6
        if t < 0:
            k = max(0.12, 1 + t * 0.95)
            v.co.x *= k
            v.co.z *= k
        else:
            v.co.z -= t * t * 0.2
    parts.append(b)
    fl = fin([(0.0, -0.1), (-0.5, -1.0), (-0.65, -0.95), (-0.35, 0.0), (-0.65, 0.95), (-0.5, 1.0), (0.0, 0.1)], 0.08, (0, -2.5, 0.05), (math.pi / 2, 0, math.pi / 2), white())
    parts.append(fl)
    for sx in (-1, 1):
        parts.append(fin([(0.0, 0.0), (-0.85, -0.55), (-0.75, -0.7), (0.15, -0.1)], 0.06, (sx * 0.5, 1.1, -0.4), (0, 0, -sx * 0.25 + (math.pi if sx < 0 else 0)), white()))
        parts.append(sphere(0.06, (sx * 0.5, 1.6, -0.12), mat("eye", rough=0.1), segs=8, rings=5))
    o = join(parts, "whale")
    wobble(o, 0.01, 59)
    smooth(o, 60)
    ao(o, 0.8, rays=10, strength=0.45, seed=59)

    def col(co, n):
        c = lerpc(mix("fish_grey", "ink", 0.35), mix("fish_grey", "paper", 0.3), 0.45 - co.z * 1.2)
        s = hashf(round(co.x * 6), round(co.y * 6), round(co.z * 6))
        if s > 0.86:
            return lerpc(c, "paper", 0.55)
        return c
    paint(o, col)
    export([o], "whale")


def pelican():
    reset()
    parts = []
    parts.append(sphere(0.3, (0, 0, 0), white(), scale=(0.8, 1.35, 0.85), segs=16, rings=10))
    parts.append(tube([Vector((0, 0.3, 0.1)), Vector((0, 0.42, 0.32)), Vector((0, 0.45, 0.48))], [0.09, 0.07, 0.07], white(), sides=8))
    parts.append(sphere(0.1, (0, 0.47, 0.52), white(), segs=12, rings=8))
    beak = cyl(0.045, 0.6, (0, 0.8, 0.5), mat("beak", rough=0.5), r2=0.015, rot=(-math.pi / 2 - 0.12, 0, 0), verts=8)
    parts.append(beak)
    pouch = sphere(0.09, (0, 0.72, 0.42), mat("beak", rough=0.6), scale=(0.7, 2.6, 0.7), segs=10, rings=6)
    parts.append(pouch)
    parts.append(fin([(0.0, -0.03), (-0.3, -0.12), (-0.32, 0.0), (-0.3, 0.12), (0.0, 0.03)], 0.03, (0, -0.4, 0.05), (math.pi / 2, 0, math.pi / 2), white()))
    for sx in (-1, 1):
        parts.append(sphere(0.022, (sx * 0.07, 0.53, 0.56), mat("eye", rough=0.1), segs=8, rings=5))
    o = join(parts, "Pelican")
    wobble(o, 0.003, 61)
    smooth(o, 60)
    ao(o, 0.2, rays=10, strength=0.45, seed=61)
    paint(o, lambda co, n: lerpc("paper", "fish_grey", max(0.0, -co.y * 1.2)) if co.y > -0.15 else PAL["fish_grey"])
    for sx, nm in ((1, "WingR"), (-1, "WingL")):
        w = fin([(0.0, -0.16), (0.55, -0.2), (0.7, -0.3), (0.78, -0.2), (0.9, -0.24), (0.98, -0.12), (1.08, -0.1), (1.02, 0.0),
                 (0.9, 0.08), (0.6, 0.14), (0.0, 0.16)], 0.035, (0, 0, 0), (0, 0, 0 if sx > 0 else math.pi), white())
        from kit import bend as bd
        bd(w, math.radians(-14), axis="Y")
        w.rotation_euler = (math.pi / 2, 0, 0 if sx > 0 else math.pi)
        wj = join([w], nm)
        wj.location = (sx * 0.18, 0.0, 0.12)
        ao(wj, 0.1, rays=6, strength=0.3, seed=62)
        paint(wj, lambda co, n: lerpc("paper", "ink", max(0.0, (abs(co.x) - 0.6) * 2.5)))
        attach(wj, o, (sx * 0.18, 0.0, 0.12))
    export([o], "pelican")


ALL = {"bass": bass, "clownfish": clownfish, "puffer": puffer, "lantern": lantern, "coelacanth": coelacanth,
       "angler": angler, "flounder": flounder, "crab": crab, "crab_helper": crab_helper, "starfish": starfish,
       "urchin": urchin, "seahorse": seahorse, "octopus": octopus, "turtle": turtle, "moray": moray,
       "lobster": lobster, "whale": whale, "pelican": pelican}

if __name__ == "__main__":
    names = sys.argv[1:] or list(ALL)
    for n in names:
        ALL[n]()
