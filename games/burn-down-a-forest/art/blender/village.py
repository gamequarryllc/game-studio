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


SHINGLE = [L.srgb("#5E4634"), L.srgb("#6E5240"), L.srgb("#4E3A2C")]
SLATE = [L.srgb("#4E5466"), L.srgb("#5C6274"), L.srgb("#454A5A")]
BRICK = L.srgb("#8A4A36")
BRICK_HI = L.srgb("#B06A50")
CLAY = L.srgb("#A86A44")


def gable_roof(m, W, D, H, rise, over, cols, seed, rows=7, eave_drop=0.0, hip=0.0):
    """A pitched roof laid in courses of shingles or slates: each course a row
    of small tiles that step out over the one below (alternating colours, a
    ragged lower edge), deep eaves that overhang the walls by `over`, and a
    ridge cap. hip > 0 slopes the gable ends in too (a hipped roof)."""
    rng = m.rng
    hx = W * 0.5 + over
    hy = D * 0.5 + over
    for side in (-1, 1):
        for r in range(rows):
            t0 = r / rows
            t1 = (r + 1.15) / rows
            y0 = side * hy * (1.0 - t0)
            y1 = side * hy * (1.0 - t1)
            z0 = H - eave_drop + rise * t0
            z1 = H - eave_drop + rise * t1
            inset0 = hip * t0
            inset1 = hip * t1
            ntiles = max(4, int(W * 3.2))
            for k in range(ntiles):
                u0 = k / ntiles
                u1 = (k + 1) / ntiles
                x0 = -hx * (1.0 - inset0) + 2 * hx * (1.0 - inset0) * u0
                x1 = -hx * (1.0 - inset0) + 2 * hx * (1.0 - inset0) * u1
                x0b = -hx * (1.0 - inset1) + 2 * hx * (1.0 - inset1) * u0
                x1b = -hx * (1.0 - inset1) + 2 * hx * (1.0 - inset1) * u1
                drop = rng.uniform(0.0, 0.06)
                col = cols[(k + r) % len(cols)]
                col = L.mix(col, L.srgb("#2E241E"), rng.uniform(0.0, 0.2))
                lip = 0.045
                a = m.vert((x0 + 0.01, y0, z0 - drop), col, L.BARK, 0.2)
                b = m.vert((x1 - 0.01, y0, z0 - drop), col, L.BARK, 0.2)
                c = m.vert((x1b - 0.01, y1, z1), L.mix(col, THATCH_DARK, 0.25), L.BARK)
                d = m.vert((x0b + 0.01, y1, z1), L.mix(col, THATCH_DARK, 0.25), L.BARK)
                a2 = m.vert((x0 + 0.01, y0, z0 - drop - lip), L.scale(col, 0.6), L.BARK)
                b2 = m.vert((x1 - 0.01, y0, z0 - drop - lip), L.scale(col, 0.6), L.BARK)
                if side > 0:
                    m.face([a, b, c, d])
                    m.face([a2, b2, b, a])
                else:
                    m.face([d, c, b, a])
                    m.face([a, b, b2, a2])
    # the ridge cap
    m.tube([Vector((-hx * (1.0 - hip), 0, H - eave_drop + rise + 0.04)), Vector((hx * (1.0 - hip), 0, H - eave_drop + rise + 0.04))],
           [0.11, 0.11], 6, L.scale(cols[0], 0.75), L.BARK, cap_top=True, cap_bottom=True)
    # gable ends: the wall's triangle up under the roof (plaster), unless hipped
    return hx, hy


def gable_wall(m, W, D, H, rise, wall):
    for side in (-1, 1):
        x = side * W * 0.5
        a = m.vert((x, -D * 0.5, H), wall, L.BARK)
        b = m.vert((x, D * 0.5, H), wall, L.BARK)
        c = m.vert((x, 0, H + rise * 0.96), L.mix(wall, DAMP, 0.15), L.BARK)
        m.face([a, b, c] if side > 0 else [c, b, a])


def chimney_stack(m, x, y, z0, h, kind, seed):
    """Three different chimneys: a crooked fieldstone stack with a clay pot,
    a brick stack with a corbelled lip, a stone stack leaning with age."""
    rng = m.rng
    if kind == "brick":
        n = int(h / 0.22)
        for k in range(n):
            m.box((x + 0.01 * k * (1 if seed % 2 else -1), y, z0 + 0.22 * k + 0.11), (0.62, 0.55, 0.22),
                  BRICK if k % 2 else L.mix(BRICK, BRICK_HI, 0.35), L.BARK, bevel=0.02)
        top = z0 + 0.22 * n
        m.box((x + 0.01 * n * (1 if seed % 2 else -1), y, top + 0.06), (0.76, 0.68, 0.12), L.mix(BRICK, STONE, 0.4), L.BARK, bevel=0.03)
        return Vector((x + 0.01 * n * (1 if seed % 2 else -1), y, top + 0.12))
    stones = int(h / 0.32)
    lean = 0.0
    for k in range(stones):
        lean += rng.uniform(0.0, 0.025)
        w = 0.7 - 0.012 * k
        m.box((x + lean, y + rng.uniform(-0.02, 0.02), z0 + 0.32 * k + 0.16), (w, w * 0.92, 0.34),
              L.mix(STONE, STONE_HI, 0.35 * ((k + seed) % 2)), L.BARK, bevel=0.07, rot=Matrix.Rotation(rng.uniform(-0.06, 0.06), 3, 'Z'))
    top = z0 + 0.32 * stones
    if kind == "pot":
        m.lathe([(0.16, 0.0), (0.18, 0.12), (0.14, 0.3), (0.17, 0.36), (0.13, 0.36)], 8, CLAY, L.BARK, center=(x + lean, y, top),
                close_top=False, close_bottom=True)
        return Vector((x + lean, y, top + 0.36))
    return Vector((x + lean, y, top))


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
        print("%s chimney top" % name, (round(cx + 0.05 * 3 * (1 if seed % 2 else -1), 3), 0.55, round(H + 1.0 + 0.42 * 3 + 0.22, 3)))
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


def pitched_cottage(name, seed, wall, roof, W, D, H, rise, over, chimney_kind, hip=0.0, lean=0.0, windows=2, door_x=0.0):
    """A plastered cottage under a pitched roof of shingles or slates with deep
    overhanging eaves, timber corners and a sill under each round lit window,
    a round plank door, its own kind of chimney, damp at the foot of the walls
    and the curse's roots climbing over it."""
    m = L.Model(name, seed)
    rng = m.rng
    vs = m.box((0, 0, H * 0.5), (W, D, H), wall, L.BARK, bevel=0.22, smooth=True)
    for v in vs:
        v.co.x += lean * v.co.z
    m.recolor(vs, wall_color(wall))
    m.box((0, 0, 0.2), (W + 0.3, D + 0.3, 0.4), STONE, L.BARK, bevel=0.12, smooth=True)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((sx * (W * 0.5 - 0.02) + lean * H * 0.5, sy * (D * 0.5 - 0.02), H * 0.5 + 0.1), (0.18, 0.18, H - 0.1), TIMBER, L.BARK,
                  bevel=0.03, rot=Matrix.Rotation(-lean, 3, 'Y'))
    m.box((lean * H, -D * 0.5 - 0.03, H - 0.12), (W + 0.12, 0.16, 0.18), TIMBER, L.BARK, bevel=0.03)
    if hip <= 0.0:
        gable_wall(m, W, D, H, rise, wall)
    hx, hy = gable_roof(m, W, D, H, rise, over, roof, seed, rows=8, hip=hip)
    # carved bargeboards along the eaves, a scalloped fascia
    for side in (-1, 1):
        y = side * hy
        pts = [Vector((-hx, y, H - 0.06)), Vector((hx, y, H - 0.06))]
        m.tube(pts, [0.06, 0.06], 4, TIMBER, L.BARK, cap_top=True, cap_bottom=True)
    round_door(m, Vector((door_x, -D * 0.5 - 0.06, 0.05)), w=0.52, h=1.25)
    for k in range(windows):
        sx = (1 if k == 0 else -1) * (W * 0.3) + (0.25 if door_x * (1 if k == 0 else -1) > 0 else 0.0)
        wc = Vector((sx + lean * 1.5, -D * 0.5 - 0.07, 1.55))
        round_window(m, wc, 0.42)
        m.box(wc + Vector((0, -0.16, -0.58)), (0.95, 0.24, 0.16), WOOD, L.BARK, bevel=0.02)
    if chimney_kind:
        cx = (W * 0.3) * (1 if seed % 2 else -1)
        top = chimney_stack(m, cx, D * 0.18, H + rise * 0.45, rise * 0.75 + 1.0, chimney_kind, seed)
        print("%s chimney top" % name, tuple(round(c, 3) for c in top))
    for k in range(2):
        side = -1 if k % 2 == 0 else 1
        x0 = side * rng.uniform(0.6, W * 0.5)
        pts = [Vector((x0 + side * 0.8, D * 0.5 + 1.6, -0.2)), Vector((x0 + side * 0.4, D * 0.5 + 0.6, 1.0)),
               Vector((x0, D * 0.25, H + rise * 0.6)), Vector((x0 * 0.9, -D * 0.2, H + rise * 0.5))]
        root(m, pts, rng.uniform(0.18, 0.26), 0.03)
    m.bake(ao_dist=1.6, ao_rays=20, ao_strength=0.75, grad=(0.75, 1.05), wear=0.35, grime=0.45, paint=0.16, paint_scale=1.4)
    print(name, m.tri_count(), "tris")
    return m.finish()


def lodge(name="lodge", seed=48):
    """The landmark: the old keeper's lodge. A stone ground floor and a
    timber-framed upper floor jettied out over it (dark beams, braces, plaster
    between), a steep, deep thatch with a dormer, a porch roof on two crooked
    posts over the door, a great fieldstone chimney up the gable end (it
    smokes, in the game), window boxes, a lantern by the door and the curse's
    roots wrapped round the corner."""
    m = L.Model(name, seed)
    rng = m.rng
    W, D = 5.6, 4.6
    H0, H1 = 2.4, 2.3          # ground floor, upper floor
    # the stone ground floor, laid in courses
    for row in range(6):
        z = 0.2 + row * 0.4
        n = 9
        for side in range(4):
            length = W if side % 2 == 0 else D
            for k in range(n):
                u = (k + 0.5 * (row % 2)) / n
                if u > 1.0:
                    continue
                w = length / n * rng.uniform(0.85, 1.05)
                t = -length * 0.5 + length * u + w * 0.5
                if side == 0:
                    c = (t, -D * 0.5, z)
                    sz = (w, 0.36, 0.4)
                elif side == 1:
                    c = (W * 0.5, t, z)
                    sz = (0.36, w, 0.4)
                elif side == 2:
                    c = (t, D * 0.5, z)
                    sz = (w, 0.36, 0.4)
                else:
                    c = (-W * 0.5, t, z)
                    sz = (0.36, w, 0.4)
                m.box(c, sz, L.mix(STONE, STONE_HI, rng.uniform(0.0, 0.45)), L.BARK)
    m.box((0, 0, H0 * 0.5), (W - 0.2, D - 0.2, H0), L.scale(STONE, 0.6), L.BARK)            # the core behind the stones
    # the jettied, timber-framed upper floor
    J = 0.35
    uw, ud = W + J * 2, D + J * 2
    vs = m.box((0, 0, H0 + H1 * 0.5 + 0.1), (uw, ud, H1), PLASTER[2], L.BARK, bevel=0.06)
    m.recolor(vs, lambda v: (L.mix(PLASTER[2], DAMP, 0.15 if v.co.z < H0 + 0.6 else 0.0), L.BARK))
    m.box((0, 0, H0 + 0.05), (uw + 0.1, ud + 0.1, 0.22), TIMBER, L.BARK, bevel=0.03)          # the jetty beam
    m.box((0, 0, H0 + H1 + 0.12), (uw + 0.1, ud + 0.1, 0.18), TIMBER, L.BARK, bevel=0.03)
    for side in (-1, 1):
        for k in range(6):
            x = -uw * 0.5 + uw * k / 5
            m.box((x, side * (ud * 0.5 + 0.03), H0 + H1 * 0.5 + 0.1), (0.16, 0.08, H1), TIMBER, L.BARK, bevel=0.02)
        for k in range(5):
            x = -uw * 0.5 + uw * (k + 0.5) / 5
            if k == 2:
                continue
            a = 0.85 * (1 if k % 2 else -1)
            m.box((x, side * (ud * 0.5 + 0.04), H0 + H1 * 0.45), (0.12, 0.06, H1 * 0.95), TIMBER, L.BARK, bevel=0.02,
                  rot=Matrix.Rotation(a * 0.6, 3, 'Y'))
    for side in (-1, 1):
        for k in range(4):
            y = -ud * 0.5 + ud * k / 3
            m.box((side * (uw * 0.5 + 0.03), y, H0 + H1 * 0.5 + 0.1), (0.08, 0.16, H1), TIMBER, L.BARK, bevel=0.02)
    # the steep thatch over it all, deep and carved (the loaf roof, made tall), and a dormer
    top = H0 + H1 + 0.2
    roof = loaf_roof(m, uw - 0.6, ud - 0.6, top, 3.4, THATCH[0], seed, bands=5, nv=12)
    dc = Vector((0.9, -ud * 0.5 - 0.1, top + 1.0))
    m.box(dc + Vector((0, 0.35, -0.2)), (1.3, 1.0, 1.3), PLASTER[0], L.BARK, bevel=0.08)
    round_window(m, dc + Vector((0, -0.17, -0.25)), 0.32)
    m.lathe([(0.95, -0.1), (0.85, 0.3), (0.5, 0.6), (0.0, 0.7)], 10, thatch_color(THATCH[1], 0.5), L.BARK, center=tuple(dc + Vector((0, 0.3, 0.35))),
            squash=(0.9, 1.0), close_bottom=False)
    # the door under a porch roof on two crooked posts
    round_door(m, Vector((-0.6, -D * 0.5 - 0.2, 0.0)), w=0.6, h=1.4)
    for sx in (-1.5, 0.3):
        m.tube([Vector((sx, -D * 0.5 - 1.3, 0)), Vector((sx + rng.uniform(-0.05, 0.05), -D * 0.5 - 1.3, 2.0))], [0.09, 0.08], 6, WOOD, L.BARK)
    m.box((-0.6, -D * 0.5 - 0.8, 2.15), (2.4, 1.4, 0.1), L.srgb("#5A3E2A"), L.BARK, bevel=0.02, rot=Matrix.Rotation(-0.35, 3, 'X'))
    # windows below and above, with boxes of flowers under the upper ones
    for (x, z, r) in ((1.5, 1.35, 0.38), (-2.3, 1.3, 0.3), (-1.6, H0 + 1.25, 0.36), (1.8, H0 + 1.2, 0.36)):
        y = -D * 0.5 - 0.2 if z < H0 else -ud * 0.5 - 0.07
        round_window(m, Vector((x, y, z)), r)
        if z > H0:
            m.box(Vector((x, y - 0.18, z - r - 0.15)), (0.95, 0.26, 0.2), WOOD, L.BARK, bevel=0.02)
            for f in range(4):
                m.blob(Vector((x - 0.33 + f * 0.22, y - 0.18, z - r - 0.02)), 0.07, L.srgb("#D9483B") if f % 2 else L.srgb("#EFE3C8"),
                       L.BARK, subdiv=0, rough=0.2, seed=f)
    # a lantern on a bracket by the door
    lc = Vector((0.55, -D * 0.5 - 0.55, 1.9))
    m.tube([Vector((0.55, -D * 0.5 - 0.15, 2.15)), Vector((0.55, -D * 0.5 - 0.45, 2.2)), lc + Vector((0, 0, 0.32))], [0.03, 0.025, 0.02], 4, IRON, L.BARK)
    m.lathe([(0.0, 0.3), (0.12, 0.24), (0.15, 0.18), (0.04, 0.18)], 6, IRON, L.BARK, center=lc, close_bottom=False)
    m.lathe([(0.1, -0.1), (0.115, 0.05), (0.1, 0.18)], 6, WINDOW, L.GLOW, center=lc, close_top=False, close_bottom=True)
    # the great chimney up the gable end
    ctop = chimney_stack(m, W * 0.5 + 0.55, 0.6, 0.0, top + 3.6, "stone", seed)
    print("lodge chimney top", tuple(round(c, 3) for c in ctop))
    # roots round the corner
    for k in range(2):
        pts = [Vector((-W * 0.5 - 1.8, -D * 0.5 + 1.0 * k, -0.2)), Vector((-W * 0.5 - 0.3, -D * 0.5 + 0.6 * k, 1.2)),
               Vector((-W * 0.5 - 0.1, -D * 0.2 + 0.5 * k, H0 + 1.4)), Vector((-W * 0.3, 0.3 * k, top + 1.6))]
        root(m, pts, 0.26 - 0.05 * k, 0.03)
    m.bake(ao_dist=1.8, ao_rays=20, ao_strength=0.75, grad=(0.72, 1.05), wear=0.35, grime=0.45, paint=0.16, paint_scale=1.2)
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
    # split logs stacked inside, pale split faces out (not a pile of round ends)
    for row in range(4):
        for k in range(7 - row % 2):
            x = -1.0 + (k + 0.5 * (row % 2)) * 0.3 + rng.uniform(-0.03, 0.03)
            z = 0.12 + row * 0.22 + rng.uniform(-0.02, 0.02)
            frac = 0.5 if rng.random() < 0.6 else 0.27
            R = Matrix.Rotation(rng.uniform(-0.1, 0.1), 3, 'Y') @ Matrix.Rotation(math.pi * 0.5, 3, 'Z')
            split_log(m, (x, rng.uniform(-0.05, 0.05), z), rng.uniform(0.9, 1.15), rng.uniform(0.11, 0.15), frac, R, rng)
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
        bot.append(m.vert((x * 1.02, y * 1.02, -0.1), L.mix(base, MOSS, 0.7), L.BARK))
        bev.append(m.vert((x, y, 0.025), L.mix(base, MOSS, 0.5 * rng.random()), L.BARK))
        top.append(m.vert((x * 0.86, y * 0.86, 0.055 + rng.uniform(-0.012, 0.012)), L.mix(base, STONE_HI, 0.12), L.BARK))
    centre = m.vert((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), 0.065), L.mix(base, STONE_HI, 0.25), L.BARK)
    for k in range(n):
        k2 = (k + 1) % n
        m.face([bot[k], bot[k2], bev[k2], bev[k]])
        m.face([bev[k], bev[k2], top[k2], top[k]])
        m.face([top[k], top[k2], centre])
    m.bake(ao_dist=0.3, ao_strength=0.5, paint=0.2, paint_scale=4.0)
    return m.finish()


def well(name="well", seed=61):
    """The village well: a ring of fieldstones laid in courses (each stone its
    own size and shade, mossy low down), a dark water hole, two posts holding
    a little shingled roof, a windlass with a crank handle and its rope wound
    on, and the bucket left on the rim."""
    m = L.Model(name, seed)
    rng = m.rng
    R = 0.95
    for row in range(4):
        n = 11
        z = 0.12 + row * 0.22
        for k in range(n):
            a0 = 2 * math.pi * (k + 0.5 * (row % 2)) / n
            a1 = a0 + 2 * math.pi / n * rng.uniform(0.82, 0.95)
            am = (a0 + a1) * 0.5
            w = R * (a1 - a0)
            col = L.mix(STONE, STONE_HI, rng.uniform(0.0, 0.5))
            if row == 0:
                col = L.mix(col, MOSS, 0.45)
            m.box((math.cos(am) * R, math.sin(am) * R, z), (0.3, w, 0.22 + rng.uniform(-0.02, 0.03)), col, L.BARK,
                  rot=Matrix.Rotation(am, 3, 'Z'))
    # the capstones on the rim
    for k in range(9):
        am = 2 * math.pi * k / 9 + 0.2
        m.box((math.cos(am) * R, math.sin(am) * R, 0.98), (0.38, R * 0.72, 0.1), L.mix(STONE_HI, STONE, rng.uniform(0.2, 0.6)), L.BARK,
              bevel=0.04, rot=Matrix.Rotation(am, 3, 'Z'))
    m.lathe([(0.82, 0.92), (0.82, 0.3), (0.0, 0.3)], 12, L.srgb("#141018"), L.BARK, close_top=False, close_bottom=False)
    # posts, a shingled roof, the windlass and its crank
    for sx in (-1, 1):
        m.tube([Vector((sx * 0.98, 0.0, 0.2)), Vector((sx * 0.96, 0.02, 2.3))], [0.08, 0.07], 6, WOOD, L.BARK)
    gable_roof(m, 1.7, 1.1, 2.25, 0.75, 0.2, SHINGLE, seed, rows=4)
    m.tube([Vector((-1.1, 0, 1.7)), Vector((1.1, 0, 1.7))], [0.07, 0.07], 8, WOOD, L.BARK, cap_top=True, cap_bottom=True)
    rope = []
    for k in range(10):
        rope.append(Vector((-0.4 + k * 0.08, math.cos(k * 2.4) * 0.11, 1.7 + math.sin(k * 2.4) * 0.11)))
    m.tube(rope, [0.03] * len(rope), 5, L.srgb("#B9935E"), L.BARK)
    m.tube([Vector((0.0, 0, 1.6)), Vector((0.0, 0, 0.95))], [0.012, 0.012], 3, L.srgb("#B9935E"), L.BARK, cap_top=False)
    m.tube([Vector((1.1, 0, 1.7)), Vector((1.25, 0, 1.7)), Vector((1.25, -0.28, 1.55)), Vector((1.38, -0.28, 1.55))],
           [0.035, 0.035, 0.035, 0.04], 5, IRON, L.BARK)
    # the bucket on the rim
    m.lathe([(0.0, 0.0), (0.15, 0.0), (0.18, 0.26), (0.16, 0.26)], 10, WOOD, L.BARK, center=(0.55, -0.6, 1.0), close_top=False,
            color_fn=lambda t, k: L.mix(WOOD, L.srgb("#4E3424"), 0.4 * (k % 2)))
    m.lathe([(0.182, 0.06), (0.19, 0.08), (0.182, 0.1)], 10, IRON, L.BARK, center=(0.55, -0.6, 1.0), close_top=False, close_bottom=False)
    m.bake(ao_dist=1.0, ao_strength=0.75, wear=0.3, grime=0.4, paint=0.15, paint_scale=3.0)
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


def split_log(m, c, length, r, frac, rot, rng):
    """One split log: a wedge of round (a half or a quarter), pale split faces,
    bark on its back, growth rings on its end."""
    a0 = rng.uniform(0, 6.28)
    a1 = a0 + 2 * math.pi * frac
    n = 6 if frac < 0.4 else 9
    R = rot
    ends = []
    for side in (-1, 1):
        ring = [m.vert(Vector(c) + R @ Vector((side * length * 0.5, 0, 0)), WOOD_HI, L.BARK)]
        for k in range(n + 1):
            a = a0 + (a1 - a0) * k / n
            ring.append(m.vert(Vector(c) + R @ Vector((side * length * 0.5 + rng.uniform(-0.02, 0.02), math.cos(a) * r, math.sin(a) * r)),
                               L.mix(WOOD, L.srgb("#4E3424"), 0.4 * (k % 2)), L.BARK))
        ends.append(ring)
    a, b = ends
    for k in range(1, n + 1):
        m.face([a[k], a[k + 1], b[k + 1], b[k]])                      # the bark
    m.face([a[0], a[1], b[1], b[0]])                                  # the split faces
    m.face([a[n + 1], a[0], b[0], b[n + 1]])
    m.face(list(reversed(a)))                                          # the ends
    m.face(list(b))


def woodpile(name="woodpile", seed=64):
    """Firewood stacked the way people stack it: split logs (halves and
    quarters, pale split faces out) in rows between two stakes under a little
    plank roof, uneven, one fallen off, and the chopping block with the axe
    left in it."""
    m = L.Model(name, seed)
    rng = m.rng
    for sx in (-1.0, 1.0):
        m.tube([Vector((sx * 1.0, 0, -0.1)), Vector((sx * 1.0 + rng.uniform(-0.04, 0.04), 0, 1.35))], [0.06, 0.05], 5, WOOD, L.BARK)
    rows = 5
    for row in range(rows):
        cnt = 7 - (row % 2)
        for k in range(cnt):
            x = -0.85 + (k + 0.5 * (row % 2)) * 0.28 + rng.uniform(-0.03, 0.03)
            z = 0.12 + row * 0.22 + rng.uniform(-0.02, 0.02)
            r = rng.uniform(0.11, 0.15)
            ln = rng.uniform(0.75, 0.95)
            frac = 0.5 if rng.random() < 0.6 else 0.27
            R = Matrix.Rotation(math.pi * 0.5, 3, 'Z') @ Matrix.Rotation(rng.uniform(-0.1, 0.1), 3, 'Y')
            split_log(m, (x, rng.uniform(-0.06, 0.06), z), ln, r, frac, R, rng)
    m.box((0, 0, 1.4), (2.3, 1.1, 0.06), L.mix(L.srgb("#5A3E2A"), MOSS, 0.3), L.BARK, bevel=0.01, rot=Matrix.Rotation(0.1, 3, 'X'))
    # one fallen off
    split_log(m, (1.3, -0.5, 0.1), 0.85, 0.13, 0.5, Matrix.Rotation(0.6, 3, 'Z') @ Matrix.Rotation(1.2, 3, 'X'), rng)
    # the chopping block and the axe
    m.lathe([(0.32, 0.0), (0.34, 0.25), (0.31, 0.5), (0.0, 0.5)], 10, WOOD, L.BARK, center=(-1.55, 0.2, 0), close_bottom=False,
            color_fn=lambda t, k: WOOD_HI if t > 0.9 else L.mix(WOOD, L.srgb("#4E3424"), 0.3 * (k % 2)))
    m.tube([Vector((-1.5, 0.2, 0.55)), Vector((-1.35, 0.25, 1.15))], [0.03, 0.028], 5, WOOD_HI, L.BARK)
    m.box(Vector((-1.51, 0.2, 0.58)), (0.18, 0.04, 0.14), IRON, L.BARK, bevel=0.01, rot=Matrix.Rotation(-0.25, 3, 'Y'))
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
    # cottages at a size people live in (the keeper is about 2.3 m tall in the game): three roofs, three chimneys
    obs = [lodge(),
           cottage("cottage_mid", 42, 1, W=5.4, D=4.4, H=3.3, windows=2),
           pitched_cottage("cottage_small", 43, PLASTER[1], SHINGLE, W=4.4, D=3.8, H=3.0, rise=2.6, over=0.55, chimney_kind="brick",
                           lean=0.04, windows=1, door_x=-0.6),
           pitched_cottage("cottage_slate", 44, PLASTER[2], SLATE, W=5.0, D=4.0, H=3.1, rise=2.2, over=0.45, chimney_kind="pot",
                           hip=0.35, windows=2, door_x=0.2),
           woodshed(), well(), lantern_post(), signpost(), woodpile(), fence(), ground_roots(), root_arch()]
    obs += [flagstone("flagstone_%d" % k, 300 + k) for k in range(6)]
    L.export(obs, "village.glb")


if __name__ == "__main__":
    main()
