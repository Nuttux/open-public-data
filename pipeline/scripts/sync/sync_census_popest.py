#!/usr/bin/env python3
"""
Census Population Estimates (PEP vintage CSV) → BigQuery sync.

Reads the `census_popest_csv` source from a country YAML config
(e.g. `pipeline/configs/countries/us.yaml`) and loads the vintage
estimates CSV into BigQuery `raw.{target_table}` as ALL STRINGS
(typing happens in stg), plus `_synced_at`, `_source` and `_source_url`
provenance columns.

Why a CSV and not api.census.gov: the Census data API now requires a key
(verified live 2026-07-15 — keyless requests return HTTP 302 to
missing_key.html with header `X-DataWebAPI-KeyError: 1`), and its latest
PEP vintage lags the published estimates. The Vintage estimates CSV on
www2.census.gov is no-auth, machine-readable and carries the newest
July 1 estimates — same layering (raw → stg → core) either way.

NOTE: www2.census.gov intermittently hangs on IPv6 from some networks;
this script forces IPv4 resolution before fetching.

Usage:
    python sync_census_popest.py us
    python sync_census_popest.py us --dry-run
"""

from __future__ import annotations

import argparse
import csv
import io
import socket
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
import yaml
from google.cloud import bigquery

PIPELINE_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PIPELINE_ROOT / "scripts"))

from utils.logger import Logger  # noqa: E402

PROJECT_ID = "open-data-france-484717"
RAW_DATASET_DEFAULT = "raw"
REQUEST_TIMEOUT_S = 120


def force_ipv4() -> None:
    """www2.census.gov hangs on IPv6 from some networks (observed live
    2026-07-15: curl default timed out, `curl -4` succeeded in <1s)."""
    orig = socket.getaddrinfo

    def ipv4_only(host, port, family=0, type=0, proto=0, flags=0):
        return orig(host, port, socket.AF_INET, type, proto, flags)

    socket.getaddrinfo = ipv4_only


def load_country_config(country_slug: str) -> dict:
    cfg_path = PIPELINE_ROOT / "configs" / "countries" / f"{country_slug}.yaml"
    if not cfg_path.exists():
        raise FileNotFoundError(f"country config not found: {cfg_path}")
    with open(cfg_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def census_sources(config: dict) -> list[dict]:
    return [s for s in config.get("sources", []) if s.get("type") == "census_popest_csv"]


def get_bigquery_client() -> bigquery.Client:
    """Reuse the credential resolution pattern from sync_datagouv_dataset.py."""
    import os
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path:
        for p in [
            Path.home() / ".config" / "gcloud" / "application_default_credentials.json",
            PIPELINE_ROOT.parent / "credentials.json",
            PIPELINE_ROOT / "credentials.json",
        ]:
            if p.exists():
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(p)
                break
    return bigquery.Client(project=PROJECT_ID)


def sync_source(client: bigquery.Client, config: dict, source: dict, log: Logger) -> int:
    raw_dataset = config.get("bq_raw_dataset", RAW_DATASET_DEFAULT)
    url = source["url"]
    log.info("downloading", extra=url)
    resp = requests.get(url, timeout=REQUEST_TIMEOUT_S)
    resp.raise_for_status()

    # The state-level NST file is ASCII, but the places file (sub-est*.csv)
    # is Latin-1 — city names carry ñ etc. (verified live 2026-07-16:
    # byte 0xf1 → UnicodeDecodeError under utf-8).
    try:
        text = resp.content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = resp.content.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    synced_at = datetime.now(timezone.utc).isoformat()
    rows = []
    for r in reader:
        row = {k: (v if v != "" else None) for k, v in r.items()}
        row["_source"] = source.get("source")
        row["_source_url"] = url
        row["_synced_at"] = synced_at
        rows.append(row)
    if not rows:
        raise RuntimeError(f"no rows parsed from {url}")
    log.info("parsed", extra=f"{len(rows)} rows, {len(reader.fieldnames)} columns")

    schema = [bigquery.SchemaField(name, "STRING") for name in reader.fieldnames]
    schema += [
        bigquery.SchemaField("_source", "STRING"),
        bigquery.SchemaField("_source_url", "STRING"),
        bigquery.SchemaField("_synced_at", "TIMESTAMP"),
    ]
    table_ref = f"{PROJECT_ID}.{raw_dataset}.{source['target_table']}"
    job_config = bigquery.LoadJobConfig(
        schema=schema,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    job = client.load_table_from_json(rows, table_ref, job_config=job_config)
    job.result()

    table = client.get_table(table_ref)
    log.success(f"loaded {table.num_rows:,} rows", extra=table_ref)
    return int(table.num_rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("country", help="Country slug (e.g. us)")
    parser.add_argument("--dry-run", action="store_true", help="Plan only, don't fetch or load")
    args = parser.parse_args()

    log = Logger("sync_census_popest")
    log.header(f"Census PEP vintage CSV → BigQuery sync — country={args.country}")

    config = load_country_config(args.country)
    sources = census_sources(config)
    if not sources:
        log.error(f"no census_popest_csv source in {args.country}.yaml")
        return 2

    if args.dry_run:
        log.section("Dry run — would sync:")
        for s in sources:
            log.info("would load", extra=f"{s['url']} → {config.get('bq_raw_dataset', RAW_DATASET_DEFAULT)}.{s['target_table']}")
        return 0

    force_ipv4()

    log.section("BigQuery client")
    client = get_bigquery_client()
    log.success("connected", extra=PROJECT_ID)

    failures = 0
    for source in sources:
        log.section(f"Source: {source['id']}")
        log.info("description", extra=source.get("description", ""))
        try:
            sync_source(client, config, source, log)
        except Exception as e:
            log.error(f"sync failed: {source['id']}", extra=str(e))
            failures += 1

    log.section("Summary")
    if failures:
        log.error(f"{failures} failure(s)")
        return 1
    log.success("sync OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
