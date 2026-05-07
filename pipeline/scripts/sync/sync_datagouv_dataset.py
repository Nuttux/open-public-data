#!/usr/bin/env python3
"""
Generic data.gouv.fr → BigQuery sync.

Reads a city YAML config (e.g. `pipeline/configs/cities/marseille.yaml`),
resolves each `datagouv_dataset` source, downloads the CSV(s) and loads
them into BigQuery `raw.{target_table}[_{year}]`.

For sources with `slug_pattern` + `years`, one BigQuery table is created
per year (e.g. `raw.marseille_budget_primitif_2024`). The staging layer
unions them. This avoids schema-drift issues across years.

For sources with a single `slugs: [...]` list, one combined table is
created (e.g. `raw.marseille_marches_ville`).

Usage:
    python sync_datagouv_dataset.py --city marseille --source marseille_budget_primitif
    python sync_datagouv_dataset.py --city marseille  # all datagouv sources
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import yaml
from google.cloud import bigquery

PIPELINE_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PIPELINE_ROOT / "scripts"))

from sync._helpers.datagouv import DataGouvError, download_csv_for_slug  # noqa: E402
from utils.logger import Logger  # noqa: E402

PROJECT_ID = "open-data-france-484717"
RAW_DATASET_DEFAULT = "raw"


def load_city_config(city_slug: str) -> dict:
    cfg_path = PIPELINE_ROOT / "configs" / "cities" / f"{city_slug}.yaml"
    if not cfg_path.exists():
        raise FileNotFoundError(f"city config not found: {cfg_path}")
    with open(cfg_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def datagouv_sources(config: dict) -> list[dict]:
    return [s for s in config.get("sources", []) if s.get("type") == "datagouv_dataset"]


def expand_slugs(source: dict) -> list[tuple[str, str]]:
    """Return list of (slug, suffix) where suffix is '' or '_{year}'."""
    if "slug_pattern" in source and "years" in source:
        return [
            (source["slug_pattern"].format(year=y), f"_{y}")
            for y in source["years"]
        ]
    if "slugs" in source:
        slugs = source["slugs"]
        if len(slugs) == 1:
            return [(slugs[0], "")]
        return [(s, f"_{i}") for i, s in enumerate(slugs)]
    raise ValueError(f"source '{source.get('id')}' has no slug_pattern or slugs")


def load_csv_to_bigquery(
    client: bigquery.Client,
    csv_bytes: bytes,
    dataset_id: str,
    table_id: str,
    csv_separator: str = ",",
    csv_encoding: str = "utf-8",
    log: Logger = None,
) -> int:
    """Load CSV bytes into a BigQuery table (WRITE_TRUNCATE, autodetect schema).

    Returns the row count inserted.
    """
    table_ref = f"{PROJECT_ID}.{dataset_id}.{table_id}"

    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.CSV,
        skip_leading_rows=1,
        autodetect=True,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        field_delimiter=csv_separator,
        encoding="UTF-8" if csv_encoding.lower() == "utf-8" else "ISO-8859-1",
        allow_quoted_newlines=True,
        allow_jagged_rows=False,
    )

    job = client.load_table_from_file(
        io.BytesIO(csv_bytes),
        table_ref,
        job_config=job_config,
    )
    job.result()  # wait for completion

    table = client.get_table(table_ref)
    if log:
        log.success(
            f"loaded {table.num_rows:,} rows",
            extra=f"{table_ref} ({len(csv_bytes):,} bytes)",
        )
    return int(table.num_rows)


def sync_source(client: bigquery.Client, config: dict, source: dict, log: Logger) -> dict:
    """Sync one source (one or many slugs → one or many BQ tables).

    Returns a summary {source_id, tables: [{table, slug, rows}], errors: [...]}.
    """
    source_id = source["id"]
    target_table_base = source["target_table"]
    raw_dataset = config.get("bq_raw_dataset", RAW_DATASET_DEFAULT)
    csv_separator = source.get("csv_separator", ",")
    csv_encoding = source.get("csv_encoding", "utf-8")

    log.section(f"Source: {source_id}")
    log.info("description", extra=source.get("description", ""))

    summary = {"source_id": source_id, "tables": [], "errors": []}

    for slug, suffix in expand_slugs(source):
        table_id = f"{target_table_base}{suffix}"
        log.info("loading", extra=f"{slug} → {raw_dataset}.{table_id}")
        try:
            csv_bytes, _meta = download_csv_for_slug(slug)
        except DataGouvError as e:
            log.error(f"download failed: {slug}", extra=str(e))
            summary["errors"].append({"slug": slug, "error": str(e)})
            continue

        try:
            rows = load_csv_to_bigquery(
                client, csv_bytes, raw_dataset, table_id,
                csv_separator=csv_separator,
                csv_encoding=csv_encoding,
                log=log,
            )
            summary["tables"].append({"slug": slug, "table": table_id, "rows": rows})
        except Exception as e:
            log.error(f"BQ load failed: {table_id}", extra=str(e))
            summary["errors"].append({"slug": slug, "table": table_id, "error": str(e)})

    return summary


def get_bigquery_client() -> bigquery.Client:
    """Reuse the credential resolution pattern from export_sankey_data.py."""
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--city", required=True, help="City slug (e.g. marseille)")
    parser.add_argument("--source", help="Source id to sync (default: all datagouv_dataset sources)")
    parser.add_argument("--dry-run", action="store_true", help="List sources without loading to BQ")
    args = parser.parse_args()

    log = Logger("sync_datagouv")
    log.header(f"data.gouv.fr → BigQuery sync — city={args.city}")

    config = load_city_config(args.city)
    all_sources = datagouv_sources(config)
    if args.source:
        all_sources = [s for s in all_sources if s["id"] == args.source]
        if not all_sources:
            log.error(f"source '{args.source}' not found in {args.city}.yaml")
            return 2

    log.info("sources to sync", extra=f"{len(all_sources)} source(s)")

    if args.dry_run:
        log.section("Dry run — would sync:")
        for s in all_sources:
            slugs = expand_slugs(s)
            for slug, suffix in slugs:
                target = f"{config.get('bq_raw_dataset', RAW_DATASET_DEFAULT)}.{s['target_table']}{suffix}"
                log.info("would load", extra=f"{slug} → {target}")
        return 0

    log.section("BigQuery client")
    client = get_bigquery_client()
    log.success("connected", extra=PROJECT_ID)

    summaries = []
    for source in all_sources:
        summaries.append(sync_source(client, config, source, log))

    log.section("Summary")
    total_tables = sum(len(s["tables"]) for s in summaries)
    total_errors = sum(len(s["errors"]) for s in summaries)
    total_rows = sum(t["rows"] for s in summaries for t in s["tables"])
    log.info("tables loaded", extra=str(total_tables))
    log.info("rows loaded", extra=f"{total_rows:,}")
    if total_errors:
        log.error(f"{total_errors} error(s) encountered")
        for s in summaries:
            for err in s["errors"]:
                log.error(f"  {s['source_id']}", extra=str(err))
        return 1

    log.success("sync OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
