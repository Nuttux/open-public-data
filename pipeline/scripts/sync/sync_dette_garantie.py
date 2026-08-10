#!/usr/bin/env python3
"""
Sync OpenData Paris `dette-garantie` (annexe IV-B emprunts garantis) → BigQuery.

Source: opendata.paris.fr API (filtré collectivite='Ville de Paris').
Cible: BigQuery `open-data-france-484717.raw.dette_garantie_paris`.

Usage:
    python pipeline/scripts/sync/sync_dette_garantie.py
    python pipeline/scripts/sync/sync_dette_garantie.py --years 2019,2020,2021,2022,2023,2024
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import pandas as pd
import requests
from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger

PROJECT_ID = "open-data-france-484717"
RAW_DATASET = "raw"
RAW_TABLE = "dette_garantie_paris"
API_BASE = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/dette-garantie"
DEFAULT_YEARS = [2019, 2020, 2021, 2022, 2023, 2024]


def fetch_year(year: int, logger: Logger) -> pd.DataFrame:
    params = {
        "refine": [f"annee_de_publication:{year}", "collectivite:Ville de Paris"],
        "delimiter": ";",
    }
    url = f"{API_BASE}/exports/csv"
    logger.info(f"Fetch {year} · GET {url}")
    r = requests.get(url, params=params, timeout=180)
    r.raise_for_status()
    df = pd.read_csv(io.StringIO(r.text), sep=";")
    logger.info(f"  → {len(df):,} emprunts garantis")
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", default=",".join(str(y) for y in DEFAULT_YEARS))
    args = parser.parse_args()
    years = [int(y) for y in args.years.split(",") if y.strip()]

    logger = Logger("sync_dette_garantie")
    logger.header(f"Sync dette-garantie · {len(years)} années")

    frames = []
    for y in years:
        try:
            frames.append(fetch_year(y, logger))
        except Exception as e:
            logger.error(f"  fetch {y} failed: {e}")
            raise
    df = pd.concat(frames, ignore_index=True)
    logger.info(f"Total: {len(df):,} rows over {len(years)} years")

    client = bigquery.Client(project=PROJECT_ID)
    upload(df, client, logger)
    logger.success("Done")


if __name__ == "__main__":
    main()
