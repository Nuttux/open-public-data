#!/usr/bin/env python3
"""Stage 1 of the SF place expansion (2026-07-27) — SOURCED registries, not
editorial memory. The SF counterpart of expand_seed_lieux_v3.py, and it follows
the same rule that script's docstring states: the bar is no longer "emblematic
to the eye" but measured. This step does NOT decide what is worth publishing —
it only assembles a large pool that score_sf_place_candidates.py then ranks by
real data signal.

The Paris v3 pool came from Wikipedia list-pages (every municipal pool, every
cemetery, every green space) because Paris has no municipal facility registry.
San Francisco does, so the backbone here is structural rather than editorial:

  - City Facilities registry (nc68-ngbr, via raw.us_sf_city_facilities) — 1,734
    facilities with address + APN + gross_sq_ft + owning department. Every
    branch library, fire station, health center, police station, yard, plant.
  - Rec & Park property registry (ib5c-xgwu, via raw.us_sf_recpark_facilities)
    — 2,687 features rolled up to their `property_name`, i.e. the park itself
    (253 properties). This is the "every green space" list.
  - Wikipedia list/category pages — for civic landmarks that are legible places
    but are not a line in either registry (districts, monuments, structures
    operated by others). Fetched from the MediaWiki API, never typed from
    memory; the source page is recorded on every candidate it contributes.

Every candidate carries `sources[]` with the dataset id or wiki page that
produced it, so the pool is auditable. The 63 already-reviewed places from
sf_place_candidates.json are carried in unchanged and flagged `already_seeded`,
so the ranking covers the whole field rather than the new arrivals alone.

ROLL-UP. A registry row is a building, not a place: "Kezar Stadium",
"Kezar Stadium Maintenance Facility" and "Kezar Pavilion" are three rows of one
campus. Rows whose name wholly contains a shorter candidate's name in the same
department are folded in as campus buildings (their sq ft and APNs join the
parent), never emitted as places of their own.

ALIASES stay qualified — the constraint documented in link_sf_places.py: several
place names double as SF neighborhood names, and a bare alias ("Chinatown",
"Mission", "Glen Park") matches unrelated department programs at ~0% precision.
An alias is emitted only if it carries a facility-type qualifier, is ≥3 words,
or is an all-caps acronym. Anything else is dropped here rather than gated
downstream, so no consumer of this pool can accidentally match on it.

Output: pipeline/seeds/sf_place_pool.json  (a POOL, not the reviewed seed —
sf_place_candidates.json is never written by this script.)

Usage: python pipeline/scripts/enrich/expand_sf_place_pool.py [--no-wiki]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "sf_place_candidates.json"
OUT = ROOT / "pipeline" / "seeds" / "sf_place_pool.json"
WIKI_CACHE = ROOT / "pipeline" / "cache" / "ia_sf" / "wiki_lists.json"

PROJECT = "open-data-france-484717"
T_FACILITIES = f"{PROJECT}.raw.us_sf_city_facilities"
T_RECPARK = f"{PROJECT}.raw.us_sf_recpark_facilities"

UA = {"User-Agent": "qipu/0.1 (civic data research; https://qipu.org)"}

# San Francisco proper + the city's out-of-county assets (Sharp Park in Pacifica,
# Camp Mather near Yosemite, Hetch Hetchy). A generous box: the pool must not
# silently drop places the city owns outside its own boundary.
SF_BBOX = (37.60, -123.05, 38.10, -122.28)      # (lat_min, lon_min, lat_max, lon_max)
CA_BBOX = (37.30, -123.20, 38.30, -119.30)      # wider, for city-owned outliers

# ── department mapping ───────────────────────────────────────────────────────
# Registry department_name → the budget/payroll department_code used everywhere
# else in the SF pipeline (see budget_breakdown_*.json).
DEPT_CODE = {
    "recreation and parks": "REC",
    "public library": "LIB",
    "public health": "DPH",
    "public utilities commission": "PUC",
    "port": "PRT",
    "municipal transportation agency": "MTA",
    "public works": "DPW",
    "fire department": "FIR",
    "police department": "POL",
    "airport (sfo)": "AIR",
    "sheriff": "SHF",
    "juvenile probation": "JUV",
    "human services agency": "HSA",
    "homelessness and supportive housing": "HOM",
    "war memorial": "WAR",
    "fine arts museums": "FAM",
    "asian art museum": "AAM",
    "arts commission": "ART",
    "academy of sciences": "SCI",
    "emergency management": "DEM",
    "technology": "TIS",
    "superior court": "CRT",
    "mayor": "MYR",
    "gsa - real estate division": "ADM",
    "gsa - office of contract administration": "ADM",
    "gsa - convention facilities management": "ADM",
    "gsa - medical examiner": "ADM",
    "treasure island development authority": "ADM",
}
DEPT_LABEL = {
    "REC": "Recreation and Park Department", "LIB": "Public Library",
    "DPH": "Public Health", "PUC": "Public Utilities Commission", "PRT": "Port",
    "MTA": "Municipal Transportation Agency", "DPW": "Public Works",
    "FIR": "Fire Department", "POL": "Police Department", "AIR": "Airport (SFO)",
    "SHF": "Sheriff", "JUV": "Juvenile Probation", "HSA": "Human Services Agency",
    "HOM": "Homelessness & Supportive Housing", "WAR": "War Memorial & Performing Arts",
    "FAM": "Fine Arts Museums", "AAM": "Asian Art Museum", "ART": "Arts Commission",
    "SCI": "Academy of Sciences", "DEM": "Emergency Management", "TIS": "Technology",
    "CRT": "Superior Court", "MYR": "Mayor", "ADM": "City Administrator",
}

# Departments whose facilities are never one of our civic places: the School
# District is a separate agency (same guard as build_sf_place_facilities.py) and
# "Non-City" rows are leased-from-others space with no city identity.
DEPT_EXCLUDE = {"school district (sfusd)", "non-city"}

# ── what counts as a legible civic place ─────────────────────────────────────
# A facility row qualifies as a place if its name names a civic destination.
# Deliberately broad — the pool is meant to be over-inclusive and the ranking
# decides. Ordered longest-first so `kind` picks the most specific match.
CIVIC_TYPES: list[tuple[str, str, str]] = [  # (regex, kind, family)
    (r"branch librar|public librar|\blibrary\b|\bbranch\b", "Library", "library"),
    (r"fire station|fireboat|fire ?house|fire division of training|fire academy",
     "Fire station", "fire"),
    (r"police station|police academy|\bstation\b(?=.*police)", "Police station", "civic"),
    (r"health cent(er|re)|\bclinic\b|hospital|medical cent(er|re)|"
     r"mental health|child development cent(er|re)", "Health facility", "health"),
    (r"rec(reation)? cent(er|re)|recreation building|clubhouse|field ?house|"
     r"community cent(er|re)|senior cent(er|re)|youth cent(er|re)", "Recreation center", "park"),
    (r"\bpool\b|natatorium|\bswim", "Swimming pool", "park"),
    (r"playground|ball ?field|\bdiamond\b|tennis|soccer|golf course|"
     r"stadium|pavilion|gymnasium|\bgym\b|athletic", "Sports facility", "park"),
    (r"museum|theat(er|re)|auditorium|concert hall|\bopera\b|symphony|art cent(er|re)|"
     r"cultural cent(er|re)|conservatory|planetarium|aquarium|\bzoo\b", "Cultural venue", "culture"),
    (r"reservoir|water treatment|wastewater|treatment plant|power ?(house|plant)|"
     r"\bdam\b|aqueduct", "Water & power", "water"),
    (r"\bpier\b|wharf|seawall|ferry|maritime|\bharbor\b|marina|shipyard",
     "Port facility", "port"),
    (r"\byard\b|\bdepot\b|\bterminal\b|\bgarage\b|railroad station|\bairport\b|"
     r"\bsubway\b|\bmetro\b|transit|muni (metro|station)", "Transit & works", "transit"),
    (r"city hall|\bcourt\b|courthouse|hall of justice|\bjail\b|county jail|"
     r"civic cent(er|re)|\bmorgue\b|medical examiner|hall of records|\bmarket\b|"
     r"\bshelter\b|navigation cent(er|re)|\blodge\b|\bhouse\b|\bhome\b|"
     r"\bhall\b|\btower\b|\bbuilding\b|\boffice", "Civic building", "civic"),
    (r"\bpark\b|\bsquare\b|\bplaza\b|\bgarden\b|greenbelt|\bgrove\b|\bbeach\b|"
     r"\bpoint\b|\bhill\b|open space", "Park", "park"),
]

# Rows that are equipment or tenancy, not destinations. A pool of 150 places is
# worthless if 70 of them are Muni operator bathrooms; these never become a place
# (they can still be folded in as a campus building of a real one).
#   - bathrooms / sheds / tanks / booths: equipment.
#   - pump stations & substations: real infrastructure, but not somewhere a reader
#     can visit or recognise; they are components of the line they serve.
#   - "SWL nnn": a Port seawall lot — a leased commercial parcel, not a civic place.
NOISE = re.compile(
    r"bathroom|restroom|\btoilet|lavatory|storage|\bshed\b|kiosk|transformer|"
    r"antenna|\btank\b|trailer|modular|bungalow|portable|utility box|\bvault\b|"
    r"maintenance (shop|shed|building|facility)|corp ?yard shed|truck scale|"
    r"parking meter|\bsign\b|monument sign|\bfuel\b|generator|pump ?(house|station)|"
    r"lift station|sub-?station|\bcanopy\b|jetway|\bhangar\b|guard ?booth|"
    r"\bbooth\b|^swl \d|\blots?\b|warehouse|chlorine|\bwell\b(?! ?being)", re.I)

# Abbreviation expansion, per the Block-6 study §4F ("an abbreviation-expansion
# table: PW→Public Works, SFGH/ZSFG, Seis, Reno, RP…"). The registry writes
# campuses in shorthand; without this, "ZSFGH - Building 90" and "GGP -- North
# Lake" become places of their own instead of folding into the hospital and the
# park that already exist in the reviewed seed.
CAMPUS_ABBREV = {
    "zsfgh": "Zuckerberg San Francisco General Hospital",
    "zsfg": "Zuckerberg San Francisco General Hospital",
    "sfgh": "Zuckerberg San Francisco General Hospital",
    "ggp": "Golden Gate Park",
    "zoo": "San Francisco Zoo",
    "laguna honda": "Laguna Honda Hospital",
}

# Departments whose registry rows are all sub-buildings of ONE place. SFO is 116
# rows of jetways, cargo buildings and lettered garages; it is one airport, and
# emitting "Garage G - 495" as a civic place would be absurd.
DEPT_AS_ONE_PLACE = {
    "AIR": ("San Francisco International Airport", "Airport", "transit"),
}

# Verified short abbreviations. The contract ledger writes places in shorthand —
# every Golden Gate Park contract is titled "PW GGP …", so the full name matches
# NOTHING and the flagship park scored zero on contracts before this table.
# A 3-letter token is below the general acronym floor, so each entry is admitted
# only after checking its precision against the ledger it will match (2026-07-27,
# core_us_sf_contracts, whole-word): GGP 20/20 Golden Gate Park, LHH 69/69 Laguna
# Honda. CMGC was tested and REJECTED — it is a delivery method (Construction
# Manager/General Contractor), not a place.
# The same check admits short WORD forms the ledger uses in place of the full
# name (all whole-word counts, core_us_sf_contracts, 2026-07-27):
#   Kezar 3/3 (Fence, Restroom, CON24-0017) — attached to the stadium only, so
#   the pavilion cannot double-count the same contracts;
#   Moscone 12/12; Portsmouth 4/4.
# This table is deliberately small and per-entry verified. A general "any
# distinctive token" rule was built and measured at ~20% precision (see
# score_sf_place_candidates.prepare) — the remaining abbreviation coverage is a
# reported gap, not a guess.
VERIFIED_ABBREV = {
    "golden gate park": ["GGP"],
    "laguna honda hospital": ["LHH"],
    "kezar stadium": ["Kezar"],
    "moscone center": ["Moscone"],
    "portsmouth square": ["Portsmouth"],
}

# An alias is unsafe when it is a bare SF NEIGHBORHOOD name — the documented
# ~0%-precision failure mode (link_sf_places.py): "Chinatown" or "Glen Park" alone
# pulls in unrelated department programs. The gazetteer is read from the city's
# own data rather than typed from memory (see neighborhood_names()).
QUALIFIER = re.compile(
    r"librar|station|cent(er|re)\b|\bpark\b|\bpool\b|\bhall\b|museum|hospital|"
    r"clinic|theat(er|re)|\byard\b|\bplant\b|\bpier\b|wharf|reservoir|stadium|"
    r"pavilion|playground|garden|\bsquare\b|plaza|\bcourt\b|\bjail\b|academy|"
    r"lodge|conservatory|auditorium|\bzoo\b|\btower\b|terminal|\bdepot\b|"
    r"\bgarage\b|shelter|clubhouse|gymnasium|marina|\bbeach\b|\bgrove\b|"
    r"\bcampus\b|\bbranch\b|\bhouse\b|\bmarket\b|\bbridge\b", re.I)


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return re.sub(r"-+", "-", s)


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())).strip()


def bq_json(query: str, max_rows: int = 20000) -> list[dict]:
    out = subprocess.run(
        ["bq", "query", "--use_legacy_sql=false", "--format=json",
         f"--max_rows={max_rows}", query],
        capture_output=True, text=True, check=True).stdout
    return json.loads(out or "[]")


def titlecase(s: str) -> str:
    """Registry names arrive in mixed case ('Recreation And Parks', 'FIRE STATION
    #11'). Normalise the shouty ones without flattening real casing."""
    if s.isupper() or s.islower():
        s = " ".join(w.capitalize() for w in s.split())
    return re.sub(r"\s+", " ", s).strip()


def classify(name: str) -> tuple[str, str] | None:
    n = name.lower()
    for pat, kind, family in CIVIC_TYPES:
        if re.search(pat, n):
            return kind, family
    return None


_NEIGHBORHOODS: set[str] = set()


def neighborhood_names() -> set[str]:
    """SF neighborhood gazetteer, read from the city's own Rec/Park dataset
    (ib5c-xgwu carries four neighborhood vocabularies per feature: analysis,
    planning, MONS and realtor). Sourced, not typed from memory — the same
    principle as the pool itself. Used only to REJECT aliases."""
    global _NEIGHBORHOODS
    if _NEIGHBORHOODS:
        return _NEIGHBORHOODS
    rows = bq_json(f"""
        SELECT DISTINCT nb FROM (
            SELECT analysis_neighborhood AS nb FROM `{T_RECPARK}`
            UNION ALL SELECT planning_neighborhood FROM `{T_RECPARK}`
            UNION ALL SELECT mons_neighborhood FROM `{T_RECPARK}`
            UNION ALL SELECT realtor_neighborhood FROM `{T_RECPARK}`
        ) WHERE nb IS NOT NULL AND TRIM(nb) != ''
    """)
    for r in rows:
        for part in (r["nb"] or "").split(","):
            n = norm(part)
            if n:
                _NEIGHBORHOODS.add(n)
    return _NEIGHBORHOODS


def alias_is_safe(a: str) -> bool:
    """Alias-precision rule (the link_sf_places.py constraint).

    The documented failure mode is specific: a bare name that doubles as an SF
    NEIGHBORHOOD matches unrelated department programs at ~0% precision. So the
    test is exactly that, rather than a blanket "must contain a facility-type
    word" which also threw away unambiguous proper nouns like "Moscone".

    But the neighborhood test alone over-rejects in the other direction: SF names
    several of its official neighborhoods after the park at their centre, so
    "Golden Gate Park", "Alamo Square" and "Lincoln Park" are all in the
    gazetteer. A neighborhood name that carries a facility-type qualifier is not
    the ambiguous case — "Chinatown" is, "Chinatown Branch Library" is not."""
    a = a.strip()
    if a.upper() in {x for v in VERIFIED_ABBREV.values() for x in v}:
        return True
    if len(a) >= 4 and a.isupper() and a.isalpha():
        return True                      # SFGH / ZSFG — hand-checked ~100%
    if len(a) < 6:
        return False
    if norm(a) in neighborhood_names() and not QUALIFIER.search(a):
        return False
    return True


def build_aliases(name: str, extra: list[str] | None = None) -> list[str]:
    """Safe surface forms of a place name. Only mechanical variants the city's
    own ledgers actually use — '#' dropped, 'No.' spelled out, parenthetical
    disambiguator removed — never a shortened, less-qualified form."""
    cands = [name, *(extra or []), *VERIFIED_ABBREV.get(norm(name), [])]
    out: list[str] = []
    for c in cands:
        c = re.sub(r"\s+", " ", c).strip()
        variants = {c}
        if "#" in c:
            variants.add(c.replace("#", "").replace("  ", " ").strip())
            variants.add(re.sub(r"#\s*(\d+)", r"No. \1", c))
        if "(" in c:
            variants.add(re.sub(r"\s*\([^)]*\)", "", c).strip())
        if " - " in c:
            variants.add(c.split(" - ")[0].strip())
        for v in variants:
            v = re.sub(r"\s+", " ", v).strip(" -,")
            if v and alias_is_safe(v) and v not in out:
                out.append(v)
    return out


# ── source A: City Facilities registry (nc68-ngbr) ───────────────────────────

def load_city_facilities() -> list[dict]:
    rows = bq_json(f"""
        SELECT common_name, address, zip_code, block_lot, department_name,
               owned_leased, gross_sq_ft, latitude, longitude, supervisor_district,
               city_tenants, facility_id
        FROM `{T_FACILITIES}`
        WHERE common_name IS NOT NULL AND TRIM(common_name) != ''
    """)
    keep = []
    for r in rows:
        dept = (r.get("department_name") or "").strip().lower()
        if dept in DEPT_EXCLUDE:
            continue
        keep.append(r)
    return keep


def campus_prefix(name: str) -> str | None:
    """The segment before the first ' - ' / ' -- ' separator: how the registry
    writes a campus building ('Pier 70 - SWL 349 - Machine Shop, Bldg. #114')."""
    for sep in (" -- ", " - ", "--"):
        if sep in name:
            head = name.split(sep)[0].strip()
            if head and head.lower() != name.strip().lower():
                return head
    return None


def sqft_of(r: dict) -> int:
    v = (r.get("gross_sq_ft") or "").strip()
    return int(v) if v.isdigit() else 0


def dept_code_of(r: dict) -> str:
    return DEPT_CODE.get((r.get("department_name") or "").strip().lower(), "ADM")


def facilities_to_candidates(rows: list[dict]) -> list[dict]:
    """One candidate per legible civic facility, with campus rows folded in.

    Three passes: (0) departments that are structurally ONE place (SFO) collapse
    whole; (1) recurring campus prefixes resolve their rows to the campus, so
    'ZSFGH - Building 90' lands on the hospital rather than becoming a place;
    (2) any remaining row whose name wholly contains a shorter place's name in
    the same department folds into it ('Kezar Stadium Maintenance Facility')."""
    # ── pass 0: whole-department collapse ──
    collapsed: dict[str, list[dict]] = defaultdict(list)
    rest: list[dict] = []
    for r in rows:
        code = dept_code_of(r)
        (collapsed[code] if code in DEPT_AS_ONE_PLACE else rest).append(r)

    # ── pass 1: recurring campus prefixes ──
    # A prefix is a campus only if it recurs in its department AND names a real
    # place itself (classifiable, or a known abbreviation). That keeps 'Pier 70'
    # and 'ZSFGH' while rejecting '18th' and 'SWL 302'.
    pref_count: dict[tuple[str, str], int] = defaultdict(int)
    for r in rest:
        pref = campus_prefix(titlecase(r["common_name"]))
        if pref:
            pref_count[(dept_code_of(r), norm(pref))] += 1

    def resolve(r: dict) -> tuple[str, str | None]:
        """(place name, campus-building name or None)."""
        name = titlecase(r["common_name"]).strip(" *")
        # A known abbreviation leading the name, with or without a separator
        # ("ZSFGH Garage", "Zoo- Fleishacker Building"), is the campus.
        lead = re.split(r"[\s\-]+", norm(name))
        for n_tok in (2, 1):
            key = " ".join(lead[:n_tok])
            if key in CAMPUS_ABBREV and norm(name) != norm(CAMPUS_ABBREV[key]):
                return CAMPUS_ABBREV[key], name
        pref = campus_prefix(name)
        if not pref:
            return name, None
        pn = norm(pref)
        if pref_count[(dept_code_of(r), pn)] < 2:
            return name, None
        if pn not in CAMPUS_ABBREV and not classify(pref):
            return name, None
        return CAMPUS_ABBREV.get(pn, titlecase(pref)), name

    resolved = [(r, *resolve(r)) for r in rest]

    heads: list[dict] = []
    seen_place: dict[tuple[str, str], dict] = {}
    for r, place_name, building in resolved:
        if NOISE.search(place_name):
            continue
        cls = classify(place_name)
        sqft = sqft_of(r)
        if not cls and sqft < 10000:
            continue
        kind, family = cls or ("Civic building", "civic")
        code = dept_code_of(r)
        key = (code, norm(place_name))
        if key in seen_place:                     # another building of the campus
            h = seen_place[key]
            h["rows"].append(r)
            if building:
                h["buildings"].append(building)
            continue
        h = {"name": place_name, "norm": norm(place_name), "kind": kind,
             "family": family, "dept_code": code,
             "dept_name": (r.get("department_name") or "").strip(),
             "row": r, "rows": [r], "buildings": [building] if building else [],
             "sqft": sqft}
        seen_place[key] = h
        heads.append(h)

    # ── pass 2: containment ──
    # A shorter place contained in a longer place's name (same department) is the
    # campus parent. Sorted by name length so parents are decided before children.
    heads.sort(key=lambda h: (len(h["norm"]), h["norm"]))
    parents: list[dict] = []
    for h in heads:
        hit = next((p for p in parents
                    if p["dept_code"] == h["dept_code"]
                    and re.search(rf"\b{re.escape(p['norm'])}\b", h["norm"])), None)
        if hit is not None:
            hit["rows"].extend(h["rows"])
            hit["buildings"].append(h["name"])
            hit["buildings"].extend(h["buildings"])
        else:
            parents.append(h)

    # Rows that are not places in their own right (bathrooms, sheds) still
    # contribute sq ft / APN to a campus they clearly belong to.
    claimed = {id(r) for p in parents for r in p["rows"]}
    for r in rest:
        if id(r) in claimed:
            continue
        n = norm(titlecase(r["common_name"]))
        code = dept_code_of(r)
        for p in parents:
            if p["dept_code"] == code and re.search(rf"\b{re.escape(p['norm'])}\b", n):
                p["rows"].append(r)
                break

    # ── pass 0 output: one candidate per collapsed department ──
    for code, rows_d in collapsed.items():
        name, kind, family = DEPT_AS_ONE_PLACE[code]
        parents.append({"name": name, "norm": norm(name), "kind": kind,
                        "family": family, "dept_code": code,
                        "dept_name": rows_d[0].get("department_name") or "",
                        "row": max(rows_d, key=sqft_of), "rows": rows_d,
                        "buildings": [titlecase(r["common_name"]) for r in rows_d]})

    out = []
    for p in parents:
        rows_all = p["rows"]
        anchor = max(rows_all, key=sqft_of)
        apns = sorted({(r.get("block_lot") or "").strip()
                       for r in rows_all if (r.get("block_lot") or "").strip()})
        lats = [float(r["latitude"]) for r in rows_all if r.get("latitude")]
        lons = [float(r["longitude"]) for r in rows_all if r.get("longitude")]
        out.append({
            "slug": slugify(p["name"]),
            "name": p["name"],
            "kind": p["kind"],
            "family": p["family"],
            "aliases": build_aliases(p["name"]),
            "owning_dept": DEPT_LABEL.get(p["dept_code"], p["dept_name"]),
            "owning_dept_code": p["dept_code"],
            "address": titlecase(anchor.get("address") or p["row"].get("address") or ""),
            "lat": round(sum(lats) / len(lats), 6) if lats else None,
            "lon": round(sum(lons) / len(lons), 6) if lons else None,
            "block_lots": apns,
            "n_facility_rows": len(rows_all),
            "gross_sq_ft": sum(sqft_of(r) for r in rows_all),
            "acres": None,
            "owned_leased": anchor.get("owned_leased"),
            "supervisor_district": anchor.get("supervisor_district"),
            "campus_buildings": sorted({b for b in p["buildings"] if b != p["name"]}),
            "sources": [{"kind": "registry", "dataset": "nc68-ngbr",
                         "name": "SF City Facilities",
                         "detail": f"{len(rows_all)} facility row(s); "
                                   f"anchor facility_id {anchor.get('facility_id')}"}],
        })
    return out


# ── source B: Rec & Park property registry (ib5c-xgwu) ───────────────────────

SECTIONED = re.compile(r"\s*-\s*section\s+\d+\s*$", re.I)


def recpark_to_candidates() -> list[dict]:
    rows = bq_json(f"""
        SELECT property_name, complex, address, analysis_neighborhood,
               facility_type, acres, latitude, longitude, supdist, zipcode
        FROM `{T_RECPARK}`
        WHERE property_name IS NOT NULL AND TRIM(property_name) != ''
    """)
    props: dict[str, dict] = defaultdict(
        lambda: {"acres": 0.0, "n": 0, "lats": [], "lons": [], "addr": "",
                 "nb": "", "types": set(), "supdist": ""})
    for r in rows:
        # "Golden Gate Park - Section 5" is a maintenance subdivision, not a
        # place a reader would name. Roll the sections back into the park.
        name = SECTIONED.sub("", titlecase(r["property_name"])).strip()
        if not name:
            continue
        p = props[name]
        try:
            p["acres"] += float(r["acres"]) if r.get("acres") else 0.0
        except ValueError:
            pass
        p["n"] += 1
        if r.get("latitude"):
            p["lats"].append(float(r["latitude"]))
        if r.get("longitude"):
            p["lons"].append(float(r["longitude"]))
        if not p["addr"] and r.get("address"):
            p["addr"] = titlecase(r["address"])
        if not p["nb"] and r.get("analysis_neighborhood"):
            p["nb"] = r["analysis_neighborhood"]
        if not p["supdist"] and r.get("supdist"):
            p["supdist"] = r["supdist"]
        if r.get("facility_type"):
            p["types"].add(r["facility_type"])

    out = []
    for name, p in props.items():
        # Below a quarter-acre a Rec/Park "property" is a median strip or a
        # stairway easement, not a destination. 205 of 253 clear this.
        if p["acres"] < 0.25:
            continue
        kind_family = classify(name) or ("Park", "park")
        out.append({
            "slug": slugify(name),
            "name": name,
            "kind": kind_family[0],
            "family": kind_family[1],
            "aliases": build_aliases(name),
            "owning_dept": DEPT_LABEL["REC"],
            "owning_dept_code": "REC",
            "address": p["addr"],
            "lat": round(sum(p["lats"]) / len(p["lats"]), 6) if p["lats"] else None,
            "lon": round(sum(p["lons"]) / len(p["lons"]), 6) if p["lons"] else None,
            "block_lots": [],
            "n_facility_rows": p["n"],
            "gross_sq_ft": 0,
            "acres": round(p["acres"], 2),
            "owned_leased": "Own",
            "supervisor_district": (p["supdist"] or "").split(",")[0].strip() or None,
            "campus_buildings": [],
            "neighborhood": p["nb"],
            "sources": [{"kind": "registry", "dataset": "ib5c-xgwu",
                         "name": "SF Rec & Park facilities",
                         "detail": f"{p['n']} features, {round(p['acres'], 2)} acres"}],
        })
    return out


# ── source C: Wikipedia list/category pages ──────────────────────────────────
# Sourced lists, exactly as the Paris v3 pool was built: the page is named, its
# members are fetched from the API, nothing is typed from memory.
WIKI_CATEGORIES = [
    "Category:Parks in San Francisco",
    "Category:San Francisco Designated Landmarks",
    "Category:Government buildings in San Francisco",
    "Category:Buildings and structures in San Francisco",
    "Category:Museums in San Francisco",
    "Category:Sports venues in San Francisco",
    "Category:Squares in San Francisco",
]


def wiki_api(params: dict, tries: int = 5) -> dict:
    """MediaWiki query with backoff — the API rate-limits anonymous bursts (429),
    and a half-fetched category listing would silently shrink the pool."""
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
        {**params, "format": "json"})
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503) or attempt == tries - 1:
                raise
            time.sleep(5 * (attempt + 1))
    return {}


def wiki_members() -> list[dict]:
    """Category members with coordinates, cached. Returns [{title, lat, lon}]."""
    if WIKI_CACHE.exists():
        return json.loads(WIKI_CACHE.read_text())

    titles: dict[str, str] = {}
    for cat in WIKI_CATEGORIES:
        cont = None
        while True:
            p = {"action": "query", "list": "categorymembers", "cmtitle": cat,
                 "cmlimit": "500", "cmnamespace": "0"}
            if cont:
                p["cmcontinue"] = cont
            d = wiki_api(p)
            for m in d.get("query", {}).get("categorymembers", []):
                titles.setdefault(m["title"], cat)
            cont = d.get("continue", {}).get("cmcontinue")
            time.sleep(1.5)
            if not cont:
                break

    out = []
    names = sorted(titles)
    for i in range(0, len(names), 40):
        time.sleep(1.0)
        batch = names[i:i + 40]
        d = wiki_api({"action": "query", "prop": "coordinates",
                      "titles": "|".join(batch), "colimit": "max"})
        for pg in d.get("query", {}).get("pages", {}).values():
            co = (pg.get("coordinates") or [{}])[0]
            if co.get("lat") is None:
                continue
            out.append({"title": pg["title"], "lat": co["lat"], "lon": co["lon"],
                        "category": titles.get(pg["title"], "")})
        time.sleep(1.5)

    WIKI_CACHE.parent.mkdir(parents=True, exist_ok=True)
    WIKI_CACHE.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    return out


def in_box(lat: float, lon: float, box) -> bool:
    return box[0] <= lat <= box[2] and box[1] <= lon <= box[3]


def wiki_to_candidates(existing_norms: set[str]) -> list[dict]:
    out = []
    for m in wiki_members():
        if not in_box(m["lat"], m["lon"], SF_BBOX):
            continue
        title = re.sub(r"\s*\([^)]*\)\s*$", "", m["title"]).strip()
        n = norm(title)
        if n in existing_norms:
            continue
        cls = classify(title)
        if not cls:
            continue
        aliases = build_aliases(title)
        if not aliases:
            continue
        kind, family = cls
        out.append({
            "slug": slugify(title),
            "name": title,
            "kind": kind,
            "family": family,
            "aliases": aliases,
            # Wikipedia does not tell us who operates it. Left unresolved rather
            # than guessed — a wrong owning department would silently corrupt the
            # department-affinity guards downstream.
            "owning_dept": None,
            "owning_dept_code": None,
            "address": "",
            "lat": m["lat"], "lon": m["lon"],
            "block_lots": [], "n_facility_rows": 0, "gross_sq_ft": 0, "acres": None,
            "owned_leased": None, "supervisor_district": None, "campus_buildings": [],
            "municipal_status": "unverified",   # may be federal/state/private
            "wiki": m["title"],
            "sources": [{"kind": "wikipedia", "dataset": m["category"],
                         "name": "Wikipedia category listing",
                         "detail": m["title"]}],
        })
    return out


# ── merge ────────────────────────────────────────────────────────────────────

def merge(pools: list[tuple[str, list[dict]]]) -> list[dict]:
    """Union by normalized name AND by slug, keeping the richest record and
    unioning the source list, so a place found in two registries shows both
    provenances. Slug is a merge key in its own right because two spellings can
    normalise apart but slugify together ("Stern Grove" / "Stern  Grove"), and a
    duplicated slug would rank the same place twice and collide downstream."""
    records: list[dict] = []
    index: dict[str, dict] = {}

    def keys(c: dict) -> set[str]:
        # Three ways the same place shows up twice:
        #   - identical normalized name;
        #   - identical slug from names that normalise apart;
        #   - the reviewed seed writes "San Francisco City Hall" where the
        #     registry writes "City Hall" — without stripping the city prefix
        #     both survive and split the same contracts between them.
        n = norm(c["name"])
        ks = {n, f"slug:{c['slug']}"}
        stripped = re.sub(r"^(san francisco|sf) ", "", n)
        if stripped != n and len(stripped.split()) >= 2:
            ks.add(stripped)
        return ks

    for _, pool in pools:
        for c in pool:
            ks = keys(c)
            keep = next((index[k] for k in ks if k in index), None)
            if keep is None:
                records.append(c)
                for k in ks:
                    index[k] = c
                continue
            for k in ks:
                index.setdefault(k, keep)
            for src in c["sources"]:
                if src not in keep["sources"]:
                    keep["sources"].append(src)
            # richer wins field by field, never overwriting a real value with None
            for k in ("address", "lat", "lon", "acres", "gross_sq_ft", "wiki",
                      "owning_dept", "owning_dept_code", "supervisor_district"):
                if not keep.get(k) and c.get(k):
                    keep[k] = c[k]
            if c.get("block_lots"):
                keep["block_lots"] = sorted(set(keep.get("block_lots", [])) | set(c["block_lots"]))
            keep["n_facility_rows"] = max(keep.get("n_facility_rows", 0),
                                          c.get("n_facility_rows", 0))
            for a in c["aliases"]:
                if a not in keep["aliases"]:
                    keep["aliases"].append(a)
    return records


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-wiki", action="store_true",
                    help="skip the Wikipedia pass (registries only)")
    args = ap.parse_args()

    seeded = json.loads(SEED.read_text())["places"]
    for p in seeded:
        p["already_seeded"] = True
        p["sources"] = [{"kind": "curated", "dataset": "sf_place_candidates.json",
                         "name": "Reviewed seed (2026-07-21)", "detail": p["slug"]}]
        p.setdefault("block_lots", [])
        p.setdefault("n_facility_rows", 0)
        p.setdefault("gross_sq_ft", 0)
        p.setdefault("acres", None)
        p.setdefault("campus_buildings", [])
        p["aliases"] = [a for a in build_aliases(p["name"], p.get("aliases"))]

    print("· City Facilities registry (nc68-ngbr) …", file=sys.stderr)
    fac_rows = load_city_facilities()
    fac = facilities_to_candidates(fac_rows)
    print(f"  {len(fac_rows)} rows → {len(fac)} place candidates", file=sys.stderr)

    print("· Rec & Park property registry (ib5c-xgwu) …", file=sys.stderr)
    rec = recpark_to_candidates()
    print(f"  → {len(rec)} park properties ≥0.25 acres", file=sys.stderr)

    wiki: list[dict] = []
    if not args.no_wiki:
        print("· Wikipedia category listings …", file=sys.stderr)
        known = {norm(c["name"]) for c in seeded + fac + rec}
        wiki = wiki_to_candidates(known)
        print(f"  → {len(wiki)} additional civic landmarks", file=sys.stderr)

    pool = merge([("curated", seeded), ("facilities", fac),
                  ("recpark", rec), ("wikipedia", wiki)])
    for c in pool:
        c.setdefault("already_seeded", False)
        c["aliases"] = [a for a in c["aliases"] if alias_is_safe(a)]

    # A candidate with no safe alias cannot be matched to a contract or a bond
    # item by any downstream step, so it would rank on structural signal alone.
    # Kept (permits join by APN, not name) but flagged.
    n_noalias = sum(1 for c in pool if not c["aliases"])

    OUT.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": "pipeline/scripts/enrich/expand_sf_place_pool.py",
        "_note": ("Stage-1 POOL, not the reviewed seed. Built from sourced "
                  "registries (nc68-ngbr, ib5c-xgwu) plus named Wikipedia "
                  "category listings; every candidate carries sources[]. "
                  "Ranking happens in score_sf_place_candidates.py."),
        "counts": {"total": len(pool), "already_seeded": sum(1 for c in pool if c["already_seeded"]),
                   "new": sum(1 for c in pool if not c["already_seeded"]),
                   "no_safe_alias": n_noalias},
        "places": pool,
    }, indent=1, ensure_ascii=False))

    by_src: dict[str, int] = defaultdict(int)
    by_fam: dict[str, int] = defaultdict(int)
    for c in pool:
        for s in c["sources"]:
            by_src[s["dataset"]] += 1
        by_fam[c["family"]] += 1
    print(f"\n{len(pool)} candidates "
          f"({sum(1 for c in pool if c['already_seeded'])} already seeded, "
          f"{sum(1 for c in pool if not c['already_seeded'])} new)")
    print("by source:", dict(sorted(by_src.items(), key=lambda x: -x[1])))
    print("by family:", dict(sorted(by_fam.items(), key=lambda x: -x[1])))
    print(f"{n_noalias} with no safe alias (APN/structural signal only)")
    print(f"-> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
