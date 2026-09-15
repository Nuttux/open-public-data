#!/usr/bin/env python3
"""
Export national — le maire et la taille du conseil, toutes communes, dans UN
fichier commité (3 Mo) lu côté serveur par la page ville :

  website/src/data/communes-maires.json
    { insee: {nom, prenom, depuis, depuis_premier, borne, mandats, conseillers, adjoints} }

Publié : nom, prénom, date de début de fonction, effectifs. Rien d'autre.

Depuis quand (2026-09-15) : `depuis` reste la date de début de la fonction en
cours (RNE courant) ; `mandats` (années, croissantes), `depuis_premier` et
`borne` viennent de la chaîne de la même personne à travers les versions
archivées du répertoire (mart_maires_national). Le bloc racine
`source_history` cite ces versions (date de publication, adresse archivée)
pour que la page puisse dire d'où vient « depuis 2014 au moins ».
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from google.cloud import bigquery

PIPELINE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PIPELINE_ROOT / "scripts" / "sync"))
from sync_rne_maires_historique import CAPTURES, archived_url, snapshot_date_of  # noqa: E402

PROJECT_ID = "open-data-france-484717"
_MARTS = os.environ.get("NATIONAL_MARTS_DATASET", "dbt_paris_national_marts")
MART = f"{PROJECT_ID}.{_MARTS}.mart_maires_national"
OUT = PIPELINE_ROOT.parent / "website" / "src" / "data" / "communes-maires.json"
SOURCE_LABEL = "Répertoire national des élus (ministère de l'Intérieur)"
SOURCE_URL = "https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1"
SOURCE_HISTORY_LABEL = "Répertoire national des élus, versions archivées du fichier des maires (Wayback Machine)"


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
            "depuis_premier": r["maire_depuis_premier"].isoformat() if r["maire_depuis_premier"] else None,
            "borne": bool(r["maire_depuis_borne"]),
            "mandats": [int(y) for y in (r["mandats"] or "").split(",") if y],
            "conseillers": r["nb_conseillers"], "adjoints": r["nb_adjoints"],
        }
    source_history = {
        "label": SOURCE_HISTORY_LABEL,
        "captures": [{"date": snapshot_date_of(url), "url": archived_url(ts, url)} for ts, url in CAPTURES],
    }
    json.dump({"source": SOURCE_LABEL, "source_url": SOURCE_URL, "source_history": source_history,
               "n_communes": len(out), "communes": out},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    n_multi = sum(1 for m in out.values() if len(m["mandats"]) > 1)
    print(f"  ✓ {len(out)} communes ({n_multi} à plusieurs mandats) → {OUT} ({OUT.stat().st_size // 1024} Ko)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
