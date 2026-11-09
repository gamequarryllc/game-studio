#!/usr/bin/env python3
"""Draws the game's icon set as SVG into ui/icons/.

One style for every icon (NOTES.md art bible): a 2px ink line (#2E1E14), at
most two flat fills, and a slight hand wobble (every point is nudged a little,
then the outline is smoothed). Each icon is drawn on a 64x64 grid and saved at
128x128 px so Godot imports it crisp.

Run:  python3 art/icons/make_icons.py
"""
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "ui", "icons"))

INK = "#2E1E14"
EMBER = "#E8642C"
CORE = "#FFC15E"
CHAR = "#3A2A24"
WOOD = "#B58A57"
WOOD_DARK = "#7A5636"
PALE_WOOD = "#E2C48C"
LEATHER = "#8A5A38"
BRASS = "#C9973F"
SLATE = "#6F7C88"
CREAM = "#EFE3C8"
KRAFT = "#B98F5C"
SAGE = "#8FAE5E"
POPPY = "#D9483B"
VIOLET = "#7A58A8"
MINT = "#9FF0D0"
SKIN = "#E9BE94"
GLASS = "#A9C2C4"
GOLD = "#F2C14E"
OCHRE = "#C9A253"
STROKE = 2.6


class Icon:
    def __init__(self, name, seed):
        self.name = name
        self.rng = random.Random(seed)
        self.items = []

    def _wob(self, pts, amt):
        return [(x + self.rng.uniform(-amt, amt), y + self.rng.uniform(-amt, amt)) for x, y in pts]

    @staticmethod
    def _smooth(pts, closed):
        """Catmull-Rom through the points, as cubic Beziers."""
        n = len(pts)
        if n < 3:
            return "M %.2f %.2f " % pts[0] + " ".join("L %.2f %.2f" % p for p in pts[1:])
        d = "M %.2f %.2f " % pts[0]
        rng = range(n) if closed else range(n - 1)
        for i in rng:
            p0 = pts[(i - 1) % n] if closed or i > 0 else pts[0]
            p1 = pts[i]
            p2 = pts[(i + 1) % n]
            p3 = pts[(i + 2) % n] if closed or i + 2 < n else pts[-1]
            c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
            c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
            d += "C %.2f %.2f %.2f %.2f %.2f %.2f " % (c1 + c2 + p2)
        if closed:
            d += "Z"
        return d

    @staticmethod
    def _straight(pts, closed):
        d = "M %.2f %.2f " % pts[0] + " ".join("L %.2f %.2f" % p for p in pts[1:])
        return d + (" Z" if closed else "")

    def shape(self, pts, fill, smooth=True, wob=0.5, stroke=INK, width=STROKE, closed=True):
        pts = self._wob(pts, wob)
        d = self._smooth(pts, closed) if smooth else self._straight(pts, closed)
        self.items.append('<path d="%s" fill="%s" stroke="%s" stroke-width="%.2f" stroke-linejoin="round" stroke-linecap="round"/>'
                          % (d, fill if closed else "none", stroke, width))

    def line(self, pts, width=STROKE, color=INK, smooth=True, wob=0.4):
        self.shape(pts, "none", smooth=smooth, wob=wob, stroke=color, width=width, closed=False)

    def blob(self, cx, cy, rx, ry, fill, n=10, wob=0.6, rot=0.0, width=STROKE):
        pts = [(cx + math.cos(rot + 2 * math.pi * k / n) * rx, cy + math.sin(rot + 2 * math.pi * k / n) * ry) for k in range(n)]
        self.shape(pts, fill, wob=wob, width=width)

    def poly(self, pts, fill, wob=0.4):
        self.shape(pts, fill, smooth=False, wob=wob)

    def rect(self, x, y, w, h, fill, wob=0.5, r=0.0):
        if r <= 0:
            self.poly([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], fill, wob)
            return
        pts = []
        for cx, cy, a0 in ((x + w - r, y + r, -90), (x + w - r, y + h - r, 0), (x + r, y + h - r, 90), (x + r, y + r, 180)):
            for k in range(3):
                a = math.radians(a0 + 45 * k)
                pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
        self.shape(pts, fill, wob=wob)

    def flame(self, cx, base, w, h, fill=EMBER, inner=CORE):
        """The game's flame: a fat teardrop with two licks, and a hot core."""
        pts = [(cx, base), (cx + w * 0.5, base - h * 0.12), (cx + w * 0.55, base - h * 0.42), (cx + w * 0.3, base - h * 0.62),
               (cx + w * 0.34, base - h * 0.86), (cx + w * 0.06, base - h * 0.7), (cx - w * 0.02, base - h),
               (cx - w * 0.3, base - h * 0.62), (cx - w * 0.5, base - h * 0.48), (cx - w * 0.52, base - h * 0.2)]
        self.shape(pts, fill, wob=0.5)
        if inner:
            ip = [(cx, base - h * 0.05), (cx + w * 0.27, base - h * 0.18), (cx + w * 0.22, base - h * 0.4),
                  (cx + w * 0.02, base - h * 0.58), (cx - w * 0.2, base - h * 0.38), (cx - w * 0.25, base - h * 0.16)]
            self.shape(ip, inner, wob=0.35, width=0)

    def save(self):
        os.makedirs(OUT, exist_ok=True)
        body = "\n  ".join(self.items)
        svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64">\n'
               '  <!-- %s: drawn by art/icons/make_icons.py -->\n  %s\n</svg>\n' % (self.name, body))
        with open(os.path.join(OUT, self.name + ".svg"), "w") as f:
            f.write(svg)


ICONS = {}


def icon(fn):
    ICONS[fn.__name__] = fn
    return fn


# --- money and the HUD ------------------------------------------------------------------
@icon
def coal(i):
    i.shape([(10, 40), (14, 26), (24, 16), (38, 13), (50, 20), (55, 33), (50, 46), (36, 52), (20, 51)], CHAR, wob=0.8)
    i.shape([(22, 44), (28, 34), (36, 38), (42, 30), (47, 36), (42, 44), (32, 47)], EMBER, wob=0.6, width=0)
    i.line([(18, 28), (26, 33), (24, 41)], color=CORE, width=2.4)
    i.line([(26, 33), (36, 28), (44, 31)], color=CORE, width=2.4)
    i.line([(36, 28), (38, 20)], color=CORE, width=2.0)
    i.line([(30, 46), (37, 39), (46, 40)], color=CORE, width=2.2)


@icon
def coals(i):
    i.shape([(6, 50), (9, 40), (18, 35), (27, 39), (29, 50), (18, 54)], CHAR)
    i.shape([(34, 51), (35, 40), (44, 34), (55, 38), (58, 49), (46, 55)], CHAR)
    i.shape([(18, 36), (22, 24), (32, 18), (42, 22), (45, 33), (36, 41), (24, 41)], CHAR)
    for pts in ([(12, 44), (18, 41), (22, 47)], [(40, 45), (46, 41), (52, 46)], [(26, 30), (32, 27), (38, 32), (34, 36)]):
        i.line(pts, color=CORE, width=2.3)
    i.blob(32, 30, 3.5, 2.5, EMBER, n=7, width=0)


@icon
def notebook(i):
    i.shape([(14, 10), (48, 8), (51, 12), (52, 54), (48, 57), (14, 56), (12, 52), (12, 13)], LEATHER, wob=0.5)
    i.rect(48, 12, 6, 42, CREAM, wob=0.3)
    i.line([(50, 14), (50, 52)], width=1.2)
    i.line([(41, 9), (40, 57)], width=2.2)
    i.line([(18, 18), (34, 17)], color=CREAM, width=2.0)
    i.line([(18, 24), (30, 23)], color=CREAM, width=2.0)
    i.shape([(28, 55), (32, 55), (32, 62), (30, 60), (28, 62)], POPPY, smooth=False, wob=0.2, width=1.8)


# --- the tools ----------------------------------------------------------------------------
@icon
def matchstick(i):
    i.shape([(14, 54), (44, 18), (49, 22), (19, 58)], PALE_WOOD, smooth=False, wob=0.4)
    i.blob(48, 17, 7, 9, POPPY, rot=math.radians(40))
    i.line([(45, 13), (49, 12)], color=CREAM, width=1.8)


@icon
def sparkler(i):
    cols = [POPPY, GOLD, POPPY, GOLD]
    for k in range(4):
        x0, y0 = 14 + k * 7, 56 - k * 8
        i.shape([(x0, y0), (x0 + 7, y0 - 8), (x0 + 11, y0 - 5), (x0 + 4, y0 + 3)], cols[k], smooth=False, wob=0.3)
    for a in range(0, 360, 45):
        r = 9 if a % 90 == 0 else 6
        i.line([(46, 18), (46 + math.cos(math.radians(a)) * r, 18 + math.sin(math.radians(a)) * r)], width=2.0)


@icon
def lighter(i):
    i.rect(18, 30, 24, 28, BRASS, r=3)
    i.line([(18, 36), (42, 36)], width=2.0)
    i.shape([(42, 30), (52, 22), (56, 26), (46, 34)], BRASS, smooth=False, wob=0.3)
    i.rect(24, 24, 9, 6, SLATE, wob=0.3)
    i.flame(29, 23, 13, 18)


@icon
def tiki_torch(i):
    i.shape([(26, 60), (30, 28), (35, 28), (32, 60)], WOOD, smooth=False)
    for y in (36, 46, 54):
        i.line([(29, y), (33.5, y)], width=2.0)
    i.shape([(22, 30), (20, 22), (24, 18), (40, 18), (44, 22), (42, 30)], WOOD_DARK)
    i.line([(23, 24), (41, 24)], width=1.6)
    i.flame(32, 18, 18, 16, inner=None)


@icon
def flamethrower(i):
    i.rect(10, 26, 18, 30, BRASS, r=6)
    i.line([(10, 36), (28, 36)], width=2.0)
    i.line([(10, 46), (28, 46)], width=2.0)
    i.shape([(26, 30), (48, 22), (50, 27), (28, 36)], SLATE, smooth=False)
    i.rect(48, 19, 7, 10, SLATE, wob=0.3)
    i.line([(19, 26), (22, 14), (36, 14), (40, 24)], width=2.4)


@icon
def dragon(i):
    i.shape([(12, 48), (14, 30), (24, 18), (40, 16), (52, 24), (56, 36), (50, 48), (36, 54), (22, 54)], VIOLET)
    i.shape([(22, 22), (16, 8), (28, 18)], CREAM, smooth=False)
    i.shape([(36, 17), (40, 4), (44, 19)], CREAM, smooth=False)
    i.blob(25, 32, 4, 4, CREAM, n=8)
    i.blob(40, 30, 4, 4, CREAM, n=8)
    i.blob(25.5, 32.5, 1.5, 1.5, INK, n=6, width=0)
    i.blob(40.5, 30.5, 1.5, 1.5, INK, n=6, width=0)
    i.line([(30, 44), (36, 46), (44, 42)], width=2.2)


@icon
def meteor(i):
    i.shape([(8, 56), (30, 30), (36, 36)], EMBER, wob=0.5)
    i.line([(14, 42), (26, 32)], width=2.0)
    i.line([(22, 54), (32, 42)], width=2.0)
    pts = []
    for k in range(10):
        a = -math.pi / 2 + math.pi * k / 5
        r = 16 if k % 2 == 0 else 7
        pts.append((42 + math.cos(a) * r, 22 + math.sin(a) * r))
    i.shape(pts, CORE, smooth=False, wob=0.5)


# --- upgrades -----------------------------------------------------------------------------
@icon
def bellows(i):
    i.shape([(8, 30), (30, 14), (40, 22), (34, 44), (14, 46)], WOOD)
    i.shape([(10, 36), (32, 20), (38, 28), (16, 44)], LEATHER, wob=0.3, width=1.8)
    i.shape([(36, 30), (48, 34), (48, 38), (36, 38)], SLATE, smooth=False, wob=0.3)
    i.flame(56, 46, 10, 18, inner=None)


@icon
def dry_winds(i):
    i.line([(6, 22), (30, 22), (38, 18), (36, 11), (29, 12)], width=2.8)
    i.line([(6, 32), (46, 32), (54, 37), (51, 45), (43, 43)], width=2.8)
    i.line([(10, 42), (26, 42)], width=2.8)
    i.shape([(36, 56), (44, 46), (56, 44), (52, 54)], OCHRE)
    i.line([(38, 55), (52, 46)], width=1.6)


@icon
def ember_value(i):
    i.shape([(14, 30), (20, 24), (44, 24), (50, 30), (54, 46), (46, 56), (18, 56), (10, 46)], LEATHER)
    i.line([(20, 24), (24, 18), (40, 18), (44, 24)], width=2.4)
    i.blob(26, 18, 5, 4, CHAR, n=7)
    i.blob(37, 16, 5, 4, EMBER, n=7)
    i.line([(18, 34), (46, 34)], width=1.8)


@icon
def wide_flame(i):
    i.flame(32, 54, 22, 36)
    i.line([(14, 40), (4, 40)], width=2.6)
    i.line([(8, 35), (4, 40), (8, 45)], width=2.6, smooth=False)
    i.line([(50, 40), (60, 40)], width=2.6)
    i.line([(56, 35), (60, 40), (56, 45)], width=2.6, smooth=False)


@icon
def boots(i):
    i.shape([(22, 8), (38, 8), (38, 38), (52, 44), (54, 54), (20, 56), (20, 30)], LEATHER)
    i.rect(20, 8, 19, 8, CREAM, wob=0.4)
    i.line([(20, 50), (54, 50)], width=2.0)
    for y in (26, 34, 42):
        i.line([(4, y), (14, y)], width=2.0)


# --- helpers ------------------------------------------------------------------------------
@icon
def sprite(i):
    i.shape([(32, 58), (46, 50), (50, 36), (44, 22), (40, 10), (34, 18), (28, 6), (20, 22), (14, 36), (18, 50)], EMBER)
    i.blob(32, 44, 11, 9, CORE, n=9, width=0)
    i.blob(27, 38, 2, 3, INK, n=6, width=0)
    i.blob(37, 38, 2, 3, INK, n=6, width=0)
    i.line([(28, 46), (32, 48), (36, 46)], width=2.0)


@icon
def salamander(i):
    i.shape([(8, 40), (16, 32), (30, 30), (42, 34), (50, 30), (58, 32), (56, 38), (46, 42), (32, 44), (20, 46), (10, 50), (4, 56), (4, 48)], EMBER)
    i.blob(54, 34, 2, 2, INK, n=6, width=0)
    for x0 in (22, 38):
        i.line([(x0, 44), (x0 - 4, 52)], width=2.4)
        i.line([(x0 + 2, 32), (x0 - 2, 24)], width=2.4)
    i.blob(26, 37, 2.5, 2, CHAR, n=6, width=0)
    i.blob(36, 37, 2.5, 2, CHAR, n=6, width=0)


# --- free magic (rewarded ads) -------------------------------------------------------------
@icon
def magic_lantern(i):
    i.shape([(40, 30), (60, 20), (60, 48), (40, 40)], CORE, smooth=False, wob=0.5, width=1.8)
    i.rect(8, 22, 26, 22, BRASS, r=3)
    i.rect(32, 28, 9, 12, SLATE, wob=0.3)
    i.shape([(16, 22), (18, 12), (24, 12), (26, 22)], BRASS, smooth=False, wob=0.3)
    i.line([(12, 44), (10, 54)], width=2.4)
    i.line([(30, 44), (32, 54)], width=2.4)
    i.blob(21, 33, 4, 4, CORE, n=8, width=1.8)


@icon
def hourglass(i):
    i.rect(12, 6, 40, 6, WOOD, wob=0.3)
    i.rect(12, 52, 40, 6, WOOD, wob=0.3)
    i.shape([(18, 12), (46, 12), (34, 32), (46, 52), (18, 52), (30, 32)], CREAM, wob=0.4)
    i.shape([(22, 50), (42, 50), (32, 40)], EMBER, smooth=False, wob=0.3, width=0)
    i.shape([(24, 16), (40, 16), (32, 26)], EMBER, smooth=False, wob=0.3, width=0)
    i.line([(32, 30), (32, 40)], color=EMBER, width=2.0)


@icon
def rush(i):
    i.shape([(36, 58), (50, 50), (54, 36), (48, 22), (44, 10), (38, 18), (32, 6), (24, 22), (18, 36), (22, 50)], EMBER)
    i.blob(36, 44, 11, 9, CORE, n=9, width=0)
    i.blob(31, 38, 2, 3, INK, n=6, width=0)
    i.blob(41, 38, 2, 3, INK, n=6, width=0)
    for y in (26, 36, 46):
        i.line([(2, y), (12, y)], width=2.4)


# --- the shop ---------------------------------------------------------------------------
@icon
def parcel(i):
    i.shape([(8, 22), (32, 14), (56, 22), (56, 50), (32, 58), (8, 50)], KRAFT)
    i.line([(8, 22), (32, 30), (56, 22)], width=2.0)
    i.line([(32, 30), (32, 58)], width=2.0)
    i.line([(20, 18), (44, 26), (44, 54)], color=CREAM, width=2.6)
    i.line([(44, 18), (20, 26), (20, 54)], color=CREAM, width=2.6)
    i.blob(26, 12, 6, 4, CREAM, n=8, rot=0.4)
    i.blob(38, 12, 6, 4, CREAM, n=8, rot=-0.4)


@icon
def phoenix(i):
    i.shape([(14, 58), (20, 40), (30, 22), (44, 8), (52, 12), (48, 28), (38, 42), (24, 52)], EMBER)
    i.shape([(22, 50), (28, 38), (38, 24), (46, 14), (44, 26), (34, 40)], CORE, width=0)
    i.line([(12, 60), (44, 14)], width=2.0)
    for k in range(4):
        y = 46 - k * 8
        i.line([(22 + k * 6, y), (16 + k * 6, y - 6)], width=1.4)


@icon
def no_ads(i):
    i.rect(10, 22, 26, 22, BRASS, r=3)
    i.rect(34, 28, 8, 12, SLATE, wob=0.3)
    i.shape([(42, 30), (58, 22), (58, 46), (42, 38)], CORE, smooth=False, width=1.8)
    i.line([(8, 8), (58, 58)], width=4.0, color=POPPY)
    i.line([(8, 8), (58, 58)], width=1.2)


@icon
def pouch(i):
    i.shape([(18, 28), (22, 22), (42, 22), (46, 28), (50, 46), (42, 56), (22, 56), (14, 46)], LEATHER)
    i.line([(22, 22), (26, 16), (38, 16), (42, 22)], width=2.4)
    i.blob(32, 14, 6, 4, EMBER, n=7)


@icon
def jar(i):
    i.rect(18, 8, 28, 8, WOOD, wob=0.3)
    i.shape([(16, 16), (48, 16), (52, 26), (52, 52), (46, 58), (18, 58), (12, 52), (12, 26)], GLASS)
    for cx, cy in ((24, 48), (36, 50), (30, 40), (42, 40), (22, 38)):
        i.blob(cx, cy, 5, 4, EMBER, n=7, width=1.6)
    i.line([(18, 24), (18, 34)], color=CREAM, width=2.0)


@icon
def cauldron(i):
    i.shape([(8, 26), (56, 26), (54, 44), (44, 54), (20, 54), (10, 44)], CHAR)
    i.rect(6, 22, 52, 6, CHAR, wob=0.3)
    for cx in (18, 28, 38, 48):
        i.blob(cx, 20, 5, 4, EMBER, n=7, width=1.6)
    i.line([(18, 54), (14, 60)], width=2.6)
    i.line([(46, 54), (50, 60)], width=2.6)
    i.flame(32, 18, 10, 12, inner=None)


@icon
def restore(i):
    i.line([(48, 22), (40, 12), (26, 10), (14, 20), (12, 34), (18, 46), (30, 52), (44, 48), (52, 36)], width=4.4, color=KRAFT)
    i.line([(48, 22), (40, 12), (26, 10), (14, 20), (12, 34), (18, 46), (30, 52), (44, 48), (52, 36)], width=1.2)
    i.shape([(52, 28), (58, 40), (46, 38)], KRAFT, smooth=False)


# --- settings and the developer page -------------------------------------------------------
@icon
def dial(i):
    i.blob(32, 34, 22, 22, WOOD, n=12)
    i.blob(32, 34, 12, 12, CREAM, n=10)
    i.line([(32, 34), (40, 24)], width=3.0)
    for k in range(7):
        a = math.radians(150 + k * 40)
        i.line([(32 + math.cos(a) * 17, 34 + math.sin(a) * 17), (32 + math.cos(a) * 20, 34 + math.sin(a) * 20)], width=2.0)


@icon
def horn(i):
    i.shape([(8, 26), (22, 26), (44, 10), (50, 12), (50, 52), (44, 54), (22, 38), (8, 38)], BRASS)
    i.line([(52, 22), (58, 18)], width=2.4)
    i.line([(54, 32), (61, 32)], width=2.4)
    i.line([(52, 42), (58, 46)], width=2.4)
    i.rect(8, 26, 8, 12, CREAM, wob=0.3)


@icon
def horn_mute(i):
    i.shape([(8, 26), (22, 26), (44, 10), (50, 12), (50, 52), (44, 54), (22, 38), (8, 38)], BRASS)
    i.rect(8, 26, 8, 12, CREAM, wob=0.3)
    i.line([(6, 8), (58, 58)], width=4.0, color=POPPY)
    i.line([(6, 8), (58, 58)], width=1.2)


@icon
def wrench(i):
    i.shape([(10, 52), (36, 26), (40, 30), (14, 56)], WOOD, smooth=False)
    i.shape([(34, 22), (38, 10), (48, 6), (44, 16), (50, 22), (58, 18), (54, 28), (42, 32)], SLATE)


@icon
def sprout(i):
    i.line([(32, 58), (32, 30)], width=2.8)
    i.shape([(32, 34), (20, 30), (12, 18), (24, 18)], SAGE)
    i.shape([(32, 28), (40, 16), (54, 12), (48, 26)], SAGE)
    i.blob(32, 58, 16, 4, WOOD, n=10)


@icon
def chart(i):
    i.rect(8, 8, 48, 48, CREAM, wob=0.5)
    i.rect(16, 36, 7, 14, EMBER, wob=0.3)
    i.rect(28, 24, 7, 26, EMBER, wob=0.3)
    i.rect(40, 30, 7, 20, EMBER, wob=0.3)


# --- little marks ---------------------------------------------------------------------------
@icon
def padlock(i):
    i.line([(22, 30), (22, 18), (32, 10), (42, 18), (42, 30)], width=4.0)
    i.rect(14, 28, 36, 28, BRASS, r=4)
    i.blob(32, 40, 3, 3, INK, n=6, width=0)
    i.line([(32, 42), (32, 48)], width=2.6)


@icon
def tick(i):
    i.line([(10, 34), (24, 48), (54, 14)], width=6.0, smooth=False, wob=0.8)


@icon
def heart(i):
    pts = []
    for k in range(24):
        t = 2 * math.pi * k / 24
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append((32 + x * 1.5, 30 + y * 1.5))
    i.shape(pts, POPPY, wob=0.4)
    i.line([(20, 20), (17, 27)], color=CREAM, width=2.4)


@icon
def finger(i):
    """A drawn hand pointing down and pressing (for the first-run hints)."""
    i.shape([(26, 60), (24, 36), (22, 26), (24, 6), (30, 4), (32, 24), (36, 22), (40, 24), (44, 24), (48, 27), (52, 30),
             (52, 44), (46, 58), (34, 62)], CREAM, wob=0.4)
    i.line([(32, 24), (32, 34)], width=1.8)
    i.line([(40, 24), (40, 34)], width=1.8)
    i.line([(48, 27), (47, 36)], width=1.8)
    i.rect(24, 54, 24, 8, WOOD, wob=0.3)


@icon
def phone_turn(i):
    i.rect(22, 6, 20, 36, CREAM, r=4)
    i.rect(12, 46, 40, 14, CREAM, r=3)
    i.line([(48, 14), (56, 22), (56, 34)], width=2.6)
    i.line([(52, 30), (56, 36), (60, 30)], width=2.6, smooth=False)


@icon
def flame(i):
    i.flame(32, 58, 34, 50)


@icon
def hare(i):
    i.shape([(10, 50), (14, 38), (26, 32), (40, 34), (48, 26), (50, 14), (54, 12), (54, 26), (58, 32), (54, 40), (48, 44), (44, 52),
             (30, 54), (16, 56)], GOLD)
    i.shape([(46, 26), (40, 8), (44, 6), (50, 20)], GOLD)
    i.blob(52, 32, 1.6, 1.6, INK, n=6, width=0)
    i.blob(12, 44, 5, 5, CREAM, n=8)


@icon
def lantern(i):
    i.shape([(22, 14), (32, 6), (42, 14)], BRASS, smooth=False)
    i.rect(20, 14, 24, 6, BRASS, wob=0.3)
    i.rect(22, 20, 20, 26, CORE, wob=0.4)
    i.line([(32, 20), (32, 46)], width=1.8)
    i.rect(18, 46, 28, 6, BRASS, wob=0.3)
    i.line([(26, 6), (32, 0.5), (38, 6)], width=2.0)


def main():
    for k, (name, fn) in enumerate(sorted(ICONS.items())):
        ic = Icon(name, 1000 + k * 17)
        fn(ic)
        ic.save()
    print("wrote %d icons to %s" % (len(ICONS), OUT))


if __name__ == "__main__":
    main()
