"""Builds fonts/KeeperFell-Regular.ttf: IM Fell English SC with lining figures.

IM Fell only has old-style figures, and in small caps they read as letters on
a phone: "+11" looks like "+II", "x1" like "XI", "1.00M" like "I.ooM". This
copies the lining figures 0-9 from Libre Caslon Text (an English old-face
serif of the same family tree as the Fell types), thickens them a little to
match the Fell's heavier, inky stems, scales them to the Fell's cap height
and writes the result as a new family, "Keeper Fell". Both fonts are SIL OFL
1.1; the licence travels with the result (fonts/KeeperFell-OFL.txt).

Run:  python3 -I art/fonts/make_keeper_fell.py
      (reads art/fonts/IMFellEnglishSC-Regular.ttf and LibreCaslonText-Regular-latin.ttf)
"""
import math
import os

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", ".."))
FELL = os.path.join(HERE, "IMFellEnglishSC-Regular.ttf")
CASLON = os.path.join(HERE, "LibreCaslonText-Regular-latin.ttf")
OUT = os.path.join(GAME, "fonts", "KeeperFell-Regular.ttf")

DIGITS = "0123456789"
HEIGHT = 0.93        # lining figures a touch under the capitals, as in old-face types
BOLDEN = 8.0        # font units (in the Caslon's 1000 per em) pushed outward on every contour


def contours_of(glyph, glyf):
    """The glyph's contours as lists of (x, y, on_curve)."""
    coords, ends, flags = glyph.getCoordinates(glyf)
    out = []
    start = 0
    for e in ends:
        pts = [(coords[k][0], coords[k][1], bool(flags[k] & 1)) for k in range(start, e + 1)]
        out.append(pts)
        start = e + 1
    return out


def area(pts):
    a = 0.0
    for k in range(len(pts)):
        x0, y0, _ = pts[k]
        x1, y1, _ = pts[(k + 1) % len(pts)]
        a += x0 * y1 - x1 * y0
    return a * 0.5


def inside(pt, pts):
    x, y = pt
    c = False
    n = len(pts)
    for k in range(n):
        x0, y0, _ = pts[k]
        x1, y1, _ = pts[(k + 1) % n]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / ((y1 - y0) or 1e-9) + x0:
            c = not c
    return c


def bolden_all(conts, d):
    """Thicken the ink: outer contours grow, holes (counters) shrink."""
    out = []
    for i, pts in enumerate(conts):
        depth = sum(1 for j, o in enumerate(conts) if j != i and inside(pts[0][:2], o))
        out.append(bolden(pts, d if depth % 2 == 0 else -d))
    return out


def bolden(pts, d):
    """Push every point of a contour out of its own interior (d < 0: into it), along
    the bisector of its two edges."""
    sgn = 1.0 if area(pts) > 0 else -1.0      # interior on the left (counter-clockwise) or the right
    n = len(pts)
    out = []
    for k in range(n):
        px, py, _ = pts[k - 1]
        x, y, on = pts[k]
        nx_, ny_, _ = pts[(k + 1) % n]
        e0 = (x - px, y - py)
        e1 = (nx_ - x, ny_ - y)
        l0 = math.hypot(*e0) or 1.0
        l1 = math.hypot(*e1) or 1.0
        # right-hand normals of each edge (outward for a clockwise contour)
        n0 = (e0[1] / l0, -e0[0] / l0)
        n1 = (e1[1] / l1, -e1[0] / l1)
        bx, by = n0[0] + n1[0], n0[1] + n1[1]
        bl = math.hypot(bx, by)
        if bl < 1e-6:
            bx, by, bl = n0[0], n0[1], 1.0
        bx, by = bx / bl, by / bl
        # keep corners from spiking: scale by 1/cos(half angle), capped
        cos_half = max(0.5, (n0[0] * bx + n0[1] * by))
        k_d = d / cos_half * sgn
        out.append((x + bx * k_d, y + by * k_d, on))
    return out


def draw_contours(pen, contours):
    for pts in contours:
        # rotate so the contour starts on an on-curve point
        k0 = next((k for k, p in enumerate(pts) if p[2]), 0)
        pts = pts[k0:] + pts[:k0]
        pen.moveTo(pts[0][:2])
        k = 1
        n = len(pts)
        while k <= n:
            p = pts[k % n]
            if p[2]:
                pen.lineTo(p[:2])
                k += 1
            else:
                offs = []
                while not pts[k % n][2] and len(offs) < n:
                    offs.append(pts[k % n][:2])
                    k += 1
                end = pts[k % n][:2]
                pen.qCurveTo(*offs, end)
                k += 1
        pen.closePath()


def main():
    fell = TTFont(FELL)
    cas = TTFont(CASLON)
    f_upm = fell["head"].unitsPerEm
    c_upm = cas["head"].unitsPerEm
    f_cap = getattr(fell["OS/2"], "sCapHeight", 0) or int(f_upm * 0.69)
    f_cmap = fell.getBestCmap()
    c_cmap = cas.getBestCmap()
    c_glyf = cas["glyf"]
    # the Caslon's figure height, from its eight
    ymax = c_glyf[c_cmap[ord("8")]].yMax
    s = f_cap * HEIGHT / ymax
    f_glyf = fell["glyf"]
    f_hmtx = fell["hmtx"]
    c_hmtx = cas["hmtx"]
    for ch in DIGITS:
        fname = f_cmap[ord(ch)]
        cname = c_cmap[ord(ch)]
        cg = c_glyf[cname]
        conts = bolden_all(contours_of(cg, c_glyf), BOLDEN)
        pen = TTGlyphPen(None)
        tp = TransformPen(pen, (s, 0, 0, s, 0, 0))
        draw_contours(tp, conts)
        g = pen.glyph()
        f_glyf[fname] = g
        adv = int(round((c_hmtx[cname][0] + BOLDEN * 1.2) * s))
        g.recalcBounds(f_glyf)
        f_hmtx[fname] = (adv, g.xMin)
    # proportional figures with even side bearings, a little tighter than the Caslon's
    # tabular ones (the HUD counter has its own tabular font, so nothing jitters)
    side = int(round(f_upm * 0.035))
    for ch in DIGITS:
        name = f_cmap[ord(ch)]
        g = f_glyf[name]
        g.coordinates.translate((side - g.xMin, 0))
        g.recalcBounds(f_glyf)
        f_hmtx[name] = (g.xMax - g.xMin + side * 2, g.xMin)
    # drop hinting and the old-style figure kerning that no longer fits
    for tag in ("hdmx", "LTSH", "VDMX", "kern"):
        if tag in fell:
            del fell[tag]
    # a new family name (a modified font must not pass for the original)
    names = fell["name"]
    for rec in names.names:
        if rec.nameID in (1, 4, 16):
            rec.string = "Keeper Fell" if rec.nameID != 4 else "Keeper Fell Regular"
        elif rec.nameID == 6:
            rec.string = "KeeperFell-Regular"
        elif rec.nameID == 3:
            rec.string = "KeeperFell-Regular;derived from IM Fell English SC and Libre Caslon Text"
    fell.save(OUT)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
