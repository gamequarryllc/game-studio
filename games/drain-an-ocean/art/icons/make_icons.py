#!/usr/bin/env python3
"""Draws every UI icon (ui/icons/*.svg) and the app icon (icon.svg).

One style for the whole game, from engraved Admiralty charts: a Chart Ink
outline about 2.5 px wide with a slightly uneven hand, flat palette fills,
and hatching instead of gradients for shade. 64x64 viewBox, exported at 96 px.
    python3 art/icons/make_icons.py
"""
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "ui", "icons"))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))

INK = "#1c2a33"
PAPER = "#f3ead3"
SAND = "#e3c48f"
TEAL = "#0f4c5c"
SHOAL = "#4fa89b"
CORAL = "#e0603f"
RUST = "#8c4425"
BRASS = "#b88a45"
FLAG_BLUE = "#1d4f7a"
FLAG_YELLOW = "#e8b740"
FLAG_RED = "#c8442f"

rnd = random.Random(1109)
SW = 2.5


def jit(a=0.45):
    return rnd.uniform(-a, a)


def wob_poly(points, closed=True, a=0.45):
    pts = [(x + jit(a), y + jit(a)) for (x, y) in points]
    d = "M %.2f %.2f " % pts[0] + " ".join("L %.2f %.2f" % p for p in pts[1:])
    return d + (" Z" if closed else "")


def circle_pts(cx, cy, r, n=28, a0=0.0, a1=math.tau):
    return [(cx + math.cos(a0 + (a1 - a0) * i / n) * r, cy + math.sin(a0 + (a1 - a0) * i / n) * r) for i in range(n + (0 if a1 - a0 >= math.tau else 1))]


def shape(points, fill, closed=True, sw=SW, a=0.45):
    return '<path d="%s" fill="%s" stroke="%s" stroke-width="%.1f" stroke-linejoin="round" stroke-linecap="round"/>' % (
        wob_poly(points, closed, a), fill if closed else "none", INK, sw)


def line(points, sw=SW, col=INK, a=0.35):
    return '<path d="%s" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" stroke-linejoin="round"/>' % (wob_poly(points, False, a), col, sw)


_clip = [0]


def hatch(points, spacing=3.2, angle=-45, sw=1.1):
    """Engraved shade: parallel lines clipped to a polygon."""
    _clip[0] += 1
    cid = "c%d" % _clip[0]
    d = wob_poly(points, True, 0.0)
    out = ['<clipPath id="%s"><path d="%s"/></clipPath><g clip-path="url(#%s)">' % (cid, d, cid)]
    a = math.radians(angle)
    ca, sa = math.cos(a), math.sin(a)
    for k in range(-30, 31):
        off = k * spacing
        x0, y0 = 32 + -sa * off - ca * 60, 32 + ca * off - sa * 60
        x1, y1 = 32 + -sa * off + ca * 60, 32 + ca * off + sa * 60
        out.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.1f" opacity="0.55"/>' % (x0, y0, x1, y1, INK, sw))
    out.append("</g>")
    return "".join(out)


def svg(body, size=96):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 64 64">' % (size, size)) + "".join(body) + "</svg>"


def rect(x, y, w, h):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


# --- Icons -----------------------------------------------------------------------------------------
def coin(cx=32, cy=32, r=22):
    b = [shape(circle_pts(cx, cy, r), SAND), hatch([p for p in circle_pts(cx, cy, r - 1, 20, -math.pi / 2, math.pi / 2)] + [(cx, cy + r)], 3.0, -40)]
    b.append(shape(circle_pts(cx, cy, r * 0.74), "none", sw=1.6))
    # an anchor stamped in the middle
    s = r / 22
    b.append(line([(cx, cy - 10 * s), (cx, cy + 10 * s)], 2.4))
    b.append(line([(cx - 6 * s, cy - 6 * s), (cx + 6 * s, cy - 6 * s)], 2.2))
    b.append(line([(cx - 9 * s, cy + 3 * s)] + [(cx + math.cos(a) * 9 * s, cy + 3 * s + math.sin(a) * 7 * s) for a in [math.radians(t) for t in range(180, -1, -20)]], 2.2))
    b.append(shape(circle_pts(cx, cy - 12 * s, 2.4 * s, 10), "none", sw=1.8))
    return b


def i_coin():
    return coin()


def i_coins():
    b = []
    for (x, y) in [(22, 40), (42, 42), (32, 26)]:
        b += coin(x, y, 15)
    return b


def i_ad():
    # a brass porthole with a play mark: "watch a short ad"
    b = [shape(circle_pts(32, 32, 25), BRASS), shape(circle_pts(32, 32, 18), TEAL)]
    for k in range(8):
        a = k * math.tau / 8
        b.append(shape(circle_pts(32 + math.cos(a) * 21.5, 32 + math.sin(a) * 21.5, 1.6, 8), INK, sw=0.8))
    b.append(shape([(27, 22), (43, 32), (27, 42)], CORAL))
    b.append(hatch(circle_pts(32, 32, 17, 20, 0.3, 2.6) + [(32, 32)], 3.0, 30))
    return b


def i_pump_1():
    # a staved bucket
    b = [shape([(16, 22), (48, 22), (44, 54), (20, 54)], SAND), hatch([(36, 22), (48, 22), (44, 54), (36, 54)], 3.0)]
    for x in (24, 32, 40):
        b.append(line([(x, 23), (x - (x - 32) * 0.12, 53)], 1.2))
    b.append(line([(17, 30), (47, 30)], 2.6, RUST))
    b.append(line([(19, 46), (45, 46)], 2.6, RUST))
    b.append(line([(16, 22)] + [(32 + math.cos(a) * 16, 22 - math.sin(a) * 14) for a in [math.radians(t) for t in range(180, -1, -15)]], 2.0))
    return b


def i_pump_2():
    b = [shape(rect(18, 46, 26, 10), PAPER), shape([(26, 46), (26, 20), (36, 20), (36, 46)], "#53616a")]
    b.append(hatch([(31, 20), (36, 20), (36, 46), (31, 46)], 2.6))
    b.append(shape(circle_pts(31, 17, 6, 14), "#53616a"))
    b.append(line([(26, 28), (14, 30), (12, 36)], 3.4))
    b.append(line([(34, 15), (54, 8)], 3.2))
    b.append(shape(rect(50, 4, 9, 6), SAND, sw=2))
    return b


def i_pump_3():
    b = [shape(rect(12, 30, 32, 22), SHOAL), hatch([(30, 30), (44, 30), (44, 52), (30, 52)], 3.0)]
    b.append(shape(rect(16, 24, 22, 7), SHOAL))
    b.append(shape(rect(36, 6, 5, 20), "#53616a"))
    b.append(shape([(33, 6), (44, 6), (38.5, 2)], "#53616a", sw=2))
    b.append(shape(circle_pts(48, 42, 10), "none"))
    for k in range(5):
        a = k * math.tau / 5
        b.append(line([(48, 42), (48 + math.cos(a) * 9, 42 + math.sin(a) * 9)], 1.6))
    b.append(shape(rect(6, 40, 8, 14), CORAL))
    return b


def i_pump_4():
    pts_o = [(32 + math.cos(a) * 22, 50 - math.sin(a) * 34) for a in [math.pi * k / 16 for k in range(17)]]
    pts_i = [(32 + math.cos(a) * 14, 50 - math.sin(a) * 26) for a in [math.pi * k / 16 for k in range(16, -1, -1)]]
    b = [shape(pts_o + pts_i, RUST), hatch(pts_o[8:] + pts_i[:9], 2.8, 20)]
    for k in (3, 8, 13):
        a = math.pi * k / 16
        b.append(line([(32 + math.cos(a) * 12, 50 - math.sin(a) * 24), (32 + math.cos(a) * 24, 50 - math.sin(a) * 36)], 3.0))
    b.append(line([(4, 58), (60, 58)], 2.0))
    return b


def i_pump_5():
    b = [shape(circle_pts(32, 34, 24), TEAL)]
    pts = []
    for i in range(60):
        t = i / 59
        a = t * math.tau * 2.3
        r = 21 * (1 - t) + 1.5
        pts.append((32 + math.cos(a) * r, 34 + math.sin(a) * r))
    b.append(line(pts, 3.2, PAPER, 0.1))
    b.append(line([(32 + math.cos(a) * 24, 34 + math.sin(a) * 24) for a in [math.radians(t) for t in range(200, 341, 10)]], 3.0, SAND))
    return b


def i_barge():
    b = [shape([(6, 40), (58, 40), (52, 52), (12, 52)], SHOAL), hatch([(34, 40), (58, 40), (52, 52), (34, 52)], 3.0)]
    b.append(shape(rect(10, 36, 44, 5), SAND, sw=2))
    b.append(shape(rect(28, 18, 6, 18), "#53616a"))
    b.append(line([(31, 18), (48, 12)], 2.8))
    b.append(line([(14, 36), (14, 14)], 2.0))
    b.append(shape([(14, 14), (24, 17), (14, 20)], CORAL, sw=1.8))
    b.append(line([(2, 57), (14, 55), (26, 57), (38, 55), (50, 57), (62, 55)], 1.8, TEAL))
    return b


def i_pool():
    rim = [(32 + math.cos(a) * (24 + 3 * math.sin(a * 5)), 34 + math.sin(a) * (17 + 2 * math.cos(a * 4))) for a in [k * math.tau / 26 for k in range(26)]]
    b = [shape(rim, "#9d8f78")]
    inner = [(32 + math.cos(a) * 18, 34 + math.sin(a) * 12) for a in [k * math.tau / 22 for k in range(22)]]
    b.append(shape(inner, SHOAL))
    b.append(line([(20, 34), (26, 32), (32, 34), (38, 32), (44, 34)], 1.6, PAPER))
    b.append('<text x="28" y="31" font-family="serif" font-style="italic" font-size="11" fill="%s">2</text>' % INK)
    return b


def i_up_power():
    b = [shape(circle_pts(32, 36, 20), PAPER), shape(circle_pts(32, 36, 20), "none")]
    for k in range(7):
        a = math.radians(150 + k * 40)
        b.append(line([(32 + math.cos(a) * 16, 36 + math.sin(a) * 16), (32 + math.cos(a) * 19, 36 + math.sin(a) * 19)], 1.6))
    b.append(line([(32, 36), (44, 24)], 3.0, RUST))
    b.append(shape(circle_pts(32, 36, 3, 8), INK, sw=1))
    b.append(shape([(50, 4), (60, 16), (54, 16), (54, 26), (46, 26), (46, 16), (40, 16)], CORAL, sw=2))
    return b


def i_up_pipe():
    b = [shape(rect(8, 24, 48, 16), RUST), hatch(rect(8, 32, 48, 8), 2.8)]
    for x in (8, 26, 44):
        b.append(shape(rect(x - 2, 19, 8, 26), "#53616a", sw=2))
    b.append(line([(4, 52), (60, 52)], 1.4))
    b.append(line([(10, 12), (54, 12)], 2.2))
    b.append(shape([(4, 12), (10, 8), (10, 16)], INK, sw=1.5))
    b.append(shape([(60, 12), (54, 8), (54, 16)], INK, sw=1.5))
    return b


def i_up_salvage():
    # a grapnel hook
    b = [line([(32, 6), (32, 44)], 3.4)]
    b.append(shape(circle_pts(32, 6, 4, 10), "none", sw=2.6))
    for sx in (-1, 1):
        b.append(line([(32, 44)] + [(32 + sx * (1 - math.cos(a)) * 14, 44 - math.sin(a) * 14 + 14) for a in [math.radians(t) for t in range(0, 181, 30)]], 3.2))
        b.append(shape([(32 + sx * 28, 30), (32 + sx * 24, 24), (32 + sx * 31, 25)], SAND, sw=1.8))
    b.append(line([(32, 44), (32, 58)], 3.2))
    return b


def i_up_rescue():
    # a landing net
    b = [line([(8, 58), (30, 30)], 3.4, RUST)]
    rim = circle_pts(40, 22, 15, 24)
    b.append(shape(rim, "none", sw=3.0))
    net = [(25 + 4 * k, 22) for k in range(8)]
    for k in range(-3, 4):
        b.append(line([(40 + k * 4, 8 + abs(k) * 1.2), (40 + k * 2.5, 44 - abs(k) * 1.2)], 1.1))
    for k in range(-2, 3):
        b.append(line([(26, 22 + k * 5), (54, 22 + k * 5)], 1.1))
    b.append(shape([(38, 30), (46, 26), (48, 32), (40, 36)], CORAL, sw=1.6))
    return b


def i_helper_pelican():
    b = [shape([(10, 54), (14, 30), (24, 18), (34, 16), (38, 22), (32, 30), (30, 54)], PAPER)]
    b.append(shape([(36, 18), (60, 26), (56, 30), (34, 26)], SAND))
    b.append(shape([(34, 26), (56, 30), (44, 40), (34, 34)], CORAL))
    b.append(hatch([(10, 54), (14, 38), (30, 40), (30, 54)], 3.0))
    b.append(shape(circle_pts(30, 21, 2, 8), INK, sw=1))
    return b


def i_helper_crab():
    b = [shape(circle_pts(32, 40, 14, 20), CORAL), hatch(circle_pts(32, 40, 13, 14, 0.2, 2.9) + [(32, 40)], 3.0)]
    for sx in (-1, 1):
        b.append(line([(32 + sx * 10, 32), (32 + sx * 18, 20), (32 + sx * 16, 12)], 2.6))
        b.append(shape([(32 + sx * 12, 12), (32 + sx * 22, 6), (32 + sx * 24, 14), (32 + sx * 18, 18)], CORAL, sw=2))
        for k in range(3):
            b.append(line([(32 + sx * 12, 42 + k * 4), (32 + sx * 24, 46 + k * 5), (32 + sx * 26, 54 + k * 3)], 2.0))
        b.append(line([(32 + sx * 4, 28), (32 + sx * 5, 22)], 1.8))
        b.append(shape(circle_pts(32 + sx * 5, 21, 2, 8), INK, sw=1))
    b.append(shape([(20, 30), (44, 30), (40, 24), (24, 24)], FLAG_YELLOW, sw=2))
    return b


def i_flag_z():
    r = rect(8, 10, 48, 40)
    b = ['<path d="M8 10 L32 30 L56 10 Z" fill="%s"/>' % FLAG_YELLOW, '<path d="M56 10 L32 30 L56 50 Z" fill="%s"/>' % FLAG_BLUE,
         '<path d="M8 50 L32 30 L56 50 Z" fill="%s"/>' % FLAG_RED, '<path d="M8 10 L32 30 L8 50 Z" fill="%s"/>' % INK]
    b.append(shape(r, "none"))
    b.append(line([(8, 6), (8, 60)], 2.6))
    return b


def i_chest():
    b = [shape(rect(10, 28, 44, 26), "#7a4a2a"), shape([(10, 28), (12, 16), (52, 16), (54, 28)], "#7a4a2a")]
    b.append(hatch(rect(32, 16, 22, 38), 3.0))
    for x in (18, 46):
        b.append(line([(x, 16), (x, 54)], 2.6, BRASS))
    b.append(shape(rect(28, 26, 8, 9), SAND, sw=2))
    for (x, y) in [(14, 58), (22, 59), (44, 58)]:
        b.append(shape(circle_pts(x, y, 3, 8), SAND, sw=1.4))
    return b


def i_restore():
    pts = [(32 + math.cos(a) * 18, 32 + math.sin(a) * 18) for a in [math.radians(t) for t in range(-60, 241, 12)]]
    b = [line(pts, 4.0, RUST), line(pts, 1.2, SAND)]
    b.append(shape([(44, 6), (52, 18), (38, 20)], RUST, sw=2))
    return b


def i_sound():
    b = [shape([(20, 44), (22, 22), (28, 14), (36, 14), (42, 22), (44, 44), (48, 48), (16, 48)], BRASS)]
    b.append(hatch([(32, 14), (36, 14), (42, 22), (44, 44), (48, 48), (32, 48)], 2.8))
    b.append(shape(circle_pts(32, 52, 4, 10), INK, sw=1))
    b.append(shape(circle_pts(32, 10, 3, 8), "none", sw=2))
    return b


def i_clock():
    b = [shape(circle_pts(32, 36, 22), PAPER), shape(circle_pts(32, 36, 22), "none")]
    for k in range(12):
        a = k * math.tau / 12
        b.append(line([(32 + math.cos(a) * 17, 36 + math.sin(a) * 17), (32 + math.cos(a) * 20, 36 + math.sin(a) * 20)], 1.6))
    b.append(line([(32, 36), (32, 22)], 2.6))
    b.append(line([(32, 36), (42, 40)], 2.2, RUST))
    b.append(shape(rect(28, 6, 8, 7), BRASS, sw=2))
    return b


ICONS = {k[2:]: v for k, v in dict(globals()).items() if k.startswith("i_") and callable(v)}


def app_icon():
    """The app icon: a chart of a drained bay, isobath rings down to a
    swirl, a coral pennant flying from the sea wall."""
    b = ['<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64">',
         '<rect x="0" y="0" width="64" height="64" rx="12" fill="%s"/>' % TEAL]
    for k, r in enumerate([27, 21, 15.5, 10.5, 6.0]):
        pts = [(32 + math.cos(a) * r * (1 + 0.06 * math.sin(a * 3 + k)), 35 + math.sin(a) * r * 0.82 * (1 + 0.05 * math.cos(a * 4 + k))) for a in [i * math.tau / 30 for i in range(30)]]
        fill = [SAND, "#d6b47c", "#bfa071", SHOAL, TEAL][k]
        b.append(shape(pts, fill, sw=1.6))
    pts = []
    for i in range(40):
        t = i / 39
        a = t * math.tau * 1.8
        r = 5 * (1 - t) + 0.6
        pts.append((32 + math.cos(a) * r, 35 + math.sin(a) * r * 0.82))
    b.append(line(pts, 1.6, PAPER, 0.05))
    b.append(shape(rect(6, 6, 52, 5), "#9d8f78", sw=1.6))
    b.append(line([(46, 11), (46, -1)], 1.6))
    b.append(shape([(46, 0.5), (58, 3), (46, 6)], CORAL, sw=1.2))
    b.append("</svg>")
    return "".join(b)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in ICONS.items():
        with open(os.path.join(OUT, name + ".svg"), "w") as f:
            f.write(svg(fn()))
    with open(os.path.join(ROOT, "icon.svg"), "w") as f:
        f.write(app_icon())
    print("icons:", ", ".join(sorted(ICONS)))


if __name__ == "__main__":
    main()
