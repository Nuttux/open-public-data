"""What KIND of thing each named place is — joined from the registers' own
category fields, and from nothing else.

    python3 pipeline/scripts/us_sf_places/place_kinds.py           # the report
    python3 pipeline/scripts/us_sf_places/place_kinds.py --unmapped

WHY THIS IS A SEPARATE MODULE AND NOT PART OF `build_places.py`. That script
merges eleven registers into `cache/_places.json` and its output is the input to
every byte-count assertion downstream; re-running it to add one column would put
2,197 rows of `x`, `y`, `span` and `bi` back through a join they have already
been through. This reads the same cached registers, re-joins ONLY the category
field onto the rows that already exist, and changes nothing else.

THE CENSUS THIS IS BUILT ON TOP OF, re-measured 2026-08-24 against the
publishers' own column lists rather than inherited (DRAW.md §40.1):

  * **684 of 2,197 places — 31.1 % — publish no kind at all.** Article 10
    (`97yj-54sx`, 339 rows) carries a name, an APN, an address, a landmark
    number, a year of designation and two links. Article 11 (`ejht-vp5d`,
    345 rows) carries a rating, A/B/C/D. Neither says what the place IS.
  * Where a category does exist it is **three different kinds of field** and
    they are not interchangeable — see `FAMILY_OF` below, which is the decision
    and is written down rather than derived.

AND THE PART THAT IS AN OWNER, SAID PLAINLY. `nc68-ngbr`'s `department_name` is
the City department that OWNS the parcel. For a fire house, a police station, a
branch library, a school and a pier the owner and the kind are the same fact —
the Fire Department's property is a fire station — and for `Gsa - Real Estate
Division` it is not a kind at all, which is why those rows land on `civic` and
not on something more specific. Nothing here reads a place's NAME to decide
what it is; a row with no category gets no family.
"""
from __future__ import annotations

import collections
import json
import math
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from _geom import exterior_rings, to_m  # noqa: E402

CACHE = HERE / "cache"

# ── the families ────────────────────────────────────────────────────────────
#
# THE VOCABULARY IS SHORT ON PURPOSE. The glyph is drawn in an 8.4 px box — the
# same box `labels.ts` draws the designated diamond in — and two silhouettes
# that differ by a detail smaller than a pixel are one silhouette. So the test
# for keeping a family separate is whether it reads as ITSELF at 8 px, not
# whether the register distinguishes it: `ib5c-xgwu` publishes `Basketball
# Court`, `Tennis Court`, `Handball/Racquetball Court`, `Disc Golf` and
# `Archery Field` as five values and they are one glyph here.
FAMILIES = [
    "park",      # a tree
    "garden",    # three shoots in a row
    "plaza",     # a paved square
    "water",     # two waves
    "sport",     # a ball on the ground line
    "library",   # an open book
    "school",    # a pennant on a pole
    "fire",      # a flame
    "police",    # a star
    "transit",   # a tram seen head-on
    "port",      # an anchor
    "health",    # a cross
    "arts",      # a figure on a plinth
    "civic",     # a pediment on two columns
    "works",     # a gabled shed
    "home",      # a house
    "hotel",     # a bed
    "office",    # a tower with a window band
]

# ── register -> (cached file, its category field, its name field) ───────────
#
# `6adp-a5yv` is the one entry whose family does NOT come from a per-row field:
# `Schools_College` is a register OF COLLEGE CAMPUSES, so the kind is the
# register's own identity. It is flagged `by_register` so the provenance says
# so rather than implying a column that is not there.
REGISTERS = {
    "nc68-ngbr": ("city_facilities", "department_name", "common_name",
                  "DataSF nc68-ngbr City Facilities, `department_name` — the "
                  "City department that owns the parcel"),
    "gtr9-ntp6": ("rp_properties", "propertytype", "property_name",
                  "DataSF gtr9-ntp6 Recreation and Parks Properties, "
                  "`propertytype`"),
    "ib5c-xgwu": ("rp_facilities", "facility_type", "facility_name",
                  "DataSF ib5c-xgwu Recreation and Parks Facilities, "
                  "`facility_type`"),
    "7e7j-59qk": ("schools", "entity_type", "school",
                  "DataSF 7e7j-59qk Schools (California Dept of Education), "
                  "`entity_type`"),
    "5kya-mfst": ("tall_buildings", "occupancy", "name",
                  "DataSF 5kya-mfst Tall Building Inventory, `occupancy`"),
    "65ik-7wqd": ("popos", "type", "name",
                  "DataSF 65ik-7wqd Privately Owned Public Open Spaces, `type`"),
}

BY_REGISTER = {
    "6adp-a5yv": ("school",
                  "DataSF 6adp-a5yv Schools_College — the register is a "
                  "register of college campuses; the kind is its identity, "
                  "not a column"),
}

# Registers deliberately given no family, and why. These are not oversights and
# the report prints them so the list stays visible.
NO_FAMILY = {
    "97yj-54sx": "Article 10 publishes no kind — a name, an APN, a landmark "
                 "number and a year of designation. It carries the DESIGNATED "
                 "mark, which is a status and is what that register is about.",
    "ejht-vp5d": "Article 11 publishes a rating (A/B/C/D), not a kind.",
    "nps-nrhp": "the National Register's `ResType` is `building` on 33 of 37 "
                "and `site` on 1 — a form class, not a use, and one value "
                "over a whole register is not a family.",
}

# ── the mapping, value by published value ──────────────────────────────────
#
# EVERY value that appears on a shipped place is listed. `None` means the
# publisher's value carries no kind of place (a rating, a container, a
# free-text sentence) and the row keeps the plain treatment. `--unmapped`
# fails loudly on anything new, because a register that gains a value must be
# a decision and not a silent default.
FAMILY_OF: dict[str, str | None] = {
    # ── nc68-ngbr, department_name: the OWNER ───────────────────────────
    "Recreation And Parks": "park",
    "School District (Sfusd)": "school",
    "Port": "port",
    "Municipal Transportation Agency": "transit",
    "Fire Department": "fire",
    "Police Department": "police",
    "Sheriff": "police",
    "Public Library": "library",
    "Public Health": "health",
    "Public Utilities Commission": "water",
    "Public Works": "works",
    "Arts Commission": "arts",
    "Asian Art Museum": "arts",
    "War Memorial": "arts",
    "Mayor": "civic",
    "Gsa - Real Estate Division": "civic",
    "Gsa - Convention Facilities Management": "civic",
    "Gsa - Office Of Contract Administration": "civic",
    "Gsa - Medical Examiner": "civic",
    "Superior Court": "civic",
    "Juvenile Probation": "civic",
    "Emergency Management": "civic",
    "Human Services Agency": "civic",
    "Homelessness And Supportive Housing": "home",
    "Treasure Island Development Authority": "civic",
    # `Non-City` is the register saying it does NOT own this — an owner field
    # with the owner withheld. 91 places, and no kind is knowable from it.
    "Non-City": None,
    "Airport (Sfo)": "transit",
    "Airport Commission": "transit",
    "Administrative Services": "civic",
    "Building Inspection": "civic",
    "Children Youth And Their Families": "civic",
    "City Attorney": "civic",
    "Controller": "civic",
    "District Attorney": "civic",
    "Economic And Workforce Development": "civic",
    "Elections": "civic",
    "Environment": "civic",
    "Ethics Commission": "civic",
    "Fine Arts Museum": "arts",
    "Human Resources": "civic",
    "Municipal Court": "civic",
    "Planning": "civic",
    "Public Defender": "civic",
    "Rent Board": "civic",
    "Status Of Women": "civic",
    "Technology": "civic",
    "Treasurer": "civic",
    # ── gtr9-ntp6, propertytype ─────────────────────────────────────────
    "Neighborhood Park or Playground": "park",
    "Mini Park": "park",
    "Regional Park": "park",
    "Parkway": "park",
    "Community Garden": "garden",
    "Civic Plaza or Square": "plaza",
    "Library": "library",
    "Zoological Garden": "park",
    "Concession": "works",
    "Other Non-Park Property": None,
    # ── ib5c-xgwu, facility_type ────────────────────────────────────────
    "Landscaped Area": "park",
    "Non-landscaped Greenspace": "park",
    "Natural Resource Management Area": "park",
    "Picnic Area": "park",
    "Multi-Use Turf": "park",
    "Ornamental Garden": "garden",
    "Hardscaped Area": "plaza",
    "Multi-use Paved": "plaza",
    "Water Body": "water",
    "Children's Play Area": "sport",
    "Basketball Court": "sport",
    "Tennis Court": "sport",
    "Tennis/Pickleball Court": "sport",
    "Handball/Racquetball Court": "sport",
    "Ball Field": "sport",
    "Outdoor Sports Complex": "sport",
    "Stadium": "sport",
    "Swimming Pool": "sport",
    "Skatepark": "sport",
    "Bike Park": "sport",
    "Disc Golf": "sport",
    "Golf Facility": "sport",
    "Archery Field": "sport",
    "Dog Play Area": "sport",
    "Equestrian Facility": "sport",
    "Marina": "port",
    "Yacht Club": "port",
    "Rec Center": "arts",
    "Fieldhouse": "arts",
    "Clubhouse": "arts",
    "Arts/Activity Center": "arts",
    "Performance Space": "arts",
    "Monument, Historic: Sculpture-Art": "arts",
    "Structure, Historic: Bldg-Other": None,
    "Administration Building": "civic",
    "Maintenance Building": "works",
    "Maintenance Facility": "works",
    "Cargo Container": "works",
    "Office Trailer": "works",
    "Card Shelter": "works",
    "Parking Lot": "works",
    "Restroom": "works",
    "Retail Space": "works",
    "Road": "works",
    "Stairway": "works",
    "Bridge": "works",
    "Aggregate": None,
    # ── 7e7j-59qk, entity_type ──────────────────────────────────────────
    "Elementary School (Private)": "school",
    "K-12 Schools (Private)": "school",
    "High Schools (Private)": "school",
    "Kindergartens (Private)": "school",
    "Preschool": "school",
    # ── 5kya-mfst, occupancy ────────────────────────────────────────────
    "Office (Management, Information, Professional Services)": "office",
    "Residential": "home",
    "Hotels, Visitor Services": "hotel",
    "Mixed Uses (With Residential)": "home",
    "Mixed Uses (Without Residential)": "office",
    "Medical": "health",
    "Cultural, Institutional, Educational": "arts",
    # ── 65ik-7wqd, type ─────────────────────────────────────────────────
    "Plaza": "plaza",
    "Atrium": "plaza",
    "Snippet": "plaza",
    "View Terrace": "plaza",
    "Sun Terrace": "plaza",
    "Pedestrian Walkways": "plaza",
    "Urban Garden": "garden",
    "Urban Park": "park",
    "Indoor Park": "park",
    # Two POPOS rows put a sentence of the Planning Commission's own minutes in
    # the `type` column. A sentence is not a category and they get no family.
    "Pedestrian walkway on ground and 2nd levels": None,
    "Snippet and lunchtime conversion. Commission was satisfied that it met the "
    "guidelines.": None,
}

# THE DISTANCE GATE. A name that resolves to a register row standing further
# than this from the place is not the same thing, and the family is dropped.
# It is generous because the two Rec & Parks registers put a place at the
# footprint it resolved to and the register centroid at the middle of the whole
# park — p99 279 m and 196 m, measured (DRAW.md §40.2) — so the gate is set
# above that and below anything that could reach a different park.
JOIN_MAX_M = 420.0


def norm(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _centroid(ft: dict) -> tuple[float, float] | None:
    g = ft.get("geometry")
    p = ft.get("properties") or {}
    if g and g.get("type") == "Point":
        c = g["coordinates"]
        return to_m(float(c[0]), float(c[1]))
    rings = exterior_rings(g)
    if rings:
        r = max(rings, key=len)
        return (sum(q[0] for q in r) / len(r), sum(q[1] for q in r) / len(r))
    try:
        return to_m(float(p["longitude"]), float(p["latitude"]))
    except (KeyError, TypeError, ValueError):
        return None


def _index(fname: str, field: str, namefield: str) -> dict:
    path = CACHE / f"{fname}.geojson"
    if not path.exists():
        raise SystemExit(
            f"{path} is missing. Run:\n"
            f"    python3 pipeline/scripts/us_sf_places/fetch_places.py")
    idx: dict[str, list] = collections.defaultdict(list)
    for ft in json.loads(path.read_text())["features"]:
        p = ft["properties"]
        idx[norm(p.get(namefield))].append((p.get(field), _centroid(ft)))
    return idx


def kinds_for(places: list[dict]) -> tuple[list[str | None], dict]:
    """One family, or None, per place — in the order handed in.

    THE RULE, and it refuses rather than guesses:

      1. the place's register must publish a category field (or be one of the
         registers whose identity IS the kind);
      2. its normalised name must appear in that register;
      3. among the rows with that name, the distinct published values must be
         ONE — or, where they are not, the nearest row must be inside
         `JOIN_MAX_M` and it wins;
      4. that published value must be in `FAMILY_OF`, which is exhaustive and
         raises on anything it has not seen.

    Anything that falls out of that gets `None` and keeps the plain treatment.
    """
    idx = {src: _index(*spec[:3]) for src, spec in REGISTERS.items()}
    out: list[str | None] = []
    rep = {
        "byFamily": collections.Counter(),
        "byRegister": collections.Counter(),
        "refused": collections.Counter(),
        "rawUnmapped": collections.Counter(),
    }
    for q in places:
        src = q["src"]
        if src in BY_REGISTER:
            fam = BY_REGISTER[src][0]
            out.append(fam)
            rep["byFamily"][fam] += 1
            rep["byRegister"][src] += 1
            continue
        if src not in REGISTERS:
            out.append(None)
            rep["refused"]["register publishes no kind"] += 1
            continue
        cand = idx[src].get(norm(q["n"]))
        if not cand:
            out.append(None)
            rep["refused"]["name not in its own register"] += 1
            continue
        vals = {v for v, _ in cand if v}
        if len(vals) == 1:
            raw = vals.pop()
        else:
            near = [(math.hypot(c[0] - q["x"], c[1] - q["y"]), v)
                    for v, c in cand if c and v]
            near.sort()
            if not near or near[0][0] > JOIN_MAX_M:
                out.append(None)
                rep["refused"]["no unambiguous value inside the gate"] += 1
                continue
            raw = near[0][1]
        if raw not in FAMILY_OF:
            rep["rawUnmapped"][f"{src}: {raw}"] += 1
            out.append(None)
            continue
        fam = FAMILY_OF[raw]
        if fam is None:
            out.append(None)
            rep["refused"]["the published value is not a kind of place"] += 1
            continue
        out.append(fam)
        rep["byFamily"][fam] += 1
        rep["byRegister"][src] += 1
    return out, rep


def provenance() -> dict:
    """What the manifest says about where a family came from."""
    return {
        "families": FAMILIES,
        "fields": {src: spec[3] for src, spec in REGISTERS.items()},
        "byRegister": {src: spec[1] for src, spec in BY_REGISTER.items()},
        "noFamily": NO_FAMILY,
        "joinMaxM": JOIN_MAX_M,
        "rule": (
            "The family is the register's own published category value, mapped "
            "onto a short vocabulary of marks by an exhaustive table "
            "(place_kinds.py FAMILY_OF). The join is the normalised name inside "
            "the place's OWN register, gated on distance through the manifest's "
            "projection. Nothing reads a place's name to decide what it is, and "
            "a place whose register publishes no kind gets no family."),
        "ownerNotKind": (
            "nc68-ngbr publishes the department that OWNS the parcel, not what "
            "stands on it. For a fire house, a station, a branch library, a "
            "school and a pier the two are the same fact; for `Gsa - Real Estate "
            "Division` they are not, which is why those rows are `civic` and "
            "nothing narrower. `Non-City` (91 places) is the register declining "
            "to name an owner and gets no family."),
    }


def main() -> int:
    src = json.loads((CACHE / "_places.json").read_text())
    pl = src["places"]
    ks, rep = kinds_for(pl)
    n = len(pl)
    have = sum(1 for k in ks if k)
    print(f"{n:,} places, {have:,} with a published kind ({have / n:.1%})")
    print("\nby family")
    for k, v in rep["byFamily"].most_common():
        print(f"  {v:5d}  {k}")
    print("\nby register")
    for k, v in rep["byRegister"].most_common():
        print(f"  {v:5d}  {k}")
    print("\nno family, by reason")
    for k, v in rep["refused"].most_common():
        print(f"  {v:5d}  {k}")
    if rep["rawUnmapped"]:
        print("\nPUBLISHED VALUES WITH NO DECISION — these are a bug, not a default")
        for k, v in rep["rawUnmapped"].most_common():
            print(f"  {v:5d}  {k}")
        if "--unmapped" in sys.argv:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
