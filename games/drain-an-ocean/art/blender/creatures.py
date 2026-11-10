"""Every rescuable creature, the salvage crab helper and the pelican.
    python3 art/blender/creatures.py [names...]

Built the way a model maker would carve them, not from primitives: each
body is lofted through hand-shaped cross-sections (so a bass is deep and
narrow, a puffer round, a moray a long flat-sided rope); fins are thin
blades with real thickness at the root, ridged with rays and notched
between them; eyes have an iris ring and a catchlight. Bodies use a white
material with their colouring painted into the vertex colour over baked
occlusion: countershading (dark back, pale belly, a soft lateral line),
then each species' own markings (bands, blotches, ocelli, scutes,
photophores, barnacle patches).

Sizes are the diorama's, not life: everything reads at a glance in a 130 m
bay, so a clownfish is as long as a forearm. Creatures face Blender +Y (the
game's forward). The pelican's wings are child objects (WingL, WingR) that
the game flaps.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import (PAL, ao, attach, paint_mat, barnacle_cluster, body, cyl, export, fin, hash3, join, lathe, lerp3, loft,  # noqa: E402
                 mat, mix, paint, reset, ribbon, smooth, sphere, spline, tube, vnoise3, white, wobble)
from mathutils import Vector  # noqa: E402


# --- Shared pieces --------------------------------------------------------------------------
def eye(c, r, look=(1, 0.4, 0.1), iris="sand", lid=None):
    """An eye: a pale ball set into the head, a ringed iris and pupil looking
    out along `look`, and a catchlight."""
    c = Vector(c)
    d = Vector(look).normalized()
    parts = [sphere(r, c, mat("eye_white", rough=0.3), segs=14, rings=10)]
    parts.append(sphere(r * 0.72, c + d * r * 0.42, mat(iris, rough=0.25), segs=12, rings=8))
    parts.append(sphere(r * 0.5, c + d * r * 0.62, mat("eye", rough=0.05), segs=12, rings=8))
    side = d.cross(Vector((0, 0, 1))).normalized()
    parts.append(sphere(r * 0.13, c + d * r * 0.98 + Vector((0, 0, r * 0.32)) + side * r * 0.2, mat("eye_white", rough=0.1, emit=0.4), segs=6, rings=4))
    if lid:
        lm = white() if lid == "white" else mat(lid, rough=0.6)
        parts.append(sphere(r * 1.08, c + Vector((0, 0, r * 0.18)), lm, scale=(1, 1, 0.55), segs=12, rings=6))
    return parts


def pair_eyes(y, z, half_w, r, fwd=0.35, up=0.1, **kw):
    out = []
    for sx in (-1, 1):
        out += eye((sx * half_w, y, z), r, look=(sx * 1.0, fwd, up), **kw)
    return out


def body_eyes(prof, L, t, r, elev=0.25, fwd=0.35, up=0.1, sink=0.45, **kw):
    """A pair of eyes set into a lofted body's surface at t along it (0 tail,
    1 nose), `elev` radians up from the side, bulging out by (1-sink) of r."""
    w, h, zo, _sq = spline(prof, t)
    y = -L / 2 + t * L
    out = []
    for sx in (-1, 1):
        x = sx * (w * math.cos(elev) + r * (0.5 - sink))
        z = zo + h * math.sin(elev)
        out += eye((x, y, z), r, look=(sx * 1.0, fwd, up), **kw)
    return out


def finish(o, seed, size, wob=0.0015, rays=12, strength=0.55, angle=55):
    wobble(o, wob * size, seed)
    smooth(o, angle)
    ao(o, size * 0.22, rays=rays, strength=strength, seed=seed, edge=0.45, top=0.12)
    return o


def mid_height(profile, length):
    """Returns f(y) -> (half_height, z_offset) of a body profile at y."""
    def f(y):
        t = min(1.0, max(0.0, y / length + 0.5))
        w, h, zo, _sq = spline(profile, t)
        return h, zo
    return f


def countershade(back, belly, prof_f, lateral=None, split=0.05):
    """Dark back to pale belly, the change a little above the middle, and an
    optional thin lateral line."""
    def fn(co, n):
        h, zo = prof_f(co.y)
        rel = (co.z - zo) / max(h, 1e-3)               # -1 belly .. 1 back
        c = lerp3(belly, back, 0.5 + 0.5 * math.tanh((rel - split) * 2.6))
        if lateral is not None and abs(rel - 0.12) < 0.045:
            c = lerp3(c, lateral, 0.6)
        return c
    return fn


def tail_fin(y0, z_half, kind, size, m, thick=0.012, rays=9):
    """A caudal fin in the YZ plane, root at the peduncle (y0, +-z_half)."""
    s = size
    if kind == "fork":
        pts = [(y0 - 0.02 * s, z_half), (y0 - 0.5 * s, 0.62 * s), (y0 - 0.62 * s, 0.7 * s), (y0 - 0.42 * s, 0.32 * s),
               (y0 - 0.3 * s, 0.0), (y0 - 0.42 * s, -0.32 * s), (y0 - 0.62 * s, -0.7 * s), (y0 - 0.5 * s, -0.62 * s), (y0 - 0.02 * s, -z_half)]
    elif kind == "lunate":
        pts = [(y0, z_half), (y0 - 0.32 * s, 0.6 * s), (y0 - 0.5 * s, 0.82 * s), (y0 - 0.36 * s, 0.32 * s), (y0 - 0.32 * s, 0.0),
               (y0 - 0.36 * s, -0.32 * s), (y0 - 0.5 * s, -0.82 * s), (y0 - 0.32 * s, -0.6 * s), (y0, -z_half)]
    elif kind == "lobed":
        pts = [(y0, z_half), (y0 - 0.3 * s, 0.5 * s), (y0 - 0.46 * s, 0.42 * s), (y0 - 0.42 * s, 0.16 * s), (y0 - 0.66 * s, 0.07 * s),
               (y0 - 0.66 * s, -0.07 * s), (y0 - 0.42 * s, -0.16 * s), (y0 - 0.46 * s, -0.42 * s), (y0 - 0.3 * s, -0.5 * s), (y0, -z_half)]
    else:   # rounded fan
        pts = [(y0, z_half)] + [(y0 - 0.12 * s - 0.38 * s * math.cos(a), 0.46 * s * math.sin(a))
                                for a in [math.radians(x) for x in (75, 50, 25, 0, -25, -50, -75)]] + [(y0, -z_half)]
    outline = [Vector((0, p[0], p[1])) for p in pts]
    outline = _resample(outline, 24)
    return fin((0, y0, z_half), (0, y0, -z_half), outline, (1, 0, 0), thick=thick, rays=rays, ray_depth=0.4, scallop=0.06, m=m, name="tail")


def _resample(pts, n):
    """Even points along a polyline (for fin outlines)."""
    L = [0.0]
    for i in range(1, len(pts)):
        L.append(L[-1] + (pts[i] - pts[i - 1]).length)
    out = []
    for k in range(n):
        d = L[-1] * k / (n - 1)
        i = 1
        while i < len(L) - 1 and L[i] < d:
            i += 1
        u = (d - L[i - 1]) / max(L[i] - L[i - 1], 1e-9)
        out.append(pts[i - 1].lerp(pts[i], u))
    return out


def dorsal(y_a, y_b, z_a, z_b, height, shape, m, thick=0.008, rays=8, scallop=0.0, x=0.0, sign=1):
    """A median fin (dorsal or anal: sign -1) rooted along the body from y_a
    (rear) to y_b (front). shape(u) -> relative height along the root."""
    outline = []
    n = 22
    for k in range(n):
        u = k / (n - 1)
        y = y_a + (y_b - y_a) * u
        z = z_a + (z_b - z_a) * u
        hh = height * shape(u)
        outline.append(Vector((x, y - hh * 0.35, z + sign * hh)))
    return fin((x, y_a, z_a), (x, y_b, z_b), outline, (1, 0, 0), thick=thick, rays=rays, ray_depth=0.45, scallop=scallop, m=m, name="dorsal")


def side_fin(root, length, width, sweep, droop, m, side=1, thick=0.008, rays=6, rounded=False):
    """A paired fin (pectoral or pelvic) on one side, swept back and out."""
    r = Vector(root)
    a = r + Vector((0, 0.5 * width, 0.25 * width))
    b = r + Vector((0, -0.5 * width, -0.25 * width))
    out = Vector((side * math.cos(sweep) * length, -math.sin(sweep) * length, -droop * length))
    pts = []
    n = 12
    for k in range(n):
        u = k / (n - 1)
        bulge = math.sin(u * math.pi)
        edge = a.lerp(b, u) + out * (0.55 + 0.45 * bulge if rounded else 0.35 + 0.65 * (1 - abs(u - 0.3) ** 1.2))
        pts.append(edge)
    up = Vector((0, 0, 1)).cross(out).cross(out).normalized() * -1
    if up.length < 0.1:
        up = Vector((0, 0, 1))
    return fin(a, b, pts, Vector((-out.y * 0.2, out.x * 0.2, 1.0)), thick=thick, rays=rays, ray_depth=0.4, scallop=0.08, m=m, name="pfin")


def fin_paint(base, edge=None, ray_dark=0.12, tip=None, root_col=None):
    """Fins: the base colour, ray streaks, and an optional coloured edge."""
    def fn(co, n):
        c = _look(base)
        if root_col is not None:
            c = lerp3(root_col, c, 0.6)
        return c
    return fn


def _look(c):
    return PAL[c] if isinstance(c, str) else c


def export_one(parts, name, seed, size, colour_fn=None, extra_paint=None):
    o = join(parts, name)
    finish(o, seed, size)
    if colour_fn:
        paint(o, colour_fn)
    if extra_paint:
        paint(o, extra_paint)
    export([o], name)
    return o


# --- Fish -----------------------------------------------------------------------------------------
def bass():
    reset()
    L = 0.66
    prof = [(0.0, (0.016, 0.03, 0.004, 2.0)), (0.12, (0.026, 0.05, 0.004, 2.1)), (0.35, (0.052, 0.112, 0.008, 2.3)),
            (0.58, (0.062, 0.128, 0.004, 2.3)), (0.8, (0.054, 0.104, -0.006, 2.2)), (0.93, (0.036, 0.064, -0.014, 2.0)),
            (1.0, (0.008, 0.014, -0.02, 2.0))]
    b = body(L, prof, name="body", m=white())
    fm = mat("fin_olive", mix("kelp", "sand", 0.3), rough=0.55)
    sp = mat("fin_spine", mix("kelp", "ink", 0.25), rough=0.5)
    parts = [b, tail_fin(-L / 2 + 0.01, 0.026, "fork", 0.22, fm)]
    parts.append(dorsal(-0.03, 0.17, 0.118, 0.105, 0.085, lambda u: 0.35 + 0.65 * math.sin(min(1, u * 1.4) * math.pi * 0.5 + 0.3), sp, rays=9, scallop=0.5))
    parts.append(dorsal(-0.2, -0.04, 0.07, 0.116, 0.065, lambda u: math.sin(u * math.pi) ** 0.6 * 0.9 + 0.1, fm, rays=10))
    parts.append(dorsal(-0.2, -0.09, -0.06, -0.09, 0.05, lambda u: math.sin(u * math.pi) ** 0.7, fm, rays=7, sign=-1))
    for sx in (-1, 1):
        parts.append(side_fin((sx * 0.05, 0.12, -0.03), 0.09, 0.04, math.radians(55), 0.15, fm, sx))
        parts.append(side_fin((sx * 0.03, 0.08, -0.1), 0.06, 0.025, math.radians(65), 0.6, fm, sx))
    parts += body_eyes(prof, L, 0.86, 0.022, elev=0.3, iris="brass")
    pf = mid_height(prof, L)
    shade = countershade(mix("kelp", "ink", 0.35), "belly", pf, lateral=mix("kelp", "paper", 0.3))

    def col(co, n):
        c = shade(co, n)
        h, zo = pf(co.y)
        rel = (co.z - zo) / max(h, 1e-3)
        # pale squarish blotches in two rows along the flank (kelp bass)
        if abs(co.x) > 0.01 and -0.25 < rel < 0.75:
            gy = math.floor(co.y * 26)
            gz = math.floor(rel * 2.4)
            if hash3(gy, gz, 3) > 0.55 and (co.y * 26) % 1 > 0.25:
                c = lerp3(c, mix("belly", "kelp_light", 0.3), 0.55)
        # gill cover edge
        if 0.165 < co.y < 0.178 and rel < 0.6:
            c = lerp3(c, "ink", 0.35)
        if co.y > 0.31 and rel < -0.05:
            c = lerp3(c, "ink", 0.4)   # mouth line
        return c
    export_one(parts, "bass", 3, L, col)


def clownfish():
    reset()
    L = 0.42
    prof = [(0.0, (0.014, 0.028, 0.0, 2.0)), (0.15, (0.03, 0.06, 0.0, 2.1)), (0.45, (0.054, 0.1, 0.004, 2.3)),
            (0.72, (0.056, 0.098, 0.0, 2.3)), (0.9, (0.04, 0.07, -0.006, 2.1)), (1.0, (0.01, 0.018, -0.01, 2.0))]
    b = body(L, prof, name="body", m=white())
    fm = mat("fin_orange", mix("fish_orange", "coral", 0.2), rough=0.5)
    parts = [b]
    t = tail_fin(-L / 2 + 0.01, 0.024, "round", 0.15, fm, thick=0.01)
    parts.append(t)
    parts.append(dorsal(-0.02, 0.1, 0.098, 0.092, 0.045, lambda u: 0.55 + 0.45 * math.sin(u * math.pi), fm, rays=8, scallop=0.35))
    parts.append(dorsal(-0.15, -0.02, 0.06, 0.098, 0.06, lambda u: math.sin(u * math.pi) ** 0.5, fm, rays=9))
    parts.append(dorsal(-0.14, -0.04, -0.055, -0.085, 0.05, lambda u: math.sin(u * math.pi) ** 0.5, fm, rays=7, sign=-1))
    for sx in (-1, 1):
        parts.append(side_fin((sx * 0.05, 0.06, -0.02), 0.07, 0.035, math.radians(50), 0.2, fm, sx, rounded=True))
        parts.append(side_fin((sx * 0.03, 0.04, -0.08), 0.05, 0.022, math.radians(60), 0.65, fm, sx, rounded=True))
    parts += body_eyes(prof, L, 0.83, 0.021, elev=0.3, iris="fish_orange")
    o = join(parts, "clownfish")
    finish(o, 5, L)
    ink = PAL["ink"]
    pf = mid_height(prof, L)

    def col(co, n):
        h, zo = pf(co.y)
        rel = (co.z - zo) / max(h, 1e-3)
        c = lerp3(mix("fish_orange", "coral", 0.15), mix("fish_orange", "paper", 0.3), 0.5 - rel * 0.5)
        for band, wdt in ((0.115, 0.018), (0.0, 0.024), (-0.145, 0.012)):
            d = abs(co.y - band - 0.01 * rel)
            if d < wdt:
                return (0.97, 0.95, 0.9)
            if d < wdt + 0.008:
                return ink
        # black-edged fins: anything far out from the body's surface
        if abs(co.z - zo) > h * 1.02 + 0.012 or co.y < -L / 2 - 0.035:
            return lerp3(c, ink, 0.85)
        return c
    paint(o, col)
    export([o], "clownfish")


def puffer():
    reset()
    L = 0.5
    prof = [(0.0, (0.02, 0.026, 0.01, 2.0)), (0.12, (0.05, 0.06, 0.01, 2.0)), (0.35, (0.15, 0.14, 0.0, 2.0)),
            (0.6, (0.17, 0.16, 0.0, 2.0)), (0.82, (0.14, 0.13, 0.0, 2.0)), (0.96, (0.06, 0.06, 0.0, 2.0)), (1.0, (0.02, 0.02, -0.005, 2.0))]
    b = body(L, prof, name="body", m=white(), segs=28, steps=30)
    fm = mat("fin_pale", mix("sand", "paper", 0.3), rough=0.5)
    parts = [b, tail_fin(-L / 2 + 0.02, 0.024, "round", 0.12, fm)]
    parts.append(dorsal(-0.16, -0.1, 0.06, 0.1, 0.06, lambda u: math.sin(u * math.pi) ** 0.5, fm, rays=6))
    parts.append(dorsal(-0.16, -0.1, -0.05, -0.09, 0.05, lambda u: math.sin(u * math.pi) ** 0.5, fm, rays=6, sign=-1))
    for sx in (-1, 1):
        parts.append(side_fin((sx * 0.15, 0.07, 0.0), 0.06, 0.05, math.radians(40), 0.1, fm, sx, rounded=True))
    parts += body_eyes(prof, L, 0.78, 0.036, elev=0.5, fwd=0.6, iris="paint_yellow")
    # little beak
    parts.append(sphere(0.022, (0, 0.248, -0.012), mat("belly", rough=0.4), scale=(1.2, 0.6, 0.7), segs=10, rings=6))
    # spines laid back towards the tail, thinning out on the belly
    rnd = random.Random(8)
    spine = mat("spine_pale", mix("sand", "paper", 0.2), rough=0.5)
    pf = mid_height(prof, L)
    for k in range(70):
        y = rnd.uniform(-0.12, 0.17)
        a = rnd.uniform(0, math.tau)
        t = min(1, max(0, y / L + 0.5))
        w, h, zo, sq = spline(prof, t)
        p = Vector((math.cos(a) * w * 0.98, y, math.sin(a) * h * 0.98 + zo))
        nrm = Vector((math.cos(a) / w, 0, math.sin(a) / h)).normalized()
        d = (nrm + Vector((0, -0.9, 0))).normalized()
        c = cyl(0.007, 0.05, p + d * 0.022, spine, verts=4, r2=0.0005)
        c.rotation_mode = "QUATERNION"
        c.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
        parts.append(c)
    shade = countershade(mix("sand", "kelp", 0.45), "belly", pf, split=-0.1)

    def col(co, n):
        c = shade(co, n)
        h, zo = pf(co.y)
        rel = (co.z - zo) / max(h, 1e-3)
        if rel > -0.1 and hash3(math.floor(co.x * 30), math.floor(co.y * 30), math.floor(co.z * 30)) > 0.8:
            c = lerp3(c, "ink", 0.55)
        return c
    export_one(parts, "puffer", 9, L, col)


def lantern():
    reset()
    L = 0.46
    prof = [(0.0, (0.012, 0.022, 0.0, 2.0)), (0.15, (0.022, 0.04, 0.0, 2.1)), (0.5, (0.04, 0.075, -0.004, 2.3)),
            (0.8, (0.042, 0.08, -0.004, 2.3)), (0.95, (0.03, 0.06, 0.0, 2.1)), (1.0, (0.012, 0.024, -0.008, 2.0))]
    b = body(L, prof, name="body", m=white())
    fm = mat("fin_dark", mix("fish_dark", "teal", 0.3), rough=0.5)
    parts = [b, tail_fin(-L / 2 + 0.01, 0.02, "fork", 0.15, fm)]
    parts.append(dorsal(-0.02, 0.08, 0.072, 0.078, 0.05, lambda u: math.sin(u * math.pi) ** 0.6, fm, rays=9))
    parts.append(dorsal(-0.16, -0.12, 0.045, 0.055, 0.02, lambda u: math.sin(u * math.pi) ** 0.6, fm, rays=0))
    parts.append(dorsal(-0.15, -0.04, -0.05, -0.075, 0.035, lambda u: math.sin(u * math.pi) ** 0.6, fm, rays=8, sign=-1))
    for sx in (-1, 1):
        parts.append(side_fin((sx * 0.035, 0.1, -0.02), 0.06, 0.025, math.radians(55), 0.2, fm, sx))
    parts += body_eyes(prof, L, 0.86, 0.03, elev=0.2, fwd=0.4, iris="steel")
    glow = mat("photophore", mix("shoal", "paper", 0.45), rough=0.3, emit=3.0)
    pf = mid_height(prof, L)
    for row, rz in ((0, -0.75), (1, -0.45)):
        for k in range(9 - row * 2):
            y = -0.14 + k * 0.034 + row * 0.02
            t = min(1, max(0, y / L + 0.5))
            w, h, zo, sq = spline(prof, t)
            for sx in (-1, 1):
                a = math.asin(max(-1.0, rz))
                p = Vector((sx * w * math.cos(a) * 1.0, y, zo + h * math.sin(a)))
                parts.append(sphere(0.0065, p, glow, segs=6, rings=4))
    shade = countershade(mix("fish_dark", "ink", 0.3), mix("steel", "paper", 0.55), pf, split=0.25)
    export_one(parts, "lantern", 11, L, shade)


def coelacanth():
    reset()
    L = 1.2
    prof = [(0.0, (0.03, 0.05, 0.0, 2.0)), (0.12, (0.06, 0.1, 0.0, 2.1)), (0.4, (0.13, 0.2, 0.0, 2.3)),
            (0.66, (0.14, 0.21, -0.01, 2.3)), (0.86, (0.11, 0.16, -0.02, 2.2)), (1.0, (0.03, 0.05, -0.04, 2.0))]
    b = body(L, prof, name="body", m=white())
    fm = mat("fin_blue", mix("teal", "ink", 0.3), rough=0.55)
    parts = [b, tail_fin(-L / 2 + 0.02, 0.05, "lobed", 0.42, fm, thick=0.02, rays=12)]
    parts.append(dorsal(0.05, 0.22, 0.2, 0.2, 0.17, lambda u: math.sin(u * math.pi) ** 0.4, fm, rays=9, scallop=0.3))

    def lobe_fin(root, d, length, sx):
        # a fleshy stalk with a fan at its end: the coelacanth's "limb" fins
        r = Vector(root)
        e = r + Vector(d).normalized() * length * 0.55
        parts.append(tube([r, r.lerp(e, 0.5), e], [0.035, 0.03, 0.022], white(), sides=8))
        dd = Vector(d).normalized()
        a = e + Vector((0, 0.03, 0.01))
        bb = e - Vector((0, 0.03, 0.01))
        pts = []
        for k in range(10):
            u = k / 9
            pts.append(a.lerp(bb, u) + dd * length * (0.3 + 0.25 * math.sin(u * math.pi)) + Vector((0, -0.05 * math.sin(u * math.pi), 0)))
        parts.append(fin(a, bb, pts, (0, 0, 1), thick=0.014, rays=8, ray_depth=0.45, scallop=0.1, m=fm))
    for sx in (-1, 1):
        lobe_fin((sx * 0.12, 0.2, -0.06), (sx * 1, -0.7, -0.3), 0.26, sx)
        lobe_fin((sx * 0.08, -0.02, -0.17), (sx * 0.6, -0.8, -0.6), 0.2, sx)
    lobe_fin((0, -0.24, 0.15), (0, -0.7, 0.7), 0.2, 0)
    lobe_fin((0, -0.24, -0.15), (0, -0.7, -0.7), 0.2, 0)
    parts += body_eyes(prof, L, 0.86, 0.045, elev=0.3, fwd=0.5, iris="sand")
    pf = mid_height(prof, L)
    shade = countershade(mix("teal", "ink", 0.35), mix("teal", "paper", 0.35), pf)

    def col(co, n):
        c = shade(co, n)
        # irregular white flecks, the coelacanth's own fingerprint
        v = vnoise3(co.x * 14, co.y * 14, co.z * 14)
        if v > 0.74:
            c = lerp3(c, (0.92, 0.92, 0.86), 0.75)
        return c
    export_one(parts, "coelacanth", 13, L, col)


def angler():
    reset()
    L = 0.62
    prof = [(0.0, (0.02, 0.03, 0.02, 2.0)), (0.2, (0.06, 0.08, 0.02, 2.0)), (0.5, (0.16, 0.16, 0.03, 2.0)),
            (0.78, (0.2, 0.19, 0.03, 2.0)), (0.93, (0.19, 0.17, 0.02, 2.2)), (1.0, (0.15, 0.13, 0.0, 2.6))]
    b = body(L, prof, name="body", m=white(), segs=28, steps=30)
    parts = [b]
    face_y = L / 2
    # The open mouth: a dark gape filling the blunt face, a heavy upper lip and
    # an underslung lower jaw jutting past it, fanged both sides.
    parts.append(sphere(1.0, (0, face_y - 0.02, -0.01), mat("gape", mix("rust", "ink", 0.7), rough=0.7), scale=(0.15, 0.06, 0.1), segs=16, rings=10))
    lipm = mat("lip", mix(mix("rust", "sand", 0.35), "ink", 0.2), rough=0.55)
    up_arc = [Vector((math.sin(a) * 0.15, face_y - 0.005 + 0.02 * math.cos(a), 0.06 * math.cos(a) + 0.02)) for a in [math.radians(x) for x in range(-95, 96, 19)]]
    parts.append(tube(up_arc, [0.026] * len(up_arc), lipm, sides=8))
    lo_arc = [Vector((math.sin(a) * 0.16, face_y + 0.04 + 0.03 * math.cos(a), -0.1 * math.cos(a) - 0.0)) for a in [math.radians(x) for x in range(-100, 101, 20)]]
    parts.append(tube(lo_arc, [0.032] * len(lo_arc), lipm, sides=8))
    tooth = mat("tooth", mix("paper", "sand", 0.15), rough=0.3)
    rnd = random.Random(4)
    for arc, sign in ((up_arc, -1), (lo_arc, 1)):
        for k in range(1, len(arc) - 1):
            base = arc[k]
            ln = rnd.uniform(0.035, 0.065) * (1.2 if sign > 0 else 1.0)
            tipd = Vector((-base.x * 0.4, 0.03, sign * 1.0)).normalized()
            parts.append(tube([base, base + tipd * ln * 0.6, base + tipd * ln + Vector((0, 0.008, 0))], [0.008, 0.005, 0.0008], tooth, sides=5))
    fm = mat("fin_brown", mix("rust", "ink", 0.45), rough=0.6)
    parts.append(tail_fin(-L / 2 + 0.02, 0.03, "round", 0.16, fm))
    for sx in (-1, 1):
        parts.append(side_fin((sx * 0.17, 0.05, -0.06), 0.09, 0.06, math.radians(35), 0.3, fm, sx, rounded=True))
    parts.append(dorsal(-0.2, -0.08, 0.06, 0.12, 0.06, lambda u: math.sin(u * math.pi) ** 0.6, fm, rays=6))
    # the lure: a jointed rod over the head with a glowing bulb
    rod = [Vector((0, 0.18, 0.2)), Vector((0, 0.26, 0.33)), Vector((0, 0.38, 0.4)), Vector((0, 0.47, 0.36))]
    parts.append(tube(rod, [0.009, 0.008, 0.007, 0.006], fm, sides=6))
    parts.append(sphere(0.032, (0, 0.48, 0.33), mat("lure", mix("paper", "shoal", 0.35), emit=6.0), segs=12, rings=8))
    parts += body_eyes(prof, L, 0.84, 0.024, elev=0.95, fwd=0.6, up=0.5, iris="steel")
    pf = mid_height(prof, L)
    shade = countershade(mix("rust", "ink", 0.42), mix("rust", "sand", 0.45), pf, split=-0.2)

    def col(co, n, mn):
        if mn not in ("white",):
            return (1, 1, 1)
        c = shade(co, n)
        v = vnoise3(co.x * 16, co.y * 16, co.z * 16)
        c = lerp3(c, mix("rust", "ink", 0.65), 0.45 * max(0.0, v - 0.5) * 2.0)
        if hash3(math.floor(co.x * 70), math.floor(co.y * 70), math.floor(co.z * 70)) > 0.93:
            c = lerp3(c, mix("sand", "paper", 0.3), 0.6)   # pale pores
        return c
    o = join(parts, "angler")
    finish(o, 15, L)
    paint_mat(o, col)
    export([o], "angler")


def flounder():
    reset()
    # Lies on its side: the body is a flat oval in X-Y, both eyes on top.
    L = 0.62
    W = 0.24
    rings = []
    steps = 26
    segs = 28
    for i in range(steps + 1):
        t = i / steps
        y = -L / 2 + 0.06 + t * (L - 0.06)
        w = W * math.sin(math.pi * (0.06 + 0.9 * t)) ** 0.75
        th = 0.035 * math.sin(math.pi * (0.04 + 0.92 * t)) ** 0.6 + 0.006
        ring = []
        for k in range(segs):
            a = k / segs * math.tau
            ring.append(Vector((math.cos(a) * w, y, math.sin(a) * th * (1.25 if math.sin(a) > 0 else 0.7))))
        rings.append(ring)
    b = loft(rings, "body", white())
    fm = mat("fin_sand", mix("sand", "rust", 0.25), rough=0.6)
    parts = [b]
    # the frill: dorsal and anal fins all round the edge
    for sx in (-1, 1):
        root = []
        edge = []
        for k in range(16):
            u = k / 15
            y = -L / 2 + 0.1 + u * (L - 0.2)
            t = (y + L / 2 - 0.06) / (L - 0.06)
            w = W * math.sin(math.pi * (0.06 + 0.9 * t)) ** 0.75
            root.append(Vector((sx * w * 0.96, y, 0.0)))
            edge.append(Vector((sx * (w + 0.05 * math.sin(u * math.pi) ** 0.5 + 0.012), y - 0.01, 0.006)))
        parts.append(fin(root[0], root[-1], edge, (0, 0, 1), thick=0.008, rays=22, ray_depth=0.5, scallop=0.12, m=fm))
    pts = [Vector((0.075 * math.sin(a), -L / 2 + 0.06 - 0.12 * math.cos(a) ** 0.7, 0.0)) for a in [math.radians(x) for x in range(-80, 81, 16)]]
    parts.append(fin((-0.02, -L / 2 + 0.07, 0), (0.02, -L / 2 + 0.07, 0), _resample(pts, 14), (0, 0, 1), thick=0.01, rays=8, ray_depth=0.4, scallop=0.1, m=fm))
    # both eyes on top, bulging, one a little ahead of the other
    for (ex, ey) in ((0.035, 0.2), (-0.028, 0.165)):
        parts.append(cyl(0.02, 0.03, (ex, ey, 0.04), white(), verts=10, r2=0.018))
        parts += eye((ex, ey, 0.062), 0.027, look=(ex * 8, 0.3, 1.0), iris="sand")
    o = join(parts, "flounder")
    finish(o, 17, L)
    base = mix(mix("sand", "rust", 0.45), "ink", 0.12)

    def col(co, n):
        if n.z < -0.3:
            return lerp3("belly", (1, 1, 1), 0.3)
        v = vnoise3(co.x * 22, co.y * 22, 0)
        c = lerp3(base, mix("sand", "paper", 0.15), 0.45 * v)
        if vnoise3(co.x * 9 + 5, co.y * 9, 1) > 0.66:
            c = lerp3(c, mix("rust", "ink", 0.45), 0.4)
        # ocelli: orange spots ringed dark, scattered but never on the fins' edge
        for (sx, sy, r) in ((0.08, 0.05, 0.027), (-0.07, -0.02, 0.025), (0.04, -0.11, 0.023), (-0.1, 0.1, 0.021),
                            (0.12, -0.05, 0.02), (-0.02, 0.06, 0.019), (0.0, -0.18, 0.018), (-0.12, -0.12, 0.019)):
            d = math.hypot(co.x - sx, co.y - sy)
            if d < r:
                return lerp3("coral", "fish_orange", 0.4)
            if d < r + 0.006:
                return lerp3(c, "ink", 0.5)
        return c
    paint(o, col)
    export([o], "flounder")


def seahorse():
    reset()
    parts = []
    m = white()
    # The tail: a tapering spiral curled under the body.
    tail_pts = []
    tail_r = []
    for i in range(30):
        t = i / 29
        if t < 0.45:
            u = t / 0.45
            p = Vector((0, -0.02 + 0.03 * u, 0.12 - 0.2 * u))
        else:
            u = (t - 0.45) / 0.55
            ang = u * math.radians(330)
            rad = 0.07 * (1 - 0.65 * u)
            p = Vector((0, 0.01 + math.sin(ang) * rad * 1.0 - 0.0, -0.08 + (math.cos(ang) - 1.0) * rad * -1.0 - 0.07))
        tail_pts.append(p)
        tail_r.append(0.03 * (1 - t) ** 0.9 + 0.006)
    parts.append(tube(tail_pts, tail_r, m, sides=8))
    # The trunk: arched forward, a pot belly, bony rings.
    trunk = [Vector((0, -0.02, 0.1)), Vector((0, 0.0, 0.17)), Vector((0, 0.01, 0.24)), Vector((0, -0.005, 0.3)), Vector((0, -0.03, 0.34))]
    parts.append(tube(trunk, [0.032, 0.045, 0.046, 0.036, 0.03], m, sides=10))
    parts.append(sphere(0.042, (0, 0.025, 0.19), m, scale=(0.85, 1.0, 1.3), segs=12, rings=8))
    # The head at a right angle, with its long tube snout and coronet.
    parts.append(sphere(0.034, (0, -0.02, 0.36), m, scale=(0.85, 1.25, 1.0), segs=12, rings=8))
    parts.append(tube([Vector((0, 0.0, 0.355)), Vector((0, 0.05, 0.345)), Vector((0, 0.1, 0.34))], [0.014, 0.011, 0.012], m, sides=8))
    for k in range(5):
        a = k * math.tau / 5
        parts.append(cyl(0.006, 0.02, (math.cos(a) * 0.01, -0.035 + math.sin(a) * 0.01, 0.395), m, verts=4, r2=0.002))
    # little spines down the back
    for k in range(7):
        t = k / 6
        p = Vector((0, -0.048 - 0.01 * math.sin(t * 3), 0.13 + t * 0.2))
        parts.append(cyl(0.006, 0.018, p, m, rot=(math.radians(-70), 0, 0), verts=4, r2=0.001))
    fm = mat("fin_clear", mix("paper", "fish_orange", 0.3), rough=0.4)
    pts = [Vector((0.0, -0.05 - 0.035 * math.sin(u * math.pi), 0.16 + 0.08 * u)) for u in [k / 11 for k in range(12)]]
    parts.append(fin((0, -0.045, 0.16), (0, -0.045, 0.24), pts, (1, 0, 0), thick=0.006, rays=9, scallop=0.1, m=fm))
    parts += pair_eyes(-0.012, 0.37, 0.03, 0.013, fwd=0.6, iris="sand")
    o = join(parts, "seahorse")
    finish(o, 19, 0.4)
    base = mix("fish_orange", "sand", 0.35)

    def col(co, n):
        c = lerp3(base, mix("fish_orange", "coral", 0.3), 0.5 + 0.5 * math.sin(co.z * 3.0))
        # bony rings: a darker line every couple of centimetres
        if (co.z * 48 + co.y * 10) % 1.0 < 0.18:
            c = lerp3(c, "rust", 0.35)
        if co.y > 0.015 and 0.12 < co.z < 0.28:
            c = lerp3(c, "belly", 0.4)   # pale belly
        if hash3(math.floor(co.x * 90), math.floor(co.y * 90), math.floor(co.z * 90)) > 0.9:
            c = lerp3(c, (1, 1, 1), 0.5)   # white flecks
        return c
    paint(o, col)
    export([o], "seahorse")


# --- Things with shells and legs ---------------------------------------------------------------
def leg(points, r0, r1, m, sides=6):
    pts = [Vector(p) for p in points]
    n = len(pts)
    return tube(pts, [r0 + (r1 - r0) * i / (n - 1) for i in range(n)], m, sides=sides)


def claw(base, direction, size, m, open_deg=24, side=1):
    """A crab or lobster claw: a swollen palm, a fixed finger and a hinged
    finger, gaping a little."""
    d = Vector(direction).normalized()
    up = Vector((0, 0, 1))
    s = d.cross(up).normalized()
    up = s.cross(d).normalized()
    b = Vector(base)
    parts = []
    palm = [b, b + d * size * 0.45, b + d * size * 0.8]
    parts.append(tube(palm, [size * 0.17, size * 0.24, size * 0.2], m, sides=10, flat=0.7))
    tip0 = b + d * size * 0.8
    fixed = [tip0 - up * size * 0.06, tip0 + d * size * 0.35 - up * size * 0.08, tip0 + d * size * 0.6 - up * size * 0.02]
    parts.append(tube(fixed, [size * 0.09, size * 0.06, size * 0.02], m, sides=6, flat=0.8))
    ang = math.radians(open_deg)
    dm = (d * math.cos(ang) + up * math.sin(ang)).normalized()
    mov = [tip0 + up * size * 0.07, tip0 + up * size * 0.08 + dm * size * 0.33, tip0 + up * size * 0.03 + dm * size * 0.58]
    parts.append(tube(mov, [size * 0.09, size * 0.06, size * 0.02], m, sides=6, flat=0.8))
    return parts


def crab():
    """The hermit crab, in a borrowed whelk shell."""
    reset()
    parts = []
    shell_m = mat("shell", (1.0, 1.0, 1.0), rough=0.45)
    # A whelk: a lathed spire of swelling whorls with sunken sutures, twisted
    # so the sutures spiral, carried on its side with the aperture forward.
    prof = [(0.0, 0.3), (0.012, 0.29), (0.026, 0.268), (0.022, 0.258), (0.042, 0.232), (0.036, 0.218), (0.064, 0.182),
            (0.056, 0.164), (0.094, 0.115), (0.112, 0.07), (0.108, 0.03), (0.08, -0.005), (0.042, -0.03), (0.022, -0.06),
            (0.012, -0.08), (0.0, -0.082)]
    shell = lathe(prof, 22, "shell", shell_m)
    from kit import twist as _tw
    _tw(shell, math.radians(140), "Z")
    shell.rotation_euler = (math.radians(-78), 0, math.radians(14))
    shell.location = (0, -0.1, 0.075)
    parts.append(shell)
    parts.append(sphere(0.06, (0, 0.03, 0.05), mat("aperture", mix("coral", "paper", 0.55), rough=0.4), scale=(1.15, 0.5, 0.9), segs=12, rings=8))
    cm = mat("crab_red", mix("coral", "rust", 0.25), rough=0.5)
    # head and front legs coming out of the aperture
    parts.append(sphere(0.045, (0, 0.06, 0.05), cm, scale=(1.2, 1.0, 0.75), segs=12, rings=8))
    parts += claw((0.05, 0.08, 0.04), (0.6, 1.0, 0.05), 0.15, cm, side=1)          # the big right claw
    parts += claw((-0.045, 0.08, 0.045), (-0.4, 1.0, 0.1), 0.09, cm, side=-1)
    for sx in (-1, 1):
        for k in range(2):
            y = 0.04 - k * 0.035
            parts.append(leg([(sx * 0.04, y, 0.04), (sx * 0.1, y + 0.03, 0.08), (sx * 0.16, y + 0.05, 0.02), (sx * 0.19, y + 0.07, -0.03)], 0.014, 0.006, cm))
    for sx in (-1, 1):
        parts.append(tube([Vector((sx * 0.015, 0.09, 0.07)), Vector((sx * 0.025, 0.11, 0.12))], [0.006, 0.006], cm, sides=6))
        parts += eye((sx * 0.027, 0.112, 0.128), 0.012, look=(sx * 0.5, 1, 0.3), iris="ink")
        parts.append(tube([Vector((sx * 0.01, 0.1, 0.06)), Vector((sx * 0.05, 0.2, 0.12)), Vector((sx * 0.1, 0.27, 0.1))], [0.003, 0.002, 0.0015], cm, sides=4))
    o = join(parts, "crab")
    finish(o, 21, 0.3)
    # Bands on the shell, in the shell's own frame (along its axis, spiralling).
    from mathutils import Euler, Matrix
    inv = (Matrix.Translation((0, -0.1, 0.075)) @ Euler((math.radians(-78), 0, math.radians(14))).to_matrix().to_4x4()).inverted()

    def col(co, n, mn):
        if mn != "shell":
            return (1, 1, 1)
        q = inv @ Vector(co)
        ang = math.atan2(q.y, q.x)
        band = 0.5 + 0.5 * math.sin(q.z * 95 + ang * 1.0)
        c = lerp3(mix("paper", "sand", 0.25), mix("rust", "sand", 0.3), 0.6 * band ** 2)
        if (q.z * 140 + ang * 3) % 6.28 < 0.5:
            c = lerp3(c, mix("rust", "ink", 0.3), 0.5)
        return c
    paint_mat(o, col)
    export([o], "crab")


def crab_helper():
    """The salvage crab: a broad shore crab in a yellow sou'wester."""
    reset()
    cm = mat("crab_red2", mix("coral", "rust", 0.35), rough=0.5)
    parts = []
    prof = [(0.0, (0.12, 0.05, 0.0, 2.6)), (0.5, (0.2, 0.08, 0.01, 2.8)), (1.0, (0.12, 0.05, 0.0, 2.4))]
    cara = body(0.26, prof, segs=22, steps=14, m=cm, name="carapace")
    # the front edge serrated, the back rounded
    for v in cara.data.vertices:
        if v.co.y > 0.08 and v.co.z > -0.01:
            v.co.y += 0.008 * math.sin(v.co.x * 90)
    parts.append(cara)
    parts += claw((0.16, 0.08, 0.02), (0.7, 0.9, 0.15), 0.22, cm)
    parts += claw((-0.16, 0.08, 0.02), (-0.7, 0.9, 0.15), 0.2, cm, open_deg=14)
    for sx in (-1, 1):
        for k in range(4):
            y = 0.05 - k * 0.05
            spread = 0.22 + 0.02 * k
            parts.append(leg([(sx * 0.17, y, 0.0), (sx * spread, y - 0.02 * k, 0.07), (sx * (spread + 0.08), y - 0.04 * k, 0.0),
                              (sx * (spread + 0.11), y - 0.05 * k, -0.08)], 0.02, 0.007, cm))
        parts.append(tube([Vector((sx * 0.04, 0.12, 0.05)), Vector((sx * 0.05, 0.14, 0.1))], [0.008, 0.008], cm, sides=6))
        parts += eye((sx * 0.05, 0.142, 0.11), 0.016, look=(sx * 0.4, 1, 0.2), iris="ink")
    # the sou'wester: a lathed crown and a broad brim, longer at the back
    hat = mat("oilskin", mix("paint_yellow", "sand", 0.15), rough=0.35)
    crown = lathe([(0.0, 0.2), (0.05, 0.198), (0.085, 0.17), (0.095, 0.12), (0.1, 0.1), (0.0, 0.1)], 16, "crown", hat)
    crown.location = (0, -0.01, 0.0)
    brim = lathe([(0.0, 0.1), (0.1, 0.1), (0.17, 0.085), (0.18, 0.08), (0.0, 0.09)], 20, "brim", hat)
    for v in brim.data.vertices:
        if v.co.y < 0:
            v.co.y *= 1.35
            v.co.z -= 0.03 * min(1, -v.co.y / 0.17)
    parts += [crown, brim]
    o = join(parts, "crab_helper")
    finish(o, 23, 0.6)
    export([o], "crab_helper")


def starfish():
    reset()
    m = white()
    parts = [sphere(0.07, (0, 0, 0.02), m, scale=(1, 1, 0.45), segs=16, rings=8)]
    rnd = random.Random(12)
    for k in range(5):
        a = k * math.tau / 5 + rnd.uniform(-0.12, 0.12)
        L = rnd.uniform(0.2, 0.26)
        curl = rnd.uniform(-0.35, 0.35)
        lift = rnd.uniform(0.0, 0.05) if k != 2 else 0.09
        rings = []
        steps = 14
        for i in range(steps + 1):
            t = i / steps
            r = 0.03 + t * L
            aa = a + curl * t * t
            c = Vector((math.cos(aa) * r, math.sin(aa) * r, 0.012 + lift * t ** 2.5))
            fwd = Vector((math.cos(aa), math.sin(aa), 0))
            side = Vector((-fwd.y, fwd.x, 0))
            w = 0.045 * (1 - t) ** 0.85 + 0.006
            hh = 0.032 * (1 - t) ** 0.9 + 0.005
            ring = []
            for j in range(10):
                u = j / 10 * math.tau
                cu, su = math.cos(u), math.sin(u)
                ring.append(c + side * cu * w + Vector((0, 0, max(su, -0.3) * hh)))
            rings.append(ring)
        parts.append(loft(rings, "arm", m))
        # the knobbly ridge down each arm
        for i in range(2, 13, 2):
            t = i / 14
            r = 0.03 + t * L
            aa = a + curl * t * t
            parts.append(sphere(0.012 * (1 - t * 0.6), (math.cos(aa) * r, math.sin(aa) * r, 0.012 + lift * t ** 2.5 + 0.03 * (1 - t) ** 0.9), m, segs=6, rings=4))
    o = join(parts, "starfish")
    finish(o, 25, 0.5, angle=70)
    base = mix("coral", "sand", 0.42)

    def col(co, n):
        if n.z < -0.3:
            return lerp3("belly", base, 0.3)
        r = math.hypot(co.x, co.y)
        c = lerp3(mix("coral", "rust", 0.2), base, min(1.0, r * 4))
        if co.z > 0.03 and hash3(math.floor(co.x * 60), math.floor(co.y * 60), 1) > 0.6:
            c = lerp3(c, mix("paper", "sand", 0.2), 0.6)
        return c
    paint(o, col)
    export([o], "starfish")


def urchin():
    reset()
    m = white()
    parts = [sphere(0.12, (0, 0, 0.09), m, scale=(1, 1, 0.78), segs=18, rings=12)]
    sp = mat("spine", mix(mix("coral", "teal", 0.55), "ink", 0.3), rough=0.45)
    rnd = random.Random(14)
    golden = math.pi * (3 - math.sqrt(5))
    n = 150
    for k in range(n):
        zz = 1 - (k / (n - 1)) * 1.6
        if zz < -0.55:
            continue
        rr = math.sqrt(max(0.0, 1 - zz * zz))
        a = k * golden
        d = Vector((math.cos(a) * rr, math.sin(a) * rr, zz)).normalized()
        base = Vector((0, 0, 0.09)) + Vector((d.x * 0.12, d.y * 0.12, d.z * 0.094))
        ln = rnd.uniform(0.11, 0.19) * (0.7 if zz > 0.85 else 1.0)
        dd = (d + Vector((rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0.05))).normalized()
        c = cyl(0.007, ln, base + dd * ln * 0.5, sp, verts=4, r2=0.0008)
        c.rotation_mode = "QUATERNION"
        c.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(dd)
        parts.append(c)
    o = join(parts, "urchin")
    finish(o, 27, 0.4, angle=70)

    def col(co, n):
        r = (Vector(co) - Vector((0, 0, 0.09))).length
        return lerp3(mix(mix("coral", "teal", 0.5), "ink", 0.35), mix(mix("coral", "teal", 0.45), "paper", 0.25), min(1, max(0, (r - 0.13) * 9)))
    paint(o, col)
    export([o], "urchin")


def octopus():
    reset()
    m = white()
    parts = []
    # the mantle: a soft sack leaning back, the head and eyes in front of it
    mant = body(0.34, [(0.0, (0.02, 0.02, 0.0, 2.0)), (0.25, (0.11, 0.1, 0.0, 2.0)), (0.6, (0.14, 0.13, 0.0, 2.0)),
                       (0.9, (0.11, 0.1, 0.0, 2.0)), (1.0, (0.07, 0.06, 0.0, 2.0))], segs=20, steps=16, m=m, name="mantle")
    mant.rotation_euler = (math.radians(-125), 0, 0)
    mant.location = (0, -0.11, 0.22)
    parts.append(mant)
    parts.append(sphere(0.1, (0, 0.03, 0.1), m, scale=(1.05, 0.9, 0.8), segs=16, rings=10))
    for sx in (-1, 1):
        parts += eye((sx * 0.075, 0.06, 0.15), 0.028, look=(sx, 0.5, 0.25), iris="sand", lid="white")
    # eight arms radiating, each curling at the tip, one or two raised
    rnd = random.Random(16)
    for k in range(8):
        a = k * math.tau / 8 + math.pi / 8 + rnd.uniform(-0.1, 0.1)
        L = rnd.uniform(0.34, 0.44)
        curl = rnd.choice([-1, 1]) * rnd.uniform(2.5, 4.0)
        raise_ = 0.12 if k in (1, 6) else 0.0
        pts = []
        rs = []
        for i in range(18):
            t = i / 17
            r = 0.05 + L * t
            aa = a + (curl * max(0.0, t - 0.55) ** 2)
            ra = r - max(0.0, t - 0.7) * 0.25
            z = 0.06 * (1 - t) + raise_ * math.sin(t * math.pi) + 0.012
            pts.append(Vector((math.cos(aa) * ra, math.sin(aa) * ra, z)))
            rs.append(0.035 * (1 - t) ** 1.1 + 0.004)
        parts.append(tube(pts, rs, m, sides=8, flat=0.75))
    o = join(parts, "octopus")
    finish(o, 29, 0.8, angle=70)

    def col(co, n):
        base = lerp3(mix("coral", "rust", 0.3), mix("coral", "paper", 0.35), 0.5 - n.z * 0.5)
        if n.z < -0.4 and hash3(math.floor(co.x * 70), math.floor(co.y * 70), 2) > 0.5:
            return lerp3(base, (1, 0.95, 0.9), 0.55)      # sucker rows underneath
        v = vnoise3(co.x * 18, co.y * 18, co.z * 18)
        return lerp3(base, mix("rust", "ink", 0.3), 0.45 * max(0, v - 0.45) * 2.5)
    paint(o, col)
    export([o], "octopus")


def turtle():
    reset()
    m = white()
    parts = []
    # carapace: a domed shield, highest a little behind the middle, with a keel
    shell_rings = []
    for i in range(23):
        t = i / 22
        y = -0.42 + t * 0.86
        w = 0.36 * math.sin(math.pi * (0.06 + 0.88 * t)) ** 0.6
        hh = 0.2 * math.sin(math.pi * (0.04 + 0.9 * t)) ** 0.8
        ring = []
        for k in range(24):
            a = k / 24 * math.pi
            x = -math.cos(a) * w
            z = math.sin(a) ** 0.85 * hh + 0.02 * math.sin(a) ** 8
            ring.append(Vector((x, y, z + 0.06)))
        ring.append(Vector((w * 0.7, y, 0.035)))
        ring.append(Vector((-w * 0.7, y, 0.035)))
        shell_rings.append(ring)
    car = loft(shell_rings, "carapace", m)
    parts.append(car)
    parts.append(sphere(0.3, (0, 0.0, 0.05), mat("plastron", mix("paper", "sand", 0.35), rough=0.6), scale=(1.12, 1.35, 0.18), segs=20, rings=8))
    sk = mat("skin", mix(mix("kelp", "sand", 0.45), "ink", 0.15), rough=0.6)
    # head and neck, a hooked beak
    parts.append(tube([Vector((0, 0.34, 0.08)), Vector((0, 0.46, 0.1)), Vector((0, 0.54, 0.11))], [0.07, 0.065, 0.06], sk, sides=12))
    parts.append(sphere(0.095, (0, 0.6, 0.13), sk, scale=(0.95, 1.3, 0.85), segs=14, rings=10))
    parts.append(sphere(0.04, (0, 0.71, 0.11), mat("beak_h", mix("sand", "ink", 0.35), rough=0.4), scale=(1.1, 1.0, 0.7), segs=8, rings=6))
    parts += pair_eyes(0.64, 0.16, 0.074, 0.021, fwd=0.4, iris="ink")
    # front flippers: long paddles swept back; rear: short
    for sx in (-1, 1):
        fl = body(0.55, [(0.0, (0.012, 0.006, 0.0, 2.0)), (0.3, (0.07, 0.016, 0.0, 2.2)), (0.7, (0.085, 0.02, 0.0, 2.2)), (1.0, (0.04, 0.02, 0.0, 2.0))],
                  segs=12, steps=12, m=sk, name="flipper")
        fl.rotation_euler = (0, math.radians(sx * -8), math.radians(sx * -62 + 180))
        fl.location = (sx * 0.43, 0.06, 0.04)
        parts.append(fl)
        rf = body(0.22, [(0.0, (0.01, 0.006, 0.0, 2.0)), (0.5, (0.06, 0.016, 0.0, 2.2)), (1.0, (0.035, 0.016, 0.0, 2.0))],
                  segs=10, steps=8, m=sk, name="rflipper")
        rf.rotation_euler = (0, 0, math.radians(sx * -130 + 180))
        rf.location = (sx * 0.27, -0.42, 0.04)
        parts.append(rf)
    o = join(parts, "turtle")
    finish(o, 31, 1.1, angle=50)
    shell_col = mix("kelp", "rust", 0.45)

    def col(co, n):
        if co.z > 0.06 and abs(co.y) < 0.43 and abs(co.x) < 0.37 and n.z > -0.2 and abs(co.y) < 0.45 - 0.0:
            # scutes: a row of five down the middle, four each side, edged dark, streaked
            sx = co.x / 0.36
            sy = co.y / 0.43
            if abs(sx) < 0.33:
                cell = math.floor((sy + 1) * 2.5)
                fy = ((sy + 1) * 2.5) % 1.0
                edge = min(fy, 1 - fy, (0.33 - abs(sx)) * 3.0)
            else:
                cell = math.floor((sy + 1) * 2.0) + 10 * (1 if sx > 0 else -1)
                fy = ((sy + 1) * 2.0) % 1.0
                edge = min(fy, 1 - fy, (abs(sx) - 0.33) * 3.0, (1.0 - abs(sx)) * 4.0)
            c = lerp3(shell_col, mix("sand", "rust", 0.3), 0.3 * hash3(cell, 1, 1))
            c = lerp3(c, mix("rust", "ink", 0.4), 0.35 * (0.5 + 0.5 * math.sin(math.atan2(co.y, co.x) * 9)))
            if edge < 0.06:
                c = lerp3(c, "ink", 0.6)
            return c
        # skin: pale scales outlined dark
        cx, cy, cz = co.x * 40, co.y * 40, co.z * 40
        v = vnoise3(cx, cy, cz)
        return lerp3((1, 1, 1), (0.6, 0.6, 0.55), 0.6 if 0.45 < v < 0.52 else 0.0)
    paint(o, col)
    export([o], "turtle")


def moray():
    reset()
    L = 1.5
    prof = [(0.0, (0.008, 0.03, 0.0, 2.0)), (0.2, (0.025, 0.05, 0.0, 2.2)), (0.6, (0.04, 0.065, 0.0, 2.3)),
            (0.88, (0.045, 0.07, 0.0, 2.2)), (0.96, (0.035, 0.05, -0.005, 2.1)), (1.0, (0.012, 0.018, -0.01, 2.0))]
    b = body(L, prof, segs=16, steps=44, m=white(), name="body",
             axis_curve=lambda t: (0.14 * math.sin(t * 2.6 * math.pi + 0.4) * (1 - t * 0.6), 0.03 * math.sin(t * 5)))
    parts = [b]
    fm = mat("fin_moray", mix("kelp", "ink", 0.3), rough=0.6)
    # the dorsal fin runs from behind the head to the tail and round under it
    root = []
    edge = []
    n = 40
    for k in range(n):
        u = k / (n - 1)
        t = 0.02 + u * 0.8
        y = -L / 2 + t * L
        w, h, zo, sq = spline(prof, t)
        dx = 0.14 * math.sin(t * 2.6 * math.pi + 0.4) * (1 - t * 0.6)
        dz = 0.03 * math.sin(t * 5)
        root.append(Vector((dx, y, zo + dz + h * 0.95)))
        edge.append(Vector((dx, y, zo + dz + h * 0.95 + 0.03 + 0.012 * math.sin(u * math.pi))))
    for k in range(n - 1):
        parts.append(fin(root[k], root[k + 1], [edge[k], edge[k + 1]], (1, 0, 0), thick=0.006, steps=2, m=fm))
    # the open mouth: a lower jaw dropped a little, a few teeth
    jaw = body(0.14, [(0.0, (0.035, 0.012, 0.0, 2.0)), (1.0, (0.012, 0.008, 0.0, 2.0))], segs=10, steps=6, m=white(), name="jaw")
    jaw.rotation_euler = (math.radians(14), 0, 0)
    jaw.location = (0.0, L / 2 - 0.06, -0.05)
    parts.append(jaw)
    tooth = mat("tooth", mix("paper", "sand", 0.2), rough=0.3)
    for k in range(5):
        for sx in (-1, 1):
            parts.append(cyl(0.004, 0.018, (sx * 0.018, L / 2 - 0.09 + k * 0.012, -0.03), tooth, verts=4, r2=0.0005))
    parts += body_eyes(prof, L, 0.955, 0.016, elev=0.45, fwd=0.5, iris="paint_yellow")
    for sx in (-1, 1):
        parts.append(tube([Vector((sx * 0.012, L / 2 - 0.01, 0.0)), Vector((sx * 0.016, L / 2 + 0.01, 0.012))], [0.004, 0.003], white(), sides=4))
    o = join(parts, "moray")
    finish(o, 33, 1.0, angle=60)
    base = mix(mix("kelp", "ink", 0.35), "sand", 0.1)

    def col(co, n):
        # a dark body netted with pale yellow-green: honeycomb reticulation
        v = vnoise3(co.x * 26, co.y * 26, co.z * 26)
        c = lerp3(base, mix("paint_yellow", "kelp_light", 0.5), 0.75 if 0.42 < v < 0.55 else 0.0)
        if n.z < -0.6:
            c = lerp3(c, mix("kelp_light", "paper", 0.3), 0.5)
        return c
    paint(o, col)
    export([o], "moray")


def lobster():
    reset()
    m = white()
    parts = []
    # carapace with a rostrum
    cara = body(0.26, [(0.0, (0.05, 0.05, 0.0, 2.2)), (0.5, (0.065, 0.065, 0.005, 2.3)), (0.85, (0.05, 0.05, 0.005, 2.2)),
                       (1.0, (0.01, 0.012, 0.02, 2.0))], segs=16, steps=12, m=m, name="cara")
    cara.location = (0, 0.12, 0.08)
    parts.append(cara)
    # abdomen: six overlapping plates, each a short flared loft, arching down
    for k in range(6):
        y = -0.02 - k * 0.055
        w = 0.055 - k * 0.004
        seg = body(0.065, [(0.0, (w * 0.92, w * 0.62, 0.0, 2.6)), (0.8, (w * 1.05, w * 0.72, 0.004, 2.6)), (1.0, (w * 0.95, w * 0.66, 0.0, 2.6))],
                   segs=14, steps=4, m=m, name="seg")
        seg.location = (0, y, 0.075 - k * 0.007)
        seg.rotation_euler = (math.radians(-4 * k), 0, 0)
        parts.append(seg)
    # tail fan
    for (dx, ang, ln) in ((0.0, 0.0, 0.08), (0.035, 0.45, 0.075), (-0.035, -0.45, 0.075), (0.06, 0.9, 0.065), (-0.06, -0.9, 0.065)):
        root = Vector((dx * 0.5, -0.34, 0.04))
        e = root + Vector((math.sin(ang) * ln, -math.cos(ang) * ln, -0.01))
        side = Vector((math.cos(ang), math.sin(ang), 0)) * 0.022
        pts = [root + side * 0.5 + (e - root) * 0.5 + side * 0.5, e + side * 0.6, e - side * 0.6, root - side * 0.5 + (e - root) * 0.5 - side * 0.5]
        parts.append(fin(root + side * 0.5, root - side * 0.5, _resample(pts, 8), (0, 0, 1), thick=0.008, rays=0, m=m))
    # claws on jointed arms: crusher (right), cutter (left)
    for sx, size, op in ((1, 0.27, 16), (-1, 0.23, 26)):
        arm = [Vector((sx * 0.05, 0.18, 0.06)), Vector((sx * 0.1, 0.24, 0.1)), Vector((sx * 0.13, 0.32, 0.08))]
        parts.append(tube(arm, [0.026, 0.024, 0.028], m, sides=8))
        parts += claw((sx * 0.13, 0.32, 0.08), (sx * 0.25, 1, 0.0), size, m, open_deg=op)
    # walking legs, antennae, eyes
    for sx in (-1, 1):
        for k in range(4):
            y = 0.17 - k * 0.04
            parts.append(leg([(sx * 0.05, y, 0.05), (sx * 0.12, y + 0.01, 0.08), (sx * 0.17, y - 0.01, 0.0), (sx * 0.19, y - 0.02, -0.03)], 0.009, 0.004, m))
        parts.append(tube([Vector((sx * 0.015, 0.25, 0.1)), Vector((sx * 0.08, 0.4, 0.16)), Vector((sx * 0.22, 0.5, 0.12)),
                           Vector((sx * 0.34, 0.45, 0.06)), Vector((sx * 0.4, 0.3, 0.02))], [0.006, 0.005, 0.004, 0.003, 0.002], m, sides=4))
        parts.append(tube([Vector((sx * 0.01, 0.26, 0.1)), Vector((sx * 0.03, 0.33, 0.14))], [0.003, 0.002], m, sides=4))
        parts += eye((sx * 0.025, 0.25, 0.115), 0.012, look=(sx * 0.5, 1, 0.2), iris="ink")
    o = join(parts, "lobster")
    finish(o, 35, 0.6, angle=55)
    blue = mix(mix("teal", "ink", 0.25), "shoal", 0.12)

    def col(co, n):
        c = lerp3(blue, mix("teal", "paper", 0.4), 0.5 - n.z * 0.5)
        if hash3(math.floor(co.x * 80), math.floor(co.y * 80), math.floor(co.z * 80)) > 0.85:
            c = lerp3(c, mix("paper", "teal", 0.2), 0.5)
        if abs(co.x) > 0.3 or co.y > 0.42:
            c = lerp3(c, mix("coral", "rust", 0.3), 0.55)     # antennae warm towards the tips
        return c
    paint(o, col)
    export([o], "lobster")


def whale():
    """The grey whale calf: mottled, barnacled, no dorsal fin but a hump and
    a row of knuckles down the tail stock."""
    reset()
    L = 5.0
    prof = [(0.0, (0.12, 0.1, 0.06, 2.0)), (0.12, (0.2, 0.22, 0.1, 2.2)), (0.4, (0.55, 0.58, 0.05, 2.1)),
            (0.66, (0.66, 0.66, 0.0, 2.1)), (0.85, (0.55, 0.52, -0.05, 2.1)), (0.95, (0.36, 0.34, -0.1, 2.2)), (1.0, (0.12, 0.12, -0.16, 2.0))]
    b = body(L, prof, segs=28, steps=36, m=white(), name="body", axis_curve=lambda t: (0.0, -0.12 * max(0, t - 0.8) * 5 * (t - 0.8)))
    # the dorsal hump and knuckles
    for v in b.data.vertices:
        t = v.co.y / L + 0.5
        if v.co.z > 0.2 and 0.12 < t < 0.42:
            k = math.sin((t - 0.12) / 0.3 * math.pi * 7) * 0.5 + 0.5
            v.co.z += 0.05 * k * math.sin((t - 0.12) / 0.3 * math.pi)
        if v.co.z > 0.3 and 0.42 < t < 0.5:
            v.co.z += 0.09 * math.sin((t - 0.42) / 0.08 * math.pi)
    parts = [b]
    fm = white()
    # flukes: broad, notched in the middle
    pts = [Vector((0.08, -L / 2 + 0.1, 0.06)), Vector((0.6, -L / 2 - 0.2, 0.08)), Vector((1.05, -L / 2 - 0.55, 0.05)), Vector((0.9, -L / 2 - 0.62, 0.04)),
           Vector((0.45, -L / 2 - 0.42, 0.06)), Vector((0.08, -L / 2 - 0.5, 0.06)), Vector((0.0, -L / 2 - 0.4, 0.06)),
           Vector((-0.08, -L / 2 - 0.5, 0.06)), Vector((-0.45, -L / 2 - 0.42, 0.06)), Vector((-0.9, -L / 2 - 0.62, 0.04)), Vector((-1.05, -L / 2 - 0.55, 0.05)),
           Vector((-0.6, -L / 2 - 0.2, 0.08)), Vector((-0.08, -L / 2 + 0.1, 0.06))]
    parts.append(fin((0.08, -L / 2 + 0.12, 0.06), (-0.08, -L / 2 + 0.12, 0.06), _resample(pts, 30), (0, 0, 1), thick=0.09, steps=5, m=fm))
    for sx in (-1, 1):
        fl = body(1.0, [(0.0, (0.03, 0.02, 0.0, 2.0)), (0.4, (0.16, 0.05, 0.0, 2.2)), (0.85, (0.15, 0.05, 0.0, 2.2)), (1.0, (0.06, 0.04, 0.0, 2.0))],
                  segs=12, steps=12, m=fm, name="flipper")
        fl.rotation_euler = (math.radians(-10), math.radians(sx * 20), math.radians(sx * -55 + 180))
        fl.location = (sx * 0.72, 1.05, -0.36)
        parts.append(fl)
    parts += pair_eyes(1.95, -0.08, 0.5, 0.05, fwd=0.2, up=0.0, iris="ink")
    o = join(parts, "whale")
    finish(o, 37, 4.0, angle=60, wob=0.0008)
    # barnacle patches on the head and back
    bm = mat("barnacle", mix("paper", "sand", 0.3), rough=0.7)
    extras = []
    for (p, n, r) in (((0.15, 2.0, 0.35), 18, 0.18), ((-0.2, 1.6, 0.5), 14, 0.2), ((0.3, 0.6, 0.55), 10, 0.2), ((-0.05, 2.35, 0.1), 10, 0.12)):
        extras += barnacle_cluster(o, n, p, r, seed=int(p[1] * 10), size=0.035, m=bm)
    o = join([o] + extras, "whale")
    ao(o, 0.8, rays=10, strength=0.5, seed=38, edge=0.4, top=0.1)
    grey = mix("ink", "paper", 0.42)

    def col(co, n):
        c = lerp3(grey, mix("ink", "paper", 0.25), 0.5 + 0.5 * n.z * 0.4)
        v = vnoise3(co.x * 3.2, co.y * 3.2, co.z * 3.2)
        c = lerp3(c, mix("paper", "sand", 0.25), 0.7 if v > 0.68 else 0.0)            # pale scars and patches
        if co.y > 1.6 and -0.3 < co.z < -0.18 and abs(abs(co.x) - 0.45) < 0.25:
            c = lerp3(c, "ink", 0.5)                                                   # the mouth line
        if co.y > 1.2 and co.z < -0.45 and abs(co.x) < 0.25 and (abs(co.x) * 18) % 1.0 < 0.2:
            c = lerp3(c, "ink", 0.35)                                                  # throat grooves
        if v < 0.22 and co.z > 0.2:
            c = lerp3(c, mix("coral", "sand", 0.5), 0.35)                              # whale lice patches
        return c
    paint(o, col)
    export([o], "whale")


def pelican():
    reset()
    m = white()
    parts = []
    bd = body(0.9, [(0.0, (0.06, 0.05, 0.03, 2.0)), (0.3, (0.17, 0.15, 0.0, 2.0)), (0.65, (0.19, 0.17, 0.0, 2.0)), (1.0, (0.08, 0.08, 0.06, 2.0))],
              segs=16, steps=14, m=m, name="body")
    parts.append(bd)
    neck = [Vector((0, 0.38, 0.06)), Vector((0, 0.5, 0.22)), Vector((0, 0.46, 0.4)), Vector((0, 0.52, 0.52))]
    parts.append(tube(neck, [0.07, 0.06, 0.055, 0.06], m, sides=10))
    parts.append(sphere(0.075, (0, 0.56, 0.55), m, scale=(0.9, 1.25, 0.9), segs=12, rings=8))
    bill = mat("bill", mix("paint_yellow", "coral", 0.35), rough=0.4)
    upper = body(0.48, [(0.0, (0.035, 0.018, 0.0, 2.4)), (0.85, (0.028, 0.012, 0.0, 2.4)), (1.0, (0.014, 0.014, -0.012, 2.0))], segs=10, steps=10, m=bill, name="bill")
    upper.location = (0, 0.84, 0.53)
    upper.rotation_euler = (math.radians(-8), 0, 0)
    parts.append(upper)
    pouch = body(0.42, [(0.0, (0.03, 0.03, 0.0, 2.0)), (0.35, (0.045, 0.07, -0.04, 2.0)), (0.8, (0.03, 0.04, -0.01, 2.0)), (1.0, (0.01, 0.01, 0.0, 2.0))],
                 segs=10, steps=10, m=mat("pouch", mix("coral", "sand", 0.45), rough=0.5), name="pouch")
    pouch.location = (0, 0.8, 0.5)
    pouch.rotation_euler = (math.radians(-8), 0, 0)
    parts.append(pouch)
    parts += pair_eyes(0.6, 0.58, 0.055, 0.014, fwd=0.4, iris="paint_yellow")
    legm = mat("foot", mix("coral", "sand", 0.25), rough=0.5)
    for sx in (-1, 1):
        parts.append(tube([Vector((sx * 0.07, 0.0, -0.12)), Vector((sx * 0.08, -0.04, -0.22))], [0.014, 0.012], legm, sides=6))
        parts.append(fin((sx * 0.08, -0.03, -0.23), (sx * 0.08, -0.05, -0.23),
                         [Vector((sx * 0.05, 0.03, -0.24)), Vector((sx * 0.08, 0.05, -0.24)), Vector((sx * 0.11, 0.03, -0.24))], (0, 0, 1), thick=0.008, m=legm))
    tail = fin((-0.05, -0.42, 0.04), (0.05, -0.42, 0.04), [Vector((-0.08, -0.55, 0.02)), Vector((0, -0.6, 0.02)), Vector((0.08, -0.55, 0.02))], (0, 0, 1), thick=0.03, m=m)
    parts.append(tail)
    o = join(parts, "pelican")
    finish(o, 39, 1.0, angle=60)

    def bodycol(co, n):
        c = lerp3((0.97, 0.96, 0.92), mix("paper", "ink", 0.18), 0.5 + 0.5 * math.tanh((co.z - 0.05) * 6))
        if co.y > 0.45 and co.z > 0.45:
            c = lerp3(c, mix("paint_yellow", "paper", 0.5), 0.5)   # the pale yellow crown
        return c
    paint(o, bodycol)
    # wings: separate children the game flaps, with fingered primaries
    wings = []
    for sx, nm in ((1, "WingR"), (-1, "WingL")):
        root_a = Vector((sx * 0.14, 0.18, 0.1))
        root_b = Vector((sx * 0.14, -0.2, 0.1))
        outline = []
        for k in range(16):
            u = k / 15
            span = 0.95 * math.sin(math.pi * (0.1 + 0.8 * u)) ** 0.5
            outline.append(Vector((sx * (0.14 + span), 0.18 - u * 0.38 - 0.18 * span * u, 0.12 + 0.05 * span)))
        w = fin(root_a, root_b, outline, (0, 0, 1), thick=0.045, steps=6, m=white(), name=nm)
        for k in range(5):
            u = 0.25 + k * 0.12
            base = Vector((sx * (0.14 + 0.92 * math.sin(math.pi * (0.1 + 0.8 * u)) ** 0.5), 0.18 - u * 0.38 - 0.16 * u, 0.16))
            tip = base + Vector((sx * 0.16, -0.06 - k * 0.02, -0.01))
            f = ribbon([base, base.lerp(tip, 0.5), tip], [0.03, 0.026, 0.012], normal=(0, 0, 1), thick=0.008, m=white())
            w = join([w, f], nm)
        ao(w, 0.3, rays=8, strength=0.4, seed=40 + sx, edge=0.4)
        paint(w, lambda co, n, sx=sx: lerp3((0.96, 0.95, 0.9), mix("ink", "paper", 0.12), min(1.0, max(0.0, (abs(co.x) - 0.7) * 3.0)) + (0.3 if co.y < -0.12 else 0.0)))
        w.name = nm
        attach(w, o, (sx * 0.14, 0.0, 0.1))
        wings.append(w)
    export([o], "pelican")


ALL = {f.__name__: f for f in [bass, clownfish, puffer, lantern, coelacanth, angler, flounder, seahorse, crab, crab_helper,
                               starfish, urchin, octopus, turtle, moray, lobster, whale, pelican]}

if __name__ == "__main__":
    names = sys.argv[1:] or list(ALL)
    for n in names:
        ALL[n]()
