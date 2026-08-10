#!/usr/bin/env python3
"""
Parity gate for the ODS ingestion migration (Block 1 of the multi-city
convergence). Proves that the generic `sync_ods_dataset.py` produces raw
tables byte/structurally identical to the legacy `sync_opendata.py`.

Workflow:
    1. Legacy tables already live in `raw.*` (produced by sync_opendata.py).
    2. Shadow-load the same sources with the new ingester into a side dataset:
         python sync_ods_dataset.py --city paris --raw-dataset raw_parity
    3. Diff:
         python verify_ods_parity.py --city paris --shadow-dataset raw_parity

For each `ods_dataset` source it compares `raw.<target>` (live) against
`<shadow>.<target>` on:
  - SCHEMA   : the set of (column, type), reported as added / removed / retyped.
               Column ORDER differences are reported but do not fail the gate.
  - ROWCOUNT : exact row counts.
  - CONTENT  : an order-independent, duplicate-safe fingerprint —
               SUM over FARM_FINGERPRINT(TO_JSON_STRING(row)) of the shared
               data columns projected in a canonical (sorted) order, so
               column reordering can never cause a false mismatch. The
               `_synced_at` column is excluded (it legitimately differs).

Exit code 0 iff every source passes all three checks.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import yaml
from google.cloud import bigquery

PIPELINE_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PIPELINE_ROOT / "scripts"))

from utils.logger import Logger  # noqa: E402

PROJECT_ID = "open-data-france-484717"
IGNORE_COLUMNS = {"_synced_at"}


def load_city_config(city_slug: str) -> dict:
    cfg_path = PIPELINE_ROOT / "configs" / "cities" / f"{city_slug}.yaml"
    with open(cfg_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def ods_sources(config: dict) -> list[dict]:
    return [s for s in config.get("sources", []) if s.get("type") == "ods_dataset"]


def target_table(source: dict) -> str:
    if source.get("target_table"):
        return source["target_table"]
    return source["dataset_id"].replace("-", "_").rstrip("_")


def get_client() -> bigquery.Client:
    creds = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds:
        adc = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
        if adc.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(adc)
    return bigquery.Client(project=PROJECT_ID)


def fetch_schema(client: bigquery.Client, dataset: str, table: str) -> list[tuple[str, str]] | None:
    """Ordered [(column_name, data_type)] via INFORMATION_SCHEMA, or None if
    the table doesn't exist."""
    sql = f"""
        SELECT column_name, data_type
        FROM `{PROJECT_ID}.{dataset}.INFORMATION_SCHEMA.COLUMNS`
        WHERE table_name = @t
        ORDER BY ordinal_position
    """
    job = client.query(
        sql,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("t", "STRING", table)]
        ),
    )
    rows = [(r["column_name"], r["data_type"]) for r in job.result()]
    return rows or None


def content_fingerprint(client: bigquery.Client, dataset: str, table: str, data_cols: list[str]) -> tuple[int, str]:
    """(row_count, fingerprint). Canonical projection = shared data columns in
    sorted order; fingerprint = SUM of per-row FARM_FINGERPRINT (order- and
    grouping-independent, duplicate-safe, no STRING_AGG buffer cap)."""
    proj = ", ".join(f"`{c}`" for c in sorted(data_cols))
    sql = f"""
        SELECT
          COUNT(*) AS n,
          CAST(COALESCE(SUM(CAST(FARM_FINGERPRINT(rj) AS BIGNUMERIC)), 0) AS STRING) AS fp
        FROM (
          SELECT TO_JSON_STRING(t) AS rj
          FROM (SELECT {proj} FROM `{PROJECT_ID}.{dataset}.{table}`) t
        )
    """
    row = list(client.query(sql).result())[0]
    return int(row["n"]), row["fp"]


def compare_source(client: bigquery.Client, live_ds: str, shadow_ds: str, source: dict, log: Logger) -> bool:
    table = target_table(source)
    log.section(f"{source['id']} → {table}")

    live_schema = fetch_schema(client, live_ds, table)
    shadow_schema = fetch_schema(client, shadow_ds, table)
    if live_schema is None:
        log.error("live table missing", extra=f"{live_ds}.{table}")
        return False
    if shadow_schema is None:
        log.error("shadow table missing (run the shadow load first)", extra=f"{shadow_ds}.{table}")
        return False

    live_map = {c: t for c, t in live_schema}
    shadow_map = {c: t for c, t in shadow_schema}
    ok = True

    added = sorted(set(shadow_map) - set(live_map))
    removed = sorted(set(live_map) - set(shadow_map))
    retyped = sorted(c for c in set(live_map) & set(shadow_map) if live_map[c] != shadow_map[c])
    if added:
        log.error("columns only in shadow", extra=", ".join(added))
        ok = False
    if removed:
        log.error("columns only in live", extra=", ".join(removed))
        ok = False
    if retyped:
        for c in retyped:
            log.error("type mismatch", extra=f"{c}: live={live_map[c]} shadow={shadow_map[c]}")
        ok = False

    # Column order: informational only.
    live_order = [c for c, _ in live_schema if c not in IGNORE_COLUMNS]
    shadow_order = [c for c, _ in shadow_schema if c not in IGNORE_COLUMNS]
    if ok and live_order != shadow_order:
        log.warning("column order differs (non-blocking)",
                    extra="content fingerprint is order-canonical")

    if not ok:
        log.error("SCHEMA MISMATCH — skipping content check")
        return False

    shared_data_cols = [c for c in live_map if c not in IGNORE_COLUMNS]
    live_n, live_fp = content_fingerprint(client, live_ds, table, shared_data_cols)
    shadow_n, shadow_fp = content_fingerprint(client, shadow_ds, table, shared_data_cols)

    if live_n != shadow_n:
        log.error("ROWCOUNT mismatch", extra=f"live={live_n:,} shadow={shadow_n:,}")
        return False
    if live_fp != shadow_fp:
        log.error("CONTENT fingerprint mismatch",
                  extra=f"rows={live_n:,} identical but data differs")
        return False

    log.success(f"PARITY OK — {live_n:,} rows, schema + content identical", extra=table)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--city", required=True, help="City slug (e.g. paris)")
    parser.add_argument("--shadow-dataset", dest="shadow_dataset", required=True,
                        help="BQ dataset holding the new ingester's shadow load (e.g. raw_parity)")
    parser.add_argument("--live-dataset", dest="live_dataset",
                        help="BQ dataset holding the legacy tables (default: config bq_raw_dataset)")
    parser.add_argument("--source", help="Only check this source id")
    args = parser.parse_args()

    log = Logger("verify_ods_parity")
    log.header(f"ODS ingestion parity — city={args.city}")

    config = load_city_config(args.city)
    live_ds = args.live_dataset or config.get("bq_raw_dataset", "raw")
    sources = ods_sources(config)
    if args.source:
        sources = [s for s in sources if s["id"] == args.source]
        if not sources:
            log.error(f"source '{args.source}' not found")
            return 2

    log.info("comparing", extra=f"live '{live_ds}' vs shadow '{args.shadow_dataset}' ({len(sources)} sources)")
    client = get_client()

    passed = 0
    for source in sources:
        if compare_source(client, live_ds, args.shadow_dataset, source, log):
            passed += 1

    log.section("Summary")
    failed = len(sources) - passed
    log.info("passed", extra=f"{passed}/{len(sources)}")
    if failed:
        log.error(f"{failed} source(s) FAILED parity")
        return 1
    log.success("ALL SOURCES PASS — migration is byte/structurally identical")
    return 0


if __name__ == "__main__":
    sys.exit(main())
