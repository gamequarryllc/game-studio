#!/usr/bin/env python3
"""Draws every icon in the game as SVG, in one style: a thick ink outline over a
marker fill that doesn't quite line up with it (the way a hand-coloured sticker
looks), on a 64x64 grid. Paper-doll citizens and find stickers get a white cut-out
border as well. Writes icons/*.svg and icon.svg (the app icon).

    python3 tools/make_icons.py

Seeded wobble, so it rebuilds the same. Add an icon: add a function to ICONS.
"""
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
OUT = os.path.join(ROOT, "icons")

INK = "#221d1b"
KRAFT = "#c89a64"
KRAFT_D = "#a77a4a"
PALE = "#ecdcb8"
RED = "#d2412f"
ORANGE = "#ef8a2c"
YELLOW = "#f2c43e"
BLUE = "#3f74c0"
SKY = "#8cbbe0"
GREEN = "#5f9a4a"
PINK = "#e98aa0"
GREY = "#9aa3ab"
WHITE = "#fbf8ef"
GOLD = "#e3b23c"
TAPE = "#e8d8a8"
W = 5.0  # ink width

rng = random.Random(7)


def wob(pts, amp=0.7):
    return [(x + rng.uniform(-amp, amp), y + rng.uniform(-amp, amp)) for x, y in pts]


def smooth_path(pts, closed=True):
    """Catmull-Rom through the points, as a cubic bezier path."""
    if len(pts) < 3:
        return "M %.1f %.1f L %.1f %.1f" % (pts[0] + pts[-1])
    p = pts + pts[:2] if closed else [pts[0]] + pts + [pts[-1]]
    d = "M %.1f %.1f " % p[1] if closed else "M %.1f %.1f " % pts[0]
    rng_ = range(1, len(p) - 2)
    for i in rng_:
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += "C %.1f %.1f %.1f %.1f %.1f %.1f " % (c1 + c2 + p2)
    return d + ("Z" if closed else "")


def poly_path(pts, closed=True):
    d = "M %.1f %.1f " % pts[0] + " ".join("L %.1f %.1f" % q for q in pts[1:])
    return d + (" Z" if closed else "")


class Icon:
    def __init__(self, size=64, border=False):
        self.size = size
        self.fills = []
        self.inks = []
        self.border = border

    def fill(self, pts, color, smooth=False, off=(1.6, 1.4)):
        pts = wob(pts, 0.5)
        moved = [(x + off[0], y + off[1]) for x, y in pts]
        d = smooth_path(moved) if smooth else poly_path(moved)
        self.fills.append('<path d="%s" fill="%s"/>' % (d, color))
        return pts

    def ink(self, pts, closed=True, smooth=False, width=W, color=INK):
        pts = wob(pts, 0.6)
        d = smooth_path(pts, closed) if smooth else poly_path(pts, closed)
        self.inks.append('<path d="%s" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" '
                         'stroke-linejoin="round"/>' % (d, color, width))

    def shape(self, pts, color, smooth=False, closed=True, width=W):
        self.fill(pts, color, smooth)
        self.ink(pts, closed, smooth, width)

    def circle(self, cx, cy, r, color=None, width=W, n=14):
        pts = [(cx + math.cos(a * 2 * math.pi / n) * r, cy + math.sin(a * 2 * math.pi / n) * r) for a in range(n)]
        if color:
            self.fill(pts, color, True)
        self.ink(pts, True, True, width)

    def line(self, a, b, width=W, color=INK):
        self.ink([a, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), b], False, False, width, color)

    def dot(self, cx, cy, r=2.4, color=INK):
        self.inks.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (cx, cy, r, color))

    def svg(self):
        s = self.size
        body = "\n".join(self.fills + self.inks)
        if self.border:
            # A white paper cut-out edge behind everything: the same shapes, fattened and white.
            import re
            edge = []
            for e in self.fills:
                edge.append(re.sub(r'fill="[^"]*"', 'fill="%s" stroke="%s" stroke-width="10" stroke-linejoin="round"'
                                   % (WHITE, WHITE), e))
            for e in self.inks:
                edge.append(re.sub(r'stroke="[^"]*" stroke-width="[^"]*"', 'stroke="%s" stroke-width="12"' % WHITE, e))
            body = "\n".join(edge) + "\n" + body
        return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">\n%s\n</svg>\n'
                % (s * 2, s * 2, s, s, body))


# =====================================================================================
# The icons
# =====================================================================================
def coin():
    i = Icon()
    i.circle(32, 33, 22, YELLOW, n=16)
    i.circle(32, 33, 15, None, 2.6, n=12)
    pts = []
    for k in range(10):
        a = -math.pi / 2 + k * math.pi / 5
        r = 8.5 if k % 2 == 0 else 3.8
        pts.append((32 + math.cos(a) * r, 33 + math.sin(a) * r))
    i.shape(pts, "#f7dc7a", width=2.6)
    return i


def box():
    i = Icon()
    i.shape([(10, 26), (54, 26), (52, 56), (12, 56)], KRAFT)
    i.shape([(10, 26), (4, 14), (28, 12), (32, 26)], KRAFT_D)
    i.shape([(32, 26), (37, 10), (60, 15), (54, 26)], KRAFT_D)
    i.fill([(26, 36), (38, 36), (38, 42), (26, 42)], TAPE)
    i.line((24, 39), (40, 39), 3.0)
    return i


def flame():
    i = Icon()
    outer = [(32, 6), (44, 22), (50, 36), (46, 50), (32, 58), (18, 50), (14, 37), (21, 27), (24, 34), (28, 18)]
    i.shape(outer, ORANGE, smooth=True)
    inner = [(33, 28), (40, 40), (38, 50), (32, 53), (26, 49), (25, 40)]
    i.shape(inner, YELLOW, smooth=True, width=3.5)
    return i


def tv():
    """A television made from a cardboard box: a screen drawn on in marker, a dial, two
    bent drinking-straw aerials taped on top (the ads are watched on this)."""
    i = Icon()
    i.shape([(8, 20), (56, 18), (57, 54), (7, 55)], KRAFT)
    i.shape([(13, 25), (44, 24), (45, 49), (13, 50)], "#5b6f86")
    i.ink([(16, 29), (21, 27)], False, False, 2.6, WHITE)
    i.shape([(24, 31), (35, 37), (24, 43)], WHITE, width=3.0)
    i.circle(51, 30, 3.6, YELLOW, 2.6, 10)
    i.circle(51, 42, 3.0, RED, 2.6, 10)
    i.line((26, 18), (17, 4), 3.6, RED)
    i.line((36, 18), (47, 5), 3.6, BLUE)
    i.ink([(24, 13), (30, 16), (36, 14)], False, False, 5.0, TAPE)
    return i


def fan():
    i = Icon()
    i.circle(32, 30, 24, PALE, n=18)
    for k in range(3):
        a = k * 2.094 + 0.3
        c, s = math.cos(a), math.sin(a)
        pts = [(32, 30), (32 + c * 18 - s * 6, 30 + s * 18 + c * 6), (32 + c * 20 + s * 4, 30 + s * 20 - c * 4)]
        i.shape(pts, GREY, True, width=3.5)
    i.circle(32, 30, 4, INK, 3)
    i.line((32, 54), (32, 60), 4.0)
    i.line((22, 61), (42, 61), 4.0)
    return i


def magnifier():
    i = Icon()
    i.line((42, 42), (57, 57), 9.0, "#8a5a30")
    i.line((42, 42), (57, 57), 3.0, INK)
    i.circle(28, 28, 18, SKY, n=16)
    i.ink([(18, 22), (22, 17), (28, 15)], False, True, 3.0, WHITE)
    return i


def candle():
    i = Icon()
    i.shape([(24, 24), (40, 24), (40, 56), (24, 56)], WHITE)
    i.shape([(40, 24), (40, 34), (37, 36), (35, 28)], WHITE, width=3.5)
    i.line((32, 24), (32, 18), 3.0)
    i.shape([(32, 4), (37, 12), (36, 18), (32, 20), (28, 18), (27, 12)], ORANGE, smooth=True, width=3.5)
    i.line((16, 58), (48, 58), 5.0)
    return i


def blowtorch():
    i = Icon()
    i.shape([(10, 30), (28, 30), (28, 58), (10, 58)], BLUE)
    i.shape([(12, 22), (26, 22), (28, 30), (10, 30)], GREY)
    i.line((26, 24), (46, 18), 5.0)
    i.shape([(46, 14), (60, 16), (62, 20), (60, 24), (46, 22)], SKY, smooth=True, width=3.5)
    i.dot(19, 26, 2.5)
    return i


def rocket():
    i = Icon()
    i.shape([(26, 20), (38, 20), (38, 44), (26, 44)], RED)
    i.shape([(26, 20), (32, 6), (38, 20)], YELLOW)
    i.line((32, 44), (32, 62), 3.0)
    i.shape([(26, 36), (18, 46), (26, 44)], YELLOW, width=3.5)
    i.shape([(38, 36), (46, 46), (38, 44)], YELLOW, width=3.5)
    i.line((26, 30), (38, 30), 3.0)
    return i


def thermometer():
    """A struck match (the hotter-flame trick): a wooden stick, a red head, a flame."""
    i = Icon()
    i.shape([(14, 58), (18, 60), (40, 26), (36, 23)], "#e2c290", width=4.0)
    i.circle(40, 22, 6.5, RED, 4.0, 12)
    flame = [(44, 2), (52, 12), (54, 20), (50, 27), (43, 28), (38, 22), (39, 14), (42, 16)]
    i.shape(flame, ORANGE, smooth=True, width=3.5)
    i.shape([(46, 14), (49, 20), (47, 25), (43, 24), (43, 19)], YELLOW, smooth=True, width=2.6)
    return i


def sun():
    i = Icon()
    i.circle(32, 32, 12, YELLOW)
    for k in range(8):
        a = k * math.pi / 4 + 0.15
        i.line((32 + math.cos(a) * 18, 32 + math.sin(a) * 18), (32 + math.cos(a) * 27, 32 + math.sin(a) * 27), 4.5)
    return i


def coins_stack():
    i = Icon()
    for k, y in enumerate((46, 38, 30)):
        i.shape([(14, y), (46, y), (46, y + 8), (14, y + 8)], YELLOW, width=4)
    i.circle(46, 22, 12, YELLOW, 4)
    return i


def glue():
    i = Icon()
    i.shape([(18, 24), (46, 24), (48, 58), (16, 58)], WHITE)
    i.shape([(26, 14), (38, 14), (40, 24), (24, 24)], ORANGE)
    i.shape([(30, 4), (34, 4), (35, 14), (29, 14)], ORANGE, width=3.5)
    i.fill([(20, 36), (44, 36), (44, 46), (20, 46)], BLUE)
    i.line((20, 41), (44, 41), 3.0)
    return i


def boot():
    i = Icon()
    i.shape([(18, 8), (36, 8), (36, 38), (56, 44), (56, 56), (14, 56), (16, 30)], KRAFT_D)
    i.line((14, 50), (56, 50), 4.0)
    i.line((22, 18), (32, 18), 3.0)
    i.line((22, 26), (32, 26), 3.0)
    return i


def windup():
    i = Icon()
    i.shape([(8, 32), (14, 22), (44, 22), (56, 32), (56, 44), (8, 44)], "#2f8f8a")
    i.circle(18, 46, 7, INK, 3)
    i.circle(46, 46, 7, INK, 3)
    i.line((30, 22), (30, 12), 4.0)
    i.shape([(20, 6), (30, 12), (40, 6), (40, 14), (20, 14)], GOLD, width=3.5)
    i.line((56, 30), (62, 18), 3.0, INK)
    i.dot(62, 16, 3.0, ORANGE)
    return i


def plane():
    i = Icon()
    i.shape([(4, 30), (60, 10), (30, 54), (26, 36)], WHITE)
    i.line((26, 36), (60, 10), 3.0)
    i.line((26, 36), (30, 54), 3.0)
    return i


def lock():
    i = Icon()
    i.ink([(20, 30), (20, 20), (26, 12), (38, 12), (44, 20), (44, 30)], False, True)
    i.shape([(14, 30), (50, 30), (50, 56), (14, 56)], GOLD)
    i.dot(32, 42, 3.5)
    i.line((32, 42), (32, 49), 4.0)
    return i


def check():
    i = Icon()
    i.ink([(12, 34), (26, 48), (54, 14)], False, False, 7.0, GREEN)
    return i


def close():
    i = Icon()
    i.line((16, 16), (48, 48), 7.0)
    i.line((48, 16), (16, 48), 7.0)
    return i


def speaker():
    i = Icon()
    i.shape([(8, 24), (20, 24), (34, 12), (34, 52), (20, 40), (8, 40)], PALE)
    i.ink([(42, 22), (46, 32), (42, 42)], False, True, 4.0)
    i.ink([(48, 14), (55, 32), (48, 50)], False, True, 4.0)
    return i


def mute():
    i = Icon()
    i.shape([(8, 24), (20, 24), (34, 12), (34, 52), (20, 40), (8, 40)], PALE)
    i.line((42, 24), (56, 40), 4.5)
    i.line((56, 24), (42, 40), 4.5)
    return i


def gear():
    i = Icon()
    pts = []
    for k in range(16):
        a = k * math.pi / 8
        r = 24 if k % 2 == 0 else 18
        pts.append((32 + math.cos(a) * r, 32 + math.sin(a) * r))
    i.shape(pts, GREY)
    i.circle(32, 32, 7, PALE, 4)
    return i


def gift():
    i = Icon()
    i.shape([(10, 26), (54, 26), (54, 36), (10, 36)], RED)
    i.shape([(14, 36), (50, 36), (50, 58), (14, 58)], RED)
    i.fill([(29, 26), (35, 26), (35, 58), (29, 58)], YELLOW)
    i.line((32, 26), (32, 58), 3.0)
    i.ink([(32, 25), (22, 14), (16, 20), (32, 25)], True, True, 4.0)
    i.ink([(32, 25), (42, 14), (48, 20), (32, 25)], True, True, 4.0)
    return i


def lens():
    i = Icon()
    i.line((42, 42), (57, 57), 9.0, GOLD)
    i.line((42, 42), (57, 57), 3.0, INK)
    i.circle(28, 28, 18, YELLOW, n=16)
    i.circle(28, 28, 12, "#fff3c4", 3, n=12)
    for k in range(3):
        a = -2.4 + k * 0.5
        i.line((28 + math.cos(a) * 24, 28 + math.sin(a) * 24), (28 + math.cos(a) * 30, 28 + math.sin(a) * 30), 3.5)
    return i


def restore():
    i = Icon()
    i.ink([(48, 22), (40, 12), (26, 12), (16, 22), (14, 34)], False, True, 5.0)
    i.shape([(44, 26), (54, 26), (50, 16)], INK, width=3.0)
    i.ink([(16, 42), (24, 52), (38, 52), (48, 42), (50, 30)], False, True, 5.0)
    i.shape([(20, 38), (10, 38), (14, 48)], INK, width=3.0)
    return i


def noads():
    i = tv()
    i.line((6, 58), (58, 8), 6.0, RED)
    return i


def chain():
    i = Icon()
    i.ink([(10, 30), (18, 22), (30, 22), (36, 30), (30, 38), (18, 38)], True, True, 5.0)
    i.ink([(28, 30), (34, 22), (46, 22), (54, 30), (46, 38), (34, 38)], True, True, 5.0)
    return i


def house():
    i = Icon()
    i.shape([(14, 30), (50, 30), (50, 56), (14, 56)], KRAFT)
    i.shape([(8, 32), (32, 10), (56, 32)], RED)
    i.fill([(26, 42), (34, 42), (34, 56), (26, 56)], BLUE)
    i.ink([(26, 56), (26, 42), (34, 42), (34, 56)], False)
    return i


def office():
    i = Icon()
    i.shape([(16, 12), (48, 12), (48, 58), (16, 58)], KRAFT)
    for y in (20, 30, 40):
        i.line((22, y), (28, y), 3.0)
        i.line((36, y), (42, y), 3.0)
    i.shape([(16, 12), (10, 4), (30, 6), (32, 12)], KRAFT_D, width=3.5)
    return i


def skyscraper():
    i = Icon()
    i.shape([(22, 10), (42, 10), (42, 60), (22, 60)], WHITE)
    i.line((32, 10), (32, 2), 3.0)
    for y in range(18, 56, 8):
        i.line((27, y), (37, y), 3.0, BLUE)
    i.shape([(42, 30), (56, 30), (56, 60), (42, 60)], KRAFT)
    return i


def castle():
    i = Icon()
    i.shape([(10, 28), (54, 28), (54, 58), (10, 58)], PALE)
    for x in (10, 22, 34, 46):
        i.shape([(x, 22), (x + 8, 22), (x + 8, 28), (x, 28)], PALE, width=3.5)
    i.shape([(26, 58), (26, 44), (32, 38), (38, 44), (38, 58)], KRAFT_D)
    i.line((32, 22), (32, 8), 3.0)
    i.shape([(32, 8), (44, 12), (32, 16)], YELLOW, width=3.0)
    return i


def duck():
    i = Icon(border=True)
    i.shape([(10, 40), (14, 30), (26, 30), (30, 22), (40, 14), (50, 18), (52, 28), (46, 34), (54, 40), (48, 54), (20, 56)], YELLOW, True)
    i.shape([(50, 22), (60, 24), (52, 28)], ORANGE, width=3.5)
    i.dot(44, 22, 2.6)
    return i


def sock():
    i = Icon(border=True)
    i.shape([(24, 6), (42, 6), (42, 38), (50, 46), (46, 58), (30, 58), (20, 50), (24, 38)], RED, True)
    i.fill([(24, 6), (42, 6), (42, 14), (24, 14)], WHITE)
    i.line((24, 14), (42, 14), 3.0)
    i.line((26, 26), (40, 26), 3.0, WHITE)
    return i


def robot():
    i = Icon(border=True)
    i.shape([(18, 16), (46, 16), (46, 38), (18, 38)], GREY)
    i.shape([(22, 38), (42, 38), (42, 56), (22, 56)], SKY)
    i.dot(26, 26, 3.0)
    i.dot(38, 26, 3.0)
    i.line((26, 32), (38, 32), 3.0)
    i.line((32, 16), (32, 8), 3.0)
    i.dot(32, 7, 3.0, RED)
    return i


def marbles():
    i = Icon(border=True)
    i.circle(22, 40, 11, BLUE)
    i.circle(42, 42, 10, GREEN)
    i.circle(32, 24, 10, RED)
    return i


def yoyo():
    i = Icon(border=True)
    i.circle(32, 40, 18, RED)
    i.circle(32, 40, 6, YELLOW, 3.5)
    i.ink([(32, 34), (34, 20), (30, 10), (36, 4)], False, True, 3.0)
    return i


def teddy():
    i = Icon(border=True)
    i.circle(20, 16, 7, KRAFT)
    i.circle(44, 16, 7, KRAFT)
    i.circle(32, 26, 14, KRAFT)
    i.shape([(18, 40), (46, 40), (48, 58), (16, 58)], KRAFT, True)
    i.dot(27, 24, 2.4)
    i.dot(37, 24, 2.4)
    i.dot(32, 31, 2.8)
    return i


def ticket():
    i = Icon(border=True)
    i.shape([(6, 20), (58, 20), (58, 28), (54, 32), (58, 36), (58, 44), (6, 44), (6, 36), (10, 32), (6, 28)], GOLD)
    for x in (22, 42):
        i.line((x, 22), (x, 42), 2.5)
    i.shape([(32, 26), (34, 30), (38, 31), (35, 34), (36, 38), (32, 36), (28, 38), (29, 34), (26, 31), (30, 30)], WHITE, width=2.5)
    return i


def citizen(kind, color):
    """Paper-doll people, cut out with scissors (the white edge), who hop away from fires."""
    i = Icon(border=True)
    i.circle(32, 14, 8, PALE)
    if kind == 0:
        i.shape([(32, 23), (44, 50), (20, 50)], color)
        i.line((26, 50), (26, 60), 4.0)
        i.line((38, 50), (38, 60), 4.0)
    elif kind == 1:
        i.shape([(24, 23), (40, 23), (40, 44), (24, 44)], color)
        i.line((28, 44), (27, 60), 4.0)
        i.line((36, 44), (37, 60), 4.0)
        i.shape([(41, 34), (50, 34), (50, 42), (41, 42)], KRAFT_D, width=3.0)
    else:
        i.shape([(25, 23), (39, 23), (40, 46), (24, 46)], color)
        i.line((28, 46), (24, 60), 4.0)
        i.line((36, 46), (40, 60), 4.0)
        i.line((25, 28), (14, 20), 4.0)
        i.line((39, 28), (50, 20), 4.0)
    i.dot(29, 13, 1.6)
    i.dot(35, 13, 1.6)
    i.ink([(29, 17), (32, 18.5), (35, 17)], False, True, 2.0)
    if kind == 0:
        i.shape([(22, 8), (42, 8), (38, 4), (26, 4)], RED, width=3.0)
    return i


def jar():
    i = Icon()
    i.shape([(16, 16), (48, 16), (50, 58), (14, 58)], SKY)
    i.shape([(18, 8), (46, 8), (46, 16), (18, 16)], RED)
    for (x, y) in ((24, 46), (36, 48), (30, 38), (40, 36), (22, 30)):
        i.circle(x, y, 5, YELLOW, 3.0, 10)
    return i


def shoebox():
    i = Icon()
    i.shape([(6, 30), (58, 30), (58, 56), (6, 56)], BLUE)
    i.shape([(4, 22), (60, 22), (60, 30), (4, 30)], SKY)
    for x in (16, 28, 40):
        i.circle(x + 4, 16, 6, YELLOW, 3.0, 10)
    return i


def finds():
    """The shoebox the finds go in, lid pushed back, a duck and a stripy sock poking out."""
    i = Icon()
    i.shape([(10, 30), (54, 30), (60, 16), (16, 12)], RED, width=4.0)
    i.circle(26, 28, 8, YELLOW, 4.0, 12)
    i.shape([(31, 27), (38, 28), (32, 31)], ORANGE, width=2.6)
    i.dot(25, 26, 1.8)
    i.shape([(40, 14), (48, 14), (48, 32), (40, 32)], WHITE, width=3.5)
    i.line((40, 20), (48, 20), 3.0, RED)
    i.line((40, 26), (48, 26), 3.0, RED)
    i.shape([(8, 34), (56, 34), (54, 58), (10, 58)], KRAFT)
    i.fill([(20, 42), (44, 42), (44, 50), (20, 50)], WHITE)
    i.ink([(22, 46), (42, 46)], False, False, 2.4)
    return i


def sock_coins():
    i = sock()
    i.border = False
    i.circle(44, 10, 6, YELLOW, 3.0, 10)
    i.circle(52, 18, 5, YELLOW, 3.0, 10)
    return i


def arrow():
    i = Icon()
    i.shape([(8, 26), (36, 26), (36, 14), (58, 32), (36, 50), (36, 38), (8, 38)], PALE)
    return i


def hand():
    i = Icon()
    i.shape([(22, 60), (18, 36), (14, 26), (20, 24), (26, 32), (26, 10), (32, 8), (34, 28), (36, 12), (42, 12),
             (42, 30), (46, 18), (52, 20), (50, 46), (44, 60)], PALE, True)
    return i


def app_icon():
    """The app icon: a box house on fire, on kraft, with a strip of tape."""
    s = 64
    i = Icon(s)
    i.fills.append('<rect x="0" y="0" width="64" height="64" rx="10" fill="%s"/>' % "#d7ad73")
    for k in range(9):
        y = 6 + k * 7
        i.fills.append('<path d="M 0 %d L 64 %d" stroke="#c99a5f" stroke-width="1.2"/>' % (y, y + 1))
    i.shape([(12, 32), (44, 32), (44, 56), (12, 56)], "#c08a52")
    i.shape([(8, 34), (28, 14), (48, 34)], RED)
    i.fill([(18, 42), (26, 42), (26, 50), (18, 50)], SKY)
    i.ink([(18, 42), (26, 42), (26, 50), (18, 50)])
    i.fill([(32, 44), (39, 44), (39, 56), (32, 56)], BLUE)
    i.ink([(32, 56), (32, 44), (39, 44), (39, 56)], False)
    outer = [(44, 6), (54, 18), (59, 30), (56, 42), (46, 48), (36, 42), (33, 31), (38, 22), (41, 28), (42, 16)]
    i.shape(outer, ORANGE, smooth=True)
    i.shape([(46, 26), (51, 34), (50, 41), (45, 44), (40, 40), (40, 33)], YELLOW, smooth=True, width=3.5)
    i.fills.append('<path d="M -2 12 L 18 2 L 22 9 L 2 19 Z" fill="%s" opacity="0.92"/>' % TAPE)
    return i


ICONS = {
    "coin": coin, "box": box, "flame": flame, "tv": tv, "fan": fan, "magnifier": magnifier, "candle": candle,
    "blowtorch": blowtorch, "rockets": rocket, "heat": thermometer, "dry": sun, "coins": coins_stack, "glue": glue,
    "boots": boot, "windup": windup, "plane": plane, "lock": lock, "check": check, "close": close,
    "speaker": speaker, "mute": mute, "gear": gear, "gift": gift, "lens": lens, "restore": restore,
    "noads": noads, "chain": chain, "house": house, "office": office, "skyscraper": skyscraper, "castle": castle,
    "duck": duck, "sock": sock, "robot": robot, "marbles": marbles, "yoyo": yoyo, "teddy": teddy, "ticket": ticket,
    "jar": jar, "shoebox": shoebox, "finds": finds, "sock_coins": sock_coins, "arrow": arrow, "hand": hand,
    "citizen_0": lambda: citizen(0, BLUE), "citizen_1": lambda: citizen(1, GREEN),
    "citizen_2": lambda: citizen(2, ORANGE), "citizen_3": lambda: citizen(0, PINK),
    "citizen_4": lambda: citizen(1, RED), "citizen_5": lambda: citizen(2, SKY),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, make in ICONS.items():
        with open(os.path.join(OUT, name + ".svg"), "w") as f:
            f.write(make().svg())
    with open(os.path.join(ROOT, "icon.svg"), "w") as f:
        f.write(app_icon().svg())
    print("wrote %d icons and icon.svg" % len(ICONS))


if __name__ == "__main__":
    main()
