#!/usr/bin/env python3
"""
Recharge UNE année des balances DGFiP dans raw_national.dgfip_balances sans
toucher aux autres : supprime les lignes de l'exercice, retélécharge l'export
jusqu'à ce que le nombre de lignes corresponde au total annoncé par le serveur,
puis charge en mode ajout.

Pourquoi : l'export CSV de data.economie.gouv.fr s'arrête parfois en cours de
route sans erreur (2023 : 2,6 M lignes reçues pour 6,1 M annoncées, le
2026-09-09). sync_dgfip_balances_national.py remplace la table sur sa première
année, il ne peut donc pas servir à réparer une seule année.

Usage :
    python scripts/sync/reload_dgfip_year.py 2023
"""
from __future__ import annotations

import subprocess
import sys

from sync_dgfip_balances_national import (  # même dossier
    DATASET_ID, PROJECT_ID, TABLE, bq_load, download_year, expected_count,
)


def main() -> int:
    year = int(sys.argv[1])
    exp = expected_count(year)
    print(f"[{year}] attendu par le serveur : {exp:,} lignes")
    for attempt in range(1, 6):
        path, rows = download_year(year)
        if abs(rows - exp) <= max(1000, exp * 0.01):
            break
        print(f"[{year}] tentative {attempt} : {rows:,} lignes, export tronqué — on recommence")
    else:
        print(f"[{year}] ÉCHEC : l'export reste tronqué après 5 tentatives")
        return 1
    print(f"[{year}] suppression des lignes existantes…")
    subprocess.run(
        ["bq", "query", f"--project_id={PROJECT_ID}", "--use_legacy_sql=false", "--format=none",
         f"DELETE FROM `{PROJECT_ID}.{DATASET_ID}.{TABLE}` WHERE exer = {year}"],
        check=True,
    )
    bq_load(path, replace=False)
    print(f"✓ [{year}] rechargé ({rows:,} lignes)")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, __file__.rsplit("/", 1)[0])
    sys.exit(main())
