"""San Francisco's tiling: the four numbers, and where they come from.

The grid ARITHMETIC is `citymap/grid.py` and carries no city. What is here is
this city's instance of it — a cell size, a box, and the derivation of each.

── THE CELL SIZE, AND IT IS DERIVED RATHER THAN PICKED ───────────────────────
1024 m is not a convenience. `derive/MEASURED-lod.md` measured the projection:
at the 315 deg bearing proj() is axis-aligned, so a world metre is
1.2247 * cam.scale px across the screen and 0.7071 * cam.scale down it, and
cam.base = 0.05565 at 1440 x 940. A 1440 x 940 canvas therefore sees a diamond
whose axis-aligned bound is 22,508 m at whole-city zoom, 7,761 m at the district
preset, and 3,127 m at the block preset. At 1024 m the block frame touches
~9 cells and the free-max frame ~4: the smallest thing that can be asked for is
smaller than the smallest thing that can be seen, and a footprint cell is a
useful ~35 KB rather than a 4 KB request whose HTTP overhead exceeds its body.

Every input to that paragraph is a measurement of one city at one canvas size.
The two properties the number has to satisfy are generic and are stated in
`citymap/grid.py`; the number that satisfies them here is San Francisco's.

── THE BOX, WHICH WAS SAN FRANCISCO AND SAID SO NOWHERE ──────────────────────
`ORIGIN = -8192, NX = NY = 16` is a 16,384 m square drawn around this city's
projection anchor, and it used to live in the shared module with `cells_of()`
RAISING outside it — so a city more than 16.4 km across failed at encode time
with a message about "the grid" rather than about itself. A grep for a city's
name found nothing, which is exactly ADR-0012 §2.2's failure mode.

`EXTENT_M` is what the assumption actually was: the half-width of the world this
encoder is willing to tile. It is declared here, in this city's file, and
`citymap.grid.for_extent()` is how the NEXT city computes its own from its
bounding box instead of inheriting this one.

Nothing about San Francisco's build changes. `CITY_GRID_EXTENT_M` is unset, so
`EXTENT_M` is 8192.0 and all four values are what they have always been.
"""
from __future__ import annotations

import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from citymap.grid import Grid, for_extent  # noqa: E402,F401

EXTENT_M = float(os.environ.get("CITY_GRID_EXTENT_M") or 8192.0)
CELL = 1024.0

SF = Grid(cell=CELL, origin_x=-EXTENT_M, origin_y=-EXTENT_M,
          nx=int(round(2 * EXTENT_M / CELL)), ny=int(round(2 * EXTENT_M / CELL)))

# The names the encoder and the verifier already import. They are this city's
# grid, spelled out, so no call site had to change to make the box an argument.
ORIGIN_X = SF.origin_x
ORIGIN_Y = SF.origin_y
NX = SF.nx
NY = SF.ny

cell_of = SF.cell_of
cell_id = SF.cell_id
cell_extent = SF.cell_extent
cells_of = SF.cells_of


if __name__ == "__main__":  # pragma: no cover
    # What this module asserts, and what a derivation would say about the same
    # box. Prints; asserts nothing, because the check is circular — see
    # citymap.grid.for_extent's docstring.
    print(f"in force:   {SF}")
    print(f"for_extent: {for_extent(ORIGIN_X, ORIGIN_Y, -ORIGIN_X, -ORIGIN_Y, CELL)}")
