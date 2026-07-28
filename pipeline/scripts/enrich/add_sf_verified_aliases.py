#!/usr/bin/env python3
"""Add the ledger's own shorthand to the reviewed seed's aliases.

San Francisco's contract and bond ledgers write places short: every Golden Gate
Park contract is titled "PW GGP …", Laguna Honda's are "PW LHH …", and the GO
bond item is "Office of the Chief Medical Examiner" where the facilities
registry says "…Examiner Building". A seed that only carries the full name
matches none of them, so the flagship places were scoring near zero on exactly
the ledgers that hold their money.

Each entry below was verified against the ledger it will match before being
added — whole-word counts on core_us_sf_contracts / stg_us_sf_go_bond_spending
(2026-07-28). A short form is only admitted at 100% precision on that check;
"CMGC" was tested and rejected because it is a delivery method (Construction
Manager/General Contractor), not a place.

Idempotent: an alias already present is left alone.

Usage: python pipeline/scripts/enrich/add_sf_verified_aliases.py [--apply]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "sf_place_candidates.json"

# slug → (alias, the check that admitted it)
VERIFIED: dict[str, list[tuple[str, str]]] = {
    "golden-gate-park": [("GGP", "20/20 contract titles are Golden Gate Park work")],
    "laguna-honda-hospital": [("LHH", "69/69 contract titles are Laguna Honda work")],
    "kezar-stadium": [("Kezar", "3/3 contract titles are Kezar Stadium/Pavilion work")],
    "moscone-center": [("Moscone", "12/12 contract titles are Moscone Center work")],
    "portsmouth-square": [("Portsmouth", "4/4 contract titles are Portsmouth Square work")],
    "office-of-the-chief-medical-examiner-building": [
        ("Office of the Chief Medical Examiner",
         "the GO-bond item name; the registry appends 'Building'")],
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    doc = json.loads(SEED.read_text())
    by_slug = {p["slug"]: p for p in doc["places"]}

    added = 0
    for slug, entries in VERIFIED.items():
        p = by_slug.get(slug)
        if p is None:
            print(f"  SKIP {slug}: not in seed")
            continue
        have = {a.lower() for a in p.get("aliases", [])}
        for alias, why in entries:
            if alias.lower() in have:
                print(f"  ok   {slug}: '{alias}' already present")
                continue
            p.setdefault("aliases", []).append(alias)
            added += 1
            print(f"  ADD  {slug}: '{alias}'  ({why})")

    if args.apply and added:
        SEED.write_text(json.dumps(doc, indent=1, ensure_ascii=False))
        print(f"\nWROTE {SEED} (+{added} aliases)")
    elif not args.apply:
        print(f"\n(dry run — {added} would be added; pass --apply)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
