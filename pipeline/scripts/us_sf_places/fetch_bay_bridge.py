"""The three published files the Bay Bridge is drawable from, cached.

They are THE SAME THREE the Golden Gate is built from, which is the whole
argument for drawing it: `encode_city_chunks._encode_bridge` reads a deck line,
FHWA's National Bridge Inventory for the dimensions and the completion year,
and the FAA's Digital Obstacle File for the towers. Nothing new is trusted.

    1. US Census TIGERweb Primary Roads  -- the deck ALIGNMENT.
       `_encode_bridge` already cites this file as the Golden Gate's
       corroboration ("9 of its 11 vertices fall inside this ring"). For the Bay
       Bridge it is the primary, because no City register carries the structure
       at all: it is Caltrans's, and every register this pipeline reads is a
       register of CITY property. Same shape as DRAW.md 21.19, one level out.

    2. FHWA National Bridge Inventory 2023, California -- the DIMENSIONS and the
       YEAR. Structures 34 0003 (the 1936 west crossing over San Francisco Bay)
       and 34 0006 (the 2013 east span). Same file, same year, same fields as
       the Golden Gate's 27 0052.

    3. FAA Digital Obstacle File -- the TOWERS. Same file and the same field
       pair (AGL/AMSL) the Golden Gate's two towers come from, and the same
       whole-arc-second precision, which is 31 m of latitude here.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE / "cache"
UA = {"User-Agent": "qipu-sf-places/1.0 (open data pipeline)"}

TIGER = ("https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
         "Transportation/MapServer/2/query")
NBI = "https://www.fhwa.dot.gov/bridge/nbi/2023/delimited/CA23.txt"
DOF = "https://aeronav.faa.gov/Obst_Data/DAILY_DOF_DAT.ZIP"

# the envelope is San Francisco Bay between the two counties, and it is stated
# rather than tuned: it is the drawn city's own east edge out to the county line
ENVELOPE = (-122.42, 37.75, -122.30, 37.85)


def _get(url: str, timeout: int = 300) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _write(name: str, blob: bytes, url: str, what: str) -> pathlib.Path:
    p = CACHE / name
    p.write_bytes(blob)
    (CACHE / f"{name}.meta.json").write_text(json.dumps({
        "url": url, "what": what, "bytes": len(blob),
        "sha256": hashlib.sha256(blob).hexdigest(),
    }, indent=1) + "\n")
    print(f"    {name}  {len(blob):,} bytes")
    return p


def fetch_tiger() -> None:
    q = urllib.parse.urlencode({
        "where": "NAME LIKE '%Bay Brg%'",
        "geometry": ",".join(str(v) for v in ENVELOPE),
        "geometryType": "esriGeometryEnvelope", "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "NAME,MTFCC,OID", "returnGeometry": "true",
        "outSR": "4326", "f": "json",
    })
    blob = _get(f"{TIGER}?{q}")
    n = len(json.loads(blob).get("features", []))
    _write("bay_bridge_tiger.json", blob, f"{TIGER}?{q}",
           f"US Census TIGERweb Primary Roads, NAME LIKE '%Bay Brg%' inside "
           f"{ENVELOPE}: {n} features")


def fetch_nbi() -> None:
    _write("nbi_ca23.txt", _get(NBI), NBI,
           "FHWA National Bridge Inventory 2023, California")


def fetch_dof() -> None:
    _write("faa_dof.zip", _get(DOF), DOF,
           "FAA Digital Obstacle File, DAILY_DOF_DAT")


if __name__ == "__main__":
    CACHE.mkdir(exist_ok=True)
    for name, fn in (("bay_bridge_tiger.json", fetch_tiger),
                     ("nbi_ca23.txt", fetch_nbi),
                     ("faa_dof.zip", fetch_dof)):
        if (CACHE / name).exists():
            print(f"    {name}  cached")
            continue
        fn()
