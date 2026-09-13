#!/usr/bin/env python3
"""
Export national — les taux de taxe foncière votés par chaque commune, dans UN
fichier commité lu côté serveur par le comparateur :

  website/src/data/communes-taux.json
  { annee, communes: { insee: { tfb, tfb_vote, tfb_epci, tfnb, mediane, hist: {annee: tfb} } } }
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from pathlib import Path

from google.cloud import bigquery

PIPELINE_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ID = "open-data-france-484717"
_MARTS = os.environ.get("NATIONAL_MARTS_DATASET", "dbt_paris_national_marts")
MART = f"{PROJECT_ID}.{_MARTS}.mart_taux_fonciers_national"
OUT = PIPELINE_ROOT.parent / "website" / "src" / "data" / "communes-taux.json"
SOURCE_LABEL = "REI — recensement des éléments d'imposition (DGFiP)"
SOURCE_URL = "https://www.data.gouv.fr/datasets/impots-locaux-fichier-de-recensement-des-elements-dimposition-a-la-fiscalite-directe-locale-rei-4"


def main() -> int:
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        p = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
        if p.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(p)
    client = bigquery.Client(project=PROJECT_ID)
    hist: dict[str, dict[int, float]] = defaultdict(dict)
    latest: dict[str, dict] = {}
    for r in client.query(f"SELECT * FROM `{MART}` ORDER BY annee").result():
        if r["tfb_commune"] is not None:
            hist[r["code_insee"]][int(r["annee"])] = round(r["tfb_commune"], 2)
        latest[r["code_insee"]] = {
            "annee": int(r["annee"]),
            "tfb": r["tfb_commune"], "tfb_vote": r["tfb_commune_vote"], "tfb_epci": r["tfb_epci"],
            "tfnb": r["tfnb_commune"], "mediane": r["tfb_commune_mediane"], "epci": r["nom_epci"],
        }
    year = max(v["annee"] for v in latest.values())
    out = {}
    for insee, v in latest.items():
        rnd = lambda x: round(x, 2) if x is not None else None  # noqa: E731
        out[insee] = {"annee": v["annee"], "tfb": rnd(v["tfb"]), "tfb_vote": rnd(v["tfb_vote"]), "tfb_epci": rnd(v["tfb_epci"]),
                      "tfnb": rnd(v["tfnb"]), "mediane": rnd(v["mediane"]), "epci": v["epci"], "hist": hist[insee]}
    json.dump({"source": SOURCE_LABEL, "source_url": SOURCE_URL, "annee": year, "n_communes": len(out), "communes": out},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  ✓ {len(out)} communes, année {year} → {OUT} ({OUT.stat().st_size // 1024} Ko)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
