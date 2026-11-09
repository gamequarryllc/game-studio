#!/usr/bin/env python3
"""Draws the marker sheet: every window, door, box label and doodle that the
city's cardboard is drawn on with, as if someone went round with felt-tip pens.

    python3 art/textures/make_marker_sheet.py

Writes models/marker_sheet.png (RGBA, ink on transparent) and
art/textures/marker_sheet.json (name -> [u0, v0, u1, v1], v down, for the
Blender scripts that map decals onto the models).

Everything is drawn as wobbly strokes with overshoot at the corners and
scribbled fills that never quite stay inside the lines, so no two windows
match. Seeded, so it rebuilds the same.
"""
import json
import math
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT_PNG = os.path.join(ROOT, "models", "marker_sheet.png")
OUT_JSON = os.path.join(HERE, "marker_sheet.json")
FONT = os.path.join(ROOT, "fonts", "PermanentMarker-Regular.ttf")
SIZE = 1024          # width
SIZE_H = 1280        # height
SS = 2  # supersampling

INK = (34, 29, 27, 245)
BLUE = (44, 96, 196, 205)
SKY = (110, 170, 225, 190)
YELLOW = (250, 204, 64, 215)
RED = (206, 48, 38, 225)
GREEN = (62, 148, 72, 210)
ORANGE = (240, 128, 40, 215)
WHITE = (250, 247, 238, 235)

rng = random.Random(20261110)


# =====================================================================================
# Strokes
# =====================================================================================
def wobble(points, amp, step=10.0):
    """Subdivide a polyline and push it about a little: a hand, not a ruler."""
    out = []
    phase = rng.uniform(0, 6.28)
    freq = rng.uniform(0.04, 0.09)
    walked = 0.0
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length, dx / length
        n = max(1, int(length / step))
        for k in range(n):
            t = k / n
            w = math.sin(phase + (walked + t * length) * freq) * amp + rng.uniform(-amp, amp) * 0.25
            out.append((x0 + dx * t + nx * w, y0 + dy * t + ny * w))
        walked += length
    out.append(points[-1])
    return out


def stroke(d, pts, width, color, amp=1.2):
    pts = [(x * SS, y * SS) for x, y in pts]
    pts = wobble(pts, amp * SS, 8.0 * SS)
    w = int(width * SS)
    d.line(pts, fill=color, width=w, joint="curve")
    r = w / 2
    for x, y in (pts[0], pts[-1]):
        d.ellipse((x - r, y - r, x + r, y + r), fill=color)


def line(d, a, b, width=5, color=INK, over=0.0, amp=1.0):
    """A quick straight stroke; `over` makes it run past its ends like a fast hand."""
    (x0, y0), (x1, y1) = a, b
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy) or 1.0
    ux, uy = dx / length, dy / length
    o0 = over * rng.uniform(0.2, 1.0)
    o1 = over * rng.uniform(0.2, 1.0)
    stroke(d, [(x0 - ux * o0, y0 - uy * o0), (x1 + ux * o1, y1 + uy * o1)], width, color, amp)


def box(d, x0, y0, x1, y1, width=5, color=INK, over=4.0):
    j = lambda: rng.uniform(-1.5, 1.5)
    line(d, (x0 + j(), y0 + j()), (x1 + j(), y0 + j()), width, color, over)
    line(d, (x1 + j(), y0 + j()), (x1 + j(), y1 + j()), width, color, over)
    line(d, (x1 + j(), y1 + j()), (x0 + j(), y1 + j()), width, color, over)
    line(d, (x0 + j(), y1 + j()), (x0 + j(), y0 + j()), width, color, over)


def circle(d, cx, cy, r, width=5, color=INK, close=1.12):
    a0 = rng.uniform(0, 6.28)
    pts = []
    n = 28
    for k in range(int(n * close) + 1):
        a = a0 + 6.2832 * k / n
        rr = r * (1.0 + rng.uniform(-0.03, 0.03))
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    stroke(d, pts, width, color, 0.6)


def arc(d, cx, cy, r, a0, a1, width=5, color=INK):
    pts = []
    n = 18
    for k in range(n + 1):
        a = a0 + (a1 - a0) * k / n
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    stroke(d, pts, width, color, 0.6)


def scribble(img, poly, color, gap=7.0, width=6, angle=None):
    """Fill a shape with zig-zag marker strokes, clipped to it (with a little bleed)."""
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    ang = math.radians(angle if angle is not None else rng.uniform(25, 65))
    ca, sa = math.cos(ang), math.sin(ang)
    span = math.hypot(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    pts = []
    t = -span / 2
    side = 1
    while t < span / 2:
        px = cx + ca * t - sa * side * span / 2
        py = cy + sa * t + ca * side * span / 2
        pts.append((px, py))
        t += gap * rng.uniform(0.8, 1.2)
        side = -side
    stroke(ld, pts, width, color, 0.8)
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    bleed = [(x * SS + rng.uniform(-2, 2) * SS, y * SS + rng.uniform(-2, 2) * SS) for x, y in poly]
    md.polygon(bleed, fill=255)
    layer.putalpha(ImageChops.multiply(layer.getchannel("A"), mask))
    img.alpha_composite(layer)


def rect_poly(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def text(img, s, cx, cy, size, color=INK, angle=0.0):
    font = ImageFont.truetype(FONT, int(size * SS))
    bbox = font.getbbox(s)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    layer = Image.new("RGBA", (tw + 40 * SS, th + 40 * SS), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((20 * SS - bbox[0], 20 * SS - bbox[1]), s, font=font, fill=color)
    layer = layer.rotate(angle, resample=Image.BICUBIC, expand=True)
    img.alpha_composite(layer, (int(cx * SS - layer.width / 2), int(cy * SS - layer.height / 2)))


# =====================================================================================
# Drawings. Each is f(img, draw, w, h) on a w x h canvas (in sheet pixels).
# =====================================================================================
def window(img, d, w, h, fill=None, panes=4, curtains=False):
    m = 10
    if fill:
        scribble(img, rect_poly(m + 2, m + 2, w - m - 2, h - m - 2), fill, gap=8)
    if curtains:
        scribble(img, [(m, m), (m + w * 0.3, m), (m, h - m)], RED, gap=6, width=5)
        scribble(img, [(w - m, m), (w - m - w * 0.3, m), (w - m, h - m)], RED, gap=6, width=5)
    box(d, m, m, w - m, h - m, 6)
    if panes >= 2:
        line(d, (w / 2, m), (w / 2, h - m), 4, INK, 1.0)
    if panes >= 4:
        line(d, (m, h / 2), (w - m, h / 2), 4, INK, 1.0)
    line(d, (m - 4, h - m + 6), (w - m + 4, h - m + 6), 5, INK, 3)  # the sill


def win_round(img, d, w, h):
    r = min(w, h) / 2 - 12
    poly = [(w / 2 + math.cos(a / 10) * r, h / 2 + math.sin(a / 10) * r) for a in range(63)]
    scribble(img, poly, SKY, gap=7)
    circle(d, w / 2, h / 2, r, 6)
    line(d, (w / 2 - r, h / 2), (w / 2 + r, h / 2), 4)
    line(d, (w / 2, h / 2 - r), (w / 2, h / 2 + r), 4)


def win_arch(img, d, w, h):
    m = 10
    r = (w - 2 * m) / 2
    top = m + r
    poly = [(m, h - m), (m, top)] + [(w / 2 - math.cos(a / 12 * math.pi) * r, top - math.sin(a / 12 * math.pi) * r)
                                     for a in range(13)] + [(w - m, top), (w - m, h - m)]
    scribble(img, poly, YELLOW, gap=7)
    arc(d, w / 2, top, r, math.pi, 2 * math.pi, 6)
    line(d, (m, top), (m, h - m), 6, INK, 2)
    line(d, (w - m, top), (w - m, h - m), 6, INK, 2)
    line(d, (m, h - m), (w - m, h - m), 6, INK, 3)
    line(d, (w / 2, m + 4), (w / 2, h - m), 4)


def door(img, d, w, h, color, glass=False):
    m = 10
    scribble(img, rect_poly(m, m + 4, w - m, h - 2), color, gap=7)
    line(d, (m, h), (m, m), 6, INK, 3)
    line(d, (m, m), (w - m, m), 6, INK, 3)
    line(d, (w - m, m), (w - m, h), 6, INK, 3)
    if glass:
        box(d, m + 12, m + 14, w - m - 12, h * 0.45, 4, INK, 2)
    circle(d, w - m - 14, h * 0.58, 4, 5, INK)


def door_shop(img, d, w, h):
    m = 8
    scribble(img, rect_poly(m, m, w - m, h - 2), SKY, gap=9)
    line(d, (m, h), (m, m), 6, INK, 3)
    line(d, (m, m), (w - m, m), 6, INK, 3)
    line(d, (w - m, m), (w - m, h), 6, INK, 3)
    line(d, (w / 2, m), (w / 2, h), 5, INK, 1)
    line(d, (w / 2 - 14, h * 0.55), (w / 2 - 6, h * 0.55), 5)
    line(d, (w / 2 + 6, h * 0.55), (w / 2 + 14, h * 0.55), 5)


def garage(img, d, w, h):
    m = 8
    box(d, m, m, w - m, h - 2, 6)
    for k in range(1, 5):
        y = m + (h - m) * k / 5
        line(d, (m + 6, y), (w - m - 6, y), 3, INK, 1)


def office_row(img, d, w, h, kind):
    n = 4 if kind == "a" else 3
    gap = 14
    ww = (w - gap * (n + 1)) / n
    for k in range(n):
        x0 = gap + k * (ww + gap)
        if kind == "a":
            col = YELLOW if rng.random() < 0.4 else (SKY if rng.random() < 0.5 else None)
            if col:
                scribble(img, rect_poly(x0 + 3, 14, x0 + ww - 3, h - 14), col, gap=8)
            box(d, x0, 12, x0 + ww, h - 12, 5)
            line(d, (x0 + ww / 2, 12), (x0 + ww / 2, h - 12), 3)
        elif kind == "b":
            scribble(img, rect_poly(x0 + 3, 14, x0 + ww - 3, h - 14), SKY, gap=10)
            box(d, x0, 12, x0 + ww, h - 12, 5)
            for j in range(1, 4):
                y = 12 + (h - 24) * j / 4
                line(d, (x0 + 4, y), (x0 + ww - 4, y), 2, INK, 0)
    if kind == "c":
        scribble(img, rect_poly(10, 16, w - 10, h - 16), BLUE, gap=9, angle=80)
        line(d, (6, 14), (w - 6, 14), 6, INK, 6)
        line(d, (6, h - 14), (w - 6, h - 14), 6, INK, 6)
        for k in range(1, 6):
            x = 10 + (w - 20) * k / 6
            line(d, (x, 14), (x, h - 14), 3, INK, 0)


def sky_grid(img, d, w, h, kind):
    if kind == "a":
        cols, rows = 5, 2
        for r in range(rows):
            for c in range(cols):
                x0 = 10 + c * (w - 20) / cols
                y0 = 10 + r * (h - 20) / rows
                x1 = x0 + (w - 20) / cols - 10
                y1 = y0 + (h - 20) / rows - 12
                if rng.random() < 0.3:
                    scribble(img, rect_poly(x0 + 2, y0 + 2, x1 - 2, y1 - 2), YELLOW, gap=7, width=5)
                box(d, x0, y0, x1, y1, 4, INK, 2)
    else:
        for c in range(6):
            x0 = 12 + c * (w - 24) / 6
            x1 = x0 + (w - 24) / 6 - 14
            scribble(img, rect_poly(x0, 8, x1, h - 8), SKY if c % 2 else BLUE, gap=8, angle=85)
            line(d, (x0, 6), (x0, h - 6), 4, INK, 4)
            line(d, (x1, 6), (x1, h - 6), 4, INK, 4)


def bricks(img, d, w, h):
    rows = 4
    bh = h / rows
    for r in range(rows):
        y = r * bh
        line(d, (0, y + bh), (w, y + bh), 4, INK, 0, 1.4)
        off = (bh * 1.0) if r % 2 else 0
        x = off
        while x < w:
            if rng.random() < 0.85:
                line(d, (x, y + 6), (x, y + bh - 4), 4, INK, 0)
            x += bh * 2.0 * rng.uniform(0.9, 1.1)


def arrow_slit(img, d, w, h):
    scribble(img, rect_poly(w / 2 - 7, 14, w / 2 + 7, h - 14), INK, gap=4, width=5, angle=90)
    line(d, (w / 2 - 16, h / 2), (w / 2 + 16, h / 2), 6, INK, 2)


def portcullis(img, d, w, h):
    m = 12
    r = (w - 2 * m) / 2
    top = m + r
    poly = [(m, h), (m, top)] + [(w / 2 - math.cos(a / 12 * math.pi) * r, top - math.sin(a / 12 * math.pi) * r)
                                 for a in range(13)] + [(w - m, top), (w - m, h)]
    scribble(img, poly, (40, 34, 30, 180), gap=9)
    arc(d, w / 2, top, r, math.pi, 2 * math.pi, 7)
    line(d, (m, top), (m, h), 7, INK, 2)
    line(d, (w - m, top), (w - m, h), 7, INK, 2)
    for k in range(1, 5):
        x = m + (w - 2 * m) * k / 5
        line(d, (x, top - r * 0.8 * math.sin(math.acos(abs(x - w / 2) / r)) + 6), (x, h - 6), 5, (200, 180, 120, 255), 0)
    for k in range(1, 4):
        y = top + (h - top) * k / 4
        line(d, (m + 4, y), (w - m - 4, y), 5, (200, 180, 120, 255), 0)


def label(img, d, w, h, s, color=INK, boxed=False, angle=None):
    a = angle if angle is not None else rng.uniform(-6, 6)
    size = min(h * 0.62, w / (len(s) * 0.62 + 0.5))
    text(img, s, w / 2, h / 2, size, color, a)
    if boxed:
        box(d, 8, 8, w - 8, h - 8, 5, color, 6)


def arrows_up(img, d, w, h):
    for cx in (w * 0.3, w * 0.7):
        line(d, (cx, h - 14), (cx, 22), 7, INK, 0)
        line(d, (cx - 18, 42), (cx, 18), 7, INK, 2)
        line(d, (cx + 18, 42), (cx, 18), 7, INK, 2)
    line(d, (16, h - 10), (w - 16, h - 10), 6, INK, 4)


def glass_icon(img, d, w, h):
    cx = w / 2
    stroke(d, [(cx - 26, 16), (cx - 22, 48), (cx, 62), (cx + 22, 48), (cx + 26, 16)], 6, RED)
    line(d, (cx - 26, 16), (cx + 26, 16), 6, RED, 2)
    line(d, (cx, 62), (cx, h - 26), 6, RED, 0)
    line(d, (cx - 20, h - 18), (cx + 20, h - 18), 6, RED, 2)
    line(d, (cx - 6, 24), (cx + 4, 40), 5, RED, 0)  # the crack


def recycle(img, d, w, h):
    cx, cy, r = w / 2, h / 2 + 4, w * 0.36
    for k in range(3):
        a0 = -math.pi / 2 + k * 2.094 + 0.35
        a1 = a0 + 1.4
        arc(d, cx, cy, r, a0, a1, 7, GREEN)
        ex, ey = cx + math.cos(a1) * r, cy + math.sin(a1) * r
        tx, ty = -math.sin(a1), math.cos(a1)
        line(d, (ex, ey), (ex - tx * 14 + math.cos(a1) * 9, ey - ty * 14 + math.sin(a1) * 9), 6, GREEN, 0)
        line(d, (ex, ey), (ex - tx * 14 - math.cos(a1) * 9, ey - ty * 14 - math.sin(a1) * 9), 6, GREEN, 0)


def car_windows(img, d, w, h):
    for x0, x1 in ((14, w / 2 - 6), (w / 2 + 6, w - 14)):
        poly = [(x0 + 10, 12), (x1, 12), (x1, h - 12), (x0, h - 12)]
        scribble(img, poly, SKY, gap=7)
        stroke(d, poly + [poly[0]], 5, INK, 0.8)


def car_face(img, d, w, h):
    circle(d, 24, h / 2, 13, 5)
    circle(d, w - 24, h / 2, 13, 5)
    scribble(img, [(18, h / 2 - 8), (30, h / 2 - 8), (30, h / 2 + 8), (18, h / 2 + 8)], YELLOW, gap=5, width=4)
    scribble(img, [(w - 30, h / 2 - 8), (w - 18, h / 2 - 8), (w - 18, h / 2 + 8), (w - 30, h / 2 + 8)], YELLOW, gap=5, width=4)
    for k in range(4):
        x = w / 2 - 22 + k * 15
        line(d, (x, h / 2 - 12), (x, h / 2 + 12), 4, INK, 0)


def doodle(img, d, w, h, kind):
    cx, cy = w / 2, h / 2
    if kind == "heart":
        pts = []
        for k in range(25):
            t = math.pi * 2 * k / 24
            x = 16 * math.sin(t) ** 3
            y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
            pts.append((cx + x * 1.4, cy + y * 1.4))
        scribble(img, pts, RED, gap=6, width=5)
        stroke(d, pts, 5, INK, 0.5)
    elif kind == "star":
        pts = []
        for k in range(11):
            a = -math.pi / 2 + k * math.pi / 5
            r = 26 if k % 2 == 0 else 11
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
        scribble(img, pts, YELLOW, gap=5, width=5)
        stroke(d, pts, 5, INK, 0.5)
    elif kind == "smiley":
        circle(d, cx, cy, 24, 5)
        line(d, (cx - 9, cy - 8), (cx - 9, cy - 3), 6, INK, 0)
        line(d, (cx + 9, cy - 8), (cx + 9, cy - 3), 6, INK, 0)
        arc(d, cx, cy + 2, 13, 0.3, math.pi - 0.3, 5)
    elif kind == "sun":
        circle(d, cx, cy, 14, 6, ORANGE)
        for k in range(8):
            a = k * math.pi / 4 + 0.2
            line(d, (cx + math.cos(a) * 20, cy + math.sin(a) * 20), (cx + math.cos(a) * 28, cy + math.sin(a) * 28), 5, ORANGE, 0)


def crown(img, d, w, h):
    pts = [(14, h - 16), (14, 26), (w * 0.3, 46), (w / 2, 16), (w * 0.7, 46), (w - 14, 26), (w - 14, h - 16)]
    scribble(img, pts, YELLOW, gap=6)
    stroke(d, pts + [pts[0]], 6, INK, 0.6)


def awning(img, d, w, h):
    n = 6
    for k in range(n):
        x0 = k * w / n
        if k % 2 == 0:
            scribble(img, rect_poly(x0, 4, x0 + w / n, h - 4), RED, gap=3.5, width=7, angle=80)
    line(d, (0, h - 6), (w, h - 6), 5, INK, 0)


# name -> (w, h, painter)
ITEMS = [
    ("win_blue", 96, 96, lambda i, d, w, h: window(i, d, w, h, BLUE)),
    ("win_lit", 96, 96, lambda i, d, w, h: window(i, d, w, h, YELLOW)),
    ("win_plain", 96, 96, lambda i, d, w, h: window(i, d, w, h, None)),
    ("win_sky", 96, 96, lambda i, d, w, h: window(i, d, w, h, SKY, 2)),
    ("win_curtain", 88, 112, lambda i, d, w, h: window(i, d, w, h, YELLOW, 2, True)),
    ("win_round", 96, 96, win_round),
    ("win_arch", 80, 120, win_arch),
    ("door_red", 80, 128, lambda i, d, w, h: door(i, d, w, h, RED)),
    ("door_blue", 80, 128, lambda i, d, w, h: door(i, d, w, h, BLUE, True)),
    ("door_green", 80, 128, lambda i, d, w, h: door(i, d, w, h, GREEN)),
    ("door_shop", 128, 128, door_shop),
    ("garage", 128, 96, garage),
    ("office_a", 256, 80, lambda i, d, w, h: office_row(i, d, w, h, "a")),
    ("office_a2", 256, 80, lambda i, d, w, h: office_row(i, d, w, h, "a")),
    ("office_b", 256, 80, lambda i, d, w, h: office_row(i, d, w, h, "b")),
    ("office_c", 256, 80, lambda i, d, w, h: office_row(i, d, w, h, "c")),
    ("sky_a", 256, 128, lambda i, d, w, h: sky_grid(i, d, w, h, "a")),
    ("sky_a2", 256, 128, lambda i, d, w, h: sky_grid(i, d, w, h, "a")),
    ("sky_b", 256, 128, lambda i, d, w, h: sky_grid(i, d, w, h, "b")),
    ("bricks", 256, 128, bricks),
    ("bricks2", 256, 128, bricks),
    ("arrow_slit", 48, 112, arrow_slit),
    ("portcullis", 160, 192, portcullis),
    ("lbl_kitchen", 256, 96, lambda i, d, w, h: label(i, d, w, h, "KITCHEN")),
    ("lbl_books", 256, 96, lambda i, d, w, h: label(i, d, w, h, "BOOKS")),
    ("lbl_misc", 256, 96, lambda i, d, w, h: label(i, d, w, h, "MISC.")),
    ("lbl_xmas", 256, 96, lambda i, d, w, h: label(i, d, w, h, "XMAS DECS", RED)),
    ("lbl_donot", 256, 96, lambda i, d, w, h: label(i, d, w, h, "DO NOT OPEN", RED)),
    ("lbl_fragile", 256, 96, lambda i, d, w, h: label(i, d, w, h, "FRAGILE", RED, True, 0)),
    ("lbl_thisway", 256, 96, lambda i, d, w, h: label(i, d, w, h, "THIS WAY UP")),
    ("lbl_shoes", 256, 96, lambda i, d, w, h: label(i, d, w, h, "SHOES 9½")),
    ("lbl_bakery", 256, 96, lambda i, d, w, h: label(i, d, w, h, "BAKERY", RED, False, -2)),
    ("lbl_cafe", 256, 96, lambda i, d, w, h: label(i, d, w, h, "CAFE", BLUE, False, 3)),
    ("lbl_toys", 256, 96, lambda i, d, w, h: label(i, d, w, h, "TOYS", GREEN, False, -3)),
    ("lbl_bank", 256, 96, lambda i, d, w, h: label(i, d, w, h, "BANK", INK, True, 0)),
    ("lbl_hotel", 256, 96, lambda i, d, w, h: label(i, d, w, h, "HOTEL", RED, False, 0)),
    ("lbl_lofts", 256, 96, lambda i, d, w, h: label(i, d, w, h, "LOFTS", INK, False, 0)),
    ("lbl_taxi", 192, 72, lambda i, d, w, h: label(i, d, w, h, "TAXI", INK, False, 0)),
    ("lbl_fire", 256, 80, lambda i, d, w, h: label(i, d, w, h, "FIRE DEPT", WHITE, False, 0)),
    ("lbl_no7", 128, 96, lambda i, d, w, h: label(i, d, w, h, "No.7")),
    ("lbl_21", 128, 96, lambda i, d, w, h: label(i, d, w, h, "21")),
    ("arrows_up", 128, 128, arrows_up),
    ("glass", 96, 128, glass_icon),
    ("recycle", 112, 112, recycle),
    ("car_windows", 192, 80, car_windows),
    ("car_face", 128, 64, car_face),
    ("heart", 72, 72, lambda i, d, w, h: doodle(i, d, w, h, "heart")),
    ("star", 72, 72, lambda i, d, w, h: doodle(i, d, w, h, "star")),
    ("smiley", 72, 72, lambda i, d, w, h: doodle(i, d, w, h, "smiley")),
    ("sun", 72, 72, lambda i, d, w, h: doodle(i, d, w, h, "sun")),
    ("crown", 128, 96, crown),
    ("awning", 192, 48, awning),
]


def main():
    sheet = Image.new("RGBA", (SIZE * SS, SIZE_H * SS), (0, 0, 0, 0))
    uv = {}
    x = y = 0
    row_h = 0
    pad = 6
    for name, w, h, paint in sorted(ITEMS, key=lambda it: (-it[2], -it[1])):
        if x + w + pad > SIZE:
            x = 0
            y += row_h + pad
            row_h = 0
        if y + h > SIZE_H:
            raise SystemExit("marker sheet is full")
        cell = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
        paint(cell, ImageDraw.Draw(cell), w, h)
        sheet.alpha_composite(cell, (x * SS, y * SS))
        uv[name] = [x / SIZE, y / SIZE_H, (x + w) / SIZE, (y + h) / SIZE_H]
        x += w + pad
        row_h = max(row_h, h)
    sheet = sheet.resize((SIZE, SIZE_H), Image.LANCZOS)
    # Ink bleeds a touch: spread colour into the transparent pixels so mipmaps don't go dark at edges.
    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    sheet.save(OUT_PNG)
    with open(OUT_JSON, "w") as f:
        json.dump(uv, f, indent=1, sort_keys=True)
    print("wrote", OUT_PNG, "and", OUT_JSON, "(%d drawings)" % len(uv))


if __name__ == "__main__":
    main()
