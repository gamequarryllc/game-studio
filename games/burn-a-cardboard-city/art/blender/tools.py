"""The giant's tools, held in front of the first-person camera. Each points along +Y
(the game turns them toward the crosshair); the grip is at the origin.

  magnifier  a magnifying glass (wooden handle, brass rim): focuses skylight
  candle     a fat candle in a brass holder: drips burning wax
  blowtorch  a gas canister with a brass valve and a long nozzle
  launcher   a cardboard tube with a grip: fires firework rockets
"""
import math

from kit import (BRASS, CARD, CREAM, INK, KRAFT, KRAFT_DARK, KRAFT_PALE, PAPER, RED, SHINY, SKYBLUE, STEEL, TAPE_COL,
                 WAX, WOOD, YELLOW, Model, srgb)

FWD = (math.pi / 2, 0, 0)   # rotates +Z (a cylinder's axis) onto +Y... see cylinder(rot=)


def magnifier(seed=71):
    m = Model("magnifier", seed)
    m.cylinder((0, 0, -0.2), 0.022, 0.2, WOOD, 10, CARD, cuts=1, radius_top=0.018)
    m.cylinder((0, 0, -0.005), 0.026, 0.035, BRASS, 10, SHINY, cuts=0)
    rot = (-math.pi / 2, 0, 0)
    m.tube((0, -0.012, 0.13), 0.11, 0.024, BRASS, BRASS, 0.016, 28, SHINY, rot=rot)
    m.cylinder((0, -0.008, 0.13), 0.096, 0.016, srgb("#cfe8f2"), 28, 0.0, rot=rot, cuts=0, smooth=True, jitter=0.0)  # glass (flag 0)
    return m.build()


def candle(seed=72):
    m = Model("candle", seed)
    m.cylinder((0, 0, -0.02), 0.075, 0.02, BRASS, 18, SHINY, cuts=0, jitter=0.0)
    m.tube((0.085, 0, -0.012), 0.025, 0.012, BRASS, BRASS, 0.008, 12, SHINY, rot=(math.pi / 2, 0, 0))
    m.cylinder((0, 0, 0.0), 0.034, 0.17, WAX, 16, PAPER, cuts=2)
    for k in range(5):
        a = k * 1.3 + 0.4
        m.ball((math.cos(a) * 0.033, math.sin(a) * 0.033, 0.15 - k * 0.012), 0.012, srgb("#f6f0e2"), PAPER, 1, 0.1)
    m.cylinder((0, 0, 0.17), 0.003, 0.022, INK, 6, CARD, cuts=0, jitter=0.0)
    return m.build()


def blowtorch(seed=73):
    m = Model("blowtorch", seed)
    m.cylinder((0, 0, -0.17), 0.052, 0.17, srgb("#2f6db5"), 18, SHINY, cuts=1, jitter=0.0)
    m.cylinder((0, 0, -0.012), 0.04, 0.03, srgb("#2f6db5"), 18, SHINY, cuts=0, radius_top=0.024, jitter=0.0)
    m.box((0, 0, -0.1), (0.106, 0.002, 0.07), srgb("#f2efe6"), SHINY, cuts=(0, 0, 0), bevel=0.0, jitter=0.0)
    m.box((0, 0.0, 0.03), (0.04, 0.05, 0.04), BRASS, SHINY, cuts=(0, 0, 0), bevel=0.008, jitter=0.0)
    m.cylinder((0.032, 0.0, 0.03), 0.014, 0.022, srgb("#222222"), 10, SHINY, rot=(0, math.pi / 2, 0), cuts=0,
               jitter=0.0)
    m.cylinder((0, 0.02, 0.04), 0.011, 0.19, STEEL, 10, SHINY, rot=(-math.pi / 2, 0, 0), cuts=1, jitter=0.0)
    m.cylinder((0, 0.2, 0.04), 0.014, 0.03, srgb("#444444"), 10, SHINY, rot=(-math.pi / 2, 0, 0), cuts=0,
               jitter=0.0)
    return m.build()


def launcher(seed=74):
    m = Model("launcher", seed)
    rot = (-math.pi / 2, 0, 0)
    m.tube((0, -0.12, 0.0), 0.055, 0.42, srgb("#c84a34"), srgb("#3d2a1e"), 0.008, 18, CARD, rot=rot)
    m.cylinder((0, -0.125, 0.0), 0.057, 0.012, KRAFT, 18, CARD, rot=rot, cuts=0, jitter=0.0)  # the end cap you hold
    for y in (-0.06, 0.08, 0.22):
        m.cylinder((0, y, 0), 0.0575, 0.03, TAPE_COL if y > 0.1 else YELLOW, 18, 0.5, rot=rot, caps=False, cuts=0,
                   jitter=0.0)
    m.cylinder((0, -0.08, -0.06), 0.02, 0.1, KRAFT_DARK, 8, CARD, cuts=0, rot=(0.3, 0, 0))
    m.box((0, 0.05, 0.065), (0.012, 0.03, 0.02), INK, cuts=(0, 0, 0), bevel=0.003, jitter=0.0)
    m.decal("star", (0.056, 0.05, 0.0), (1, 0, 0), 0.06, lift=0.004)
    return m.build()


def build():
    return [magnifier(), candle(), blowtorch(), launcher()]
