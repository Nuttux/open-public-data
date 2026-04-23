#!/usr/bin/env python3
"""
Export methodology.json — source unique de vérité pour toutes les constantes
factuelles utilisées par le frontend (population, seuils légaux, paramètres
éditoriaux).

Chaque valeur porte son `source` + `source_url` + `date_reference` pour
remplir la promesse d'auditabilité open-public-data.

Usage:
    python scripts/export/export_methodology.py

Input  : seeds chargées dans BigQuery (seed_city_constants, seed_legal_thresholds,
         seed_editorial_params)
Output : website/public/data/methodology.json
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

PROJECT_ID = "open-data-france-484717"
SEEDS_DATASET = "dbt_paris_seeds"
WEBSITE_ROOT = Path(__file__).parent.parent.parent.parent / "website"
# Public JSON = audit / API consumers
OUTPUT_PATH = WEBSITE_ROOT / "public" / "data" / "methodology.json"
# Internal copy = build-time import by Next.js client components
INTERNAL_OUTPUT_PATH = WEBSITE_ROOT / "src" / "data" / "methodology.json"


def _cast(value: str, unit: str):
    """Cast value string to int/float based on unit hints."""
    s = (value or "").strip()
    if not s:
        return None
    # Comma-separated list (e.g. years excluded) stays as list
    if "," in s and not s.replace(",", "").replace(".", "").replace("-", "").isdigit() is False and "," in unit.lower() == False:
        pass  # fall through
    try:
        if "." in s:
            return float(s)
        return int(s)
    except ValueError:
        # list form like "2020,2021,2025"
        if "," in s:
            try:
                return [int(x.strip()) for x in s.split(",") if x.strip()]
            except ValueError:
                return s
        return s


def _fetch_seed(client: bigquery.Client, table: str) -> dict:
    """Fetch a seed table and return dict keyed by `key`."""
    rows = client.query(
        f"SELECT * FROM `{PROJECT_ID}.{SEEDS_DATASET}.{table}`"
    ).result()
    out = {}
    for r in rows:
        d = dict(r)
        key = d.pop("key")
        d["value"] = _cast(d.get("value"), d.get("unit") or "")
        out[key] = d
    return out


def main():
    client = bigquery.Client(project=PROJECT_ID)

    city = _fetch_seed(client, "seed_city_constants")
    legal = _fetch_seed(client, "seed_legal_thresholds")
    editorial = _fetch_seed(client, "seed_editorial_params")

    methodology = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": "pipeline/seeds/seed_city_constants.csv + seed_legal_thresholds.csv + seed_editorial_params.csv",
        "audit_promise": (
            "Toute valeur numérique utilisée par open-public-data doit être "
            "rattachée à une source identifiable. Si ce n'est pas le cas, "
            "c'est un bug à signaler."
        ),
        "city": city,
        "legal_thresholds": legal,
        "editorial_params": editorial,
    }

    for path in (OUTPUT_PATH, INTERNAL_OUTPUT_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            json.dump(methodology, f, ensure_ascii=False, indent=2)
        print(f"✓ {path}")
    print(f"  city keys: {list(city.keys())}")
    print(f"  legal keys: {list(legal.keys())}")
    print(f"  editorial keys: {list(editorial.keys())}")


if __name__ == "__main__":
    main()
