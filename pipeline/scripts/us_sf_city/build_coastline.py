#!/usr/bin/env python3
"""THE SHORELINE AS THE GROUND'S OWN ZERO, AND NOT AS A SECOND REGISTER.

── THE SHAPE OF EVERY COAST DEFECT IN THIS RENDERER ─────────────────────────
The land knows where it stops and the water knows where it starts, and they
are two different files. `terrain.ts` §THE COAST cuts the ground at one union
of rings; `water.ts` §THE PLATE IS CUT asks the same question the other way
round; `surround.ts` §THE FAR SHORE cuts the region at a third. Each is right
about itself and they disagree at their own grains, and every one of the day's
coast bugs has been that disagreement showing through.

`base/surround-coast.json` carries **3,168 vertices for the whole region** —
45.8 x 39.0 km of some of the most intricate shoreline in North America, at
about one vertex every hundred metres.

── SO THE COAST STOPS BEING A REGISTER AND BECOMES A MEASUREMENT ───────────
`build_bathy.py` brought in NOAA NCEI's San Francisco Bay Coastal DEM: an
INTEGRATED bathymetric-topographic model, one continuous surface through the
waterline, on the **MHW** datum. On that datum zero is not a contour anyone
chose — it is the shore, the same line a chart draws.

So this does not fetch a shoreline. It fetches the surface and finds where it
crosses zero, at the DEM's own 1/3 arc-second — about **10.3 m N-S and 8.1 m
E-W**. Nothing about the coast is asserted here that the elevation does not
already say.

── MARCHING SQUARES, AND WHY THE STITCH NEEDS NO EPSILON ───────────────────
A crossing always lies on a grid EDGE, so it is identified exactly by which
edge it is on — `(0, j, i)` for the horizontal edge east of node (j, i), and
`(1, j, i)` for the vertical edge north of it. Segments are therefore linked
by integer keys and not by comparing floats with a tolerance, which is the
usual way a contour stitcher grows hairline gaps.

The two ambiguous cases (5 and 10, where opposite corners are land) are
resolved the same way every time. At 10 m the choice decides whether a
one-cell isthmus joins or parts, and consistency matters more than which.

── AND IT IS SIMPLIFIED, FOR THE SAME REASON THE DEPTH WAS ─────────────────
Full resolution the contour is hundreds of thousands of vertices, most of them
on the staircase of the sampling lattice rather than on the coast. Douglas-
Peucker at `--tol` metres removes the ones that carry nothing: the default 4 m
is under half a DEM cell, so no real headland moves, and it is well under one
screen pixel at every camera the far shore is ever seen at (8.05 m/px at the
whole-city stop, 3.35 at district).

Rings shorter than `--min-perim` are dropped. That is a real editorial cut and
it is logged: at the default 400 m it keeps Alcatraz and Angel Island and
drops rocks that cannot be a pixel.

── §THE MUDFLATS — WHY THERE ARE THOUSANDS OF FRAGMENTS, AND WHY THAT IS
   THE DATA AND NOT THE STITCHER ────────────────────────────────────────────
The contour comes out as a few long rings and a great many tiny ones: at full
resolution, 214 kept and **3,225 dropped** under 400 m. That looks like a
traversal that is shredding a coastline, and it was worth ruling out — a
bidirectional walk was added on exactly that theory and the output was
byte-identical, which is what the argument in `walk` predicts for closed
rings.

The measurement that settles it is the two strides:

    stride 4, cells 41 x 33 m   1,186 polylines,  1,056 dropped
    stride 1, cells 10 x 8 m    3,439 polylines,  3,225 dropped

**The count grows with resolution.** A stitching bug does not do that — it
would shred a fixed number of real rings into a roughly fixed number of
pieces. A shoreline does: San Francisco Bay's southern edge is mudflat, and
mudflat sits AT mean high water, so the zero contour there resolves into more
and more genuine specks the finer you look. They are real, they are each under
twelve cells around, and none of them can be a pixel at any camera the far
shore is drawn at.

── AND NOTHING READS IT YET, WHICH IS THE HONEST STATE ─────────────────────
This produced a good measurement in the WRONG CONTAINER, and the attempt to
wire it is recorded here rather than quietly dropped.

`surroundLayer`'s `clip` and `terrain.ts` §THE COAST both want closed LAND
POLYGONS — `base/surround-coast.json` is TIGERweb county coverage carved by
areal hydrography, so every ring has an inside. A zero contour is not that. It
is a set of LINES, and every one that runs off the edge of the crop is open,
so a point-in-polygon test against it answers nothing.

MEASURED, by handing these rings to the far shore's cut and reading
`surroundStats()` at both:

    published rings   56,330 cells   55,210 whole   1,119 refined       1 dropped
    this contour      56,330 cells   16,970 whole   3,799 refined  35,561 dropped

    area built        858 km2  ->  292 km2

The surround loses two thirds of its land, because only the contours that
happen to close are read as having an inside. So the wiring was reverted and
the asset is not shipped; this script stays because the fetch is five minutes
and the contour itself is right.

WHAT THE RIGHT CONSUMER IS. Not rings. The land/water question this whole
family of bugs comes from is answered directly by `z >= 0` on the DEM, so the
thing to ship is a MASK at the DEM's own pitch and a `CoastMask` built from it
— no winding, no closure, no nesting, no topology to get wrong. 21.2 million
bits is 2.65 MB before compression and about a third of that after. That is
Block 3, and it is the version where the coast stops being a register at all
and becomes the elevation field's own sign.

  python3 build_coastline.py --stride 4      # validate the chain, ~5 MB
  python3 build_coastline.py                 # the real one, stride 1
"""
from __future__ import annotations

import argparse
import gzip
import json
import pathlib
import sys
import time
import urllib.request
from collections import defaultdict

import numpy as np

DODS = (
    "https://www.ngdc.noaa.gov/thredds/dodsC/regional/"
    "san_francisco_13_mhw_2010.nc.dods"
)
OUT = pathlib.Path(
    "/Users/daniel/code/open-public-data/website/public/data/us/sf/city/base"
)
MANIFEST = OUT.parent / "manifest.json"
NLAT, NLON = 12529, 15661
BAND_ROWS = 300

# ── the segment table ────────────────────────────────────────────────────────
# corners of cell (j, i): a=(j,i) b=(j,i+1) c=(j+1,i+1) d=(j+1,i)
# case = a + 2b + 4c + 8d, one bit per LAND corner.
# edges: AB = 0 (horizontal, south), BC = 1 (vertical, east),
#        CD = 2 (horizontal, north), DA = 3 (vertical, west)
CASES: dict[int, list[tuple[int, int]]] = {
    1: [(0, 3)], 2: [(0, 1)], 3: [(3, 1)], 4: [(1, 2)],
    5: [(0, 3), (1, 2)],                      # ambiguous, resolved one way
    6: [(0, 2)], 7: [(3, 2)], 8: [(2, 3)], 9: [(0, 2)],
    10: [(0, 1), (2, 3)],                     # ambiguous, resolved one way
    11: [(1, 2)], 12: [(1, 3)], 13: [(0, 1)], 14: [(0, 3)],
}


def dods(query: str, timeout: int = 300) -> bytes:
    """One OPeNDAP request, RETRIED.

    A stride-1 pull is ten bands over several minutes, and a single dropped
    connection used to lose the whole build -- which is what happened, with
    `URLError: Network is unreachable` part way through.
    """
    req = urllib.request.Request(DODS + query, headers={"User-Agent": "qipu-mask/1"})
    last: Exception | None = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
            break
        except Exception as exc:            # noqa: BLE001 - any transport fault
            last = exc
            if attempt == 4:
                raise
            print(f"    retry {attempt + 1}/4 after {type(exc).__name__}", flush=True)
            time.sleep(3 * (attempt + 1))
    else:
        raise last if last else RuntimeError("unreachable")
    i = raw.find(b"Data:\n")
    if i < 0:
        raise RuntimeError(f"no Data: section — {raw[:300]!r}")
    return raw[i + 6 :]


def arr(query: str, dt: str) -> np.ndarray:
    buf = dods(query)
    n = int(np.frombuffer(buf[:4], dtype=">i4")[0])
    w = 8 if dt == "f8" else 4
    return np.frombuffer(buf[8 : 8 + n * w], dtype=">" + dt[0] + str(w))


def edge_key(kind: int, j: int, i: int) -> int:
    """One integer per grid edge, so the stitch is exact."""
    return (int(j) * NLON + int(i)) * 2 + kind


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stride", type=int, default=1)
    ap.add_argument("--tol", type=float, default=4.0, help="simplify, metres")
    ap.add_argument("--min-perim", type=float, default=400.0, help="drop, metres")
    ap.add_argument("--out", type=pathlib.Path, default=OUT)
    a = ap.parse_args()

    man = json.loads(MANIFEST.read_text())
    W, S, E, N = man["surround"]["bbox"]
    P = man["proj"]
    mx = P["mpd"] * P["cosl"]

    lat = arr(f"?lat[0:1:{NLAT - 1}]", "f8").astype(np.float64)
    lon = arr(f"?lon[0:1:{NLON - 1}]", "f8").astype(np.float64)
    j0, j1 = int(np.searchsorted(lat, S)), int(np.searchsorted(lat, N))
    i0, i1 = int(np.searchsorted(lon, W)), int(np.searchsorted(lon, E))
    st = a.stride
    rows = np.arange(j0, j1 + 1, st)
    cols = np.arange(i0, i1 + 1, st)
    H, WD = rows.size, cols.size
    print(f"crop lat[{j0}:{j1}] lon[{i0}:{i1}] stride {st} -> {WD} x {H} = {WD * H:,}")

    z = np.empty((H, WD), dtype=np.float32)
    at = 0
    step = max(1, BAND_ROWS // st)
    for k in range(0, H, step):
        r0 = int(rows[k])
        r1 = int(rows[min(k + step, H) - 1])
        v = arr(f"?Band1[{r0}:{st}:{r1}][{i0}:{st}:{int(cols[-1])}]", "f4")
        nr = len(range(r0, r1 + 1, st))
        if v.size != nr * WD:
            sys.exit(f"band {k}: {v.size} != {nr * WD}")
        z[at : at + nr] = v.reshape(nr, WD)
        at += nr
        print(f"  rows {at:6d} / {H}", end="\r", flush=True)
    print(f"  rows {at:6d} / {H}  fetched")

    # NOAA's no-data is -9999. It is BELOW zero and would read as ocean, which
    # would put a shoreline around every hole. There are none inside this crop
    # — the check is here so a future box cannot inherit the assumption.
    holes = int((z <= -9000).sum())
    if holes:
        sys.exit(f"{holes:,} no-data nodes in the crop; this script cannot contour them")

    # ── marching squares at zero ────────────────────────────────────────────
    land = z >= 0.0
    case = (
        land[:-1, :-1].astype(np.uint8)
        | (land[:-1, 1:].astype(np.uint8) << 1)
        | (land[1:, 1:].astype(np.uint8) << 2)
        | (land[1:, :-1].astype(np.uint8) << 3)
    )
    print(f"  cells {case.size:,}   crossing {int(((case > 0) & (case < 15)).sum()):,}")

    # the two crossing coordinates a cell can need, as fractions along an edge
    def frac(za: np.ndarray, zb: np.ndarray) -> np.ndarray:
        d = za - zb
        return np.where(np.abs(d) < 1e-12, 0.5, za / np.where(d == 0, 1e-12, d))

    tH = frac(z[:, :-1], z[:, 1:])   # along a horizontal edge, node (j,i)->(j,i+1)
    tV = frac(z[:-1, :], z[1:, :])   # along a vertical edge,   node (j,i)->(j+1,i)

    # world position of a node
    wxs = (lon[cols] - P["lon0"]) * mx
    wys = (lat[rows] - P["lat0"]) * P["mpd"]

    def h_pt(j: np.ndarray, i: np.ndarray) -> np.ndarray:
        t = tH[j, i]
        return np.stack([wxs[i] + t * (wxs[i + 1] - wxs[i]), wys[j]], 1)

    def v_pt(j: np.ndarray, i: np.ndarray) -> np.ndarray:
        t = tV[j, i]
        return np.stack([wxs[i], wys[j] + t * (wys[j + 1] - wys[j])], 1)

    # every segment, as a pair of edge keys, plus that key's world point
    pts: dict[int, tuple[float, float]] = {}
    adj: dict[int, list[int]] = defaultdict(list)

    def edges_of(kind: int, jj: np.ndarray, ii: np.ndarray) -> np.ndarray:
        """(0=AB, 1=BC, 2=CD, 3=DA) of cell (jj, ii) -> (key, x, y)."""
        if kind == 0:
            k = (jj.astype(np.int64) * NLON + ii) * 2 + 0
            p = h_pt(jj, ii)
        elif kind == 2:
            k = ((jj + 1).astype(np.int64) * NLON + ii) * 2 + 0
            p = h_pt(jj + 1, ii)
        elif kind == 3:
            k = (jj.astype(np.int64) * NLON + ii) * 2 + 1
            p = v_pt(jj, ii)
        else:
            k = (jj.astype(np.int64) * NLON + ii + 1) * 2 + 1
            p = v_pt(jj, ii + 1)
        return k, p

    nseg = 0
    for cv, pairs in CASES.items():
        jj, ii = np.nonzero(case == cv)
        if jj.size == 0:
            continue
        for e1, e2 in pairs:
            k1, p1 = edges_of(e1, jj, ii)
            k2, p2 = edges_of(e2, jj, ii)
            for n in range(jj.size):
                a1, a2 = int(k1[n]), int(k2[n])
                if a1 not in pts:
                    pts[a1] = (float(p1[n, 0]), float(p1[n, 1]))
                if a2 not in pts:
                    pts[a2] = (float(p2[n, 0]), float(p2[n, 1]))
                adj[a1].append(a2)
                adj[a2].append(a1)
                nseg += 1
    print(f"  segments {nseg:,}   distinct crossings {len(pts):,}")

    # ── stitch ─────────────────────────────────────────────────────────────
    used: set[tuple[int, int]] = set()
    lines: list[list[int]] = []

    def run(start: int) -> list[int]:
        """Follow unused edges from `start` until there are none."""
        path = [start]
        cur = start
        while True:
            nxt = None
            for cand in adj[cur]:
                e = (cur, cand) if cur < cand else (cand, cur)
                if e not in used:
                    used.add(e)
                    nxt = cand
                    break
            if nxt is None:
                return path
            path.append(nxt)
            cur = nxt

    def walk(start: int) -> list[int]:
        """── BOTH WAYS FROM THE START, WHICH ONLY MATTERS FOR OPEN CHAINS ──
        A CLOSED ring needs only one run: following it round returns to the
        start, whose other edge is still unused, so the run carries straight
        on and completes it. An OPEN chain begun from a middle node does not
        — it would leave the other half behind — so the second direction is
        walked and prepended, reversed.

        This was added on the theory that it explained 1,186 polylines from
        26,496 segments. It did not: the output was byte-identical with and
        without it, which is what the argument above predicts. It is kept
        because the open case is real, and the note is kept because the
        fragment count has a different cause — see §THE MUDFLATS."""
        fwd = run(start)
        back = run(start)
        if len(back) > 1:
            return back[:0:-1] + fwd
        return fwd

    # open ends first, so a coast that leaves the box is one line and not two
    for k in list(adj):
        if len(adj[k]) == 1:
            q = walk(k)
            if len(q) > 1:
                lines.append(q)
    for k in list(adj):
        q = walk(k)
        if len(q) > 1:
            lines.append(q)
    print(f"  stitched {len(lines):,} polylines")

    # ── to world, simplify, cut ────────────────────────────────────────────
    from shapely.geometry import LineString

    rings: list[list[float]] = []
    kept = dropped = 0
    vin = vout = 0
    for path in lines:
        xy = [pts[k] for k in path]
        vin += len(xy)
        ls = LineString(xy)
        if ls.length < a.min_perim:
            dropped += 1
            continue
        s = ls.simplify(a.tol, preserve_topology=False)
        c = list(s.coords)
        if len(c) < 3:
            dropped += 1
            continue
        kept += 1
        vout += len(c)
        rings.append([round(v, 1) for pt in c for v in pt])

    print(f"  kept {kept:,} rings, dropped {dropped:,} under {a.min_perim:.0f} m")
    print(f"  vertices {vin:,} -> {vout:,}  (simplify {a.tol} m)")

    meta = {
        "rings": rings,
        "n": kept,
        "vertices": vout,
        "tolM": a.tol,
        "minPerimM": a.min_perim,
        "strideNodes": st,
        "cellM": [
            round(float(lon[1] - lon[0]) * st * mx, 3),
            round(float(lat[1] - lat[0]) * st * P["mpd"], 3),
        ],
        "world": [
            round(float(wxs[0]), 2), round(float(wys[0]), 2),
            round(float(wxs[-1]), 2), round(float(wys[-1]), 2),
        ],
        "source": {
            "publisher": "NOAA National Centers for Environmental Information",
            "dataset": "San Francisco Bay, California Coastal Digital Elevation "
                       "Model (san_francisco_13_mhw_2010)",
            "what": "the ZERO CONTOUR of an integrated bathymetric-topographic "
                    "DEM on the Mean High Water datum, traced by marching "
                    "squares at the DEM's own 1/3 arc-second. Not a published "
                    "shoreline: the surface's own crossing.",
            "licence": "US Government work, public domain",
            "declared": f"Douglas-Peucker at {a.tol} m, and rings under "
                        f"{a.min_perim:.0f} m of perimeter dropped. Both are "
                        f"drawing decisions and neither moves a headland: the "
                        f"tolerance is under half a DEM cell and well under a "
                        f"screen pixel at every camera the far shore is seen at.",
        },
    }
    p = a.out / "coastline.json"
    p.write_text(json.dumps(meta) + "\n")
    gz = len(gzip.compress(p.read_bytes(), 6))
    print(f"wrote {p} {p.stat().st_size:,} bytes ({gz:,} gzipped)")

    old = json.loads((a.out / "surround-coast.json").read_text())
    print(f"  replaces base/surround-coast.json: {old['nv']:,} vertices -> {vout:,}")


if __name__ == "__main__":
    main()
