#!/usr/bin/env python3
"""WHAT PUTS A TOWER ON AN EARLY FRAME -- and it is not the 1906 placeholder.

    python3 pipeline/scripts/us_sf_city/diag_tall_years.py

Read-only. Reads `bldg-data.js` through `_bldgsrc.read_bldg()`, which is the
file DATA-TRUTH.md 5b calls authoritative for the two year-provenance bits.

── THE CLAIM THIS SCRIPT WAS WRITTEN TO CHECK, AND IT WAS WRONG ────────────
A close frame at 1906 in the Financial District has a modern tower standing in
the middle of it. The first explanation offered was the placeholder year: 2,916
footprints carry `FLAG_NOYEAR`, `yr` holds 1906 beside it, and 1906 is not a
date -- so an undated skyscraper would land in the first frame.

**The renderer never reads that 1906.** Its gate, quoted in DATA-TRUTH.md 9:

    if (clock && (tb.u[i] & FLAG_NOYEAR) === 0 && iy < 1849 + tb.yr[i]) continue;

A footprint flying bit 4 is not year-gated AT ALL. It is drawn in every year on
purpose, which is `time.ts`'s rule for the undated street trees, and the
placeholder in `yr` is never consulted for those rows. So the explanation had
to be tested against the heights rather than assumed from the constant, and it
does not survive: **the tallest FLAG_NOYEAR footprint in San Francisco is 95 m,
its median is 6 m.** The undated cohort is small buildings.

── WHAT IS ACTUALLY DOING IT ───────────────────────────────────────────────
`FLAG_BLOCKYEAR`, bit 3, 20,571 footprints: the year is the 25th-percentile
year of the OTHER parcels on the same published assessor block -- a real year
that belongs to someone else. Nothing gates on the bit, so those arrive
indistinguishably from the 142,679 dated by their own parcel.

One of them is 174 m and its block's p25 is 1906, which makes the tenth
tallest structure in the city the tallest thing on the map's first frame.

DATA-TRUTH.md 9 already frames the treatment as a choice and says whose it is:

  > draw them from their block's year, marked ... or draw them in every year,
  > like the undated. Both are one line in `scene.ts` against `FLAG_BLOCKYEAR`,
  > both need the same bit, and the bit is already in every chunk. **The value
  > is Daniel's call.**

So this script measures the size of that call and does not make it.

── AND ONE THING NEITHER FLAG EXPLAINS ─────────────────────────────────────
The second tallest structure in the city, 259 m, is first drawn in 1917 on its
OWN published roll year. No flag is set and the renderer is repeating the
assessor exactly. HYPOTHESIS, not measured here: `wv5m-vpq2` dates the PARCEL,
so a tower built on a site that carried an earlier building can inherit the
earlier date. Nothing in this pipeline can currently confirm or refute that --
`ynuv-fyni` publishes a 2010 LiDAR height and no year at all -- so it is
written down as an open question and not as a finding.
"""
from __future__ import annotations

import json
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
ROOT = pathlib.Path("/Users/daniel/code/open-public-data")
MANIFEST = ROOT / "website/public/data/us/sf/city/manifest.json"

FLAG_BLOCKYEAR = 8
FLAG_NOYEAR = 16
YEAR0 = 1849            # build_bldg.py's own offset, decoded the same way
CUTS = (40, 60, 80, 100, 120, 150)


def main() -> None:
    from _bldgsrc import read_bldg          # noqa: E402 — the encoder's reader

    B = read_bldg()
    h = np.asarray(B["h"], dtype=float)
    u = np.asarray(B["u"])
    yr = YEAR0 + np.asarray(B["yr"], dtype=int)
    cx = np.asarray(B["cx"], dtype=float)
    cy = np.asarray(B["cy"], dtype=float)
    noy = (u & FLAG_NOYEAR) != 0
    blk = (u & FLAG_BLOCKYEAR) != 0
    own = ~noy & ~blk
    P = json.loads(MANIFEST.read_text())["proj"]
    mx = P["mpd"] * P["cosl"]

    print(f"{B['n']:,} footprints\n")
    print("HEIGHT BY WHAT DATES IT:")
    for nm, m in (("its own parcel roll", own),
                  ("its BLOCK's p25 year", blk),
                  ("nothing - drawn in every year", noy)):
        print(f"   {nm:<32} n={int(m.sum()):>7,}  median {np.median(h[m]):5.1f} m"
              f"   tallest {h[m].max():6.1f} m")
    print("\n   the undated cohort is SMALL BUILDINGS. It is not the tower.")

    # the renderer's own gate, restated: bit 4 is not gated, everything else is
    def drawn(Y: int) -> np.ndarray:
        return noy | (yr <= Y)

    for Y in (1906, 1920, 1940):
        d = drawn(Y)
        print(f"\nAT {Y} the map draws {int(d.sum()):,} footprints")
        for lo in CUTS:
            m = d & (h >= lo)
            if not m.sum():
                continue
            print(f"   >= {lo:3d} m : {int(m.sum()):5,}   own roll {int((m&own).sum()):5,}"
                  f" | block p25 {int((m&blk).sum()):4,} | no year {int((m&noy).sum()):4,}"
                  f"   tallest {h[m].max():.0f} m")

    print("\nEVERY STRUCTURE OVER 150 m, AND THE YEAR THE MAP FIRST DRAWS IT:")
    for i in np.argsort(-h)[:16]:
        lon = P["lon0"] + cx[i] / mx
        lat = P["lat0"] + cy[i] / P["mpd"]
        first = 1906 if noy[i] else int(yr[i])
        tag = ("no year - every year" if noy[i]
               else (f"its BLOCK's p25, {yr[i]}" if blk[i] else f"its own roll, {yr[i]}"))
        print(f"   {h[i]:6.0f} m   first drawn {first}   {tag:<24} {lon:.4f},{lat:.4f}")

    tall = (h >= 60) & ~noy
    print(f"\n{int(tall.sum())} structures of 60 m or over carry a year:")
    for lo, hi in ((1849, 1906), (1907, 1929), (1930, 1959), (1960, 1989), (1990, 2026)):
        m = tall & (yr >= lo) & (yr <= hi)
        if not m.sum():
            continue
        print(f"   first drawn {lo}-{hi} : {int(m.sum()):3d}"
              f"   ({int((m & blk).sum())} of them on their block's year)"
              f"   tallest {h[m].max():.0f} m")


if __name__ == "__main__":
    main()
