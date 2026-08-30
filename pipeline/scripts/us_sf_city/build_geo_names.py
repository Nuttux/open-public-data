#!/usr/bin/env python3
"""THE NAMED GROUND: lakes, hills, beaches, points and the bay itself.

The map writes street names, neighbourhood capitals and designated landmarks,
and says nothing at all about the ground they sit on. Lake Merced has no name
on it. Neither does Mount Davidson, Ocean Beach, Lands End, the Golden Gate or
the bay. Daniel: *"add names to the lakes, bays etc ya know or geolocial
features that are impotant or you think should and would be on a map"*.

── AND THEY ARE NOT OURS TO INVENT ─────────────────────────────────────────
The obvious way to do this is to type a list, which would make the map's
hydrography the one layer with no source behind it. There is an authority:
the **USGS Geographic Names Information System**, the official gazetteer of
the United States, published by the National Map as a public-domain text file
per state. Every name here is a row in it, with its own `feature_id`.

So the map says "Mount Davidson" for the same reason it says a building is
1907: because a public register says so, and the register is named.

── WHAT IS KEPT ────────────────────────────────────────────────────────────
San Francisco county, natural classes only. `Populated Place` and `Civil` are
dropped because the map already draws neighbourhoods from the city's own hood
rings and two sets of settlement names would collide and disagree.

A SHORT ALLOWLIST crosses the county line, because a map of San Francisco that
does not name the bay it stands on, or the strait it is famous for, is
answering a question nobody asked. Those are listed explicitly rather than
taken by a radius, so the file cannot quietly fill up with Contra Costa coves.

── RANK, WHICH IS THE ONLY EDITORIAL ACT HERE ──────────────────────────────
The gazetteer does not say which names matter. The label pass needs an order
to drop by when the ink runs out, so each class carries one, and it is written
here rather than derived so it can be argued with: the bay and the ocean
before the hills, the hills before the lakes, the lakes before the rocks. It
changes which names survive a crowded frame. It changes no name and no place.

  python3 build_geo_names.py
"""
from __future__ import annotations

import json
import pathlib
import urllib.request
import zipfile

ROOT = pathlib.Path("/Users/daniel/code/open-public-data")
CACHE = ROOT / "pipeline/scripts/us_sf_city/cache_gnis"
MANIFEST = ROOT / "website/public/data/us/sf/city/manifest.json"
OUT = ROOT / "website/public/data/us/sf/city/base/geo-names.json"

SRC = ("https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/"
       "DomesticNames/DomesticNames_CA_Text.zip")

# what a city map names, and what it does not. `Bar` is rocks and shoals --
# navigational, not civic -- and `Populated Place`/`Civil` duplicate the hood
# rings the map already draws from the city's own record.
CLASS_RANK = {
    # CHANNEL WAS MISSING AND IT COST THE GOLDEN GATE. The gazetteer files the
    # strait as a Channel, not a Bay or a Gap, and so is Islais Creek Channel
    # -- so the single most famous geographic feature in San Francisco was
    # absent from a map of San Francisco because a class was left out of this
    # table. Ranked with the bay: it is the water the city is named around.
    "Channel": 1,
    "Bay": 1,
    "Summit": 2,
    "Island": 3,
    "Cape": 3,
    "Beach": 3,
    "Lake": 4,
    "Reservoir": 5,
    "Valley": 5,
    "Stream": 6,
    "Falls": 7,
    "Woods": 7,
    "Basin": 7,
    "Cliff": 6,
    "Ridge": 4,
}

# across the county line on purpose: the water the city stands in, and the
# islands anyone looking at this view can see
ALLOW_OUTSIDE = {
    "San Francisco Bay", "Golden Gate", "Pacific Ocean", "Angel Island",
    "Treasure Island", "Yerba Buena Island", "Richardson Bay",
}


def fetch() -> list[str]:
    CACHE.mkdir(parents=True, exist_ok=True)
    z = CACHE / "DomesticNames_CA_Text.zip"
    if not z.exists() or z.stat().st_size < 100_000:
        req = urllib.request.Request(SRC, headers={"User-Agent": "qipu-gnis/1"})
        with urllib.request.urlopen(req, timeout=300) as r:
            z.write_bytes(r.read())
        print(f"  fetched {z.stat().st_size:,} bytes")
    with zipfile.ZipFile(z) as Z:
        member = next(n for n in Z.namelist() if n.lower().endswith(".txt"))
        return Z.read(member).decode("utf-8", "replace").split("\n")


def main() -> None:
    lines = fetch()
    hdr = lines[0].lstrip("﻿").split("|")
    ix = {h: i for i, h in enumerate(hdr)}

    man = json.loads(MANIFEST.read_text())
    P = man["proj"]
    mx = P["mpd"] * P["cosl"]
    W, S, E, N = man["surround"]["bbox"]

    seen_names: set[str] = set()
    out = []
    for ln in lines[1:]:
        if not ln:
            continue
        r = ln.split("|")
        if len(r) <= ix["prim_long_dec"]:
            continue
        cls = r[ix["feature_class"]]
        name = r[ix["feature_name"]]
        rank = CLASS_RANK.get(cls)
        if rank is None:
            continue
        in_sf = r[ix["county_name"]] == "San Francisco"
        if not in_sf and name not in ALLOW_OUTSIDE:
            continue
        try:
            lat = float(r[ix["prim_lat_dec"]])
            lon = float(r[ix["prim_long_dec"]])
        except ValueError:
            continue
        if not (W <= lon <= E and S <= lat <= N):
            continue
        # THE GAZETTEER NAMES A FEATURE TWICE where two authorities entered
        # it -- Twin Peaks Reservoir has two rows a few hundred metres apart,
        # and both were written on the map. A city does not have two things of
        # the same name, so the first row wins and the rest are dropped.
        if name in seen_names:
            continue
        seen_names.add(name)
        # A NAVIGATIONAL ROCK IS NOT A MAP FEATURE at the sizes this map is
        # read at. Fort Point Rock and Helmet Rock are real, named and
        # published, and they were taking frame from GOLDEN GATE. They keep
        # their place in the file and lose every collision to something with
        # a shore on it.
        r_ = rank if in_sf else 0
        if cls == "Island" and name.rstrip().endswith(("Rock", "Rocks", "Reef", "Shoal")):
            r_ = 9
        out.append({
            "n": name,
            "k": cls,
            "r": r_,
            "id": int(r[ix["feature_id"]]),
            "x": round((lon - P["lon0"]) * mx, 1),
            "y": round((lat - P["lat0"]) * P["mpd"], 1),
        })

    out.sort(key=lambda f: (f["r"], f["n"]))
    payload = {
        "note": "named natural features, from the United States' official "
                "gazetteer. `r` is a drop order for a crowded frame, written "
                "in the pipeline and not in the register.",
        "source": {
            "publisher": "U.S. Geological Survey, National Map",
            "dataset": "Geographic Names Information System, Domestic Names, "
                       "California",
            "url": SRC,
            "licence": "US Government work, public domain",
            "what": "every feature carries its own GNIS feature_id in `id`.",
        },
        "features": out,
    }
    OUT.write_text(json.dumps(payload) + "\n")
    by: dict[str, int] = {}
    for f in out:
        by[f["k"]] = by.get(f["k"], 0) + 1
    print(f"{len(out)} named features")
    for k in sorted(by, key=lambda k: -by[k]):
        print(f"   {k:10s} {by[k]:3d}")
    print(f"wrote {OUT} {OUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
