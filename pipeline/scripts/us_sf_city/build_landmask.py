#!/usr/bin/env python3
"""WHERE THE LAND STOPS, AS ONE BIT PER PLACE AND NOT AS A REGISTER.

── THE SHAPE OF EVERY COAST DEFECT IN THIS RENDERER ─────────────────────────
Three layers ask the same question and read three different answers.
`terrain.ts` §THE COAST cuts the ground at one union of rings, `water.ts`
§THE PLATE IS CUT asks it the other way round, `surround.ts` §THE FAR SHORE
cuts the region at a third. Each is right about itself, they disagree at their
own grains, and every coast bug chased today has been that disagreement
showing through — the staircase of pale blocks on the Marin shore among them.

`base/surround-coast.json` carries **3,168 vertices for 45.8 x 39.0 km**, and
the region is cut against it at 110.01 x 139.15 m cells refined 6-a-side.

── AND THE ANSWER IS NOT A BETTER SET OF RINGS ─────────────────────────────
`build_coastline.py` traced the shoreline from NOAA's own surface and got a
far better LINE — 18,738 vertices against 3,168, with the Embarcadero's piers
resolved one by one. Handed to the region's cut it was a REGRESSION, measured
at `surroundStats()`:

    published rings   55,210 whole   1,119 refined       1 dropped   858 km2
    the contour       16,970 whole   3,799 refined  35,561 dropped   292 km2

The surround lost two thirds of its land, and correctly: a contour is a set of
LINES, the cut wants closed POLYGONS with an inside, and every line running
off the edge of the crop has no inside to test against.

That failure is the argument for this file. The question the cut actually asks
is *"is this point land?"* — and a polygon is only a way of encoding that
answer. **NOAA's DEM already holds it directly, at every point, as the sign of
the elevation.** So ship the answer and not an encoding of it: one bit per
node of `z >= 0` on the MHW datum, where zero is the shoreline a chart draws.

No winding. No closure. No nesting. No even-odd fill. No topology to get
wrong, and nothing that can disagree with anything else, because there is only
one of it.

── THE PITCH IS CHOSEN TO MATCH ITS CONSUMER, NOT TO BE MAXIMAL ────────────
The region's cut refines a coastal cell 6 a side, so its sub-cell is
110.01/6 x 139.15/6 = **18.34 x 23.19 m**. `--stride 2` on the DEM is 16.3 x
20.6 m, which is just finer than that in both axes — the mask can answer every
sub-cell the cut will ever ask about, and a finer one would be answering
questions nobody asks. 2,809 x 1,891 bits is **664 KB**, and it compresses
hard because most of the region is solidly one thing or the other.

Full resolution for comparison: 21.2 million bits, 2.65 MB, to serve a
consumer whose finest question is 18 m.

── WHAT IS ENCODED ──────────────────────────────────────────────────────────
Row-major from the SOUTH edge north, one bit a node, MSB first within a byte,
each row padded to a byte boundary so a row is addressable without a divide.
Bit set means LAND: `z >= 0` on the Mean High Water datum.

  python3 build_landmask.py                 # stride 2, matched to the cut
  python3 build_landmask.py --stride 1      # 2.65 MB, if a finer cut ever needs it
"""
from __future__ import annotations

import argparse
import gzip
import json
import pathlib
import sys
import time
import urllib.request

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
BAND_ROWS = 400


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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stride", type=int, default=2)
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
    mlat = float(lat[1] - lat[0]) * st * P["mpd"]
    mlon = float(lon[1] - lon[0]) * st * mx
    print(f"crop lat[{j0}:{j1}] lon[{i0}:{i1}] stride {st}")
    print(f"out  {WD} x {H} = {WD * H:,} bits at {mlon:.2f} x {mlat:.2f} m")

    sur = man["surround"]
    sub_w = sur["cellW"] / 6.0
    sub_h = sur["cellH"] / 6.0
    print(f"     the cut's sub-cell is {sub_w:.2f} x {sub_h:.2f} m")
    if mlon > sub_w or mlat > sub_h:
        print("     NOTE this mask is COARSER than the cut's finest question")

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

    holes = int((z <= -9000).sum())
    if holes:
        sys.exit(f"{holes:,} no-data nodes; they would read as ocean")

    land = z >= 0.0
    # `np.packbits` is MSB-first and pads the last byte of each row, which is
    # the layout the reader indexes with a shift rather than a divide.
    packed = np.packbits(land, axis=1)
    stride_b = int(packed.shape[1])
    binp = a.out / "landmask.bin"
    binp.write_bytes(packed.tobytes())
    gz = len(gzip.compress(packed.tobytes(), 9))

    meta = {
        "w": WD,
        "h": H,
        "rowBytes": stride_b,
        "bitOrder": "msb",
        "world": [
            round((float(lon[i0]) - P["lon0"]) * mx, 2),
            round((float(lat[j0]) - P["lat0"]) * P["mpd"], 2),
            round((float(lon[int(cols[-1])]) - P["lon0"]) * mx, 2),
            round((float(lat[int(rows[-1])]) - P["lat0"]) * P["mpd"], 2),
        ],
        "cellM": [round(mlon, 3), round(mlat, 3)],
        "landFrac": round(float(land.mean()), 4),
        "note": "one bit a node, row-major from the SOUTH edge north, MSB "
                "first, each row padded to a byte. Set means LAND. Node (i, j) "
                "maps to `world` by linear interpolation.",
        "source": {
            "publisher": "NOAA National Centers for Environmental Information",
            "dataset": "San Francisco Bay, California Coastal Digital Elevation "
                       "Model (san_francisco_13_mhw_2010)",
            "what": "the SIGN of an integrated bathymetric-topographic DEM on "
                    "the Mean High Water datum. Not a published shoreline and "
                    "not derived from one: land is where the surface is at or "
                    "above the datum a chart draws its coast at.",
            "licence": "US Government work, public domain",
            "reduced": f"every {st}th node, taken in the pipeline. The consumer "
                       f"is a cut that refines 6 a side over "
                       f"{sur['cellW']:.2f} x {sur['cellH']:.2f} m cells, so its "
                       f"finest question is {sub_w:.2f} x {sub_h:.2f} m and this "
                       f"is just finer than that in both axes.",
        },
    }
    (a.out / "landmask.json").write_text(json.dumps(meta, indent=1) + "\n")
    print(f"wrote {binp} {binp.stat().st_size:,} bytes ({gz:,} gzipped)")
    print(f"  land {100 * land.mean():.1f}% of the box")
    old = json.loads((a.out / "surround-coast.json").read_text())
    print(f"  replaces {old['nv']:,} vertices with {WD * H:,} answers")


if __name__ == "__main__":
    main()
