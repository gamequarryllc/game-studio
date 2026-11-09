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


def pine(name, H, tiers, seed, points=7, eye=None):
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
    if eye is not None:
        a = rng.uniform(0, 6.28)
        p = L.point_on(spine, 0.1)
        d = Vector((math.cos(a), math.sin(a), 0.1))
        knot_eye(m, p + d.normalized() * 0.17 * s, d, 0.075 * s, glow=eye)
    m.bake(ao_dist=1.2 * s, ao_strength=0.8, grad=(0.62, 1.12), hi_color=TEAL_HI, hi_strength=0.55)
    print(name, m.tri_count(), "tris")
    return m.finish()


# ------------------------------------------------------------------------------------
# Hex oaks
# ------------------------------------------------------------------------------------
def canopy_color(base, hi):
    def fn(d, p):
        up = max(0.0, d.z)
        down = max(0.0, -d.z)
        c = L.mix(base, hi, up * 0.45)
        return L.mix(c, PLUM, down * 0.55)
    return fn


def oak(name, H, seed, limbs=3, eyes=1, glow_eye=False):
    m = L.Model(name, seed)
    rng = m.rng
    s = H / 5.0
    fork = 0.36 * H
    spine = L.crooked_spine(fork, bends=1.1, sway=0.26 * s, rng=rng, segments=4)
    trunk(m, spine, 0.34 * s, 0.22 * s, 6, flare=1.9)
    top = spine[-1]
    ends = []
    a0 = rng.uniform(0, 6.28)
    for k in range(limbs):
        a = a0 + 2 * math.pi * k / limbs + rng.uniform(-0.3, 0.3)
        out = rng.uniform(1.0, 1.3) * s
        up = rng.uniform(0.9, 1.2) * s
        mid = top + Vector((math.cos(a) * out * 0.45, math.sin(a) * out * 0.45, up * 0.55))
        end = top + Vector((math.cos(a) * out, math.sin(a) * out, up))
        bend = Vector((math.cos(a + 1.2) * 0.15 * s, math.sin(a + 1.2) * 0.15 * s, 0))
        m.tube([top - Vector((0, 0, 0.3 * s)), mid + bend, end], [0.17 * s, 0.11 * s, 0.05 * s], 5, BARK, L.BARK,
               color_fn=lambda t, kk: L.mix(BARK, BARK_HI, 0.15 * (kk % 2)))
        ends.append(end)
    fn = canopy_color(VIOLET, VIOLET_HI)
    m.blob(top + Vector((0, 0, 1.75 * s)), 1.15 * s, VIOLET, L.LEAF, subdiv=2, rough=0.3, seed=seed,
           squash=(1.0, 1.0, 0.72), droop=0.6, color_fn=fn, hi_top=0.7, scallop=0.45, lobes=7)
    for k, e in enumerate(ends):
        m.blob(e + Vector((0, 0, 0.3 * s)), rng.uniform(0.85, 1.0) * s, VIOLET, L.LEAF, subdiv=2, rough=0.32,
               seed=seed * 10 + k, squash=(1.0, 1.0, 0.7), droop=1.0, color_fn=fn, hi_top=0.6, scallop=0.5, lobes=5)
    # knothole eyes on the side the canopy leans away from
    a = rng.uniform(0, 6.28)
    for k in range(eyes):
        off = (k - (eyes - 1) * 0.5) * 0.42
        d = Vector((math.cos(a + off), math.sin(a + off), 0.05))
        p = L.point_on(spine, 0.5)
        p.z = 0.55 * fork + (0.04 * s if k == 1 else 0.0)
        knot_eye(m, p + d.normalized() * 0.25 * s, d, 0.07 * s, glow=glow_eye)
    m.bake(ao_dist=1.6 * s, ao_strength=0.85, grad=(0.6, 1.1), hi_color=VIOLET_HI, hi_strength=0.5)
    print(name, m.tri_count(), "tris")
    return m.finish()


# ------------------------------------------------------------------------------------
# The giants and the Elder Tree
# ------------------------------------------------------------------------------------
def claw_branch(m, start, a, length, rise, s, rng, r0):
    """A crooked branch ending in a few clawed twigs."""
    d = Vector((math.cos(a), math.sin(a), 0))
    side = Vector((-d.y, d.x, 0))
    p1 = start + d * length * 0.35 + Vector((0, 0, rise * 0.5)) + side * rng.uniform(-0.3, 0.3) * s
    p2 = start + d * length * 0.75 + Vector((0, 0, rise * 0.85)) - side * rng.uniform(-0.3, 0.3) * s
    p3 = start + d * length + Vector((0, 0, rise))
    m.tube([start, p1, p2, p3], [r0, r0 * 0.6, r0 * 0.35, 0.02 * s], 5, BARK, L.BARK)
    for k in range(3):
        aa = a + (k - 1) * 0.7
        tip = p3 + Vector((math.cos(aa) * 0.6 * s, math.sin(aa) * 0.6 * s, rng.uniform(0.1, 0.5) * s))
        hook = tip + Vector((math.cos(aa + 1.4) * 0.25 * s, math.sin(aa + 1.4) * 0.25 * s, -0.2 * s))
        m.tube([p2.lerp(p3, 0.7), tip, hook], [0.09 * s, 0.045 * s, 0.0], 4, BARK, L.BARK, cap_top=False)
    return p3


def heart(m, center, normal, size, sparkles, rng):
    """A cursed heart: a dark hollow in the bark with a mint heart glowing in it,
    and the only sparkles in the forest drifting round it."""
    x, y, n = frame(normal)
    c = Vector(center)
    # the hollow: a dark ring sunk into the trunk
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
    # the heart itself: two lobes and a point
    hc = c - n * size * 0.1
    for side in (-1, 1):
        m.blob(hc + x * side * size * 0.3 + y * size * 0.2, size * 0.42, MINT, L.GLOW, subdiv=1, rough=0.05, seed=side + 5)
    m.blob(hc - y * size * 0.25, size * 0.38, MINT, L.GLOW, subdiv=1, rough=0.05, seed=9, squash=(0.8, 0.8, 1.2))
    for k in range(sparkles):
        a = rng.uniform(0, 6.28)
        r = rng.uniform(1.2, 2.4) * size
        p = c + n * rng.uniform(0.4, 1.4) * size + x * math.cos(a) * r + y * math.sin(a) * r * 1.3
        m.blob(p, size * rng.uniform(0.07, 0.12), MINT, L.GLOW, subdiv=0, rough=0.0, seed=k)


def giant(name, seed, H=9.5, variant=0):
    m = L.Model(name, seed)
    rng = m.rng
    s = H / 9.5
    spine = L.crooked_spine(5.2 * s, bends=1.1, sway=0.5 * s, rng=rng, segments=5)
    spine = L.smooth_spine(spine)
    trunk(m, spine, 0.78 * s, 0.38 * s, 7, flare=1.4)
    # buttress roots clawing into the ground
    for k in range(5):
        a = 2 * math.pi * k / 5 + rng.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        p0 = d * 0.45 * s + Vector((0, 0, 0.9 * s))
        p1 = d * 1.1 * s + Vector((0, 0, 0.35 * s))
        p2 = d * 1.75 * s + Vector((0, 0, -0.05))
        m.tube([p0, p1, p2], [0.3 * s, 0.18 * s, 0.05 * s], 5, BARK, L.BARK, cap_top=False)
    top = spine[-1]
    ends = []
    a0 = rng.uniform(0, 6.28)
    for k in range(4):
        a = a0 + 2 * math.pi * k / 4 + rng.uniform(-0.35, 0.35)
        start = L.point_on(spine, 0.75 + 0.06 * k)
        ends.append(claw_branch(m, start, a, rng.uniform(2.3, 2.9) * s, rng.uniform(1.2, 1.9) * s, s, rng, 0.28 * s))
    leaf = GIANT_LEAF if variant == 0 else L.mix(GIANT_LEAF, TEAL, 0.35)
    fn = canopy_color(leaf, L.mix(VIOLET_HI, TEAL_HI, 0.3 * variant))
    m.blob(top + Vector((0, 0, 1.9 * s)), 1.9 * s, leaf, L.LEAF, subdiv=2, rough=0.28, seed=seed, squash=(1, 1, 0.7),
           droop=0.9, color_fn=fn, hi_top=0.5, spikes=0.08, scallop=0.55, lobes=8)
    for k, e in enumerate(ends):
        m.blob(e.lerp(top, 0.3) + Vector((0, 0, 0.55 * s)), rng.uniform(1.0, 1.2) * s, leaf, L.LEAF, subdiv=2, rough=0.3,
               seed=seed * 7 + k, squash=(1, 1, 0.72), droop=1.1, color_fn=fn, hi_top=0.5, spikes=0.08, scallop=0.6, lobes=6)
    a = rng.uniform(0, 6.28)
    d = Vector((math.cos(a), math.sin(a), 0.0))
    hp = L.point_on(spine, 0.33)
    heart(m, hp + d * 0.62 * s, d, 0.28 * s, sparkles=5, rng=rng)
    # two knothole eyes above the heart: the giant is watching
    for side in (-1, 1):
        dd = Vector((math.cos(a + side * 0.32), math.sin(a + side * 0.32), 0.0))
        ep = L.point_on(spine, 0.55)
        knot_eye(m, ep + dd * 0.5 * s, dd, 0.12 * s, glow=True)
    m.bake(ao_dist=2.5 * s, ao_strength=0.85, grad=(0.55, 1.1), hi_color=VIOLET_HI, hi_strength=0.45)
    print(name, m.tri_count(), "tris")
    return m.finish()


def elder(name="elder", seed=77):
    m = L.Model(name, seed)
    rng = m.rng
    H = 20.0
    spine = [Vector((0, 0, 0)), Vector((0.5, -0.3, 3.5)), Vector((-0.4, 0.4, 7.0)), Vector((0.6, 0.1, 10.5)), Vector((0.1, -0.4, 13.5))]
    spine = L.smooth_spine(spine)
    trunk(m, spine, 2.6, 1.3, 12, flare=1.45)
    for k in range(7):
        a = 2 * math.pi * k / 7 + rng.uniform(-0.25, 0.25)
        d = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-d.y, d.x, 0)) * rng.uniform(-0.6, 0.6)
        pts = [d * 1.7 + Vector((0, 0, 3.4)), d * 3.2 + side + Vector((0, 0, 1.5)), d * 4.8 + side * 1.5 + Vector((0, 0, 0.4)),
               d * 6.2 + side * 1.2 + Vector((0, 0, -0.2))]
        m.tube(pts, [1.0, 0.65, 0.35, 0.06], 6, BARK, L.BARK, cap_top=False)
    ends = []
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.4 + rng.uniform(-0.25, 0.25)
        start = L.point_on(spine, 0.68 + 0.05 * (k % 3))
        ends.append(claw_branch(m, start, a, rng.uniform(5.0, 6.4), rng.uniform(2.6, 3.6), 2.0, rng, 0.7))
    fn = canopy_color(GIANT_LEAF, VIOLET_HI)
    m.blob(Vector((0.2, 0, 17.6)), 4.6, GIANT_LEAF, L.LEAF, subdiv=2, rough=0.25, seed=seed, squash=(1, 1, 0.68),
           droop=0.8, color_fn=fn, hi_top=0.5, spikes=0.05, scallop=0.45, lobes=9)
    for k, e in enumerate(ends):
        m.blob(e + Vector((0, 0, 0.8)), rng.uniform(2.5, 3.0), GIANT_LEAF, L.LEAF, subdiv=2, rough=0.3, seed=seed + k,
               squash=(1, 1, 0.72), droop=1.1, color_fn=fn, hi_top=0.5, spikes=0.07, scallop=0.55, lobes=6)
    m.blob(Vector((0.0, 0.3, 21.0)), 2.6, GIANT_LEAF, L.LEAF, subdiv=2, rough=0.25, seed=seed + 20, squash=(1, 1, 0.8),
           droop=0.5, color_fn=fn, hi_top=0.7, spikes=0.06, scallop=0.4, lobes=7)
    # The face looks south, toward the village (Blender -Y is the game's +Z).
    front = Vector((0, -1, 0))
    heart(m, Vector((0.35, -2.3, 4.4)), front, 0.8, sparkles=14, rng=rng)
    for side in (-1, 1):
        d = Vector((side * 0.35, -1, 0.05)).normalized()
        knot_eye(m, Vector((side * 0.95 - 0.1, -1.95, 8.2)), d, 0.4, glow=True, tall=0.7)
    m.bake(ao_dist=5.0, ao_rays=20, ao_strength=0.85, grad=(0.55, 1.1), hi_color=VIOLET_HI, hi_strength=0.45)
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
    m = L.Model(name, seed)
    m.tube([Vector((0, 0, 0)), Vector((0.1, 0, 2.2))], [0.28, 0.16], 4, BARK, L.BARK)
    fn = canopy_color(VIOLET, VIOLET_HI)
    m.blob(Vector((0, 0, 3.0)), 1.4, VIOLET, L.LEAF, subdiv=1, rough=0.2, seed=3, squash=(1, 1, 0.75), droop=0.5, color_fn=fn)
    m.blob(Vector((0.9, 0.4, 2.6)), 0.9, VIOLET, L.LEAF, subdiv=0, rough=0.15, seed=4, color_fn=fn)
    m.bake(ao_dist=1.0, ao_strength=0.6, grad=(0.6, 1.1))
    print(name, m.tri_count(), "tris")
    return m.finish()


def main():
    L.reset()
    obs = [
        pine("pine_s", 3.5, 3, 101, points=6),
        pine("pine_m", 4.6, 4, 102, points=7, eye=False),
        pine("pine_l", 6.0, 5, 103, points=8, eye=True),
        oak("oak_s", 4.0, 201, limbs=2, eyes=1),
        oak("oak_m", 5.0, 202, limbs=3, eyes=2),
        oak("oak_l", 6.2, 203, limbs=3, eyes=2, glow_eye=True),
        giant("giant_a", 301, variant=0),
        giant("giant_b", 302, H=10.5, variant=1),
        elder(),
        grass(),
        bush(),
        boulder(),
        far_pine(),
        far_oak(),
    ]
    L.export(obs, "forest.glb")


if __name__ == "__main__":
    main()
