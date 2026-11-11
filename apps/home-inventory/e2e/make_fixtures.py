#!/usr/bin/env python3
"""Draws the test photos the browser run uploads (e2e/fixtures/*.jpg).

They are simple painted scenes, softened and given film grain so they behave
like camera photos (large, detailed JPEGs) without being anyone's real
belongings. Run again to regenerate: python3 e2e/make_fixtures.py
"""
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
W, H = 2000, 1500


def room(wall, floor, horizon=0.66, seed=1):
    img = Image.new("RGB", (W, H), wall)
    d = ImageDraw.Draw(img)
    # Wall falls off towards the corners; floor gets a few plank lines.
    for i in range(H):
        t = i / H
        if t < horizon:
            shade = int(18 * (1 - t / horizon))
            d.line([(0, i), (W, i)], fill=tuple(max(0, c - shade // 2) for c in wall))
    d.rectangle([0, int(H * horizon), W, H], fill=floor)
    rnd = random.Random(seed)
    for k in range(9):
        y = int(H * horizon) + int((H * (1 - horizon)) * (k / 9) ** 1.6)
        d.line([(0, y), (W, y)], fill=tuple(max(0, c - 14 - rnd.randint(0, 8)) for c in floor), width=3)
    d.rectangle([0, int(H * horizon) - 14, W, int(H * horizon)], fill=tuple(min(255, c + 22) for c in wall))
    return img, d


def shadow(img, box, blur=40, strength=90):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(box, fill=(0, 0, 0, strength))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    img.paste(layer, (0, 0), layer)


def finish(img, name, seed, quality=84, tilt=0.0):
    if tilt:
        img = img.rotate(tilt, resample=Image.BICUBIC, expand=False, fillcolor=img.getpixel((5, 5)))
    img = img.filter(ImageFilter.GaussianBlur(1.6))
    # Vignette, then grain.
    vig = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vig).ellipse([-W * 0.25, -H * 0.3, W * 1.25, H * 1.3], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(220))
    dark = Image.new("RGB", (W, H), (18, 14, 10))
    img = Image.composite(img, Image.blend(img, dark, 0.45), vig)
    rnd = random.Random(seed)
    noise = Image.frombytes("L", (W // 2, H // 2), bytes(rnd.randint(96, 160) for _ in range((W // 2) * (H // 2)))).resize((W, H))
    img = Image.blend(img, Image.merge("RGB", (noise, noise, noise)), 0.07)
    img.save(os.path.join(OUT, name), "JPEG", quality=quality, optimize=True)


def television():
    img, d = room((203, 196, 184), (120, 88, 62), seed=2)
    shadow(img, [330, 930, 1670, 1090])
    d.rounded_rectangle([360, 820, 1640, 1010], 14, fill=(92, 62, 42))
    for x in (360 + 320, 360 + 640, 360 + 960):
        d.line([(x, 836), (x, 994)], fill=(70, 46, 30), width=5)
    for x in (430, 1540):
        d.rectangle([x, 1010, x + 26, 1080], fill=(52, 36, 26))
    d.rounded_rectangle([470, 250, 1530, 800], 16, fill=(16, 17, 20))
    d.polygon([(500, 280), (1100, 280), (760, 770), (500, 770)], fill=(30, 33, 40))
    d.rectangle([960, 800, 1040, 822], fill=(26, 26, 28))
    d.rounded_rectangle([1560, 700, 1600, 818], 8, fill=(226, 222, 214))
    finish(img, "television.jpg", 11)


def sofa():
    img, d = room((186, 196, 190), (150, 120, 92), seed=3)
    shadow(img, [250, 1010, 1750, 1180])
    d.rounded_rectangle([280, 520, 1720, 900], 70, fill=(196, 184, 160))
    d.rounded_rectangle([250, 700, 1750, 1040], 60, fill=(208, 197, 174))
    for x in (300, 780, 1260):
        d.rounded_rectangle([x, 560, x + 440, 880], 46, fill=(214, 204, 182), outline=(184, 172, 148), width=5)
    d.rounded_rectangle([230, 640, 400, 1040], 60, fill=(200, 188, 164))
    d.rounded_rectangle([1600, 640, 1770, 1040], 60, fill=(200, 188, 164))
    d.rounded_rectangle([840, 600, 1150, 860], 40, fill=(54, 96, 80))
    for x in (330, 1640):
        d.rectangle([x, 1040, x + 30, 1110], fill=(70, 50, 36))
    finish(img, "sofa.jpg", 12)


def mixer():
    img, d = room((214, 212, 204), (176, 170, 160), horizon=0.7, seed=4)
    for x in range(0, W, 250):
        d.line([(x, 0), (x, int(H * 0.7) - 14)], fill=(198, 196, 188), width=4)
    for y in range(0, int(H * 0.7), 250):
        d.line([(0, y), (W, y)], fill=(198, 196, 188), width=4)
    shadow(img, [640, 1120, 1420, 1260])
    d.rounded_rectangle([720, 1080, 1320, 1180], 40, fill=(172, 44, 40))
    d.rounded_rectangle([1130, 560, 1300, 1120], 60, fill=(172, 44, 40))
    d.rounded_rectangle([640, 430, 1320, 660], 110, fill=(186, 52, 46))
    d.rectangle([800, 650, 860, 760], fill=(200, 200, 204))
    d.pieslice([640, 620, 1080, 1160], 0, 180, fill=(216, 218, 222))
    d.rectangle([640, 860, 1080, 900], fill=(232, 234, 238))
    d.ellipse([1180, 500, 1250, 570], fill=(232, 232, 236))
    finish(img, "mixer.jpg", 13)


def laptop():
    img, d = room((170, 178, 190), (196, 170, 132), horizon=0.62, seed=5)
    shadow(img, [420, 1020, 1580, 1160])
    d.polygon([(470, 1010), (1530, 1010), (1640, 1120), (360, 1120)], fill=(196, 198, 204))
    d.polygon([(560, 1030), (1440, 1030), (1500, 1090), (500, 1090)], fill=(120, 124, 132))
    d.rounded_rectangle([500, 380, 1500, 1010], 26, fill=(60, 62, 68))
    d.rounded_rectangle([530, 410, 1470, 980], 10, fill=(28, 52, 74))
    d.polygon([(530, 410), (1100, 410), (780, 980), (530, 980)], fill=(40, 70, 96))
    d.rounded_rectangle([1560, 860, 1700, 1040], 30, fill=(236, 232, 224))
    d.ellipse([1580, 840, 1680, 880], fill=(96, 62, 40))
    finish(img, "laptop.jpg", 14)


def bicycle():
    img, d = room((158, 160, 156), (112, 112, 110), horizon=0.74, seed=6)
    shadow(img, [380, 1110, 1620, 1210], blur=30)
    for cx in (600, 1400):
        d.ellipse([cx - 300, 560, cx + 300, 1160], outline=(24, 24, 26), width=30)
        d.ellipse([cx - 250, 610, cx + 250, 1110], outline=(170, 172, 176), width=8)
        d.ellipse([cx - 22, 838, cx + 22, 882], fill=(60, 60, 64))
    frame = (30, 84, 120)
    for a, b in (((600, 860), (900, 480)), ((900, 480), (1280, 480)), ((1280, 480), (1400, 860)), ((900, 480), (1010, 860)), ((1010, 860), (600, 860)), ((1010, 860), (1280, 480))):
        d.line([a, b], fill=frame, width=30)
    d.line([(1280, 480), (1250, 380)], fill=(40, 40, 44), width=22)
    d.line([(1180, 370), (1330, 380)], fill=(40, 40, 44), width=26)
    d.line([(900, 480), (880, 400)], fill=(40, 40, 44), width=20)
    d.rounded_rectangle([800, 370, 960, 410], 18, fill=(26, 26, 28))
    finish(img, "bicycle.jpg", 15)


def lamp():
    img, d = room((204, 190, 170), (132, 98, 70), seed=7)
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([640, 60, 1360, 780], fill=(255, 226, 170, 110))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img.paste(glow, (0, 0), glow)
    d = ImageDraw.Draw(img)
    shadow(img, [820, 1180, 1180, 1260], blur=24)
    d.rectangle([990, 520, 1010, 1200], fill=(168, 136, 72))
    d.ellipse([880, 1170, 1120, 1230], fill=(150, 120, 62))
    d.polygon([(840, 520), (1160, 520), (1090, 250), (910, 250)], fill=(244, 232, 204))
    d.polygon([(840, 520), (1160, 520), (1150, 480), (850, 480)], fill=(226, 210, 176))
    finish(img, "lamp.jpg", 16)


def receipt():
    img = Image.new("RGB", (W, H), (126, 94, 66))
    d = ImageDraw.Draw(img)
    rnd = random.Random(8)
    for k in range(40):
        y = rnd.randint(0, H)
        d.line([(0, y), (W, y + rnd.randint(-30, 30))], fill=(116 + rnd.randint(-8, 8), 86, 60), width=rnd.randint(2, 7))
    paper = Image.new("RGB", (720, 1240), (246, 244, 236))
    p = ImageDraw.Draw(paper)
    try:
        mono = ImageFont.truetype("DejaVuSansMono.ttf", 30)
        bold = ImageFont.truetype("DejaVuSansMono-Bold.ttf", 44)
    except OSError:
        mono = bold = ImageFont.load_default()
    p.text((360, 70), "BRIGHTWAY", font=bold, fill=(30, 30, 34), anchor="mm")
    p.text((360, 124), "ELECTRONICS", font=mono, fill=(30, 30, 34), anchor="mm")
    p.text((360, 172), "Store 0418   Till 03", font=mono, fill=(90, 90, 96), anchor="mm")
    y = 250
    rows = [("OLED TV 65IN", "1,899.00"), ("HDMI CABLE 2M", "14.99"), ("WALL BRACKET", "59.00"), ("CARE PLAN 3YR", "129.00")]
    for name, price in rows:
        p.text((50, y), name, font=mono, fill=(40, 40, 46))
        p.text((670, y), price, font=mono, fill=(40, 40, 46), anchor="ra")
        y += 58
    p.line([(50, y + 10), (670, y + 10)], fill=(120, 120, 126), width=3)
    for label, amount in (("SUBTOTAL", "2,101.99"), ("TAX", "168.16"), ("TOTAL", "2,270.15")):
        y += 62
        p.text((50, y), label, font=bold if label == "TOTAL" else mono, fill=(30, 30, 34))
        p.text((670, y), amount, font=bold if label == "TOTAL" else mono, fill=(30, 30, 34), anchor="ra")
    y += 120
    p.text((360, y), "CARD ************0000", font=mono, fill=(90, 90, 96), anchor="mm")
    p.text((360, y + 50), "03/04/2021  14:22", font=mono, fill=(90, 90, 96), anchor="mm")
    p.text((360, y + 150), "Keep this receipt", font=mono, fill=(90, 90, 96), anchor="mm")
    p.text((360, y + 196), "for your warranty", font=mono, fill=(90, 90, 96), anchor="mm")
    for x in range(40, 690, 16):
        p.rectangle([x, 1150, x + rnd.choice((3, 5, 8)), 1210], fill=(30, 30, 34))
    paper = paper.rotate(-4, resample=Image.BICUBIC, expand=True, fillcolor=(126, 94, 66))
    shadow(img, [600, 150, 1460, 1420], blur=50, strength=70)
    img.paste(paper, (620, 100))
    finish(img, "receipt.jpg", 17, quality=88)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for make in (television, sofa, mixer, laptop, bicycle, lamp, receipt):
        make()
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, "KB")
