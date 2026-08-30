#!/usr/bin/env python3
"""THE BIKE NETWORK, AND THE YEAR EACH PIECE OF IT WAS PUT IN.

The map draws streets from the year the Board accepted them, buildings from
the assessor's roll and track from the year the city paid to lay it. The bike
network is the same kind of thing and was not drawn at all.

DataSF `ygmz-vaxd`, the bikeway network, publishes **`install_yr`** on 5,217 of
5,457 rows (96 %) — one of the very few city registers that dates itself
without any inference at all. 1970 to 2025, and more than a third of it went in
between 2010 and 2014.

── AND IT NEEDS NO GEOMETRY OF ITS OWN ──────────────────────────────────────
Every row carries `cnn`, the street centreline's own identifier, so a bikeway
IS a street the city has marked. The geometry comes from `3psu-pn9h`, the same
centreline file `build_rail_history.py` resolves routes against, which means
the bike lane lies exactly on the street it is painted on rather than a few
metres beside it — the class of error this renderer keeps finding.

── THE FOUR CLASSES ARE NOT THE SAME THING AND ARE NOT DRAWN THE SAME ───────
The register's own classes, in Caltrans' terms:

    CLASS I    371   a path away from traffic
    CLASS II  1807   a painted lane
    CLASS III 2646   a shared lane -- a marking on a road, no lane at all
    CLASS IV   631   physically separated

A map that draws all four alike says the city has 5,457 bike lanes. It has
1,807 painted lanes, 631 separated ones, and 2,646 stretches of road with a
picture of a bicycle on them, which is a different claim about a city. The
class is carried through so the layer can hold them apart.

── UNDATED ROWS, AND WHY THE STREETS' CONVENTION DOES NOT TRANSFER ──────────
904 rows carry `install_yr` 0. `streets.ts` draws an undated street from the
first frame, because a street the Board never wrote about is more likely to be
old than new. **That reasoning is exactly backwards here.** A street can
predate the record; a bike lane cannot predate bicycles being planned for. Run
that way the map put 71,000 vertices of bikeway on the city in 1906, which is
not a gap in the register -- it is the map asserting something false.

So an undated row is floored at the earliest year the register dates ANY of
its own rows. The register cannot say when that lane went in, but it can say
the city was not building this kind of thing before it started. The floor is
computed from the data rather than typed, so it moves if the register does.

  python3 build_bikeways.py
"""
from __future__ import annotations

import json
import math
import pathlib
import urllib.request

ROOT = pathlib.Path("/Users/daniel/code/open-public-data")
CACHE = ROOT / "pipeline/scripts/us_sf_city/cache_streets"
MANIFEST = ROOT / "website/public/data/us/sf/city/manifest.json"
OUT = ROOT / "website/public/data/us/sf/city/base/bikeways.json"

BIKE = "https://data.sfgov.org/resource/ygmz-vaxd.json?$limit=50000"
CENTRELINES = "https://data.sfgov.org/resource/3psu-pn9h.geojson"

CLASS_CODE = {"CLASS I": 1, "CLASS II": 2, "CLASS III": 3, "CLASS IV": 4}


def centrelines_by_cnn() -> dict[str, list[list[tuple[float, float]]]]:
    """Every centreline in world metres, keyed by its `cnn`."""
    CACHE.mkdir(parents=True, exist_ok=True)
    blob = CACHE / "centrelines.geojson"
    if not blob.exists() or blob.stat().st_size < 10_000:
        parts, offset = [], 0
        while True:
            q = f"{CENTRELINES}?$limit=5000&$offset={offset}"
            req = urllib.request.Request(q, headers={"User-Agent": "qipu-bike/1"})
            with urllib.request.urlopen(req, timeout=300) as r:
                page = json.loads(r.read()).get("features", [])
            if not page:
                break
            parts.extend(page)
            offset += 5000
        blob.write_text(json.dumps({"features": parts}))
    feats = json.loads(blob.read_text())["features"]

    P = json.loads(MANIFEST.read_text())["proj"]
    mx = P["mpd"] * P["cosl"]
    out: dict[str, list[list[tuple[float, float]]]] = {}
    for ft in feats:
        cnn = str(ft["properties"].get("cnn") or "").strip()
        if not cnn:
            continue
        g = ft.get("geometry") or {}
        coords = g.get("coordinates") or []
        parts_ = coords if g.get("type") == "MultiLineString" else [coords]
        for part in parts_:
            line = [((lon - P["lon0"]) * mx, (lat - P["lat0"]) * P["mpd"])
                    for lon, lat in part]
            if len(line) > 1:
                out.setdefault(cnn, []).append(line)
    return out


def main() -> None:
    req = urllib.request.Request(BIKE, headers={"User-Agent": "qipu-bike/1"})
    with urllib.request.urlopen(req, timeout=300) as r:
        rows = json.loads(r.read())
    print(f"{len(rows):,} bikeway rows published")

    by_cnn = centrelines_by_cnn()
    print(f"{len(by_cnn):,} centrelines keyed by cnn")

    dated_years = [
        int(x["install_yr"]) for x in rows
        if str(x.get("install_yr") or "").isdigit() and 1900 <= int(x["install_yr"]) <= 2030
    ]
    floor = min(dated_years) if dated_years else 0
    print(f"the register's earliest dated row is {floor} — undated rows are floored there")

    segs = []
    missing = 0
    km_by_class: dict[int, float] = {}
    for x in rows:
        cnn = str(x.get("cnn") or "").strip()
        lines = by_cnn.get(cnn)
        if not lines:
            missing += 1
            continue
        try:
            yr = int(x.get("install_yr") or 0)
        except (TypeError, ValueError):
            yr = 0
        if yr and not (1900 <= yr <= 2030):
            yr = 0
        if not yr:
            yr = floor
        cls = CLASS_CODE.get(str(x.get("facility_t") or "").strip().upper(), 3)
        for line in lines:
            segs.append({
                "y": yr,
                "c": cls,
                "p": [[round(px, 1), round(py, 1)] for px, py in line],
            })
            m = sum(math.dist(a, b) for a, b in zip(line, line[1:]))
            km_by_class[cls] = km_by_class.get(cls, 0.0) + m / 1000

    # the layer draws a draw-range, so the file arrives already in year order
    segs.sort(key=lambda s: (s["y"], s["c"]))
    payload = {
        "note": "the bikeway network, each piece carrying the year the city "
                "installed it. Geometry is the street centreline the row's own "
                "`cnn` names, so a lane lies on the street it is painted on. "
                "A row the register does not date is floored at the earliest "
                "year it dates any row, because a bike lane cannot predate the "
                "city building them.",
        "classes": {"1": "path", "2": "painted lane", "3": "shared lane",
                    "4": "separated"},
        "source": {
            "publisher": "DataSF",
            "dataset": "Bikeway Network",
            "id": "ygmz-vaxd",
            "url": "https://data.sfgov.org/resource/ygmz-vaxd",
            "geometry": "DataSF street centrelines 3psu-pn9h, joined on cnn",
        },
        "segs": segs,
    }
    OUT.write_text(json.dumps(payload) + "\n")

    dated = sum(1 for s in segs if s["y"])
    print(f"{len(segs):,} drawn segments, {missing:,} rows had no centreline for their cnn")
    print(f"{dated:,} dated ({100*dated/max(1,len(segs)):.0f} %)")
    for c in sorted(km_by_class):
        name = payload["classes"][str(c)]
        print(f"   class {c} {name:14s} {km_by_class[c]:6.1f} km")
    for cut in (1980, 1995, 2005, 2015, 2026):
        n = sum(1 for s in segs if s["y"] and s["y"] <= cut)
        print(f"   by {cut}: {n:5,} dated segments in place")
    print(f"wrote {OUT} {OUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
