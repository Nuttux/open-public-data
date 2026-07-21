#!/usr/bin/env python3
"""Build the place↔City-Facilities crosswalk seed (Block 6A, docs/us/block-studies/6-lieux.md).

Matches each seed place (sf_place_candidates.json) to one or more rows in the
City Facilities registry (stg_us_sf_city_facilities) — the structured-location
backbone. A place is often a CAMPUS (Kezar = stadium + pavilion + 2 fieldhouses
+ maintenance; ZSFG = 8+ buildings), so the crosswalk is one-to-many.

Matching is deliberately conservative and EVIDENCE-CARRYING, so the output is a
reviewable seed, not a black box. A place↔facility link requires a PHRASE match,
never a shared generic token ("Union Square" must not pull in "St Mary's Square
Bathrooms"):

  - name  : a place alias, normalized, appears as a whole-phrase (word-boundary)
    substring of the facility common_name, OR the facility name is a phrase-
    substring of an alias. Short aliases (<6 chars) qualify only as all-caps
    acronyms (SFGH, ZSFG) — same guard as the contract matcher. This captures
    campuses cleanly (every "Kezar …" / "ZSFGH …" facility) without generic-
    token bleed. `geo` distance is recorded for audit only, never a link reason.

Every candidate row carries match_evidence + distance so a human can audit. Output
is written as a dbt seed CSV (reviewed, then `dbt seed`). Nothing here asserts
money — it only anchors identity. Coverage is printed for triage.

Usage: python pipeline/scripts/enrich/build_sf_place_facilities.py
"""

from __future__ import annotations

import csv
import json
import math
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "sf_place_candidates.json"
OUT = ROOT / "pipeline" / "seeds" / "countries" / "us" / "seed_us_sf_place_facilities.csv"
STG = "open-data-france-484717.dbt_us_dev_local_staging.stg_us_sf_city_facilities"

# Department-affinity guard: a generic neighborhood alias ("Glen Park") will
# phrase-match facilities that merely SIT in that neighborhood but belong to a
# different institution — "Glen Park Elementary" (SFUSD), "Glen Park Substation"
# (MTA), "Glen Park Branch Library" (a place of its own). Require the matched
# facility's using-department to be compatible with the place's owning
# department. Codes with no strict pattern (ADM — civic buildings span
# GSA/Mayor/Court/Police) accept any non-school department. School District
# facilities are NEVER one of our civic places' own buildings — always excluded.
DEPT_PATTERNS = {
    "REC": ["recreation and parks"],
    "LIB": ["public library"],
    "DPH": ["public health"],
    "PRT": ["port"],
    "MTA": ["municipal transportation"],
    "PUC": ["public utilities"],
    "FIR": ["fire department"],
    "WAR": ["war memorial"],
    "AAM": ["asian art"],
    "FAM": ["fine arts"],
    # ADM: no strict pattern — allow any non-school department.
}
SCHOOL_MARK = "school district"


def dept_compatible(owning_code: str, dept_name: str) -> bool:
    d = (dept_name or "").lower()
    if SCHOOL_MARK in d:
        return False
    pats = DEPT_PATTERNS.get(owning_code)
    if not pats:                       # ADM / unmapped: any non-school dept
        return True
    return any(p in d for p in pats)


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())).strip()


def alias_ok(a: str) -> bool:
    """A usable alias: ≥6 chars, or a ≥4-char all-caps acronym (SFGH, ZSFG)."""
    return len(a) >= 6 or (len(a) >= 4 and a.isupper() and a.isalpha())


def phrase_match(alias_norm: str, cname_norm: str, is_acronym: bool) -> bool:
    """Whole-phrase, word-boundary match in either direction. Acronym aliases
    (SFGH, ZSFG) match as a word-PREFIX, since facilities append a letter
    ("ZSFGH - Building 3") or the campus name — a leading word boundary alone
    is safe for a 4+ char acronym and would otherwise miss the whole campus."""
    if not alias_norm or not cname_norm:
        return False
    if is_acronym:
        return bool(re.search(rf"\b{re.escape(alias_norm)}", cname_norm))
    if re.search(rf"\b{re.escape(alias_norm)}\b", cname_norm):
        return True
    # facility name fully contained in the alias (e.g. cname "Coit Tower"
    # inside alias "Coit Tower Pioneer Park") — only when cname is specific.
    if len(cname_norm) >= 6 and re.search(rf"\b{re.escape(cname_norm)}\b", alias_norm):
        return True
    return False


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    if None in (lat1, lon1, lat2, lon2):
        return None
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def load_facilities() -> list[dict]:
    q = (f"SELECT facility_id, common_name, address, block_lot, apn_block, apn_lot, "
         f"is_city_owned, gross_sq_ft, department_name, latitude, longitude "
         f"FROM `{STG}` WHERE common_name IS NOT NULL")
    out = subprocess.run(
        ["bq", "query", "--use_legacy_sql=false", "--format=json", "--max_rows=5000", q],
        capture_output=True, text=True, check=True).stdout
    rows = json.loads(out)
    for r in rows:
        r["latitude"] = float(r["latitude"]) if r.get("latitude") else None
        r["longitude"] = float(r["longitude"]) if r.get("longitude") else None
        r["facility_id"] = int(r["facility_id"]) if r.get("facility_id") else None
        r["gross_sq_ft"] = int(r["gross_sq_ft"]) if r.get("gross_sq_ft") else None
    return rows


def main() -> int:
    seed = json.loads(SEED.read_text())["places"]
    facs = load_facilities()

    rows = []
    cov = {"name": 0, "none": 0}
    for pl in seed:
        aliases = [a for a in [pl["name"], *pl.get("aliases", [])] if alias_ok(a)]
        # (original alias, normalized, is_acronym)
        alias_norms = [(a, norm(a), a.isupper() and a.isalpha() and len(a) < 6) for a in aliases]

        owning = pl["owning_dept_code"]
        hits = []
        for f in facs:
            if not dept_compatible(owning, f["department_name"]):
                continue
            cn = norm(f["common_name"])
            matched = next(((a, an) for (a, an, ac) in alias_norms if phrase_match(an, cn, ac)), None)
            if matched:
                dist = haversine_m(pl.get("lat"), pl.get("lon"), f["latitude"], f["longitude"])
                hits.append((f, matched[0], dist))

        if not hits:
            cov["none"] += 1
            continue
        cov["name"] += 1

        # primary = the most NAME-LIKE building (the eponymous one), not merely
        # the nearest — "Kezar Stadium" beats "Kezar Stadium Maintenance
        # Facility". Score: fewest facility-name tokens beyond the matched
        # alias, then largest floor area, then nearest to the seed point.
        alias_all_tokens = set()
        for a in aliases:
            alias_all_tokens |= set(norm(a).split())

        def primary_score(h):
            f, _ev, dist = h
            extra = len(set(norm(f["common_name"]).split()) - alias_all_tokens)
            sqft = f["gross_sq_ft"] or 0
            return (extra, -sqft, dist if dist is not None else 1e9)

        primary_id = min(hits, key=primary_score)[0]["facility_id"]

        for f, ev_alias, dist in hits:
            rows.append({
                "place_slug": pl["slug"],
                "facility_id": f["facility_id"],
                "common_name": f["common_name"],
                "address": f["address"] or "",
                "block_lot": f["block_lot"] or "",
                "apn_block": f["apn_block"] or "",
                "apn_lot": f["apn_lot"] or "",
                "is_city_owned": str(f["is_city_owned"]).lower(),
                "gross_sq_ft": f["gross_sq_ft"] if f["gross_sq_ft"] is not None else "",
                "department_name": f["department_name"] or "",
                "is_primary": str(f["facility_id"] == primary_id).lower(),
                "match_method": "name",
                "match_evidence": ev_alias,
                "distance_m": round(dist) if dist is not None else "",
            })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    cols = ["place_slug", "facility_id", "common_name", "address", "block_lot",
            "apn_block", "apn_lot", "is_city_owned", "gross_sq_ft",
            "department_name", "is_primary", "match_method", "match_evidence", "distance_m"]
    with OUT.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r["place_slug"], r["is_primary"] == "false")))

    n_places = len({r["place_slug"] for r in rows})
    print(f"Wrote {len(rows)} crosswalk rows for {n_places}/{len(seed)} places → {OUT.name}")
    print(f"  matched (name-anchored): {cov['name']}   unmatched: {cov['none']}")
    # triage: which places got nothing (need a manual row or an alias fix)
    matched = {r["place_slug"] for r in rows}
    missing = [pl["slug"] for pl in seed if pl["slug"] not in matched]
    if missing:
        print("  no facility match (review):", ", ".join(missing))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
