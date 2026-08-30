#!/usr/bin/env python3
"""THE EARLIEST YEAR THE REGISTER DATES A BUILDING OF A GIVEN HEIGHT.

    python3 pipeline/scripts/us_sf_city/build_height_floor.py

Writes `base/height-floor.json`. Small — a few dozen numbers.

── WHAT IT IS FOR ──────────────────────────────────────────────────────────
`diag_tall_years.py` measured this: 20,571 of 166,166 footprints fly
`FLAG_BLOCKYEAR`, meaning their year is the 25th-percentile year of the OTHER
parcels on their own assessor block. A real year, and not theirs. One of them
is 174 m — the tenth tallest structure in San Francisco — and its block's p25
is 1906, so the map's very first frame had a curtain-wall tower standing in it.

The block statistic is not wrong about the block. It is wrong about the
outlier: a tower on a block of 1906 fabric is exactly the building the block's
lower quartile cannot speak for.

── AND THE ANSWER MAY NOT BE A DATE, BECAUSE NOTHING PUBLISHES ONE ─────────
So this does not date anything. It computes a FLOOR, and only out of the
142,679 footprints the assessor dates by their own parcel:

    for a height H, the earliest year any building of at least H is dated

A building whose year was borrowed from its block may then be drawn no earlier
than the floor its own height implies. That refuses what the register makes
impossible and asserts nothing: the map is not saying when the tower was
built, it is saying the register knows of no building that tall before then.

MEASURED on the shipped stream: **5 of the 20,571 move, 3 of them 40 m or
over**, and the 174 m tower goes from 1906 to 1917. Nothing dated by its own
parcel is touched, and nothing undated is touched — an undated footprint is
drawn in every year on purpose (`time.ts`, the undated street trees' rule) and
that is a different decision.

── WHAT THIS DOES NOT FIX, STATED SO IT IS NOT MISTAKEN FOR FIXED ─────────
The floor is only as strong as the dated cohort's own earliest outlier, and
that cohort has one: the second tallest structure in the city, 259 m, carries
an OWN parcel roll year of 1917. No flag is set on it, the renderer is
repeating the assessor exactly, and nothing here touches it. That is why the
174 m tower lands on 1917 rather than anywhere later. `diag_tall_years.py`
carries the open question.
"""
from __future__ import annotations

import json
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
ROOT = pathlib.Path("/Users/daniel/code/open-public-data")
OUT = ROOT / "website/public/data/us/sf/city/base/height-floor.json"

FLAG_BLOCKYEAR = 8
FLAG_NOYEAR = 16
YEAR0 = 1849            # build_bldg.py's own offset


def main() -> None:
    from _bldgsrc import read_bldg          # noqa: E402 — the encoder's reader

    B = read_bldg()
    h = np.asarray(B["h"], dtype=float)
    u = np.asarray(B["u"])
    yr = YEAR0 + np.asarray(B["yr"], dtype=int)
    noy = (u & FLAG_NOYEAR) != 0
    blk = (u & FLAG_BLOCKYEAR) != 0
    own = ~noy & ~blk

    # tallest first, then a running minimum of the year: `earliest[i]` is the
    # earliest year the register dates anything at least as tall as `hs[i]`
    ho, yo = h[own], yr[own]
    order = np.argsort(-ho)
    hs, ys = ho[order], yo[order]
    earliest = np.minimum.accumulate(ys)

    # ship it as the STEPS only — the height at which the floor changes — which
    # is a few dozen rows rather than 142,679, and is exactly equivalent
    steps: list[list[int]] = []
    last = None
    for i in range(len(hs) - 1, -1, -1):        # shortest first
        e = int(earliest[i])
        if e != last:
            steps.append([int(round(hs[i])), e])
            last = e
    steps.sort()
    # ROUNDING TO WHOLE METRES CAN PUT TWO YEARS AT ONE HEIGHT. The curve is
    # "the earliest year anything at least this tall is dated", so where two
    # rows collide the EARLIER year is the true one: a 17 m building really is
    # dated 1894, and letting the taller row's 1898 stand there would refuse a
    # year the register actually supports. Keep the earliest, then hold the
    # curve non-decreasing.
    byh: dict[int, int] = {}
    for hgt, y in steps:
        byh[hgt] = min(y, byh.get(hgt, y))
    dedup: list[list[int]] = []
    for hgt in sorted(byh):
        y = byh[hgt]
        if dedup and y <= dedup[-1][1]:
            continue
        dedup.append([hgt, y])

    def floor_for(H: float) -> int:
        f = 0
        for hgt, y in dedup:
            if H >= hgt:
                f = y
        return f

    moved = [i for i in np.where(blk)[0] if yr[i] < floor_for(h[i])]
    big = [i for i in moved if h[i] >= 40]

    payload = {
        "note": "for a height in metres, the earliest year the assessor's roll "
                "dates ANY building at least that tall, counting only the "
                "footprints dated by their OWN parcel. A footprint whose year "
                "was borrowed from its block (FLAG_BLOCKYEAR) is drawn no "
                "earlier than the floor its own height implies. This dates "
                "nothing: it refuses what the register makes impossible.",
        "source": {
            "publisher": "San Francisco Office of the Assessor-Recorder / DataSF",
            "dataset": "property roll wv5m-vpq2, joined to footprints ynuv-fyni",
            "derived_from": f"the {int(own.sum()):,} footprints dated by their "
                            f"own parcel, of {B['n']:,}",
            "script": "pipeline/scripts/us_sf_city/build_height_floor.py",
        },
        "applies_to": "FLAG_BLOCKYEAR, bit 3 of the bldg chunk's `u` byte",
        "measured": {
            "blockYear": int(blk.sum()),
            "moved": len(moved),
            "movedOver40m": len(big),
        },
        "not_fixed": "the 259 m structure first drawn in 1917 carries that "
                     "year on its OWN parcel roll and no flag, so nothing here "
                     "touches it — and it is what holds this floor at 1917.",
        "steps": dedup,
    }
    OUT.write_text(json.dumps(payload) + "\n")
    print(f"{len(dedup)} floor steps, from {int(own.sum()):,} own-parcel rows")
    for hgt, y in dedup:
        print(f"   >= {hgt:4d} m  ->  {y}")
    print(f"\n{int(blk.sum()):,} footprints carry their block's year")
    print(f"{len(moved)} are drawn earlier than the register dates anything "
          f"their height; {len(big)} of those are 40 m or over")
    for i in big:
        print(f"   {h[i]:6.0f} m  {yr[i]} -> {floor_for(h[i])}")
    print(f"wrote {OUT} {OUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
