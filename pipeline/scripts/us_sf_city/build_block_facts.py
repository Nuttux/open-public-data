"""What a block IS now — the modern facts that stand beside the block's record.

The decade rail on `CityBlockPanel` answers *what the city decided here, over
time*. It says nothing about what stands on the ground today. This script emits
the two files that answer that, both keyed on the SAME assessor block id the
map's own `base/blocks-id.json` publishes:

    website/public/data/us/sf/city/blocks/block-facts.json
        one row per assessor block, columnar — parcels on the roll, homes,
        assessed value, the ground's dominant use, and the residents the 2020
        Census counted.

    website/public/data/us/sf/city/blocks/block-money.json
        the blocks a PUBLISHED Qipu place resolves to, and that place's own
        money headline. This is the "how much does Moscone Center take in
        public money" join, and it is THIN — the coverage is measured and
        printed by the build and shipped inside the file.

Two stages, and nothing downstream ever reaches the network:

    python3 pipeline/scripts/us_sf_city/build_block_facts.py --fetch
    python3 pipeline/scripts/us_sf_city/build_block_facts.py --build

Every file lands in `cache_facts/` with a `<name>.meta.json` giving the URL,
the byte count, the row count, the sha256 and the retrieval time, which is the
convention `us_sf_places/fetch_places.py` set.

── THE TWO JOINS, AND WHAT EACH ONE IS ────────────────────────────────────────

1. **The roll → the block is not a join at all.** `wv5m-vpq2` publishes `block`
   as its own column and it is the assessor block. Nothing is inferred: a block
   figure here is the sum over that block's own published parcel rows.

2. **The Census → the block IS a join, and it is stated.** The Census draws its
   own blocks (5,986 in San Francisco against 5,404 assessor blocks) and they
   are not the assessor's. Each census block is attributed to the assessor block
   holding the PLURALITY of the parcel base map's parcels that fall inside the
   census block's own published ring — the same "the ring that contains the
   point" membership rule `manifest.sources.block_paint` already uses. A census
   block is attributed to at most one assessor block, so nothing is counted
   twice, and an assessor block that receives none carries NO population rather
   than a zero.

3. **The place → the block is the APN.** `_facilities.json` carries the City
   Facilities registry's `block_lot` per place, which is `<block><lot>`. The
   block is the leading 4 digits and an optional letter, and it is kept only
   when `base/blocks-id.json` also publishes it.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE / "cache_facts"
REPO = HERE.parent.parent.parent
WEB = REPO / "website" / "public" / "data" / "us" / "sf"
OUT = WEB / "city" / "blocks"
SEED_CSV = (REPO / "pipeline" / "seeds" / "countries" / "us"
            / "seed_us_sf_place_facilities.csv")

ROLL_YEAR = 2025
UA = {"User-Agent": "qipu-sf-city/1.0 (open data pipeline)"}

SOCRATA = "https://data.sfgov.org/resource/{ds}.json?"
TIGER = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
    "tigerWMS_Census2020/MapServer/10/query"
)

SOURCES = {
    "roll": {
        "dataset": "wv5m-vpq2",
        "name": "Assessor Historical Secured Property Tax Rolls",
        "publisher": "City & County of San Francisco (Office of the Assessor-Recorder)",
        "url": "https://data.sfgov.org/d/wv5m-vpq2",
        "licence": "DataSF open data — Open Data Commons PDDL",
        "what": (
            "the closed secured roll. `block` is the assessor block, so a block "
            "figure is the sum over that block's own published parcel rows."
        ),
    },
    "parcels": {
        "dataset": "acdm-wktn",
        "name": "Parcels – Active and Retired",
        "publisher": "City & County of San Francisco (Department of Public Works)",
        "url": "https://data.sfgov.org/d/acdm-wktn",
        "licence": "DataSF open data — Open Data Commons PDDL",
        "what": (
            "the parcel base map. The active parcels are the same file the map's "
            "own block rings were dissolved from (manifest.sources.blocks); their "
            "published centroids are what carries a census block onto an assessor "
            "block here."
        ),
    },
    "census": {
        "dataset": "TIGERweb tigerWMS_Census2020, layer 10 (Census Blocks)",
        "name": "2020 Census Redistricting Data (P.L. 94-171), block level",
        "publisher": "US Census Bureau",
        "url": "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/10",
        "licence": "work of the US government, public domain",
        "what": (
            "POP100 and HU100 — the 2020 Census count — on the Census Bureau's own "
            "block rings. 5,986 rings in San Francisco County summing to 873,965 "
            "residents, which is the published county total."
        ),
    },
    "places": {
        "dataset": "nc68-ngbr via the reviewed place crosswalk",
        "name": "Qipu published SF places",
        "publisher": "this project, over City & County of San Francisco registers",
        "url": "/us/city/sf/places",
        "licence": "DataSF open data — Open Data Commons PDDL",
        "what": (
            "the money already published on a place fiche, carried onto the blocks "
            "that place's own City Facilities APNs name."
        ),
    },
}


# ── fetch ─────────────────────────────────────────────────────────────────────
def _get(url: str, timeout: int = 240) -> bytes:
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
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / name).write_bytes(blob)
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


def _soql(ds: str, params: dict[str, str]) -> str:
    return SOCRATA.format(ds=ds) + urllib.parse.urlencode(
        {("$" + k): v for k, v in params.items()}
    )


def _page(ds: str, params: dict[str, str], page: int = 50000) -> list[dict]:
    rows: list[dict] = []
    while True:
        p = dict(params, limit=str(page), offset=str(len(rows)))
        got = json.loads(_get(_soql(ds, p)))
        rows.extend(got)
        print(f"      … {len(rows):,}")
        if len(got) < page:
            return rows


def fetch(refresh: bool) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)

    def need(n: str) -> bool:
        return refresh or not (CACHE / n).exists()

    # 1. the roll, aggregated by block by the server. One row per block.
    if need("roll_by_block.json"):
        print("  roll, grouped by block")
        sel = (
            "block,"
            "count(1) AS parcels,"
            "sum(number_of_units) AS units,"
            "sum(property_area) AS built_sqft,"
            "sum(lot_area) AS lot_sqft,"
            "sum(assessed_land_value) AS land_usd,"
            "sum(assessed_improvement_value) AS impr_usd,"
            "sum(assessed_fixtures_value) AS fixt_usd"
        )
        url = _soql(
            "wv5m-vpq2",
            {
                "select": sel,
                "where": f"closed_roll_year={ROLL_YEAR}",
                "group": "block",
                "limit": "20000",
            },
        )
        blob = _get(url)
        _write(
            "roll_by_block.json",
            blob,
            url,
            len(json.loads(blob)),
            f"wv5m-vpq2 roll {ROLL_YEAR}, summed by the file's own `block` column",
        )

    # 2. the roll's use column, grouped by (block, use). The dominant use.
    if need("roll_by_block_use.json"):
        print("  roll, grouped by block and use")
        url = _soql(
            "wv5m-vpq2",
            {
                "select": "block,use_definition,count(1) AS parcels,sum(property_area) AS built_sqft",
                "where": f"closed_roll_year={ROLL_YEAR}",
                "group": "block,use_definition",
                "limit": "80000",
            },
        )
        blob = _get(url)
        _write(
            "roll_by_block_use.json",
            blob,
            url,
            len(json.loads(blob)),
            "wv5m-vpq2 use_definition counted per assessor block",
        )

    # 3. the parcel base map's centroids — how a census ring reaches a block.
    if need("parcel_points.json"):
        print("  parcel base map centroids")
        rows = _page(
            "acdm-wktn",
            {
                "select": "block_num,centroid_latitude,centroid_longitude",
                "where": "active=true AND centroid_latitude IS NOT NULL",
                "order": "blklot",
            },
        )
        blob = json.dumps(rows).encode()
        _write(
            "parcel_points.json",
            blob,
            _soql("acdm-wktn", {"select": "block_num,centroid_latitude,centroid_longitude",
                                "where": "active=true AND centroid_latitude IS NOT NULL"}),
            len(rows),
            "acdm-wktn active parcels, published centroid only",
        )

    # 4. the City Facilities register itself — facility_id, its own APN and its
    #    own point. `_facilities.json` is a BigQuery export of the reviewed
    #    crosswalk joined onto exactly these columns, and `--check-seed` needs
    #    them to replay that join from the seed CSV without a dbt run.
    if need("city_facilities.json"):
        print("  City Facilities register")
        rows = _page(
            "nc68-ngbr",
            {
                "select": "facility_id,common_name,address,block_lot,latitude,longitude,gross_sq_ft",
                "order": "facility_id",
            },
        )
        blob = json.dumps(rows).encode()
        _write("city_facilities.json", blob,
               _soql("nc68-ngbr", {"select": "facility_id,block_lot,latitude,longitude"}),
               len(rows), "nc68-ngbr City Facilities, identity + point per facility")

    # 5. DBI demolition permits — what came down, and when.
    #    `permit_type = 6` is DBI's own code for a demolition. ONLY `status =
    #    complete` is read: 619 cancelled, 606 expired, 405 withdrawn and 745
    #    still merely issued are permits to demolish, not demolitions, and a
    #    building whose permit was withdrawn is standing. All 4,511 complete
    #    rows carry a completed_date, so the year is the year it came down and
    #    not the year somebody asked.
    if need("demolitions.json"):
        print("  DBI demolition permits (complete only)")
        rows = _page(
            "i98e-djp9",
            {
                "select": ("permit_number,block,lot,completed_date,"
                           "number_of_existing_stories,existing_use,existing_units"),
                "where": "permit_type='6' AND status='complete'",
                "order": "permit_number",
            },
        )
        blob = json.dumps(rows).encode()
        _write("demolitions.json", blob,
               _soql("i98e-djp9", {"select": "block,lot,completed_date",
                                   "where": "permit_type='6' AND status='complete'"}),
               len(rows),
               "i98e-djp9 permit_type 6, status complete — dated, block-keyed removals")

    # 6. the Census's own block rings, with the count on them.
    if need("census_blocks.json"):
        print("  2020 census blocks (TIGERweb)")
        q = urllib.parse.urlencode(
            {
                "where": "STATE='06' AND COUNTY='075'",
                "outFields": "GEOID,POP100,HU100,INTPTLAT,INTPTLON,AREALAND",
                "returnGeometry": "true",
                "outSR": "4326",
                "f": "geojson",
            }
        )
        url = f"{TIGER}?{q}"
        blob = _get(url)
        gj = json.loads(blob)
        _write(
            "census_blocks.json",
            blob,
            url,
            len(gj.get("features", [])),
            "2020 Census blocks in San Francisco County, POP100 + HU100 + ring",
        )
    print("  cache is in", CACHE)


# ── build ─────────────────────────────────────────────────────────────────────
APN = re.compile(r"^(\d{4}[A-Z]?)(\d{3}[A-Z]?)$")


def _f(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _pt_in_ring(x: float, y: float, ring: list) -> bool:
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y):
            if x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inside = not inside
        j = i
    return inside


def _in_poly(x: float, y: float, geom: dict) -> bool:
    t = geom.get("type")
    polys = [geom["coordinates"]] if t == "Polygon" else geom["coordinates"]
    for poly in polys:
        if not poly:
            continue
        if _pt_in_ring(x, y, poly[0]):
            if not any(_pt_in_ring(x, y, h) for h in poly[1:]):
                return True
    return False


def _bbox(geom: dict):
    xs, ys = [], []
    t = geom.get("type")
    polys = [geom["coordinates"]] if t == "Polygon" else geom["coordinates"]
    for poly in polys:
        for ring in poly:
            for c in ring:
                xs.append(c[0])
                ys.append(c[1])
    return min(xs), min(ys), max(xs), max(ys)


# THE ROLL'S OWN NINE WORDS, VERBATIM.
#
# An earlier cut folded `use_definition` onto the seven classes the map's own
# buildings are coloured by (`manifest.buildings.useNames`). That was a mistake
# twice over: `Government` came out as "hotel / institutional", and
# `Commercial Misc` — 4,992 parcels — came out as "mixed or not stated", so the
# fold destroyed information AND printed a word the publisher never wrote. The
# roll publishes exactly nine values city-wide and every one of them is already
# a sentence a reader can read, so nothing is folded and nothing is renamed.
#
#   155,111  Single Family Residential      4,377  Commercial Retail
#    36,278  Multi-Family Residential       2,372  Industrial
#     5,487  Miscellaneous/Mixed-Use        1,818  Commercial Office
#     4,992  Commercial Misc                  758  Commercial Hotel
#                                             354  Government


def build() -> None:
    ids = json.load(open(WEB / "city" / "base" / "blocks-id.json"))["id"]
    known = set(ids)
    print(f"  {len(ids):,} assessor blocks on the map")

    # ── the roll ──────────────────────────────────────────────────────────
    roll = {r["block"]: r for r in json.load(open(CACHE / "roll_by_block.json"))}
    print(f"  roll {ROLL_YEAR}: {len(roll):,} blocks, "
          f"{len(known & set(roll)):,} of them on the map")

    uses: dict[str, Counter] = defaultdict(Counter)
    vocab: list[str] = []
    vocab_at: dict[str, int] = {}
    for r in json.load(open(CACHE / "roll_by_block_use.json")):
        name = (r.get("use_definition") or "").strip()
        if not name:
            continue
        i = vocab_at.get(name)
        if i is None:
            i = len(vocab)
            vocab_at[name] = i
            vocab.append(name)
        uses[r["block"]][i] += int(_f(r.get("parcels")))

    # ── the census ────────────────────────────────────────────────────────
    parcels = json.load(open(CACHE / "parcel_points.json"))
    cells: dict[tuple[int, int], list] = defaultdict(list)
    G = 0.002  # ~180 m of latitude — a grid so the point-in-ring is not 227k x 5,986
    for p in parcels:
        b = (p.get("block_num") or "").strip()
        if b not in known:
            continue
        try:
            lat = float(p["centroid_latitude"])
            lon = float(p["centroid_longitude"])
        except (TypeError, ValueError, KeyError):
            continue
        cells[(int(lon / G), int(lat / G))].append((lon, lat, b))
    print(f"  parcel base map: {sum(len(v) for v in cells.values()):,} active parcels "
          f"whose block the map also draws")

    cb = json.load(open(CACHE / "census_blocks.json"))["features"]
    pop: Counter = Counter()
    hu: Counter = Counter()
    got_cb: Counter = Counter()
    assigned = 0
    unassigned_pop = 0
    purity: list[float] = []
    for f in cb:
        g = f.get("geometry")
        a = f["properties"]
        if not g:
            continue
        x0, y0, x1, y1 = _bbox(g)
        inside: Counter = Counter()
        for gx in range(int(x0 / G), int(x1 / G) + 1):
            for gy in range(int(y0 / G), int(y1 / G) + 1):
                for (lon, lat, b) in cells.get((gx, gy), ()):
                    if x0 <= lon <= x1 and y0 <= lat <= y1 and _in_poly(lon, lat, g):
                        inside[b] += 1
        n = int(a.get("POP100") or 0)
        h = int(a.get("HU100") or 0)
        if not inside:
            unassigned_pop += n
            continue
        b, k = inside.most_common(1)[0]
        purity.append(k / sum(inside.values()))
        assigned += 1
        got_cb[b] += 1
        pop[b] += n
        hu[b] += h

    tot = sum(int(f["properties"].get("POP100") or 0) for f in cb)
    print(f"  census: {len(cb):,} rings, {assigned:,} of them land on a block "
          f"({100 * assigned / len(cb):.1f}%)")
    print(f"          {tot - unassigned_pop:,} of {tot:,} residents carried "
          f"({100 * (tot - unassigned_pop) / tot:.1f}%); "
          f"{unassigned_pop:,} sit on rings holding no parcel of a drawn block")
    purity.sort()
    if purity:
        pure = sum(1 for p in purity if p >= 0.9)
        print(f"          plurality is >=90% of the ring's parcels on "
              f"{pure:,} of {len(purity):,} rings ({100 * pure / len(purity):.1f}%), "
              f"median {purity[len(purity) // 2]:.3f}")
    print(f"          {len(pop):,} of {len(ids):,} blocks receive a count "
          f"({100 * len(pop) / len(ids):.1f}%)")

    # ── what came down ────────────────────────────────────────────────────
    # The building layer is SURVIVORSHIP ONLY — `build_bldg.py` says so in its
    # own docstring: every footprint in ynuv-fyni is a building standing today,
    # in every year the map draws. This is the one published file that puts a
    # dated, located removal back, and DATA-TRUTH.md §4 measured its limits
    # before a line of this was written:
    #
    #   1906        36 CITY buildings from the fire schedule. Not private stock.
    #   1907-1979   NOTHING per building. The Board's Journal names the
    #               Redevelopment Agency 227 times in 1960-75 and enumerates an
    #               individual demolition 49 times: it approved the clearance
    #               without recording what came down. Western Addition A-1 and
    #               A-2 and Yerba Buena would need SFRA's own project records,
    #               which are not on DataSF and not in this corpus.
    #   1980-2026   this file.
    #
    # So a block with nothing here is a block THE RECORD DOES NOT REACH, not a
    # block where nothing came down, and the panel has to say the 1980 floor on
    # its face. The Western Addition is the case that makes it non-negotiable:
    # it was cleared before this series begins, and a silent zero there would be
    # the most misleading sentence on the site.
    dem_rows = json.load(open(CACHE / "demolitions.json"))
    dem_year: dict[str, list[int]] = defaultdict(list)
    dem_units: Counter = Counter()
    dem_off = 0
    for r in dem_rows:
        b = (r.get("block") or "").strip()
        if b not in known:
            dem_off += 1
            continue
        cd = r.get("completed_date") or ""
        if len(cd) < 4 or not cd[:4].isdigit():
            continue
        dem_year[b].append(int(cd[:4]))
        try:
            dem_units[b] += int(_f(r.get("existing_units")))
        except (TypeError, ValueError):
            pass
    dem_from = min((min(v) for v in dem_year.values()), default=1980)
    dem_to = max((max(v) for v in dem_year.values()), default=1980)
    dem_decs = list(range((dem_from // 10) * 10, (dem_to // 10) * 10 + 10, 10))
    dem: dict[str, list[int]] = {}
    for b, years in sorted(dem_year.items()):
        per_dec = [0] * len(dem_decs)
        for y in years:
            per_dec[dem_decs.index((y // 10) * 10)] += 1
        dem[b] = per_dec + [dem_units[b], min(years), max(years)]
    print(f"  demolitions: {len(dem_rows):,} completed permits, "
          f"{len(dem_rows) - dem_off:,} on a drawn block, {dem_off} not")
    print(f"               {len(dem):,} of {len(ids):,} blocks carry one "
          f"({100 * len(dem) / len(ids):.1f}%), {dem_from}-{dem_to}, "
          f"{sum(dem_units.values()):,} dwelling units in them")

    # ── emit block-facts.json ─────────────────────────────────────────────
    b_out, np_, u_, v_, ar_, us_, pop_, hu_ = [], [], [], [], [], [], [], []
    for bid in ids:
        r = roll.get(bid)
        has_pop = bid in pop
        if r is None and not has_pop:
            continue
        b_out.append(bid)
        np_.append(int(_f(r.get("parcels"))) if r else 0)
        u_.append(int(_f(r.get("units"))) if r else 0)
        val = (_f(r.get("land_usd")) + _f(r.get("impr_usd")) + _f(r.get("fixt_usd"))) if r else 0.0
        v_.append(round(val / 1000))              # thousands of USD
        ar_.append(round(_f(r.get("built_sqft")) / 100) if r else 0)  # hundreds of sq ft
        c = uses.get(bid)
        us_.append(c.most_common(1)[0][0] if c else -1)
        pop_.append(pop[bid] if has_pop else -1)
        hu_.append(hu[bid] if has_pop else -1)

    facts = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "generated_by": "pipeline/scripts/us_sf_city/build_block_facts.py",
        "roll_year": ROLL_YEAR,
        "census_year": 2020,
        "units": {
            "np": "parcels on the closed roll",
            "u": (
                "number_of_units summed over the block's parcel rows. NOT A "
                "COUNT OF HOMES and not shown as one: the roll reads 0 on every "
                "CONDOMINIUM parcel, because there the parcel IS the home — "
                "155,111 Single Family Residential rows carry 121,707 units "
                "between them city-wide, and block 0311 reads 11 against the "
                "Census's 76. Carried as evidence, and the panel reads `hu`."
            ),
            "v": "assessed value, THOUSANDS of USD — land + improvements + fixtures",
            "ar": "built floor area, HUNDREDS of square feet",
            "us": (
                "index into useNames — the roll's OWN use_definition, verbatim, "
                "for the use the most parcels here are on; -1 where the roll "
                "gives this block no parcel"
            ),
            "pop": "2020 Census residents; -1 where no census ring resolved here",
            "hu": (
                "2020 Census housing units (HU100), the count the panel shows as "
                "homes; -1 where no census ring resolved here. 406,628 city-wide, "
                "which is the published county total."
            ),
        },
        "useNames": vocab,
        "coverage": {
            "blocks_total": len(ids),
            "blocks_on_the_roll": len(b_out),
            "blocks_with_population": len(pop),
            # 480 blocks read $0. The roll simply carries no value on ground the
            # city, the state and the federal government own — City Hall's own
            # parcel 0787001 is `assessed_land_value: 0.0` with no exemption
            # code — and without the count beside it a "$0" reads as a hole in
            # the data rather than as what the roll says.
            "blocks_with_no_assessed_value": sum(1 for x in v_ if x == 0),
            "census_rings": len(cb),
            "census_rings_placed": assigned,
            "residents_carried": tot - unassigned_pop,
            "residents_counted": tot,
            "plurality_ge_90pct": (
                round(100 * sum(1 for p in purity if p >= 0.9) / len(purity), 1)
                if purity else None
            ),
        },
        "demolition": {
            "dataset": "i98e-djp9",
            "name": "Building Permits (DBI), permit_type 6 — demolitions",
            "publisher": "City & County of San Francisco (Department of Building Inspection)",
            "url": "https://data.sfgov.org/d/i98e-djp9",
            "licence": "DataSF open data — Open Data Commons PDDL",
            "counted": (
                "status = complete ONLY, and dated on completed_date. 4,511 of "
                "the 7,310 demolition permits are complete and all 4,511 carry "
                "that date. The 619 cancelled, 606 expired, 405 withdrawn and "
                "745 merely issued are permits to demolish and not demolitions: "
                "a building whose permit was withdrawn is standing."
            ),
            # MEASURED, because "since 1980" and "since 1983" are different
            # claims and the panel must make the one that is true. DBI's
            # electronic permit file effectively opens in 1980 — exactly ONE of
            # the 7,310 demolition permits was filed before 1980-01-01 — but the
            # earliest COMPLETED demolition in it is 1983-03-02, filed 1982-08-03.
            # The panel dates on completion, so its rail opens on the 1980s;
            # `from_decade` is what it prints and `from_year` is what it holds.
            "from_decade": (dem_from // 10) * 10,
            "from_year": dem_from,
            "series_note": (
                "DBI's demolition permit file opens in 1980: 1 of the 7,310 "
                "permits was filed before 1980-01-01. The earliest COMPLETED "
                "demolition is 1983-03-02 (filed 1982-08-03), so a rail dated on "
                "completion opens on the 1980s and holds nothing in 1980-82."
            ),
            "to_year": dem_to,
            "decades": dem_decs,
            "blocks_with_any": len(dem),
            "units_demolished": sum(dem_units.values()),
            "row": "one per decade in `decades`, then dwelling units, first year, last year",
            "THE_RECORD_STARTS_IN_1980": (
                "A block absent from `dem` is a block THIS RECORD DOES NOT "
                "REACH, not a block where nothing came down, and anything "
                "reading this file must say so. DATA-TRUTH.md §4: the 1906 "
                "schedule covers 36 CITY buildings and no private stock, and "
                "1907-1979 is unrecoverable per building — the Board's Journal "
                "names the Redevelopment Agency 227 times in 1960-75 and "
                "enumerates an individual demolition 49 times. The Western "
                "Addition was cleared before this series begins."
            ),
        },
        "sources": {k: SOURCES[k] for k in ("roll", "parcels", "census")},
        "not_measured": (
            "The assessed value is what the closed roll carries, which is "
            "Proposition 13 base year value and not a market price; a parcel that "
            "has not changed hands since 1978 is on the roll at its 1978 value plus "
            "the allowed annual increase. The census count is the 2020 count on the "
            "Census Bureau's own block, carried onto the assessor block holding most "
            "of that ring's parcels — it is not a count of this block."
        ),
        "b": b_out, "np": np_, "u": u_, "v": v_, "ar": ar_, "us": us_,
        "pop": pop_, "hu": hu_,
        "dem": dem,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / "block-facts.json"
    p.write_text(json.dumps(facts, separators=(",", ":")))
    print(f"  wrote {p.relative_to(REPO)}  {p.stat().st_size:,} bytes  "
          f"{len(b_out):,} blocks")

    # ── emit block-money.json ─────────────────────────────────────────────
    # Two guards, both measured, both printed. See the module docstring.
    #
    # R1 A BUCKET IS NOT A BLOCK. `9900` is the Port's single APN for its whole
    #    waterfront — Pier 45, Pier 70 and the Southeast plant all carry
    #    `9900070` — and its parcels spread 6.5 km. `VACST` and `PARK` are the
    #    assessor's words for vacated street and park and carry no roll row at
    #    all. A reader cannot point at any of them. MEASURED spread, widest
    #    first: 9900 6562 m, VACST 4209 m, PARK 3852 m, then 6900 at 1781 m and
    #    1939 (Golden Gate Park) at 1357 m and 1313 (Lincoln Park) at 1134 m,
    #    which ARE one piece of ground and are kept. The cut is taken in the
    #    2.1 km gap between the third and the fourth.
    # R2 ONE PLACE, ONE GROUND. The crosswalk gives `moscone-center` four
    #    facilities on block 0469 — the Moscone RECREATION Center in the Marina,
    #    3.4 km from the convention centre and a separate published place of its
    #    own. A place is where its published floor area is: the block carrying
    #    the most of it, and every block within REACH_M of that one.
    # R3 THE APN MUST AGREE WITH THE POINT. `1263011` is a real parcel at 510
    #    Frederick Street and it is Kezar Stadium's; the City Facilities
    #    register also hangs GOLDEN GATE PARK (3,809 m away), the Japanese Tea
    #    Garden (1,414 m) and the Conservatory of Flowers (866 m) on it. It is
    #    the register's nominal APN for the whole park, exactly as `9900070` is
    #    for the whole Port. Nothing about the number says so, so the place's
    #    OWN published point has to corroborate it: it must lie within POINT_M
    #    of a published parcel of the block its APN names.
    #    MEASURED over the 76 block x place rows, sorted: … 204, 215, 220, 221,
    #    365, 379, 408, 421, 434 | 710, 814, 866, 1111, 1414, 3809, 8576. The
    #    cut is taken in the 276 m gap. It costs seven true rows their block
    #    line — de Young sits on block 1700, which is ONE 96-acre parcel whose
    #    centroid is 1.1 km from the museum — and that is the trade taken on
    #    purpose: a place that loses its block line costs a reader a link, and
    #    a place kept on the wrong block puts $360 M on somebody's house.
    BUCKET_M = 2000.0
    REACH_M = 600.0
    POINT_M = 500.0

    cen: dict[str, tuple[float, float]] = {}
    spread: dict[str, float] = {}
    byb: dict[str, list] = defaultdict(list)
    for lst in cells.values():
        for (lon, lat, b) in lst:
            byb[b].append((lon, lat))
    for b, v in byb.items():
        cx = sum(x for x, _ in v) / len(v)
        cy = sum(y for _, y in v) / len(v)
        cen[b] = (cx, cy)
        spread[b] = max(
            ((x - cx) * 88000.0) ** 2 + ((y - cy) * 111000.0) ** 2 for x, y in v
        ) ** 0.5

    def far(a: str, b: str) -> float:
        if a not in cen or b not in cen:
            return float("inf")
        (x0, y0), (x1, y1) = cen[a], cen[b]
        return (((x1 - x0) * 88000.0) ** 2 + ((y1 - y0) * 111000.0) ** 2) ** 0.5

    buckets = sorted(b for b in known
                     if spread.get(b, float("inf")) > BUCKET_M)
    print(f"  R1 {len(buckets)} blocks are the assessor's buckets, not ground, "
          f"and carry no place: {', '.join(buckets)}")

    PL = WEB / "places"
    pub = {q["slug"]: q for q in json.load(open(PL / "index.json"))["places"]}

    # ── THE CROSSWALK IS READ FROM THE SEED, NOT FROM THE EXPORT ────────────
    # `places/_facilities.json` is a BigQuery export of `seed_us_sf_place_
    # facilities.csv` joined onto the register. The seed is UPSTREAM of it, it
    # is the reviewed artefact the pipeline calls its source of truth, and
    # `export_sf_place_facilities.py` reads the PROD mart, which `profiles.yml`
    # forbids rebuilding from a developer's machine. Reading the seed is
    # therefore both more correct and one dependency shorter.
    #
    # It also fixes something no guard could reach. `glen-park-branch-library`
    # was resolving to block **1229, in the Haight, 4.3 km from Glen Park**, and
    # R1/R2/R3 all passed it — because the defect was SELF-CONSISTENT: the
    # crosswalk had made the Haight's *Park Branch Library* the place's primary
    # facility, so the place's own published point was in the Haight too, and
    # R3 compares the point to the block. The block agreed with the point
    # because both were wrong. A downstream guard cannot catch that; only the
    # seed can, and the seed now does.
    #
    # `--check-seed` prints the join from BOTH sources side by side, so the
    # divergence between this file and the shipped export is measured rather
    # than assumed, and it closes on its own the next time CI rebuilds the mart.
    reg = {}
    for r in json.load(open(CACHE / "city_facilities.json")):
        try:
            reg[str(int(_f(r["facility_id"])))] = r
        except (TypeError, ValueError, KeyError):
            continue
    crosswalk: dict[str, dict] = defaultdict(
        lambda: {"lat": None, "lon": None, "on": defaultdict(list)}
    )
    with open(SEED_CSV, newline="") as fh:
        for r in csv.DictReader(fh):
            slug = r["place_slug"]
            if slug not in pub:
                continue
            c = crosswalk[slug]
            m = APN.match((r["block_lot"] or "").strip())
            if m and m.group(1) in known:
                c["on"][m.group(1)].append(
                    {"name": r["common_name"], "sqft": int(_f(r["gross_sq_ft"]))}
                )
            if r["is_primary"] == "true":
                g = reg.get(r["facility_id"])
                if g and g.get("latitude"):
                    c["lat"] = _f(g["latitude"])
                    c["lon"] = _f(g["longitude"])

    per: dict[str, list] = defaultdict(list)
    unjoined: list[str] = []
    dropped_far: list[str] = []
    dropped_bucket: list[str] = []
    dropped_point: list[str] = []
    for slug, meta in sorted(pub.items()):
        c = crosswalk.get(slug)
        on: dict[str, list] = dict(c["on"]) if c else {}
        for b in list(on):
            if b in buckets:
                dropped_bucket.append(f"{slug}/{b}")
                del on[b]
        # R3 — the place's own published point against the block's own parcels
        if c and c["lat"] is not None:
            for b in list(on):
                d = min(
                    (((x - c["lon"]) * 88000.0) ** 2
                     + ((y - c["lat"]) * 111000.0) ** 2) ** 0.5
                    for x, y in byb.get(b, [(1e9, 1e9)])
                )
                if d > POINT_M:
                    dropped_point.append(f"{slug}/{b} {round(d)} m")
                    del on[b]
        if not on:
            unjoined.append(slug)
            continue
        anchor = max(on, key=lambda b: (sum(y["sqft"] for y in on[b]), len(on[b])))
        for b in list(on):
            if b != anchor and far(anchor, b) > REACH_M:
                dropped_far.append(f"{slug}/{b} {far(anchor, b) / 1000:.1f} km")
                del on[b]

        d = json.load(open(PL / f"{slug}.json"))
        money = d.get("money") or {}
        cap = d.get("capital") or {}
        cons = money.get("contracts") or []
        place_sqft = sum(y["sqft"] for ys in on.values() for y in ys)
        for b, ys in on.items():
            ys.sort(key=lambda y: -y["sqft"])
            per[b].append({
                "slug": slug,
                "name": d.get("name") or meta.get("name"),
                "kind": d.get("kind") or meta.get("kind"),
                "dept": ((d.get("owning_dept") or {}).get("name")
                         or (money.get("budget_line") or {}).get("name")),
                "here": ys[:4],
                "here_sqft": sum(y["sqft"] for y in ys),
                "place_sqft": place_sqft,
                "n_blocks": len(on),
                "n_contracts": len(cons),
                "agreed_usd": round(sum(_f(c2.get("agreed_usd")) for c2 in cons)),
                "paid_usd": round(sum(_f(c2.get("paid_usd")) for c2 in cons)),
                "n_payees": int(cap.get("n_payees") or 0),
                "payees_paid_usd": round(_f(cap.get("payees_total_paid"))),
                "n_documents": int(meta.get("n_documents") or 0),
            })

    with_money = [b for b, rs in per.items()
                  if any(r["n_contracts"] or r["n_payees"] for r in rs)]
    money_out = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "generated_by": "pipeline/scripts/us_sf_city/build_block_facts.py",
        "unit": "USD",
        "coverage": {
            "blocks_total": len(ids),
            "blocks_with_a_place": len(per),
            "blocks_with_a_money_figure": len(with_money),
            "places_published": len(pub),
            "places_resolved_to_a_block": len(pub) - len(unjoined),
            "places_unresolved": len(unjoined),
        },
        "guards": {
            "bucket_metres": BUCKET_M,
            "reach_metres": REACH_M,
            "point_metres": POINT_M,
            "bucket_blocks": buckets,
            "dropped_as_bucket": dropped_bucket,
            "dropped_out_of_reach": dropped_far,
            "dropped_point_disagrees": dropped_point,
        },
        "unresolved": unjoined,
        "money_is_the_whole_place": (
            "Every figure here is the WHOLE place's, not this block's share of "
            "it. A place standing on more than one block reports the same figure "
            "on each, and `n_blocks` says how many. Nothing here is divided by "
            "floor area, because the city's files do not publish it that way."
        ),
        "no_sum_note": (
            "The contract ledger and the payment ledger are different city files "
            "and are NOT additive: a payment to a vendor named on this place may be "
            "made under the same contract the agreed figure comes from. Each is "
            "reported on its own."
        ),
        "href": "/us/city/sf/places/place/{slug}",
        "crosswalk_source": (
            "pipeline/seeds/countries/us/seed_us_sf_place_facilities.csv, the "
            "reviewed place-to-facility crosswalk, joined onto nc68-ngbr's own "
            "point per facility. Read from the SEED rather than from the "
            "places/_facilities.json export because the seed is upstream of it "
            "and the export is rebuilt only by CI."
        ),
        "sources": {k: SOURCES[k] for k in ("places",)},
        "b": {b: rs for b, rs in sorted(per.items())},
    }
    p = OUT / "block-money.json"
    p.write_text(json.dumps(money_out, separators=(",", ":")))
    print(f"  wrote {p.relative_to(REPO)}  {p.stat().st_size:,} bytes")
    print(f"  R2 dropped out of reach: {', '.join(dropped_far) or 'none'}")
    print(f"  R3 dropped, the point disagrees with the APN: "
          f"{', '.join(dropped_point) or 'none'}")
    print(f"  MONEY COVERAGE: {len(per)} of {len(ids)} blocks carry a published "
          f"place ({100 * len(per) / len(ids):.2f}%); "
          f"{len(with_money)} carry a money figure "
          f"({100 * len(with_money) / len(ids):.2f}%)")
    print(f"  {len(unjoined)} published places resolve to no drawn block: "
          f"{', '.join(unjoined)}")


# ── the seed, replayed ────────────────────────────────────────────────────────
def _block_geometry(known: set[str]):
    """Per drawn block: its active parcels, their centroid, and their spread."""
    byb: dict[str, list] = defaultdict(list)
    for q in json.load(open(CACHE / "parcel_points.json")):
        b = (q.get("block_num") or "").strip()
        if b not in known:
            continue
        try:
            byb[b].append((float(q["centroid_longitude"]), float(q["centroid_latitude"])))
        except (TypeError, ValueError, KeyError):
            continue
    cen, spread = {}, {}
    for b, v in byb.items():
        cx = sum(x for x, _ in v) / len(v)
        cy = sum(y for _, y in v) / len(v)
        cen[b] = (cx, cy)
        spread[b] = max(
            ((x - cx) * 88000.0) ** 2 + ((y - cy) * 111000.0) ** 2 for x, y in v
        ) ** 0.5
    return byb, cen, spread


def _metres(lon0: float, lat0: float, lon1: float, lat1: float) -> float:
    return (((lon1 - lon0) * 88000.0) ** 2 + ((lat1 - lat0) * 111000.0) ** 2) ** 0.5


def _guard(places: dict, byb, cen, spread, known: set[str]):
    """R1/R2/R3 over {slug: {"lat","lon","fac":[(block, sqft)]}}. Returns drops."""
    BUCKET_M, REACH_M, POINT_M = 2000.0, 600.0, 500.0
    buckets = {b for b in known if spread.get(b, float("inf")) > BUCKET_M}
    d1, d2, d3, kept = [], [], [], {}
    for slug, p in sorted(places.items()):
        on: dict[str, int] = defaultdict(int)
        for b, sqft in p["fac"]:
            on[b] += sqft
        for b in list(on):
            if b in buckets:
                d1.append(f"{slug}/{b}")
                del on[b]
        if p["lat"] is not None:
            for b in list(on):
                if b not in byb:
                    continue
                d = min(_metres(p["lon"], p["lat"], x, y) for x, y in byb[b])
                if d > POINT_M:
                    d3.append(f"{slug}/{b} {round(d)} m")
                    del on[b]
        if not on:
            continue
        anchor = max(on, key=lambda b: on[b])
        for b in list(on):
            if b != anchor and b in cen and anchor in cen:
                if _metres(*cen[anchor], *cen[b]) > REACH_M:
                    d2.append(f"{slug}/{b}")
                    del on[b]
        kept[slug] = sorted(on)
    return d1, d2, d3, kept


def check_seed() -> None:
    """Replay the place-to-block join TWICE and print what each guard drops.

    The exporter reads the PROD mart and `profiles.yml` forbids a local
    `--target prod`, so the fix to `seed_us_sf_place_facilities.csv` cannot
    reach `_facilities.json` from a developer's machine — CI rebuilds it. This
    reads BOTH: the export the site ships today, and the fixed seed joined onto
    the register's own points, so "the guards now drop zero rows" is a measured
    before-and-after rather than a claim.
    """
    known = set(json.load(open(WEB / "city" / "base" / "blocks-id.json"))["id"])
    byb, cen, spread = _block_geometry(known)
    reg = {}
    for r in json.load(open(CACHE / "city_facilities.json")):
        try:
            reg[str(int(float(r["facility_id"])))] = r
        except (TypeError, ValueError, KeyError):
            continue
    pub = {q["slug"] for q in json.load(open(WEB / "places" / "index.json"))["places"]}

    # A — what the site ships today
    fac = json.load(open(WEB / "places" / "_facilities.json"))["places"]
    now = {}
    for slug in pub:
        f = fac.get(slug)
        if not f:
            continue
        rows = []
        for x in f.get("facilities") or []:
            m = APN.match((x.get("block_lot") or "").strip())
            if m and m.group(1) in known:
                rows.append((m.group(1), int(_f(x.get("gross_sq_ft")))))
        now[slug] = {"lat": f.get("primary_latitude"),
                     "lon": f.get("primary_longitude"), "fac": rows}

    # B — the fixed seed, joined onto the register exactly as the mart does
    seed = defaultdict(lambda: {"lat": None, "lon": None, "fac": []})
    with open(SEED_CSV, newline="") as fh:
        for r in csv.DictReader(fh):
            slug = r["place_slug"]
            if slug not in pub:
                continue
            m = APN.match((r["block_lot"] or "").strip())
            if m and m.group(1) in known:
                seed[slug]["fac"].append((m.group(1), int(_f(r["gross_sq_ft"]))))
            if r["is_primary"] == "true":
                g = reg.get(r["facility_id"])
                if g and g.get("latitude"):
                    seed[slug]["lat"] = float(g["latitude"])
                    seed[slug]["lon"] = float(g["longitude"])

    for label, places in (("EXPORT as shipped", now), ("SEED as fixed", dict(seed))):
        d1, d2, d3, kept = _guard(places, byb, cen, spread, known)
        print(f"\n  ── {label} ──")
        print(f"  places resolving to a block : {len(kept)} of {len(pub)} published")
        print(f"  R1 bucket        {len(d1):>2} : {', '.join(sorted(set(d1))) or 'none'}")
        print(f"  R2 out of reach  {len(d2):>2} : {', '.join(sorted(set(d2))) or 'none'}")
        print(f"  R3 point/APN     {len(d3):>2} : {', '.join(sorted(set(d3))) or 'none'}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--check-seed", action="store_true",
                    help="replay the place-to-block join from the export AND "
                         "from the seed, and print what each guard drops")
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    if not (a.fetch or a.build or a.check_seed):
        ap.error("one of --fetch, --build or --check-seed")
    if a.fetch:
        fetch(a.refresh)
    if a.build:
        build()
    if a.check_seed:
        check_seed()
