#!/usr/bin/env python3
"""Generates every sound for Drain an Ocean from noise, sines and envelopes
(no stock audio), into audio/sfx/*.ogg:
    python3 art/audio/make_sfx.py
Needs numpy, scipy and ffmpeg (libvorbis). Loops (pump_*, amb_*) are
cross-faded so they repeat without a click.
"""
import os
import subprocess
import tempfile
import wave

import numpy as np
from scipy import signal

SR = 22050
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "audio", "sfx"))
rng = np.random.default_rng(1109)


def t_axis(d):
    return np.arange(int(SR * d)) / SR


def noise(d):
    return rng.uniform(-1, 1, int(SR * d))


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi / (SR / 2), 0.99)], btype="band")
    return signal.lfilter(b, a, x)


def lp(x, f, order=2):
    b, a = signal.butter(order, min(f / (SR / 2), 0.99), btype="low")
    return signal.lfilter(b, a, x)


def hp(x, f, order=2):
    b, a = signal.butter(order, f / (SR / 2), btype="high")
    return signal.lfilter(b, a, x)


def env(d, attack=0.005, decay=0.3):
    t = t_axis(d)
    return np.clip(t / max(attack, 1e-4), 0, 1) * np.exp(-t / decay)


def sine(f, d, phase=0.0):
    t = t_axis(d)
    if callable(f):
        ph = np.cumsum(f(t)) / SR * 2 * np.pi
        return np.sin(ph + phase)
    return np.sin(2 * np.pi * f * t + phase)


def pad(x, d):
    n = int(SR * d)
    return np.pad(x, (0, max(0, n - len(x))))[:n]


def norm(x, peak=0.8):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def add(x, s, i):
    """Mixes s into x starting at sample i, clipped to x."""
    i = max(0, int(i))
    if i >= len(x):
        return
    n = min(len(s), len(x) - i)
    x[i:i + n] += s[:n]


def loopify(x, fade=0.25):
    n = int(SR * fade)
    head = x[:n].copy()
    body = x[n:].copy()
    w = np.linspace(0, 1, n)
    body[-n:] = body[-n:] * (1 - w) + head * w
    return body


def save(name, x, peak=0.8):
    os.makedirs(OUT, exist_ok=True)
    x = norm(x, peak)
    tmp = tempfile.mktemp(suffix=".wav")
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-c:a", "libvorbis", "-q:a", "4", os.path.join(OUT, name + ".ogg")], check=True)
    os.remove(tmp)


# --- Ambience ---------------------------------------------------------------------------------
def amb_sea():
    d = 12.0
    t = t_axis(d)
    # Waves on the sea wall: slow swells of filtered noise.
    x = lp(noise(d), 700) * (0.5 + 0.5 * np.sin(2 * np.pi * t / 6.0) ** 2)
    x += bp(noise(d), 1200, 4000) * 0.15 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 4.0 + 1.0)) ** 3
    x += lp(noise(d), 160) * 0.6
    save("amb_sea", loopify(x, 1.0), 0.55)


def gull():
    for k in range(3):
        d = 1.4
        t = t_axis(d)
        out = np.zeros(int(SR * d))
        start = 0.0
        for c in range(rng.integers(2, 4)):
            cd = rng.uniform(0.22, 0.34)
            f0 = rng.uniform(1300, 1600)
            fn = lambda tt, f0=f0, cd=cd: f0 * (1.0 + 0.5 * np.sin(np.pi * np.clip(tt / cd, 0, 1))) * (1 - 0.25 * tt / cd)
            y = sine(fn, cd) * 0.6 + sine(lambda tt: fn(tt) * 2.0, cd) * 0.25 + sine(lambda tt: fn(tt) * 3.0, cd) * 0.1
            y *= np.sin(np.pi * t_axis(cd) / cd) ** 0.6
            y = bp(y + noise(cd) * 0.05, 700, 5000)
            i = int(start * SR)
            add(out, y, i)
            start += cd + rng.uniform(0.05, 0.12)
        save("gull_%d" % (k + 1), out, 0.5)


# --- Pumps --------------------------------------------------------------------------------------
def pump_1():
    # The bucket brigade: sloshes and tips in a steady rhythm.
    d = 4.0
    x = np.zeros(int(SR * d))
    for k in range(8):
        i = int((k * 0.5 + rng.uniform(-0.03, 0.03)) * SR)
        s = bp(noise(0.35), 300, 1800) * env(0.35, 0.02, 0.12)
        s += bp(noise(0.35), 1500, 5000) * env(0.35, 0.05, 0.08) * 0.4
        add(x, s, i)
    save("pump_1", loopify(x, 0.2), 0.6)


def pump_2():
    # The hand pump: a creaky stroke and a gush of water, twice a second.
    d = 4.0
    x = np.zeros(int(SR * d))
    for k in range(6):
        i = int(k * 0.666 * SR)
        cr = sine(lambda tt: 380 + 140 * np.sin(tt * 20), 0.18) * env(0.18, 0.02, 0.08) * 0.3
        gush = bp(noise(0.4), 400, 2500) * env(0.4, 0.06, 0.15)
        s = np.concatenate([cr, np.zeros(int(0.1 * SR))])
        add(x, s, i)
        j = i + int(0.2 * SR)
        add(x, gush, j)
    save("pump_2", loopify(x, 0.2), 0.6)


def pump_3():
    # The diesel: a low chug with a rattle.
    d = 4.0
    t = t_axis(d)
    rate = 9.0
    pulse = (0.5 + 0.5 * np.sin(2 * np.pi * rate * t)) ** 6
    x = lp(noise(d), 260) * pulse * 1.4 + sine(55, d) * 0.25 * pulse + sine(110, d) * 0.1
    x += bp(noise(d), 2000, 5000) * 0.05 * pulse
    x += lp(noise(d), 900) * 0.15
    save("pump_3", loopify(x, 0.3), 0.6)


def pump_4():
    # The giant siphon: a deep rushing roar with a gurgle.
    d = 5.0
    t = t_axis(d)
    x = lp(noise(d), 500) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.4 * t))
    x += bp(noise(d), 120, 300) * 0.8
    g = np.zeros_like(x)
    for k in range(14):
        i = int(rng.uniform(0, d - 0.2) * SR)
        b = sine(lambda tt: 180 + 300 * tt * 5, 0.1) * env(0.1, 0.005, 0.04)
        add(g, b, i)
    save("pump_4", loopify(x + g * 0.3, 0.5), 0.6)


def pump_5():
    # The whirlpool engine: a hum with a slow swirl on top.
    d = 5.0
    t = t_axis(d)
    x = sine(73, d) * 0.4 + sine(146.5, d) * 0.2 + sine(219, d) * 0.08
    x *= 0.8 + 0.2 * np.sin(2 * np.pi * 0.6 * t)
    sw = bp(noise(d), 300, 1400) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.8 * t)) ** 2
    save("pump_5", loopify(x + sw * 0.5, 0.5), 0.6)


# --- Effects --------------------------------------------------------------------------------------
def splash():
    x = bp(noise(0.6), 300, 3500) * env(0.6, 0.005, 0.15) + bp(noise(0.6), 2500, 7000) * env(0.6, 0.02, 0.08) * 0.4
    save("splash", x, 0.7)


def rescue():
    # A splash, then a bright two-note chime.
    s = bp(noise(0.3), 400, 4000) * env(0.3, 0.003, 0.08)
    c1 = (sine(880, 0.5) + 0.4 * sine(1760, 0.5)) * env(0.5, 0.004, 0.18)
    c2 = (sine(1318.5, 0.6) + 0.4 * sine(2637, 0.6)) * env(0.6, 0.004, 0.22)
    x = pad(s, 0.9)
    add(x, c1 * 0.6, int(0.08 * SR))
    add(x, c2 * 0.6, int(0.2 * SR))
    save("rescue", x, 0.7)


def find():
    # Coins and a rising arpeggio.
    x = np.zeros(int(SR * 1.2))
    for k, f in enumerate([523.3, 659.3, 784.0, 1046.5]):
        n = (sine(f, 0.6) + 0.3 * sine(f * 2.01, 0.6)) * env(0.6, 0.003, 0.25)
        i = int(k * 0.09 * SR)
        add(x, n * 0.5, i)
    for k in range(6):
        i = int(rng.uniform(0.0, 0.5) * SR)
        c = bp(noise(0.08), 3000, 8000) * env(0.08, 0.001, 0.02)
        add(x, c * 0.4, i)
    save("find", x, 0.7)


def salvage():
    # A crate swung up: rope creak and a clank.
    cl = (sine(320, 0.4) + 0.6 * sine(587, 0.4) + 0.3 * sine(1210, 0.4)) * env(0.4, 0.002, 0.09)
    cr = sine(lambda tt: 300 + 120 * np.sin(tt * 30), 0.3) * env(0.3, 0.05, 0.1) * 0.25
    x = pad(cr, 0.7)
    add(x, cl, int(0.15 * SR))
    save("salvage", x, 0.7)


def bell():
    # A ship's bell: inharmonic partials, long decay.
    d = 3.0
    x = np.zeros(int(SR * d))
    for f, a, dec in [(523, 1.0, 1.4), (1046, 0.5, 0.9), (1251, 0.4, 0.8), (1568, 0.3, 0.6), (2093, 0.2, 0.4), (262, 0.3, 1.8)]:
        x += sine(f * 0.9, d) * a * env(d, 0.002, dec)
    x[:int(0.01 * SR)] += noise(0.01) * 0.3
    save("bell", x, 0.65)


def whistle():
    # A bosun's call: a rising whistle with a warble.
    d = 0.9
    x = sine(lambda tt: 1800 + 900 * np.clip(tt / 0.35, 0, 1) + 40 * np.sin(tt * 60), d)
    x *= np.clip(t_axis(d) / 0.05, 0, 1) * np.clip((d - t_axis(d)) / 0.2, 0, 1)
    x += bp(noise(d), 2000, 6000) * 0.05
    save("whistle", x, 0.45)


def ui():
    save("click", bp(noise(0.05), 1500, 5000) * env(0.05, 0.001, 0.01) + sine(1200, 0.05) * env(0.05, 0.001, 0.015) * 0.5, 0.5)
    # paper: a soft rustle up / down
    save("ui_open", bp(noise(0.35), 800, 6000) * env(0.35, 0.05, 0.1) + sine(lambda tt: 300 + 600 * tt, 0.35) * env(0.35, 0.02, 0.1) * 0.2, 0.5)
    save("ui_close", bp(noise(0.3), 600, 4500) * env(0.3, 0.03, 0.08) + sine(lambda tt: 600 - 500 * tt, 0.3) * env(0.3, 0.02, 0.08) * 0.2, 0.5)
    stamp = lp(noise(0.25), 1200) * env(0.25, 0.001, 0.04) + sine(140, 0.25) * env(0.25, 0.001, 0.06)
    save("buy", np.concatenate([stamp, (sine(784, 0.3) + sine(1175, 0.3) * 0.5) * env(0.3, 0.003, 0.12) * 0.4]), 0.65)
    save("cant_afford", (sine(196, 0.3) + sine(185, 0.3)) * env(0.3, 0.005, 0.1), 0.4)
    save("build", lp(noise(0.5), 600) * env(0.5, 0.002, 0.06) + (sine(220, 0.5) + sine(330, 0.5) * 0.5) * env(0.5, 0.002, 0.15) * 0.4, 0.6)
    save("reward", np.concatenate([(sine(f, 0.18) * env(0.18, 0.003, 0.1)) for f in (659.3, 880, 1318.5)]), 0.55)
    save("pool_cut", lp(noise(0.8), 500) * env(0.8, 0.05, 0.3) + sine(lambda tt: 220 - 80 * tt, 0.8) * env(0.8, 0.02, 0.3) * 0.3, 0.55)
    save("pool_dry", bp(noise(0.6), 200, 1500) * env(0.6, 0.02, 0.2) + sine(lambda tt: 500 - 300 * tt, 0.6) * env(0.6, 0.01, 0.15) * 0.3, 0.5)
    v = np.zeros(int(SR * 2.4))
    for k, f in enumerate([392, 523.3, 659.3, 784, 1046.5]):
        n = (sine(f, 1.4) + 0.3 * sine(f * 2, 1.4)) * env(1.4, 0.005, 0.6)
        i = int(k * 0.16 * SR)
        add(v, n * 0.45, i)
    save("victory", v, 0.7)


if __name__ == "__main__":
    amb_sea()
    gull()
    for f in (pump_1, pump_2, pump_3, pump_4, pump_5, splash, rescue, find, salvage, bell, whistle, ui):
        f()
    print("sounds in", OUT, len(os.listdir(OUT)))
