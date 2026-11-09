#!/usr/bin/env python3
"""Builds every sound in audio/ from scratch (numpy synthesis, no recordings).

    python3 tools/make_audio.py        # needs numpy, scipy and ffmpeg (libvorbis)

Burning cardboard is crinkly and papery, not woody: lots of small bright crackles
and soft flutter. Buildings crumple (folding board) and the tall ones topple with a
creak and a hollow box thump. Coins chink, the shop box's flaps thwap open, tape
rips, the giant's feet thud on concrete, the fans hum and the big empty warehouse
rings faintly. Everything is seeded, so it rebuilds the same.
"""
import os
import subprocess
import tempfile

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 22050
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio")
rng = np.random.default_rng(20261110)


def t(sec):
    return np.arange(int(SR * sec)) / SR


def lp(x, hz, order=2):
    b, a = butter(order, hz / (SR / 2), "low")
    return lfilter(b, a, x)


def hp(x, hz, order=2):
    b, a = butter(order, hz / (SR / 2), "high")
    return lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = butter(order, [lo / (SR / 2), hi / (SR / 2)], "band")
    return lfilter(b, a, x)


def noise(sec):
    return rng.standard_normal(int(SR * sec))


def brown(sec):
    x = np.cumsum(rng.standard_normal(int(SR * sec)))
    x = hp(x, 20)
    return x / (np.max(np.abs(x)) + 1e-9)


def env(n, attack, release, curve=3.0):
    e = np.ones(n)
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r) ** curve
    return e


def norm(x, peak=0.9):
    return x / (np.max(np.abs(x)) + 1e-9) * peak


def loopify(x, fade=0.25):
    f = int(fade * SR)
    head = x[:f].copy()
    body = x[f:].copy()
    ramp = np.linspace(0, 1, f)
    body[-f:] = body[-f:] * (1 - ramp) + head * ramp
    return body


def tone(freq, sec, harmonics=(1.0, 0.3, 0.1), decay=6.0):
    tt = t(sec)
    y = sum(a * np.sin(2 * np.pi * freq * (k + 1) * tt) for k, a in enumerate(harmonics))
    return y * np.exp(-tt * decay)


def crinkles(sec, rate, size=(0.001, 0.006), band=(2500, 9000)):
    """Paper and card crackling: lots of tiny bright clicks."""
    n = int(SR * sec)
    y = np.zeros(n)
    for _ in range(int(sec * rate)):
        at = rng.integers(0, n - 400)
        ln = max(8, int(rng.uniform(*size) * SR))
        burst = rng.standard_normal(ln) * np.exp(-np.linspace(0, 5, ln))
        y[at:at + ln] += burst * rng.uniform(0.2, 1.0)
    return bp(y, band[0], band[1])


def crumple(sec, density, low=600, high=5000):
    """Folding cardboard: clustered crackles with a soft body underneath."""
    n = int(SR * sec)
    y = np.zeros(n)
    k = 0
    while k < density:
        at = rng.integers(0, int(n * 0.8))
        cluster = rng.integers(3, 9)
        for c in range(cluster):
            p = at + int(rng.uniform(0, 0.05) * SR)
            ln = int(rng.uniform(0.004, 0.02) * SR)
            if p + ln >= n:
                continue
            y[p:p + ln] += rng.standard_normal(ln) * np.exp(-np.linspace(0, 4, ln)) * rng.uniform(0.3, 1.0)
        k += 1
    body = lp(noise(sec), low) * 0.4
    return bp(y, low, high) + body * env(n, 0.01, sec * 0.7)


def save(name, x):
    os.makedirs(OUT, exist_ok=True)
    x = np.clip(x, -1, 1)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wavfile.write(f.name, SR, (x * 32767).astype(np.int16))
        tmp = f.name
    dst = os.path.join(OUT, name + ".ogg")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-c:a", "libvorbis", "-q:a", "4", dst], check=True)
    os.remove(tmp)
    print("wrote", dst)


def main():
    # --- Fire --------------------------------------------------------------------
    sec = 4.25
    hiss = bp(noise(sec), 3000, 8000) * 0.05 * (0.7 + 0.3 * np.sin(2 * np.pi * 0.6 * t(sec)))
    flutter = bp(noise(sec), 300, 1200) * 0.18 * (0.6 + 0.4 * np.sin(2 * np.pi * 7.0 * t(sec)) ** 2)
    save("crackle", norm(loopify(crinkles(sec, 70) * 0.9 + hiss + flutter + lp(brown(sec), 200) * 0.25), 0.8))
    sec = 3.25
    body = lp(brown(sec), 260, 3) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.8 * t(sec)))
    save("roar", norm(loopify(body + bp(noise(sec), 250, 1000) * 0.3 + crinkles(sec, 40, band=(1500, 6000)) * 0.4), 0.85))

    # --- Tools -------------------------------------------------------------------
    sec = 2.25
    sizzle = bp(noise(sec), 4000, 9500) * (0.75 + 0.25 * np.sin(2 * np.pi * 11 * t(sec)))
    save("sizzle", norm(loopify(sizzle + crinkles(sec, 25) * 0.4), 0.5))
    sec = 2.25
    save("candle", norm(loopify(lp(noise(sec), 500) * (0.7 + 0.3 * np.sin(2 * np.pi * 2.3 * t(sec))) + crinkles(sec, 6) * 0.3), 0.45))
    sec = 2.25
    roar = lp(brown(sec), 700, 2) * 0.7 + bp(noise(sec), 800, 3500) * 0.6
    save("torch", norm(loopify(roar * (0.9 + 0.1 * np.sin(2 * np.pi * 30 * t(sec)))), 0.75))
    x = bp(noise(0.5), 600, 3000) * env(int(0.5 * SR), 0.005, 0.35)
    sweep = np.sin(2 * np.pi * np.cumsum(np.linspace(300, 1400, int(0.5 * SR))) / SR) * env(int(0.5 * SR), 0.01, 0.3) * 0.3
    save("rocket_launch", norm(x + sweep, 0.8))
    boom = lp(noise(0.9), 300, 3) * env(int(0.9 * SR), 0.002, 0.8) * 1.2
    sparkle = crinkles(0.9, 160, band=(3000, 9500)) * np.linspace(0.3, 1, int(0.9 * SR)) * 0.6
    save("rocket_burst", norm(boom + sparkle, 0.9))
    x = bp(noise(0.25), 900, 6000) * env(int(0.25 * SR), 0.002, 0.2)
    save("tool_on", norm(x + tone(220, 0.25, (0.5,), 20) * 0.2, 0.6))

    # --- Buildings ------------------------------------------------------------------
    for name, sec, cut in (("catch", 0.4, 2500), ("catch_big", 0.9, 900)):
        x = lp(noise(sec), cut, 3) * env(int(sec * SR), 0.04, sec * 0.8) * np.linspace(1.0, 0.4, int(sec * SR))
        x += crinkles(sec, 60) * 0.4
        if name == "catch_big":
            x += np.sin(2 * np.pi * 70 * t(sec) * (1 - 0.3 * t(sec))) * np.exp(-t(sec) * 5) * 0.5
        save(name, norm(x, 0.8))
    save("crumple", norm(crumple(0.7, 9), 0.8))
    save("crumple_big", norm(crumple(1.2, 18, 300, 4000) + lp(noise(1.2), 150) * env(int(1.2 * SR), 0.05, 1.0) * 0.6, 0.85))
    # The tall ones: a creak as they lean, then a hollow box thump.
    sec = 1.5
    creak_t = t(0.7)
    creak = np.sin(2 * np.pi * np.cumsum(180 + 40 * np.sin(2 * np.pi * 3 * creak_t) + 60 * creak_t) / SR)
    creak = bp(creak * (1 + 0.5 * rng.standard_normal(len(creak))), 200, 1600) * env(len(creak), 0.05, 0.3) * 0.5
    thump = np.sin(2 * np.pi * 62 * t(0.8) * (1 - 0.25 * t(0.8))) * np.exp(-t(0.8) * 6)
    thump += lp(noise(0.8), 400) * np.exp(-t(0.8) * 8) * 0.7
    y = np.zeros(int(sec * SR))
    y[:len(creak)] += creak
    at = int(0.62 * SR)
    y[at:at + len(thump)] += thump * 1.2
    y[at:at + int(0.8 * SR)] += crumple(0.8, 10, 400, 5000)[:len(y) - at] * 0.6
    save("topple", norm(y, 0.9))
    x = crinkles(0.35, 40, band=(3000, 9000)) + tone(1800, 0.35, (0.4,), 14) * 0.2
    save("ember", norm(x * env(len(x), 0.005, 0.2), 0.5))
    # Fire trucks: a squirt of water.
    x = bp(noise(0.6), 1500, 7000) * env(int(0.6 * SR), 0.02, 0.4) * (0.8 + 0.2 * np.sin(2 * np.pi * 40 * t(0.6)))
    save("spray", norm(x + lp(noise(0.6), 400) * 0.2 * env(int(0.6 * SR), 0.05, 0.4), 0.6))
    x = bp(noise(0.4), 2000, 8000) * env(int(0.4 * SR), 0.005, 0.35) * 0.6
    save("hiss_out", norm(x, 0.5))

    # --- Coins and the shop ----------------------------------------------------------
    for k, f in enumerate([2350, 2790, 3130]):
        y = tone(f, 0.22, (1.0, 0.0, 0.35, 0.0, 0.2), 18) + tone(f * 1.51, 0.22, (0.4,), 25)
        save("coin_%d" % (k + 1), norm(y * env(len(y), 0.001, 0.1), 0.45))
    y = np.zeros(int(0.6 * SR))
    for k in range(6):
        s = tone(rng.uniform(2200, 3400), 0.25, (1.0, 0.0, 0.3), 16)
        at = int(k * rng.uniform(0.04, 0.07) * SR)
        y[at:at + len(s)] += s * rng.uniform(0.5, 1.0)
    save("coins_big", norm(y, 0.6))
    y = np.zeros(int(0.7 * SR))
    for k, f in enumerate([587.3, 739.99, 880.0, 1174.7]):
        s = tone(f, 0.45, (1.0, 0.25, 0.1), 7)
        at = int(k * 0.06 * SR)
        y[at:at + len(s)] += s
    save("buy", norm(y + crinkles(0.7, 20) * 0.1, 0.7))
    y = np.concatenate([tone(185, 0.12, (1.0, 0.5, 0.2), 12), tone(156, 0.18, (1.0, 0.5, 0.2), 10)])
    save("nope", norm(y, 0.5))
    # The shop box: two flaps thwapping open, and closing.
    def flap(sec=0.12):
        x = lp(noise(sec), 900) * np.exp(-t(sec) * 30) + bp(noise(sec), 1500, 5000) * np.exp(-t(sec) * 50) * 0.4
        return x
    y = np.zeros(int(0.45 * SR))
    for at in (0.0, 0.14):
        f = flap()
        y[int(at * SR):int(at * SR) + len(f)] += f
    save("box_open", norm(y, 0.7))
    y = np.zeros(int(0.35 * SR))
    f = flap(0.2)
    y[:len(f)] += f
    save("box_close", norm(y + lp(noise(0.35), 200) * np.exp(-t(0.35) * 15) * 0.5, 0.7))
    x = bp(noise(0.5), 1500, 7000) * (0.5 + 0.5 * (rng.random(int(0.5 * SR)) > 0.3)) * env(int(0.5 * SR), 0.01, 0.15)
    save("tape", norm(x, 0.5))
    y = np.zeros(int(1.3 * SR))
    for k, f in enumerate([659.25, 783.99, 987.77, 1318.5, 1567.98]):
        s = tone(f, 0.8, (1.0, 0.2, 0.25), 4.5)
        at = int(k * 0.08 * SR)
        y[at:at + len(s)] += s * (0.8 + 0.05 * k)
    save("reward", norm(y, 0.7))
    y = np.zeros(int(0.6 * SR))
    for k, f in enumerate([1174.7, 1568.0]):
        s = tone(f, 0.45, (1.0, 0.25), 6)
        y[int(k * 0.11 * SR):int(k * 0.11 * SR) + len(s)] += s
    save("offer", norm(y, 0.5))
    # A chain of collapses: a rising pluck per link (pitched up in the game).
    save("chain", norm(tone(523.25, 0.35, (1.0, 0.5, 0.25, 0.1), 9) * env(int(0.35 * SR), 0.002, 0.2), 0.55))

    # --- Finds, citizens -------------------------------------------------------------
    pop = np.sin(2 * np.pi * np.cumsum(np.linspace(500, 1500, int(0.08 * SR))) / SR) * np.exp(-t(0.08) * 25)
    y = np.zeros(int(0.5 * SR))
    y[:len(pop)] += pop
    s = sum(tone(f, 0.35, (1.0,), 10) for f in (1760, 2217, 2637)) * 0.3
    y[int(0.06 * SR):int(0.06 * SR) + len(s)] += s
    save("find", norm(y, 0.55))
    y = np.zeros(int(1.4 * SR))
    for k, f in enumerate([1046.5, 1318.5, 1568, 2093, 2637, 3136]):
        s = tone(f, 0.7, (1.0, 0.4), 5)
        y[int(k * 0.07 * SR):int(k * 0.07 * SR) + len(s)] += s
    save("golden", norm(y, 0.65))
    x = bp(noise(0.18), 800, 4000) * (np.sin(2 * np.pi * 28 * t(0.18)) > 0) * env(int(0.18 * SR), 0.005, 0.1)
    save("hop", norm(x, 0.35))

    # --- The giant -------------------------------------------------------------------
    for k in range(3):
        x = lp(noise(0.25), 220 + 60 * k) * env(int(0.25 * SR), 0.004, 0.2)
        x += np.sin(2 * np.pi * (48 + 7 * k) * t(0.25)) * np.exp(-t(0.25) * 18) * 0.9
        x += bp(noise(0.25), 1500, 4000) * np.exp(-t(0.25) * 40) * 0.15
        save("step_%d" % (k + 1), norm(x, 0.6))
    x = bp(noise(0.3), 300, 1500) * env(int(0.3 * SR), 0.03, 0.2) * np.linspace(0.5, 1, int(0.3 * SR))
    save("jump", norm(x, 0.4))
    x = lp(noise(0.4), 180) * env(int(0.4 * SR), 0.003, 0.35) + np.sin(2 * np.pi * 42 * t(0.4)) * np.exp(-t(0.4) * 10)
    save("land", norm(x, 0.7))
    # The warehouse: room tone, the fans' hum, rain ticking on the roof now and then.
    sec = 8.25
    room = lp(brown(sec), 140) * 0.7 + bp(noise(sec), 400, 900) * 0.04
    hum = (np.sin(2 * np.pi * 60 * t(sec)) * 0.08 + np.sin(2 * np.pi * 120 * t(sec)) * 0.04) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.2 * t(sec)))
    ticks = crinkles(sec, 6, (0.0005, 0.002), (2000, 6000)) * 0.15
    save("warehouse", norm(loopify(room + hum + ticks), 0.45))
    sec = 3.25
    fan = lp(noise(sec), 400) * 0.6 + np.sin(2 * np.pi * 28 * t(sec)) * 0.3 * (0.7 + 0.3 * np.sin(2 * np.pi * 9.3 * t(sec)))
    save("fan", norm(loopify(fan), 0.5))
    # The wind-up car: a ratchet.
    y = np.zeros(int(0.5 * SR))
    for k in range(9):
        at = int(k * 0.05 * SR)
        click = bp(noise(0.012), 2000, 6000) * np.exp(-np.linspace(0, 6, int(0.012 * SR)))
        y[at:at + len(click)] += click
    save("windup", norm(y, 0.45))


if __name__ == "__main__":
    main()
