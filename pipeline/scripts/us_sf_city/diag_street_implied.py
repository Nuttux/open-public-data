"""D1 diagnostic — WHICH dropped centrelines does the block fabric fail to imply?

`gen/gen_geo2.py` ships classcode 0-4 and drops 5-6, and states its reason in
its own header:

    "Classes 5-6 — 11,781 residential and private lines — are dropped: the gap
     between two real blocks already IS the street."

That reason is sound on the ordinary grid and false wherever there are no
blocks. The Hunters Point Naval Shipyard is ONE assessor block, so no gap
between blocks implies anything, and the streets simply are not there — which
is Daniel's "it's not possible there's buildings without streets".

So the honest gate is not `class <= 4`. It is `class <= 4 OR the block fabric
does not imply this line`, and this script measures the second half: for every
dropped centreline, is there any published assessor block within IMPLY_M of it?

It reads only caches the mock already built and prints counts.
"""
from __future__ import annotations

import collections
import json
import math
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
MOCK = os.path.normpath(os.path.join(ROOT, "scratchpad", "sf-city-anim"))

PAPER = {"PAPER", "PAPER_FWYS", "PAPER_WATER", "PSEUDO"}
LON0, LAT0, MPD = -122.4380, 37.7600, 111320.0
KX = MPD * math.cos(math.radians(LAT0))
KY = MPD

IMPLY_M = 30.0    # half a San Francisco street plus its lots: if no block edge
                  # is within this, nothing on the page implies the street.
CELL = 20.0       # the occupancy raster. 20 m is under IMPLY_M so the 2-cell
                  # search below covers the radius with room.
FED = {"STREETS_HUNTERSP", "STREETS_TI", "STREETS_YBI",
       "PARKS_NPS_FTMASON", "PARKS_NPS_PRESIDIO"}


def block_raster():
    """Occupied 20 m cells, from the 5,404 published assessor block outlines.

    The rings are already in the renderer's world metres (geo/build_blocks.py),
    so nothing is re-projected here. Edges are walked rather than filled: a
    street is implied by a block EDGE facing it, and the interior of a 3 km
    block implies nothing about its own perimeter.
    """
    occ = set()
    for b in json.load(open(os.path.join(MOCK, "geo", "cache", "blocks.json"))):
        r = b.get("ring") or []
        for i in range(len(r)):
            ax, ay = r[i]
            bx, by = r[(i + 1) % len(r)]
            d = math.hypot(bx - ax, by - ay)
            n = max(1, int(d / (CELL / 2)))
            for k in range(n + 1):
                t = k / n
                occ.add((int((ax + (bx - ax) * t) // CELL),
                         int((ay + (by - ay) * t) // CELL)))
    return occ


def near(occ, x, y):
    cx, cy = int(x // CELL), int(y // CELL)
    r = int(math.ceil(IMPLY_M / CELL))
    for dx in range(-r, r + 1):
        for dy in range(-r, r + 1):
            if (cx + dx, cy + dy) in occ:
                return True
    return False


def main():
    occ = block_raster()
    print(f"assessor block edges rasterised: {len(occ):,} cells of {CELL:.0f} m")

    rows = json.load(open(os.path.join(MOCK, "geo", "cache", "streets.json")))
    kept = dropped = 0
    unimplied = []
    for r in rows:
        g = r.get("line")
        if not g or g.get("type") != "LineString" or len(g["coordinates"]) < 2:
            continue
        if (r.get("layer") or "") in PAPER:
            continue
        cc = (r.get("classcode") or "").strip()
        # gen_geo2.py's own rule, `int(Ln["c"] or 5) > STREET_CLS_MAX`
        cl = int(cc) if cc.isdigit() else 5
        if cl <= 4:
            kept += 1
            continue
        dropped += 1
        pts = [((c[0] - LON0) * KX, (c[1] - LAT0) * KY) for c in g["coordinates"]]
        # sample the line at ~15 m, both endpoints included
        n = 0
        hit = 0
        for i in range(len(pts) - 1):
            ax, ay = pts[i]
            bx, by = pts[i + 1]
            d = math.hypot(bx - ax, by - ay)
            steps = max(1, int(d / 15.0))
            for k in range(steps + 1):
                t = k / steps
                n += 1
                if near(occ, ax + (bx - ax) * t, ay + (by - ay) * t):
                    hit += 1
        length = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
                     for i in range(len(pts) - 1))
        if n and hit / n < 0.25:
            unimplied.append((r, length, hit / n))

    print(f"centrelines shipped today (class 0-4): {kept:,}")
    print(f"centrelines dropped (class 5-6 and null): {dropped:,}")
    print(f"\nof the dropped, NOT IMPLIED by any block edge within {IMPLY_M:.0f} m "
          f"along at least a quarter of their length:")
    print(f"  {len(unimplied):,} lines, "
          f"{sum(l for _, l, _ in unimplied)/1000:.1f} km")

    print("\n  by layer:")
    c = collections.Counter((r.get("layer") or "(none)") for r, _, _ in unimplied)
    for k, v in c.most_common(12):
        km = sum(l for r, l, _ in unimplied if (r.get("layer") or "(none)") == k) / 1000
        print(f"    {k:24s} {v:>5}  {km:7.2f} km")

    print("\n  by analysis neighbourhood:")
    c = collections.Counter((r.get("analysis_neighborhood") or "(null)")
                            for r, _, _ in unimplied)
    for k, v in c.most_common(12):
        print(f"    {k:34s} {v:>5}")

    fed = [t for t in unimplied if (t[0].get("layer") or "") in FED]
    print(f"\n  on a federal layer: {len(fed):,} "
          f"({sum(l for _, l, _ in fed)/1000:.1f} km)")
    named = sum(1 for r, _, _ in unimplied if (r.get("streetname") or "").strip())
    print(f"  carrying a published streetname: {named:,} of {len(unimplied):,}")


if __name__ == "__main__":
    main()
