#!/usr/bin/env python3
"""Builds every sound in audio/ from scratch (numpy synthesis, no samples).

    python3 tools/make_audio.py        # needs numpy, scipy and ffmpeg (libvorbis)

Fire crackles and roars, the tools, catching trees, embers ticking in, the
notebook's pages, buying, rewards, footsteps on moss, critters popping, and a
quiet night-forest ambience. Everything is seeded, so it rebuilds the same.
"""
import os
import subprocess
import tempfile

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 22050
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio")
rng = np.random.default_rng(20261109)


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
    """Crossfade the end into the start so it loops without a click."""
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


def pops(sec, rate, size=(0.002, 0.012), bright=(1500, 6000)):
    """Random wood pops and snaps."""
    n = int(SR * sec)
    y = np.zeros(n)
    count = int(sec * rate)
    for _ in range(count):
        at = rng.integers(0, n - 800)
        ln = int(rng.uniform(*size) * SR)
        burst = rng.standard_normal(ln) * np.exp(-np.linspace(0, 6, ln))
        burst = bp(burst, rng.uniform(bright[0] * 0.5, bright[0]), rng.uniform(bright[1] * 0.7, bright[1]))
        y[at:at + ln] += burst * rng.uniform(0.3, 1.0)
    return y


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
    rumble = lp(brown(sec), 300) * 0.5
    hiss = hp(noise(sec), 2500) * 0.04 * (0.7 + 0.3 * np.sin(2 * np.pi * 0.7 * t(sec)))
    save("crackle", norm(loopify(rumble + hiss + pops(sec, 26) * 0.9), 0.8))
    sec = 3.25
    body = lp(brown(sec), 220, 3) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.9 * t(sec)))
    flutter = bp(noise(sec), 200, 900) * 0.25 * (0.6 + 0.4 * np.sin(2 * np.pi * 6.0 * t(sec)) ** 2)
    save("roar", norm(loopify(body + flutter + pops(sec, 10, bright=(800, 3000)) * 0.4), 0.85))

    # --- Tools -------------------------------------------------------------------
    n = noise(0.6)
    scratch = bp(n, 2000, 7000) * env(len(n), 0.01, 0.2) * np.linspace(1, 0.3, len(n))
    flare = lp(noise(0.6), 900) * env(len(n), 0.12, 0.35) * 0.8
    strike = np.zeros(len(n))
    strike[:3000] = scratch[:3000] * 1.2
    save("match_strike", norm(strike + flare, 0.8))
    sec = 2.25
    save("hiss", norm(loopify(bp(noise(sec), 1500, 6000) * 0.6 + lp(brown(sec), 400) * 0.3), 0.6))
    sec = 2.25
    wob = 0.75 + 0.25 * np.sin(2 * np.pi * 3.1 * t(sec))
    save("whoosh", norm(loopify((lp(noise(sec), 700) * 0.9 + bp(noise(sec), 700, 2500) * 0.25) * wob), 0.75))
    sec = 2.25
    save("jet", norm(loopify(lp(brown(sec), 500, 3) * 0.8 + bp(noise(sec), 300, 1800) * 0.5
                             + pops(sec, 18, bright=(1200, 5000)) * 0.3), 0.85))
    x = lp(noise(0.5), 1200) * env(int(0.5 * SR), 0.02, 0.4)
    save("tool_on", norm(x * np.linspace(1.2, 0.6, len(x)), 0.75))

    # --- Things catching -----------------------------------------------------------
    for k, (sec, cut, name) in enumerate([(0.35, 1400, "catch_small"), (0.9, 450, "catch_big")]):
        x = lp(noise(sec), cut, 3)
        sweep = np.linspace(1.0, 0.4, len(x))
        y = x * env(len(x), 0.03, sec * 0.8) * sweep
        if name == "catch_big":
            y += np.sin(2 * np.pi * 55 * t(sec) * (1 - 0.3 * t(sec))) * np.exp(-t(sec) * 5) * 0.6
        save(name, norm(y, 0.8))
    x = pops(0.35, 30, bright=(2500, 8000)) + tone(1800, 0.35, (0.4,), 14) * 0.3
    save("spot", norm(x * env(len(x), 0.005, 0.2), 0.6))
    x = lp(noise(0.8), 600) * env(int(0.8 * SR), 0.01, 0.6) + pops(0.8, 40, bright=(600, 2500)) * 0.6
    save("crumble", norm(x, 0.7))

    # --- Embers and the shop -------------------------------------------------------
    for k, f in enumerate([1760, 2093, 2349]):
        save("ember_%d" % (k + 1), norm(tone(f, 0.18, (1.0, 0.25, 0.08), 26) * env(int(0.18 * SR), 0.002, 0.08), 0.5))
    notes = [523.25, 659.25, 783.99, 1046.5]
    y = np.zeros(int(0.75 * SR))
    for k, f in enumerate(notes):
        s = tone(f, 0.45, (1.0, 0.35, 0.12, 0.05), 7)
        at = int(k * 0.07 * SR)
        y[at:at + len(s)] += s
    save("buy", norm(y, 0.7))
    y = np.concatenate([tone(196, 0.13, (1.0, 0.5, 0.2), 12), tone(165, 0.18, (1.0, 0.5, 0.2), 10)])
    save("nope", norm(y, 0.55))
    x = bp(noise(0.35), 1500, 7000) * env(int(0.35 * SR), 0.06, 0.25) * np.sin(np.linspace(0, np.pi, int(0.35 * SR)))
    save("page", norm(x, 0.55))
    y = np.zeros(int(1.4 * SR))
    for k, f in enumerate([784, 988, 1175, 1568, 1976]):
        s = tone(f, 0.8, (1.0, 0.2, 0.3), 4.5)
        at = int(k * 0.09 * SR)
        y[at:at + len(s)] += s * (0.8 + 0.05 * k)
    y += hp(noise(1.4), 6000) * env(int(1.4 * SR), 0.05, 1.2) * 0.06
    save("reward", norm(y, 0.7))
    y = np.zeros(int(0.7 * SR))
    for k, f in enumerate([1318.5, 1760]):
        s = tone(f, 0.5, (1.0, 0.25), 6)
        at = int(k * 0.12 * SR)
        y[at:at + len(s)] += s
    save("offer", norm(y, 0.5))

    # --- The keeper, critters, the meadow --------------------------------------------
    for k in range(3):
        x = lp(noise(0.12), 500 + 150 * k) * env(int(0.12 * SR), 0.004, 0.1)
        x += np.sin(2 * np.pi * (90 + 15 * k) * t(0.12)) * np.exp(-t(0.12) * 40) * 0.5
        save("step_%d" % (k + 1), norm(x, 0.5))
    x = bp(noise(0.25), 400, 2000) * env(int(0.25 * SR), 0.02, 0.2) * np.linspace(0.5, 1, int(0.25 * SR))
    save("jump", norm(x, 0.45))
    x = lp(noise(0.15), 400) * env(int(0.15 * SR), 0.003, 0.12)
    save("land", norm(x, 0.5))
    pop = np.sin(2 * np.pi * np.cumsum(np.linspace(400, 1400, int(0.08 * SR))) / SR) * np.exp(-t(0.08) * 30)
    sparkle = sum(tone(f, 0.3, (1.0,), 12) for f in (2637, 3136, 3951)) * 0.3
    y = np.zeros(int(0.4 * SR))
    y[:len(pop)] += pop
    y[int(0.05 * SR):int(0.05 * SR) + len(sparkle)] += sparkle
    save("critter_pop", norm(y, 0.5))
    y = np.zeros(int(1.2 * SR))
    for k, f in enumerate([1046.5, 1318.5, 1568, 2093, 2637]):
        s = tone(f, 0.7, (1.0, 0.4), 5)
        at = int(k * 0.06 * SR)
        y[at:at + len(s)] += s
    save("golden", norm(y, 0.65))
    y = tone(1567.98, 0.6, (1.0, 0.2), 6) + tone(2093, 0.6, (0.5,), 7) * 0.5
    save("bloom", norm(y * env(len(y), 0.05, 0.4), 0.35))
    # Night ambience: a soft wind and crickets, looping.
    sec = 8.25
    wind = lp(brown(sec), 250) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.13 * t(sec)))
    crick = np.zeros(int(sec * SR))
    for _ in range(26):
        at = rng.integers(0, len(crick) - 4000)
        burst = np.sin(2 * np.pi * 4300 * t(0.16)) * (np.sin(2 * np.pi * 45 * t(0.16)) > 0.2) * env(int(0.16 * SR), 0.01, 0.05)
        crick[at:at + len(burst)] += burst * rng.uniform(0.1, 0.25)
    save("night", norm(loopify(wind * 0.9 + crick), 0.5))


if __name__ == "__main__":
    main()
