#!/usr/bin/env python3
"""
National ingest — REI (recensement des éléments d'imposition à la fiscalité
directe locale, DGFiP) → raw_national.rei_taux (BigQuery).

Une archive zip par année sur data.economie.gouv.fr (pièces jointes du jeu
« Impôts locaux : fichier REI »), contenant REI_{année}.csv (1 043 colonnes,
latin-1, « ; »). On ne garde que les taux qui parlent à un habitant :

  E12      taxe foncière sur le bâti, taux appliqué par la commune (%)
  E12VOTE  idem, taux voté (différent en cas de convergence après fusion)
  E32      taxe foncière sur le bâti, taux de l'intercommunalité (%)
  B12      taxe foncière sur le non-bâti, taux de la commune (%)

Usage :
    python scripts/sync/sync_rei_taux.py --years 2025 2024 2023 2022 2021
"""
from __future__ import annotations

import argparse
import csv
import io
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

PROJECT_ID = "open-data-france-484717"
DATASET_ID = "raw_national"
TABLE = "rei_taux"
URL = "https://data.economie.gouv.fr/api/v2/catalog/datasets/impots-locaux-fichier-de-recensement-des-elements-dimposition-a-la-fiscalite-dir/attachments/rei_{year}_fichier_notice_trace{suffix}"
SUFFIXES = ["zip", "_zip"]
KEEP = ["DEP", "COM", "LIBCOM", "SIREPCI", "Q03", "E12", "E12VOTE", "E32", "B12"]
BQ_SCHEMA = "annee:INTEGER,dep:STRING,com:STRING,libcom:STRING,siren_epci:STRING,nom_epci:STRING,tfb_commune:FLOAT,tfb_commune_vote:FLOAT,tfb_epci:FLOAT,tfnb_commune:FLOAT"
ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "cache" / "wip" / "national" / "rei"


def num(x: str) -> str:
    x = (x or "").strip().replace(",", ".")
    try:
        return str(float(x))
    except ValueError:
        return ""


def fetch_zip(year: int) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    out = CACHE_DIR / f"rei_{year}.zip"
    if out.exists() and out.stat().st_size > 1e6:
        return out
    for suf in SUFFIXES:
        try:
            urllib.request.urlretrieve(URL.format(year=year, suffix=suf), out)
            if out.stat().st_size > 1e6:
                return out
        except Exception as e:  # noqa: BLE001
            print(f"  [{year}] {suf}: {e}")
    raise SystemExit(f"[{year}] archive REI introuvable")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, nargs="+", default=[2025, 2024, 2023])
    args = ap.parse_args()
    out = CACHE_DIR / "rei_taux.csv"
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["annee", "dep", "com", "libcom", "siren_epci", "nom_epci", "tfb_commune", "tfb_commune_vote", "tfb_epci", "tfnb_commune"])
        for year in args.years:
            z = fetch_zip(year)
            with zipfile.ZipFile(z) as zf:
                name = next((m for m in zf.namelist() if m.lower().endswith(".csv")), None)
                if not name:
                    # 2022 et avant : un tableur Excel de 140 Mo à la place du CSV — ignoré.
                    print(f"  [{year}] pas de CSV dans l'archive ({zf.namelist()}) — année sautée")
                    continue
                raw = zf.read(name).decode("latin-1")
            reader = csv.DictReader(io.StringIO(raw), delimiter=";")
            missing = [k for k in KEEP if k not in (reader.fieldnames or [])]
            if missing:
                print(f"  [{year}] colonnes absentes : {missing} — année sautée")
                continue
            k = 0
            for row in reader:
                w.writerow([year, row["DEP"].strip(), row["COM"].strip(), row["LIBCOM"].strip(), row["SIREPCI"].strip(), row["Q03"].strip(),
                            num(row["E12"]), num(row["E12VOTE"]), num(row["E32"]), num(row["B12"])])
                k += 1
            print(f"  [{year}] {k:,} communes")
            n += k
    print(f"  {n:,} lignes → {out.name}")
    subprocess.run(["bq", "load", "--replace", "--source_format=CSV", "--skip_leading_rows=1", f"--project_id={PROJECT_ID}",
                    f"{DATASET_ID}.{TABLE}", str(out), BQ_SCHEMA], check=True)
    print(f"✓ {PROJECT_ID}.{DATASET_ID}.{TABLE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
