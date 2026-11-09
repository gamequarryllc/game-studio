#!/usr/bin/env python3
"""Generates every sound effect and ambience loop for Dig to the Core.

All audio is synthesised here from noise, sine waves and envelopes (no stock
sounds), so it is original and can be rebuilt or retuned at any time:

    python3 art/audio/make_sfx.py            # from the project folder

Needs numpy, scipy and ffmpeg (with libvorbis). Writes audio/sfx/*.ogg.
Loops (names ending in _loop, and amb_*) are cross-faded so they repeat
without a click.
"""
import os
import subprocess
import tempfile
import wave

import numpy as np
from scipy import signal

SR = 22050
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "audio", "sfx")
rng = np.random.default_rng(20261109)


# --- Building blocks ----------------------------------------------------------------------
def t_axis(dur):
    return np.arange(int(SR * dur)) / SR


def noise(dur):
    return rng.uniform(-1.0, 1.0, int(SR * dur))


def bandpass(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi / (SR / 2), 0.99)], btype="band")
    return signal.lfilter(b, a, x)


def lowpass(x, f, order=2):
    b, a = signal.butter(order, min(f / (SR / 2), 0.99), btype="low")
    return signal.lfilter(b, a, x)


def highpass(x, f, order=2):
    b, a = signal.butter(order, f / (SR / 2), btype="high")
    return signal.lfilter(b, a, x)


def env_exp(dur, decay, attack=0.002):
    t = t_axis(dur)
    e = np.exp(-t / decay)
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return e * a


def sine(freq, dur, phase=0.0):
    t = t_axis(dur)
    if callable(freq):
        f = freq(t)
        return np.sin(2 * np.pi * np.cumsum(f) / SR + phase)
    return np.sin(2 * np.pi * freq * t + phase)


def saw(freq, dur):
    t = t_axis(dur)
    return 2.0 * ((t * freq) % 1.0) - 1.0


def pad(x, dur):
    n = int(SR * dur)
    if len(x) >= n:
        return x[:n]
    return np.concatenate([x, np.zeros(n - len(x))])


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def place(dst, src, at):
    i = int(at * SR)
    j = min(len(dst), i + len(src))
    if i < len(dst):
        dst[i:j] += src[: j - i]
    return dst


def norm(x, peak=0.9):
    m = np.max(np.abs(x))
    return x if m < 1e-9 else x / m * peak


def fade(x, fin=0.003, fout=0.02):
    n = len(x)
    a = min(int(SR * fin), n // 2)
    b = min(int(SR * fout), n // 2)
    if a > 0:
        x[:a] *= np.linspace(0, 1, a)
    if b > 0:
        x[-b:] *= np.linspace(1, 0, b)
    return x


def loopify(x, xfade=0.15):
    """Cross-fades the tail into the head so the sound loops seamlessly."""
    n = int(SR * xfade)
    head = x[:n].copy()
    tail = x[-n:].copy()
    ramp = np.linspace(0, 1, n)
    x = x[:-n].copy()
    x[:n] = head * ramp + tail * (1 - ramp)
    return x


def bell(freq, dur, decay=0.5, ratios=(1.0, 2.76, 5.4, 8.93), amps=(1.0, 0.5, 0.25, 0.12)):
    out = np.zeros(int(SR * dur))
    for r, a in zip(ratios, amps):
        out += a * sine(freq * r, dur) * env_exp(dur, decay / (1 + 0.6 * r))
    return out


def write(name, x, loop=False):
    x = np.asarray(x, dtype=np.float64)
    if not loop:
        x = fade(x)
    x = np.clip(x, -1.0, 1.0)
    pcm = (x * 32767).astype(np.int16)
    os.makedirs(OUT, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        path = tmp.name
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    dst = os.path.join(OUT, name + ".ogg")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path, "-c:a", "libvorbis", "-q:a", "3", dst], check=True)
    os.remove(path)
    print("wrote", name)


# --- Digging ---------------------------------------------------------------------------------
def crunch(dur, lo, hi, decay, grit=60):
    x = bandpass(noise(dur), lo, hi) * env_exp(dur, decay, 0.004)
    # Grit: little cracks inside the crunch.
    for _ in range(grit):
        at = rng.uniform(0, dur * 0.7)
        c = highpass(noise(0.004), 2000) * rng.uniform(0.2, 0.7)
        place(x, c * np.exp(-at / decay), at)
    return x


def make_digging():
    for i in range(1, 4):
        thud = sine(lambda t: 95 - 40 * t, 0.12) * env_exp(0.12, 0.035)
        scoop = crunch(0.32, 250 + 60 * i, 2200, 0.08)
        slide = bandpass(noise(0.3), 600, 1800) * env_exp(0.3, 0.12, 0.05) * 0.25
        write("shovel_%d" % i, norm(mix(thud * 0.8, scoop, slide * 0.5)))
    for i in range(1, 4):
        f = 2050 * (1 + 0.06 * i)
        ping = bell(f, 0.45, 0.35, (1.0, 1.58, 2.41, 3.9), (1.0, 0.6, 0.35, 0.2))
        crack = crunch(0.2, 900, 6000, 0.03, 30)
        thump = sine(140, 0.08) * env_exp(0.08, 0.02)
        write("pick_clink_%d" % i, norm(mix(ping * 0.45, crack, thump * 0.6)))
    for i in range(1, 4):
        thud = sine(lambda t: 120 - 60 * t, 0.15) * env_exp(0.15, 0.04)
        dirt = crunch(0.28, 200, 1600, 0.07)
        write("pick_thud_%d" % i, norm(mix(thud, dirt * 0.8)))
    for i in range(1, 3):
        dur = 0.7
        x = np.zeros(int(SR * dur))
        for _ in range(45):
            at = rng.uniform(0, dur * 0.8)
            g = lowpass(noise(0.03), rng.uniform(800, 2500)) * env_exp(0.03, 0.01) * rng.uniform(0.3, 1.0)
            place(x, g * (1 - at / dur), at)
        x += lowpass(noise(dur), 300) * env_exp(dur, 0.25) * 0.6
        write("crumble_%d" % i, norm(x))
    # Tool loops: an exact number of cycles so they repeat cleanly.
    dur = 1.0
    x = np.zeros(int(SR * dur))
    for k in range(18):
        hit = mix(bandpass(noise(0.03), 400, 3500) * env_exp(0.03, 0.008), sine(110, 0.04) * env_exp(0.04, 0.012) * 0.8)
        place(x, hit, k / 18.0)
    x += saw(54, dur) * 0.08 + lowpass(noise(dur), 200) * 0.1
    write("jackhammer_loop", norm(x, 0.8), loop=True)
    t = t_axis(dur)
    whine = saw(220, dur) * 0.25 + np.sin(2 * np.pi * 440 * t) * 0.15 + np.sin(2 * np.pi * 660 * t + np.sin(2 * np.pi * 6 * t)) * 0.08
    whine = lowpass(whine, 2500) + bandpass(noise(dur), 1500, 5000) * 0.12
    write("drill_loop", norm(whine, 0.7), loop=True)
    las = (np.sin(2 * np.pi * 880 * t) * 0.3 + np.sin(2 * np.pi * 1320 * t) * 0.2) * (0.75 + 0.25 * np.sin(2 * np.pi * 12 * t))
    las += highpass(noise(dur), 4000) * 0.08
    write("laser_loop", norm(las, 0.6), loop=True)
    bor = saw(45, dur) * 0.4 + saw(90, dur) * 0.15
    bor = lowpass(bor, 400) * (0.8 + 0.2 * np.sin(2 * np.pi * 6 * t)) + bandpass(noise(dur), 300, 2000) * 0.25 * (0.6 + 0.4 * np.sin(2 * np.pi * 6 * t))
    write("borer_loop", norm(bor, 0.8), loop=True)
    g = bandpass(noise(1.15), 900, 4500)
    g *= 0.7 + 0.3 * lowpass(rng.uniform(-1, 1, len(g)), 18) * 4
    write("grind_loop", norm(loopify(g), 0.6), loop=True)


def make_blasting():
    w = bandpass(noise(0.3), 300, 3000) * np.sin(np.linspace(0, np.pi, int(SR * 0.3))) ** 2
    write("throw", norm(w, 0.6))
    f = highpass(noise(0.9), 3000)
    f *= (rng.uniform(0, 1, len(f)) > 0.6) * 1.0
    write("fuse", norm(lowpass(f, 8000) * env_exp(0.9, 0.8), 0.5))
    dur = 1.8
    boom = lowpass(noise(dur), 500) * env_exp(dur, 0.35, 0.003)
    sub = sine(lambda t: 70 - 30 * t, dur) * env_exp(dur, 0.25)
    debris = crunch(dur, 300, 3000, 0.5, 120) * 0.4
    write("boom", norm(mix(boom, sub * 0.9, debris)))


# --- Rewards and finds ------------------------------------------------------------------------
def make_rewards():
    ping = mix(bell(1568, 0.4, 0.3, (1.0, 2.0, 3.0), (1.0, 0.3, 0.1)), bell(2350, 0.4, 0.2, (1.0,), (0.5,)))
    write("ore_ping", norm(ping, 0.6))
    def arp(notes, step, dur, decay=0.35):
        x = np.zeros(int(SR * dur))
        for k, n in enumerate(notes):
            place(x, bell(n, dur - k * step, decay, (1.0, 2.0, 3.0, 4.2), (1.0, 0.35, 0.15, 0.06)), k * step)
        return x
    write("find_0", norm(arp([1047, 1319, 1568], 0.08, 0.8)))
    sp = highpass(noise(1.2), 6000) * env_exp(1.2, 0.4) * 0.15
    write("find_1", norm(mix(arp([784, 988, 1175, 1568], 0.09, 1.2, 0.45), sp)))
    chord = mix(*[bell(f, 2.0, 0.9, (1.0, 2.0, 3.0), (1.0, 0.3, 0.1)) for f in (523, 659, 784, 1047)])
    write("find_2", norm(mix(arp([523, 659, 784, 1047, 1319], 0.1, 2.0, 0.6), chord * 0.4, sp * 1.5)))
    write("pocket", norm(mix(bell(2600, 0.3, 0.12, (1.0, 1.5), (1.0, 0.4)), bandpass(noise(0.25), 1000, 4000) * env_exp(0.25, 0.05) * 0.3), 0.6))
    write("reward", norm(mix(arp([880, 1109, 1319, 1760], 0.06, 0.9, 0.3), sp * 0.6)))
    write("offer", norm(arp([1319, 1760], 0.07, 0.5, 0.2), 0.5))
    # A new zone: a deep, slow gong with a rumble under it.
    dur = 2.6
    gong = bell(65, dur, 1.6, (1.0, 2.04, 2.97, 4.1), (1.0, 0.6, 0.4, 0.2))
    rum = lowpass(noise(dur), 120) * env_exp(dur, 0.9, 0.2) * 0.8
    write("zone", norm(mix(gong, rum)))
    dur = 3.4
    x = np.zeros(int(SR * dur))
    for k, n in enumerate([523, 659, 784, 1047]):
        place(x, bell(n, 0.5, 0.25, (1.0, 2.0, 3.0), (1.0, 0.4, 0.15)), k * 0.14)
    for f in (523, 659, 784, 1047, 1319):
        place(x, bell(f, 2.6, 1.2, (1.0, 2.0, 3.0), (1.0, 0.3, 0.1)) * 0.5, 0.65)
    write("victory", norm(x))


# --- The lift and the shop ----------------------------------------------------------------------
def make_lift_and_ui():
    ding = bell(1180, 1.4, 0.7, (1.0, 2.4, 3.9, 5.6), (1.0, 0.5, 0.3, 0.15))
    x = np.zeros(int(SR * 1.7))
    place(x, ding, 0.0)
    place(x, ding * 0.8, 0.32)
    write("lift_bell", norm(x, 0.7))
    dur = 2.0
    t = t_axis(dur)
    rattle = lowpass(noise(dur), 180) * 0.6 + saw(38, dur) * 0.12
    for k in range(10):
        clank = bandpass(noise(0.05), 800, 3000) * env_exp(0.05, 0.015) * rng.uniform(0.3, 0.8)
        place(rattle, clank, k * 0.2 + rng.uniform(0, 0.05))
    write("lift_loop", norm(loopify(np.concatenate([rattle, rattle[: int(SR * 0.15)]])), 0.7), loop=True)
    clunk = mix(sine(lambda t: 90 - 40 * t, 0.4) * env_exp(0.4, 0.08), bandpass(noise(0.3), 300, 2500) * env_exp(0.3, 0.05) * 0.6)
    write("lift_stop", norm(clunk))
    reg = mix(bell(1760, 0.8, 0.4, (1.0, 2.0), (1.0, 0.3)), bell(2637, 0.8, 0.3, (1.0,), (0.6,)))
    coins = np.zeros(int(SR * 0.8))
    for _ in range(14):
        place(coins, bell(rng.uniform(3000, 5000), 0.15, 0.05, (1.0,), (1.0,)) * rng.uniform(0.2, 0.5), rng.uniform(0.05, 0.4))
    write("buy_tool", norm(mix(clunk[: int(SR * 0.12)] * 0.6, reg, coins * 0.5)))
    up = sine(lambda t: 600 + 900 * t / 0.3, 0.3) * env_exp(0.3, 0.12) * 0.5
    write("buy_upgrade", norm(mix(up, bell(1568, 0.3, 0.1, (1.0,), (0.5,)))))
    squeak = sine(lambda t: 1800 + 900 * np.sin(np.pi * t / 0.2), 0.2) * env_exp(0.2, 0.08)
    write("hire", norm(squeak, 0.5))
    buzz = lowpass(saw(110, 0.28), 1200) * env_exp(0.28, 0.12)
    write("cant_afford", norm(buzz, 0.5))
    write("click", norm(highpass(noise(0.025), 2000) * env_exp(0.025, 0.004), 0.5))
    latch = mix(bandpass(noise(0.08), 1000, 5000) * env_exp(0.08, 0.01), bell(900, 0.2, 0.06, (1.0, 2.7), (1.0, 0.4)) * 0.4)
    write("ui_open", norm(latch, 0.6))
    write("ui_close", norm(latch[::-1].copy() * np.linspace(0.3, 1.0, len(latch)), 0.5))


# --- Moving about -----------------------------------------------------------------------------------
def make_body():
    for i in range(1, 4):
        write("step_grass_%d" % i, norm(bandpass(noise(0.1), 1500, 6000) * env_exp(0.1, 0.03, 0.01), 0.5))
        write("step_dirt_%d" % i, norm(mix(crunch(0.12, 300, 2500, 0.03, 15), sine(80, 0.06) * env_exp(0.06, 0.02) * 0.5), 0.5))
        write("step_rock_%d" % i, norm(mix(crunch(0.1, 800, 5000, 0.02, 10), bell(rng.uniform(700, 900), 0.08, 0.02, (1.0, 2.3), (0.4, 0.2))), 0.5))
    write("jump", norm(bandpass(noise(0.15), 400, 1600) * env_exp(0.15, 0.05, 0.02), 0.4))
    write("land", norm(mix(sine(lambda t: 90 - 50 * t, 0.25) * env_exp(0.25, 0.06), crunch(0.2, 200, 1800, 0.05, 20) * 0.7)))
    write("mole_dig", norm(mix(crunch(0.1, 500, 3000, 0.025, 10), crunch(0.1, 500, 3000, 0.025, 10)[::-1] * 0.0), 0.5))
    write("detector", norm(sine(1500, 0.07) * env_exp(0.07, 0.03), 0.4))


def make_ambience():
    dur = 8.0
    t = t_axis(dur + 0.4)
    wind = lowpass(noise(dur + 0.4), 500) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.13 * t))
    birds = np.zeros(len(t))
    for _ in range(9):
        at = rng.uniform(0.2, dur - 0.6)
        f0 = rng.uniform(2200, 3600)
        for k in range(rng.integers(2, 5)):
            chirp = sine(lambda tt: f0 + 1400 * np.sin(np.pi * tt / 0.09), 0.09) * env_exp(0.09, 0.04, 0.01)
            place(birds, chirp * rng.uniform(0.3, 0.7), at + k * 0.12)
    write("amb_birds", norm(loopify(wind * 0.5 + birds * 0.6, 0.4), 0.5), loop=True)
    drone = lowpass(noise(dur + 0.4), 140) * 1.4 + bandpass(noise(dur + 0.4), 200, 500) * 0.15
    drips = np.zeros(len(t))
    for _ in range(7):
        at = rng.uniform(0.2, dur - 0.5)
        drop = sine(lambda tt: 1700 - 900 * tt / 0.12, 0.12) * env_exp(0.12, 0.03)
        place(drips, drop * rng.uniform(0.2, 0.5), at)
    write("amb_cave", norm(loopify(drone * 0.6 + drips, 0.4), 0.5), loop=True)


if __name__ == "__main__":
    make_digging()
    make_blasting()
    make_rewards()
    make_lift_and_ui()
    make_body()
    make_ambience()
