#!/usr/bin/env python3
"""
Export logement_sru_arrondissements.json — taux SRU par arrondissement.

Source : mart_logement_sru (seed APUR 2001-2019 → stg → core → mart)
Output : website/public/data/logement_sru_arrondissements.json

Le millésime 2019 est la dernière ventilation par arrondissement publiée
en open data ; le taux communal officiel plus récent (data.gouv,
inventaire SRU) n'est pas ventilé infra-commune.

Dataset override (dev) : DBT_MARTS_DATASET=dbt_paris_dev_<user>_marts
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

PROJECT_ID = os.environ.get("BQ_PROJECT", "open-data-france-484717")
DATASET = os.environ.get("DBT_MARTS_DATASET", "dbt_paris_marts")
OUTPUT_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "website" / "public" / "data" / "logement_sru_arrondissements.json"
)


def main():
    c = bigquery.Client(project=PROJECT_ID)
    q = f"""
    SELECT arrondissement, label, annee, logements_sociaux,
           residences_principales, taux_sru_pct, source, source_url, licence
    FROM `{PROJECT_ID}.{DATASET}.mart_logement_sru`
    ORDER BY arrondissement ASC, annee ASC
    """
    rows = [dict(r) for r in c.query(q).result()]
    if not rows:
        raise SystemExit("mart_logement_sru est vide — lancer dbt build d'abord ?")

    by_arr: dict[int, dict] = {}
    for r in rows:
        arr = int(r["arrondissement"])
        entry = by_arr.setdefault(arr, {"arr": arr, "label": r["label"], "series": []})
        entry["series"].append(
            {
                "year": int(r["annee"]),
                "logements_sociaux": int(r["logements_sociaux"]),
                "residences_principales": int(r["residences_principales"]),
                "taux_pct": float(r["taux_sru_pct"]),
            }
        )

    arrondissements = []
    for arr in sorted(by_arr):
        e = by_arr[arr]
        e["series"].sort(key=lambda s: s["year"])
        arrondissements.append(
            {"arr": e["arr"], "label": e["label"], "latest": e["series"][-1], "series": e["series"]}
        )

    latest_year = max(a["latest"]["year"] for a in arrondissements)
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": rows[0]["source"],
        "source_url": rows[0]["source_url"],
        "licence": rows[0]["licence"],
        "latest_year": latest_year,
        "note": (
            "Dernière ventilation par arrondissement publiée en open data. "
            "Le taux communal officiel plus récent (data.gouv, inventaire SRU) "
            "n'est pas ventilé par arrondissement."
        ),
        "arrondissements": arrondissements,
    }

    OUTPUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK — {len(arrondissements)} arrondissements, millésime {latest_year} → {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
