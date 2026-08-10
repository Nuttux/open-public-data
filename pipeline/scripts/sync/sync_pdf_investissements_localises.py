#!/usr/bin/env python3
"""
Sync investissements localisés (extraction PDF Annexe IL) → BigQuery.

Source = les fichiers JSON déjà extraits par
`pipeline/scripts/tools/extract_pdf_investments.py`. Cette commande
joue le rôle d'un sync : prend les JSON, les met à plat, et les
charge dans `raw.pdf_investissements_localises_paris`.

Une fois cette table peuplée, la chaîne dbt (stg → core → mart)
prend le relais et l'export `export_investissements_localises.py`
reproduit le JSON en sortie. extract_pdf_investments est libéré
de l'écriture directe sous public/data — il n'écrira plus que les
seeds CSV dont dbt a besoin.

Usage:
    python pipeline/scripts/sync/sync_pdf_investissements_localises.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger

PROJECT_ID = "open-data-france-484717"
RAW_DATASET = "raw"
RAW_TABLE = "pdf_investissements_localises_paris"
ROOT = Path(__file__).resolve().parents[3]
JSON_DIR = ROOT / "website" / "public" / "data" / "map"


def load_files(logger: Logger) -> pd.DataFrame:
    """Lit les investissements_localises_<year>.json existants et aplatit."""
    rows: list[dict] = []
    for path in sorted(JSON_DIR.glob("investissements_localises_*.json")):
        if "index" in path.name:
            continue
        d = json.loads(path.read_text(encoding="utf-8"))
        year_pub = int(d["year"])
        stats = d.get("stats", {}) or {}
        validation = d.get("validation", {}) or {}
        per_year_meta = {
            "year_publication": year_pub,
            "source": d.get("source"),
            "extraction_date": d.get("extraction_date"),
            "pages_traitees": stats.get("pages_traitees"),
            "pages_il": stats.get("pages_il"),
            "total_attendu_m_eur": validation.get("total_attendu"),
            "ecart_pourcent": validation.get("ecart_pourcent"),
            "valide": validation.get("valide"),
        }
        for proj in d.get("data", []) or []:
            row = {**per_year_meta, **proj}
            rows.append(row)
        logger.info(f"  {path.name}: +{len(d.get('data') or [])} projets")
    df = pd.DataFrame(rows)
    return df


def upload(df: pd.DataFrame, client: bigquery.Client, logger: Logger) -> None:
    table_ref = f"{PROJECT_ID}.{RAW_DATASET}.{RAW_TABLE}"
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        autodetect=True,
    )
    logger.info(f"Upload → {table_ref} (truncate + load, {len(df):,} rows)")
    df["loaded_at"] = pd.Timestamp.utcnow()
    job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
    job.result()
    logger.success("Loaded")


def main() -> None:
    logger = Logger("sync_pdf_investissements_localises")
    logger.header("Sync investissements localisés (Annexe IL PDF) → BigQuery")
    df = load_files(logger)
    logger.info(f"Total: {len(df):,} projets · {df['year_publication'].nunique()} années")
    client = bigquery.Client(project=PROJECT_ID)
    upload(df, client, logger)
    logger.success("Done")


if __name__ == "__main__":
    main()
