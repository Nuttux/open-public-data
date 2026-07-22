#!/usr/bin/env python3
"""
National ingest — OFGL consolidated aggregates → raw_national.ofgl_communes (BigQuery).

Source: data.ofgl.fr, ODS Explore v2.1, `ofgl-base-communes-consolidee` (LONG:
        one row per commune × year × agregat).

Serves TWO jobs at once (national-first, ungated, ALL ~35k communes):
  1. Commune dimension — siren, insee (com_code), name, dep/reg, population (ptot).
     This is the universe the budget models join against (NOT seed_communes_cibles).
  2. Reconciliation top-lines — `montant_bp` is the *budget principal* figure, which
     reconciles directly against the DGFiP balances filtered to cbudg="1".

Usage:
    python scripts/sync/sync_ofgl_national.py                 # 2 latest years
    python scripts/sync/sync_ofgl_national.py --years 2024 2023 2022
    python scripts/sync/sync_ofgl_national.py --dry-run

Output:
    BigQuery table open-data-france-484717.raw_national.ofgl_communes
"""

import argparse
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlencode

import requests

PROJECT_ID = "open-data-france-484717"
DATASET_ID = "raw_national"
TABLE = "ofgl_communes"

OFGL_EXPORT = (
    "https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/"
    "ofgl-base-communes-consolidee/exports/csv"
)
OFGL_RECORDS = (
    "https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/"
    "ofgl-base-communes-consolidee/records"
)

# Aggregates we ingest: dimension carrier + reconciliation top-lines + context KPIs.
AGREGATS = [
    "Dépenses de fonctionnement",
    "Recettes de fonctionnement",
    "Dépenses d'investissement hors remb",
    "Recettes d'investissement hors emprunts",
    "Dépenses d'équipement",
    "Dépenses totales",
    "Recettes totales",
    "Encours de dette",
    "Annuité de la dette",
    "Epargne brute",
]

SELECT = (
    "exer,siren,com_code,com_name,dep_code,dep_name,reg_code,reg_name,"
    "categ,ptot,tranche_population,agregat,montant,montant_bp,montant_ba,"
    "euros_par_habitant"
)

BQ_SCHEMA = (
    "exer:INTEGER,siren:STRING,com_code:STRING,com_name:STRING,"
    "dep_code:STRING,dep_name:STRING,reg_code:STRING,reg_name:STRING,"
    "categ:STRING,ptot:FLOAT,tranche_population:STRING,agregat:STRING,"
    "montant:FLOAT,montant_bp:FLOAT,montant_ba:FLOAT,euros_par_habitant:FLOAT"
)

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "cache" / "wip" / "national" / "ofgl"

LATEST_YEARS = [2024, 2023]


def _agregat_filter() -> str:
    quoted = ", ".join(f'"{a}"' for a in AGREGATS)
    return f"agregat IN ({quoted})"


def expected_count(year: int) -> int:
    where = f'year(exer)={year} AND categ="Commune" AND {_agregat_filter()}'
    url = OFGL_RECORDS + "?" + urlencode({"where": where, "limit": 0})
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    return int(r.json().get("total_count", 0))


def download_year(year: int) -> tuple[Path, int]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    out = CACHE_DIR / f"ofgl_{year}.csv"
    where = f'year(exer)={year} AND categ="Commune" AND {_agregat_filter()}'
    url = OFGL_EXPORT + "?" + urlencode(
        {"where": where, "select": SELECT, "delimiter": ";", "use_labels": "false"}
    )
    print(f"  [{year}] streaming OFGL export → {out.name}")
    n_lines = 0
    with requests.get(url, stream=True, timeout=900) as resp:
        resp.raise_for_status()
        with open(out, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                if chunk:
                    f.write(chunk)
                    n_lines += chunk.count(b"\n")
    data_rows = max(n_lines - 1, 0)
    print(f"  [{year}] ~{data_rows:,} rows ({out.stat().st_size / 1024:.0f} KB)")
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
         "--description=National raw data (DGFiP, OFGL, DECP, REI)",
         f"{PROJECT_ID}:{DATASET_ID}"],
        check=False,
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="OFGL consolidee → raw_national (dim + reconcile)")
    ap.add_argument("--years", type=int, nargs="+", default=LATEST_YEARS)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print(f"→ OFGL national sync — years {args.years}, {len(AGREGATS)} aggregates")
    if not args.dry_run:
        ensure_dataset()

    total = 0
    for i, year in enumerate(args.years):
        try:
            exp = expected_count(year)
            print(f"  [{year}] expected rows: {exp:,}")
        except Exception as e:
            print(f"  [{year}] WARN total_count: {e}")
            exp = None
        path, rows = download_year(year)
        if exp is not None and abs(rows - exp) > max(500, exp * 0.01):
            print(f"  [{year}] ⚠️  MISMATCH got ~{rows:,} vs expected {exp:,}")
        total += rows
        if not args.dry_run:
            bq_load(path, replace=(i == 0))

    print(f"\n✓ Done. ~{total:,} rows.")
    if not args.dry_run:
        print(f"  → {PROJECT_ID}.{DATASET_ID}.{TABLE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
