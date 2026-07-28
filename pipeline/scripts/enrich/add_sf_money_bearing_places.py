#!/usr/bin/env python3
"""Seed the money-bearing places the permit-inflated ranking missed (2026-07-28).

With permits removed from the money signal, 22 pool candidates that carry real
public money turn out never to have been seeded — they were outranked by places
whose "money" was somebody else's building permit. This adds the ones that are
genuinely civic places.

Not everything money-bearing belongs on the site, so three exclusions apply, each
for a stated reason rather than by taste:

  back-of-house : 1939 Market St, 772 Pacific Ave, Central Shops, the DPW yard,
                  Midtown Park Apartments, Pier 1's administrative offices. Real
                  money, no public function — the same rule that kept Muni's
                  machine shops out of the first promotion.
  duplicate     : "Opera House" is the War Memorial Opera House, already seeded.
  not the city's: Baker Beach is federal GGNRA land; the Tenderloin Museum is a
                  private nonprofit. A contract naming a place is not proof the
                  City operates it.

Crane Cove Park IS added despite failing the earlier registry test: the Port
holds a $12.9M contract named for it ("PRT CT2812 Crane Cove Park"), and a city
construction contract in the place's own name is better evidence of city
operation than absence from a facilities registry snapshot.

Usage: python pipeline/scripts/enrich/add_sf_money_bearing_places.py [--apply]
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "sf_place_candidates.json"
POOL = ROOT / "pipeline" / "seeds" / "sf_place_pool.json"
RANKED = ROOT / "pipeline" / "cache" / "ia_sf" / "sf_place_candidates_ranked.csv"

ADD = [
    "crane-cove-park", "pier-45", "pier-96", "heron-s-head-park", "juri-commons",
    "noe-valley-town-square", "palace-of-fine-arts", "sharp-park",
    "hallidie-plaza", "corona-heights-park", "park-branch-library",
    "lincoln-park", "balboa-park",
]

EXCLUDE_REASON = {
    "1939-market-st": "back-of-house: city office building",
    "772-pacific-ave": "back-of-house: city-owned site, no public function",
    "central-shops-555-selby-st": "back-of-house: citywide fleet repair shop",
    "dpw-yard": "back-of-house: public works yard",
    "midtown-park-apartments": "back-of-house: city-owned housing",
    "pier-1-ports-administrative-offices": "back-of-house: Port administrative offices",
    "opera-house": "duplicate of the seeded War Memorial Opera House",
    "baker-beach": "federal GGNRA land, not city-operated",
    "tenderloin-museum": "private nonprofit museum, not city-operated",
}

DEPT_FALLBACK = {"port": ("Port of San Francisco", "PRT"),
                 "park": ("Recreation and Park Department", "REC")}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    doc = json.loads(SEED.read_text())
    have = {p["slug"] for p in doc["places"]}
    pool = {p["slug"]: p for p in json.loads(POOL.read_text())["places"]}
    ranked = {r["slug"]: r for r in csv.DictReader(RANKED.open())}

    added = []
    for slug in ADD:
        if slug in have:
            print(f"  skip (already seeded): {slug}")
            continue
        c = pool.get(slug)
        if not c:
            print(f"  SKIP (not in pool): {slug}")
            continue
        dept, code = c.get("owning_dept"), c.get("owning_dept_code")
        if not code:
            dept, code = DEPT_FALLBACK.get(c.get("family") or "", ("City Administrator", "ADM"))
        rec = {
            "slug": slug,
            "name": c["name"],
            "kind": c.get("kind") or "Civic building",
            "family": c.get("family") or "civic",
            "aliases": c.get("aliases") or [c["name"]],
            "owning_dept": dept,
            "owning_dept_code": code,
            "address": c.get("address") or "",
            "lat": c.get("lat"),
            "lon": c.get("lon"),
        }
        if c.get("wiki"):
            rec["wiki"] = c["wiki"]
        if c.get("block_lots"):
            rec["block_lots"] = c["block_lots"]
        r = ranked.get(slug)
        rec["promoted_from_pool"] = {
            "score": float(r["score"]) if r else None,
            "public_money_usd": int(r["max_ledger_usd"]) if r else None,
            "sources": [s["dataset"] for s in c.get("sources", [])],
        }
        doc["places"].append(rec)
        added.append((slug, rec["family"], rec["owning_dept_code"],
                      int(r["max_ledger_usd"]) if r else 0))

    print(f"\nadding {len(added)} money-bearing places:")
    for slug, fam, code, usd in added:
        print(f"   {fam[:7]:<8} {code:<4} {slug:<40} ${usd:,}")
    print("\nexcluded, with reason:")
    for slug, why in sorted(EXCLUDE_REASON.items()):
        print(f"   {slug:<40} {why}")

    if args.apply and added:
        SEED.write_text(json.dumps(doc, indent=1, ensure_ascii=False))
        print(f"\nWROTE {SEED} ({len(doc['places'])} places)")
    elif not args.apply:
        print("\n(dry run — pass --apply)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
