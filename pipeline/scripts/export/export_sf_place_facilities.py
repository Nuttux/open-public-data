#!/usr/bin/env python3
"""Export per-place facility identity (Block 6A lieux) → _facilities.json.

Reads mart_us_sf_place_facilities (the reviewed place↔City-Facilities crosswalk
rolled up per place) and writes one keyed JSON that export_sf_places.py merges
into each fiche as the `facility` block: canonical address, APN, ownership,
floor area, and the campus building count — the structured identity SF's money
tables never carried. Identity only; no money.

Output: website/public/data/us/sf/places/_facilities.json

Usage: python pipeline/scripts/export/export_sf_place_facilities.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from google.cloud import bigquery

PROJECT_ID = "open-data-france-484717"
MART = f"{PROJECT_ID}.dbt_us_marts.mart_us_sf_place_facilities"
OUT = (Path(__file__).parent.parent.parent.parent
       / "website" / "public" / "data" / "us" / "sf" / "places" / "_facilities.json")

SOURCE_PIPELINE = (
    "configs/countries/us.yaml → sync_socrata.py → raw.us_sf_city_facilities → "
    "dbt_us_staging → seed_us_sf_place_facilities (reviewed crosswalk) → "
    "dbt_us_marts.mart_us_sf_place_facilities → export_sf_place_facilities.py"
)


def _num(v):
    return float(v) if isinstance(v, Decimal) else v


def main() -> int:
    client = bigquery.Client(project=PROJECT_ID)
    q = f"""
        SELECT place_slug, primary_name, primary_address, primary_city, primary_zip,
               primary_block_lot, primary_department_name, primary_is_city_owned,
               primary_gross_sq_ft, primary_latitude, primary_longitude,
               supervisor_district, n_facilities, total_gross_sq_ft,
               n_owned, n_leased, apn_list, facilities
        FROM `{MART}`
    """
    places = {}
    for row in client.query(q).result():
        d = {k: _num(v) for k, v in dict(row).items()}
        slug = d.pop("place_slug")
        d["apn_list"] = list(d.get("apn_list") or [])
        d["facilities"] = [
            {k: _num(v) for k, v in dict(f).items()} for f in (d.get("facilities") or [])
        ]
        places[slug] = d

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "unit": "USD",
        "note": (
            "Structured facility identity per place, from the SF City Facilities "
            "registry (dataset nc68-ngbr) via the reviewed place↔facility "
            "crosswalk. Address/APN/ownership/floor-area/building-count — identity, "
            "not money."
        ),
        "source": {
            "name": "City Facilities",
            "dataset_id": "nc68-ngbr",
            "source_url": "https://data.sfgov.org/d/nc68-ngbr",
            "attribution": "City & County of San Francisco (General Services Agency)",
        },
        "count": len(places),
        "places": places,
    }, indent=1, ensure_ascii=False))
    print(f"Wrote facility identity for {len(places)} places → {OUT.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
