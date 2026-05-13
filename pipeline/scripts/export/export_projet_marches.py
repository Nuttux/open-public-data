#!/usr/bin/env python3
"""
Export du matching projet ↔ marchés publics depuis BigQuery vers JSON.

Output : website/public/data/map/projet_marches.json
  { projets: { [projet_id]: [ {numero_marche, fournisseur, montant, ccag, ...}, ... ] } }

Usage:
    python pipeline/scripts/export/export_projet_marches.py
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from google.cloud import bigquery

PROJECT_ID = "open-data-france-484717"
DATASET = "dbt_paris_marts"
OUTPUT = Path(__file__).resolve().parents[3] / "website" / "public" / "data" / "map" / "projet_marches.json"


def main() -> None:
    client = bigquery.Client(project=PROJECT_ID)
    query = f"""
    SELECT *
    FROM `{PROJECT_ID}.{DATASET}.mart_projet_marches`
    ORDER BY projet_id, score DESC
    """
    by_projet: dict[str, list[dict]] = defaultdict(list)
    total = 0
    for row in client.query(query).result():
        rec = {
            "numero_marche": row.numero_marche,
            "fournisseur_nom": row.fournisseur_nom,
            "fournisseur_siret": row.fournisseur_siret,
            "objet": row.marche_objet,
            "annee": row.marche_annee,
            "montant_max": float(row.marche_montant_max) if row.marche_montant_max else 0,
            "montant_notifie": float(row.marche_montant_notifie) if row.marche_montant_notifie else None,
            "date_notification": str(row.marche_date_notification) if row.marche_date_notification else None,
            "duree_jours": row.marche_duree_jours,
            "ccag": row.marche_ccag,
            "cpv_famille": row.marche_cpv_famille,
            "lieu_execution": row.marche_lieu_execution,
            "score": float(row.score) if row.score else 0,
            "label": row.label,
        }
        by_projet[row.projet_id].append(rec)
        total += 1

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(
            {
                "generated_at": datetime.now().isoformat(),
                "source": "mart_projet_marches (matching heuristique Claude in-session)",
                "disclaimer": (
                    "Rapprochement automatique projet↔marché par heuristiques "
                    "(tokens + score). Peut contenir des erreurs. Seuil >= 0.60."
                ),
                "nb_projets": len(by_projet),
                "nb_matches": total,
                "projets": by_projet,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    print(f"Written {total} matches across {len(by_projet)} projects → {OUTPUT.relative_to(OUTPUT.parents[4])}")


if __name__ == "__main__":
    main()
