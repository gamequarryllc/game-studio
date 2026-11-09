"""The meadow that grows where the forest burned: four flowers and a grass tuft.

Each is its own small mesh in models/meadow.glb; the game keeps one MultiMesh
per species per meadow chunk. Species: poppy, oxeye daisy, buttercup,
harebell, sage grass tuft. Round, soft shapes (the meadow is the cure, not the curse).

Run:  python3 art/blender/meadow.py      (writes models/meadow.glb)
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forest_lib as L  # noqa: E402
from mathutils import Vector  # noqa: E402

SAGE = L.srgb("#8FAE5E")
SAGE_DARK = L.srgb("#4F6B38")
STEM = L.srgb("#5E7D42")
POPPY = L.srgb("#D9483B")
POPPY_DARK = L.srgb("#8E2A26")
CREAM = L.srgb("#EFE3C8")
YOLK = L.srgb("#E8B341")
BUTTER = L.srgb("#E9C25A")
BELL = L.srgb("#8E8FD4")
BELL_DARK = L.srgb("#5A5A9E")
INK = L.srgb("#2E1E14")


def stem(m, height, bend, rng, top_dir=0.0):
    pts = [Vector((0, 0, 0)), Vector((bend * 0.3, 0, height * 0.5)), Vector((bend, 0, height))]
    m.tube(pts, [0.016, 0.013, 0.01], 3, STEM, L.LEAF, cap_top=False)
    # one leaf part-way up
    a = rng.uniform(0, 6.28)
    d = Vector((math.cos(a), math.sin(a), 0))
    side = Vector((-d.y, d.x, 0))
    base = Vector((bend * 0.15, 0, height * 0.22))
    left = [base, base + d * 0.06 + side * 0.03 + Vector((0, 0, 0.05)), base + d * 0.13 + Vector((0, 0, 0.07))]
    right = [base, base + d * 0.06 - side * 0.03 + Vector((0, 0, 0.04)), base + d * 0.13 + Vector((0, 0, 0.07))]
    m.quad_strip(left, right, lambda t: L.mix(SAGE_DARK, SAGE, t), L.LEAF, double=False)
    return pts[-1]


def petal_ring(m, center, count, length, width, cup, color, edge, rng, tilt=0.0, rot=0.0):
    for p in range(count):
        a = rot + 2 * math.pi * p / count + rng.uniform(-0.08, 0.08)
        d = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-d.y, d.x, 0))
        c = Vector(center)
        mid = c + d * length * 0.55 + Vector((0, 0, cup * 0.6 + tilt))
        tip = c + d * length + Vector((0, 0, cup + tilt * 1.6))
        left = [c, mid + side * width, tip + side * width * 0.35]
        right = [c, mid - side * width, tip - side * width * 0.35]
        m.quad_strip(left, right, lambda t: L.mix(color, edge, t * t), L.LEAF, double=False)


def poppy(m, rng):
    top = stem(m, 0.42, 0.05, rng)
    petal_ring(m, top, 4, 0.12, 0.085, 0.07, POPPY_DARK, POPPY, rng)
    m.blob(top + Vector((0, 0, 0.02)), 0.028, INK, L.LEAF, subdiv=1, rough=0.0, seed=1)


def daisy(m, rng):
    top = stem(m, 0.36, -0.04, rng)
    petal_ring(m, top, 11, 0.1, 0.022, 0.015, CREAM, CREAM, rng, tilt=0.01)
    m.blob(top + Vector((0, 0, 0.015)), 0.032, YOLK, L.LEAF, subdiv=1, rough=0.0, seed=2, squash=(1, 1, 0.6))


def buttercup(m, rng):
    # a little cluster of three cups on branching stems
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.3
        h = 0.24 + 0.06 * k
        top = Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, h))
        m.tube([Vector((0, 0, 0)), Vector((math.cos(a) * 0.02, math.sin(a) * 0.02, h * 0.5)), top], [0.012, 0.01, 0.008], 3, STEM, L.LEAF, cap_top=False)
        petal_ring(m, top, 5, 0.05, 0.03, 0.035, L.scale(BUTTER, 0.8), BUTTER, rng)


def harebell(m, rng):
    # a nodding stem with two hanging bells
    pts = [Vector((0, 0, 0)), Vector((0.02, 0, 0.3)), Vector((0.09, 0, 0.42)), Vector((0.14, 0, 0.38))]
    m.tube(pts, [0.012, 0.01, 0.008, 0.006], 3, STEM, L.LEAF, cap_top=False)
    for k, (p, s) in enumerate(((Vector((0.14, 0, 0.36)), 1.0), (Vector((0.05, 0.03, 0.3)), 0.8))):
        prof = [(0.005, 0.0), (0.03 * s, -0.012 * s), (0.045 * s, -0.05 * s), (0.055 * s, -0.075 * s)]
        m.lathe([(r, z) for r, z in prof], 6, BELL, L.LEAF, center=p, close_top=False, close_bottom=False,
                color_fn=lambda t, kk: L.mix(BELL_DARK, BELL, t))
        m.lathe([(r * 0.92, z) for r, z in reversed(prof)], 6, BELL_DARK, L.LEAF, center=p, close_top=False, close_bottom=False)


def tuft(m, rng):
    for b in range(7):
        a = 2 * math.pi * b / 7 + rng.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-d.y, d.x, 0))
        root = d * rng.uniform(0.0, 0.05)
        h = rng.uniform(0.18, 0.32)
        lean = rng.uniform(0.06, 0.14)
        left, right = [], []
        for i in range(3):
            t = i / 2
            p = root + d * lean * t * t + Vector((0, 0, h * t))
            w = 0.03 * (1 - t) + 0.002
            left.append(p - side * w)
            right.append(p + side * w)
        m.quad_strip(left, right, lambda t: L.mix(SAGE_DARK, SAGE, t), L.LEAF, double=False)


def main():
    L.reset()
    species = [poppy, daisy, buttercup, harebell, tuft]
    names = ["poppy", "oxeye_daisy", "buttercup", "harebell", "sage_tuft"]
    obs = []
    for k, fn in enumerate(species):
        m = L.Model(names[k], 5 + k)
        fn(m, m.rng)
        m.bake(ao_dist=0.25, ao_rays=12, ao_strength=0.45, grad=(0.75, 1.05))
        print(names[k], m.tri_count(), "tris", len(m.bm.verts), "verts")
        obs.append(m.finish())
    L.export(obs, "meadow.glb")


if __name__ == "__main__":
    main()
