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


def cottage(name, seed, variant):
    m = L.Model(name, seed)
    rng = m.rng
    W, D, H = 3.6, 3.0, 2.3          # walls: width (x), depth (y), height
    wall = PLASTER[variant]
    # Walls: a soft rounded block, slightly wider at the foot.
    vs = m.box((0, 0, H * 0.5), (W, D, H), wall, L.BARK, bevel=0.32, smooth=True)
    for v in vs:
        k = 1.0 + 0.05 * (1.0 - v.co.z / H)
        v.co.x *= k
        v.co.y *= k
    # A low stone footing.
    m.box((0, 0, 0.18), (W + 0.25, D + 0.25, 0.36), STONE, L.BARK, bevel=0.12, smooth=True)
    # Timber posts at the corners.
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.box((sx * (W * 0.5 - 0.02), sy * (D * 0.5 - 0.02), H * 0.5 + 0.1), (0.16, 0.16, H - 0.1), TIMBER, L.BARK, bevel=0.03)
    m.box((0, -D * 0.5 - 0.03, H - 0.12), (W + 0.1, 0.14, 0.16), TIMBER, L.BARK, bevel=0.03)
    # The thatch: a loaf with drooping eaves and rounded hips.
    th = THATCH[variant]
    nu, nv = 10, 8
    hx, hy = W * 0.5 + 0.55, D * 0.5 + 0.6
    top = 1.75 + 0.15 * variant
    grid = []
    for i in range(nv + 1):
        v = -1 + 2 * i / nv
        row = []
        for j in range(nu + 1):
            u = -1 + 2 * j / nu
            hip = 1.0 - max(0.0, abs(v) - 0.55) / 0.45 * 0.75
            z = H - 0.15 + top * max(0.0, 1.0 - abs(u) ** 1.7) * hip - 0.25 * abs(u) ** 6
            x = v * hx * (1.0 - 0.12 * abs(u) ** 2)
            y = u * hy
            z += 0.06 * math.sin(v * 9 + u * 5 + seed)     # lumpy straw
            straw = L.mix(th, THATCH_HI, 0.35 * max(0.0, 1 - abs(u)) * hip)
            row.append(m.vert((x, y, z), straw, L.BARK, 0.0))
        grid.append(row)
    for i in range(nv):
        for j in range(nu):
            m.face([grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]])
    # close the underside of the eaves
    under = [grid[i][0] for i in range(nv + 1)] + [grid[nv][j] for j in range(1, nu + 1)] + \
            [grid[i][nu] for i in range(nv - 1, -1, -1)] + [grid[0][j] for j in range(nu - 1, 0, -1)]
    c = m.vert((0, 0, H - 0.3), L.scale(th, 0.35), L.BARK)
    for k in range(len(under)):
        m.face([c, under[(k + 1) % len(under)], under[k]])
    # Round door with a bit of path stone, on the front (-Y: the game's +Z).
    door_c = Vector((0.45 * (1 if variant == 1 else -1) * 0.0, -D * 0.5 - 0.06, 0.0))
    prof = []
    for k in range(9):
        a = math.pi * k / 8
        prof.append(Vector((math.cos(a) * 0.48, 0, 1.05 + math.sin(a) * 0.48)))
    pts = [Vector((0.48, 0, 0.36))] + prof + [Vector((-0.48, 0, 0.36))]
    m.fan(door_c + Vector((0, 0, 0.9)), [door_c + p for p in pts], L.scale(DOOR, 1.1), DOOR, L.BARK)
    m.box(door_c + Vector((0.28, -0.04, 0.95)), (0.07, 0.05, 0.07), BRASS, L.BARK)
    # Round windows, lit warm from inside, with a dark cross.
    for sx in (-1, 1):
        wc = Vector((sx * 1.15, -D * 0.5 - 0.07, 1.35))
        ring = []
        for k in range(10):
            a = 2 * math.pi * k / 10
            ring.append(wc + Vector((math.cos(a) * 0.38, 0, math.sin(a) * 0.38)))
        m.fan(wc + Vector((0, -0.01, 0)), list(reversed(ring)), WINDOW_CORE, WINDOW, L.GLOW)
        frame = []
        for k in range(10):
            a = 2 * math.pi * k / 10
            frame.append((m.vert(wc + Vector((math.cos(a) * 0.38, -0.02, math.sin(a) * 0.38)), TIMBER, L.BARK),
                          m.vert(wc + Vector((math.cos(a) * 0.5, -0.02, math.sin(a) * 0.5)), TIMBER, L.BARK)))
        for k in range(10):
            a, b = frame[k], frame[(k + 1) % 10]
            m.face([a[1], b[1], b[0], a[0]])
        m.box(wc + Vector((0, -0.03, 0)), (0.06, 0.04, 0.76), TIMBER, L.BARK)
        m.box(wc + Vector((0, -0.03, 0)), (0.76, 0.04, 0.06), TIMBER, L.BARK)
        # a flower box under the window (the village was loved)
        m.box(wc + Vector((0, -0.15, -0.52)), (0.8, 0.22, 0.16), WOOD, L.BARK, bevel=0.02)
    # A crooked chimney.
    cx = (W * 0.28) * (1 if variant != 1 else -1)
    for k in range(4):
        m.box((cx + 0.04 * k * (1 if seed % 2 else -1), 0.55, H + 1.0 + 0.42 * k), (0.62 - 0.03 * k, 0.6 - 0.03 * k, 0.44), STONE, L.BARK, bevel=0.06,
              rot=Matrix.Rotation(0.05 * k, 3, 'Y'))
    # The roots that swallowed it: out of the ground behind, over the roof, down the front.
    n_roots = 3 + variant
    for k in range(n_roots):
        side = -1 if k % 2 == 0 else 1
        x0 = side * rng.uniform(0.6, 2.2)
        start = Vector((x0 + side * 0.8, D * 0.5 + 1.6, -0.2))
        pts = [start,
               Vector((x0 + side * 0.4, D * 0.5 + 0.6, 1.0)),
               Vector((x0, D * 0.2, H + top * 0.75)),
               Vector((x0 * 0.9, -D * 0.25, H + top * 0.55 + 0.1)),
               Vector((x0 * 0.85 + side * 0.2, -D * 0.5 - 0.65, H - 0.1)),
               Vector((x0 * 0.8 + side * 0.4, -D * 0.5 - 0.5, H * 0.45))]
        if k >= 3:
            pts = pts[:4]
        root(m, pts, rng.uniform(0.2, 0.3), 0.03)
    # one root wraps round the corner of the house at ground level
    root(m, [Vector((-W * 0.5 - 1.6, 0.8, -0.1)), Vector((-W * 0.5 - 0.3, 0.2, 0.25)), Vector((-W * 0.5 - 0.15, -D * 0.5 - 0.2, 0.6)),
             Vector((-W * 0.3, -D * 0.5 - 0.25, 1.4))], 0.18, 0.02)
    m.bake(ao_dist=1.4, ao_rays=20, ao_strength=0.75, grad=(0.75, 1.05))
    print(name, m.tri_count(), "tris")
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
    m = L.Model(name, seed)
    rng = m.rng
    for row in range(3):
        for k in range(4 - row):
            x = (k - (3 - row) * 0.5) * 0.34
            z = 0.17 + row * 0.29
            pts = [Vector((x, -0.7, z)), Vector((x + rng.uniform(-0.03, 0.03), 0.7, z))]
            r = rng.uniform(0.14, 0.17)
            rings = m.tube(pts, [r, r], 7, WOOD, L.BARK, cap_top=False, cap_bottom=False,
                           color_fn=lambda t, kk: L.mix(WOOD, L.srgb("#4E3424"), 0.4 * (kk % 2)))
            for end, ring in ((pts[0], rings[0]), (pts[1], rings[1])):
                c = m.vert(end, WOOD_HI, L.BARK)
                for i in range(len(ring)):
                    if end is pts[1]:
                        m.face([ring[i], ring[(i + 1) % len(ring)], c])
                    else:
                        m.face([ring[(i + 1) % len(ring)], ring[i], c])
    m.bake(ao_dist=0.5, ao_strength=0.8)
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
    obs = [cottage("cottage_a", 41, 0), cottage("cottage_b", 42, 1), cottage("cottage_c", 43, 2),
           well(), lantern_post(), signpost(), woodpile(), fence(), ground_roots(), root_arch()]
    L.export(obs, "village.glb")


if __name__ == "__main__":
    main()
