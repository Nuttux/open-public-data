#!/usr/bin/env python3
"""
National ingest — DGFiP Balances Comptables → raw_national.dgfip_balances (BigQuery).

Source: data.economie.gouv.fr, ODS Explore v2.1, one dataset per year
        `balances-comptables-des-communes-en-<YEAR>`.
Grain : commune × budget (cbudg) × compte (article) × year.

Strategy (national-first, NOT gated by any commune seed):
    Download the FULL year via the /exports/csv streaming endpoint, filtered
    SERVER-SIDE to the *budget principal* of *communes* only
    (`cbudg="1" AND categ="Commune"`), keeping only the 9 columns the budget
    models need. ~6.1M rows/year → ~250 MB CSV. Then `bq load` into BigQuery.

    We do NOT gate by seed_communes_cibles: the national tier must reach every
    commune. `cbudg="1"` isolates the main budget (annexes = eau, assainissement,
    CCAS, arrondissements… are cbudg="3"). Both M14 and M57 nomenclatures kept.

Usage:
    python scripts/sync/sync_dgfip_balances_national.py            # 2 latest years
    python scripts/sync/sync_dgfip_balances_national.py --years 2024 2023 2022
    python scripts/sync/sync_dgfip_balances_national.py --dry-run  # download only

Output:
    BigQuery table open-data-france-484717.raw_national.dgfip_balances
"""

import argparse
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlencode

import requests

PROJECT_ID = "open-data-france-484717"
DATASET_ID = "raw_national"
TABLE = "dgfip_balances"

DGFIP_EXPORT = (
    "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/"
    "balances-comptables-des-communes-en-{year}/exports/csv"
)
DGFIP_RECORDS = (
    "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/"
    "balances-comptables-des-communes-en-{year}/records"
)

# Columns kept (machine names). compte/siren stay STRING; amounts FLOAT64.
SELECT = "exer,siren,nomen,compte,cbudg,obnetdeb,obnetcre,sd,sc"
WHERE = 'cbudg="1" AND categ="Commune"'

# Explicit BQ schema — never let autodetect turn siren/compte into INT64.
BQ_SCHEMA = (
    "exer:INTEGER,siren:STRING,nomen:STRING,compte:STRING,cbudg:STRING,"
    "obnetdeb:FLOAT,obnetcre:FLOAT,sd:FLOAT,sc:FLOAT"
)

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "cache" / "wip" / "national" / "dgfip"

LATEST_YEARS = [2024, 2023]


def expected_count(year: int) -> int:
    """Server-side total_count for the filtered slice (no silent truncation check)."""
    url = DGFIP_RECORDS.format(year=year) + "?" + urlencode(
        {"where": WHERE, "limit": 0}
    )
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    return int(r.json().get("total_count", 0))


def download_year(year: int) -> tuple[Path, int]:
    """Stream the filtered CSV export to disk. Returns (path, data_row_count)."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    out = CACHE_DIR / f"balances_{year}.csv"
    url = DGFIP_EXPORT.format(year=year) + "?" + urlencode(
        {"where": WHERE, "select": SELECT, "delimiter": ";", "use_labels": "false"}
    )
    print(f"  [{year}] streaming export → {out.name}")
    n_lines = 0
    with requests.get(url, stream=True, timeout=1800) as resp:
        resp.raise_for_status()
        with open(out, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                if chunk:
                    f.write(chunk)
                    n_lines += chunk.count(b"\n")
    data_rows = max(n_lines - 1, 0)  # minus header
    size_mb = out.stat().st_size / 1024 / 1024
    print(f"  [{year}] wrote {size_mb:.0f} MB, ~{data_rows:,} data rows")
    return out, data_rows


def bq_load(csv_path: Path, replace: bool) -> None:
    mode = "--replace" if replace else "--noreplace"
    cmd = [
        "bq", "load", mode,
        "--source_format=CSV",
        "--skip_leading_rows=1",
        "--field_delimiter=;",
        f"--project_id={PROJECT_ID}",
        f"{DATASET_ID}.{TABLE}",
        str(csv_path),
        BQ_SCHEMA,
    ]
    print(f"  bq load ({'replace' if replace else 'append'}) {csv_path.name} …")
    subprocess.run(cmd, check=True)


def ensure_dataset() -> None:
    subprocess.run(
        ["bq", "--location=EU", "mk", "-f", "--dataset",
         f"--description=National raw data (DGFiP, OFGL, DECP, REI)",
         f"{PROJECT_ID}:{DATASET_ID}"],
        check=False,
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="DGFiP balances → raw_national (national, ungated)")
    ap.add_argument("--years", type=int, nargs="+", default=LATEST_YEARS)
    ap.add_argument("--dry-run", action="store_true", help="Download only, no BQ load")
    args = ap.parse_args()

    print(f"→ DGFiP balances national sync — years {args.years}")
    print(f"  filter: {WHERE}  (budget principal, communes; ALL communes, ungated)")

    if not args.dry_run:
        ensure_dataset()

    total = 0
    for i, year in enumerate(args.years):
        try:
            exp = expected_count(year)
            print(f"  [{year}] server total_count (filtered): {exp:,}")
        except Exception as e:
            print(f"  [{year}] WARN could not fetch total_count: {e}")
            exp = None

        path, rows = download_year(year)
        if exp is not None and abs(rows - exp) > max(1000, exp * 0.01):
            print(
                f"  [{year}] ⚠️  DOWNLOAD MISMATCH: got ~{rows:,} rows vs "
                f"expected {exp:,} — possible truncation. NOT silently ignoring."
            )
        total += rows

        if not args.dry_run:
            bq_load(path, replace=(i == 0))

    print(f"\n✓ Done. ~{total:,} rows across {len(args.years)} years.")
    if args.dry_run:
        print("  (dry-run — nothing loaded to BigQuery)")
    else:
        print(f"  → {PROJECT_ID}.{DATASET_ID}.{TABLE}")
        print("  Next: dbt run --select tag:national  (budget models)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
