"""base/surround-coast.json — the REGIONAL shoreline the surround is cut at.

WHY THIS IS A SEPARATE FILE FROM `base/coast`.

`base/coast` is San Francisco's own shoreline: DataSF, 4 rings, 425 vertices,
and it is what the city's shoreline pass inks. The SURROUND is Marin, the East
Bay, the San Mateo peninsula and the islands, and its coast is a different
published line — US Census TIGERweb areal hydrography carved out of TIGERweb
county coverage, 12 rings and 3,168 vertices over the whole 416 x 280 grid.

Clipping the surround to the CITY's ring deletes the surround: measured, by
doing it — Marin disappears and the frame is San Francisco floating in haze.
`part3.html` §4426 clips at `window.COAST`, which is this file.

The same two polygon files `gen/gen_context.py` rasterises to build the
surround the map already draws, re-rasterised at that file's own grid,
reproduce the shipped land mask on 116,480 of 116,480 cells. So this ships no
new claim: it is the ring the existing mask was cut from, at the precision the
ring has, instead of at the 110.01 x 139.15 m the mask quantised it to.

THREE ARRAYS, and each answers a different half of the staircase:

  rings   the land side of the published shoreline. One clip for the whole
          surround pass.
  xtra    one bit per surround cell: a WATER cell that touches surround land
          and is not inside the city model's own coverage. The surround paints
          cells whose CENTRE is land, so without this the fill stops up to one
          cell short of the ring and a sliver of bay plate shows between the
          two. It is safe because the clip is the ring: a cell on this list can
          only paint the part of itself that is inside the published land.
  cfix    one bit per CITY DEM cell (260 x 260, k = i*260 + j): this cell's
          centre is more than 300 m outside the published land polygon.
          `maskAt` is txuc-3kzm, which is the boundary of the City and County
          of San Francisco — a LEGAL boundary that runs kilometres into the
          Pacific and straight across the Golden Gate. 4,787 of the city's
          43,187 ground cells (11.1 %, 13.86 km2) are open water painted in the
          city's ground tone, and their 53.8 m edge is the straight line
          offshore in the opening frame. The 300 m is argued in
          coast/build_coast.py: within it DataSF wins, because it is the city's
          own register of its own waterfront, and that is what keeps the
          Embarcadero's finger piers, Fort Mason and the Aquatic Park
          breakwater.

Run:  python3 pipeline/scripts/us_sf_city/emit_surround_coast.py
Reads scratchpad/sf-city-anim/coast/coast-data.js and writes
website/public/data/us/sf/city/base/surround-coast.json.
"""
import base64
import json
import pathlib
import re
import sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC = ROOT / "scratchpad/sf-city-anim/coast/coast-data.js"
OUT = ROOT / "website/public/data/us/sf/city/base/surround-coast.json"
MANIFEST = ROOT / "website/public/data/us/sf/city/manifest.json"


def main() -> int:
    text = SRC.read_text()
    m = re.search(r"window\.COAST\s*=\s*(\{.*\})\s*;?\s*$", text, re.S)
    if not m:
        raise SystemExit(f"{SRC}: no window.COAST assignment")
    cd = json.loads(m.group(1))

    man = json.loads(MANIFEST.read_text())
    sur = man["surround"]
    if (cd["w"], cd["h"]) != (sur["w"], sur["h"]):
        raise SystemExit(
            f"grid mismatch: coast-data is {cd['w']}x{cd['h']}, "
            f"the shipped surround is {sur['w']}x{sur['h']}"
        )
    ter = next(c for c in man["chunks"] if c["kind"] == "terrain")
    if cd["cn"] != ter["w"] or ter["w"] != ter["h"]:
        raise SystemExit(
            f"city grid mismatch: cfix is {cd['cn']}^2, terrain is "
            f"{ter['w']}x{ter['h']}"
        )

    xy = np.frombuffer(base64.b64decode(cd["xy"]), dtype=np.float32)
    if xy.size != cd["nv"] * 2:
        raise SystemExit(f"xy is {xy.size} floats for {cd['nv']} vertices")

    # WHOLE METRES. The rings are already simplified at tol_m = 11.13 m and the
    # cell they are cutting is 110 m, so a decimetre is three digits of nothing.
    # The worst deviation from the f32 ring is measured on every run and
    # printed, and it is carried in the file's own meta rather than asserted
    # here: at the last run 0.699 m, which at the whole-city preset is 0.03 px.
    qx = np.rint(xy[0::2]).astype(np.int32)
    qy = np.rint(xy[1::2]).astype(np.int32)
    worst = float(np.max(np.hypot(qx - xy[0::2], qy - xy[1::2])))

    doc = {
        "meta": {
            "generated_by": "pipeline/scripts/us_sf_city/emit_surround_coast.py",
            "derived_from": "scratchpad/sf-city-anim/coast/coast-data.js",
            "real": cd["meta"]["real"],
            "modelled": cd["meta"].get("modelled", []),
            "note": cd["meta"].get("note", ""),
            "quantum_m": 1.0,
            "worst_quantiser_error_m": round(worst, 3),
            "tol_m": cd["tol_m"],
            "city_pad_m": cd["city_pad_m"],
        },
        "w": cd["w"],
        "h": cd["h"],
        "cn": cd["cn"],
        "bitOrder": "msb",
        "nv": cd["nv"],
        "start": cd["start"],
        "count": cd["count"],
        "x": qx.tolist(),
        "y": qy.tolist(),
        "nxtra": cd["nxtra"],
        "xtra": cd["xtra"],
        "ncfix": cd["ncfix"],
        "cfix": cd["cfix"],
    }
    OUT.write_text(json.dumps(doc, separators=(",", ":")))
    import gzip

    gz = len(gzip.compress(OUT.read_bytes(), 9))
    print(
        f"{OUT.relative_to(ROOT)}  {OUT.stat().st_size:,} bytes  "
        f"({gz:,} gzipped)  {cd['nring']} rings, {cd['nv']} vertices, "
        f"{cd['nxtra']} reach cells, {cd['ncfix']} city cells offshore, "
        f"worst quantiser error {worst:.3f} m"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
