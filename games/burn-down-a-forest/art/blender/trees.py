"""The cursed forest: pines and hex oaks in three sizes, the giants, the Elder
Tree, gloom bushes, cursed grass, boulders, and cheap silhouettes for the
woods on the hills beyond reach.

Shape language (NOTES.md art bible): cursed things are spiky and crooked.
Pines have crooked trunks, drooping star-shaped tiers and a hooked tip; oaks
have forked crooked trunks and lumpy canopies whose undersides hang down in
points; the bigger trees watch you through knothole eyes. Mint only on cursed
knots and hearts.

Run:  python3 art/blender/trees.py      (writes models/forest.glb)
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forest_lib as L  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

PLUM = L.srgb("#2B1F3A")
VIOLET = L.srgb("#5A3F7A")
VIOLET_HI = L.srgb("#8C74B4")
TEAL = L.srgb("#2F5C66")
TEAL_HI = L.srgb("#6A9C93")
MINT = L.srgb("#9FF0D0")
BARK = L.srgb("#3D2B35")
BARK_HI = L.srgb("#6B5260")
KNOT = L.srgb("#120B15")
GIANT_LEAF = L.srgb("#46305F")
GRASS = L.srgb("#2E4F58")
GRASS_HI = L.srgb("#5F8C84")
BUSH = L.srgb("#433461")
BUSH_HI = L.srgb("#5D7F86")
STONE = L.srgb("#5A5462")
STONE_HI = L.srgb("#857C8C")
MOSS = L.srgb("#4A3A63")

Z = Vector((0, 0, 1))


def frame(n):
    n = Vector(n).normalized()
    ref = Z if abs(n.z) < 0.9 else Vector((1, 0, 0))
    x = ref.cross(n).normalized()
    y = n.cross(x).normalized()
    return x, y, n


def align_z(axis):
    """Rotation taking +Z to `axis`."""
    return Z.rotation_difference(Vector(axis).normalized()).to_matrix().to_4x4()


def knot_eye(m, center, normal, size, glow=False, tall=1.35, bark=BARK):
    """A knothole: a raised rim of bark around a dark hollow, sometimes with a
    mint pupil looking out (cursed knots only)."""
    x, y, n = frame(normal)
    c = Vector(center)
    seg = 8
    rings = []
    for r, lift, col, hi in ((1.7, -0.01, bark, 0.0), (1.0, 0.035, BARK_HI, 0.0), (0.6, -0.03, KNOT, 0.0)):
        ring = []
        for k in range(seg):
            a = 2 * math.pi * k / seg
            p = c + (x * math.cos(a) + y * math.sin(a) * tall) * size * r + n * lift
            ring.append(m.vert(p, col, L.BARK, hi))
        rings.append(ring)
    for i in range(2):
        a, b = rings[i], rings[i + 1]
        for k in range(seg):
            k2 = (k + 1) % seg
            m.face([a[k], a[k2], b[k2], b[k]])
    flag = L.GLOW if glow else L.BARK
    pupil = m.vert(c - n * 0.07 + y * size * 0.1, MINT if glow else KNOT, flag)
    for k in range(seg):
        m.face([rings[2][k], rings[2][(k + 1) % seg], pupil])
    if glow:
        # a mint iris around the pupil so it reads from a distance
        iris = []
        for k in range(seg):
            a = 2 * math.pi * k / seg
            iris.append(m.vert(c - n * 0.045 + (x * math.cos(a) + y * math.sin(a) * tall) * size * 0.32 + y * size * 0.1, MINT, L.GLOW))
        hub = m.vert(c - n * 0.04 + y * size * 0.1, MINT, L.GLOW)
        for k in range(seg):
            m.face([iris[k], iris[(k + 1) % seg], hub])


def trunk(m, spine, r0, r1, sides, flare=1.0, color=BARK, smooth=True):
    n = len(spine)
    radii = []
    for i in range(n):
        t = i / max(1, n - 1)
        r = r0 + (r1 - r0) * t
        if flare > 1.0:
            r *= 1.0 + (flare - 1.0) * max(0.0, 1.0 - t * 4.0) ** 2
        radii.append(r)

    def col(t, k):
        return L.mix(color, BARK_HI, 0.18 * (k % 2))   # faint bark ridges
    m.tube(spine, radii, sides, color, L.BARK, smooth=smooth, cap_top=True, twist=0.6, wobble=0.08, color_fn=col)


# ------------------------------------------------------------------------------------
# Pines
# ------------------------------------------------------------------------------------
def pine_tier(m, center, axis, R, th, n, rot, droop=0.38, jag=0.12, light=1.0):
    """One drooping, star-shaped skirt of needles. Rows bottom to top: the
    hanging points of the rim, the shoulder, the collar round the trunk."""
    M = L.Matrix.Translation(Vector(center)) @ align_z(axis)
    rows = []
    under = L.mix(TEAL, PLUM, 0.62)
    mid = L.scale(TEAL, 0.95 * light)
    defs = [
        # r point, r notch, z point, z notch, colour point, colour notch, hi point
        (R, 0.58 * R, -droop * th, 0.1 * th, L.scale(TEAL, light), L.mix(TEAL, PLUM, 0.35), 1.0),
        (0.62 * R, 0.4 * R, 0.4 * th, 0.5 * th, mid, L.mix(TEAL, PLUM, 0.2), 0.35),
        (0.17 * R, 0.13 * R, 0.98 * th, 0.95 * th, L.scale(TEAL, 1.05 * light), L.scale(TEAL, light), 0.15),
    ]
    curl = m.rng.uniform(-0.18, 0.18)
    for ri, d in enumerate(defs):
        ring = []
        for k in range(2 * n):
            point = k % 2 == 0
            a = rot + math.pi * k / n + (curl if (point and ri == 0) else 0.0)
            r = (d[0] if point else d[1]) * (1.0 + m.rng.uniform(-jag, jag))
            z = (d[2] if point else d[3]) + (m.rng.uniform(-0.06, 0.06) * th if ri == 0 else 0.0)
            col = d[4] if point else d[5]
            ring.append(m.vert(M @ Vector((math.cos(a) * r, math.sin(a) * r, z)), col, L.LEAF, d[6] if point else 0.0))
        rows.append(ring)
    for i in range(len(rows) - 1):
        a, b = rows[i], rows[i + 1]
        for k in range(2 * n):
            k2 = (k + 1) % (2 * n)
            m.face([a[k], a[k2], b[k2], b[k]])
    c = m.vert(M @ Vector((0, 0, 0.22 * th)), L.scale(under, 0.7), L.LEAF)
    rim = rows[0]
    for k in range(2 * n):
        m.face([c, rim[(k + 1) % (2 * n)], rim[k]])


def pine(name, H, tiers, seed, points=7, eye=1):
    m = L.Model(name, seed)
    rng = m.rng
    s = H / 4.6
    spine = L.crooked_spine(H * 0.84, bends=1.2, sway=0.22 * s, rng=rng, segments=4)
    trunk(m, spine, 0.24 * s, 0.06 * s, 5, flare=1.6)
    bottom, top = 0.17 * H, 0.78 * H
    rot = rng.uniform(0, 6.28)
    for k in range(tiers):
        t = k / max(1, tiers - 1)
        z = bottom + (top - bottom) * (t ** 0.92)
        c = L.point_on(spine, z / (H * 0.84))
        c.z = z
        # each tier tilts a little with the trunk, and a little on its own
        i = min(len(spine) - 2, int(z / (H * 0.84) * (len(spine) - 1)))
        tangent = (spine[i + 1] - spine[i]).normalized()
        axis = (Z * 2.0 + tangent + Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), 0))).normalized()
        R = (1.62 - 1.02 * t) * s * rng.uniform(0.9, 1.1)
        th = (1.45 - 0.5 * t) * s
        pine_tier(m, c, axis, R, th, points, rot + k * 0.45, droop=0.5 - 0.14 * t, light=0.9 + 0.2 * t)
    # The hooked tip: the top keeps going, then flops over sideways.
    tip0 = L.point_on(spine, 1.0)
    tip0.z = top + 0.95 * s
    hd = rng.uniform(0, 6.28)
    hook = [tip0 + Vector((0, 0, -0.25 * s)),
            tip0 + Vector((0, 0, 0.35 * s)),
            tip0 + Vector((math.cos(hd) * 0.25 * s, math.sin(hd) * 0.25 * s, 0.75 * s)),
            tip0 + Vector((math.cos(hd) * 0.62 * s, math.sin(hd) * 0.62 * s, 0.82 * s)),
            tip0 + Vector((math.cos(hd) * 0.85 * s, math.sin(hd) * 0.85 * s, 0.62 * s))]
    radii = [0.26 * s, 0.17 * s, 0.1 * s, 0.05 * s, 0.0]
    m.tube(hook, radii, 5, TEAL, L.LEAF, cap_top=False,
           color_fn=lambda t, k: L.mix(L.scale(TEAL, 1.05), TEAL_HI, t * 0.6),
           hi_fn=lambda t, k: t)
    # every cursed pine watches you: mint knothole eyes low on the trunk, under the skirts
    a = rng.uniform(0, 6.28)
    p = L.point_on(spine, 0.12)
    for k in range(eye):
        off = (k - (eye - 1) * 0.5) * 0.62
        d = Vector((math.cos(a + off), math.sin(a + off), 0.1))
        knot_eye(m, p + d.normalized() * 0.19 * s + Z * (0.05 * s * k), d, 0.07 * s, glow=True)
    m.bake(ao_dist=1.0 * s, ao_strength=0.5, grad=(0.72, 1.22), hi_color=TEAL_HI, hi_strength=0.6,
           wear=0.2, wear_color=BARK_HI, grime=0.08, paint=0.1, paint_scale=1.0 / s, ao_floor=0.45)
    print(name, m.tri_count(), "tris")
    return m.finish()


# ------------------------------------------------------------------------------------
# Hex oaks
# ------------------------------------------------------------------------------------
# Canopy colours are set a little darker and warmer than the swatch on purpose:
# the cool moonlight lifts the lit tops to the art bible's hex violet (#5A3F7A).
OAK_BASE = L.srgb("#3E2A5A")
OAK_TOP = L.srgb("#5A3F7A")
OAK_UNDER = L.srgb("#1E1428")
OAK_CARVE = L.srgb("#9C86C4")


def canopy_color(base, hi):
    def fn(d, p):
        up = max(0.0, d.z)
        down = max(0.0, -d.z)
        c = L.mix(base, hi, up * 0.45)
        return L.mix(c, PLUM, down * 0.55)
    return fn


def claw_twig(m, start, d, length, s, rng, r0=0.06):
    """A bare twig poking out of the canopy, ending in a curled claw."""
    d = Vector(d).normalized()
    side = d.cross(Z)
    if side.length < 0.1:
        side = Vector((1, 0, 0))
    side.normalize()
    p1 = start + d * length * 0.5 + Z * 0.15 * s + side * rng.uniform(-0.12, 0.12) * s
    p2 = start + d * length + Z * 0.25 * s
    hook = p2 + d * 0.18 * s - Z * 0.22 * s + side * 0.08 * s
    m.tube([start, p1, p2, hook], [r0 * s, r0 * 0.6 * s, r0 * 0.3 * s, 0.0], 4, BARK, L.BARK, cap_top=False,
           color_fn=lambda t, k: L.mix(BARK, BARK_HI, 0.25 * t))
    for side_k in (-1, 1):
        q0 = p1.lerp(p2, 0.6)
        tip = q0 + (d * 0.25 + side * side_k * 0.22 + Z * 0.12) * s
        m.tube([q0, tip, tip - Z * 0.1 * s + d * 0.05 * s], [r0 * 0.35 * s, r0 * 0.15 * s, 0.0], 3, BARK, L.BARK, cap_top=False)


OAK_SHAPES = {
    # base, top: the canopy's colours (each shape its own cast of violet, so a wood isn't one colour)
    "round": (OAK_BASE, OAK_TOP),
    "tall": (L.mix(OAK_BASE, L.srgb("#2F3566"), 0.35), L.mix(OAK_TOP, L.srgb("#4A5288"), 0.3)),
    "lean": (L.mix(OAK_BASE, L.srgb("#4E2A50"), 0.4), L.mix(OAK_TOP, L.srgb("#74406E"), 0.35)),
    "weep": (L.mix(OAK_BASE, L.srgb("#2E2244"), 0.3), L.mix(OAK_TOP, L.srgb("#4C3870"), 0.3)),
}


def oak(name, H, seed, shape="round", eyes=2, twigs=2):
    """A hex oak in one of four silhouettes, all with a long bare crooked trunk
    you can see between the crowns (forked, clawed roots), carved scalloped
    cushions of leaves whose rims hang down into points, bare clawed twigs and
    a pair of mint knothole eyes:
      round  a forked trunk under one big crown and two tucked against it
      tall   a narrow tree, two crowns stacked, long hanging points
      lean   a trunk leaning hard to one side, its crown thrown off-centre and a
             smaller one at the end of a long crooked limb the other way
      weep   a tall trunk under a wide flat umbrella of a crown whose points
             hang down like a weeping willow's"""
    m = L.Model(name, seed)
    rng = m.rng
    s = H / 5.0
    base_c, top_c = OAK_SHAPES[shape]
    lean = (0.0, 0.0)
    fork = 0.5 * H
    if shape == "lean":
        lean = (0.75 * s, 0.25 * s)
        fork = 0.46 * H
    elif shape == "tall":
        fork = 0.52 * H
    elif shape == "weep":
        fork = 0.58 * H
    spine = L.crooked_spine(fork, bends=1.3, sway=0.26 * s, rng=rng, segments=5, lean=lean)
    spine = L.smooth_spine(spine)
    trunk(m, spine, 0.3 * s, 0.19 * s, 7, flare=2.2)
    # clawed roots gripping the ground
    for k in range(4):
        a = 2 * math.pi * k / 4 + rng.uniform(-0.4, 0.4)
        d = Vector((math.cos(a), math.sin(a), 0))
        m.tube([d * 0.18 * s + Z * 0.42 * s, d * 0.52 * s + Z * 0.1 * s, d * 0.82 * s - Z * 0.05 * s],
               [0.13 * s, 0.08 * s, 0.03 * s], 4, BARK, L.BARK, cap_top=False)
    top = spine[-1]
    a0 = rng.uniform(0, 6.28)
    # (centre, R, height, lobes, droop, carve rows)
    centres = []
    if shape == "round":
        centres.append((top + Vector((0, 0, 1.0 * s)), 1.02 * s, 0.95 * s, 7, 0.6, (0.6,)))
        for k in range(2):
            a = a0 + k * 2.6 + rng.uniform(-0.3, 0.3)
            centres.append((top + Vector((math.cos(a) * 0.75 * s, math.sin(a) * 0.75 * s, 0.45 * s)), 0.68 * s, 0.6 * s, 6, 0.65, (0.64,)))
    elif shape == "tall":
        centres.append((top + Vector((0, 0, 0.55 * s)), 0.88 * s, 0.8 * s, 6, 0.85, (0.62,)))
        centres.append((top + Vector((0.12 * s, -0.05 * s, 1.45 * s)), 0.66 * s, 0.75 * s, 6, 0.75, (0.6,)))
    elif shape == "lean":
        centres.append((top + Vector((0.35 * s, 0.1 * s, 0.85 * s)), 1.08 * s, 0.85 * s, 7, 0.65, (0.58,)))
        a = math.atan2(-lean[1], -lean[0]) + rng.uniform(-0.3, 0.3)
        centres.append((top + Vector((math.cos(a) * 1.35 * s, math.sin(a) * 1.35 * s, 0.25 * s)), 0.6 * s, 0.55 * s, 6, 0.7, (0.64,)))
    else:  # weep
        centres.append((top + Vector((0, 0, 0.7 * s)), 1.3 * s, 0.6 * s, 9, 1.25, (0.5, 0.78)))
    for (c, R, h, lobes, droop, carve) in centres:
        d = c - top
        mid = top + d * 0.5 + Vector((rng.uniform(-0.2, 0.2) * s, rng.uniform(-0.2, 0.2) * s, 0.1 * s))
        m.tube([top - Z * 0.25 * s, mid, c - Z * 0.15 * s], [0.16 * s, 0.11 * s, 0.06 * s], 5, BARK, L.BARK,
               color_fn=lambda t, kk: L.mix(BARK, BARK_HI, 0.18 * (kk % 2)))
    for i, (c, R, h, lobes, droop, carve) in enumerate(centres):
        m.cushion(c, R, h, lobes, seed * 13 + i, base_c, top_c, OAK_UNDER, droop=droop, belly=0.36,
                  carve=carve, tilt=(rng.uniform(-0.14, 0.14), rng.uniform(-0.14, 0.14)),
                  lump=0.2 if i == 0 else 0.14, hang_var=0.6)
    if shape == "weep":
        # long strands hanging from the umbrella's rim
        c, R = centres[0][0], centres[0][1]
        for k in range(9):
            a = 2 * math.pi * k / 9 + rng.uniform(-0.15, 0.15)
            st = c + Vector((math.cos(a) * R * 0.86, math.sin(a) * R * 0.86, -0.35 * s))
            moss_strand(m, st, rng.uniform(0.8, 1.3) * s, 0.55 * s, rng, L.mix(base_c, PLUM, 0.2))
    # bare clawed twigs poking out under the canopy
    for k in range(twigs):
        a = a0 + math.pi * 0.5 + k * 2.4 + rng.uniform(-0.3, 0.3)
        st = L.point_on(spine, 0.75 + 0.08 * k)
        claw_twig(m, st, (math.cos(a), math.sin(a), 0.35), rng.uniform(0.9, 1.2) * s, s, rng)
    # a pair of mint knothole eyes on the trunk, looking out
    a = rng.uniform(0, 6.28)
    p = L.point_on(spine, 0.5)
    for k in range(eyes):
        off = (k - (eyes - 1) * 0.5) * 0.5
        d = Vector((math.cos(a + off), math.sin(a + off), 0.05))
        knot_eye(m, p + d.normalized() * 0.23 * s + Z * (0.04 * s if k == 1 else 0.0), d, 0.07 * s, glow=True)
    m.bake(ao_dist=1.4 * s, ao_strength=0.6, grad=(0.62, 1.1), hi_color=OAK_CARVE, hi_strength=0.55,
           wear=0.25, wear_color=BARK_HI, grime=0.15, paint=0.14, paint_scale=1.2 / s, ao_floor=0.4)
    print(name, m.tri_count(), "tris")
    return m.finish()


# ------------------------------------------------------------------------------------
# The giants and the Elder Tree
# ------------------------------------------------------------------------------------
GIANT_BASE = L.srgb("#36254F")
GIANT_TOP = L.srgb("#4E366D")


def claw_branch(m, start, a, length, rise, s, rng, r0):
    """A crooked branch ending in a few clawed twigs."""
    d = Vector((math.cos(a), math.sin(a), 0))
    side = Vector((-d.y, d.x, 0))
    p1 = start + d * length * 0.35 + Vector((0, 0, rise * 0.5)) + side * rng.uniform(-0.3, 0.3) * s
    p2 = start + d * length * 0.75 + Vector((0, 0, rise * 0.85)) - side * rng.uniform(-0.3, 0.3) * s
    p3 = start + d * length + Vector((0, 0, rise))
    m.tube([start, p1, p2, p3], [r0, r0 * 0.6, r0 * 0.35, 0.02 * s], 5, BARK, L.BARK,
           color_fn=lambda t, k: L.mix(BARK, BARK_HI, 0.2 * (k % 2)))
    for k in range(3):
        aa = a + (k - 1) * 0.7
        tip = p3 + Vector((math.cos(aa) * 0.6 * s, math.sin(aa) * 0.6 * s, rng.uniform(0.1, 0.5) * s))
        hook = tip + Vector((math.cos(aa + 1.4) * 0.25 * s, math.sin(aa + 1.4) * 0.25 * s, -0.2 * s))
        m.tube([p2.lerp(p3, 0.7), tip, hook], [0.09 * s, 0.045 * s, 0.0], 4, BARK, L.BARK, cap_top=False)
    return p3


SEED_HUSK = L.srgb("#4A3426")
SEED_HUSK_HI = L.srgb("#7A5A40")


def heart(m, center, normal, size, sparkles, rng):
    """The curse's heart: a dark hollow in the bark holding a seed pod split
    open, its two ridged husks peeled back from a glowing mint seed (a knot of
    the curse, not a valentine), and the only sparkles in the forest drifting
    round it."""
    x, y, n = frame(normal)
    c = Vector(center)
    seg = 10
    rim = [m.vert(c + (x * math.cos(2 * math.pi * k / seg) + y * math.sin(2 * math.pi * k / seg) * 1.45) * size * 1.25 + n * 0.05,
                  BARK_HI, L.BARK) for k in range(seg)]
    pit = [m.vert(c + (x * math.cos(2 * math.pi * k / seg) + y * math.sin(2 * math.pi * k / seg) * 1.45) * size * 0.95 - n * size * 0.4,
                  KNOT, L.BARK) for k in range(seg)]
    for k in range(seg):
        k2 = (k + 1) % seg
        m.face([rim[k], rim[k2], pit[k2], pit[k]])
    back = m.vert(c - n * size * 0.6, KNOT, L.BARK)
    for k in range(seg):
        m.face([pit[k], pit[(k + 1) % seg], back])
    hc = c - n * size * 0.05
    # the seed: an almond of mint light, pointed at both ends, standing upright
    M = Matrix.Translation(hc) @ Matrix((list(x) + [0], list(n) + [0], list(y) + [0], [0, 0, 0, 1])).transposed()
    prof = [(0.0, -0.95), (0.32, -0.6), (0.45, -0.1), (0.4, 0.35), (0.22, 0.75), (0.0, 1.0)]
    seed_v = m.lathe([(r * size, z * size * 1.2) for r, z in prof], 10, MINT, L.GLOW)
    m.transform([v for ring in seed_v for v in ring], M)
    # the husks: two ridged halves curling back from the seed like a split chestnut
    for side in (-1, 1):
        rows = []
        for i in range(7):
            t = i / 6
            zz = (-1.05 + 2.1 * t) * size * 1.25
            w = math.sin(math.pi * t) ** 0.8 * size * 0.62
            row = []
            for j in range(5):
                u = j / 4
                ang = side * (0.35 + 1.25 * u)          # wraps round from the seed's edge to its back
                curl = 1.0 + 0.35 * u * u               # the lip peels outward
                lx = math.sin(ang) * w * curl
                ln = -math.cos(ang) * w * 0.9 + size * 0.05
                col = L.mix(SEED_HUSK, SEED_HUSK_HI, 0.5 * (j % 2)) if u > 0.1 else L.mix(SEED_HUSK, MINT, 0.25)
                row.append(m.vert(hc + x * lx + n * ln + y * zz, col, L.BARK, 0.6 if j == 4 else 0.0))
            rows.append(row)
        for i in range(6):
            for j in range(4):
                q = [rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]]
                m.face(q if side > 0 else q[::-1])
                m.face(q[::-1] if side > 0 else q)
    for k in range(sparkles):
        a = rng.uniform(0, 6.28)
        r = rng.uniform(1.3, 2.5) * size
        p = c + n * rng.uniform(0.4, 1.4) * size + x * math.cos(a) * r + y * math.sin(a) * r * 1.3
        m.blob(p, size * rng.uniform(0.07, 0.12), MINT, L.GLOW, subdiv=0, rough=0.0, seed=k)


def giant(name, seed, H=9.5, variant=0):
    m = L.Model(name, seed)
    rng = m.rng
    s = H / 9.5
    spine = L.crooked_spine(5.2 * s, bends=1.1, sway=0.5 * s, rng=rng, segments=5)
    spine = L.smooth_spine(spine)
    trunk(m, spine, 0.78 * s, 0.38 * s, 8, flare=1.4)
    for k in range(5):
        a = 2 * math.pi * k / 5 + rng.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        p0 = d * 0.45 * s + Vector((0, 0, 0.9 * s))
        p1 = d * 1.1 * s + Vector((0, 0, 0.35 * s))
        p2 = d * 1.75 * s + Vector((0, 0, -0.05))
        p3 = p2 + Vector((-d.y, d.x, 0)) * 0.25 * s + d * 0.2 * s - Z * 0.1
        m.tube([p0, p1, p2, p3], [0.3 * s, 0.18 * s, 0.07 * s, 0.0], 5, BARK, L.BARK, cap_top=False)
    top = spine[-1]
    ends = []
    a0 = rng.uniform(0, 6.28)
    for k in range(4):
        a = a0 + 2 * math.pi * k / 4 + rng.uniform(-0.35, 0.35)
        start = L.point_on(spine, 0.72 + 0.06 * k)
        ends.append(claw_branch(m, start, a, rng.uniform(2.3, 2.9) * s, rng.uniform(1.2, 1.9) * s, s, rng, 0.28 * s))
    base = GIANT_BASE if variant == 0 else L.mix(GIANT_BASE, TEAL, 0.3)
    topc = GIANT_TOP if variant == 0 else L.mix(GIANT_TOP, TEAL, 0.3)
    m.cushion(top + Vector((0, 0, 2.0 * s)), 2.1 * s, 1.5 * s, 8, seed, base, topc, OAK_UNDER, droop=0.6, belly=0.35,
              carve=(0.48, 0.76), inner=(0.28,), lump=0.18)
    for k, e in enumerate(ends[:3]):
        c = e.lerp(top, 0.25) + Vector((0, 0, 0.6 * s))
        m.cushion(c, rng.uniform(1.2, 1.4) * s, 0.8 * s, 6, seed * 7 + k, base, topc, OAK_UNDER, droop=0.7, belly=0.4,
                  carve=(0.58,), tilt=(rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15)), lump=0.15)
        for j in range(2):
            aa = rng.uniform(0, 6.28)
            st = c + Vector((math.cos(aa), math.sin(aa), 0)) * rng.uniform(0.4, 0.9) * s - Z * 0.35 * s
            moss_strand(m, st, rng.uniform(1.4, 2.2) * s, 0.8 * s, rng, L.mix(GIANT_BASE, TEAL, 0.25))
    a = rng.uniform(0, 6.28)
    d = Vector((math.cos(a), math.sin(a), 0.0))
    hp = L.point_on(spine, 0.33)
    heart(m, hp + d * 0.62 * s, d, 0.28 * s, sparkles=5, rng=rng)
    for side in (-1, 1):
        dd = Vector((math.cos(a + side * 0.32), math.sin(a + side * 0.32), 0.0))
        ep = L.point_on(spine, 0.55)
        knot_eye(m, ep + dd * 0.5 * s, dd, 0.12 * s, glow=True)
    m.bake(ao_dist=2.2 * s, ao_strength=0.65, grad=(0.62, 1.1), hi_color=OAK_CARVE, hi_strength=0.55,
           wear=0.3, wear_color=BARK_HI, grime=0.15, paint=0.12, paint_scale=0.5, ao_floor=0.4)
    print(name, m.tri_count(), "tris")
    return m.finish()


def moss_strand(m, start, length, s, rng, color):
    """A strand of curse moss hanging from a limb, swaying with the leaves."""
    pts = [start]
    p = Vector(start)
    for k in range(4):
        p = p + Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), -length / 4.0))
        pts.append(p)
    m.tube(pts, [0.16 * s, 0.12 * s, 0.09 * s, 0.05 * s, 0.0], 4, color, L.LEAF, cap_top=False,
           color_fn=lambda t, k: L.mix(color, PLUM, t * 0.5))


def elder(name="elder", seed=77):
    """The Elder Tree: nothing else in the forest has its outline. A vast twisted
    trunk splits into five crooked limbs that reach up and out like the fingers
    of a hand, each ending in a claw, with carved cushions of leaves and long
    strands of curse moss weeping from them. Its face (two mint knot eyes and
    the glowing cursed heart) looks south at the village."""
    m = L.Model(name, seed)
    rng = m.rng
    spine = [Vector((0, 0, 0)), Vector((0.6, -0.2, 3.2)), Vector((-0.5, 0.4, 6.5)), Vector((0.5, 0.1, 9.6)), Vector((0.0, -0.2, 12.0))]
    spine = L.smooth_spine(spine)
    trunk(m, spine, 2.7, 1.6, 12, flare=1.5)
    # roots spreading far over the ground
    for k in range(8):
        a = 2 * math.pi * k / 8 + rng.uniform(-0.25, 0.25)
        d = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-d.y, d.x, 0)) * rng.uniform(-0.7, 0.7)
        pts = [d * 1.8 + Vector((0, 0, 3.0)), d * 3.4 + side + Vector((0, 0, 1.3)), d * 5.0 + side * 1.5 + Vector((0, 0, 0.35)),
               d * 6.8 + side * 1.1 + Vector((0, 0, -0.15)), d * 7.6 + side * 1.6 + Vector((0, 0, -0.1))]
        m.tube(pts, [1.0, 0.68, 0.38, 0.12, 0.0], 6, BARK, L.BARK, cap_top=False,
               color_fn=lambda t, kk: L.mix(BARK, BARK_HI, 0.25 * (kk % 2)))
    # five finger limbs reaching up and out, bare and clawed at the tips
    top = spine[-1]
    knuckles = []
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.55 + rng.uniform(-0.2, 0.2)
        d = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-d.y, d.x, 0))
        out = rng.uniform(8.5, 10.5)
        rise = rng.uniform(16.0, 20.0)          # tall enough to stand over the woods on the skyline
        start = L.point_on(spine, 0.78 + 0.05 * (k % 2))
        p1 = start + d * out * 0.3 + Z * rise * 0.3 + side * rng.uniform(-0.8, 0.8)
        p2 = start + d * out * 0.62 + Z * rise * 0.62 - side * rng.uniform(-1.0, 1.0)
        p3 = start + d * out * 0.88 + Z * rise * 0.92
        claw = p3 - d * 1.9 + Z * 1.0 + side * 0.4      # the fingertip curls back in, a claw
        pts = L.smooth_spine([start, p1, p2, p3, claw])
        n = len(pts)
        m.tube(pts, [1.15 * (1.0 - i / (n - 1)) ** 0.85 + 0.04 for i in range(n)], 7, BARK, L.BARK, cap_top=False,
               color_fn=lambda t, kk: L.mix(BARK, BARK_HI, 0.22 * (kk % 2) + 0.12 * t))
        knuckles.append((p1.lerp(p2, 0.55), d))
        for j in range(2):
            q = L.point_on(pts, 0.5 + 0.22 * j)
            aa = a + (1 if j else -1) * 0.95
            claw_twig(m, q, (math.cos(aa), math.sin(aa), 0.5), rng.uniform(2.2, 3.0), 2.2, rng, r0=0.1)
    leaf_b = L.mix(GIANT_BASE, PLUM, 0.15)
    leaf_t = GIANT_TOP
    for i, (c, d) in enumerate(knuckles):
        c = c + Z * 0.4
        m.cushion(c, rng.uniform(2.3, 2.7), 1.5, 7, seed + i, leaf_b, leaf_t, OAK_UNDER, droop=0.8, belly=0.4,
                  carve=(0.5,), tilt=(rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2)), lump=0.16)
        # curse moss weeping from under each knuckle cushion
        for j in range(5):
            aa = rng.uniform(0, 6.28)
            r = rng.uniform(0.6, 2.0)
            st = c + Vector((math.cos(aa) * r, math.sin(aa) * r, -0.5))
            moss_strand(m, st, rng.uniform(2.8, 5.0), 2.0, rng, L.mix(GIANT_BASE, TEAL, 0.25))
    # a crown cushion low in the palm of the hand, so the face below stays clear
    m.cushion(top + Z * 2.6, 3.0, 1.7, 8, seed + 30, leaf_b, leaf_t, OAK_UNDER, droop=0.6, belly=0.3, carve=(0.5, 0.75), lump=0.15)
    front = Vector((0, -1, 0))
    heart(m, Vector((0.35, -2.4, 4.4)), front, 0.85, sparkles=16, rng=rng)
    # the curse's seed held up in the palm, glowing mint: from the village it is
    # the one cold light on the skyline
    heart(m, top + Z * 5.2 + Vector((0, -0.6, 0)), front, 1.25, sparkles=10, rng=rng)
    for side in (-1, 1):
        d = Vector((side * 0.35, -1, 0.05)).normalized()
        knot_eye(m, Vector((side * 1.0 - 0.1, -2.0, 8.0)), d, 0.42, glow=True, tall=0.7)
    m.bake(ao_dist=5.0, ao_rays=20, ao_strength=0.8, grad=(0.6, 1.08), hi_color=OAK_CARVE, hi_strength=0.55,
           wear=0.35, wear_color=L.srgb("#8A7088"), grime=0.3, paint=0.15, paint_scale=0.25)
    print(name, m.tri_count(), "tris")
    return m.finish()


# ------------------------------------------------------------------------------------
# Undergrowth and rocks
# ------------------------------------------------------------------------------------
def blade(m, root, a, length, lean, width, color, hi_col, rng, hook=0.35, segs=3, flag=L.LEAF):
    d = Vector((math.cos(a), math.sin(a), 0))
    side = Vector((-d.y, d.x, 0))
    left, right = [], []
    for i in range(segs + 1):
        t = i / segs
        out = d * (lean * t * t)
        p = Vector(root) + out + Vector((0, 0, length * t * (1.0 - hook * t * t)))
        if t > 0.6:
            p += d * hook * length * (t - 0.6) * 1.2      # the tip hooks over
        w = width * (1.0 - t) ** 0.8
        left.append(p - side * w)
        right.append(p + side * w)
    m.quad_strip(left, right, lambda t: L.mix(color, hi_col, t * t), flag, double=False)


def grass(name="grass", seed=11):
    m = L.Model(name, seed)
    rng = m.rng
    for b in range(6):
        a = 2 * math.pi * b / 6 + rng.uniform(-0.35, 0.35)
        root = Vector((math.cos(a), math.sin(a), 0)) * rng.uniform(0.04, 0.2)
        blade(m, root, a, rng.uniform(0.4, 0.62), rng.uniform(0.15, 0.32), 0.055, GRASS, GRASS_HI, rng, hook=0.4)
    m.bake(ao_dist=0.4, ao_strength=0.5, grad=(0.55, 1.15), ground=True)
    print(name, m.tri_count(), "tris")
    return m.finish()


def bush(name="bush", seed=12):
    """A gloom bush: a crooked clump of spiky, hooked leaves round a dark core."""
    m = L.Model(name, seed)
    rng = m.rng
    m.blob(Vector((0, 0, 0.26)), 0.34, L.mix(BUSH, PLUM, 0.4), L.LEAF, subdiv=2, rough=0.3, seed=seed, squash=(1, 1, 0.75))
    for b in range(10):
        a = 2 * math.pi * b / 10 + rng.uniform(-0.25, 0.25)
        root = Vector((math.cos(a) * 0.15, math.sin(a) * 0.15, 0.15))
        blade(m, root, a, rng.uniform(0.7, 1.05), rng.uniform(0.35, 0.6), 0.14, BUSH, BUSH_HI, rng, hook=0.5, segs=3)
    m.bake(ao_dist=0.7, ao_strength=0.7, grad=(0.6, 1.15))
    print(name, m.tri_count(), "tris")
    return m.finish()


def boulder(name="boulder", seed=21):
    m = L.Model(name, seed)
    m.blob(Vector((0, 0, 0.3)), 0.75, STONE, L.BARK, subdiv=2, rough=0.3, seed=seed, squash=(1.05, 0.9, 0.7),
           color_fn=lambda d, p: L.mix(STONE, STONE_HI, max(0.0, d.z) * 0.4), smooth=True)
    m.blob(Vector((0.55, 0.3, 0.15)), 0.42, STONE, L.BARK, subdiv=1, rough=0.25, seed=seed + 1, squash=(1, 0.9, 0.75))
    # a cap of cursed moss with a few hanging threads
    m.blob(Vector((-0.08, -0.05, 0.72)), 0.5, MOSS, L.BARK, subdiv=1, rough=0.2, seed=seed + 2, squash=(1.1, 0.9, 0.28), droop=0.6)
    m.bake(ao_dist=0.8, ao_strength=0.85, grad=(0.7, 1.08))
    print(name, m.tri_count(), "tris")
    return m.finish()


def far_pine(name="far_pine", seed=91):
    """A cheap pine silhouette for the hills beyond reach (seen through fog)."""
    m = L.Model(name, seed)
    m.tube([Vector((0, 0, 0)), Vector((0.05, 0, 1.4))], [0.18, 0.12], 4, BARK, L.BARK)
    for k in range(3):
        t = k / 2
        z = 0.9 + t * 2.3
        R = 1.15 - 0.55 * t
        n = 5
        rim = []
        for i in range(2 * n):
            a = math.pi * i / n + k * 0.5
            r = R if i % 2 == 0 else R * 0.55
            rim.append(Vector((math.cos(a) * r, math.sin(a) * r, z - (0.35 if i % 2 == 0 else 0.0))))
        m.fan(Vector((0.06 * k, 0, z + 1.35 - 0.2 * t)), rim, L.scale(TEAL, 1.05), L.mix(TEAL, PLUM, 0.3), L.LEAF)
        m.fan(Vector((0, 0, z + 0.2)), list(reversed(rim)), PLUM, PLUM, L.LEAF)
    m.bake(ao_dist=0.8, ao_strength=0.6, grad=(0.6, 1.1))
    print(name, m.tri_count(), "tris")
    return m.finish()


def far_oak(name="far_oak", seed=92):
    """A cheap oak for the hills beyond reach, the same build as the near ones:
    a bare forked trunk you can see, one carved scalloped crown hanging into
    points and a smaller one tucked on its shoulder. Planted in groves."""
    m = L.Model(name, seed)
    rng = m.rng
    spine = [Vector((0, 0, 0)), Vector((0.12, 0.04, 0.9)), Vector((-0.05, 0.08, 1.8)), Vector((0.06, 0.02, 2.4))]
    m.tube(spine, [0.3, 0.2, 0.15, 0.1], 5, BARK, L.BARK, color_fn=lambda t, k: L.mix(BARK, BARK_HI, 0.2 * (k % 2)))
    m.tube([Vector((0.0, 0.06, 1.6)), Vector((0.55, 0.2, 2.2)), Vector((0.85, 0.3, 2.5))], [0.12, 0.08, 0.05], 4, BARK, L.BARK, cap_top=False)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.4
        d = Vector((math.cos(a), math.sin(a), 0))
        m.tube([d * 0.15 + Z * 0.35, d * 0.5 + Z * 0.05, d * 0.7 - Z * 0.05], [0.12, 0.06, 0.02], 3, BARK, L.BARK, cap_top=False)
    m.cushion(Vector((0.0, 0.05, 3.15)), 1.15, 1.0, 7, seed * 13, OAK_BASE, OAK_TOP, OAK_UNDER, droop=0.9, belly=0.32,
              carve=(0.6,), segs=3, lump=0.18, tilt=(0.06, -0.05), hang_var=0.6)
    m.cushion(Vector((0.95, 0.35, 2.75)), 0.72, 0.6, 6, seed * 13 + 1, OAK_BASE, OAK_TOP, OAK_UNDER, droop=0.85,
              belly=0.3, carve=(0.64,), segs=3, lump=0.14, tilt=(0.0, 0.25))
    m.bake(ao_dist=1.0, ao_strength=0.6, grad=(0.6, 1.1), hi_color=OAK_CARVE, hi_strength=0.5, ao_floor=0.4)
    print(name, m.tri_count(), "tris")
    return m.finish()


CHAR = L.srgb("#2A2420")
CHAR_HI = L.srgb("#5A4C44")
ASH_GREY = L.srgb("#8A847E")
LEAF_GREEN = L.srgb("#7FA650")
LEAF_DARK = L.srgb("#4E7036")


def elder_stump(name="elder_stump", seed=78):
    """What the fire leaves of the Elder Tree: a broad charred stump, broken off
    in jagged splinters, cracked through, ash settled on its top and in the
    crooks of its spreading roots. Char, never black."""
    m = L.Model(name, seed)
    rng = m.rng
    sides = 18
    rings = []
    prof = [(3.0, -0.2), (2.9, 0.5), (2.6, 1.3), (2.45, 1.9)]
    for i, (r, z) in enumerate(prof):
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            rr = r * (1.0 + 0.08 * math.sin(a * 3 + seed) + rng.uniform(-0.03, 0.03))
            zz = z
            col = L.mix(CHAR, CHAR_HI, 0.25 * (k % 2))
            if i == len(prof) - 1:
                # the break: splinters of different heights, the tallest at the back
                zz = z + rng.uniform(0.0, 1.0) * (1.6 if k % 3 == 0 else 0.5) + 0.6 * max(0.0, math.sin(a))
                col = L.mix(CHAR_HI, ASH_GREY, 0.3)
            ring.append(m.vert((math.cos(a) * rr, math.sin(a) * rr, zz), col, L.BARK, 0.3 if i == len(prof) - 1 else 0.0))
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(sides):
            k2 = (k + 1) % sides
            m.face([a[k], a[k2], b[k2], b[k]])
    # the top: a dished, ash-grey surface with growth rings cut in it
    inner = []
    for k in range(sides):
        a = 2 * math.pi * k / sides
        inner.append(m.vert((math.cos(a) * 1.6, math.sin(a) * 1.6, 1.75), L.mix(ASH_GREY, CHAR, 0.35), L.BARK))
    for k in range(sides):
        k2 = (k + 1) % sides
        m.face([rings[-1][k], rings[-1][k2], inner[k2], inner[k]])
    c = m.vert((0.2, -0.1, 1.6), L.mix(ASH_GREY, CHAR, 0.2), L.BARK)
    for k in range(sides):
        m.face([inner[k], inner[(k + 1) % sides], c])
    # roots spreading over the ground, charred
    for k in range(8):
        a = 2 * math.pi * k / 8 + rng.uniform(-0.25, 0.25)
        d = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-d.y, d.x, 0)) * rng.uniform(-0.6, 0.6)
        pts = [d * 2.2 + Vector((0, 0, 1.2)), d * 3.5 + side + Vector((0, 0, 0.6)), d * 5.0 + side * 1.4 + Vector((0, 0, 0.15)),
               d * 6.4 + side * 1.1 + Vector((0, 0, -0.1))]
        m.tube(pts, [0.85, 0.5, 0.25, 0.0], 6, CHAR, L.BARK, cap_top=False,
               color_fn=lambda t, kk: L.mix(CHAR, CHAR_HI, 0.25 * (kk % 2) + 0.2 * t))
    m.bake(ao_dist=2.5, ao_rays=16, ao_strength=0.7, grad=(0.7, 1.1), hi_color=ASH_GREY, hi_strength=0.5,
           wear=0.4, wear_color=CHAR_HI, grime=0.3, paint=0.2, paint_scale=0.8)
    print(name, m.tri_count(), "tris")
    return m.finish()


def sapling(name="sapling", seed=79):
    """The first thing to grow out of the Elder's stump: a thin, green, plainly
    uncursed sapling with a few round leaves turning to the sun."""
    m = L.Model(name, seed)
    rng = m.rng
    spine = [Vector((0, 0, 0)), Vector((0.03, 0.01, 0.4)), Vector((-0.02, 0.03, 0.85)), Vector((0.04, 0.0, 1.25))]
    m.tube(spine, [0.05, 0.04, 0.028, 0.014], 5, L.srgb("#6B5A3E"), L.BARK)
    for k in range(13):
        t = 0.25 + 0.75 * k / 12
        p = L.point_on(spine, t)
        a = k * 2.4 + rng.uniform(-0.2, 0.2)
        d = Vector((math.cos(a), math.sin(a), 0.55)).normalized()
        side = d.cross(Z).normalized() if abs(d.z) < 0.99 else Vector((1, 0, 0))
        stem_end = p + d * 0.06
        m.tube([p, stem_end], [0.008, 0.006], 3, LEAF_DARK, L.LEAF, cap_top=False)
        L_ = 0.2 + 0.08 * (1 - t)
        tip = stem_end + d * L_ + Z * 0.02
        left = [stem_end, stem_end + d * L_ * 0.5 + side * L_ * 0.38, tip]
        right = [stem_end, stem_end + d * L_ * 0.5 - side * L_ * 0.38, tip]
        m.quad_strip(left, right, lambda u: L.mix(LEAF_DARK, LEAF_GREEN, u), L.LEAF, double=True)
    m.bake(ao_dist=0.3, ao_rays=12, ao_strength=0.4, grad=(0.8, 1.1))
    print(name, m.tri_count(), "tris")
    return m.finish()


def main():
    L.reset()
    obs = [
        pine("pine_s", 3.5, 3, 101, points=6, eye=1),
        pine("pine_m", 4.6, 4, 102, points=7, eye=2),
        pine("pine_l", 6.0, 5, 103, points=8, eye=2),
        oak("oak_round", 5.0, 202, "round", eyes=2, twigs=2),
        oak("oak_tall", 5.4, 204, "tall", eyes=2, twigs=1),
        oak("oak_lean", 4.8, 205, "lean", eyes=2, twigs=2),
        oak("oak_weep", 5.8, 206, "weep", eyes=2, twigs=2),
        giant("giant_a", 301, variant=0),
        giant("giant_b", 302, H=10.5, variant=1),
        elder(),
        grass(),
        bush(),
        boulder(),
        far_pine(),
        far_oak(),
        elder_stump(),
        sapling(),
    ]
    L.export(obs, "forest.glb")


if __name__ == "__main__":
    main()
