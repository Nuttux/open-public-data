#!/usr/bin/env python3
"""Stage 3 — promote ranked pool candidates into the REVIEWED seed.

The pool (expand_sf_place_pool.py) is deliberately over-inclusive and the
ranking (score_sf_place_candidates.py) sorts it, but sf_place_candidates.json is
a *reviewed* file: everything in it becomes a public fiche. This step is the
review, expressed as rules rather than taste, plus one explicit exclusion list
where a rule cannot decide.

  1. DEDUPE against the existing seed and within the promotion set. The pool
     merges on name, which cannot see that "Opera House" and "War Memorial Opera
     House" are one building. Here a containment match ("opera house" wholly
     inside "war memorial opera house") is accepted only when CORROBORATED by a
     shared parcel or a <250 m distance — name similarity alone would merge the
     Chinatown library into the Chinatown health centre.

  2. CAMPUS MERGE. Registry rows that share a parcel AND their leading
     significant token are one site: Yerba Buena Gardens' three entries, four
     Moscone halls, four Union Square entries, three Youth Guidance Center
     buildings. They are folded into the parent (the seeded place where one
     exists, else the shortest name), and their APNs/aliases go with them —
     otherwise the same parcel's permits get counted as four separate places.

  3. BACK-OF-HOUSE exclusion. A place fiche answers "what does the city spend
     here"; a reader must be able to stand in front of it. Bus-yard machine
     shops, enforcement headquarters and library support services are real
     facilities with real money that no member of the public can visit. These
     are listed explicitly, with a reason each, because no regex separates
     "Emergency Operations Center" (public interest, publishable) from
     "SSD Enforcement Headquarters" (back office) reliably.

Nothing is invented here: names, aliases, departments, coordinates and parcels
all come from the pool record, which carries its own sources[].

Usage: python pipeline/scripts/enrich/promote_sf_place_pool.py \
           [--min-score 7.0] [--apply]
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sf_place_match import norm  # noqa: E402

POOL = ROOT / "pipeline" / "seeds" / "sf_place_pool.json"
RANKED = ROOT / "pipeline" / "cache" / "ia_sf" / "sf_place_candidates_ranked.csv"
SEED = ROOT / "pipeline" / "seeds" / "sf_place_candidates.json"

DEDUPE_METRES = 250.0

# Rule 3 — back-of-house. Slug → why it is not a place a reader can stand at.
# Kept explicit and reasoned rather than pattern-matched: these are judgement
# calls and they should be auditable as such.
BACK_OF_HOUSE = {
    "office-and-sub-shops": "unnamed Muni shop building, not a destination",
    "maintenance-ways-structural-misc-facility": "Muni maintenance shop",
    "sustainable-streets-shops": "Muni works shop",
    "ssd-enforcement-headquarters": "Muni enforcement back office",
    "scott-nrv-facility": "Muni non-revenue vehicle depot",
    "central-shops-555-selby-st": "citywide fleet repair shop",
    "h-welton-flynn-div": "Muni operating division yard",
    "library-support-services": "library technical services warehouse",
    "treat-street-building": "Rec & Park administrative building",
    "se-dryer-building-800": "sludge dryer building inside the treatment plant",
    "community-health-network-headquarters": "DPH administrative office",
    "sfdph-central-administrative-office": "DPH administrative office",
    "hsa-medi-cal-headquarters": "Human Services back office",
    "17th-and-folsom-future-housing": "a future development site, not yet a place",
    "midtown-park-apartments": "city-owned housing, not a public facility",
    "building-33-treasure-island": "unnamed Treasure Island shell building",
    "1650-mission-st-building": "city office building (Planning/DBI counters only)",
    "1660-mission-st-building": "city office building",
    "1660-mission-parking": "staff parking for the office building",
    "101-hyde-st-building": "city office building",
    "25-van-ness-ave-building": "city office building",
    "1939-market-st": "city office building",
    "772-pacific-ave": "city-owned site, no public function",
    "one-south-van-ness": "city office building",
    "49-south-van-ness-ave-building": "city office building (permit centre counters)",
    "jake-sigg-stewardship-center-park-aid": "Rec & Park staff yard inside GGP",
    "union-square-office": "Rec & Park office inside Union Square",
    "central-subway-project-chinatown-station-site": (
        "construction staging site; the station itself is Chinatown–Rose Pak"),
}

# Rule 2 — campus parents that the name rules cannot infer, because the campus
# is written in shorthand the parent's name never uses ("Moscone West" does not
# contain "Moscone Center"; "Ygc Garage" does not contain "Juvenile Justice
# Center"). Still requires parcel/distance corroboration, which is what keeps
# Moscone REC Center — a different building 2.5 km away — out of the convention
# centre.
CAMPUS_PARENT = {
    "ygc": "juvenile-justice-center",
    "moscone": "moscone-center",
    "hamilton": "hamilton-rec-center",
}

# A campus whose registry rows are all fragments and none of which carries the
# campus's real name. Renamed before merging so the parent is the place a reader
# would name, not whichever fragment happened to rank highest.
CANONICAL_RENAME = {
    "yerba-buena-gardens-children-s-garden": ("yerba-buena-gardens", "Yerba Buena Gardens"),
}

# Duplicates of a seeded place that no name rule can see, because the two names
# share no containable phrase ("Presidio Division Bldg" / "Muni Presidio
# Division") and the seed carries no parcel to corroborate with.
DUPLICATE_OF = {
    "presidio-division-bldg": "muni-presidio-division",
    "southeast-waste-water-treatment-plant": "southeast-treatment-plant",
}

# Words that say what KIND of thing a place is; two places sharing only these
# are not the same site.
TYPE_TOKENS = {
    "park", "parks", "playground", "square", "plaza", "garden", "gardens",
    "library", "branch", "center", "centre", "station", "hall", "building",
    "bldg", "house", "yard", "pool", "field", "clubhouse", "fieldhouse",
    "museum", "theater", "theatre", "hospital", "clinic", "health", "public",
    "recreation", "rec", "community", "senior", "youth", "memorial", "fire",
    "police", "department", "facility", "garage", "parking", "division",
    "office", "headquarters", "shops", "north", "south", "east", "west",
    "upper", "lower", "main", "historic", "municipal", "muni", "city", "county",
}


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    R = 6_371_000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = p2 - p1
    dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def significant_tokens(name: str) -> list[str]:
    return [t for t in norm(name).split() if t not in {"the", "san", "francisco", "sf"}]


def significant_head(name: str) -> str:
    """First meaningful token of a name, for campus grouping."""
    toks = significant_tokens(name)
    return toks[0] if toks else ""


def same_site_name(a: dict, b: dict) -> str | None:
    """Do these two names denote one site? Returns "strong", "weak" or None.

    "strong" is decisive on its own; "weak" must additionally be corroborated by
    a shared parcel or proximity. A shared ONE-token prefix is never enough and
    was the bug this replaces: it merged the Mission Cultural Center into the
    Mission Branch Library, and the Civic Center Plaza garage into the Civic
    Center Courthouse.
    """
    if DUPLICATE_OF.get(a["slug"]) == b["slug"]:
        return "strong"

    ta, tb = set(significant_tokens(a["name"])), set(significant_tokens(b["name"]))
    # One name's words wholly inside the other's, in any order — the spellings
    # that differ by one filler word: "Eureka Valley/Harvey Milk Memorial
    # Library" vs "…Memorial BRANCH Library", "Tom Waddell Health Clinic" vs
    # "Tom Waddell URBAN Health Clinic". At three or more shared words this is
    # decisive by itself, which matters because the seed's coordinates are not
    # always the registry's (Tom Waddell has since moved premises, so distance
    # corroboration fails on a pair that is unmistakably one clinic).
    if ta and tb and (ta <= tb or tb <= ta):
        return "strong" if len(ta & tb) >= 3 else "weak"

    # Same parcel, same department, and a shared word that is not just a type
    # word: the Hayward clubhouse and the Hayward rec centre. The parcel IS the
    # corroboration. The department guard keeps Moscone North and Yerba Buena
    # Center for the Arts — one parcel, one department, genuinely two venues —
    # apart, since they share no name word at all.
    shared_apn = set(a.get("block_lots") or []) & set(b.get("block_lots") or [])
    if shared_apn and a.get("owning_dept_code") == b.get("owning_dept_code"):
        if (ta & tb) - TYPE_TOKENS:
            return "strong"

    if contained(a["name"], b["name"]):
        return "weak"
    target = CAMPUS_PARENT.get(significant_head(a["name"]))
    if target and b["slug"] == target:
        return "weak"
    return None


def matches_site(a: dict, b: dict) -> bool:
    m = same_site_name(a, b)
    return m == "strong" or (m == "weak" and corroborated(a, b))


def contained(a: str, b: str) -> bool:
    """One normalized name sits whole inside the other, on word boundaries."""
    na, nb = norm(a), norm(b)
    if not na or not nb or na == nb:
        return na == nb
    short, long_ = (na, nb) if len(na) < len(nb) else (nb, na)
    if len(short.split()) < 2:
        return False          # a single token is not enough to claim identity
    return bool(re.search(rf"\b{re.escape(short)}\b", long_))


def coords(p: dict) -> tuple[float, float] | None:
    if p.get("lat") is None or p.get("lon") is None:
        return None
    return float(p["lat"]), float(p["lon"])


def corroborated(a: dict, b: dict) -> bool:
    """Same parcel, or close enough on the ground to be the same site."""
    if set(a.get("block_lots") or []) & set(b.get("block_lots") or []):
        return True
    ca, cb = coords(a), coords(b)
    return bool(ca and cb and haversine_m(ca, cb) <= DEDUPE_METRES)


def absorb(parent: dict, child: dict) -> None:
    parent["block_lots"] = sorted(set(parent.get("block_lots") or [])
                                  | set(child.get("block_lots") or []))
    for a in child.get("aliases") or []:
        if a not in parent.get("aliases", []):
            parent.setdefault("aliases", []).append(a)
    parent.setdefault("campus_buildings", [])
    if child["name"] not in parent["campus_buildings"]:
        parent["campus_buildings"].append(child["name"])
    for k in ("address", "lat", "lon", "wiki", "owning_dept", "owning_dept_code"):
        if not parent.get(k) and child.get(k):
            parent[k] = child[k]
    parent["gross_sq_ft"] = (parent.get("gross_sq_ft") or 0) + (child.get("gross_sq_ft") or 0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-score", type=float, default=7.0)
    ap.add_argument("--apply", action="store_true",
                    help="write sf_place_candidates.json (default: dry run)")
    args = ap.parse_args()

    pool = {p["slug"]: p for p in json.loads(POOL.read_text())["places"]}
    ranked = [r for r in csv.DictReader(RANKED.open())
              if float(r["score"]) >= args.min_score and r["status"] == "new"]
    seed_doc = json.loads(SEED.read_text())
    seeded = seed_doc["places"]
    seeded_by_slug = {p["slug"]: p for p in seeded}

    dropped: list[tuple[str, str]] = []
    merged: list[tuple[str, str]] = []
    promote: list[dict] = []

    for r in ranked:
        c = pool.get(r["slug"])
        if c is None:
            continue

        if c["slug"] in BACK_OF_HOUSE:
            dropped.append((c["name"], "back-of-house: " + BACK_OF_HOUSE[c["slug"]]))
            continue
        # A place fiche asserts the city operates this site. Only the two city
        # registries establish that; a Wikipedia category does not. Baker Beach
        # is federal GGNRA land whose only "money" was a PUC green-streets
        # project named after it, and nothing in the pool distinguishes that
        # from a real city asset.
        if not any(s["kind"] == "registry" for s in c.get("sources", [])):
            dropped.append((c["name"], "not in a city facility registry — operator unverified"))
            continue

        c["_score"] = float(r["score"])
        if c["slug"] in CANONICAL_RENAME:
            c["slug"], c["name"] = CANONICAL_RENAME[c["slug"]]

        # ── rule 1/2 against the existing seed, then within the promotion set ──
        hit = next((s for s in seeded if matches_site(c, s)), None)
        if hit is not None:
            absorb(hit, c)
            merged.append((c["name"], "→ seeded " + hit["name"]))
            continue

        hit = next((q for q in promote if matches_site(c, q)), None)
        if hit is not None:
            absorb(hit, c)
            merged.append((c["name"], "→ new " + hit["name"]))
            continue

        promote.append(c)

    # ── shape the promoted records like the reviewed seed ──
    # The pool classifies from the NAME, which mislabels a place whose name
    # carries another type's word: "Park Station" is a police station, not a
    # park. The registry's owning department is the better evidence and is used
    # to correct it.
    DEPT_KIND = {
        "POL": ("Police station", "civic"),
        "FIR": ("Fire station", "fire"),
        "LIB": ("Library", "library"),
        "DPH": ("Health facility", "health"),
    }

    new_places = []
    for c in promote:
        kind, family = c.get("kind") or "Civic building", c.get("family") or "civic"
        fix = DEPT_KIND.get(c.get("owning_dept_code") or "")
        if fix and family != fix[1]:
            kind, family = fix
        rec = {
            "slug": c["slug"],
            "name": c["name"],
            "kind": kind,
            "family": family,
            "aliases": c.get("aliases") or [c["name"]],
            "owning_dept": c.get("owning_dept") or "City Administrator",
            "owning_dept_code": c.get("owning_dept_code") or "ADM",
            "address": c.get("address") or "",
            "lat": c.get("lat"),
            "lon": c.get("lon"),
        }
        if c.get("wiki"):
            rec["wiki"] = c["wiki"]
        if c.get("block_lots"):
            rec["block_lots"] = c["block_lots"]
        if c.get("campus_buildings"):
            rec["campus_buildings"] = c["campus_buildings"]
        rec["promoted_from_pool"] = {
            "score": c["_score"],
            "sources": [s["dataset"] for s in c.get("sources", [])],
        }
        new_places.append(rec)

    print(f"ranked ≥{args.min_score}: {len(ranked)} new candidates")
    print(f"  dropped        {len(dropped)}")
    print(f"  merged away    {len(merged)}")
    print(f"  PROMOTED       {len(new_places)}")
    print(f"  seed total     {len(seeded)} → {len(seeded) + len(new_places)}")
    print("\n-- dropped --")
    for n, why in dropped:
        print(f"   {n[:44]:<46} {why}")
    print("\n-- merged --")
    for n, why in merged:
        print(f"   {n[:44]:<46} {why}")
    print("\n-- promoted --")
    for p in sorted(new_places, key=lambda x: (x["family"], x["name"])):
        print(f"   {p['family'][:7]:<8} {p['owning_dept_code']:<4} {p['slug'][:40]:<42} {p['name'][:40]}")

    if args.apply:
        seed_doc["places"] = seeded + new_places
        SEED.write_text(json.dumps(seed_doc, indent=1, ensure_ascii=False))
        print(f"\nWROTE {SEED} ({len(seed_doc['places'])} places)")
    else:
        print("\n(dry run — pass --apply to write the seed)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
