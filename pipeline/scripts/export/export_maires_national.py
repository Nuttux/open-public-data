#!/usr/bin/env python3
"""
Export national — le maire et la taille du conseil, toutes communes, dans UN
fichier commité (2 Mo) lu côté serveur par la page ville :

  website/src/data/communes-maires.json   { insee: {nom, prenom, depuis, conseillers, adjoints} }

Publié : nom, prénom, date de début de fonction, effectifs. Rien d'autre.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from google.cloud import bigquery

PIPELINE_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ID = "open-data-france-484717"
_MARTS = os.environ.get("PARIS_MARTS_DATASET", "dbt_paris_marts")
MART = f"{PROJECT_ID}.{_MARTS}.mart_maires_national"
OUT = PIPELINE_ROOT.parent / "website" / "src" / "data" / "communes-maires.json"
SOURCE_LABEL = "Répertoire national des élus (ministère de l'Intérieur)"
SOURCE_URL = "https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1"


def main() -> int:
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        p = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
        if p.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(p)
    client = bigquery.Client(project=PROJECT_ID)
    out = {}
    for r in client.query(f"SELECT * FROM `{MART}`").result():
        out[r["code_insee"]] = {
            "nom": r["maire_nom"], "prenom": r["maire_prenom"],
            "depuis": r["maire_depuis"].isoformat() if r["maire_depuis"] else None,
            "conseillers": r["nb_conseillers"], "adjoints": r["nb_adjoints"],
        }
    json.dump({"source": SOURCE_LABEL, "source_url": SOURCE_URL, "n_communes": len(out), "communes": out},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  ✓ {len(out)} communes → {OUT} ({OUT.stat().st_size // 1024} Ko)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
