"""Emit the REACH GEOMETRY: every published shape of a thing San Francisco
decided outside its own boundary, and nothing that is not published.

    python3 pipeline/scripts/us_sf_reach/build_reach_geom.py [--check]

Reads  pipeline/scripts/us_sf_reach/cache/*   (fetch_reach_geom.py put it there)
Writes website/public/data/us/sf/reach/geom.qc     the coordinates
       website/public/data/us/sf/reach/geom.json   the index and the sources
       website/public/data/us/sf/reach/film-badge.json  one sentence for the film

── THE RULE THIS FILE EXISTS TO KEEP ─────────────────────────────────────
Never invent a position. Every ring here came out of a government or, where
stated, an OSM-derived publication, through a URL recorded in the cache file it
was read from. Where geometry is absent the index says so and the map draws
nothing. There is one derived operation — the union of CPAD's parcel-aligned
holdings into a watershed outline — and it is declared per feature, with the
holding count it came from.

── WHY WORLD METRES, AND WHAT THAT COSTS ─────────────────────────────────
Coordinates are the map's OWN frame, manifest.proj:

    x = (lon - lon0) * mpd * cosl        lon0 -122.438  mpd 111320
    y = (lat - lat0) * mpd               lat0   37.76   cosl 0.790583

`cosl` is frozen at the latitude of San Francisco, so the further from 37.76 a
shape is the more its east-west scale is wrong. That is a real error and it is
MEASURED per feature into `proj_err_m` — the largest gap between this frame and
a true cos(lat) scaling over that feature's own vertices — rather than waved at.
It is under 60 m for everything in the water system and it is kilometres for the
Kern County oil land, which is why that feature is flagged `outside_locator` and
why the index also carries every feature's true lon/lat bounding box.

Using the map's own frame is the point: the locator can draw the city outline
and the aqueduct in one frame without a second projection to reconcile.

── THE SIMPLIFICATION, AND HOW IT IS BOUNDED ─────────────────────────────
The locator is a strip about 240 km wide. At 1,200 px that is 200 m a pixel, so
the county's 36,333-vertex legal ring is four orders of magnitude more precision
than any pixel can hold. Rings are simplified (Douglas-Peucker, topology
preserving) at TOL_M and then quantised to whole metres, and the worst deviation
of any ORIGINAL vertex from the simplified ring is measured and written into the
file. Nothing is dropped for being small: a shape either ships whole or does not
ship.
"""
from __future__ import annotations

import argparse
import collections
import json
import math
import pathlib
import sys
import zipfile

import numpy as np
from shapely.geometry import LineString, Point, Polygon, shape
from shapely.ops import unary_union

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _qc import QCWriter, read_qc                       # noqa: E402
from _shp import read_dbf, read_shp_polygons            # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[3]
HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE / "cache"
OUTDIR = ROOT / "website/public/data/us/sf/reach"
MANIFEST = ROOT / "website/public/data/us/sf/city/manifest.json"

TOL_M = 40.0          # 0.2 px on a 240 km strip at 1200 px
AC = 4046.8564224     # m2 in an acre

# HOW FAR OUTSIDE COUNTS AS OUTSIDE.
# 43 City Lands rows have a representative point outside the published county
# ring. Sixteen of them are 3 to 527 m out and every one is on the waterfront —
# Marina Green, the Port lands, Seal Rocks, a water lot on Carroll Avenue. They
# are not reach; they are two DataSF registers disagreeing about where the
# shoreline is, the same border artefact REACH.md 1.1 found in the footprint
# file. The next row out is Sharp Park at 9,370 m. Nothing at all falls between
# 527 m and 9,370 m, so the cut sits in an empty band seventeen times its own
# width, and the measured edges of that band are written into geom.json on every
# run so the choice can be re-checked rather than believed.
MIN_OUT_M = 1000.0

CLASSES = ["county", "watershed", "reservoir", "aqueduct", "airport",
           "cemetery", "cityland", "dam"]
KINDS = ["area", "line", "point"]

# ── THE SOURCE TABLE ──────────────────────────────────────────────────────
# Per source, not per file: what it is, who publishes it, and what is wrong
# with it. Every caveat the recon flagged is carried here or on the feature.
SOURCES = {
    "txuc-3kzm": {
        "publisher": "DataSF",
        "title": "City and County of San Francisco boundary",
        "url": "https://data.sfgov.org/d/txuc-3kzm",
        "what": "the LEGAL boundary, which is why the Farallon Islands are in it",
        "note": "the same dataset base/coast is cut from; it runs kilometres "
                "into the Pacific and straight across the Golden Gate",
    },
    "gtnh-hgvs": {
        "publisher": "DataSF",
        "title": "City Lands",
        "url": "https://data.sfgov.org/d/gtnh-hgvs",
        "what": "the city's own register of the land it owns",
        "note": "the dataset's own description says: \"Not all lands are within "
                "the City and County proper. The City owns properties outside "
                "of its boundaries.\"",
    },
    "cpad-2026a": {
        "publisher": "GreenInfo Network — California Protected Areas Database",
        "title": "CPAD Holdings, current release",
        "url": "https://services1.arcgis.com/4ZKi1B1zTblbwgWB/arcgis/rest/"
               "services/CPAD_Holdings_Current_Release/FeatureServer/0",
        "what": "255 parcel-aligned holdings whose owner is 'San Francisco - "
                "Public Utilities Commission, City and County of'",
        "note": "preferred over PAD-US 4.1, which is a dissolved 2023 "
                "re-publication of this same data — 15 blobs against 255 "
                "holdings. The endpoints advertised on data.ca.gov time out; "
                "this GreenInfo service is the reachable one.",
        "trap": "the Alameda watershed is filed under UNIT_NAME 'San Francisco "
                "Watershed Lands'. Querying 'SFPUC Alameda Watershed' returns "
                "4 features, not 85.",
        "derived": "CPAD is itself compiled from county assessor and agency "
                   "records; its lineage was not independently verified here.",
    },
    "nhd-flowline": {
        "publisher": "USGS — National Hydrography Dataset",
        "title": "NHD Flowline (Large Scale), GNIS_NAME 'Hetch Hetchy Aqueduct'",
        "url": "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/"
               "MapServer/6",
        "what": "43 line features, one GNIS id (00243393), public domain",
    },
    "nhd-waterbody": {
        "publisher": "USGS — National Hydrography Dataset",
        "title": "NHD Waterbody (Large Scale)",
        "url": "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/"
               "MapServer/12",
        "what": "the reservoirs, by GNIS name, with the published surface area",
    },
    "caltrans-airports": {
        "publisher": "Caltrans — Division of Aeronautics",
        "title": "Airport Boundaries (CHaviation)",
        "url": "https://caltrans-gis.dot.ca.gov/arcgis/rest/services/"
               "CHaviation/Airport_Boundaries/FeatureServer/0",
        "what": "OBJECTID 218, the SFO polygon that matches the real footprint",
        "trap": "Caltrans ships TWO SFO polygons. OBJECTID 208 is larger and "
                "runs far east into the Bay and is not the airport. This file "
                "carries 218 and not 208.",
    },
    "tiger-arealm": {
        "publisher": "US Census Bureau — TIGER/Line 2024",
        "title": "Area Landmarks, California (tl_2024_06_arealm)",
        "url": "https://www2.census.gov/geo/tiger/TIGER2024/AREALM/"
               "tl_2024_06_arealm.zip",
        "what": "MTFCC K2582 (Cemetery) inside the Colma box",
        "note": "a file download; TIGERweb's REST service does not carry "
                "AREALM — verified negative. TIGER has Olivet Memorial Park "
                "and OpenStreetMap does not, so the obvious cartographic "
                "source is the incomplete one here.",
    },
    "nid": {
        "publisher": "US Army Corps of Engineers — National Inventory of Dams",
        "title": "NID CA00123",
        "url": "https://nid.sec.usace.army.mil/api/dams/CA00123/inventory",
        "what": "O'Shaughnessy Dam: the coordinate, the height, the year and "
                "the owner",
        "note": "GNIS carries NO dams in California — the class was retired — "
                "so a federal or state dam register is the only place this "
                "position exists. The NID row's own sourceAgency is "
                "'California', i.e. the state DSOD.",
    },
}

COLMA_BOX = (-122.50, 37.64, -122.42, 37.71)

# The city owns land in Kern and Fresno counties, so the sanity box has to be
# California-sized rather than Bay-sized. It exists because a name query against
# a NATIONAL register is a trap that already bit: the first build's Lake Eleanor
# was in Ontario, because GNIS names repeat across states. Any vertex outside
# this box fails the build.
SANITY_LL = (-124.5, 32.4, -114.0, 42.1)          # California, generously

# filled by collect(); the measured edges of the empty band around MIN_OUT_M
BAND: dict = {}


# ── projection ────────────────────────────────────────────────────────────
class Proj:
    def __init__(self, p: dict):
        self.lon0, self.lat0 = p["lon0"], p["lat0"]
        self.mpd, self.cosl = p["mpd"], p["cosl"]

    def xy(self, lon: float, lat: float) -> tuple[float, float]:
        return ((lon - self.lon0) * self.mpd * self.cosl,
                (lat - self.lat0) * self.mpd)

    def err(self, lon: float, lat: float) -> float:
        """|this frame - a true cos(lat) scaling| in metres, east-west."""
        d = (lon - self.lon0) * self.mpd
        return abs(d * self.cosl - d * math.cos(math.radians(lat)))


def _acres(g, pr: "Proj") -> float:
    """Area in acres, measured in the map's own frame. For CHECKING a published
    figure against the geometry that claims it, never for replacing one."""
    from shapely.ops import transform
    return transform(lambda x, y: pr.xy(x, y), g).area / AC


def load(name: str) -> dict:
    p = CACHE / f"{name}.json"
    if not p.exists():
        raise SystemExit(f"missing {p} — run fetch_reach_geom.py {name}")
    return json.loads(p.read_text())


def geom_of(row: dict):
    for v in row.values():
        if isinstance(v, dict) and v.get("type") in (
                "Polygon", "MultiPolygon", "LineString", "MultiLineString"):
            return v
    return None


def rings_of(g) -> list[tuple[list, bool]]:
    """A shapely geometry -> [(coords, is_hole)]. Lines are never holes."""
    out = []
    gt = g.geom_type
    if gt == "Polygon":
        out.append((list(g.exterior.coords), False))
        out += [(list(r.coords), True) for r in g.interiors]
    elif gt in ("MultiPolygon", "GeometryCollection"):
        for p in g.geoms:
            out += rings_of(p)
    elif gt == "LineString":
        out.append((list(g.coords), False))
    elif gt == "MultiLineString":
        for p in g.geoms:
            out.append((list(p.coords), False))
    elif gt == "Point":
        out.append(([(g.x, g.y)], False))
    else:
        raise ValueError(f"unhandled geometry {gt}")
    return out


class Feat:
    def __init__(self, fid, name, cls, src, kind, geom_ll, county=None,
                 metric=None, caveats=None, note=None, derived=None):
        self.id, self.name, self.cls, self.src = fid, name, cls, src
        self.kind, self.county = kind, county
        self.geom_ll = geom_ll
        self.metric = metric or {}
        self.caveats = caveats or []
        self.note = note
        self.derived = derived


def collect(pr: Proj) -> list[Feat]:
    feats: list[Feat] = []

    # ── the city itself, so the locator can show it at reach scale ────────
    cty = load("county")["rows"][0]
    cg = shape(geom_of(cty))
    polys = list(cg.geoms) if cg.geom_type == "MultiPolygon" else [cg]
    main = max(polys, key=lambda p: p.area)
    # The Farallones are 50 km out and are legally the same county. Splitting
    # them out is not an edit of the boundary: it is the same polygon's own
    # parts, grouped so each can carry its own label and its own citation.
    far = [p for p in polys if p.bounds[0] < -122.9]
    rest = [p for p in polys if p is not main and p not in far]
    feats.append(Feat("sf-county", "City and County of San Francisco", "county",
                      "txuc-3kzm", "area", unary_union([main] + rest),
                      county="San Francisco",
                      note="the legal boundary, not the shoreline"))
    if far:
        feats.append(Feat(
            "farallon-islands", "Farallon Islands", "county", "txuc-3kzm",
            "area", unary_union(far), county="San Francisco",
            note="California Government Code 23138: \"The islands known as the "
                 "Farralones (Farallons) are a part of said city and county.\" "
                 "They are 50 km offshore and inside the same published "
                 "boundary the map's own coastline is cut from."))

    # ── City Lands, classified against that same boundary ────────────────
    inside = unary_union(polys)
    outside, near = [], []
    for r in load("citylands")["rows"]:
        g = geom_of(r)
        if not g:
            continue
        s = shape(g)
        if s.is_empty:
            continue
        rep = s.representative_point()
        if inside.contains(rep):
            continue
        d = inside.distance(rep) * 111320.0          # degrees -> metres, N-S
        (outside if d >= MIN_OUT_M else near).append((r, s, d))
    BAND["inside_max_m"] = round(max((d for _, _, d in near), default=0.0), 1)
    BAND["outside_min_m"] = round(min((d for _, _, d in outside), default=0.0), 1)
    BAND["kept"] = len(outside)
    BAND["dropped_border_artefact"] = len(near)
    BAND["dropped_names"] = sorted({(r.get("land_name") or "").strip()
                                    for r, _, _ in near})
    # group the Furman Bequest's seven parcels: one bequest, one row
    groups: dict[str, list] = collections.defaultdict(list)
    for r, s, _ in outside:
        groups[(r.get("land_name") or "").strip()].append((r, s))
    for nm, items in sorted(groups.items()):
        rs = [r for r, _ in items]
        gs = [s for _, s in items]
        cities = sorted({(r.get("city") or "").strip() for r in rs})
        feats.append(Feat(
            f"cityland-{min(int(r['land_id']) for r in rs)}",
            nm.title() if nm.isupper() else nm, "cityland", "gtnh-hgvs", "area",
            unary_union(gs) if len(gs) > 1 else gs[0],
            county=None,
            metric={"parcels": len(gs),
                    "department": rs[0].get("department_name"),
                    "city": " · ".join(cities),
                    "land_id": sorted(r["land_id"] for r in rs)},
            note=(f"{len(gs)} parcels of one bequest, in "
                  f"{len(cities)} Kern and Fresno county oil towns"
                  if len(gs) > 4 else None)))

    # ── the watersheds: CPAD holdings, unioned per unit ──────────────────
    cp = load("cpad")["features"]
    units: dict[str, list] = collections.defaultdict(list)
    for f in cp:
        units[f["properties"]["UNIT_NAME"]].append(f)
    unit_ids = {
        "SFPUC Peninsula Watershed": ("sfpuc-peninsula-watershed",
                                      "SFPUC Peninsula Watershed", None),
        "San Francisco Watershed Lands": (
            "sfpuc-alameda-watershed", "SFPUC Alameda Watershed",
            "CPAD files the Alameda watershed under UNIT_NAME 'San Francisco "
            "Watershed Lands'. The name on this row is the one the SFPUC uses; "
            "the source's own string is carried in `unit_name`."),
        "Sunol Regional Wilderness": ("sunol-regional-wilderness",
                                      "Sunol Regional Wilderness", None),
        "Hetch Hetchy Water and Power": ("hetch-hetchy-water-and-power",
                                         "Hetch Hetchy Water and Power", None),
    }
    for unit, (fid, label, trap) in unit_ids.items():
        rows = units.get(unit, [])
        if not rows:
            raise SystemExit(f"CPAD: no holdings under {unit!r}")
        gs = [shape(f["geometry"]) for f in rows if f.get("geometry")]
        acres = sum(f["properties"]["ACRES"] or 0 for f in rows)
        counties = sorted({f["properties"]["COUNTY"] for f in rows})
        feats.append(Feat(
            fid, label, "watershed", "cpad-2026a", "area",
            unary_union(gs).buffer(0), county=" · ".join(counties),
            metric={"acres_published": round(acres, 1), "holdings": len(rows),
                    "unit_name": unit},
            caveats=[c for c in [trap] if c],
            derived=f"the union of {len(rows)} published CPAD holdings. The "
                    f"parcels are CPAD's; the union is ours, and the acreage "
                    f"quoted is the sum of the holdings' own ACRES field, not "
                    f"a measurement of the unioned shape."))

    # ── the reservoirs ───────────────────────────────────────────────────
    wb: dict[str, list] = collections.defaultdict(list)
    for f in load("waterbody")["features"]:
        wb[f["properties"]["GNIS_NAME"]].append(f)
    for nm in sorted(wb):
        rows = wb[nm]
        gs = [shape(f["geometry"]) for f in rows if f.get("geometry")]
        area = sum(f["properties"].get("AREASQKM") or 0 for f in rows)
        feats.append(Feat(
            "wb-" + nm.lower().replace(" ", "-"), nm, "reservoir",
            "nhd-waterbody", "area", unary_union(gs).buffer(0),
            metric={"km2_published": round(area, 3), "parts": len(rows),
                    "gnis_id": rows[0]["properties"].get("GNIS_ID")}))

    # ── the aqueduct ─────────────────────────────────────────────────────
    aq = load("aqueduct")["features"]
    lines = [shape(f["geometry"]) for f in aq]
    km = sum(f["properties"]["lengthkm"] for f in aq)
    lons = [c[0] for g in lines for c in
            (g.coords if g.geom_type == "LineString"
             else [p for q in g.geoms for p in q.coords])]
    feats.append(Feat(
        "hetch-hetchy-aqueduct", "Hetch Hetchy Aqueduct", "aqueduct",
        "nhd-flowline", "line", unary_union(lines),
        metric={"km_published": round(km, 2), "features": len(aq),
                "gnis_id": aq[0]["properties"]["gnis_id"],
                "east_end_lon": round(max(lons), 4)},
        caveats=[
            "This named feature ENDS AT MOCCASIN (longitude "
            f"{max(lons):.4f}), not at Hetch Hetchy Reservoir "
            "(-119.789). It is 190.00 km — about 118 miles — of the system "
            "the city calls its 150-mile aqueduct. The upper Mountain Tunnel "
            "reach is not part of the named feature, so a label reading '150 "
            "miles' beside this line would be describing a different object.",
        ]))

    # ── SFO ──────────────────────────────────────────────────────────────
    sfo = [f for f in load("sfo")["features"]
           if f["properties"]["OBJECTID"] == 218]
    if len(sfo) != 1:
        raise SystemExit("Caltrans: OBJECTID 218 not found exactly once")
    sfo_g = shape(sfo[0]["geometry"])
    other = [f for f in load("sfo")["features"]
             if f["properties"]["OBJECTID"] == 208]
    # The two registers, measured against each other on this run rather than
    # quoted from a note. `city_reg` is City Lands land_id 635 — the CITY's own
    # statement of what it owns down there — and it is twice the aviation
    # footprint and much nearer the ~5,207 acres the Airport itself cites.
    city_reg = next((s for r, s, _ in outside if r["land_id"] == "635"), None)
    ac_calt = _acres(sfo_g, pr)
    ac_city = _acres(city_reg, pr) if city_reg is not None else None
    ac_208 = _acres(shape(other[0]["geometry"]), pr) if other else None
    inside_pct = (100.0 * _acres(sfo_g.intersection(city_reg), pr) / ac_calt
                  if city_reg is not None and ac_calt else None)
    feats.append(Feat(
        "sfo", "San Francisco International Airport", "airport",
        "caltrans-airports", "area", sfo_g,
        county="San Mateo",
        metric={"objectid": 218, "faa_site": sfo[0]["properties"].get("FAASITENO"),
                "acres_measured": round(ac_calt)},
        caveats=[
            "No legal or cadastral boundary for SFO is published anywhere, by "
            "anyone. The FAA's aviation services carry runways and aprons and "
            "never property. This polygon is an aviation FACILITY FOOTPRINT and "
            "is labelled as one.",
            f"Measured on this run, in the map's own frame: Caltrans 218 is "
            f"{ac_calt:,.0f} acres. The city's OWN register of the land it owns "
            f"there — City Lands land_id 635, also in this file — is "
            f"{ac_city:,.0f} acres, {ac_city / ac_calt:.1f} times as large, and "
            f"{inside_pct:.0f} % of the Caltrans footprint falls inside it. The "
            f"Airport cites about 5,207 acres including submerged Bay land. So "
            f"the two shapes do not disagree about the airport; they are "
            f"answering two different questions, and the file ships both.",
            f"Caltrans ships a second SFO polygon, OBJECTID 208, "
            f"{ac_208:,.0f} acres, which runs far east into the Bay. It is not "
            f"the airport and it is not in this file.",
        ]))

    # ── Colma ────────────────────────────────────────────────────────────
    z = zipfile.ZipFile(CACHE / "tl_2024_06_arealm.zip")
    recs = read_dbf(z.read("tl_2024_06_arealm.dbf"))
    shp = read_shp_polygons(z.read("tl_2024_06_arealm.shp"))
    cem = []
    for r, rings in zip(recs, shp):
        if r["MTFCC"] != "K2582" or not rings:
            continue
        xs = [p[0] for p in rings[0]]
        ys = [p[1] for p in rings[0]]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        if not (COLMA_BOX[0] <= cx <= COLMA_BOX[2]
                and COLMA_BOX[1] <= cy <= COLMA_BOX[3]):
            continue
        poly = unary_union([Polygon(g) for g in rings if len(g) >= 4]).buffer(0)
        cem.append((r, poly))
    if not cem:
        raise SystemExit("TIGER: no cemeteries in the Colma box")
    for r, poly in cem:
        feats.append(Feat(
            "cem-" + r["AREAID"], (r["FULLNAME"] or "Cemetery"), "cemetery",
            "tiger-arealm", "area", poly, county="San Mateo",
            metric={"acres_published": round((r["ALAND"] or 0) / AC, 1),
                    "areaid": r["AREAID"]}))

    # ── O'Shaughnessy Dam ────────────────────────────────────────────────
    d = load("dam")["rows"][0]
    feats.append(Feat(
        "oshaughnessy-dam", "O'Shaughnessy Dam", "dam", "nid", "point",
        Point(d["longitude"], d["latitude"]), county="Tuolumne",
        metric={"nid_id": d["federalId"], "height_ft": d["damHeight"],
                "length_ft": d["damLength"], "completed": d["yearCompleted"],
                "owner": d["ownerNames"], "river": d.get("riverName")}))
    return feats


def simplify_project(f: Feat, pr: Proj):
    """-> (rings as int arrays, worst simplification error m, worst proj err m)."""
    rings_ll = rings_of(f.geom_ll)
    out, worst_s = [], 0.0
    for coords, hole in rings_ll:
        if len(coords) == 1:
            x, y = pr.xy(*coords[0])
            out.append((np.array([round(x)], np.int64),
                        np.array([round(y)], np.int64), hole))
            continue
        pts = [pr.xy(lon, lat) for lon, lat in coords]
        closed = f.kind == "area"
        g = Polygon(pts) if closed and len(pts) >= 4 else LineString(pts)
        s = g.simplify(TOL_M, preserve_topology=True)
        sc = (list(s.exterior.coords) if s.geom_type == "Polygon"
              else list(s.coords) if s.geom_type == "LineString"
              else pts)
        ref = LineString(sc) if len(sc) >= 2 else None
        if ref is not None:
            worst_s = max(worst_s, max(ref.distance(Point(p)) for p in pts))
        out.append((np.array([round(p[0]) for p in sc], np.int64),
                    np.array([round(p[1]) for p in sc], np.int64), hole))
    for coords, _ in rings_ll:
        for lon, lat in coords:
            if not (SANITY_LL[0] <= lon <= SANITY_LL[2]
                    and SANITY_LL[1] <= lat <= SANITY_LL[3]):
                raise SystemExit(
                    f"{f.id}: vertex ({lon}, {lat}) is outside California. A "
                    f"name query hit a homonym in another state — bound the "
                    f"query, do not filter the result.")
    worst_p = max(pr.err(lon, lat) for coords, _ in rings_ll for lon, lat in coords)
    return out, worst_s, worst_p


def build(check: bool) -> int:
    man = json.loads(MANIFEST.read_text())
    pr = Proj(man["proj"])
    feats = collect(pr)

    xs: list[int] = []
    ys: list[int] = []
    rv0: list[int] = []
    rvn: list[int] = []
    rhole: list[int] = []
    fr0: list[int] = []
    frn: list[int] = []
    fcls: list[int] = []
    fsrc: list[int] = []
    fkind: list[int] = []
    bb: list[list[int]] = []
    index = []
    src_keys = sorted(SOURCES)
    worst_simp = 0.0

    for f in feats:
        rings, ws, wp = simplify_project(f, pr)
        worst_simp = max(worst_simp, ws)
        fr0.append(len(rv0))
        frn.append(len(rings))
        fcls.append(CLASSES.index(f.cls))
        fsrc.append(src_keys.index(f.src))
        fkind.append(KINDS.index(f.kind))
        x0 = y0 = 10**9
        x1 = y1 = -10**9
        nv = 0
        for rx, ry, hole in rings:
            rv0.append(len(xs))
            rvn.append(len(rx))
            rhole.append(1 if hole else 0)
            xs.extend(int(v) for v in rx)
            ys.extend(int(v) for v in ry)
            x0, x1 = min(x0, int(rx.min())), max(x1, int(rx.max()))
            y0, y1 = min(y0, int(ry.min())), max(y1, int(ry.max()))
            nv += len(rx)
        bb.append([x0, y0, x1, y1])
        lo = f.geom_ll.bounds
        index.append({
            "id": f.id, "name": f.name, "class": f.cls, "kind": f.kind,
            "source": f.src, "county": f.county,
            "metric": f.metric or None,
            "rings": len(rings), "vertices": nv,
            "bbox_world_m": [x0, y0, x1, y1],
            "bbox_lonlat": [round(v, 6) for v in lo],
            "simplify_worst_m": round(ws, 2),
            "proj_worst_m": round(wp, 1),
            "derived": f.derived,
            # A feature the LOCATOR must leave out of its frame: at this
            # distance the map's frozen-cosl east-west scale is kilometres
            # wrong, and a frame that contains it is 60 % empty desert. It
            # still ships, with its true lon/lat box, because it is the city's
            # land and dropping it would be an edit.
            "outside_locator": wp > 2000.0,
            "note": f.note,
            "caveats": f.caveats or None,
        })

    w = QCWriter("reach/geom", "reach", meta={
        "n": len(feats), "rings": len(rv0), "vertices": len(xs),
        "q": "integer world metres, manifest.proj",
        "classes": CLASSES, "kinds": KINDS, "sources": src_keys,
    })
    w.add("fcls", "u8", fcls).add("fkind", "u8", fkind).add("fsrc", "u8", fsrc)
    w.add("fr0", "u16", fr0).add("frn", "u16", frn)
    w.add("fbb", "i32", [v for b in bb for v in b])
    w.add("rv0", "u32", rv0).add("rvn", "u32", rvn).add("rhole", "u8", rhole)
    w.add("x", "i32", xs).add("y", "i32", ys)
    blob = w.serialise()

    # ── THE ROUND TRIP, ELEMENT FOR ELEMENT ──────────────────────────────
    head, got = read_qc(blob)
    src = {"fcls": fcls, "fkind": fkind, "fsrc": fsrc, "fr0": fr0, "frn": frn,
           "fbb": [v for b in bb for v in b], "rv0": rv0, "rvn": rvn,
           "rhole": rhole, "x": xs, "y": ys}
    for k, want in src.items():
        a = np.asarray(want, dtype=np.int64)
        b = np.asarray(got[k], dtype=np.int64)
        if a.shape != b.shape or not np.array_equal(a, b):
            raise SystemExit(f"ROUND TRIP FAILED on {k}")
    if head["meta"]["vertices"] != len(xs):
        raise SystemExit("ROUND TRIP FAILED on the header")
    # and the SHIPPED decoder, not only ours
    sys.path.insert(0, str(ROOT / "pipeline/scripts/us_sf_city"))
    import _chunk                                        # noqa: PLC0415
    h2, pay = _chunk.read_chunk(blob)
    if h2["k"] != "reach/geom":
        raise SystemExit("the shipped decoder read a different key")
    for name in src:
        a = np.asarray(src[name], dtype=np.int64)
        b = np.asarray(_chunk.field_array(h2, pay, name), dtype=np.int64)
        if not np.array_equal(a, b):
            raise SystemExit(f"SHIPPED DECODER disagrees on {name}")

    by_cls = collections.Counter(f.cls for f in feats)
    doc = {
        "_": "Published geometry for what San Francisco decided outside its own "
             "boundary. Emitted by pipeline/scripts/us_sf_reach/"
             "build_reach_geom.py. Coordinates live in reach/geom.qc; this file "
             "is the index and the provenance.",
        "chunk": {
            "file": "us/sf/reach/geom.qc", "key": "reach/geom", "kind": "reach",
            "bytes": len(blob),
            "features": len(feats), "rings": len(rv0), "vertices": len(xs),
            "classes": CLASSES, "kinds": KINDS, "sources": src_keys,
            "fields": w.fields(),
        },
        "projection": {
            "from": "manifest.proj",
            "x": "(lon - lon0) * mpd * cosl", "y": "(lat - lat0) * mpd",
            "lon0": pr.lon0, "lat0": pr.lat0, "mpd": pr.mpd, "cosl": pr.cosl,
            "quantum_m": 1.0,
            "note": "cosl is frozen at San Francisco's latitude, so east-west "
                    "scale drifts with distance from 37.76. The drift is "
                    "measured per feature into proj_worst_m and each feature "
                    "also carries its true lon/lat bounding box.",
        },
        "simplify": {
            "method": "Douglas-Peucker, topology preserving, in world metres",
            "tol_m": TOL_M,
            "worst_deviation_m": round(worst_simp, 2),
            "note": "measured as the largest distance from any ORIGINAL vertex "
                    "to the simplified ring. Nothing is dropped for being "
                    "small; a shape ships whole or not at all.",
        },
        "counts": dict(sorted(by_cls.items())),
        "outside_test": {
            "against": "txuc-3kzm, the published county boundary",
            "test": "the polygon's representative point is outside the ring, "
                    "and further out than min_m",
            "min_m": MIN_OUT_M,
            "nearest_kept_m": BAND.get("outside_min_m"),
            "furthest_dropped_m": BAND.get("inside_max_m"),
            "kept": BAND.get("kept"),
            "dropped_border_artefact": BAND.get("dropped_border_artefact"),
            "dropped_names": BAND.get("dropped_names"),
            "note": "the dropped rows are all waterfront: two DataSF registers "
                    "disagreeing about where the shoreline is by tens of "
                    "metres. The band between the furthest dropped and the "
                    "nearest kept is empty, which is why the cut can be stated "
                    "rather than argued.",
        },
        "not_drawn": NOT_DRAWN,
        "sources": {k: SOURCES[k] for k in src_keys},
        "features": index,
    }

    doc["corpus_check"] = corpus_check()
    badge = film_badge(index, doc)

    if check:
        print(f"OK — {len(feats)} features, {len(rv0)} rings, {len(xs):,} "
              f"vertices, {len(blob):,} chunk bytes")
        print(f"   by class: {dict(sorted(by_cls.items()))}")
        print(f"   worst simplification {worst_simp:.2f} m at tol {TOL_M} m")
        return 0

    OUTDIR.mkdir(parents=True, exist_ok=True)
    (OUTDIR / "geom.qc").write_bytes(blob)
    (OUTDIR / "geom.json").write_text(
        json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    (OUTDIR / "film-badge.json").write_text(
        json.dumps(badge, indent=1, ensure_ascii=False) + "\n")
    import gzip
    gz = len(gzip.compress(blob, 9))
    print(f"wrote {(OUTDIR / 'geom.qc').relative_to(ROOT)}  "
          f"{len(blob):,} bytes ({gz:,} gz)")
    print(f"wrote {(OUTDIR / 'geom.json').relative_to(ROOT)}  "
          f"{(OUTDIR / 'geom.json').stat().st_size:,} bytes")
    print(f"   {len(feats)} features, {len(rv0)} rings, {len(xs):,} vertices")
    print(f"   by class: {dict(sorted(by_cls.items()))}")
    print(f"   round trip: OK on 11 fields, both this reader and "
          f"us_sf_city/_chunk.read_chunk")
    print(f"   worst simplification {worst_simp:.2f} m at tol {TOL_M} m")
    print(f"wrote {(OUTDIR / 'film-badge.json').relative_to(ROOT)}  "
          f"{(OUTDIR / 'film-badge.json').stat().st_size:,} bytes")
    for k, v in badge["byEntity"].items():
        print(f"   {k}: {v['line']}")
    return 0


# Which of these published shapes the CITY'S OWN RECORD actually names. A shape
# with no citation behind it is still true and still publishable — it is the
# city's land — but it is a different kind of object from Hetch Hetchy, and a
# component that treats them alike would be claiming a provenance it does not
# have. Word-boundary patterns, with the two homonym traps that have already
# bitten written into the table: 'Colman' is a supervisor and not Colma, and
# 'O'Shaughnessy' is the City Engineer far more often than it is the dam.
CORPUS_TERMS = {
    "hetch-hetchy-aqueduct": [r"Hetch[- ]?Hetchy"],
    "oshaughnessy-dam": [r"O'Shaughnessy Dam"],
    "sfo": [r"Mills Field", r"San Francisco Airport", r"San Mateo County"],
    "cityland-635": [r"Mills Field", r"San Francisco Airport"],
    "sfpuc-peninsula-watershed": [r"Crystal Springs", r"Pulgas"],
    "sfpuc-alameda-watershed": [r"Alameda Creek", r"Calaveras", r"Irvington"],
    "cityland-25": [r"Sharp Park"],
    "cityland-1199": [r"Camp Mather"],
    "cityland-1200": [r"Moccasin"],
    "cityland-1205": [r"Tesla"],
    "cityland-1209": [r"Sunol"],
    "farallon-islands": [r"Farallon\w*", r"Farralon\w*"],
    "COLMA": [r"Colma\b"],
}


def corpus_check() -> dict:
    """Count, in the 41 archival entries, how many beats name each thing."""
    import re                                              # noqa: PLC0415
    ent = ROOT / "scratchpad/sf-city-anim/entries"
    beats, notes = [], []
    for f in sorted(ent.glob("*.json")):
        d = json.loads(f.read_text())
        for b in d.get("beats", []):
            # THE RECORD'S OWN WORDS ONLY. `quote` and `headline` are the
            # Journal; `note` is ours. Counting our own prose as evidence that
            # the record names a place is exactly the mistake this file exists
            # to avoid — and it would change an answer here: the Farallones are
            # named in a note and in no quote anywhere.
            beats.append((d["id"], (b.get("quote") or "") + " "
                          + (b.get("headline") or "")))
            notes.append((d["id"], b.get("note") or ""))
    out = {}
    for key, pats in CORPUS_TERMS.items():
        rx = re.compile("|".join(rf"\b(?:{p})" for p in pats))
        hits = [eid for eid, q in beats if rx.search(q)]
        nh = [eid for eid, q in notes if rx.search(q)]
        out[key] = {"beats": len(hits), "entries": sorted(set(hits)),
                    "in_our_notes_only": sorted(set(nh) - set(hits)) or None}
    return {
        "_": "how many of the corpus's beats name each published shape. A shape "
             "with zero is geometry without a record behind it — still the "
             "city's land, but not the same kind of claim as Hetch Hetchy, and "
             "a component should not present the two alike.",
        "corpus": "scratchpad/sf-city-anim/entries, 41 entries",
        "counted": "beat `quote` and `headline` — the Journal's own words. Our "
                   "`note` text is swept separately and reported as "
                   "in_our_notes_only, never as a hit.",
        "traps": "'Colman' is a Supervisor and is not Colma; 'O'Shaughnessy' is "
                 "the City Engineer far more often than the dam, so that "
                 "pattern requires the word Dam.",
        "terms": {k: v for k, v in CORPUS_TERMS.items()},
        "hits": out,
    }


def film_badge(index: list[dict], doc: dict) -> dict:
    """The one line the film's NOT ON THIS MAP badge earns.

    Every number in the sentence is MEASURED here out of the index that was just
    written, so the badge cannot drift from the geometry behind it and no figure
    is typed into a component. The prose is generated; the figures are published
    and each one names the register it came from. The film's own `copy` and
    `cite` are already English-only verbatim record, and this sits beside them
    on the same plate under the same rule.
    """
    by = {f["id"]: f for f in index}
    dam = by["oshaughnessy-dam"]
    county = by["sf-county"]
    aq = by["hetch-hetchy-aqueduct"]
    east_km = (dam["bbox_world_m"][0] - county["bbox_world_m"][2]) / 1000.0
    ws = [f for f in index if f["class"] == "watershed"]
    acres = sum(f["metric"]["acres_published"] for f in ws)
    res = [f for f in index if f["class"] == "reservoir"]
    counties = len({c for f in ws for c in (f["county"] or "").split(" · ") if c})
    line = (
        f"It starts {east_km:,.0f} km east of the county line, at "
        f"O'Shaughnessy Dam: {aq['metric']['km_published']:,.0f} km of "
        f"aqueduct, {acres:,.0f} acres of watershed across {counties} counties, "
        f"{len(res)} reservoirs. All of it published. None of it in this frame.")
    src = doc["sources"]
    return {
        "_": "One sentence and its sources for the film's NOT ON THIS MAP "
             "badge. Generated by pipeline/scripts/us_sf_reach/"
             "build_reach_geom.py from reach/geom.json, so every figure in it "
             "is measured from the published geometry that ships beside it.",
        "byEntity": {
            "hetch-hetchy": {
                "line": line,
                "measured": {
                    "east_of_county_line_km": round(east_km, 1),
                    "aqueduct_km": aq["metric"]["km_published"],
                    "watershed_acres": round(acres, 1),
                    "reservoirs": len(res),
                    "published_shapes": len(index),
                },
                # SHORT LABELS ON PURPOSE. Measured on the running page at
                # 1440 px: the publishers' full names wrap the source line onto
                # a second row and push the plate into the compass control.
                # The full name and the query are both in reach/geom.json.
                "sources": [
                    {"t": "USACE NID",
                     "u": "https://nid.sec.usace.army.mil/#/dams/system/464310/summary"},
                    {"t": "USGS NHD", "u": src["nhd-flowline"]["url"]},
                    {"t": "CPAD 2026a", "u": src["cpad-2026a"]["url"]},
                ],
                "caveat": aq["caveats"][0] if aq.get("caveats") else None,
            },
        },
    }


# ── WHAT IS STILL NOT DRAWN, AND WHY ──────────────────────────────────────
NOT_DRAWN = [
    {"thing": "the Mountain Tunnel — Hetch Hetchy Reservoir to Moccasin",
     "why": "NHD's named 'Hetch Hetchy Aqueduct' feature stops at Moccasin. "
            "The upper reach is not in it, and nothing here will connect the "
            "reservoir to the line's east end with a segment we drew."},
    {"thing": "the Farallones' own reach beyond the published boundary ring",
     "why": "the islands ship because txuc-3kzm contains them. Nothing else "
            "about them is asserted."},
    {"thing": "a legal boundary for SFO",
     "why": "none is published. The FAA's aviation services carry runways and "
            "aprons and never property; Caltrans, TIGER and OSM all publish a "
            "facility footprint and they disagree by 15 %. The polygon here is "
            "labelled a footprint."},
    {"thing": "the aqueduct's tunnels as separate objects",
     "why": "OpenStreetMap identifies them individually and its members carry "
            "source=NHD, i.e. they were seeded from the same federal line and "
            "hand-refined. Until that hand-refinement is checked, the federal "
            "line is the one that ships."},
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    return build(ap.parse_args().check)


if __name__ == "__main__":
    raise SystemExit(main())
