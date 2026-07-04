#!/usr/bin/env python3
"""Régénère le seed APUR SRU (seeds/seed_apur_sru_2001_2019.csv).

Source : APUR — « Chiffres du logement social de 2001 à 2019 »
  https://opendata.apur.org/datasets/Apur::logement-social20012019
  Licence ODbL. 20 arrondissements × 19 millésimes (inventaire SRU au
  1er janvier). Dataset figé : ce script ne sert qu'à reconstruire le
  seed depuis la source si besoin (audit, correction).

Le taux n'est PAS calculé ici — il est dérivé en couche core
(core_logement_sru_arr), le seed ne porte que les comptages bruts.
"""

from __future__ import annotations

import csv
import json
import sys
import urllib.request
from pathlib import Path

API_URL = (
    "https://carto2.apur.org/apur/rest/services/LOGEMENT_SOCIAL/"
    "logement_social20012019/MapServer/0/query"
    "?where=1%3D1&outFields=*&returnGeometry=false&f=json"
)
SOURCE = "APUR - Chiffres du logement social 2001-2019 (inventaire SRU au 1er janvier)"
SOURCE_URL = "https://opendata.apur.org/datasets/Apur::logement-social20012019"
LICENCE = "ODbL"
YEARS = list(range(2001, 2020))

OUT_PATH = Path(__file__).resolve().parents[2] / "seeds" / "seed_apur_sru_2001_2019.csv"


def main() -> int:
    req = urllib.request.Request(API_URL, headers={"User-Agent": "open-public-data pipeline"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.load(resp)

    features = payload.get("features", [])
    if len(features) != 20:
        print(f"ERREUR: {len(features)} enregistrements APUR (attendu: 20)", file=sys.stderr)
        return 1

    rows = []
    for f in features:
        a = f["attributes"]
        arr = int(a["C_AR"])
        for y in YEARS:
            log, rp = a.get(f"log{y}"), a.get(f"rp{y}")
            if log is None or not rp:
                continue
            rows.append(
                {
                    "arrondissement": arr,
                    "label": a.get("l_cab") or f"{arr}e",
                    "annee": y,
                    "logements_sociaux": int(log),
                    "residences_principales": int(rp),
                    "source": SOURCE,
                    "source_url": SOURCE_URL,
                    "licence": LICENCE,
                }
            )

    rows.sort(key=lambda r: (r["arrondissement"], r["annee"]))
    with OUT_PATH.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"OK — {len(rows)} lignes → {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
