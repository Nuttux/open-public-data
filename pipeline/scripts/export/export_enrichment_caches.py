#!/usr/bin/env python3
"""
Export enrichment caches: BQ mart → website/public/data/enrichment/.

Lit `mart_enrichment_caches` (chaque ligne = un cache) et écrit le
`payload` JSON à `website/public/data/enrichment/<relative_path>`. Le
contenu est conservé tel quel (l'enrich script avait déjà la forme
finale ; ce script ne fait que matérialiser le BQ vers le filesystem
pour que l'UI puisse lazy-load).

Output:
    website/public/data/enrichment/<relative_path>

Usage:
    python pipeline/scripts/export/export_enrichment_caches.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger

PROJECT_ID = "open-data-france-484717"
MARTS_DATASET = "dbt_paris_marts"
OUT_DIR = (
    Path(__file__).parent.parent.parent.parent
    / "website" / "public" / "data" / "enrichment"
)


def main() -> None:
    logger = Logger("export_enrichment_caches")
    logger.header("Export enrichment caches (mart → public/data/enrichment/)")

    client = bigquery.Client(project=PROJECT_ID)
    rows = list(client.query(
        f"SELECT relative_path, payload FROM `{PROJECT_ID}.{MARTS_DATASET}.mart_enrichment_caches`"
    ).result())

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for r in rows:
        rel = r["relative_path"]
        out = OUT_DIR / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(r["payload"], encoding="utf-8")
        written += 1
    logger.success(f"  {written} fichiers écrits sous {OUT_DIR.relative_to(OUT_DIR.parent.parent.parent)}")


if __name__ == "__main__":
    main()
