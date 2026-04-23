#!/usr/bin/env python3
"""
Bridge BigQuery → FoxDB.

Copie les tables `core_*` (dbt_paris_analytics) et `mart_*` (dbt_paris_marts)
depuis BigQuery vers FoxDB via COPY FROM STDIN (PG wire, port 5432).

Usage:
    export DOT_DB_TOKEN=...                  # token FoxDB
    python scripts/tools/push_to_foxdb.py    # push tout
    python scripts/tools/push_to_foxdb.py --only core_budget,mart_sankey
    python scripts/tools/push_to_foxdb.py --dry-run
"""

import argparse
import io
import os
import sys

import psycopg2
from google.cloud import bigquery

BQ_PROJECT = "open-data-france-484717"
BQ_DATASETS = ["dbt_paris_analytics", "dbt_paris_marts"]

FOXDB_DSN = "postgresql://default:{token}@db.getdot.ai:5432/db?sslmode=require"


def list_bq_tables(bq: bigquery.Client) -> list[tuple[str, str, int]]:
    """Retourne [(dataset, table, num_rows)] pour core_* et mart_*."""
    out = []
    for ds in BQ_DATASETS:
        for t in bq.list_tables(ds):
            name = t.table_id
            if not (name.startswith("core_") or name.startswith("mart_")):
                continue
            tbl = bq.get_table(t.reference)
            out.append((ds, name, tbl.num_rows))
    return out


def bq_schema_to_pg(field: bigquery.SchemaField) -> str:
    """Mapping simple BQ → PG. FoxDB = PG/DuckDB compatible."""
    t = field.field_type.upper()
    mode_array = field.mode == "REPEATED"
    mapping = {
        "STRING": "TEXT", "BYTES": "BYTEA",
        "INT64": "BIGINT", "INTEGER": "BIGINT",
        "FLOAT64": "DOUBLE PRECISION", "FLOAT": "DOUBLE PRECISION",
        "NUMERIC": "NUMERIC", "BIGNUMERIC": "NUMERIC",
        "BOOL": "BOOLEAN", "BOOLEAN": "BOOLEAN",
        "DATE": "DATE", "DATETIME": "TIMESTAMP",
        "TIMESTAMP": "TIMESTAMPTZ", "TIME": "TIME",
        "GEOGRAPHY": "TEXT",  # simplify
        "JSON": "JSONB",
        "RECORD": "JSONB", "STRUCT": "JSONB",
    }
    pg = mapping.get(t, "TEXT")
    if mode_array:
        pg = pg + "[]"
    return pg


def ddl_for_table(bq: bigquery.Client, dataset: str, table: str) -> tuple[str, list[str]]:
    """Retourne (CREATE TABLE DDL, list of column names)."""
    tbl = bq.get_table(f"{BQ_PROJECT}.{dataset}.{table}")
    cols = [(f.name, bq_schema_to_pg(f)) for f in tbl.schema]
    col_defs = ", ".join(f'"{n}" {t}' for n, t in cols)
    ddl = f'CREATE TABLE "{table}" ({col_defs})'
    return ddl, [n for n, _ in cols]


def copy_table(bq: bigquery.Client, pg_conn, dataset: str, table: str, dry_run: bool):
    print(f"\n── {dataset}.{table}")
    ddl, cols = ddl_for_table(bq, dataset, table)

    if dry_run:
        print(f"  [DRY] {ddl[:120]}...")
        return

    with pg_conn.cursor() as cur:
        cur.execute(f'DROP TABLE IF EXISTS "{table}"')
        cur.execute(ddl)
        pg_conn.commit()
        print(f"  ✓ table créée ({len(cols)} cols)")

        # Stream rows from BQ as CSV → COPY FROM STDIN
        # Use BQ to_dataframe + csv export for simplicity; works for ≲1M rows.
        rows = bq.list_rows(f"{BQ_PROJECT}.{dataset}.{table}")
        df = rows.to_dataframe(create_bqstorage_client=False)
        if df.empty:
            print("  (empty, skip)")
            return
        buf = io.StringIO()
        df.to_csv(buf, index=False, header=False)
        buf.seek(0)
        col_list = ", ".join(f'"{c}"' for c in cols)
        cur.copy_expert(
            f'COPY "{table}" ({col_list}) FROM STDIN WITH (FORMAT csv)',
            buf,
        )
        pg_conn.commit()
        print(f"  ✓ {len(df):,} rows copiées")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--only", help="comma-separated subset of table names")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    token = os.environ.get("DOT_DB_TOKEN")
    if not token and not args.dry_run:
        print("❌ DOT_DB_TOKEN non défini", file=sys.stderr)
        sys.exit(1)

    # ADC fix: google-auth lit GOOGLE_APPLICATION_CREDENTIALS si défini.
    # Ici on laisse l'utilisateur gérer (gcloud auth application-default login).
    bq = bigquery.Client(project=BQ_PROJECT)

    tables = list_bq_tables(bq)
    if args.only:
        want = {s.strip() for s in args.only.split(",")}
        tables = [t for t in tables if t[1] in want]

    print(f"Tables à pousser: {len(tables)}")
    for ds, t, n in tables:
        print(f"  {ds}.{t}  ({n:,} rows)")

    if args.dry_run:
        print("\n[DRY-RUN] skip push")
        return

    pg_conn = psycopg2.connect(FOXDB_DSN.format(token=token))
    try:
        for ds, t, _ in tables:
            try:
                copy_table(bq, pg_conn, ds, t, args.dry_run)
            except Exception as e:
                print(f"  ❌ {ds}.{t}: {e}")
                pg_conn.rollback()
    finally:
        pg_conn.close()

    print("\n✓ Terminé")


if __name__ == "__main__":
    main()
