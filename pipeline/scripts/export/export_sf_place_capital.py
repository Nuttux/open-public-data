#!/usr/bin/env python3
"""Export per-place capital & construction (Block 6B+) → _capital.json.

Reads mart_us_sf_place_capital (the unified, NO-SUM capital model) and writes
one keyed JSON that export_sf_places.py merges into each fiche as the `capital`
block. Groups by source (bond / contract / permit / dpw) and carries each row's
amount_measure so the fiche can label dollars precisely and never sum across
ledgers — bond `expended` is the same money that pays the contracts.

Output: website/public/data/us/sf/places/_capital.json

Usage: python pipeline/scripts/export/export_sf_place_capital.py
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from google.cloud import bigquery

PROJECT_ID = "open-data-france-484717"
MART = f"{PROJECT_ID}.dbt_us_marts.mart_us_sf_place_capital"
PAYEE_MART = f"{PROJECT_ID}.dbt_us_marts.mart_us_sf_place_payees"
PERMIT_MART = f"{PROJECT_ID}.dbt_us_marts.mart_us_sf_place_permits"
OUT = (Path(__file__).parent.parent.parent.parent
       / "website" / "public" / "data" / "us" / "sf" / "places" / "_capital.json")

TOP_PAYEES = 8
TOP_PERMITS = 6

SOURCE_PIPELINE = (
    "configs/countries/us.yaml → sync_socrata.py → raw.us_sf_go_bond_* → "
    "dbt_us_staging → seed_us_sf_place_bonds (reviewed crosswalk) → "
    "dbt_us_marts.mart_us_sf_place_capital → export_sf_place_capital.py"
)

MEASURE_LABEL = {
    "bond_expended": "voter-bond funds spent",
    "contract_paid": "paid to contractors",
    "permit_declared": "declared construction value",
}


def _num(v):
    return float(v) if isinstance(v, Decimal) else v


def main() -> int:
    client = bigquery.Client(project=PROJECT_ID)
    q = f"""
        SELECT place_slug, source, source_kind, item_name, bond_program, component,
               CAST(voter_approved_date AS STRING) AS voter_approved_date,
               amount_usd, amount_measure, budget_usd, contract_no, status,
               match_evidence
        FROM `{MART}`
    """
    by_place = defaultdict(list)
    for row in client.query(q).result():
        d = {k: _num(v) for k, v in dict(row).items()}
        by_place[d.pop("place_slug")].append(d)

    # payee chain: top vendors paid for work at each place
    payees_by_place = defaultdict(list)
    pq = f"""
        SELECT place_slug, vendor, paid_usd, n_contracts,
               first_fiscal_year, last_fiscal_year
        FROM `{PAYEE_MART}`
        ORDER BY place_slug, paid_usd DESC
    """
    for row in client.query(pq).result():
        d = {k: _num(v) for k, v in dict(row).items()}
        payees_by_place[d.pop("place_slug")].append(d)

    # building permits on the place's parcels (declared construction value)
    permits_by_place = defaultdict(list)
    permit_totals = {}
    rq = f"""
        SELECT place_slug, description, permit_type, declared_cost_usd, status,
               CAST(permit_date AS STRING) AS permit_date, permit_year
        FROM `{PERMIT_MART}`
        ORDER BY place_slug, declared_cost_usd DESC
    """
    for row in client.query(rq).result():
        d = {k: _num(v) for k, v in dict(row).items()}
        permits_by_place[d.pop("place_slug")].append(d)
    for slug, ps in permits_by_place.items():
        permit_totals[slug] = round(sum(p["declared_cost_usd"] or 0 for p in ps), 2)

    # permit declared value by year — the single-measure dated series behind the
    # fiche's spend-by-year graph (permits are the most granular dated data).
    permits_year = defaultdict(lambda: defaultdict(float))
    yq = f"""
        SELECT place_slug, permit_year, SUM(declared_cost_usd) AS declared
        FROM `{PERMIT_MART}`
        WHERE permit_year IS NOT NULL
        GROUP BY place_slug, permit_year
    """
    for row in client.query(yq).result():
        d = {k: _num(v) for k, v in dict(row).items()}
        permits_year[d["place_slug"]][int(d["permit_year"])] = round(d["declared"], 2)

    places = {}
    all_slugs = set(by_place) | set(payees_by_place) | set(permits_by_place)
    for slug in all_slugs:
        rows = by_place.get(slug, [])
        # exact-$ items first (largest), then named work
        rows.sort(key=lambda r: (r.get("amount_usd") is None, -(r.get("amount_usd") or 0)))
        # bond-funded rows only in the "capital" grouping (contracts already
        # render in the fiche's money section; kept in the mart for completeness)
        bond_rows = [r for r in rows if r.get("source") == "bond"]
        measure_totals = defaultdict(float)
        for r in bond_rows:
            if r.get("amount_usd") and r.get("amount_measure"):
                measure_totals[r["amount_measure"]] += r["amount_usd"]
        bond_programs = sorted({r["bond_program"] for r in bond_rows if r.get("bond_program")})
        pys = payees_by_place.get(slug, [])
        perms = permits_by_place.get(slug, [])
        places[slug] = {
            "n_items": len(bond_rows),
            "measure_totals": {k: round(v, 2) for k, v in measure_totals.items()},
            "bond_programs": bond_programs,
            "items": bond_rows,
            "payees": pys[:TOP_PAYEES],
            "n_payees": len(pys),
            "payees_total_paid": round(sum(p["paid_usd"] for p in pys), 2),
            "permits": perms[:TOP_PERMITS],
            "n_permits": len(perms),
            "permits_total_declared": permit_totals.get(slug, 0.0),
            "permits_by_year": [
                {"year": y, "declared_usd": permits_year[slug][y]}
                for y in sorted(permits_year.get(slug, {}))
            ],
        }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "unit": "USD",
        "measure_labels": MEASURE_LABEL,
        "no_sum_note": (
            "Capital figures come from different city ledgers (voter bonds, "
            "contracts, building permits) and are NOT additive — a bond fund "
            "pays the contracts, and a permit is the same job's declared cost. "
            "Totals are shown within one ledger only, never summed across them."
        ),
        "sources": [
            {"name": "GO Bond Program Spending & Status", "dataset_id": "m793-kis4",
             "source_url": "https://data.sfgov.org/d/m793-kis4"},
            {"name": "GO Bond Projects", "dataset_id": "d3dc-v5yr",
             "source_url": "https://data.sfgov.org/d/d3dc-v5yr"},
        ],
        "count": len(places),
        "places": places,
    }, indent=1, ensure_ascii=False))
    print(f"Wrote capital for {len(places)} places → {OUT.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
