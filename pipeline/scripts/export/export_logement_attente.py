#!/usr/bin/env python3
"""
Export logement_attente_paris.json — tension SLS par arrondissement.

Source : core_logement_attente_arr (DRIHL 2024)
Output : website/public/data/logement_attente_paris.json

Structure:
    {
      "generated_at": "...",
      "source": "DRIHL",
      "source_url": "...",
      "year": 2024,
      "paris_total": {...},
      "arrondissements": [{arr: 1, ...}, ...],
      "methodology": {
        "delai_median_caveat": "...",
        "ratio_definition": "..."
      }
    }
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

PROJECT_ID = "open-data-france-484717"
DATASET = "dbt_paris_marts"
OUTPUT_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "website" / "public" / "data" / "logement_attente_paris.json"
)


def main():
    c = bigquery.Client(project=PROJECT_ID)
    q = f"""
    SELECT * FROM `{PROJECT_ID}.{DATASET}.mart_logement_attente`
    ORDER BY scope DESC, arrondissement ASC
    """
    rows = [dict(r) for r in c.query(q).result()]

    paris_total = None
    arr_rows = []
    for r in rows:
        if r["scope"] == "paris_total":
            paris_total = r
        elif r["scope"] == "arrondissement":
            arr_rows.append(r)

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "year": paris_total["annee"] if paris_total else None,
        "source": paris_total["source"] if paris_total else None,
        "source_url": paris_total["source_url"] if paris_total else None,
        "paris_total": paris_total,
        "arrondissements": arr_rows,
        "methodology": {
            "ratio_definition": (
                "Rapport entre demandes actives de logement social au 31/12 "
                "(ciblant ce territoire en choix 1) et attributions réalisées "
                "dans l'année. Un ratio de 20 signifie : 20 ménages demandent "
                "pour 1 attribution annuelle."
            ),
            "delai_median_caveat": (
                "Le délai médian d'attribution ne concerne QUE les ménages ayant "
                "été attribués. Les demandeurs qui renoncent, déménagent ou "
                "restent en file d'attente ne sont pas comptés. Indicateur à "
                "interpréter avec prudence — biais du survivant."
            ),
            "part_anciennete_definition": (
                "Part des demandeurs actifs au 31/12 dont la demande a été "
                "déposée il y a 5 ans ou plus. Indicateur non biaisé sur la "
                "réalité de l'attente longue."
            ),
        },
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2, default=str)
    print(f"✓ {OUTPUT_PATH}")
    print(f"  Paris total : {paris_total['demandes_choix1']:,} demandes / "
          f"{paris_total['attributions']:,} attributions "
          f"(ratio {paris_total['ratio_dem_attrib']:.1f})")
    print(f"  {len(arr_rows)} arrondissements")


if __name__ == "__main__":
    main()
