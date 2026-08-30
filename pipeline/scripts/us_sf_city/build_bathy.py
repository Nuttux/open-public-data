#!/usr/bin/env python3
"""THE SEA FLOOR, AT A PITCH FINER THAN THE THING THAT DRAWS IT.

── WHAT IS WRONG WITH THE ONE WE HAVE ───────────────────────────────────────
The water plate takes its colour from `base/water`'s `dep` grid, which is
417 x 281 nodes over 45.8 x 39.0 km — a cell of **110.01 x 139.15 m**.

`layers/water.ts` already says what that costs, in its own words: *"the
published survey is 417 x 281 ... which is 110 x 139 m a node — the SURROUND's
own tread. Sampled with Math.round it painted the bay in 110 m blocks, and at
the district camera one of them is 53 px."* Bilinear sampling softened that,
but it cannot add what is not there.

The number that matters is the BAKE's. The plate is baked to a 1536 x 1536
texture over an ~80 km box, which is **52 m a texel**. So the depth field has
been TWICE as coarse as the thing that samples it, and every gradient in the
bay has been an interpolation between nodes 110 m apart. That is the whole of
the blockiness, and no amount of work in the renderer can fix a grid.

── WHAT IS PUBLISHED, AND WHY THIS ONE ──────────────────────────────────────
NOAA NCEI, *"San Francisco Bay, California Coastal Digital Elevation Model"*,
`san_francisco_13_mhw_2010`. NOAA's own summary: an **integrated
bathymetric-topographic** DEM, built for the tsunami forecast system so that
land and sea are ONE continuous surface. Public domain.

    grid      12,529 x 15,661
    cell      1/3 arc-second — 9.259259e-05 deg, about 10.3 m N-S and
              8.1 m E-W at 37.8 N
    extent    lon -123.300 .. -121.850, lat 37.320 .. 38.480
    datum     MHW vertical, WGS84 horizontal

The city's own surround box is lon -122.62 .. -122.10, lat 37.60 .. 37.95, so
this covers it with about 70 km of margin on every side — all of Marin, the
whole Bay, and the shelf outside the Gate.

**MHW and not NAVD88.** NOAA publishes both. Mean High Water is the datum a
chart draws its shoreline at, so on this one ZERO IS THE SHORE. That makes the
coastline a fact in the field rather than a geodetic accident, which is what
the second block of this work needs; NAVD88 would put the waterline at an
arbitrary contour that changes with the tide model.

── AND IT IS SIMPLIFIED ON PURPOSE, WHICH IS THE POINT ─────────────────────
Daniel: *"think about if you import and code all in super granular or if thats
too compute intensive ... bc our thing is mostly about land."* He is right,
and the arithmetic agrees.

Pulled at full resolution over the surround's box this is 5,616 x 3,780 =
21.2 MILLION cells, 85 MB as float32. Shipped at that pitch it would be the
largest asset in the repo by a factor of ninety, to feed a bake that throws
away everything under 52 m.

So the fetch is fine and the SHIP is not. `--stride 5` takes every fifth node,
which is 46.3 m N-S and 40.7 m E-W — finer than the 52 m texel that consumes
it and 2.4x finer than the 110 m grid it replaces, at 849 thousand cells and
about 850 KB as one byte a node. The reduction happens HERE, in the pipeline,
and the browser never sees a number it does not use.

── WHAT IS ENCODED ──────────────────────────────────────────────────────────
One byte a node, and only the water: `v = 0` means the surface is at or above
MHW — land, or a node the survey has no water for — and every other value is a
depth. The existing chunk's own rule is kept so the reader does not have to
learn a second one:

    depth in metres = (v / 255) ** 2 * dmax

The square is not decoration. Depth in a bay is not uniform: half of San
Francisco Bay is under 5 m and the Gate's channel runs past 100, so a linear
byte would spend most of its range on water nobody can tell apart and quantise
the shallows — which is exactly where the eye reads the coast — at 0.45 m a
step. Squared, the shallows get 0.02 m a step and the deep channel 0.9 m.

  python3 build_bathy.py                  # the surround's box, stride 5
  python3 build_bathy.py --stride 3       # 27.8 x 24.4 m, 2.4 MB
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

#: the DEM's own grid, from its `.das` — asserted below rather than trusted
NLAT, NLON = 12529, 15661

#: how many rows to ask for at a time. 400 rows of 5,616 columns at float32 is
#: 9 MB a request, which the service answers in a few seconds and which fails
#: cleanly rather than timing out half way through a 90 MB one.
BAND_ROWS = 400


def dods(query: str, timeout: int = 240) -> tuple[str, bytes]:
    """One OPeNDAP request. Returns (DDS header, the XDR payload).

    RETRIED, because a stride-1 pull is ten bands over several minutes and a
    single dropped connection used to lose the whole build -- which is exactly
    what happened, with `URLError: Network is unreachable` on band six.
    """
    req = urllib.request.Request(DODS + query, headers={"User-Agent": "qipu-bathy/1"})
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
        raise RuntimeError(f"no Data: section — {raw[:400]!r}")
    return raw[:i].decode("utf-8", "replace"), raw[i + 6 :]


def dods_f32(query: str) -> np.ndarray:
    """A Float32 array variable. The payload is two big-endian int32 counts
    and then the values, which is the DODS wire format for an Array."""
    _, buf = dods(query)
    n = int(np.frombuffer(buf[:4], dtype=">i4")[0])
    return np.frombuffer(buf[8 : 8 + n * 4], dtype=">f4").astype(np.float32)


def dods_f64(query: str) -> np.ndarray:
    _, buf = dods(query)
    n = int(np.frombuffer(buf[:4], dtype=">i4")[0])
    return np.frombuffer(buf[8 : 8 + n * 8], dtype=">f8").astype(np.float64)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stride", type=int, default=5)
    ap.add_argument("--out", type=pathlib.Path, default=OUT)
    a = ap.parse_args()
    if a.stride < 1:
        sys.exit("--stride must be >= 1")

    man = json.loads(MANIFEST.read_text())
    sur = man["surround"]
    W, S, E, N = sur["bbox"]
    print(f"surround box  lon {W} .. {E}   lat {S} .. {N}")

    # ── the DEM's own axes, so the crop is exact and not computed from a
    #    GeoTransform this file would then have to be trusted about ──────────
    lat = dods_f64(f"?lat[0:1:{NLAT - 1}]")
    lon = dods_f64(f"?lon[0:1:{NLON - 1}]")
    if lat.size != NLAT or lon.size != NLON:
        sys.exit(f"grid is {lat.size} x {lon.size}, this file expects {NLAT} x {NLON}")
    print(f"DEM  {lat.size} x {lon.size}   "
          f"lat {lat[0]:.4f}..{lat[-1]:.4f}  lon {lon[0]:.4f}..{lon[-1]:.4f}")
    if not (lat[0] <= S and lat[-1] >= N and lon[0] <= W and lon[-1] >= E):
        sys.exit("the DEM does not cover the surround box")

    j0, j1 = int(np.searchsorted(lat, S)), int(np.searchsorted(lat, N))
    i0, i1 = int(np.searchsorted(lon, W)), int(np.searchsorted(lon, E))
    st = a.stride
    rows = list(range(j0, j1 + 1, st))
    cols = list(range(i0, i1 + 1, st))
    H, WD = len(rows), len(cols)
    dlat = (lat[1] - lat[0]) * st
    dlon = (lon[1] - lon[0]) * st
    mlat = dlat * 111_320.0
    mlon = dlon * 111_320.0 * float(np.cos(np.deg2rad((S + N) / 2)))
    print(f"crop  lat[{j0}:{j1}] lon[{i0}:{i1}]  stride {st}")
    print(f"out   {WD} x {H} = {WD * H:,} cells at {mlon:.1f} x {mlat:.1f} m")

    # ── the fetch, in bands ────────────────────────────────────────────────
    z = np.empty((H, WD), dtype=np.float32)
    at = 0
    step = max(1, BAND_ROWS // st)
    for k in range(0, H, step):
        r0 = rows[k]
        r1 = rows[min(k + step, H) - 1]
        q = f"?Band1[{r0}:{st}:{r1}][{i0}:{st}:{cols[-1]}]"
        v = dods_f32(q)
        nr = len(range(r0, r1 + 1, st))
        if v.size != nr * WD:
            sys.exit(f"band {k}: got {v.size}, expected {nr * WD}")
        z[at : at + nr] = v.reshape(nr, WD)
        at += nr
        print(f"  rows {at:6d} / {H}", end="\r", flush=True)
    print(f"  rows {at:6d} / {H}   fetched")
    if at != H:
        sys.exit(f"assembled {at} rows of {H}")

    # NOAA's own no-data. It appears outside the DEM's footprint, which the
    # crop above is entirely inside, so any of it here is a real hole and is
    # treated as land rather than as a depth.
    fill = z <= -9000
    if fill.any():
        print(f"  NOTE {int(fill.sum()):,} no-data nodes, treated as land")
        z[fill] = 0.0

    # ── encode ─────────────────────────────────────────────────────────────
    # `positive: up` and MHW, so water is NEGATIVE and depth is its negation.
    depth = np.where(z < 0.0, -z, 0.0)
    dmax = float(depth.max())
    wet = depth > 0.0
    q = np.rint(np.sqrt(np.clip(depth, 0.0, dmax) / dmax) * 255.0)
    # a wet node must never quantise to 0, which is the land sentinel
    q = np.where(wet, np.maximum(q, 1.0), 0.0).astype(np.uint8)

    # `j increases NORTH` is the existing chunk's own convention and the
    # reader's; `searchsorted` above already produced rows south to north, so
    # nothing is flipped here and this line says so on purpose.
    binp = a.out / "bathy.bin"
    binp.write_bytes(q.tobytes())
    gz = len(gzip.compress(q.tobytes(), 6))

    back = (q.astype(np.float32) / 255.0) ** 2 * dmax
    err = np.abs(back[wet] - depth[wet])

    # the world box, in the city's own frame, so the renderer does no
    # projection arithmetic and the two files cannot drift apart
    P = man["proj"]
    mx = P["mpd"] * P["cosl"]
    world = [
        (float(lon[i0]) - P["lon0"]) * mx,
        (float(lat[j0]) - P["lat0"]) * P["mpd"],
        (float(lon[cols[-1]]) - P["lon0"]) * mx,
        (float(lat[rows[-1]]) - P["lat0"]) * P["mpd"],
    ]

    meta = {
        "w": WD,
        "h": H,
        "world": [round(v, 2) for v in world],
        "dmax": round(dmax, 3),
        "dtype": "u8",
        "encoding": "depth in metres = (v / 255) ** 2 * dmax; v = 0 is land or "
                    "at/above MHW",
        "cellM": [round(mlon, 4), round(mlat, 4)],
        "bbox4326": [float(lon[i0]), float(lat[j0]), float(lon[cols[-1]]),
                     float(lat[rows[-1]])],
        "note": "Node (i, j) maps to bbox4326 by linear interpolation; "
                "j increases NORTH, the same convention as base/water.",
        "wetFrac": round(float(wet.mean()), 4),
        # NOT shipped as the ramp's stops: `lib/city/water.ts` publishes those
        # and the CANVAS page reads them too, so they stay exactly as they are
        # and this field is only here so the difference is on the record.
        "tertilesM": [round(float(v), 3) for v in np.percentile(depth[wet], [100 / 3, 200 / 3])],
        "quantErrP99M": round(float(np.percentile(err, 99)), 4) if wet.any() else 0.0,
        "source": {
            "publisher": "NOAA National Centers for Environmental Information",
            "dataset": "San Francisco Bay, California Coastal Digital Elevation "
                       "Model (san_francisco_13_mhw_2010)",
            "url": "https://www.ngdc.noaa.gov/thredds/catalog/regional/catalog.html"
                   "?dataset=regionalDatasetScan/san_francisco_13_mhw_2010.nc",
            "what": "integrated bathymetric-topographic DEM at 1/3 arc-second, "
                    "MHW vertical datum, WGS84 horizontal. Built by NOAA for "
                    "the PMEL tsunami forecast system, which is why land and "
                    "sea are one continuous surface.",
            "licence": "US Government work, public domain",
            "reduced": f"every {st}th node of the published grid, taken in the "
                       f"pipeline. The plate that reads this bakes at 52 m a "
                       f"texel, so {mlon:.1f} x {mlat:.1f} m is finer than the "
                       f"thing that samples it and the rest would be discarded.",
        },
    }
    (a.out / "bathy.json").write_text(json.dumps(meta, indent=1) + "\n")

    print(f"wrote {binp} {binp.stat().st_size:,} bytes ({gz:,} gzipped)")
    print(f"  depth 0..{dmax:.1f} m, {100 * wet.mean():.1f}% of nodes wet")
    print(f"  quantisation error p99 {meta['quantErrP99M']:.3f} m")
    old = man.get("water", {})
    if old:
        ow, oh = old.get("nw"), old.get("nh")
        mul = old.get("mul", 1)
        print(f"  replaces a {(ow - 1) // mul + 1} x {(oh - 1) // mul + 1} grid "
              f"at 110.0 x 139.2 m -> {WD} x {H} at {mlon:.1f} x {mlat:.1f} m")


if __name__ == "__main__":
    main()
