#!/usr/bin/env python3
"""
Sync sirene_companies.json (cache enrichissement SIRENE) → BigQuery.

Source = `website/public/data/enrichment/sirene_companies.json`, alimenté
par `pipeline/scripts/enrich/enrich_sirene.py` (recherche-entreprises.api.gouv.fr).

Cible = `raw.sirene_companies_paris` — utilisé en JOIN par les marts marches
(mart_marches_fournisseurs, mart_projet_marches) pour combler les
`fournisseur_nom` vides via le SIREN. Élimine le besoin du patcher
post-export `apply_sirene_to_marches.py`.

Usage:
    python pipeline/scripts/sync/sync_sirene_companies.py
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
RAW_TABLE = "sirene_companies_paris"
ROOT = Path(__file__).resolve().parents[3]
CACHE_PATH = (
    ROOT / "website" / "public" / "data" / "enrichment" / "sirene_companies.json"
)


def main() -> None:
    logger = Logger("sync_sirene_companies")
    logger.header("Sync sirene_companies.json → BigQuery")

    raw = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    items = raw.get("items", {}) or {}
    rows = []
    for siren, info in items.items():
        rows.append({
            "siren": str(siren),
            "nom": info.get("nom"),
            "forme_juridique": info.get("forme_juridique"),
            "nombre_etablissements": info.get("nombre_etablissements"),
            "nombre_etablissements_ouverts": info.get("nombre_etablissements_ouverts"),
            "activite_principale": info.get("activite_principale"),
            "libelle_activite": info.get("libelle_activite"),
            "commune": info.get("commune"),
            "code_postal": info.get("code_postal"),
            "adresse": info.get("adresse"),
            "tranche_effectifs": info.get("tranche_effectifs"),
            "date_creation": info.get("date_creation"),
            "etat": info.get("etat"),
        })
    df = pd.DataFrame(rows)
    logger.info(f"  {len(df):,} entreprises")

    client = bigquery.Client(project=PROJECT_ID)
    table_ref = f"{PROJECT_ID}.{RAW_DATASET}.{RAW_TABLE}"
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        autodetect=True,
    )
    logger.info(f"Upload → {table_ref}")
    df["loaded_at"] = pd.Timestamp.utcnow()
    job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
    job.result()
    logger.success("Done")


if __name__ == "__main__":
    main()
