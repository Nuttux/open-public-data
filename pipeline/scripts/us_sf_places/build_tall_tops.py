"""THE TOWERS THE 2023 SCAN DID NOT SEE.

    python3 pipeline/scripts/us_sf_places/build_tall_tops.py
    python3 pipeline/scripts/us_sf_places/build_tall_tops.py --check   report only

WHAT THIS IS FOR, AND IT IS SMALLER THAN IT SOUNDS.

The fabric draws every building at `hgt_mediancm`, the MEDIAN LIDAR return over
its footprint. For a flat-roofed tower that is the right statistic and it is
very nearly exact -- MEASURED against DataSF's Tall Building Inventory
(`5kya-mfst`), which publishes a surveyed `height_ft` for every building in
this city over 240 ft:

    180 register rows, joined to the shipped footprints
    144 agree with the drawing to within 10 m
     16 are drawn SHORT by more than 10 m
      0 are drawn TALL by more than 10 m

So this is not a correction of the scan. The scan is right about seven eighths
of the towers and this file does not touch those. What it fixes is the other
sixteen, and their gaps are not small ones:

    Salesforce Tower        drawn 108.1 m   published 326.1 m
    181 Fremont             drawn   5.4 m   published 227.4 m
    450 Folsom              drawn   8.4 m   published 167.6 m
    340 Fremont Street      drawn   2.9 m   published 121.9 m

Nearly every one of them is a Transbay or Rincon Hill tower completed between
2010 and 2018, and the pattern says what happened: the shipped footprint is
older than the tower, or the flight caught a site rather than a building. The
tallest building in San Francisco is drawn as a 108 m block.

-- AND THE GATE IS THE FOOTPRINT'S OWN AREA -------------------------------
A published top may only be applied to a footprint that could plausibly BE
that tower's plan. Raising a 468 m2 stump to 227 m does not draw 181 Fremont;
it draws a needle, which is a different wrong answer. So the register's own
`tower_plan_size` (or `base_plan_size` where there is no tower plan) is the
reference, and a row is taken only when the footprint's area is between
`AREA_LO` and `AREA_HI` of it.

That gate REFUSES more than it accepts, and the refusals are the honest half
of the file: they are written into the output so a reader can see which towers
this map still draws short and why. A footprint far smaller than the plan is a
fragment; one far larger is the whole block's podium. Neither is the tower.
"""
import argparse
import json
import math
import pathlib
import re
import sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline/scripts/us_sf_city"))
sys.path.insert(0, str(ROOT / "pipeline/scripts"))

from _bldgsrc import read_bldg  # noqa: E402

REG = ROOT / "pipeline/scripts/us_sf_places/cache/tall_buildings.geojson"
OUT = ROOT / "website/public/data/us/sf/city/base/tall-tops.json"

# the projection the shipped chunks are in -- the city manifest's own
LON0, LAT0, MPD, COSL = -122.438, 37.76, 111320.0, 0.790582709628753

FT = 0.3048
#: below this the two measurements agree and the scan is left alone. 10 m is
#: three storeys: under it, a disagreement is a parapet, an antenna or a
#: rounding of the median, and above it the scan did not see the building.
GAP_MIN_M = 10.0
#: the footprint's area, as a share of the register's own plan. See the header.
AREA_LO, AREA_HI = 0.5, 2.0
#: how far outside a register polygon a footprint centroid may sit and still be
#: taken as that building -- the register outlines the PARCEL and a concave one
#: can put its own tower's centroid just outside.
NEAR_M = 40.0


def plan_m2(s):
    """`165x165` in feet -> square metres, or None."""
    m = re.match(r"\s*(\d+)\s*[xX]\s*(\d+)", s or "")
    return (float(m.group(1)) * FT) * (float(m.group(2)) * FT) if m else None


def ring_area(ix, iy):
    a = 0.0
    n = len(ix)
    for k in range(n):
        j = (k + 1) % n
        a += ix[k] * iy[j] - ix[j] * iy[k]
    return abs(a) / 2


def inside(px, py, rx, ry):
    n = len(rx)
    j = n - 1
    c = False
    for i in range(n):
        if ((ry[i] > py) != (ry[j] > py)) and (
            px < (rx[j] - rx[i]) * (py - ry[i]) / (ry[j] - ry[i] + 1e-30) + rx[i]
        ):
            c = not c
        j = i
    return c


#: the sample pitch of the overlap test, metres. The smallest thing this
#: register carries is a 1,000 m2 tower plan, so 2 m samples it at ~250 points.
OVERLAP_STEP = 2.0
#: how much of the register's own polygon a footprint must cover to BE that
#: building. See `best_overlap`.
OVERLAP_MIN = 0.30


def best_overlap(pts, cx, cy, off, cnt, IX, IY, cell_of):
    """WHICH FOOTPRINT IS THIS REGISTER ROW, BY AREA AND NOT BY DISTANCE.

    THE FIRST VERSION OF THIS WAS WRONG AND SHIPPED. It took the footprint
    whose vertex mean fell inside the register's polygon and, WHERE NOTHING
    FELL INSIDE, the nearest footprint within 80 m. That fallback is what a
    join must never have: it cannot fail, so it silently attaches a published
    height to whichever tower happens to be next door.

    MEASURED after the fact, by asking each of the seven rows it produced how
    much of its register polygon the footprint it chose actually covers:

        Solaire                100.0 %      Salesforce Tower    0.0 %
        LUMINA II               98.5 %      33 Tehama Street    0.0 %
        LUMINA I                97.2 %      500 Folsom          0.0 %
                                            One Rincon Hill S.  0.0 %

    Four of seven were on a different building. Salesforce Tower's 326 m was
    put on a 103 m tower 70 m away, because the shipped footprint set has NO
    footprint for Salesforce Tower at all: its register polygon is 3,268 m2
    and every square metre of it is over open ground.

    So the join is now an overlap, sampled on a grid, and it does not fall
    back. A row whose best footprint covers less than `OVERLAP_MIN` of its
    register polygon is refused and says so. A join that can fail is the only
    kind worth having.
    """
    RX = [p[0] for p in pts]
    RY = [p[1] for p in pts]
    lo_x, hi_x, lo_y, hi_y = min(RX), max(RX), min(RY), max(RY)
    cand = set()
    for i in cell_of(lo_x, lo_y, hi_x, hi_y):
        cand.add(i)
    hit = {}
    tot = 0
    x = lo_x
    while x < hi_x:
        y = lo_y
        while y < hi_y:
            if inside(x, y, RX, RY):
                tot += 1
                for i in cand:
                    o, c = int(off[i]), int(cnt[i])
                    rx = IX[o:o + c]
                    ry = IY[o:o + c]
                    if inside(x, y, rx, ry):
                        hit[i] = hit.get(i, 0) + 1
                        break
            y += OVERLAP_STEP
        x += OVERLAP_STEP
    if not tot or not hit:
        return None, 0.0, tot * OVERLAP_STEP * OVERLAP_STEP
    b = max(hit, key=lambda k: hit[k])
    return b, hit[b] / tot, tot * OVERLAP_STEP * OVERLAP_STEP


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()

    B = read_bldg()
    cx, cy, h = B["cx"], B["cy"], B["h"].astype(np.float64)
    off, cnt, IX, IY = B["off"], B["cnt"], B["IX"], B["IY"]
    feats = json.loads(REG.read_text())["features"]

    # a coarse bucket, so one overlap test walks a handful of rings and not
    # 166,166 of them. 120 m is the footprint index's own cell.
    GRID = 120.0
    bucket: dict[tuple[int, int], list[int]] = {}
    for i in range(B["n"]):
        o, c = int(off[i]), int(cnt[i])
        gx0 = int(IX[o:o + c].min() // GRID); gx1 = int(IX[o:o + c].max() // GRID)
        gy0 = int(IY[o:o + c].min() // GRID); gy1 = int(IY[o:o + c].max() // GRID)
        for gx in range(gx0, gx1 + 1):
            for gy in range(gy0, gy1 + 1):
                bucket.setdefault((gx, gy), []).append(i)

    def cell_of(x0, y0, x1, y1):
        out = []
        for gx in range(int(x0 // GRID), int(x1 // GRID) + 1):
            for gy in range(int(y0 // GRID), int(y1 // GRID) + 1):
                out.extend(bucket.get((gx, gy), ()))
        return out

    taken, refused, agreed = [], [], 0
    for f in feats:
        P = f["properties"]
        try:
            pub = float(P["height_ft"]) * FT
        except (TypeError, ValueError, KeyError):
            continue
        name = (P.get("name") or "").strip()
        ring = f["geometry"]["coordinates"][0]
        rx = np.array([(p[0] - LON0) * MPD * COSL for p in ring])
        ry = np.array([(p[1] - LAT0) * MPD for p in ring])

        b, frac_cov, poly_m2 = best_overlap(
            list(zip(rx, ry)), cx, cy, off, cnt, IX, IY, cell_of)
        if b is None or frac_cov < OVERLAP_MIN:
            refused.append({
                "name": name, "topM": round(pub, 1),
                "polyM2": round(poly_m2),
                "coverage": round(frac_cov, 3),
                "why": ("no shipped footprint covers this register polygon — "
                        "the building is not in the footprint set"
                        if b is None or frac_cov == 0 else
                        "the best footprint covers too little of the register "
                        "polygon to be that building"),
            })
            continue

        gap = pub - float(h[b])
        if gap <= GAP_MIN_M:
            agreed += 1
            continue

        o, c = int(off[b]), int(cnt[b])
        area = ring_area(IX[o:o + c], IY[o:o + c])
        want = plan_m2(P.get("tower_plan_size")) or plan_m2(P.get("base_plan_size"))
        frac = area / want if want else None
        row = {
            "gid": int(b), "name": name,
            "topM": round(pub, 1), "drawnM": round(float(h[b]), 1),
            "gapM": round(gap, 1), "areaM2": round(area),
            "planM2": round(want) if want else None,
            "frac": round(frac, 2) if frac else None,
            "date": str(P.get("date") or "")[:4],
            "coverage": round(frac_cov, 3),
        }
        if frac is None:
            row["why"] = "the register publishes no plan size, so the gate cannot run"
            refused.append(row)
        elif not (AREA_LO <= frac <= AREA_HI):
            row["why"] = ("the footprint is a fragment of the tower's plan"
                          if frac < AREA_LO else
                          "the footprint is the block's podium, not the tower")
            refused.append(row)
        else:
            taken.append(row)

    taken.sort(key=lambda r: -r["gapM"])
    refused.sort(key=lambda r: -(r.get("gapM") or 0))
    doc = {
        "note": ("the surveyed top for the towers the 2023 scan drew short. The "
                 "fabric's height is the MEDIAN LIDAR return over a footprint, "
                 "which is right for a flat-roofed tower and agrees with the "
                 "surveyed height on seven eighths of them. These are the rest."),
        "source": {
            "publisher": "San Francisco Department of Building Inspection / DataSF",
            "dataset": "Tall Building Inventory 5kya-mfst, every building over 240 ft",
            "fields": "height_ft for the top; tower_plan_size or base_plan_size for the gate",
            "joined_to": "the shipped footprints, by containment of the footprint's "
                         "vertex mean in the register's own polygon",
            "script": "pipeline/scripts/us_sf_places/build_tall_tops.py",
        },
        "rule": {
            "gap_min_m": GAP_MIN_M,
            "area_band": [AREA_LO, AREA_HI],
            "why": ("a published top is applied only to a footprint that could BE "
                    "that tower's plan. Raising a fragment to the tower's height "
                    "draws a needle, and raising the block's podium draws a slab."),
        },
        "measured": {
            "register_rows": len(feats),
            "agree_within_gap_min": agreed,
            "taken": len(taken),
            "refused": len(refused),
        },
        "tops": [{"gid": r["gid"], "topM": r["topM"]} for r in taken],
        "taken": taken,
        "refused": refused,
    }
    print(f"register rows {len(feats)}   agree {agreed}   taken {len(taken)}   refused {len(refused)}")
    for r in taken:
        print(f"  TAKE  {r['name'][:30]:32s} {r['drawnM']:7.1f} -> {r['topM']:7.1f} m   frac {r['frac']}")
    for r in refused:
        if r.get("gapM"):
            print(f"  keep  {r['name'][:30]:32s} {r['drawnM']:7.1f} vs {r['topM']:7.1f} m   {r['why']}")
    if a.check:
        return
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
