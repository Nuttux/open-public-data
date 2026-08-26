"""The spatial grid. See website/src/lib/city/DATA.md §2.

1024 m square cells, origin (-8192, -8192), 16 x 16, covering [-8192, 8192).

The size is not a convenience. `lod/BLOCK-L.md` measured the projection: at the
315 deg bearing proj() is axis-aligned, so a world metre is 1.2247 * cam.scale px
across the screen and 0.7071 * cam.scale down it, and cam.base = 0.05565 at
1440 x 940. A 1440 x 940 canvas therefore sees a diamond whose axis-aligned bound
is 22,508 m at whole-city zoom, 7,761 m at the district preset, and 3,127 m at the
block preset. At 1024 m the block frame touches ~9 cells and the free-max frame
~4: the smallest thing that can be asked for is smaller than the smallest thing
that can be seen, and a footprint cell is a useful ~35 KB rather than a 4 KB
request whose HTTP overhead exceeds its body.

The grid is in WORLD metres, not projected space, because setRot() exists — a
projected-space tiling would be invalidated by a bearing change.
"""
from __future__ import annotations

import math
import os

# ---------------------------------------------------------------------------
# THE FOUR NUMBERS BELOW ARE SAN FRANCISCO, AND NOTHING IN THIS FILE SAID SO.
#
# A grep for a city's name finds nothing here, which is exactly the failure mode
# ADR-0012 §2.2 is about: `ORIGIN = -8192, NX = NY = 16` is a 16,384 m square
# drawn around one city's origin, and `cells_of()` RAISES rather than clamps
# outside it, so a city more than 16.4 km across fails at encode time with a
# message about "the grid" rather than about itself.
#
# The box is now a named argument with a named default instead of a fact the
# module knows. `EXTENT_M` is what the assumption actually was — the half-width
# of the world this encoder is willing to tile — and `for_extent()` derives the
# same four numbers from a city's own bounding box, so the next city computes
# them rather than inheriting them.
#
# CELL is a different kind of number and it is left alone: it is DERIVED, in
# prose, from a measurement — see the module docstring and derive/MEASURED-lod.md
# — and 1024 m is a choice over those measured inputs rather than a fact about
# where San Francisco is. It travels; the box does not.
#
# Nothing about San Francisco's build changes: CITY_GRID_EXTENT_M is unset, so
# EXTENT_M is 8192.0 and all four values are what they have always been.
# ---------------------------------------------------------------------------
EXTENT_M = float(os.environ.get("CITY_GRID_EXTENT_M") or 8192.0)

CELL = 1024.0
ORIGIN_X = -EXTENT_M
ORIGIN_Y = -EXTENT_M
NX = int(round(2 * EXTENT_M / CELL))
NY = int(round(2 * EXTENT_M / CELL))


def for_extent(min_x: float, min_y: float, max_x: float, max_y: float,
               cell: float = CELL) -> dict:
    """The grid a city's OWN bounding box implies, as the manifest publishes it.

    The half-width is the largest absolute world coordinate the city reaches,
    rounded up to a whole cell, so the tiling is symmetric about the projection
    anchor the way the decoder assumes. Returns the five keys `manifest.grid`
    carries, which is the only thing the client reads — it bakes nothing.

    This is here so a second city can COMPUTE the box rather than inherit it.

    NOT VALIDATED AGAINST SAN FRANCISCO, and the reason is worth stating rather
    than hiding: the only extent recoverable from the PUBLISHED output is which
    cells have files, which is cell-granular and bounded by this grid, so
    checking `for_extent()` against it would be circular. Validating it needs the
    encoder's own pre-tiling coordinates. What can be said without circularity is
    that the populated cells run tx 0..14 and ty 0..15 of 16 — the city fills the
    box it was given in y and stops one cell short in x — which is consistent
    with 8,192 m being a real bound rather than slack, and is not proof of it.
    """
    half = max(abs(min_x), abs(max_x), abs(min_y), abs(max_y))
    half = math.ceil(half / cell) * cell
    n = int(round(2 * half / cell))
    return {"cell": cell, "originX": -half, "originY": -half, "nx": n, "ny": n}


def cell_of(x: float, y: float) -> tuple[int, int]:
    tx = int((x - ORIGIN_X) // CELL)
    ty = int((y - ORIGIN_Y) // CELL)
    if not (0 <= tx < NX and 0 <= ty < NY):
        raise ValueError(f"({x}, {y}) is outside the grid")
    return tx, ty


def cell_id(tx: int, ty: int) -> str:
    return f"{tx}_{ty}"


def cell_extent(tx: int, ty: int) -> list[float]:
    """[minX, minY, maxX, maxY] of the cell itself, world metres."""
    return [ORIGIN_X + tx * CELL, ORIGIN_Y + ty * CELL,
            ORIGIN_X + (tx + 1) * CELL, ORIGIN_Y + (ty + 1) * CELL]


def cells_of(xs, ys):
    """Vectorised cell_of. Returns (tx, ty) int arrays; raises on out of range."""
    import numpy as np

    tx = np.floor((np.asarray(xs, dtype=np.float64) - ORIGIN_X) / CELL).astype(np.int32)
    ty = np.floor((np.asarray(ys, dtype=np.float64) - ORIGIN_Y) / CELL).astype(np.int32)
    if tx.min() < 0 or tx.max() >= NX or ty.min() < 0 or ty.max() >= NY:
        raise ValueError("a feature falls outside the grid")
    return tx, ty


if __name__ == "__main__":  # pragma: no cover
    # What this module currently asserts, and what a derivation would say about
    # the same box. Prints; asserts nothing, because the check is circular (see
    # for_extent's docstring).
    print(f"in force:   cell {CELL:g}  origin ({ORIGIN_X:g}, {ORIGIN_Y:g})  "
          f"{NX} x {NY}   extent +/-{EXTENT_M:g} m")
    print(f"for_extent: {for_extent(ORIGIN_X, ORIGIN_Y, -ORIGIN_X, -ORIGIN_Y)}")
