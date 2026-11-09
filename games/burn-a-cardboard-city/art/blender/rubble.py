"""What's left after the fire: crumpled, folded shells of board with curled flaps and
the corrugated middle showing where the liner burned away, grey ash heaped round
them, char (#2a2420, never black) with a little scorched brown card low down.

  rub_house_0..3   a burnt-out house where it stood (scaled to the footprint)
  rub_small_0..1   a car, tree or fire truck: a heap of ash and charred bits
  fall_office_0..2 an office box that toppled: lying along +X from x=0 (its pivot)
  fall_sky_0..2    a copy-paper skyscraper that toppled: boxes tumbled along +X
  fall_turret      a castle turret that toppled: squashed rolls and a crushed cone
  rub_castle_0..2  crushed egg box and rolls where a castle piece stood

Every building leaves one wall standing (torn off ragged at the top, windows burned
through, the colour it was painted still showing low down) so you can still tell
what stood there; trees leave their pencil standing in the clay.

The fallen pieces are modelled at a typical size (see FALL_SIZE); the game scales
them to the real tower (length = its height, width = its footprint).
"""
import math

from kit import (ASH, ASH_LIGHT, CARD, CHAR, CHAR_LIGHT, EGG_PULP, KRAFT, PAPER, PAPER_SHADE, PAPER_WHITE, ROLL, SCORCH,
                 Model, srgb)
from mathutils import Matrix, Vector

# length along +X, width along Y, of each fallen piece as modelled (the game reads these
# from scripts/city_view.gd's FALL_SIZE, keep the two in step).
FALL_SIZE = {"fall_office": (2.2, 1.3), "fall_sky": (5.6, 1.8), "fall_turret": (5.0, 1.8)}

FLUTE_DARK = srgb("#33291f")
FLUTE_LIGHT = srgb("#6a4e34")


def rot_z(a):
    return Matrix.Rotation(a, 4, "Z")


TOASTED = srgb("#7a5536")        # the curled lip of a flap: browned, not burnt through, it catches the light
TOASTED_LIGHT = srgb("#9a6c44")
HOUSE_PAINT = srgb("#4f8a86")    # what's left of the poster paint low on a house wall (teal)


def mix3(a, b, t):
    t = max(0.0, min(1.0, t))
    return [a[i] * (1 - t) + b[i] * t for i in range(3)]


def standing_wall(m, at, yaw, w, h, low_col, holes=(), lean=0.07, gable=False, window=None, bend=0.0):
    """The one wall left standing: a panel of board torn off ragged at the top, its
    windows burned through, scorched from the top down with the paint it had still
    showing low down, the torn lip toasted brown (it catches the light), ash on top."""
    import bmesh
    t = 0.016
    cols = max(8, int(w / 0.075))
    rows = max(7, int(h / 0.065))
    rng = m.rng
    # A jagged top: a random walk with a few deep bites out of it.
    tops = []
    v = rng.uniform(0.7, 0.95)
    for i in range(cols):
        v += rng.uniform(-0.12, 0.12)
        if rng.random() < 0.08:
            v -= rng.uniform(0.15, 0.3)
        v = max(0.35, min(1.0, v))
        ridge = 1.0 - abs(i / (cols - 1) - 0.5) * 2.0 if gable else 1.0
        tops.append(v * (0.75 + 0.25 * ridge) if gable else v)
    m._begin()
    bm = m.bm
    grid = {}
    for i in range(cols + 1):
        for j in range(rows + 1):
            grid[(i, j)] = bm.verts.new((-w / 2 + w * i / cols, 0.0, h * j / rows))
    def in_hole(x, z):
        for (hx, hz, hw, hh) in holes:
            if abs(x - hx) < hw / 2 and abs(z - hz) < hh / 2:
                return True
        return False
    for i in range(cols):
        for j in range(rows):
            zc = h * (j + 0.5) / rows
            xc = -w / 2 + w * (i + 0.5) / cols
            if zc > tops[i] * h or in_hole(xc, zc):
                continue
            bm.faces.new((grid[(i, j)], grid[(i + 1, j)], grid[(i + 1, j + 1)], grid[(i, j + 1)]))
    for vv in [vv for vv in bm.verts if not vv.link_faces and vv in grid.values()]:
        bm.verts.remove(vv)
    faces = m._new()
    for f in faces:
        f.normal_update()
    # Tear the free edges (the top and the window holes) so nothing is cut straight.
    for vv in {vv for f in faces for vv in f.verts if vv.is_boundary}:
        if vv.co.z > 0.01:
            vv.co.x += rng.uniform(-0.3, 0.3) * w / cols
            vv.co.z += rng.uniform(-0.45, 0.25) * h / rows
    res = bmesh.ops.solidify(bm, geom=faces, thickness=t)
    faces = m._new()
    if bend > 0.0:
        # Rolled round into what's left of a tube.
        for vv in {vv for f in faces for vv in f.verts}:
            a = vv.co.x / bend
            r = bend + vv.co.y
            vv.co.x, vv.co.y = r * math.sin(a), -r * math.cos(a)
        for f in faces:
            f.normal_update()
    m.crumple(faces, 0.008, 9.0, ridged=False)
    line_ph = rng.uniform(0, 6.3)

    def fn(p, n):
        k = p.z / h
        line = 0.4 + 0.1 * math.sin(p.x * 7.0 + line_ph) + 0.05 * math.sin(p.x * 19.0 + line_ph * 2.0)
        if k < line - 0.16:
            c = [low_col[i] * 0.72 for i in range(3)]
        elif k < line:
            c = mix3([low_col[i] * 0.72 for i in range(3)], SCORCH, (k - (line - 0.16)) / 0.16)
        elif k < line + 0.12:
            c = mix3(SCORCH, CHAR_LIGHT, (k - line) / 0.12)
        else:
            c = mix3(CHAR_LIGHT, CHAR, (k - line - 0.12) / 0.3)
        if (abs(n.y) < 0.35 if bend <= 0.0 else abs(n.z) > 0.3 and n.z < 0.45) and k > 0.15:
            # The torn lip and the burned-through window edges: toasted card that catches the light.
            c = mix3(TOASTED, TOASTED_LIGHT, 0.5 + 0.5 * math.sin(p.x * 31.0))
        if n.z > 0.45:
            c = mix3(c, ASH_LIGHT if math.sin(p.x * 23.0 + p.z * 7.0) > 0.0 else ASH, 0.75)
        return c
    m.paint_by(faces, fn, CARD)
    if window is not None:
        name, wx, wz, ww = window
        faces = faces + m.decal(name, (wx, -t * 0.5 - 0.004, wz), (0, -1, 0), ww, lift=0.003)
    m.transform(faces, Matrix.Translation(Vector(at)) @ rot_z(yaw) @ Matrix.Rotation(lean, 4, "X"))
    return faces


def toast_edges(m, faces, hinge, out, length):
    """Brown the far end of a curled flap (it toasted but didn't burn): its lip catches the light."""
    hinge, out = Vector(hinge), Vector(out).normalized()

    def fn(p, n):
        d = (p - hinge).dot(out) / max(length, 0.01)
        if d > 0.55:
            return mix3(CHAR_LIGHT, TOASTED_LIGHT if d > 0.85 else TOASTED, (d - 0.55) / 0.3)
        return None
    for f in faces:
        for l in f.loops:
            c = fn(l.vert.co, f.normal)
            if c is not None:
                l[m.col] = (c[0], c[1], c[2], l[m.col][3])


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


LIPS = []


def curled_flap(m, hinge, along, out, length, width, radius, crumple=0.015):
    """A flap that curled up in the heat; its torn edge shows the flutes, its lip is toasted brown."""
    f = m.plate(hinge, along, out, length, width, CHAR, 0.012, CARD, edge=FLUTE_LIGHT, cuts=6)
    m.curl(f, hinge, along, out, radius)
    m.crumple(f, crumple, 9.0)
    LIPS.append((f, hinge, out, width))
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
    """Char everything that isn't ash, a sheet of paper or the wall left standing; toast
    the curled lips so they catch the light."""
    keep = set(f for f in keep if f.is_valid)
    m.burnt([f for f in m.bm.faces if f not in keep], ash_top=1.0, scorch_low=0.4)
    for (f, hinge, out, width) in LIPS:
        toast_edges(m, [x for x in f if x.is_valid], hinge, out, width)
    LIPS.clear()


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
        keep += standing_wall(m, (0.04, 0.33, 0.0), 0.0, 0.72, 0.42, HOUSE_PAINT, holes=((0.16, 0.24, 0.13, 0.11),),
                              lean=0.08, window=("win_curtain", -0.17, 0.2, 0.13))
    elif k == 1:
        shell(m, (0.05, 0.0, 0), 0.76, 0.7, 0.5, 0.38, 0.06, (-0.08, 0.1), -0.15)
        # The roof slid off and lies crumpled against one side.
        f = m.plate((-0.35, 0.0, 0.32), (0, 1, 0), (-0.5, 0.0, -0.86), 0.8, 0.42, CHAR, 0.012, CARD, edge=FLUTE_LIGHT, cuts=6)
        m.crumple(f, 0.03, 8.0)
        curled_flap(m, (0.3, 0.32, 0.18), (1, 0, 0), (0, 0.4, 0.9), 0.4, 0.22, 0.08)
        keep += ash_heap(m, (0.3, -0.25), 0.2)
        keep += standing_wall(m, (0.36, 0.0, 0.0), math.pi / 2, 0.62, 0.48, srgb("#d3a640"), holes=((0.0, 0.2, 0.12, 0.12),),
                              lean=-0.06, gable=True)
    elif k == 2:
        # Mostly ash, with one corner still standing.
        keep += ash_heap(m, (0, 0), 0.4, 0.3, 4)
        keep += standing_wall(m, (-0.12, -0.34, 0.0), 0.0, 0.5, 0.4, srgb("#b4523c"), holes=((0.08, 0.22, 0.12, 0.1),),
                              lean=-0.05, window=("door_blue", -0.12, 0.1, 0.12))
        keep += standing_wall(m, (-0.37, -0.08, 0.0), math.pi / 2, 0.5, 0.34, srgb("#b4523c"), lean=0.06)
        curled_flap(m, (0.2, 0.2, 0.08), (0, 1, 0), (0.8, 0, 0.6), 0.36, 0.22, 0.07)
    else:
        # Folded in on itself like a stamped-on box: two halves in a V.
        a = shell(m, (-0.2, 0, 0), 0.42, 0.74, 0.5, 0.42, 0.05, (0.0, 0.32), 0.0, (3, 5, 3))
        b = shell(m, (0.22, 0.02, 0), 0.42, 0.72, 0.5, 0.36, 0.05, (0.0, -0.3), 0.05, (3, 5, 3))
        flutes(m, (0.0, -0.36, 0.12), (0, 0, 1), (1, 0, 0), 0.2, 0.18)
        keep += ash_heap(m, (0.0, 0.3), 0.18)
        keep += standing_wall(m, (0.05, -0.4, 0.0), 0.0, 0.56, 0.34, srgb("#ece2c8"), holes=((-0.12, 0.12, 0.1, 0.2),),
                              lean=-0.1, window=("win_lit", 0.12, 0.2, 0.12))
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
        # The pencil still standing in its blob of clay, charred black at the top where the
        # tissue burned, yellow paint still showing at the bottom; a curl of burnt tissue.
        clay = m.ball((0, 0, 0.0), 0.075, srgb("#4a4a32"), CARD, 2, 0.22)
        m.squash(clay, (0, 0, 0), 0.5)
        keep += clay
        pen = m.cylinder((0, 0, 0.0), 0.02, 0.3, srgb("#f0c440"), 6, CARD, cuts=6, smooth=False, jitter=0.0)
        m.paint_by(pen, lambda p, n: mix3(srgb("#c79a2c"), CHAR, (p.z - 0.08) / 0.12))
        tip = m.cylinder((0, 0, 0.3), 0.02, 0.045, CHAR_LIGHT, 6, CARD, radius_top=0.004, cuts=0, smooth=False, jitter=0.0)
        m.transform(pen + tip, Matrix.Rotation(0.12, 4, "Y") @ Matrix.Rotation(0.05, 4, "X"))
        keep += pen + tip
        curl = m.plate((0.03, 0.0, 0.26), (0, 1, 0), (1, 0, -0.4), 0.06, 0.07, CHAR_LIGHT, 0.004, PAPER, edge=TOASTED, cuts=2)
        m.curl(curl, (0.03, 0.0, 0.26), (0, 1, 0), (1, 0, -0.4), 0.025)
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
        keep += standing_wall(m, (0.06, 0.0, 0.0), math.pi / 2, W * 0.86, 0.72, KRAFT, holes=((0.2, 0.42, 0.2, 0.16),),
                              lean=0.08, window=("win_blue", -0.24, 0.34, 0.2))
    elif k == 1:
        # Broke in two: the base crumpled by its pivot, the top half skidded on.
        shell(m, (L * 0.22, 0, 0), L * 0.42, W * 0.95, 0.95, 0.55, 0.06, (0.0, 0.06), 0.08, (4, 4, 3))
        shell(m, (L * 0.74, -0.08, 0), L * 0.46, W * 0.85, 0.9, 0.4, 0.07, (0.1, -0.05), -0.35, (4, 4, 3))
        curled_flap(m, (L * 0.45, W * 0.45, 0.2), (1, 0, 0), (0, 0.7, 0.7), 0.6, 0.3, 0.12)
        keep += ash_heap(m, (L * 0.5, -W * 0.3), 0.32, 0.3, 4)
        keep += standing_wall(m, (0.04, -0.1, 0.0), math.pi / 2, W * 0.7, 0.62, KRAFT, holes=((-0.18, 0.36, 0.18, 0.16),),
                              lean=-0.07, gable=True, window=("win_lit", 0.2, 0.3, 0.2))
    else:
        # Flattened like it was stamped on: low, wide and wavy.
        shell(m, (L * 0.5, 0, 0), L * 0.95, W * 1.05, 0.7, 0.32, 0.08, (0.0, 0.0), 0.0, (6, 4, 2), bulge=0.2)
        flutes(m, (L * 0.2, W * 0.5, 0.12), (1, 0, 0), (0, 0.6, 0.8), 0.6, 0.14)
        curled_flap(m, (L * 0.85, -W * 0.48, 0.15), (1, 0, 0), (0, -0.5, 0.86), 0.5, 0.28, 0.1)
        keep += ash_heap(m, (L * 0.15, -W * 0.45), 0.28)
        keep += standing_wall(m, (0.05, 0.05, 0.0), math.pi / 2, W * 0.8, 0.5, srgb("#a77a4a"), lean=0.1,
                              window=("win_plain", 0.0, 0.26, 0.2))
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
        keep += standing_wall(m, (0.1, 0.0, 0.0), math.pi / 2, W * 0.8, 1.1, PAPER_WHITE,
                              holes=((-0.3, 0.55, 0.22, 0.18), (0.3, 0.6, 0.22, 0.18)), lean=0.06,
                              window=("win_plain", 0.0, 0.3, 0.26))
    else:
        # One long crushed tube or box, kinked twice.
        for j, (x0, x1, t) in enumerate([(0.0, 2.0, 0.04), (2.0, 3.9, -0.07), (3.9, 5.5, 0.1)]):
            shell(m, ((x0 + x1) / 2, (j - 1) * 0.08, 0), x1 - x0 + 0.1, W * 0.8, 1.1, 0.5, 0.07, (t, 0.0), t, (4, 3, 3))
        curled_flap(m, (5.4, 0.0, 0.3), (0, 1, 0), (0.5, 0, 0.86), W * 0.6, 0.45, 0.16)
        for j in range(5):
            keep += sheet(m, (m.rng.uniform(0.5, L), m.rng.uniform(-W, W), 0.0), 0.3, m.rng.uniform(0, math.tau))
        keep += ash_heap(m, (L * 0.3, W * 0.5), 0.45, 0.25, 3)
        keep += standing_wall(m, (0.0, 0.0, 0.0), math.pi / 2, math.pi * 0.55, 1.0, PAPER_WHITE, lean=0.0, bend=0.55)
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
    keep += standing_wall(m, (-0.2, 0.0, 0.0), math.pi / 2, math.pi * 0.8, 1.1, ROLL, lean=0.0, bend=0.8)
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
    if k == 0:
        keep += standing_wall(m, (-0.7, 0.25, 0.0), 0.0, 1.7, 0.95, EGG_PULP, holes=((0.3, 0.6, 0.1, 0.24),), lean=0.05)
    elif k == 1:
        keep += standing_wall(m, (0.0, -0.5, 0.0), 0.0, 2.0, 1.3, EGG_PULP, holes=((0.0, 0.42, 0.7, 0.84),), lean=-0.04,
                              gable=True)
    else:
        keep += standing_wall(m, (-0.4, -1.8, 0.0), 0.0, 2.4, 1.5, EGG_PULP, holes=((0.4, 0.5, 0.5, 0.7),), lean=-0.05)
        keep += standing_wall(m, (-1.8, -0.7, 0.0), math.pi / 2, 1.9, 1.2, EGG_PULP, lean=0.05)
        keep += standing_wall(m, (1.75, 1.75, 0.0), 0.0, math.pi * 0.5, 1.4, ROLL, lean=0.0, bend=0.5)
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
