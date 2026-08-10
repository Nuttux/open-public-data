#!/usr/bin/env python3
"""
Sync enrichment caches → BigQuery (table polymorphe).

Lit récursivement `pipeline/cache/enrichment/` et charge chaque fichier
JSON (et chaque fichier sous deliberations_results/) dans une table
unique `raw.enrichment_caches_paris` :

    relative_path STRING   -- chemin sous pipeline/cache/enrichment/
    payload       STRING   -- JSON sérialisé du fichier
    size_bytes    INT64
    generated_at  TIMESTAMP -- moment du sync

L'export `export_enrichment_caches.py` reverse l'opération en écrivant
chaque ligne sous `website/public/data/enrichment/<relative_path>`.

Usage:
    python pipeline/scripts/sync/sync_enrichment_caches.py
"""

from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import pandas as pd
from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger

PROJECT_ID = "open-data-france-484717"
RAW_DATASET = "raw"
RAW_TABLE = "enrichment_caches_paris"
ROOT = Path(__file__).resolve().parents[3]
CACHE_DIR = ROOT / "pipeline" / "cache" / "enrichment"


def collect() -> pd.DataFrame:
    rows = []
    # TIMESTAMP type-aware (Issue #6) — pd.Timestamp avec UTC pour que
    # bigquery infère TIMESTAMP, pas STRING.
    now = pd.Timestamp.utcnow()
    for path in sorted(CACHE_DIR.rglob("*.json")):
        rel = path.relative_to(CACHE_DIR).as_posix()
        text = path.read_text(encoding="utf-8")
        rows.append({
            "relative_path": rel,
            "payload": text,
            "size_bytes": len(text.encode("utf-8")),
            "generated_at": now,
        })
    return pd.DataFrame(rows)


def main() -> None:
    logger = Logger("sync_enrichment_caches")
    logger.header("Sync enrichment caches → BigQuery (polymorphic)")
    df = collect()
    if df.empty:
        logger.warning(f"Aucun fichier sous {CACHE_DIR}")
        return
    total_kb = df["size_bytes"].sum() / 1024
    logger.info(f"  {len(df)} fichiers, total {total_kb:.0f} KB")
    client = bigquery.Client(project=PROJECT_ID)
    table_ref = f"{PROJECT_ID}.{RAW_DATASET}.{RAW_TABLE}"
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        autodetect=True,
    )
    logger.info(f"Upload → {table_ref}")
    job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
    job.result()
    logger.success("Done")


if __name__ == "__main__":
    main()
