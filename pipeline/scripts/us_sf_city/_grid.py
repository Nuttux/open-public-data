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

CELL = 1024.0
ORIGIN_X = -8192.0
ORIGIN_Y = -8192.0
NX = 16
NY = 16


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
