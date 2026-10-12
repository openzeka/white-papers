#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LLM Quantization Selection Guide — §19 Quantization Selection Flow
Diagram generator (PNG + SVG). Quiet palette, rounded cards,
pills on the edge labels, aligned connectors. English variant of
quantization-secim-akisi-19.py (Turkish).
"""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Polygon

FONT = "DejaVu Sans"
INK = "#22303F"      # body text
SUB = "#4A5768"      # secondary text
LINE = "#7E8CA1"     # connectors
EDGE_LBL = "#55637A"

PAL = {
    "start":  ("#ECF5EF", "#8FBA9B"),
    "normal": ("#F5F8FC", "#AEC1D8"),
    "dec":    ("#FDF6E6", "#DDB765"),
    "exit":   ("#FBEFEC", "#D49A91"),
    "end":    ("#E9F3EC", "#7FAB8D"),
}

fig, ax = plt.subplots(figsize=(11.5, 11.4))
ax.set_xlim(0, 104)
ax.set_ylim(-2.5, 106)
ax.set_aspect("equal")
ax.axis("off")
fig.patch.set_facecolor("#FFFFFF")


def card(cx, cy, w, h, title, subs=(), kind="normal",
         fs_t=12.5, fs_s=10.5, round_size=2.4):
    fc, ec = PAL[kind]
    x, y = cx - w / 2, cy - h / 2
    ax.add_patch(FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0.8,rounding_size={round_size}",
        linewidth=1.5, edgecolor=ec, facecolor=fc, zorder=3))
    if subs:
        ax.text(cx, cy + 0.17 * h, title, ha="center", va="center",
                fontsize=fs_t, fontweight="bold", color=INK,
                fontfamily=FONT, zorder=4)
        ax.text(cx, cy - 0.17 * h, "\n".join(subs), ha="center", va="center",
                fontsize=fs_s, color=SUB, fontfamily=FONT,
                zorder=4, linespacing=1.55)
    else:
        ax.text(cx, cy, title, ha="center", va="center",
                fontsize=fs_t + 0.5, fontweight="bold", color=INK,
                fontfamily=FONT, zorder=4)


def diamond(cx, cy, w, h, lines, fs=(12, 10)):
    fc, ec = PAL["dec"]
    pts = [(cx, cy + h / 2), (cx + w / 2, cy), (cx, cy - h / 2), (cx - w / 2, cy)]
    ax.add_patch(Polygon(pts, closed=True, linewidth=1.5,
                         edgecolor=ec, facecolor=fc, zorder=3))
    n = len(lines)
    for i, ln in enumerate(lines):
        size = fs[0] if i == 0 else fs[1]
        weight = "bold" if i == 0 else "normal"
        color = INK if i == 0 else SUB
        dy = (n - 1) / 2 - i
        ax.text(cx, cy + dy * (h * 0.15), ln, ha="center", va="center",
                fontsize=size, fontweight=weight, color=color,
                fontfamily=FONT, zorder=4)


def arrow(p1, p2, lw=1.7):
    ax.add_patch(FancyArrowPatch(
        p1, p2, arrowstyle="-|>", mutation_scale=17,
        linewidth=lw, color=LINE, zorder=2,
        shrinkA=0, shrinkB=0,
        connectionstyle="arc3,rad=0"))


def pill(x, y, txt):
    w = 3.2 + 1.62 * len(txt)
    h = 5.2
    ax.add_patch(FancyBboxPatch(
        (x - w / 2, y - h / 2), w, h,
        boxstyle="round,pad=0.35,rounding_size=2.6",
        linewidth=1.2, edgecolor="#C9D2DD", facecolor="#FFFFFF", zorder=5))
    ax.text(x, y, txt, ha="center", va="center", fontsize=10,
            fontweight="bold", color=EDGE_LBL, fontfamily=FONT, zorder=6)


# ------------------------------------------------------------------ nodes
card(50, 96, 58, 10,
     "1 · Define the need",
     ("speed (TTFT / tokens/s) · concurrency ·", "context · quality threshold"),
     kind="start")

diamond(50, 74, 54, 16,
        ("2 · Does my hardware carry this", "model for this need?"))

card(23, 51, 34, 9,
     "Use the original model", kind="start")

card(77, 51, 42, 20,
     "3 · Choose the quantized form",
     ("① Official FP8/FP4 release → use it",
      "② Otherwise a known publisher's quant",
      "③ Failing that: your own PTQ quant or",
      "a hardware / model change"))

diamond(77, 22, 42, 18,
        ("4 · Does the chosen form", "meet the need?",
         "(speed + concurrency + quality)"), fs=(11.5, 9.5))

card(24, 6, 38, 9,
     "Production workload test", kind="end")

card(77, 3.8, 34, 7.5,
     "Pick a model that fits your hardware", kind="exit", fs_t=11.5)


# ------------------------------------------------------------------ arrows
arrow((50, 89.8), (50, 82.4))              # 1 -> 2
arrow((23, 74), (23, 56.6))                # 2 YES -> use the original model
arrow((77, 74), (77, 62.2))                # 2 NO -> 3. quantized form
arrow((77, 40.1), (77, 31.5))              # 3 -> 4
arrow((23, 45.5), (23, 11.7))              # original -> production
arrow((56, 22), (36, 11.25))               # 4 YES -> production (diamond tip -> card top edge)
arrow((77, 12.8), (77, 8.6))               # 4 NO -> pick a model that fits your hardware

# "Pick a model that fits your hardware" -> back to 1 (from the right edge, elbows)
ax.plot([94.8, 101, 101], [3.8, 3.8, 96], color=LINE, lw=1.7,
        solid_capstyle="round", solid_joinstyle="round", zorder=2)
arrow((101, 96), (80.2, 96))

# ------------------------------------------------------------------ labels
pill(23, 65.3, "YES")
pill(77, 68.1, "NO")
pill(46, 16.8, "YES")
pill(89, 12.8, "NO")
ax.text(99, 86, "back to 1", ha="right", va="center", fontsize=10,
        style="italic", color="#8B97A8", fontfamily=FONT)

# ------------------------------------------------------------------ title + footnote
ax.text(2, 103.5, "§19 · QUANTIZATION SELECTION FLOW", ha="left", va="center",
        fontsize=10.5, fontweight="bold", color="#97A3B4", fontfamily=FONT)

fig.text(0.5, 0.015,
         '* "The original model" = the official form the model was released in; for some\n'
         '  models that is 4-bit from birth (see §17.4). A hardware shortfall does not by itself\n'
         '  mean "this model will not run" — the quantized form may be enough on the hardware you have.',
         ha="center", va="center", fontsize=9.5, color="#8B97A8",
         fontfamily=FONT, linespacing=1.6)

fig.savefig("quantization-selection-flow-19.png", dpi=200, facecolor="white",
            bbox_inches="tight")
fig.savefig("quantization-selection-flow-19.svg", facecolor="white",
            bbox_inches="tight")
print("Saved: quantization-selection-flow-19.png / .svg")