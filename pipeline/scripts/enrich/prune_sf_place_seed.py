#!/usr/bin/env python3
"""Prune the SF place seed against the CORRECTED ranking (2026-07-28).

The first ranking counted building permits as money. It should not have: a
permit is an applicant's declared cost, routinely for a private owner's work on
a parcel the City merely shares, and often for work that was withdrawn and never
built. Permits fired for 36% of pool candidates against 8% for contracts and 5%
for bonds, so the "money" that ordered the pool was mostly not public money —
and places were promoted into the reviewed seed on the strength of it. Potrero
Division ranked 7th on an $800M permit figure that is $659K of built work.

score_sf_place_candidates.py now scores public money only. This script removes
the places that promotion put in the seed on the strength of the old signal.

WHAT IT REMOVES — and, as importantly, what it does not:

  removed : promoted in this expansion, carries NO public money, and has not
            been published. Nothing is lost but a candidate row.

  KEPT    : anything already published. A published fiche is a page someone can
            already read, and its worth is not only its money — the de Young,
            the Asian Art Museum, the Legion of Honor, the Zoo, Pier 39 and the
            Japanese Tea Garden all carry 8-10 archive documents and no
            place-named contract, because San Francisco funds them through a
            department rather than by site. Deleting them would remove the
            city's most recognisable civic places from a site about its civic
            places. If a money-only site is wanted, that is a separate decision
            and this script is not how to take it.

  KEPT    : anything in the reviewed seed before this expansion. That set was
            someone else's editorial judgement; this script only cleans up after
            its own.

Usage: python pipeline/scripts/enrich/prune_sf_place_seed.py [--apply]
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "sf_place_candidates.json"
RANKED = ROOT / "pipeline" / "cache" / "ia_sf" / "sf_place_candidates_ranked.csv"
PLACES = ROOT / "website" / "public" / "data" / "us" / "sf" / "places"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    doc = json.loads(SEED.read_text())
    ranked = {r["slug"]: r for r in csv.DictReader(RANKED.open())}

    # A place "has money" if EITHER source says so. The scorer and the fiche
    # match contracts differently — the scorer reads the full contract corpus
    # with a weak-alias/department guard, the fiche reads the active-contracts
    # export — and Ingleside Police Station shows a contract on its fiche that
    # the scorer's guard drops. Never delete a place the app itself is showing
    # money for.
    cap_path = PLACES / "_capital.json"
    cap = json.loads(cap_path.read_text())["places"] if cap_path.exists() else {}

    def fiche_has_money(slug: str) -> bool:
        fp = PLACES / f"{slug}.json"
        if not fp.exists():
            return False
        try:
            d = json.loads(fp.read_text())
        except Exception:  # noqa: BLE001
            return False
        c = cap.get(slug, {})
        return bool((d.get("money") or {}).get("contracts")) or bool(c.get("items")) \
            or (c.get("payees_total_paid") or 0) > 0

    published = set()
    for fp in PLACES.glob("*.json"):
        if fp.stem.startswith("_"):
            continue
        try:
            d = json.loads(fp.read_text())
        except Exception:  # noqa: BLE001
            continue
        if d.get("published"):
            published.add(d.get("slug", fp.stem))

    keep, drop = [], []
    for p in doc["places"]:
        slug = p["slug"]
        promoted = "promoted_from_pool" in p
        r = ranked.get(slug)
        has_money = (bool(r) and int(r["breadth"]) > 0) or fiche_has_money(slug)
        if promoted and not has_money and slug not in published:
            drop.append((slug, p["name"], int(r["n_archive_docs"]) if r else 0))
        else:
            keep.append(p)

    print(f"seed {len(doc['places'])} → {len(keep)}  (removing {len(drop)})")
    print("\nremoved — promoted on permit signal, no public money, not published:")
    for slug, name, docs in sorted(drop):
        print(f"   {slug:<46} docs={docs}")

    kept_nomoney_pub = [p["slug"] for p in keep
                        if p["slug"] in published
                        and ranked.get(p["slug"]) and int(ranked[p["slug"]]["breadth"]) == 0]
    print(f"\nKEPT despite no public money (already published): {len(kept_nomoney_pub)}")
    for s in sorted(kept_nomoney_pub):
        print(f"   {s}")

    if args.apply:
        doc["places"] = keep
        SEED.write_text(json.dumps(doc, indent=1, ensure_ascii=False))
        print(f"\nWROTE {SEED} ({len(keep)} places)")
    else:
        print("\n(dry run — pass --apply)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
