"""The giant's tools, each held in the giant's own chunky hand (with a denim cuff),
drawn with an ink outline like a cartoon. Grip at the origin; +Y is forward (away
from the giant), +Z up; the hand comes in from the right, palm facing left.

  hand_magnifier  a magnifying glass: turned wooden handle, ridged brass rim, a glass lens
  hand_candle     a fat dripping candle in the fist
  hand_blowtorch  a blue gas canister with a domed top, a valve knob and a brass nozzle
  hand_bottle     a glass bottle to launch paper rockets from
  rocket          a paper rocket on a stick (rolled tube, felt-tip stripes, cone, fins), nose +Z
"""
import math

import bmesh
from kit import (BRASS, CARD, DARK, INK, PAPER, RED, SHINY, SKIN, SKIN_DARK, DENIM, WAX, WOOD, YELLOW, Model, srgb)
from mathutils import Matrix, Vector

GLASS = DARK


def capsule(m, p0, p1, r0, r1, color, flag=CARD, segs=10):
    """A rounded limb from p0 to p1 (radius r0 to r1): a tapered tube with ball ends."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    length = d.length
    q = d.to_track_quat("Z", "Y")
    mat = Matrix.Translation(p0) @ q.to_matrix().to_4x4()
    m._begin()
    bmesh.ops.create_cone(m.bm, cap_ends=False, segments=segs, radius1=r0, radius2=r1, depth=length,
                          matrix=mat @ Matrix.Translation((0, 0, length / 2)))
    faces = m._new()
    m._paint(faces, color, flag, smooth=True)
    out = list(faces)
    for c, r in ((p0, r0), (p1, r1)):
        m._begin()
        bmesh.ops.create_uvsphere(m.bm, u_segments=segs, v_segments=6, radius=r, matrix=Matrix.Translation(c))
        f = m._new()
        m._paint(f, color, flag, smooth=True)
        out += f
    return out


def blob(m, c, size, color, flag=CARD, rot=(0, 0, 0)):
    """A rounded lump (the palm): a scaled, smoothed sphere."""
    m._begin()
    from mathutils import Euler
    mat = Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1.0))
    bmesh.ops.create_uvsphere(m.bm, u_segments=16, v_segments=10, radius=1.0, matrix=mat)
    f = m._new()
    m._paint(f, color, flag, smooth=True)
    return f


def fist(m, rc, z_top=0.07, fr=0.02, sleeve=True):
    """A right fist closed round a vertical handle of radius rc at the origin. The
    fingers curl from the back of the hand (+X) round the front (+Y) to the inside (-X);
    the thumb closes over them; the wrist runs back toward the giant (-Y)."""
    parts = []
    R = rc + fr * 0.95
    zs = [z_top, z_top - fr * 2.05, z_top - fr * 4.1, z_top - fr * 6.0]
    sizes = [1.0, 1.04, 0.98, 0.84]
    for z, s in zip(zs, sizes):
        r = fr * s
        pts = []
        for a, rad in ((-0.55, R + 0.034), (0.25, R + 0.006), (1.25, R), (2.25, R), (3.05, R - 0.002)):
            pts.append(Vector((math.cos(a) * rad, math.sin(a) * rad, z + (0.004 if a > 2 else 0.0))))
        for k in range(len(pts) - 1):
            parts += capsule(m, pts[k], pts[k + 1], r * (1.0 if k < 2 else 0.93), r * (0.97 if k < 2 else 0.9), SKIN)
    # The palm and the back of the hand.
    zc = (zs[0] + zs[-1]) / 2
    parts += blob(m, (R + 0.045, -0.035, zc), (0.05, 0.055, 0.085), SKIN, rot=(0, 0, -0.5))
    # The thumb: from the heel of the palm, round the inside, over the index finger.
    t0 = Vector((R * 0.6 + 0.02, -R - 0.045, zs[1] - 0.01))
    t1 = Vector((-R * 0.35, -R - 0.02, zs[0] + 0.006))
    t2 = Vector((-R - 0.012, R * 0.15, zs[0] + fr * 0.95))
    parts += capsule(m, t0, t1, fr * 1.25, fr * 1.12, SKIN)
    parts += capsule(m, t1, t2, fr * 1.12, fr * 1.0, SKIN)
    # The wrist, and a denim cuff.
    w0 = Vector((R + 0.05, -0.07, zc - 0.01))
    w1 = Vector((R + 0.09, -0.2, zc - 0.07))
    parts += capsule(m, w0, w1, 0.048, 0.05, SKIN)
    if sleeve:
        d = (w1 - w0).normalized()
        c0 = w0 + d * 0.06
        q = d.to_track_quat("Z", "Y")
        m._begin()
        bmesh.ops.create_cone(m.bm, cap_ends=False, segments=16, radius1=0.066, radius2=0.075, depth=0.2,
                              matrix=Matrix.Translation(c0 + d * 0.1) @ q.to_matrix().to_4x4())
        sl = m._new()
        m._paint(sl, DENIM, CARD, smooth=True)
        m._begin()
        bmesh.ops.create_cone(m.bm, cap_ends=False, segments=16, radius1=0.072, radius2=0.072, depth=0.03,
                              matrix=Matrix.Translation(c0 + d * 0.012) @ q.to_matrix().to_4x4())
        cuff = m._new()
        m._paint(cuff, srgb("#33506f"), CARD, smooth=True)
        # Topstitching on the cuff.
        parts += sl + cuff
    m.outline(parts, 0.0035)
    return parts


def lathe(m, base, profile, color, flag=CARD, segs=16):
    """A turned shape round the Z axis from (radius, z) pairs."""
    faces = []
    x, y, z0 = base
    for (r0, z_0), (r1, z_1) in zip(profile, profile[1:]):
        faces += m.cylinder((x, y, z0 + z_0), r0, z_1 - z_0, color, segs, flag, caps=False, radius_top=r1, cuts=0,
                            smooth=True, jitter=0.0)
    return faces


# =====================================================================================
def hand_magnifier(seed=71):
    m = Model("hand_magnifier", seed)
    rc = 0.022
    handle = lathe(m, (0, 0, -0.11), [(0.018, 0.0), (0.024, 0.01), (0.021, 0.04), (0.023, 0.12), (0.02, 0.17), (0.026, 0.19),
                                       (0.026, 0.205)], WOOD)
    m.outline(handle, 0.003)
    ferrule = m.cylinder((0, 0, 0.095), 0.02, 0.04, BRASS, 14, SHINY, cuts=0, jitter=0.0)
    m.outline(ferrule, 0.003)
    fist(m, rc, z_top=0.06)
    # The rim: a ring of brass with ridges, its axis toward the giant (Y).
    cz = 0.25
    rot = (math.pi / 2, 0, 0)
    rim = m.tube((0, 0.012, cz), 0.112, 0.026, BRASS, BRASS, 0.014, 32, SHINY, rot=rot)
    for k in range(24):
        a = k * math.tau / 24
        rim += m.box((math.cos(a) * 0.111, 0.0, cz + math.sin(a) * 0.111), (0.004, 0.029, 0.004), srgb("#a8822e"), SHINY,
                     cuts=(0, 0, 0), bevel=0.0, jitter=0.0, rot=(0, -a, 0))
    m.outline(rim, 0.003)
    m.cylinder((0, 0.008, cz), 0.099, 0.012, srgb("#d8eef6"), 32, GLASS, rot=rot, cuts=0, smooth=True, jitter=0.0)
    return m.build()


def hand_candle(seed=72):
    m = Model("hand_candle", seed)
    rc = 0.04
    wax = m.cylinder((0, 0, -0.08), rc, 0.27, WAX, 18, PAPER, cuts=3, smooth=True, jitter=0.0)
    for k in range(6):
        a = k * 1.1 + 0.4
        d = capsule(m, (math.cos(a) * rc, math.sin(a) * rc, 0.185), (math.cos(a) * (rc + 0.004), math.sin(a) * (rc + 0.004),
                                                                   0.185 - 0.03 - (k % 3) * 0.02), 0.009, 0.007,
                    srgb("#f6f0e2"), PAPER, 8)
        wax += d
    m.outline(wax, 0.003)
    wick = m.cylinder((0, 0, 0.19), 0.003, 0.022, INK, 6, CARD, cuts=0, jitter=0.0)
    fist(m, rc, z_top=0.07, fr=0.021)
    return m.build()


def hand_blowtorch(seed=73):
    m = Model("hand_blowtorch", seed)
    rc = 0.05
    blue = srgb("#2f66ad")
    can = m.cylinder((0, 0, -0.12), rc, 0.24, blue, 22, SHINY, cuts=2, smooth=True, jitter=0.0)
    can += m.cylinder((0, 0, 0.12), rc, 0.035, blue, 22, SHINY, cuts=0, radius_top=rc * 0.55, smooth=True, jitter=0.0)
    m.box((0, -rc * 0.97, 0.0), (0.06, 0.004, 0.1), srgb("#f2efe6"), SHINY, cuts=(0, 0, 0), bevel=0.0, jitter=0.0)
    m.outline(can, 0.003)
    valve = m.cylinder((0, 0, 0.155), 0.022, 0.03, BRASS, 14, SHINY, cuts=0, jitter=0.0)
    valve += m.box((0, 0.012, 0.185), (0.036, 0.05, 0.036), BRASS, SHINY, cuts=(0, 0, 0), bevel=0.006, jitter=0.0)
    knob = m.cylinder((0.03, 0.01, 0.185), 0.018, 0.022, srgb("#2a2624"), 12, SHINY, rot=(0, math.pi / 2, 0), cuts=0,
                      jitter=0.0)
    for k in range(10):
        a = k * math.tau / 10
        knob += m.box((0.04, 0.01 + math.cos(a) * 0.018, 0.185 + math.sin(a) * 0.018), (0.02, 0.004, 0.004), srgb("#1e1b19"),
                      SHINY, cuts=(0, 0, 0), bevel=0.0, jitter=0.0, rot=(a, 0, 0))
    nozzle = m.cylinder((0, 0.03, 0.19), 0.01, 0.17, BRASS, 12, SHINY, rot=(-math.pi / 2, 0, 0), cuts=1, jitter=0.0)
    nozzle += m.cylinder((0, 0.2, 0.19), 0.01, 0.035, srgb("#b38a34"), 12, SHINY, rot=(-math.pi / 2, 0, 0), cuts=0,
                         radius_top=0.016, jitter=0.0)
    m.outline(valve + knob + nozzle, 0.003)
    fist(m, rc, z_top=0.05, fr=0.022)
    return m.build()


def hand_bottle(seed=74):
    m = Model("hand_bottle", seed)
    rc = 0.045
    green = srgb("#5e8f62")
    body = lathe(m, (0, 0, -0.1), [(0.04, 0.0), (0.046, 0.01), (0.046, 0.17), (0.04, 0.2), (0.018, 0.25), (0.016, 0.31),
                                    (0.02, 0.32), (0.02, 0.33)], green, GLASS, 18)
    m.cylinder((0, 0, -0.1), 0.04, 0.004, srgb("#4d7a52"), 18, GLASS, cuts=0, jitter=0.0)
    m.decal("st_lot", (0, -0.047, -0.02), (0, -1, 0), 0.07, lift=0.003)
    fist(m, rc, z_top=0.04, fr=0.022)
    return m.build()


def rocket(seed=75):
    """A paper rocket on a stick: rolled paper, stripes of felt tip, a cone, three fins."""
    m = Model("rocket", seed)
    m.cylinder((0, 0, -0.32), 0.0055, 0.38, srgb("#d9b98a"), 6, CARD, cuts=0, jitter=0.0)      # the skewer
    body = m.cylinder((0, 0, 0.0), 0.032, 0.2, srgb("#f3ecdc"), 14, PAPER, cuts=4, smooth=True, jitter=0.001)
    cols = [srgb("#d84a3a"), srgb("#3d6fb8"), srgb("#f0c440")]
    m.paint_by(body, lambda p, n: cols[int(p.z / 0.045) % 3] if (p.z % 0.045) < 0.016 else srgb("#f3ecdc"))
    m.cone((0, 0, 0.2), 0.034, 0.075, srgb("#d84a3a"), 14, PAPER, seam=False)
    for k in range(3):
        a = k * math.tau / 3
        out = Vector((math.cos(a), math.sin(a), 0))
        m.plate((out.x * 0.03, out.y * 0.03, 0.035), (0, 0, 1), out, 0.07, 0.045, srgb("#3d6fb8"), 0.003, PAPER,
                edge=srgb("#2f5690"), cuts=1)
    m.tape((0.031, 0, 0.12), (0.031, 0, 0.06), (1, 0, 0), 0.02)
    return m.build()


def build():
    return [hand_magnifier(), hand_candle(), hand_blowtorch(), hand_bottle(), rocket()]
