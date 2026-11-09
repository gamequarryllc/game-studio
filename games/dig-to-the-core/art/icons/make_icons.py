#!/usr/bin/env python3
"""Draws every UI icon for Dig to the Core as SVG, in one style:

  - a thick soot outline (3.4 units on a 64-unit canvas), round joins
  - flat fills from the palette (see the art bible in NOTES.md)
  - one cream highlight stroke per icon, top-left
  - a little hand wobble on every outline, so nothing is ruler-perfect

Run from the project folder: python3 art/icons/make_icons.py  (writes ui/icons/*.svg)
"""
import math
import os
import random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "ui", "icons")

SOOT = "#241C17"
CREAM = "#EFE3C8"
AMBER = "#F2B544"
BRASS = "#C08A3E"
RED = "#B5332A"
VERD = "#4FA391"
UMBER = "#6B4A2E"
STEEL = "#9AA0A6"
DSTEEL = "#4A4C50"
WOOD = "#9A6B3F"
PINK = "#E8959B"
BONE = "#EDE3CC"
GREEN = "#7BBF5A"
SKY = "#6FA8DC"
W = 3.4

_rnd = random.Random(1)


def j(v, amt=0.55):
    return v + _rnd.uniform(-amt, amt)


def pts(points, wob=True):
    return " ".join("%.1f,%.1f" % ((j(x), j(y)) if wob else (x, y)) for x, y in points)


def poly(points, fill, stroke=SOOT, sw=W, wob=True):
    return '<polygon points="%s" fill="%s" stroke="%s" stroke-width="%.1f" stroke-linejoin="round"/>' % (pts(points, wob), fill, stroke, sw)


def line(points, stroke=SOOT, sw=W, cap="round"):
    return '<polyline points="%s" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="%s" stroke-linejoin="round"/>' % (pts(points), stroke, sw, cap)


def hl(points, sw=2.2):
    return '<polyline points="%s" fill="none" stroke="%s" stroke-opacity="0.75" stroke-width="%.1f" stroke-linecap="round"/>' % (pts(points), CREAM, sw)


def circ(cx, cy, r, fill, stroke=SOOT, sw=W):
    return '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" stroke="%s" stroke-width="%.1f"/>' % (j(cx, 0.3), j(cy, 0.3), r, fill, stroke, sw)


def ell(cx, cy, rx, ry, fill, rot=0, stroke=SOOT, sw=W):
    return '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s" stroke="%s" stroke-width="%.1f" transform="rotate(%.1f %.1f %.1f)"/>' % (cx, cy, rx, ry, fill, stroke, sw, rot, cx, cy)


def path(d, fill, stroke=SOOT, sw=W):
    return '<path d="%s" fill="%s" stroke="%s" stroke-width="%.1f" stroke-linejoin="round" stroke-linecap="round"/>' % (d, fill, stroke, sw)


def rot(points, a, cx=32, cy=32):
    ca, sa = math.cos(a), math.sin(a)
    return [(cx + (x - cx) * ca - (y - cy) * sa, cy + (x - cx) * sa + (y - cy) * ca) for x, y in points]


def svg(*parts):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64">' + "".join(parts) + "</svg>")


ICONS = {}


def icon(fn):
    ICONS[fn.__name__] = fn
    return fn


# --- Core UI ------------------------------------------------------------------------------
@icon
def coin():
    return svg(circ(32, 33, 22, AMBER), circ(32, 33, 15, "none", BRASS, 2.6),
               line([(25, 40), (39, 26)], SOOT, 3.0), line([(26, 27), (32, 25), (38, 28)], SOOT, 3.0),
               hl([(18, 26), (22, 19), (28, 15)]))


@icon
def ad():
    # A picture-show ticket with a play mark.
    return svg(poly([(8, 18), (56, 14), (58, 46), (10, 50)], CREAM), circ(9, 34, 4, "#2a2018", SOOT, 0),
               circ(57, 30, 4, "#2a2018", SOOT, 0), line([(19, 17), (21, 49)], SOOT, 1.8),
               poly([(28, 24), (44, 31), (29, 40)], RED), hl([(12, 21), (30, 19)]))


@icon
def lift_up():
    return svg(poly([(14, 12), (50, 12), (50, 54), (14, 54)], DSTEEL), line([(22, 14), (22, 52)], "#7d8086", 2.2),
               line([(32, 14), (32, 52)], "#7d8086", 2.2), line([(42, 14), (42, 52)], "#7d8086", 2.2),
               poly([(32, 18), (44, 34), (37, 34), (37, 46), (27, 46), (27, 34), (20, 34)], AMBER))


@icon
def lift_down():
    return svg(poly([(14, 12), (50, 12), (50, 54), (14, 54)], DSTEEL), line([(22, 14), (22, 52)], "#7d8086", 2.2),
               line([(32, 14), (32, 52)], "#7d8086", 2.2), line([(42, 14), (42, 52)], "#7d8086", 2.2),
               poly([(32, 48), (44, 32), (37, 32), (37, 20), (27, 20), (27, 32), (20, 32)], AMBER))


@icon
def shop():
    return svg(poly([(10, 28), (32, 12), (54, 28)], "#8a9096"), poly([(14, 28), (50, 28), (50, 54), (14, 54)], WOOD),
               poly([(27, 36), (37, 36), (37, 54), (27, 54)], UMBER), poly([(17, 31), (47, 31), (47, 35), (17, 35)], CREAM, SOOT, 2.0),
               hl([(16, 26), (30, 16)]))


@icon
def lock():
    return svg(path("M22 30 V22 a10 10 0 0 1 20 0 V30", "none", SOOT, 4.5), poly([(16, 30), (48, 30), (48, 54), (16, 54)], BRASS),
               circ(32, 40, 3.5, SOOT, SOOT, 0), line([(32, 42), (32, 48)], SOOT, 3.0))


@icon
def check():
    return svg(line([(14, 34), (27, 46), (50, 18)], SOOT, 9.0), line([(14, 34), (27, 46), (50, 18)], VERD, 4.6))


@icon
def close():
    return svg(line([(18, 18), (46, 46)], SOOT, 9.0), line([(46, 18), (18, 46)], SOOT, 9.0),
               line([(18, 18), (46, 46)], CREAM, 4.4), line([(46, 18), (18, 46)], CREAM, 4.4))


@icon
def sound_on():
    return svg(poly([(10, 26), (20, 26), (32, 14), (32, 50), (20, 38), (10, 38)], BRASS),
               path("M39 24 q6 8 0 16", "none", SOOT, 3.4), path("M45 18 q11 14 0 28", "none", SOOT, 3.4))


@icon
def sound_off():
    return svg(poly([(10, 26), (20, 26), (32, 14), (32, 50), (20, 38), (10, 38)], "#7d7268"),
               line([(40, 24), (54, 40)], RED, 4.2), line([(54, 24), (40, 40)], RED, 4.2))


@icon
def restore():
    return svg(path("M46 22 A16 16 0 1 0 48 38", "none", SOOT, 5.5), path("M46 22 A16 16 0 1 0 48 38", "none", VERD, 2.6),
               poly([(40, 14), (52, 22), (40, 28)], VERD))


@icon
def gift():
    return svg(poly([(12, 28), (52, 28), (52, 54), (12, 54)], RED), poly([(10, 20), (54, 20), (54, 28), (10, 28)], RED),
               poly([(29, 20), (35, 20), (35, 54), (29, 54)], AMBER, SOOT, 2.4),
               path("M32 20 c-10 -12 -18 -2 -8 0 M32 20 c10 -12 18 -2 8 0", "none", SOOT, 3.0))


@icon
def noads():
    return svg(poly([(10, 20), (54, 17), (56, 45), (12, 48)], CREAM), poly([(28, 25), (42, 31), (29, 39)], "#9b8f80"),
               circ(32, 32, 21, "none", RED, 5.0), line([(17, 47), (47, 17)], RED, 5.0))


@icon
def golden():
    return svg(line([(16, 50), (40, 22)], SOOT, 8.0), line([(16, 50), (40, 22)], AMBER, 4.0),
               path("M22 14 Q40 6 56 24 Q42 18 30 22 Z", AMBER), hl([(28, 15), (40, 12)]),
               poly([(48, 44), (51, 50), (57, 50), (52, 54), (54, 60), (48, 56), (42, 60), (44, 54), (39, 50), (45, 50)], CREAM, SOOT, 2.0))


@icon
def unknown():
    return svg(circ(32, 32, 20, BRASS), path("M25 26 a7 7 0 1 1 10 6 q-3 2 -3 6", "none", SOOT, 4.4), circ(32, 45, 2.6, SOOT, SOOT, 0))


# --- Tools ------------------------------------------------------------------------------------
@icon
def shovel():
    return svg(line([(14, 52), (36, 28)], SOOT, 7.5), line([(14, 52), (36, 28)], WOOD, 3.8),
               path("M8 54 l4 -6 l6 6 z", WOOD), poly([(34, 26), (44, 14), (54, 12), (52, 22), (40, 32)], STEEL),
               hl([(43, 16), (51, 14)]))


@icon
def pickaxe():
    return svg(line([(14, 54), (40, 22)], SOOT, 7.5), line([(14, 54), (40, 22)], WOOD, 3.8),
               path("M14 18 Q34 6 56 22 Q40 16 30 22 Q22 18 14 18 Z", DSTEEL), hl([(20, 16), (32, 11)]))


@icon
def jackhammer():
    return svg(poly([(18, 10), (46, 10), (46, 16), (18, 16)], DSTEEL), poly([(24, 16), (40, 16), (42, 40), (22, 40)], AMBER),
               line([(22, 24), (42, 24)], SOOT, 2.2), line([(22, 31), (42, 31)], SOOT, 2.2),
               poly([(28, 40), (36, 40), (34, 50), (30, 50)], DSTEEL), line([(32, 50), (32, 60)], SOOT, 4.0), hl([(26, 19), (27, 36)]))


@icon
def drill():
    return svg(poly([(10, 20), (38, 20), (40, 34), (10, 34)], "#D96B1E"), poly([(16, 34), (26, 34), (24, 54), (14, 54)], DSTEEL),
               poly([(38, 23), (46, 23), (46, 31), (38, 31)], DSTEEL), line([(46, 27), (58, 27)], SOOT, 4.4),
               line([(48, 24), (51, 30)], SOOT, 1.6), line([(52, 24), (55, 30)], SOOT, 1.6), hl([(13, 23), (34, 23)]))


@icon
def dynamite():
    return svg(poly([(14, 22), (24, 22), (24, 54), (14, 54)], RED), poly([(27, 18), (37, 18), (37, 54), (27, 54)], RED),
               poly([(40, 22), (50, 22), (50, 54), (40, 54)], RED), line([(12, 30), (52, 30)], SOOT, 4.0), line([(12, 46), (52, 46)], SOOT, 4.0),
               path("M32 18 q2 -8 10 -10", "none", CREAM, 2.6), circ(43, 8, 2.5, AMBER, SOOT, 1.4))


@icon
def laser():
    return svg(poly([(12, 22), (42, 20), (44, 34), (12, 34)], CREAM), poly([(42, 22), (52, 24), (52, 30), (44, 32)], DSTEEL),
               poly([(18, 34), (27, 34), (24, 52), (15, 52)], DSTEEL), line([(52, 27), (60, 27)], RED, 3.4),
               poly([(16, 16), (34, 16), (34, 20), (16, 20)], VERD, SOOT, 2.2), line([(20, 22), (20, 33)], BRASS, 2.2),
               line([(32, 21), (32, 33)], BRASS, 2.2))


@icon
def borer():
    return svg(poly([(8, 18), (30, 18), (30, 46), (8, 46)], "#D96B1E"), poly([(30, 16), (58, 32), (30, 48)], STEEL),
               line([(34, 22), (40, 40)], SOOT, 2.0), line([(42, 25), (48, 37)], SOOT, 2.0), line([(8, 26), (30, 26)], SOOT, 2.0),
               line([(8, 38), (30, 38)], SOOT, 2.0), hl([(11, 21), (27, 21)]))


# --- Upgrades and helpers ----------------------------------------------------------------------
@icon
def power():
    return svg(poly([(10, 40), (54, 40), (50, 54), (14, 54)], DSTEEL), line([(20, 30), (40, 12)], SOOT, 7.0), line([(20, 30), (40, 12)], WOOD, 3.4),
               poly([(14, 26), (24, 16), (32, 24), (22, 34)], STEEL), line([(40, 34), (46, 28)], AMBER, 3.0),
               line([(44, 38), (54, 36)], AMBER, 3.0), line([(34, 34), (34, 26)], AMBER, 3.0))


@icon
def size():
    return svg(circ(32, 32, 9, AMBER), poly([(6, 32), (16, 24), (16, 40)], BRASS), poly([(58, 32), (48, 24), (48, 40)], BRASS),
               poly([(32, 6), (24, 16), (40, 16)], BRASS), poly([(32, 58), (24, 48), (40, 48)], BRASS))


@icon
def ore():
    return svg(poly([(20, 14), (44, 14), (56, 28), (32, 56), (8, 28)], VERD), line([(8, 28), (56, 28)], SOOT, 2.2),
               line([(20, 14), (26, 28), (32, 56)], SOOT, 2.2), line([(44, 14), (38, 28), (32, 56)], SOOT, 2.2),
               hl([(22, 17), (40, 17)]))


@icon
def lamp():
    return svg(path("M10 40 Q12 16 32 14 Q52 16 54 40 Z", AMBER), poly([(6, 40), (58, 40), (58, 46), (6, 46)], AMBER),
               circ(32, 26, 6, CREAM), line([(38, 22), (58, 10)], AMBER, 3.0), line([(39, 28), (60, 24)], AMBER, 3.0),
               hl([(16, 30), (22, 20)]))


@icon
def mole():
    return svg(ell(32, 38, 20, 15, "#4a3d36"), ell(32, 50, 8, 5, PINK), circ(24, 34, 2.2, SOOT, SOOT, 0), circ(40, 34, 2.2, SOOT, SOOT, 0),
               path("M14 28 Q14 10 32 10 Q50 10 50 28 Z", AMBER), poly([(10, 28), (54, 28), (54, 32), (10, 32)], AMBER),
               circ(32, 20, 4, CREAM))


@icon
def robomole():
    return svg(ell(32, 38, 20, 15, STEEL), poly([(26, 46), (38, 46), (32, 60)], BRASS), circ(24, 34, 3, RED, SOOT, 2), circ(40, 34, 3, RED, SOOT, 2),
               circ(18, 42, 1.4, SOOT, SOOT, 0), circ(46, 42, 1.4, SOOT, SOOT, 0), line([(32, 23), (32, 12)], SOOT, 2.4), circ(32, 10, 3, AMBER, SOOT, 2))


@icon
def boost():
    return svg(line([(12, 54), (36, 26)], SOOT, 7.5), line([(12, 54), (36, 26)], WOOD, 3.8),
               path("M12 22 Q30 10 50 24 Q36 18 27 24 Q20 20 12 22 Z", DSTEEL), line([(42, 36), (58, 36)], AMBER, 3.6),
               line([(46, 44), (58, 44)], AMBER, 3.6), line([(40, 52), (56, 52)], AMBER, 3.6))


@icon
def cash():
    return svg(ell(32, 48, 18, 6, AMBER), ell(32, 40, 18, 6, AMBER), ell(32, 32, 18, 6, AMBER), ell(32, 24, 18, 6, AMBER),
               hl([(18, 22), (28, 19)]))


@icon
def helper_rush():
    return svg(ell(36, 38, 18, 13, "#4a3d36"), ell(36, 48, 7, 4, PINK), path("M20 30 Q20 14 36 14 Q52 14 52 30 Z", AMBER),
               line([(4, 30), (14, 30)], AMBER, 3.4), line([(2, 40), (14, 40)], AMBER, 3.4), line([(6, 50), (16, 50)], AMBER, 3.4))


@icon
def sack():
    return svg(path("M20 22 Q8 40 16 54 L48 54 Q56 40 44 22 Z", "#B99A6B"), poly([(22, 14), (42, 14), (40, 22), (24, 22)], "#B99A6B"),
               line([(22, 22), (42, 22)], SOOT, 3.0), circ(32, 40, 7, AMBER, SOOT, 2.4))


@icon
def crate():
    return svg(poly([(10, 18), (54, 18), (54, 54), (10, 54)], WOOD), line([(10, 18), (54, 54)], UMBER, 3.0),
               poly([(14, 12), (50, 12), (54, 18), (10, 18)], AMBER), hl([(14, 22), (14, 48)]))


@icon
def cart():
    return svg(poly([(8, 20), (56, 20), (50, 44), (14, 44)], DSTEEL), poly([(12, 14), (52, 14), (56, 20), (8, 20)], AMBER),
               circ(20, 48, 6, DSTEEL), circ(44, 48, 6, DSTEEL), line([(4, 56), (60, 56)], SOOT, 3.0))


# --- Finds ---------------------------------------------------------------------------------------
@icon
def keys():
    return svg(circ(20, 22, 10, BRASS), circ(20, 22, 4, "#2a2018", SOOT, 0), line([(27, 29), (50, 52)], SOOT, 7.0), line([(27, 29), (50, 52)], BRASS, 3.4),
               line([(42, 44), (48, 38)], SOOT, 3.4), line([(47, 49), (52, 44)], SOOT, 3.4))


@icon
def cassette():
    return svg(poly([(8, 16), (56, 16), (56, 48), (8, 48)], DSTEEL), poly([(14, 21), (50, 21), (50, 36), (14, 36)], CREAM),
               circ(24, 29, 4, DSTEEL, SOOT, 2), circ(40, 29, 4, DSTEEL, SOOT, 2), poly([(18, 48), (46, 48), (42, 40), (22, 40)], "#6a6c70"))


@icon
def chest():
    return svg(path("M8 30 Q8 14 32 14 Q56 14 56 30 Z", WOOD), poly([(8, 30), (56, 30), (56, 54), (8, 54)], WOOD),
               line([(8, 30), (56, 30)], SOOT, 3.0), poly([(28, 26), (36, 26), (36, 38), (28, 38)], AMBER, SOOT, 2.4),
               line([(16, 15), (16, 54)], BRASS, 3.0), line([(48, 15), (48, 54)], BRASS, 3.0))


@icon
def subway():
    return svg(poly([(6, 16), (58, 16), (58, 46), (6, 46)], "#C8C9C0"), poly([(6, 32), (58, 32), (58, 38), (6, 38)], RED, SOOT, 2.0),
               poly([(12, 20), (24, 20), (24, 29), (12, 29)], SKY, SOOT, 2.2), poly([(28, 20), (40, 20), (40, 29), (28, 29)], SKY, SOOT, 2.2),
               poly([(44, 20), (54, 20), (54, 29), (44, 29)], SKY, SOOT, 2.2), circ(18, 50, 4, DSTEEL), circ(46, 50, 4, DSTEEL))


@icon
def sword():
    b = [(30, 6), (34, 6), (34, 40), (30, 40)]
    return svg(poly(rot(b, 0.6), STEEL), poly(rot([(22, 40), (42, 40), (42, 45), (22, 45)], 0.6), BRASS),
               poly(rot([(30, 45), (34, 45), (34, 56), (30, 56)], 0.6), UMBER), circ(*rot([(32, 58)], 0.6)[0], 3, BRASS))


@icon
def tusk():
    return svg(path("M10 52 Q14 20 46 10 Q56 10 54 16 Q28 26 22 54 Z", BONE), line([(22, 48), (28, 46)], UMBER, 2.0),
               line([(28, 36), (34, 35)], UMBER, 2.0), hl([(16, 44), (24, 26)]))


@icon
def mosquito():
    return svg(path("M32 6 Q52 30 46 46 Q40 58 32 58 Q24 58 18 46 Q12 30 32 6 Z", AMBER),
               ell(32, 40, 5, 8, UMBER, 0, SOOT, 2.0), line([(32, 32), (32, 24)], SOOT, 1.8), line([(27, 40), (20, 34)], SOOT, 1.6),
               line([(37, 40), (44, 34)], SOOT, 1.6), line([(27, 44), (20, 48)], SOOT, 1.6), line([(37, 44), (44, 48)], SOOT, 1.6),
               hl([(26, 18), (22, 28)]))


@icon
def ammonite():
    return svg(circ(32, 32, 22, "#C9A97A"), path("M32 32 m0 -14 a14 14 0 1 1 -12 7 M32 32 m0 -7 a7 7 0 1 1 -6 3", "none", UMBER, 2.6),
               line([(32, 10), (33, 18)], UMBER, 2.0), line([(50, 26), (44, 28)], UMBER, 2.0), line([(46, 46), (41, 41)], UMBER, 2.0))


@icon
def trex():
    return svg(path("M8 30 Q10 12 30 12 Q48 12 56 24 L56 36 Q44 38 40 44 L30 44 Q26 52 14 50 Q6 44 8 30 Z", BONE),
               circ(26, 24, 5, "#2a2018", SOOT, 2), poly([(40, 36), (43, 42), (46, 36)], CREAM, SOOT, 1.6),
               poly([(47, 36), (50, 41), (53, 36)], CREAM, SOOT, 1.6), circ(48, 22, 2, "#2a2018", SOOT, 0))


@icon
def egg():
    return svg(path("M32 8 Q50 8 50 36 Q50 56 32 56 Q14 56 14 36 Q14 8 32 8 Z", "#E9DEC4"), circ(26, 28, 2.5, UMBER, SOOT, 0),
               circ(38, 38, 3, UMBER, SOOT, 0), circ(30, 46, 2, UMBER, SOOT, 0), hl([(22, 20), (20, 30)]))


@icon
def alien_egg():
    return svg(circ(32, 34, 26, "#3E6E5B", "none", 0), path("M32 8 Q50 8 50 36 Q50 56 32 56 Q14 56 14 36 Q14 8 32 8 Z", GREEN),
               circ(26, 30, 3.5, "#C8F27A", SOOT, 2), circ(38, 40, 4, "#C8F27A", SOOT, 2), circ(30, 46, 2.5, "#C8F27A", SOOT, 2))


@icon
def geode():
    return svg(path("M8 40 Q8 14 32 12 Q56 14 56 40 Q48 54 32 54 Q16 54 8 40 Z", "#7d7268"),
               path("M16 40 Q16 22 32 20 Q48 22 48 40 Q40 48 32 48 Q24 48 16 40 Z", "#7B4FB8"),
               poly([(24, 40), (28, 26), (32, 40)], "#C9A6F2", SOOT, 1.8), poly([(32, 42), (37, 24), (42, 40)], "#C9A6F2", SOOT, 1.8))


@icon
def scale():
    return svg(path("M32 6 Q56 18 50 42 Q44 58 32 58 Q20 58 14 42 Q8 18 32 6 Z", RED), path("M32 14 Q46 22 42 40 Q38 50 32 50", "none", AMBER, 2.4),
               line([(32, 14), (32, 52)], SOOT, 2.0))


@icon
def crown():
    return svg(poly([(8, 46), (10, 18), (22, 32), (32, 12), (42, 32), (54, 18), (56, 46)], AMBER),
               poly([(8, 46), (56, 46), (56, 54), (8, 54)], BRASS), circ(32, 40, 3.5, RED, SOOT, 2), circ(18, 40, 2.6, VERD, SOOT, 2),
               circ(46, 40, 2.6, VERD, SOOT, 2))


@icon
def satellite():
    return svg(poly(rot([(24, 26), (40, 26), (40, 38), (24, 38)], 0.5), STEEL), poly(rot([(4, 28), (22, 28), (22, 36), (4, 36)], 0.5), SKY),
               poly(rot([(42, 28), (60, 28), (60, 36), (42, 36)], 0.5), SKY), line(rot([(32, 26), (32, 14)], 0.5), SOOT, 2.4),
               circ(*rot([(32, 12)], 0.5)[0], 3, RED, SOOT, 2))


@icon
def core():
    rays = []
    for k in range(12):
        a = k / 12 * math.tau
        rays.append(line([(32 + math.cos(a) * 20, 32 + math.sin(a) * 20), (32 + math.cos(a) * 29, 32 + math.sin(a) * 29)], AMBER, 3.4))
    return svg(*rays, circ(32, 32, 17, AMBER), circ(32, 32, 10, CREAM, BRASS, 2.0))


# Ore nugget: drawn neutral, tinted per ore in the game.
@icon
def nugget():
    return svg(poly([(14, 30), (24, 16), (42, 14), (54, 28), (48, 48), (26, 52), (12, 42)], "#EEEEEE"),
               line([(24, 16), (30, 32), (48, 48)], "#888888", 2.0), line([(30, 32), (12, 42)], "#888888", 2.0), hl([(18, 28), (26, 19)]))


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in ICONS.items():
        _rnd.seed(sum(ord(c) * (i + 1) for i, c in enumerate(name)))
        with open(os.path.join(OUT, name + ".svg"), "w") as f:
            f.write(fn())
    print("wrote %d icons to %s" % (len(ICONS), os.path.normpath(OUT)))


if __name__ == "__main__":
    main()
