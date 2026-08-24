"""Download every register this block reads, into `cache/`, and verify each one.

Nothing downstream ever reaches the network: `build_places.py` reads `cache/`
only, so a build is reproducible from the cache and the cache is the record of
what was published on the day it ran. Each file lands with a sidecar
`<name>.meta.json` carrying the URL, the byte count, the row count and the
sha256, so "which file did this name come from" has an answer that is checkable
without re-fetching.

    python3 pipeline/scripts/us_sf_places/fetch_places.py            # missing only
    python3 pipeline/scripts/us_sf_places/fetch_places.py --refresh  # all

DataSF rows arrive as GeoJSON from the Socrata `$query`/geojson endpoint so the
geometry comes with them; the federal files arrive as their publishers ship
them (a zipped pipe-delimited text file, an ArcGIS REST page).
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE / "cache"

# ── DataSF: (four-by-four, filename, what it is) ────────────────────────────
SOCRATA = [
    ("5kya-mfst", "tall_buildings", "Tall Building Inventory"),
    ("ejht-vp5d", "article11", "Article 11 Rating (downtown conservation)"),
    ("6adp-a5yv", "colleges", "Schools_College"),
    ("7e7j-59qk", "schools", "Schools"),
    ("65ik-7wqd", "popos", "Privately Owned Public Open Spaces"),
    ("ib5c-xgwu", "rp_facilities", "Recreation and Parks Facilities"),
    ("nc68-ngbr", "city_facilities", "City Facilities"),
    ("gtr9-ntp6", "rp_properties", "Recreation and Parks Properties"),
    ("gtnh-hgvs", "city_lands", "City Lands"),
    ("38b7-6db3", "rp_funcareas", "Functional Areas maintained by Rec and Parks"),
    ("3nje-yn2u", "rpd_parks", "RPD Parks"),
    ("i28k-bkz6", "muni_stops", "Muni Stops"),
    ("r7bn-7v9c", "civic_art", "Civic Art Collection"),
]

UA = {"User-Agent": "qipu-sf-places/1.0 (open data pipeline)"}


def _get(url: str, timeout: int = 180) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == 3:
                raise
            print(f"    retry {attempt + 1} after {e}")
            time.sleep(2 * (attempt + 1))
    raise AssertionError("unreachable")


def _write(name: str, blob: bytes, url: str, rows: int | None, what: str) -> None:
    p = CACHE / name
    p.write_bytes(blob)
    (CACHE / f"{name}.meta.json").write_text(
        json.dumps(
            {
                "url": url,
                "what": what,
                "bytes": len(blob),
                "rows": rows,
                "sha256": hashlib.sha256(blob).hexdigest(),
                "retrieved_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            indent=1,
        )
    )
    print(f"    {name}  {len(blob):,} bytes  {rows if rows is not None else '?'} rows")


def fetch_socrata(fourby: str, name: str, what: str) -> None:
    # The metadata page first: it is the publisher's own description of the
    # file, and it is what the manifest quotes rather than anything typed here.
    meta = json.loads(_get(f"https://data.sfgov.org/api/views/{fourby}.json"))
    url = f"https://data.sfgov.org/resource/{fourby}.geojson?$limit=50000"
    blob = _get(url)
    fc = json.loads(blob)
    rows = len(fc.get("features", []))
    _write(f"{name}.geojson", blob, url, rows, what)
    (CACHE / f"{name}.dataset.json").write_text(
        json.dumps(
            {
                "id": fourby,
                "name": meta.get("name"),
                "description": meta.get("description"),
                "attribution": meta.get("attribution"),
                "rowsUpdatedAt": meta.get("rowsUpdatedAt"),
                "columns": {
                    c["fieldName"]: {
                        "name": c.get("name"),
                        "type": c.get("dataTypeName"),
                        "description": c.get("description"),
                    }
                    for c in meta.get("columns", [])
                },
            },
            indent=1,
        )
    )


def fetch_gnis() -> None:
    """USGS Geographic Names Information System, the California file.

    Public domain, US Board on Geographic Names. Pipe-delimited, one row a
    named feature, with a feature class and a primary point.
    """
    url = (
        "https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/"
        "DomesticNames/DomesticNames_CA_Text.zip"
    )
    blob = _get(url, timeout=300)
    _write("gnis_ca.zip", blob, url, None, "USGS GNIS Domestic Names, California")


def fetch_nrhp() -> None:
    """National Register of Historic Places, NPS's own map service.

    Layer 0 is the point per listing, layer 1 the polygon where one is
    published. Both are queried inside the City and County of San Francisco's
    bounding box in WGS84 and filtered to the county afterwards.
    """
    base = (
        "https://mapservices.nps.gov/arcgis/rest/services/cultural_resources/"
        "nrhp_locations/MapServer"
    )
    box = "-123.20,37.60,-122.28,37.86"
    for layer, name in ((0, "nrhp_points"), (1, "nrhp_polys")):
        q = urllib.parse.urlencode(
            {
                "where": "1=1",
                "geometry": box,
                "geometryType": "esriGeometryEnvelope",
                "inSR": "4326",
                "spatialRel": "esriSpatialRelIntersects",
                "outFields": "*",
                "returnGeometry": "true",
                "outSR": "4326",
                "f": "geojson",
            }
        )
        url = f"{base}/{layer}/query?{q}"
        blob = _get(url, timeout=240)
        fc = json.loads(blob)
        _write(f"{name}.geojson", blob, url, len(fc.get("features", [])), f"NRHP layer {layer}")


def main() -> int:
    CACHE.mkdir(parents=True, exist_ok=True)
    refresh = "--refresh" in sys.argv
    jobs: list[tuple[str, object]] = []
    for fourby, name, what in SOCRATA:
        jobs.append((f"{name}.geojson", lambda f=fourby, n=name, w=what: fetch_socrata(f, n, w)))
    jobs.append(("gnis_ca.zip", fetch_gnis))
    jobs.append(("nrhp_points.geojson", fetch_nrhp))

    for marker, fn in jobs:
        if (CACHE / marker).exists() and not refresh:
            print(f"  have {marker}")
            continue
        print(f"  get  {marker}")
        fn()  # type: ignore[operator]
    return 0


if __name__ == "__main__":
    sys.exit(main())
