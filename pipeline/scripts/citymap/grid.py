"""The world tiling: a square grid of cells over a city's projected metres.

WHAT IS TRUE OF A CITY HERE. A chunked map needs the ground cut into cells so
the client can ask for the ground it can see and no more. The cut needs four
numbers — a cell size, an origin, and how many cells in each direction — and the
arithmetic over them is the same arithmetic everywhere.

WHAT WAS TRUE OF SAN FRANCISCO AND IS NO LONGER HERE. Those four numbers used to
be module constants: `ORIGIN = -8192, NX = NY = 16`, a 16,384 m square drawn
around one city's projection anchor, with `cells_of()` RAISING rather than
clamping outside it. A city more than 16.4 km across therefore failed at encode
time with a message about "the grid" rather than about itself, and no grep for a
city's name would ever have found the number. It is the exact failure mode
ADR-0012 §2.2 names: a number that is really a name.

They are arguments now. `Grid` holds them, `for_extent()` derives them from a
city's own bounding box, and this module has no default box to inherit — the box
that San Francisco uses lives with San Francisco, in
`pipeline/scripts/us_sf_city/_grid.py`.

THE CELL SIZE IS A DIFFERENT KIND OF NUMBER and this module does not choose one
either. What it can state without a city in it is what a cell size has to
satisfy, because that is a property of the camera and the transport rather than
of the ground:

  * the smallest frame a reader can ask for should touch a handful of cells, not
    one — otherwise the smallest thing that can be requested is larger than the
    smallest thing that can be seen;
  * a cell's payload should be worth a request. A 4 KB body behind an HTTP
    round trip is mostly overhead.

Both are measurements of a particular renderer at a particular canvas size, so
both are made per city. San Francisco's are in `derive/MEASURED-lod.md`.

THE GRID IS IN WORLD METRES, NOT PROJECTED SPACE, and that is generic: a bearing
can be changed at runtime, and a tiling in projected space would be invalidated
by the change.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Grid:
    """Four numbers and the arithmetic over them. No city, no default."""

    cell: float
    origin_x: float
    origin_y: float
    nx: int
    ny: int

    # -- the manifest's own view of the grid ------------------------------
    def manifest(self) -> dict:
        """The five keys `manifest.grid` carries — the only thing the client
        reads about the tiling. It bakes nothing; changing the grid is a
        rebuild, not a client release."""
        return {"cell": self.cell, "originX": self.origin_x,
                "originY": self.origin_y, "nx": self.nx, "ny": self.ny}

    # -- a point -> its cell ----------------------------------------------
    def cell_of(self, x: float, y: float) -> tuple[int, int]:
        tx = int((x - self.origin_x) // self.cell)
        ty = int((y - self.origin_y) // self.cell)
        if not (0 <= tx < self.nx and 0 <= ty < self.ny):
            raise ValueError(f"({x}, {y}) is outside the grid")
        return tx, ty

    def cell_id(self, tx: int, ty: int) -> str:
        return f"{tx}_{ty}"

    def cell_extent(self, tx: int, ty: int) -> list[float]:
        """[minX, minY, maxX, maxY] of the cell itself, world metres."""
        return [self.origin_x + tx * self.cell, self.origin_y + ty * self.cell,
                self.origin_x + (tx + 1) * self.cell,
                self.origin_y + (ty + 1) * self.cell]

    def cells_of(self, xs, ys):
        """Vectorised `cell_of`. Returns (tx, ty) int arrays.

        RAISES rather than clamps, and that is deliberate: a feature outside the
        tiled world is a fact about the box being wrong, not about the feature.
        Clamping it would pile the city's edge into one cell and look like data.
        """
        import numpy as np

        tx = np.floor((np.asarray(xs, dtype=np.float64) - self.origin_x)
                      / self.cell).astype(np.int32)
        ty = np.floor((np.asarray(ys, dtype=np.float64) - self.origin_y)
                      / self.cell).astype(np.int32)
        if tx.min() < 0 or tx.max() >= self.nx or ty.min() < 0 or ty.max() >= self.ny:
            raise ValueError("a feature falls outside the grid")
        return tx, ty


def for_extent(min_x: float, min_y: float, max_x: float, max_y: float,
               cell: float) -> Grid:
    """The grid a city's OWN bounding box implies.

    The half-width is the largest absolute world coordinate the city reaches,
    rounded up to a whole cell, so the tiling stays symmetric about the
    projection anchor the way the decoder assumes.

    This exists so a second city COMPUTES its box rather than inheriting one.

    NOT VALIDATED AGAINST THE CITY THAT IS SHIPPED, and the reason is worth
    stating rather than hiding: the only extent recoverable from a PUBLISHED
    output is which cells have files, which is cell-granular and bounded by the
    grid that produced it, so checking `for_extent()` against it would be
    circular. Validating it needs the encoder's own pre-tiling coordinates.
    """
    half = max(abs(min_x), abs(max_x), abs(min_y), abs(max_y))
    half = math.ceil(half / cell) * cell
    n = int(round(2 * half / cell))
    return Grid(cell=cell, origin_x=-half, origin_y=-half, nx=n, ny=n)
