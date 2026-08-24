"""Fetch the PUBLISHED geometry for the reach layer, one file per source.

    python3 pipeline/scripts/us_sf_reach/fetch_reach_geom.py [name ...]

Writes pipeline/scripts/us_sf_reach/cache/<name>.json, each with the exact URL
it came from, so every coordinate that ever reaches the browser can be traced
back to a request anyone can repeat. Nothing here interprets: the cache holds
what the service returned. `build_reach_geom.py` is where the reading happens.

Sources, and why each one and not another — the argument, not just the URL:

  aqueduct      USGS NHD Flowline (Large Scale), GNIS_NAME='Hetch Hetchy
                Aqueduct', gnis_id 00243393. Federal, public domain.
                CAVEAT CARRIED: this named feature ENDS AT MOCCASIN, not at the
                reservoir. It is ~118 miles, not the 150-160 the city says. The
                upper Mountain Tunnel reach is not part of it. Anything that
                labels this line must say what it measured.
  waterbody     USGS NHD Waterbody (Large Scale) — Hetch Hetchy Reservoir and
                the peninsula/Alameda reservoirs, by GNIS name.
  citylands     DataSF gtnh-hgvs "City Lands". The city's OWN register of the
                land it owns, and its own description says "Not all lands are
                within the City and County proper."
  county        DataSF txuc-3kzm, the boundary of the City and County — the
                same file base/coast was cut from. Carries the Farallones,
                which are legally San Francisco (Gov. Code 23138).
  cpad          CPAD 2026a (GreenInfo Network), AGNCY_NAME = the SFPUC. 255
                holdings. Preferred over PAD-US 4.1, which is a dissolved 2023
                re-publication of this same data (15 blobs against 255
                parcel-aligned holdings).
                TRAP: the Alameda Watershed is filed under UNIT_NAME
                'San Francisco Watershed Lands'. Querying the obvious
                'SFPUC Alameda Watershed' returns 4 features, not 85.
                TRAP: the CPAD endpoints advertised on data.ca.gov time out
                (134.186.6.216). This GreenInfo service is the reachable one.
  sfo           Caltrans CHaviation Airport_Boundaries, OBJECTID 218.
                TRAP: Caltrans ships TWO SFO polygons; 208 is ~2,770 ac and
                runs far east into the Bay and is NOT the airport.
                CAVEAT CARRIED: no legal or cadastral SFO boundary is published
                anywhere. SFO itself cites ~5,207 acres including submerged Bay
                land no published polygon carries. This is a footprint.
  tiger         TIGER/Line 2024 AREALM for California (a 5.6 MB zip; TIGERweb's
                REST does not carry AREALM — verified negative). MTFCC K2582 is
                Cemetery: the Colma cemeteries, with names and areas. TIGER has
                Olivet Memorial Park and OSM does not.

NOT FETCHED, and the reason is a finding: the SFPUC publishes no open GIS. Its
ArcGIS organisation returns "access":"private". Every authoritative source for
San Francisco's own water system is a third party — state, federal or OSM.
"""
from __future__ import annotations

import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE / "cache"
UA = {"User-Agent": "qipu-reach/1.0 (open data cartography; contact via repo)"}

NHD = "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer"
CPAD = ("https://services1.arcgis.com/4ZKi1B1zTblbwgWB/arcgis/rest/services/"
        "CPAD_Holdings_Current_Release/FeatureServer/0")
CALTRANS = ("https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHaviation/"
            "Airport_Boundaries/FeatureServer/0")

RESERVOIRS = [
    "Hetch Hetchy Reservoir", "Lake Eleanor", "Cherry Lake",
    "Lower Crystal Springs Reservoir", "Upper Crystal Springs Reservoir",
    "Crystal Springs Reservoir", "San Andreas Lake", "Pilarcitos Lake",
    "Calaveras Reservoir", "San Antonio Reservoir", "Priest Reservoir",
    "Moccasin Reservoir",
]


def get(url: str, timeout: int = 180) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:              # noqa: BLE001 — retry anything
            if attempt == 3:
                raise
            print(f"    retry {attempt + 1} after {e}", file=sys.stderr)
            time.sleep(4 * (attempt + 1))
    raise RuntimeError("unreachable")


# The reach envelope, lon/lat. NHD is NATIONAL and GNIS names repeat across
# states: an unbounded query for 'Cherry Lake' returns water in Ontario and
# Florida. Measured, by doing it — the first build put Lake Eleanor's bounding
# box at longitude -84.65. Every NHD query here is bounded.
REACH_ENVELOPE = "-123.30,37.20,-119.50,38.10"


def esri_geojson(base: str, layer: str, where: str, out_fields: str,
                 offset: int = 0, envelope: str | None = None) -> tuple[str, dict]:
    q = {
        "where": where, "outFields": out_fields, "returnGeometry": "true",
        "outSR": "4326", "f": "geojson", "resultOffset": str(offset),
        "resultRecordCount": "1000",
    }
    if envelope:
        q.update({"geometry": envelope, "geometryType": "esriGeometryEnvelope",
                  "inSR": "4326", "spatialRel": "esriSpatialRelIntersects"})
    url = f"{base}/{layer}/query?" + urllib.parse.urlencode(q)
    return url, json.loads(get(url))


def save(name: str, doc: dict) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / f"{name}.json"
    p.write_text(json.dumps(doc, sort_keys=False, separators=(",", ":")))
    n = len(doc.get("features") or doc.get("rows") or [])
    print(f"  -> cache/{name}.json  {p.stat().st_size:,} bytes, {n} features")


def paged(base: str, layer: str, where: str, fields: str,
          envelope: str | None = None) -> dict:
    feats, urls, off = [], [], 0
    while True:
        url, d = esri_geojson(base, layer, where, fields, off, envelope)
        urls.append(url)
        got = d.get("features", [])
        feats.extend(got)
        if not d.get("properties", {}).get("exceededTransferLimit") and len(got) < 1000:
            break
        off += len(got)
        if off > 20000:
            break
    return {"_urls": urls, "type": "FeatureCollection", "features": feats}


def f_aqueduct():
    d = paged(NHD, "6", "GNIS_NAME='Hetch Hetchy Aqueduct'",
              "permanent_identifier,gnis_name,gnis_id,lengthkm,ftype,fcode",
              REACH_ENVELOPE)
    save("aqueduct", d)


def f_waterbody():
    names = ",".join("'" + n.replace("'", "''") + "'" for n in RESERVOIRS)
    d = paged(NHD, "12", f"GNIS_NAME IN ({names})",
              "permanent_identifier,gnis_name,gnis_id,areasqkm,ftype,fcode,elevation",
              REACH_ENVELOPE)
    save("waterbody", d)


def _socrata(res: str, name: str):
    url = f"https://data.sfgov.org/resource/{res}.json?$limit=5000"
    rows = json.loads(get(url))
    save(name, {"_urls": [url], "rows": rows})


def f_citylands():
    _socrata("gtnh-hgvs", "citylands")


def f_county():
    _socrata("txuc-3kzm", "county")


def f_cpad():
    where = ("AGNCY_NAME='San Francisco - Public Utilities Commission, "
             "City and County of'")
    d = paged(CPAD, "", where,
              "OBJECTID,HOLDING_ID,UNIT_NAME,AGNCY_NAME,SITE_NAME,LABEL_NAME,"
              "ACRES,COUNTY,ACCESS_TYP,MNG_AGNCY,LAYER,YR_EST,SRC_ALIGN,"
              "DATE_REVIS")
    save("cpad", d)


def f_sfo():
    d = paged(CALTRANS, "", "OBJECTID IN (208,218)",
              "OBJECTID,AIRPORTID,FACILITY,CITY,COUNTY,FAASITENO,Shape__Area")
    save("sfo", d)


def f_tiger():
    url = "https://www2.census.gov/geo/tiger/TIGER2024/AREALM/tl_2024_06_arealm.zip"
    p = CACHE / "tl_2024_06_arealm.zip"
    if p.exists() and p.stat().st_size > 1_000_000:
        print(f"  -> cache/{p.name} already present ({p.stat().st_size:,} bytes)")
        return
    CACHE.mkdir(parents=True, exist_ok=True)
    blob = get(url, timeout=300)
    p.write_bytes(blob)
    (CACHE / "tiger_source.json").write_text(json.dumps({"_urls": [url]}))
    print(f"  -> cache/{p.name}  {len(blob):,} bytes")


def f_dam():
    """O'Shaughnessy Dam, federal NID CA00123.

    GNIS carries NO dams in California — the class was retired — so the National
    Inventory of Dams (or the state DSOD, which is where NID sourced this row) is
    the only place a coordinate for it exists. sourceAgency on the record reads
    'California'."""
    url = "https://nid.sec.usace.army.mil/api/dams/CA00123/inventory"
    rec = json.loads(get(url))
    keep = ("federalId", "name", "stateId", "ownerNames", "latitude", "longitude",
            "damHeight", "damLength", "yearCompleted", "maxStorage", "nidStorage",
            "riverName", "countyName", "stateName", "sourceAgency", "nidHeight")
    save("dam", {"_urls": [url],
                 "rows": [{k: rec.get(k) for k in keep if k in rec}]})


JOBS = {
    "dam": f_dam,
    "aqueduct": f_aqueduct, "waterbody": f_waterbody, "citylands": f_citylands,
    "county": f_county, "cpad": f_cpad, "sfo": f_sfo, "tiger": f_tiger,
}


def main() -> int:
    want = sys.argv[1:] or list(JOBS)
    for name in want:
        if name not in JOBS:
            print(f"unknown source {name!r}; have {list(JOBS)}", file=sys.stderr)
            return 2
        print(f"[{name}]")
        JOBS[name]()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
