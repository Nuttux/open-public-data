#!/usr/bin/env python3
"""Build the place↔GO-bond crosswalk seed (Block 6B, docs/us/block-studies/6-lieux.md).

Matches GO-bond program items (m793-kis4, carry $ expended) and the granular
bond projects (d3dc-v5yr, name the facility, no $) to seed places by phrase
match (sf_place_match). Two source kinds, kept distinct:

  - bond_item    : a spending program item whose name IS a single place
    ("ZSFG, Building 5", "Southeast Health Center") → the place's EXACT bond
    $ (latest cumulative expended). Program-category items ("Neighborhood
    Parks") are NOT matched here — their $ is pooled across many places.
  - bond_project : a planned project naming the place ("RP Buena Vista Park
    Master Pln") → the project appears on the fiche as bond-funded work; its
    dollars stay at the program level (context, not an exact per-place total).

The `expended` field is a cumulative snapshot per report year — the LATEST
row per program_item is the current position (summing snapshots double-counts;
verified: ZSFG Bldg 5 latest = $199M, not the $322M a naive SUM gives).

Output: seed_us_sf_place_bonds.csv (reviewed, then dbt seed). Bond and contract
dollars are the SAME money in different ledgers — mart_us_sf_place_capital
labels the measure and never sums across sources.

Usage: python pipeline/scripts/enrich/build_sf_place_bonds.py
"""

from __future__ import annotations

import csv
import json
import subprocess
from pathlib import Path

from sf_place_match import load_places, match_place, norm

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "pipeline" / "seeds" / "countries" / "us" / "seed_us_sf_place_bonds.csv"
STG_SPEND = "open-data-france-484717.dbt_us_staging.stg_us_sf_go_bond_spending"
STG_PROJ = "open-data-france-484717.dbt_us_staging.stg_us_sf_go_bond_projects"

# program items that are categories, not a single place — never matched to a
# place as exact $ (their money is pooled across many facilities).
CATEGORY_MARKERS = (
    "neighborhood parks", "waterfront parks", "citywide", "program", "housing",
    "streets", "resurfacing", "improvements", "various", "market rate",
    "below market", "middle-income", "middle income", "low-income", "low income",
    "public housing", "fire stations", "health centers", "community health",
    "navigation center", "scattered sites", "area plan", "seismic",
)


def bq_json(query: str) -> list[dict]:
    out = subprocess.run(
        ["bq", "query", "--use_legacy_sql=false", "--format=json", "--max_rows=2000", query],
        capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def is_category(name: str) -> bool:
    n = name.lower()
    return any(m in n for m in CATEGORY_MARKERS)


def main() -> int:
    places = load_places()

    # bond items: latest cumulative expended per program_item.
    items = bq_json(f"""
        WITH ranked AS (
            SELECT program_item, bond_program, expended_usd, revised_budget_usd,
                   voter_approved_date,
                   ROW_NUMBER() OVER (PARTITION BY program_item
                       ORDER BY report_year DESC, expended_usd DESC) AS rn
            FROM `{STG_SPEND}`
            WHERE program_item IS NOT NULL
        )
        SELECT program_item, bond_program, expended_usd, revised_budget_usd,
               CAST(voter_approved_date AS STRING) AS voter_approved_date
        FROM ranked WHERE rn = 1
    """)

    projects = bq_json(f"""
        SELECT DISTINCT bond, planned_project_name, component_or_program
        FROM `{STG_PROJ}` WHERE planned_project_name IS NOT NULL
    """)

    rows = []
    # ── bond items → exact place $ (skip category items) ──
    for it in items:
        name = it["program_item"]
        if is_category(name):
            continue
        m = match_place(name, places)
        if not m:
            continue
        pl, ev = m
        rows.append({
            "place_slug": pl["slug"], "source_kind": "bond_item",
            "bond_program": it.get("bond_program") or "",
            "item_name": name,
            "expended_usd": it.get("expended_usd") or "",
            "revised_budget_usd": it.get("revised_budget_usd") or "",
            "voter_approved_date": (it.get("voter_approved_date") or "")[:10],
            "component": "", "match_evidence": ev,
        })

    # ── bond projects → named work at the place (program-level $) ──
    for pr in projects:
        name = pr["planned_project_name"]
        m = match_place(name, places)
        if not m:
            continue
        pl, ev = m
        rows.append({
            "place_slug": pl["slug"], "source_kind": "bond_project",
            "bond_program": pr.get("bond") or "",
            "item_name": name,
            "expended_usd": "", "revised_budget_usd": "", "voter_approved_date": "",
            "component": pr.get("component_or_program") or "",
            "match_evidence": ev,
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    cols = ["place_slug", "source_kind", "bond_program", "item_name",
            "expended_usd", "revised_budget_usd", "voter_approved_date",
            "component", "match_evidence"]
    with OUT.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r["place_slug"], r["source_kind"], r["item_name"])))

    n_places = len({r["place_slug"] for r in rows})
    n_items = sum(1 for r in rows if r["source_kind"] == "bond_item")
    n_proj = sum(1 for r in rows if r["source_kind"] == "bond_project")
    print(f"Wrote {len(rows)} bond rows ({n_items} exact-$ items, {n_proj} projects) "
          f"for {n_places} places → {OUT.name}")
    exact = sorted({r["place_slug"] for r in rows if r["source_kind"] == "bond_item"})
    print(f"  places with EXACT bond $: {', '.join(exact)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
