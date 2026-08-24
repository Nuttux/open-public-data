"""Draw the extent argument out of the SHIPPED bytes, so it can be looked at.

Everything in the figure comes from files already published under
website/public/data/us/sf/city/:

  base/surround.qc     the regional land bit, 416 x 280 cells
                       (US Census TIGERweb hydrography + county coverage)
  base/coast.qc        San Francisco's own shoreline, DataSF
  manifest.json        the chunk grid, the projection and the camera

NOTHING here is a position I typed. The only annotation drawn from outside the
shipped files is the label text. Run:

    python3 pipeline/scripts/us_sf_reach/reach_extent_figure.py

Writes pipeline/scripts/us_sf_reach/fig-extent.png.
"""
from __future__ import annotations

import json
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from read_qc import read_qc, unpack_bits  # noqa: E402

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
DATA = ROOT / "website/public/data/us/sf/city"
OUT = pathlib.Path(__file__).resolve().parent / "fig-extent.png"

INK = "#12161c"
PAPER = "#f4f1ea"
LAND = "#cfd6c9"
CITY = "#6d7f5c"
GRID = "#c0392b"


def main() -> int:
    man = json.loads((DATA / "manifest.json").read_text())
    sur = man["surround"]
    w, h = sur["w"], sur["h"]
    wx0, wy0, wx1, wy1 = sur["world"]

    _, f = read_qc(DATA / "base/surround.qc")
    land = unpack_bits(f["land"], w * h).reshape(h, w)
    own = unpack_bits(f["own"], w * h).reshape(h, w)
    dem = f["dem"].reshape(h, w).astype(float) / 255.0 * sur["zmax"]

    # `own` is land the CITY model does not already draw, so land & ~own is
    # San Francisco's own ground as the surround pass sees it.
    city = land & ~own

    fig, ax = plt.subplots(figsize=(11, 9.5), dpi=150)
    fig.patch.set_facecolor(PAPER)
    ax.set_facecolor("#dde5ea")

    ext = (wx0 / 1000, wx1 / 1000, wy0 / 1000, wy1 / 1000)  # km

    shade = np.where(land, 0.35 + 0.65 * (dem / max(dem.max(), 1.0)) ** 0.5, np.nan)
    ax.imshow(shade, origin="lower", extent=ext, cmap="Greys", vmin=0, vmax=1.6,
              interpolation="nearest", alpha=0.55)
    ax.imshow(np.where(land, 1.0, np.nan), origin="lower", extent=ext,
              cmap=matplotlib.colors.ListedColormap([LAND]), interpolation="nearest", alpha=0.55)
    ax.imshow(np.where(city, 1.0, np.nan), origin="lower", extent=ext,
              cmap=matplotlib.colors.ListedColormap([CITY]), interpolation="nearest", alpha=0.95)

    # the chunk grid — everything the reader can actually reach
    g = man["grid"]
    gx0, gy0 = g["originX"] / 1000, g["originY"] / 1000
    gw = g["nx"] * g["cell"] / 1000
    gh = g["ny"] * g["cell"] / 1000
    ax.add_patch(Rectangle((gx0, gy0), gw, gh, fill=False, ec=GRID, lw=2.2, zorder=6))
    ax.annotate(
        f"the chunk grid — {gw:.1f} km square\nthe only ground the camera lets you reach",
        xy=(gx0 + gw, gy0), xytext=(gx0 + gw + 1.2, gy0 - 3.0),
        color=GRID, fontsize=9.5, weight="bold", zorder=7,
        arrowprops=dict(arrowstyle="-", color=GRID, lw=1.1),
    )

    ax.add_patch(Rectangle((wx0 / 1000, wy0 / 1000), (wx1 - wx0) / 1000, (wy1 - wy0) / 1000,
                           fill=False, ec=INK, lw=1.4, ls=(0, (5, 3)), zorder=6))
    ax.annotate(
        f"the surround plate ALREADY SHIPS — {(wx1-wx0)/1000:.1f} x {(wy1-wy0)/1000:.1f} km\n"
        f"TIGERweb shoreline + USGS 3DEP elevation, {sur['landCells']:,} land cells",
        xy=(wx0 / 1000 + 0.4, wy1 / 1000 - 1.4), color=INK, fontsize=9.5, weight="bold", zorder=7)

    ax.set_xlim(wx0 / 1000, wx1 / 1000)
    ax.set_ylim(wy0 / 1000, wy1 / 1000)
    ax.set_aspect("equal")
    ax.set_xlabel("world km east of lon −122.438", fontsize=9)
    ax.set_ylabel("world km north of lat 37.760", fontsize=9)
    ax.set_title(
        "The peninsula is already in the file. The camera is what stops at the county line.",
        fontsize=12.5, weight="bold", color=INK, pad=12)
    ax.grid(True, color="#ffffff", lw=0.5, alpha=0.45)
    for s in ax.spines.values():
        s.set_color("#9aa3ad")

    fig.tight_layout()
    fig.savefig(OUT, facecolor=PAPER)
    print(f"wrote {OUT}")
    print(f"  chunk grid   {gw:.1f} x {gh:.1f} km = {gw*gh:,.0f} km2")
    print(f"  surround     {(wx1-wx0)/1000:.1f} x {(wy1-wy0)/1000:.1f} km = "
          f"{(wx1-wx0)*(wy1-wy0)/1e6:,.0f} km2  "
          f"({(wx1-wx0)*(wy1-wy0)/1e6/(gw*gh):.1f}x the reachable grid)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
