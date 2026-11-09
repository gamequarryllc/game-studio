"""The swallowed village at the south edge, where the game starts.

Round shape language: soft plastered walls, loaf-shaped thatch with drooping
eaves, round doors and windows lit warm from inside. The curse's roots have
climbed out of the ground and over the roofs. Props compose the square: a
well, lantern posts, a signpost toward the Elder Tree, firewood, fences,
roots crawling over the ground and a root arch over the path into the forest.

Run:  python3 art/blender/village.py     (writes models/village.glb)
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forest_lib as L  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

PLASTER = [L.srgb("#D8CBB0"), L.srgb("#B9BFC4"), L.srgb("#D9B98C")]
THATCH = [L.srgb("#8F6C3C"), L.srgb("#6F5A3F"), L.srgb("#7E5A36")]
THATCH_HI = L.srgb("#C29A5A")
TIMBER = L.srgb("#4A3428")
DOOR = L.srgb("#5C3A27")
WINDOW = L.srgb("#FFC15E")
WINDOW_CORE = L.srgb("#FFE2A0")
STONE = L.srgb("#77707A")
STONE_HI = L.srgb("#A69DA6")
ROOT = L.srgb("#3D2B35")
ROOT_HI = L.srgb("#6B5260")
WOOD = L.srgb("#6E4B33")
WOOD_HI = L.srgb("#A87E57")
IRON = L.srgb("#2E2A30")
BRASS = L.srgb("#B98B3E")
INK = L.srgb("#2E1E14")


def root(m, pts, r0, r1=0.02, sides=5, curl=True):
    """A cursed root following points, tapering, with a curled tip."""
    pts = [Vector(p) for p in pts]
    if curl:
        d = (pts[-1] - pts[-2]).normalized()
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 0.1:
            side = Vector((1, 0, 0))
        side.normalize()
        pts.append(pts[-1] + d * r0 * 2.0 + side * r0 * 1.5)
        pts.append(pts[-1] + side * r0 * 1.8 - d * r0 * 0.8)
    pts = L.smooth_spine(pts)
    n = len(pts)
    radii = [r0 + (r1 - r0) * (i / (n - 1)) ** 0.8 for i in range(n)]
    m.tube(pts, radii, sides, ROOT, L.BARK, cap_top=False, twist=1.5,
           color_fn=lambda t, k: L.mix(ROOT, ROOT_HI, 0.25 * (k % 2)))


THATCH_DARK = L.srgb("#3E2C1C")
MOSS = L.srgb("#4A5A3A")
DAMP = L.srgb("#5A5048")


def thatch_color(base, band_f):
    """Carved thatch: each layer light at its top, going dark at the lip where it overhangs the next."""
    return L.mix(L.mix(base, THATCH_HI, 0.45), THATCH_DARK, band_f ** 1.6 * 0.85)


def loaf_roof(m, W, D, H, top, base, seed, bands=4, nv=10, rng=None):
    """A loaf of thatch cut into layered bands down each slope, each band
    stepping out at its lower lip (carved, not smooth), drooping eaves."""
    per = 3
    nu = bands * per * 2
    hx, hy = W * 0.5 + 0.55, D * 0.5 + 0.6
    grid = []
    for i in range(nv + 1):
        v = -1 + 2 * i / nv
        row = []
        for j in range(nu + 1):
            u = -1 + 2 * j / nu
            au = abs(u)
            band = min(bands - 1, int(au * bands))
            f = au * bands - band
            hip = 1.0 - max(0.0, abs(v) - 0.55) / 0.45 * 0.75
            z = H - 0.15 + top * max(0.0, 1.0 - au ** 1.7) * hip - 0.25 * au ** 6
            x = v * hx * (1.0 - 0.12 * au ** 2)
            y = u * hy
            step = f * 0.09 * (0.6 + 0.4 * au)                  # each band juts out at its lip
            z -= step * 0.6
            y += math.copysign(step * 0.5, u) if au > 0.02 else 0.0
            z += 0.035 * math.sin(v * 13 + band * 2.1 + seed)   # straw bundles, not a plastic shell
            if au > 0.97:
                z -= 0.06 * (0.5 + 0.5 * math.sin(v * 17 + seed))  # a ragged eave
            row.append(m.vert((x, y, z), thatch_color(base, f), L.BARK, 0.0))
        grid.append(row)
    for i in range(nv):
        for j in range(nu):
            m.face([grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]])
    under = [grid[i][0] for i in range(nv + 1)] + [grid[nv][j] for j in range(1, nu + 1)] + \
            [grid[i][nu] for i in range(nv - 1, -1, -1)] + [grid[0][j] for j in range(nu - 1, 0, -1)]
    c = m.vert((0, 0, H - 0.3), L.scale(base, 0.3), L.BARK)
    for k in range(len(under)):
        m.face([c, under[(k + 1) % len(under)], under[k]])
    # moss creeping along the lowest band
    return grid


def round_window(m, wc, r, facing=Vector((0, -1, 0))):
    side = Vector((1, 0, 0)) if abs(facing.x) < 0.9 else Vector((0, 1, 0))
    up = Vector((0, 0, 1))
    ring = [wc + (side * math.cos(2 * math.pi * k / 10) + up * math.sin(2 * math.pi * k / 10)) * r for k in range(10)]
    m.fan(wc + facing * 0.01, list(reversed(ring)) if facing.y < 0 else ring, WINDOW_CORE, WINDOW, L.GLOW)
    fr = []
    for k in range(10):
        a = 2 * math.pi * k / 10
        d = side * math.cos(a) + up * math.sin(a)
        fr.append((m.vert(wc + d * r + facing * 0.02, TIMBER, L.BARK), m.vert(wc + d * (r + 0.12) + facing * 0.02, TIMBER, L.BARK)))
    for k in range(10):
        a, b = fr[k], fr[(k + 1) % 10]
        m.face([a[1], b[1], b[0], a[0]])
    m.box(wc + facing * 0.03, (0.06 if facing.y else 0.04, 0.04 if facing.y else 0.06, r * 2.0), TIMBER, L.BARK)
    m.box(wc + facing * 0.03, ((r * 2.0) if facing.y else 0.04, 0.04 if facing.y else r * 2.0, 0.06), TIMBER, L.BARK)


def round_door(m, dc, w=0.48, h=1.05):
    prof = [Vector((math.cos(math.pi * k / 8) * w, 0, h + math.sin(math.pi * k / 8) * w)) for k in range(9)]
    pts = [Vector((w, 0, 0.3))] + prof + [Vector((-w, 0, 0.3))]
    m.fan(dc + Vector((0, 0, h * 0.85)), [dc + p for p in pts], L.scale(DOOR, 1.1), DOOR, L.BARK)
    for k in range(3):        # planks
        x = (k - 1) * w * 0.55
        m.box(dc + Vector((x, -0.015, (h + 0.3) * 0.5 + 0.1)), (0.025, 0.02, h * 0.9), L.scale(DOOR, 0.7), L.BARK)
    m.box(dc + Vector((w * 0.6, -0.04, h * 0.9)), (0.07, 0.05, 0.07), BRASS, L.BARK)


def wall_color(wall):
    """Plaster gone damp and dirty at the foot, a little mottled everywhere."""
    def fn(v):
        z = v.co.z
        damp = max(0.0, 1.0 - z / 0.9)
        return L.mix(wall, DAMP, damp * 0.55), L.BARK
    return fn


def cottage(name, seed, variant, W=3.6, D=3.0, H=2.3, lean=0.0, chimney=True, windows=2):
    """A plastered cottage with carved, layered thatch, round lit windows, a
    round plank door, a crooked chimney and the curse's roots climbing over it."""
    m = L.Model(name, seed)
    rng = m.rng
    wall = PLASTER[variant % 3]
    vs = m.box((0, 0, H * 0.5), (W, D, H), wall, L.BARK, bevel=0.3, smooth=True)
    for v in vs:
        k = 1.0 + 0.05 * (1.0 - v.co.z / H)
        v.co.x *= k
        v.co.y *= k
        v.co.x += lean * v.co.z            # an old house settling to one side
    m.recolor(vs, wall_color(wall))
    m.box((0, 0, 0.18), (W + 0.25, D + 0.25, 0.36), STONE, L.BARK, bevel=0.12, smooth=True)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((sx * (W * 0.5 - 0.02) + lean * H * 0.5, sy * (D * 0.5 - 0.02), H * 0.5 + 0.1), (0.16, 0.16, H - 0.1), TIMBER, L.BARK, bevel=0.03,
                  rot=Matrix.Rotation(-lean, 3, 'Y'))
    m.box((lean * H, -D * 0.5 - 0.03, H - 0.12), (W + 0.1, 0.14, 0.16), TIMBER, L.BARK, bevel=0.03)
    roof = loaf_roof(m, W, D, H, 1.7 + 0.12 * variant, THATCH[variant % 3], seed)
    for row in roof:
        for v in row:
            v.co.x += lean * H
    round_door(m, Vector((-0.2 * W * (variant - 1) * 0.5, -D * 0.5 - 0.06, 0.0)))
    for k in range(windows):
        sx = (1 if k == 0 else -1) * (W * 0.32)
        wc = Vector((sx + lean * 1.35, -D * 0.5 - 0.07, 1.35))
        round_window(m, wc, 0.36)
        m.box(wc + Vector((0, -0.15, -0.5)), (0.78, 0.22, 0.16), WOOD, L.BARK, bevel=0.02)
    if chimney:
        cx = (W * 0.28) * (1 if variant != 1 else -1) + lean * H
        for k in range(4):
            m.box((cx + 0.05 * k * (1 if seed % 2 else -1), 0.55, H + 1.0 + 0.42 * k), (0.62 - 0.03 * k, 0.6 - 0.03 * k, 0.44), STONE, L.BARK,
                  bevel=0.06, rot=Matrix.Rotation(0.05 * k, 3, 'Y'))
    n_roots = 2 + variant
    for k in range(n_roots):
        side = -1 if k % 2 == 0 else 1
        x0 = side * rng.uniform(0.5, W * 0.55)
        start = Vector((x0 + side * 0.8, D * 0.5 + 1.6, -0.2))
        pts = [start, Vector((x0 + side * 0.4, D * 0.5 + 0.6, 1.0)), Vector((x0, D * 0.2, H + 1.4)),
               Vector((x0 * 0.9, -D * 0.25, H + 1.0)), Vector((x0 * 0.85 + side * 0.2, -D * 0.5 - 0.65, H - 0.1)),
               Vector((x0 * 0.8 + side * 0.4, -D * 0.5 - 0.5, H * 0.45))]
        if k >= 2:
            pts = pts[:4]
        root(m, pts, rng.uniform(0.18, 0.27), 0.03)
    m.bake(ao_dist=1.4, ao_rays=20, ao_strength=0.75, grad=(0.75, 1.05), wear=0.35, grime=0.45, paint=0.16, paint_scale=1.6)
    print(name, m.tri_count(), "tris")
    return m.finish()


def lodge(name="lodge", seed=48):
    """The landmark: the old keeper's lodge, a round two-storey house of stone
    and plaster under a tall cone of carved thatch, with a crooked stone
    chimney taller than anything in the village (it smokes, in the game), a
    lantern by the door and roots wrapped round its drum."""
    m = L.Model(name, seed)
    rng = m.rng
    R, H = 2.5, 3.4
    # a stone plinth, then the plastered drum
    m.lathe([(R + 0.25, 0.0), (R + 0.28, 0.25), (R + 0.2, 0.55), (R, 0.6)], 16, STONE, L.BARK, close_top=False, close_bottom=False,
            wobble=0.03, color_fn=lambda t, k: L.mix(STONE, STONE_HI, 0.35 * ((k + int(t * 3)) % 2)))
    rings = m.lathe([(R, 0.55), (R * 1.01, 1.4), (R * 0.99, 2.4), (R * 0.97, H)], 16, PLASTER[0], L.BARK, close_top=False, close_bottom=False,
                    wobble=0.02, color_fn=lambda t, k: L.mix(DAMP, PLASTER[0], min(1.0, t * 2.2)))
    # a timber band between the storeys
    m.lathe([(R * 1.0 + 0.04, 1.85), (R + 0.07, 1.95), (R + 0.04, 2.05)], 16, TIMBER, L.BARK, close_top=False, close_bottom=False)
    # the cone of thatch: carved bands, each jutting out at its lip, a ragged eave
    bands, per = 5, 3
    prof = []
    top_z = H + 4.2
    for b in range(bands):
        for p in range(per + 1):
            f = p / per
            t = (b + f) / bands
            r = (R + 0.9) * (1.0 - t) ** 1.05 + 0.08
            z = H - 0.3 + (top_z - H + 0.3) * t ** 0.9
            r += f * 0.12 * (1.0 - t)
            z -= f * 0.06
            prof.append((r, z, f))
    prof = list(reversed(prof))
    sides = 20
    rings2 = []
    for i, (r, z, f) in enumerate(prof):
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            rr = r * (1.0 + 0.03 * math.sin(a * 5 + i))
            zz = z + (0.05 * math.sin(a * 7 + i) if i == len(prof) - 1 else 0.0)
            ring.append(m.vert((math.cos(a) * rr, math.sin(a) * rr, zz), thatch_color(THATCH[0], f), L.BARK))
        rings2.append(ring)
    for i in range(len(rings2) - 1):
        a, b = rings2[i], rings2[i + 1]
        for k in range(sides):
            k2 = (k + 1) % sides
            m.face([a[k], a[k2], b[k2], b[k]])
    tip = m.vert((0, 0, top_z + 0.25), THATCH_HI, L.BARK)
    for k in range(sides):
        m.face([tip, rings2[0][(k + 1) % sides], rings2[0][k]])
    # a finial knot of straw on top
    m.blob(Vector((0, 0, top_z + 0.3)), 0.22, THATCH[2], L.BARK, subdiv=1, rough=0.3, seed=3)
    # door and windows round the front (-Y), upstairs too
    front = Vector((0, -1, 0))
    round_door(m, Vector((0.0, -R - 0.04, 0.55)), w=0.55, h=1.15)
    for a, z, r in ((-0.55, 1.35, 0.34), (0.6, 1.3, 0.3), (0.25, 2.65, 0.3), (-0.95, 2.7, 0.26)):
        d = Vector((math.sin(a), -math.cos(a), 0))
        round_window(m, d * (R + 0.02) + Vector((0, 0, z)), r, facing=Vector((0, -1, 0)) if abs(a) < 0.7 else d)
    # a lantern on a bracket by the door
    lc = Vector((0.85, -R - 0.35, 1.9))
    m.tube([Vector((0.75, -R + 0.05, 2.15)), Vector((0.8, -R - 0.3, 2.2)), lc + Vector((0, 0, 0.32))], [0.03, 0.025, 0.02], 4, IRON, L.BARK)
    m.lathe([(0.0, 0.3), (0.12, 0.24), (0.15, 0.18), (0.04, 0.18)], 6, IRON, L.BARK, center=lc, close_bottom=False)
    m.lathe([(0.1, -0.1), (0.115, 0.05), (0.1, 0.18)], 6, WINDOW, L.GLOW, center=lc, close_top=False, close_bottom=True)
    # the tall crooked chimney up the side, through the eave
    cx, cy = R * 0.78, R * 0.62
    for k in range(16):
        lean = 0.012 * k * k * 0.25
        m.box((cx + 0.06 * math.sin(k * 0.9) - lean, cy + 0.02 * k, 0.6 + 0.5 * k), (0.82 - 0.015 * k, 0.76 - 0.015 * k, 0.52),
              L.mix(STONE, STONE_HI, 0.3 * (k % 2)), L.BARK, bevel=0.07, rot=Matrix.Rotation(0.05 * math.sin(k), 3, 'Y'))
    m.box((cx + 0.04 - 0.012 * 15 * 15 * 0.25, cy + 0.32, 0.6 + 0.5 * 16 - 0.15), (0.84, 0.78, 0.14), L.scale(STONE, 0.6), L.BARK, bevel=0.03)
    # roots wrapped round the drum
    for k in range(3):
        a0 = 2.2 + k * 1.3
        pts = []
        for i in range(7):
            a = a0 + i * 0.32
            pts.append(Vector((math.cos(a) * (R + 0.15), math.sin(a) * (R + 0.15), 0.1 + i * 0.45 + 0.2 * math.sin(i + k))))
        root(m, [Vector((math.cos(a0) * (R + 1.6), math.sin(a0) * (R + 1.6), -0.2))] + pts, 0.24, 0.03)
    m.bake(ao_dist=1.6, ao_rays=20, ao_strength=0.75, grad=(0.72, 1.05), wear=0.35, grime=0.45, paint=0.16, paint_scale=1.4)
    print(name, m.tri_count(), "tris")
    return m.finish()


LODGE_CHIMNEY = Vector((2.5 * 0.78 - 0.63, 2.5 * 0.62 + 0.32, 8.6))   # where its smoke comes out (Blender coords)


def woodshed(name="woodshed", seed=49):
    """A lean-to woodshed: four crooked posts, a mossy plank roof, split logs inside."""
    m = L.Model(name, seed)
    rng = m.rng
    for sx, sy, h in ((-1.2, -0.7, 2.1), (1.2, -0.7, 2.0), (-1.2, 0.7, 1.6), (1.2, 0.7, 1.55)):
        m.tube([Vector((sx, sy, 0)), Vector((sx + rng.uniform(-0.05, 0.05), sy, h))], [0.08, 0.07], 5, WOOD, L.BARK)
    for k in range(7):
        x = -1.35 + k * 0.45
        z0, z1 = 2.1, 1.55
        m.box((x, 0.0, (z0 + z1) * 0.5 + 0.05), (0.43, 1.75, 0.05), L.mix(L.srgb("#5A3E2A"), MOSS, 0.25 * (k % 3)), L.BARK, bevel=0.01,
              rot=Matrix.Rotation(-math.atan2(z0 - z1, 1.4), 3, 'X') @ Matrix.Rotation(rng.uniform(-0.04, 0.04), 3, 'Z'))
    for row in range(3):
        for k in range(5 - row % 2):
            x = -0.95 + k * 0.42 + (0.21 if row % 2 else 0.0) + rng.uniform(-0.04, 0.04)
            r = rng.uniform(0.12, 0.17)
            ln = rng.uniform(0.9, 1.2)
            pts = [Vector((x, -ln * 0.5, 0.16 + row * 0.27)), Vector((x + rng.uniform(-0.05, 0.05), ln * 0.5, 0.16 + row * 0.27))]
            rings = m.tube(pts, [r, r], 7, WOOD, L.BARK, cap_top=False, cap_bottom=False,
                           color_fn=lambda t, kk: L.mix(WOOD, L.srgb("#4E3424"), 0.4 * (kk % 2)))
            for end, ring, rev in ((pts[0], rings[0], True), (pts[1], rings[1], False)):
                c = m.vert(end, WOOD_HI, L.BARK)
                for i in range(len(ring)):
                    m.face([ring[(i + 1) % len(ring)], ring[i], c] if rev else [ring[i], ring[(i + 1) % len(ring)], c])
    m.bake(ao_dist=0.8, ao_strength=0.75, wear=0.3, grime=0.4, paint=0.15, paint_scale=3.0)
    print(name, m.tri_count(), "tris")
    return m.finish()


def flagstone(name, seed):
    """One hand-cut stone for the village paths: an irregular slab, a little
    domed and bevelled, worn pale on top, moss in its edges."""
    m = L.Model(name, seed)
    rng = m.rng
    n = rng.randint(9, 12)
    R = 0.5
    pts = []
    stretch = rng.uniform(0.62, 0.95)              # most stones longer than wide
    ph = rng.uniform(0, 6.28)
    for k in range(n):
        a = 2 * math.pi * k / n + rng.uniform(-0.12, 0.12)
        # a few flat sawn-looking sides and a few chipped bumps: not a polygon
        r = R * (0.82 + 0.16 * math.sin(a * 2 + ph) + rng.uniform(-0.1, 0.06))
        pts.append((math.cos(a) * r, math.sin(a) * r * stretch))
    base = L.mix(L.srgb("#5A4C42"), L.srgb("#6A5A4C"), rng.random())     # warm: the blue moon greys it
    top = []
    bev = []
    bot = []
    for (x, y) in pts:
        bot.append(m.vert((x * 1.02, y * 1.02, -0.06), L.mix(base, MOSS, 0.7), L.BARK))
        bev.append(m.vert((x, y, 0.06), L.mix(base, MOSS, 0.35 * rng.random()), L.BARK))
        top.append(m.vert((x * 0.84, y * 0.84, 0.1), L.mix(base, STONE_HI, 0.12), L.BARK))
    centre = m.vert((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), 0.115), L.mix(base, STONE_HI, 0.25), L.BARK)
    for k in range(n):
        k2 = (k + 1) % n
        m.face([bot[k], bot[k2], bev[k2], bev[k]])
        m.face([bev[k], bev[k2], top[k2], top[k]])
        m.face([top[k], top[k2], centre])
    m.bake(ao_dist=0.3, ao_strength=0.5, paint=0.2, paint_scale=4.0)
    return m.finish()


def well(name="well", seed=61):
    m = L.Model(name, seed)
    prof = [(0.95, 0.0), (1.0, 0.25), (1.0, 0.75), (0.92, 0.82), (0.75, 0.82), (0.72, 0.3)]
    m.lathe(prof, 12, STONE, L.BARK, close_top=False, close_bottom=False, wobble=0.04,
            color_fn=lambda t, k: L.mix(STONE, STONE_HI, 0.35 * ((k + int(t * 4)) % 2)))
    m.lathe([(0.72, 0.3), (0.0, 0.3)], 12, L.srgb("#141018"), L.BARK, close_top=False, close_bottom=False)
    for sx in (-1, 1):
        m.box((sx * 0.85, 0, 1.25), (0.14, 0.14, 1.9), WOOD, L.BARK, bevel=0.03)
    for sy in (-1, 1):
        rot = Matrix.Rotation(sy * 0.75, 3, 'X')
        m.box((0, sy * 0.42, 2.25), (2.1, 1.05, 0.08), L.srgb("#5A3E2A"), L.BARK, bevel=0.02, rot=rot)
    m.box((0, 0, 1.75), (1.6, 0.1, 0.1), WOOD, L.BARK)
    m.lathe([(0.16, 0.0), (0.19, 0.28), (0.2, 0.3)], 8, WOOD, L.BARK, center=(0.15, 0, 1.15))
    m.bake(ao_dist=1.0, ao_strength=0.75)
    print(name, m.tri_count(), "tris")
    return m.finish()


def lantern_post(name="lantern_post", seed=62):
    m = L.Model(name, seed)
    pts = [Vector((0, 0, 0)), Vector((0.06, 0.02, 1.0)), Vector((-0.04, 0.0, 2.0)), Vector((0.0, 0.0, 2.6))]
    m.tube(pts, [0.11, 0.09, 0.08, 0.07], 6, WOOD, L.BARK, color_fn=lambda t, k: L.mix(WOOD, WOOD_HI, 0.2 * (k % 2)))
    m.tube([Vector((0, 0, 2.45)), Vector((0.35, 0, 2.55)), Vector((0.6, 0, 2.5))], [0.05, 0.04, 0.035], 5, WOOD, L.BARK)
    lc = Vector((0.6, 0, 2.05))
    m.tube([lc + Vector((0, 0, 0.42)), lc + Vector((0, 0, 0.3))], [0.01, 0.01], 3, IRON, L.BARK, cap_top=False)
    m.lathe([(0.0, 0.42), (0.14, 0.34), (0.2, 0.26), (0.05, 0.26)], 6, IRON, L.BARK, center=lc, close_bottom=False)
    m.lathe([(0.13, -0.14), (0.15, 0.06), (0.13, 0.26)], 6, WINDOW, L.GLOW, center=lc, close_top=False, close_bottom=True)
    m.lathe([(0.17, -0.2), (0.15, -0.14), (0.0, -0.14)], 6, IRON, L.BARK, center=lc, close_top=False)
    m.bake(ao_dist=0.6, ao_strength=0.6)
    print(name, m.tri_count(), "tris")
    return m.finish()


def signpost(name="signpost", seed=63):
    m = L.Model(name, seed)
    m.tube([Vector((0, 0, 0)), Vector((0.05, 0.02, 1.2)), Vector((0.0, 0.0, 2.3))], [0.1, 0.085, 0.07], 6, WOOD, L.BARK)
    for k, (a, z, ln) in enumerate(((math.pi * 0.5, 1.95, 1.2), (math.pi * 0.5 + 2.6, 1.55, 1.0))):
        d = Vector((math.cos(a), math.sin(a), 0))
        rot = Matrix.Rotation(a, 3, 'Z') @ Matrix.Rotation(0.06 * (1 if k else -1), 3, 'X')
        c = d * (ln * 0.5 - 0.05) + Vector((0, 0, z))
        m.box(c, (ln, 0.06, 0.26), L.srgb("#8A6444"), L.BARK, bevel=0.02, rot=rot)
        tip = d * (ln - 0.02) + Vector((0, 0, z))
        side = Vector((0, 0, 1))
        m.fan(tip + d * 0.18, [tip + side * 0.15 + Vector((-d.y, d.x, 0)) * 0.035, tip - side * 0.15 + Vector((-d.y, d.x, 0)) * 0.035,
                               tip - side * 0.15 - Vector((-d.y, d.x, 0)) * 0.035, tip + side * 0.15 - Vector((-d.y, d.x, 0)) * 0.035],
              L.srgb("#8A6444"), L.srgb("#8A6444"), L.BARK, double=True)
        # painted ink stripes on the board
        m.box(c + Vector((0, 0, 0)) + Vector((-d.y, d.x, 0)) * 0.035, (ln * 0.6, 0.01, 0.03), INK, L.BARK, rot=rot)
    m.bake(ao_dist=0.6, ao_strength=0.6)
    print(name, m.tri_count(), "tris")
    return m.finish()


def woodpile(name="woodpile", seed=64):
    """Firewood stacked the way people stack it: uneven rows of logs of
    different lengths and thicknesses, a few split, one rolled off, and a
    chopping block with the axe left in it."""
    m = L.Model(name, seed)
    rng = m.rng
    counts = [5, 4, 4, 2]
    for row, cnt in enumerate(counts):
        for k in range(cnt):
            x = (k - (cnt - 1) * 0.5) * 0.33 + rng.uniform(-0.05, 0.05) + (0.12 if row == 3 else 0.0)
            r = rng.uniform(0.11, 0.17)
            z = 0.15 + row * 0.27 + rng.uniform(-0.02, 0.02)
            ln = rng.uniform(1.0, 1.45)
            off = rng.uniform(-0.12, 0.12)
            pts = [Vector((x, -ln * 0.5 + off, z)), Vector((x + rng.uniform(-0.04, 0.04), ln * 0.5 + off, z + rng.uniform(-0.03, 0.03)))]
            split = rng.random() < 0.3
            rings = m.tube(pts, [r, r * 0.95], 7, WOOD, L.BARK, cap_top=False, cap_bottom=False, squash=(1.0, 0.6) if split else None,
                           color_fn=lambda t, kk: L.mix(WOOD, L.srgb("#4E3424"), 0.4 * (kk % 2)))
            for end, ring, rev in ((pts[0], rings[0], True), (pts[1], rings[1], False)):
                c = m.vert(end, WOOD_HI, L.BARK)
                for i in range(len(ring)):
                    m.face([ring[(i + 1) % len(ring)], ring[i], c] if rev else [ring[i], ring[(i + 1) % len(ring)], c])
    # one rolled off on the ground
    m.tube([Vector((1.05, -0.4, 0.13)), Vector((1.25, 0.55, 0.13))], [0.13, 0.13], 7, WOOD, L.BARK, cap_top=True, cap_bottom=True)
    # the chopping block and the axe
    m.lathe([(0.32, 0.0), (0.34, 0.25), (0.31, 0.5), (0.0, 0.5)], 10, WOOD, L.BARK, center=(-1.25, 0.2, 0), close_bottom=False,
            color_fn=lambda t, k: WOOD_HI if t > 0.9 else L.mix(WOOD, L.srgb("#4E3424"), 0.3 * (k % 2)))
    m.tube([Vector((-1.2, 0.2, 0.55)), Vector((-1.05, 0.25, 1.15))], [0.03, 0.028], 5, WOOD_HI, L.BARK)
    m.box(Vector((-1.21, 0.2, 0.58)), (0.18, 0.04, 0.14), IRON, L.BARK, bevel=0.01, rot=Matrix.Rotation(-0.25, 3, 'Y'))
    m.bake(ao_dist=0.5, ao_strength=0.8, wear=0.3, grime=0.35, paint=0.12, paint_scale=4.0)
    print(name, m.tri_count(), "tris")
    return m.finish()


def fence(name="fence", seed=65):
    m = L.Model(name, seed)
    rng = m.rng
    tops = []
    for k in range(4):
        x = -2.1 + k * 1.4
        lean = rng.uniform(-0.08, 0.08)
        h = rng.uniform(1.0, 1.15)
        m.tube([Vector((x, 0, 0)), Vector((x + lean, 0, h))], [0.07, 0.06], 5, WOOD, L.BARK)
        tops.append((x, lean, h))
    for z in (0.45, 0.85):
        for k in range(3):
            a = Vector((tops[k][0] + tops[k][1] * z, 0.05, z + rng.uniform(-0.04, 0.04)))
            b = Vector((tops[k + 1][0] + tops[k + 1][1] * z, 0.05, z + rng.uniform(-0.04, 0.04)))
            m.tube([a, b], [0.04, 0.04], 4, L.srgb("#7A5639"), L.BARK, cap_top=False)
    m.bake(ao_dist=0.5, ao_strength=0.6)
    print(name, m.tri_count(), "tris")
    return m.finish()


def ground_roots(name="ground_roots", seed=66):
    """Roots crawling out of the forest across the village square."""
    m = L.Model(name, seed)
    rng = m.rng
    for k in range(4):
        y0 = -4.5
        x0 = (k - 1.5) * 1.6 + rng.uniform(-0.4, 0.4)
        pts = [Vector((x0, y0, -0.15))]
        x, y = x0, y0
        for i in range(5):
            x += rng.uniform(-0.6, 0.6)
            y += rng.uniform(0.8, 1.3)
            pts.append(Vector((x, y, 0.06 + 0.12 * math.sin(i * 1.7 + k))))
        root(m, pts, rng.uniform(0.16, 0.24), 0.02, sides=5)
    m.bake(ao_dist=0.6, ao_strength=0.7)
    print(name, m.tri_count(), "tris")
    return m.finish()


def root_arch(name="root_arch", seed=67):
    """A great root arching over the path where it enters the forest."""
    m = L.Model(name, seed)
    pts = [Vector((-2.8, 0.4, -0.3)), Vector((-2.5, 0.1, 1.6)), Vector((-1.6, -0.1, 3.3)), Vector((0.0, 0.2, 3.9)),
           Vector((1.5, 0.0, 3.4)), Vector((2.4, -0.2, 1.8)), Vector((2.9, 0.3, -0.2))]
    pts = L.smooth_spine(pts)
    n = len(pts)
    radii = [0.5 - 0.18 * math.sin(math.pi * i / (n - 1)) for i in range(n)]
    m.tube(pts, radii, 7, ROOT, L.BARK, cap_top=False, twist=3.0, color_fn=lambda t, k: L.mix(ROOT, ROOT_HI, 0.25 * (k % 2)))
    for k, (a, b) in enumerate(((0.25, -0.5), (0.45, 0.6), (0.62, -0.4))):
        p = L.point_on(pts, a)
        root(m, [p, p + Vector((b, 0.3, -0.6)), p + Vector((b * 1.4, 0.5, -1.4))], 0.12, 0.01)
    # a cursed knot on the arch, watching the path
    import trees
    trees.knot_eye(m, L.point_on(pts, 0.5) + Vector((0, -0.42, 0)), Vector((0, -1, 0.2)), 0.16, glow=True, bark=ROOT)
    for side in (-1, 1):
        for k in range(3):
            a = side * 0.9 + k * 0.5 * side
            root(m, [Vector((side * 2.85, 0.3, -0.1)), Vector((side * 2.85 + math.cos(a) * 0.9, 0.3 + math.sin(a) * 0.9, 0.05))], 0.14, 0.02, curl=False)
    m.bake(ao_dist=1.2, ao_strength=0.75)
    print(name, m.tri_count(), "tris")
    return m.finish()


def main():
    L.reset()
    obs = [lodge(), cottage("cottage_mid", 42, 1), cottage("cottage_small", 43, 2, W=2.5, D=2.3, H=1.95, lean=0.06, windows=1),
           woodshed(), well(), lantern_post(), signpost(), woodpile(), fence(), ground_roots(), root_arch()]
    obs += [flagstone("flagstone_%d" % k, 300 + k) for k in range(6)]
    L.export(obs, "village.glb")


if __name__ == "__main__":
    main()
