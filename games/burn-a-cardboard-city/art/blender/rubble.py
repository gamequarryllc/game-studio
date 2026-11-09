"""What's left after the fire: crumpled, folded shells of board with curled flaps and
the corrugated middle showing where the liner burned away, grey ash heaped round
them, char (#2a2420, never black) with a little scorched brown card low down.

  rub_house_0..3   a burnt-out house where it stood (scaled to the footprint)
  rub_small_0..1   a car, tree or fire truck: a heap of ash and charred bits
  fall_office_0..2 an office box that toppled: lying along +X from x=0 (its pivot)
  fall_sky_0..2    a copy-paper skyscraper that toppled: boxes tumbled along +X
  fall_turret      a castle turret that toppled: squashed rolls and a crushed cone
  rub_castle_0..2  crushed egg box and rolls where a castle piece stood

The fallen pieces are modelled at a typical size (see FALL_SIZE); the game scales
them to the real tower (length = its height, width = its footprint).
"""
import math

from kit import (ASH, ASH_LIGHT, CARD, CHAR, CHAR_LIGHT, PAPER, PAPER_SHADE, SCORCH, Model, srgb)
from mathutils import Matrix, Vector

# length along +X, width along Y, of each fallen piece as modelled (the game reads these
# from scripts/city_view.gd's FALL_SIZE, keep the two in step).
FALL_SIZE = {"fall_office": (2.2, 1.3), "fall_sky": (5.6, 1.8), "fall_turret": (5.0, 1.8)}

FLUTE_DARK = srgb("#33291f")
FLUTE_LIGHT = srgb("#6a4e34")


def rot_z(a):
    return Matrix.Rotation(a, 4, "Z")


def shell(m, c, w, d, h, squash, crumple=0.05, tilt=(0.0, 0.0), yaw=0.0, cuts=(5, 5, 3), bulge=0.12, holes=0.07):
    """A box crushed down into itself, burnt through in places on top."""
    import bmesh
    cuts = (cuts[0] * 2, cuts[1] * 2, cuts[2])
    faces = m.box((0, 0, h / 2), (w, d, h), CHAR, cuts=cuts, bevel=0.006, jitter=0.0)
    m.squash(faces, (0, 0, 0), squash, bulge)
    m.crumple(faces, crumple * 1.6, 5.0 / max(w, d) + 2.0)
    m.crumple(faces, crumple * 0.5, 14.0 / max(w, d) + 4.0, ridged=False)
    # Holes where the top burned through (the inside shows, dark).
    top = [f for f in faces if f.is_valid and f.normal.z > 0.6]
    gone = [f for f in top if m.rng.random() < holes]
    if gone and len(gone) < len(top):
        # Grow each hole a little so it isn't a square, then tear its edge.
        grown = set(gone)
        for f in gone:
            for e in f.edges:
                for g in e.link_faces:
                    if g in top and m.rng.random() < 0.45:
                        grown.add(g)
        bmesh.ops.delete(m.bm, geom=list(grown), context="FACES_ONLY")
        faces = [f for f in faces if f.is_valid]
        cell = max(w / cuts[0], d / cuts[1])
        for v in {v for f in faces for v in f.verts if v.is_boundary}:
            v.co.x += m.rng.uniform(-0.35, 0.35) * cell
            v.co.y += m.rng.uniform(-0.35, 0.35) * cell
            v.co.z -= m.rng.uniform(0.0, 0.3) * cell
    mat = Matrix.Translation(Vector(c)) @ rot_z(yaw) @ Matrix.Rotation(tilt[0], 4, "X") @ Matrix.Rotation(tilt[1], 4, "Y")
    m.transform(faces, mat)
    return faces


def curled_flap(m, hinge, along, out, length, width, radius, crumple=0.015):
    """A flap that curled up in the heat; its torn edge shows the flutes."""
    f = m.plate(hinge, along, out, length, width, CHAR, 0.012, CARD, edge=FLUTE_LIGHT, cuts=6)
    m.curl(f, hinge, along, out, radius)
    m.crumple(f, crumple, 9.0)
    return f


def flutes(m, hinge, along, out, length, width, waves=14):
    """A strip where the outer liner burned off: the corrugated middle, wavy and striped."""
    f = m.plate(hinge, along, out, length, width, FLUTE_DARK, 0.006, CARD, edge=FLUTE_DARK, cuts=waves * 2, jitter=0.0)
    along_v, out_v = Vector(along).normalized(), Vector(out).normalized()
    nrm = along_v.cross(out_v).normalized()
    h = Vector(hinge)
    for v in m._verts(f):
        t = (v.co - h).dot(along_v) / length + 0.5
        v.co += nrm * math.sin(t * waves * math.tau) * 0.008
    m.paint_by(f, lambda p, n: FLUTE_LIGHT if math.sin(((p - h).dot(along_v) / length + 0.5) * waves * math.tau) > 0.2
               else FLUTE_DARK)
    return f


def ash_heap(m, c, r, flat=0.35, lumps=3):
    out = []
    r *= 1.25
    lumps += 2
    for k in range(lumps):
        a = m.rng.uniform(0, math.tau)
        d = m.rng.uniform(0.0, r * 0.6) if k else 0.0
        rr = r * m.rng.uniform(0.45, 0.8) if k else r * 0.7
        b = m.ball((c[0] + math.cos(a) * d, c[1] + math.sin(a) * d, 0.0), rr, ASH, CARD, 2, 0.3, smooth=True)
        m.squash(b, (0, 0, 0), flat)
        out += b
    m.paint_by(out, lambda p, n: ASH_LIGHT if (p.x * 17.3 + p.y * 11.1) % 1.0 > 0.6 else ASH)
    return out


def sheet(m, c, size, yaw, burnt_edge=True):
    """A loose sheet of copy paper, half burnt: grey-white in the middle, char at the edges."""
    f = m.plate((c[0], c[1], c[2] + 0.004), (math.cos(yaw), math.sin(yaw), 0), (-math.sin(yaw), math.cos(yaw), 0), size,
                size * 1.4, PAPER_SHADE, 0.003, PAPER, edge=CHAR, cuts=4, jitter=0.0)
    m.crumple(f, 0.012, 12.0)
    cc = Vector((c[0] - math.sin(yaw) * size * 0.7, c[1] + math.cos(yaw) * size * 0.7, 0))
    def fn(p, n):
        d = (Vector((p.x, p.y, 0)) - cc).length / (size * 0.75)
        t = max(0.0, min(1.0, (d - 0.45) * 2.5)) if burnt_edge else 0.0
        base = [PAPER_SHADE[i] * 0.78 for i in range(3)]
        return [base[i] * (1 - t) + CHAR[i] * t for i in range(3)]
    m.paint_by(f, fn, PAPER)
    return f


def finish(m, keep=()):
    """Char everything that isn't ash or a sheet of paper."""
    keep = set(f for f in keep if f.is_valid)
    m.burnt([f for f in m.bm.faces if f not in keep], ash_top=0.85, scorch_low=0.4)


# =====================================================================================
# Houses
# =====================================================================================
def rub_house(k):
    m = Model("rub_house_%d" % k, 81 + k)
    keep = []
    if k == 0:
        shell(m, (0, 0, 0), 0.82, 0.72, 0.6, 0.32, 0.05, (0.06, -0.04), 0.08)
        curled_flap(m, (0.0, -0.3, 0.16), (1, 0, 0), (0, -0.6, 0.8), 0.6, 0.3, 0.12)
        flutes(m, (0.3, 0.2, 0.2), (0, 1, 0), (0.7, 0, 0.7), 0.4, 0.12)
        keep += ash_heap(m, (-0.2, 0.25), 0.22)
    elif k == 1:
        shell(m, (0.05, 0.0, 0), 0.76, 0.7, 0.5, 0.38, 0.06, (-0.08, 0.1), -0.15)
        # The roof slid off and lies crumpled against one side.
        f = m.plate((-0.35, 0.0, 0.32), (0, 1, 0), (-0.5, 0.0, -0.86), 0.8, 0.42, CHAR, 0.012, CARD, edge=FLUTE_LIGHT, cuts=6)
        m.crumple(f, 0.03, 8.0)
        curled_flap(m, (0.3, 0.32, 0.18), (1, 0, 0), (0, 0.4, 0.9), 0.4, 0.22, 0.08)
        keep += ash_heap(m, (0.3, -0.25), 0.2)
    elif k == 2:
        # Mostly ash, with one corner still standing.
        keep += ash_heap(m, (0, 0), 0.4, 0.3, 4)
        f1 = m.plate((-0.3, -0.25, 0.0), (1, 0, 0), (0, 0, 1), 0.4, 0.34, CHAR, 0.012, CARD, edge=FLUTE_LIGHT, cuts=4)
        f2 = m.plate((-0.5, -0.05, 0.0), (0, 1, 0), (0, 0, 1), 0.4, 0.3, CHAR, 0.012, CARD, edge=FLUTE_LIGHT, cuts=4)
        m.crumple(f1 + f2, 0.025, 9.0)
        m.transform(f1 + f2, Matrix.Rotation(-0.12, 4, "X"))
        curled_flap(m, (0.2, 0.2, 0.08), (0, 1, 0), (0.8, 0, 0.6), 0.36, 0.22, 0.07)
    else:
        # Folded in on itself like a stamped-on box: two halves in a V.
        a = shell(m, (-0.2, 0, 0), 0.42, 0.74, 0.5, 0.42, 0.05, (0.0, 0.32), 0.0, (3, 5, 3))
        b = shell(m, (0.22, 0.02, 0), 0.42, 0.72, 0.5, 0.36, 0.05, (0.0, -0.3), 0.05, (3, 5, 3))
        flutes(m, (0.0, -0.36, 0.12), (0, 0, 1), (1, 0, 0), 0.2, 0.18)
        keep += ash_heap(m, (0.0, 0.3), 0.18)
    finish(m, keep)
    return m.build()


def rub_small(k):
    m = Model("rub_small_%d" % k, 91 + k)
    keep = ash_heap(m, (0, 0), 0.22, 0.35, 3)
    if k == 0:
        f = shell(m, (0.05, 0.02, 0), 0.34, 0.2, 0.18, 0.5, 0.03, (0.1, 0.0), 0.4, (2, 2, 1))
        # Two bottle-cap wheels that didn't burn (tin), blackened.
        for x in (-0.12, 0.16):
            m.cylinder((x, -0.14, 0.03), 0.045, 0.02, srgb("#4a4642"), 12, 0.25, rot=(math.pi / 2, 0, 0), cuts=0, jitter=0.0)
    else:
        # A burnt pencil stub lying in the ash.
        m.cylinder((-0.15, 0.0, 0.025), 0.016, 0.24, CHAR_LIGHT, 6, CARD, rot=(0, math.pi / 2 - 0.1, 0.3), cuts=0,
                   smooth=False, jitter=0.0)
        m.cylinder((0.1, 0.07, 0.03), 0.017, 0.03, srgb("#9aa0a6"), 10, 0.25, rot=(0, math.pi / 2 - 0.1, 0.3), cuts=0, jitter=0.0)
    finish(m, keep)
    return m.build()


# =====================================================================================
# Toppled towers (lying along +X from their pivot at x = 0)
# =====================================================================================
def fall_office(k):
    m = Model("fall_office_%d" % k, 101 + k)
    L, W = FALL_SIZE["fall_office"]
    keep = []
    if k == 0:
        # One long box, kinked where it hit, flaps torn open at the far end.
        a = shell(m, (L * 0.3, 0, 0), L * 0.62, W * 0.92, 0.9, 0.5, 0.06, (0.05, 0.0), 0.02, (5, 4, 3))
        b = shell(m, (L * 0.78, 0.06, 0), L * 0.42, W * 0.9, 0.85, 0.42, 0.07, (-0.06, 0.08), -0.12, (4, 4, 3))
        curled_flap(m, (L * 0.98, 0.0, 0.25), (0, 1, 0), (0.6, 0, 0.8), W * 0.8, 0.4, 0.15)
        flutes(m, (L * 0.55, -W * 0.46, 0.22), (1, 0, 0), (0, -0.4, 0.9), 0.5, 0.16)
        keep += ash_heap(m, (L * 0.5, W * 0.5), 0.3)
    elif k == 1:
        # Broke in two: the base crumpled by its pivot, the top half skidded on.
        shell(m, (L * 0.22, 0, 0), L * 0.42, W * 0.95, 0.95, 0.55, 0.06, (0.0, 0.06), 0.08, (4, 4, 3))
        shell(m, (L * 0.74, -0.08, 0), L * 0.46, W * 0.85, 0.9, 0.4, 0.07, (0.1, -0.05), -0.35, (4, 4, 3))
        curled_flap(m, (L * 0.45, W * 0.45, 0.2), (1, 0, 0), (0, 0.7, 0.7), 0.6, 0.3, 0.12)
        keep += ash_heap(m, (L * 0.5, -W * 0.3), 0.32, 0.3, 4)
    else:
        # Flattened like it was stamped on: low, wide and wavy.
        shell(m, (L * 0.5, 0, 0), L * 0.95, W * 1.05, 0.7, 0.32, 0.08, (0.0, 0.0), 0.0, (6, 4, 2), bulge=0.2)
        flutes(m, (L * 0.2, W * 0.5, 0.12), (1, 0, 0), (0, 0.6, 0.8), 0.6, 0.14)
        curled_flap(m, (L * 0.85, -W * 0.48, 0.15), (1, 0, 0), (0, -0.5, 0.86), 0.5, 0.28, 0.1)
        keep += ash_heap(m, (L * 0.15, -W * 0.45), 0.28)
    finish(m, keep)
    return m.build()


def fall_sky(k):
    m = Model("fall_sky_%d" % k, 111 + k)
    L, W = FALL_SIZE["fall_sky"]
    keep = []
    if k in (0, 2):
        # The copy-paper boxes tumbled along the line, lids knocked off, sheets everywhere.
        n = 5 if k == 0 else 4
        x = 0.4
        for j in range(n):
            bw = m.rng.uniform(1.0, 1.3)
            yaw = m.rng.uniform(-0.6, 0.6)
            y = m.rng.uniform(-0.3, 0.3)
            if k == 2 and j < 2:
                y += (j - 0.5) * 0.9   # a heap near the base
            shell(m, (x, y, 0), bw, W * m.rng.uniform(0.6, 0.75), 0.85, m.rng.uniform(0.45, 0.65), 0.05,
                  (m.rng.uniform(-0.12, 0.12), m.rng.uniform(-0.12, 0.12)), yaw, (3, 3, 2))
            if j % 2 == 0:
                lid = m.box((x + 0.3, y + m.rng.choice([-1, 1]) * W * 0.55, 0.04), (bw * 0.9, 0.7, 0.07), CHAR, cuts=(2, 2, 0),
                            bevel=0.004, rot=(0.0, 0.0, m.rng.uniform(0, 3)), jitter=0.0)
                m.crumple(lid, 0.02, 7.0)
            x += L / n * m.rng.uniform(0.85, 1.1)
        for j in range(9):
            keep += sheet(m, (m.rng.uniform(0.2, L), m.rng.uniform(-W * 0.9, W * 0.9), 0.0), m.rng.uniform(0.26, 0.36),
                          m.rng.uniform(0, math.tau))
        keep += ash_heap(m, (L * 0.45, 0.0), 0.5, 0.25, 4)
    else:
        # One long crushed tube or box, kinked twice.
        for j, (x0, x1, t) in enumerate([(0.0, 2.0, 0.04), (2.0, 3.9, -0.07), (3.9, 5.5, 0.1)]):
            shell(m, ((x0 + x1) / 2, (j - 1) * 0.08, 0), x1 - x0 + 0.1, W * 0.8, 1.1, 0.5, 0.07, (t, 0.0), t, (4, 3, 3))
        curled_flap(m, (5.4, 0.0, 0.3), (0, 1, 0), (0.5, 0, 0.86), W * 0.6, 0.45, 0.16)
        for j in range(5):
            keep += sheet(m, (m.rng.uniform(0.5, L), m.rng.uniform(-W, W), 0.0), 0.3, m.rng.uniform(0, math.tau))
        keep += ash_heap(m, (L * 0.3, W * 0.5), 0.45, 0.25, 3)
    finish(m, keep)
    for f in m.bm.faces:
        pass
    return m.build()


def fall_turret():
    m = Model("fall_turret", 121)
    L, W = FALL_SIZE["fall_turret"]
    keep = []
    # Kitchen roll and toilet roll squashed flat where they landed.
    for (x0, x1, r) in [(0.0, 1.3, 0.85), (1.4, 4.0, 0.7)]:
        f = m.cylinder(((x0 + x1) / 2 - (x1 - x0) / 2, 0, r), r, x1 - x0, CHAR, 16, CARD, caps=False, rot=(0, math.pi / 2, 0),
                       cuts=4, jitter=0.0)
        m.squash(f, (0, 0, 0), 0.35, 0.0)
        m.crumple(f, 0.05, 4.0)
    c = m.cone((4.4, 0.0, 0.3), 0.7, 1.2, CHAR_LIGHT, 14, PAPER, rot=(0, math.pi / 2 + 0.3, 0.2), seam=False)
    m.squash(c, (0, 0, 0), 0.5)
    m.crumple(c, 0.04, 6.0)
    keep += ash_heap(m, (2.0, 0.6), 0.5, 0.25, 4)
    finish(m, keep)
    return m.build()


def rub_castle(k):
    m = Model("rub_castle_%d" % k, 131 + k)
    keep = []
    pulp_ash = [ASH[i] * 0.85 for i in range(3)]
    if k == 0:
        # A wall: the egg-box lid crushed flat, cups scattered.
        shell(m, (0, 0, 0), 3.6, 0.9, 1.6, 0.25, 0.07, (0.0, 0.0), 0.0, (8, 2, 2), bulge=0.25)
    elif k == 1:
        shell(m, (0, 0, 0), 2.2, 1.2, 2.0, 0.3, 0.08, (0.1, 0.0), 0.1, (5, 3, 2), bulge=0.25)
        for x in (-1.2, 1.2):
            f = m.cylinder((x, -0.4, 0.3), 0.4, 1.1, CHAR, 14, CARD, caps=False, rot=(math.pi / 2, 0, m.rng.uniform(-0.5, 0.5)),
                           cuts=3, jitter=0.0)
            m.squash(f, (0, 0, 0), 0.4)
            m.crumple(f, 0.04, 5.0)
    else:
        # The keep: a great heap, rolls lying across it.
        shell(m, (0, 0, 0), 3.8, 3.8, 3.0, 0.22, 0.12, (0.0, 0.0), 0.0, (7, 7, 3), bulge=0.3)
        for j in range(4):
            a = j * math.pi / 2 + 0.4
            f = m.cylinder((math.cos(a) * 1.6, math.sin(a) * 1.6, 0.35), 0.5, 2.0, CHAR, 14, CARD, caps=False,
                           rot=(math.pi / 2, 0, a + m.rng.uniform(-0.4, 0.4)), cuts=3, jitter=0.0)
            m.squash(f, (0, 0, 0), 0.4)
            m.crumple(f, 0.05, 4.0)
    for j in range(7 if k < 2 else 14):
        r = 0.16
        x, y = m.rng.uniform(-1.6, 1.6), m.rng.uniform(-0.9 if k < 2 else -2.0, 0.9 if k < 2 else 2.0)
        f = m.cylinder((x, y, 0.0), r, 0.22, CHAR_LIGHT, 8, CARD, radius_top=r * 0.7, cuts=0,
                       rot=(m.rng.uniform(-1.5, 1.5), m.rng.uniform(-1.5, 1.5), 0), jitter=0.0)
        m.transform(f, Matrix.Translation((0, 0, 0.08)))
    keep += ash_heap(m, (0.5, 0.3), 0.8 if k < 2 else 1.6, 0.22, 4)
    m.paint_by(keep, lambda p, n: pulp_ash if (p.x * 7.1 + p.y * 3.3) % 1.0 > 0.5 else ASH_LIGHT)
    finish(m, keep)
    return m.build()


def build():
    out = [rub_house(k) for k in range(4)]
    out += [rub_small(k) for k in range(2)]
    out += [fall_office(k) for k in range(3)]
    out += [fall_sky(k) for k in range(3)]
    out.append(fall_turret())
    out += [rub_castle(k) for k in range(3)]
    return out
