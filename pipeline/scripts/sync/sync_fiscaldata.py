#!/usr/bin/env python3
"""
Generic Treasury Fiscal Data → BigQuery sync (protocol adapter).

Reads a country YAML config (e.g. `pipeline/configs/countries/us.yaml`),
resolves each `fiscaldata_api` source and loads the FULL history into
BigQuery `raw.{target_table}` (WRITE_TRUNCATE).

Protocol facts this adapter encodes (docs/us/API-RECON.md §B.5):
  - pagination via page[size] / page[number] (+ meta.total-count/total-pages)
  - EVERY value is a JSON string; missing values are the literal string
    "null". Raw keeps the strings untouched (typing happens once, in stg) —
    the only added column is `_synced_at` (TIMESTAMP).
  - a stable `sort` is required for deterministic paging.

Also snapshots the machine-readable catalog (services/dtg/metadata/) into
`raw.us_fiscaldata_catalog`: one row per (endpoint, field) with the
dataset/table descriptions, per-field labels and data types, coverage dates
and the fiscaldata.treasury.gov dataset page — the provenance metadata used
by stg/marts/exports instead of hardcoding it.

Usage:
    python sync_fiscaldata.py us                        # all fiscaldata sources + catalog
    python sync_fiscaldata.py us --source mts_table_9   # one source (+ catalog)
    python sync_fiscaldata.py us --skip-catalog         # skip catalog snapshot
    python sync_fiscaldata.py us --dry-run              # plan only
"""

from __future__ import annotations

import argparse
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
PAGE_SIZE_DEFAULT = 10000
REQUEST_TIMEOUT_S = 120
MAX_RETRIES = 4


def get_with_retry(url: str, params: dict | None = None, log: Logger | None = None) -> requests.Response:
    """GET with linear-backoff retries — the API intermittently drops
    connections mid-pagination on large pulls (observed live 2026-07-15
    on mts_table_5, 11 pages of 10k)."""
    import time
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_S)
            resp.raise_for_status()
            return resp
        except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as e:
            last_exc = e
            if attempt < MAX_RETRIES:
                if log:
                    log.warning(f"retry {attempt}/{MAX_RETRIES - 1}", extra=str(e))
                time.sleep(2 * attempt)
    raise last_exc


def load_country_config(country_slug: str) -> dict:
    cfg_path = PIPELINE_ROOT / "configs" / "countries" / f"{country_slug}.yaml"
    if not cfg_path.exists():
        raise FileNotFoundError(f"country config not found: {cfg_path}")
    with open(cfg_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def fiscaldata_sources(config: dict) -> list[dict]:
    return [s for s in config.get("sources", []) if s.get("type") == "fiscaldata_api"]


def fetch_all_rows(api_base: str, source: dict, page_size: int, log: Logger) -> list[dict]:
    """Paginated full-history GET for one endpoint. Returns rows as returned
    by the API (all values strings, "null" = missing)."""
    endpoint = source["endpoint"]
    url = f"{api_base}/{endpoint}"
    params: dict = {
        "page[size]": page_size,
        "sort": source.get("sort", "record_date"),
    }
    earliest = source.get("earliest_record_date")
    if earliest:
        # Full-history pull; the filter documents intent and guards against
        # upstream surprises rather than restricting anything.
        params["filter"] = f"record_date:gte:{earliest}"

    rows: list[dict] = []
    page = 1
    total_pages = None
    while True:
        params["page[number]"] = page
        resp = get_with_retry(url, params=params, log=log)
        payload = resp.json()
        data = payload.get("data", [])
        meta = payload.get("meta", {})
        if total_pages is None:
            total_pages = int(meta.get("total-pages") or 1)
            log.info(
                "total to pull",
                extra=f"{meta.get('total-count')} rows, {total_pages} page(s) of {page_size}",
            )
        rows.extend(data)
        if page >= total_pages or not data:
            break
        page += 1

    expected = int(meta.get("total-count") or 0)
    if expected and len(rows) != expected:
        raise RuntimeError(
            f"{endpoint}: pulled {len(rows)} rows but meta.total-count={expected}"
        )
    return rows


def load_rows_to_bigquery(
    client: bigquery.Client,
    rows: list[dict],
    dataset_id: str,
    table_id: str,
    synced_at: str,
    log: Logger,
) -> int:
    """Load API rows into BigQuery with an all-STRING explicit schema
    (raw = strings exactly as the API returned them) + `_synced_at`."""
    if not rows:
        raise ValueError(f"no rows to load into {table_id}")

    field_names = list(rows[0].keys())
    for r in rows:
        if list(r.keys()) != field_names:
            raise RuntimeError(f"{table_id}: field drift across rows ({list(r.keys())} vs {field_names})")
        r["_synced_at"] = synced_at

    schema = [bigquery.SchemaField(name, "STRING") for name in field_names]
    schema.append(bigquery.SchemaField("_synced_at", "TIMESTAMP"))

    table_ref = f"{PROJECT_ID}.{dataset_id}.{table_id}"
    job_config = bigquery.LoadJobConfig(
        schema=schema,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    job = client.load_table_from_json(rows, table_ref, job_config=job_config)
    job.result()

    table = client.get_table(table_ref)
    log.success(f"loaded {table.num_rows:,} rows", extra=table_ref)
    return int(table.num_rows)


def build_catalog_rows(config: dict, log: Logger) -> list[dict]:
    """Fetch services/dtg/metadata/ and flatten the entries for every
    fiscaldata source in the config into (endpoint, field) rows."""
    fd_cfg = config.get("fiscaldata", {})
    catalog_url = fd_cfg["catalog_url"]
    page_base = fd_cfg.get("dataset_page_base", "https://fiscaldata.treasury.gov/datasets")

    resp = get_with_retry(catalog_url, log=log)
    catalog = resp.json()
    log.info("catalog fetched", extra=f"{len(catalog)} datasets")

    endpoints = {s["endpoint"]: s["id"] for s in fiscaldata_sources(config)}
    out: list[dict] = []
    for ds in catalog:
        for api in ds.get("apis", []):
            endpoint_txt = api.get("endpoint_txt") or ""
            matched = [
                (ep, sid) for ep, sid in endpoints.items() if endpoint_txt.endswith("/" + ep)
            ]
            if not matched:
                continue
            _, source_id = matched[0]
            dataset_page = f"{page_base}/{ds.get('dataset_path')}"
            for field in api.get("fields", []):
                out.append({
                    "source_id": source_id,
                    "dataset_id": ds.get("dataset_id"),
                    "dataset_title": ds.get("title"),
                    "dataset_page_url": dataset_page,
                    "publisher": ds.get("publisher"),
                    "api_id": str(api.get("api_id")),
                    "table_name": api.get("table_name"),
                    "table_description": api.get("table_description"),
                    "row_definition": api.get("row_definition"),
                    "endpoint": endpoint_txt,
                    "update_frequency": api.get("update_frequency"),
                    "api_last_updated": api.get("last_updated"),
                    "earliest_date": api.get("earliest_date"),
                    "latest_date": api.get("latest_date"),
                    "row_count": str(api.get("row_count")),
                    "column_name": field.get("column_name"),
                    "pretty_name": field.get("pretty_name"),
                    "definition": field.get("definition"),
                    "data_type": field.get("data_type"),
                    "is_required": str(field.get("is_required")),
                })
    missing = set(endpoints.values()) - {r["source_id"] for r in out}
    if missing:
        raise RuntimeError(f"catalog entries not found for sources: {sorted(missing)}")
    return out


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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("country", help="Country slug (e.g. us)")
    parser.add_argument("--source", help="Only sync this specific source id")
    parser.add_argument("--skip-catalog", action="store_true", help="Skip the catalog metadata snapshot")
    parser.add_argument("--dry-run", action="store_true", help="Plan only, don't fetch or load")
    args = parser.parse_args()

    log = Logger("sync_fiscaldata")
    log.header(f"Treasury Fiscal Data → BigQuery sync — country={args.country}")

    config = load_country_config(args.country)
    fd_cfg = config.get("fiscaldata", {})
    api_base = fd_cfg["api_base"]
    page_size = int(fd_cfg.get("page_size", PAGE_SIZE_DEFAULT))
    raw_dataset = config.get("bq_raw_dataset", RAW_DATASET_DEFAULT)

    sources = fiscaldata_sources(config)
    if args.source:
        sources = [s for s in sources if s["id"] == args.source]
        if not sources:
            log.error(f"source '{args.source}' not found in {args.country}.yaml")
            return 2

    log.info("sources to sync", extra=f"{len(sources)} source(s)")
    if args.dry_run:
        log.section("Dry run — would sync:")
        for s in sources:
            log.info("would load", extra=f"{s['endpoint']} → {raw_dataset}.{s['target_table']}")
        if not args.skip_catalog:
            log.info("would snapshot catalog", extra=f"{fd_cfg.get('catalog_url')} → {raw_dataset}.{fd_cfg.get('catalog_table')}")
        return 0

    log.section("BigQuery client")
    client = get_bigquery_client()
    log.success("connected", extra=PROJECT_ID)

    synced_at = datetime.now(timezone.utc).isoformat()
    failures = 0
    for source in sources:
        log.section(f"Source: {source['id']}")
        log.info("description", extra=source.get("description", ""))
        try:
            rows = fetch_all_rows(api_base, source, page_size, log)
            load_rows_to_bigquery(client, rows, raw_dataset, source["target_table"], synced_at, log)
        except Exception as e:
            log.error(f"sync failed: {source['id']}", extra=str(e))
            failures += 1

    if not args.skip_catalog:
        log.section("Catalog metadata snapshot")
        try:
            catalog_rows = build_catalog_rows(config, log)
            load_rows_to_bigquery(
                client, catalog_rows, raw_dataset, fd_cfg["catalog_table"], synced_at, log
            )
        except Exception as e:
            log.error("catalog snapshot failed", extra=str(e))
            failures += 1

    log.section("Summary")
    if failures:
        log.error(f"{failures} failure(s)")
        return 1
    log.success("sync OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
