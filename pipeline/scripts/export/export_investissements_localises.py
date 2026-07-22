#!/usr/bin/env python3
"""
Export investissements_localises_{year}.json — projets PDF Annexe IL.

Source: mart_investissements_localises (BigQuery), alimenté par
  raw.pdf_investissements_localises_paris ← sync_pdf_investissements_localises.py

Output:
    website/public/data/map/investissements_localises_{year}.json
    website/public/data/map/investissements_localises_index.json

Usage:
    python pipeline/scripts/export/export_investissements_localises.py
    python pipeline/scripts/export/export_investissements_localises.py --year 2024
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent))
from utils.logger import Logger
from _export_common import get_bigquery_client, data_dir, marts_dataset

PROJECT_ID = "open-data-france-484717"
MARTS_DATASET = marts_dataset()
OUTPUT_DIR = data_dir() / "map"


def fetch_rows(client: bigquery.Client) -> list[dict]:
    query = f"""
    SELECT
        annee_publication, source, extraction_date,
        pages_traitees, pages_il, total_attendu_m_eur,
        ecart_pourcent, validation_ok,
        projet_id, annee, arrondissement,
        chapitre_code, chapitre_libelle, nom_projet,
        montant, type_ap, confidence,
        source_page, source_pdf, date_extraction
    FROM `{PROJECT_ID}.{MARTS_DATASET}.mart_investissements_localises`
    ORDER BY annee_publication DESC, montant DESC
    """
    return [dict(r) for r in client.query(query).result()]


def build_year_payload(year: int, rows: list[dict]) -> dict:
    year_rows = [r for r in rows if r["annee_publication"] == year]
    if not year_rows:
        return None

    # Métadonnées per-year (toutes lignes ont les mêmes valeurs)
    sample = year_rows[0]
    pages_traitees = sample["pages_traitees"]
    pages_il = sample["pages_il"]
    total_attendu_m_eur = sample["total_attendu_m_eur"]
    ecart_pourcent = sample["ecart_pourcent"]
    valide = sample["validation_ok"]
    source = sample["source"]
    extraction_date = sample["extraction_date"]

    # Recompute stats from data
    total_extrait = sum(r["montant"] or 0 for r in year_rows)
    confidences = [r["confidence"] for r in year_rows if r["confidence"] is not None]
    confidence_moyenne = (
        round(sum(confidences) / len(confidences), 2) if confidences else 0.0
    )

    data = []
    for r in year_rows:
        data.append({
            "id": r["projet_id"],
            "annee": r["annee"],
            "arrondissement": r["arrondissement"],
            "chapitre_code": r["chapitre_code"],
            "chapitre_libelle": r["chapitre_libelle"],
            "nom_projet": r["nom_projet"],
            "montant": r["montant"],
            "type_ap": r["type_ap"],
            "confidence": r["confidence"],
            "source_page": r["source_page"],
            "source_pdf": r["source_pdf"],
            "date_extraction": str(r["date_extraction"]) if r["date_extraction"] else None,
        })

    return {
        "year": year,
        "source": source,
        "extraction_date": extraction_date,
        "stats": {
            "pages_traitees": pages_traitees,
            "pages_il": pages_il,
            "projets_extraits": len(data),
            "total_extrait": total_extrait,
            "confidence_moyenne": confidence_moyenne,
        },
        "validation": {
            "total_attendu": total_attendu_m_eur,
            "total_extrait_millions": total_extrait / 1e6,
            "ecart_pourcent": ecart_pourcent,
            "valide": valide,
        },
        "data": data,
    }


def write_index(years: list[int], year_summaries: dict[int, dict], logger: Logger) -> None:
    all_stats = {
        y: {
            "nb_projets": s["stats"]["projets_extraits"],
            "total_millions": s["stats"]["total_extrait"] / 1e6,
            "validation": s["validation"],
        }
        for y, s in year_summaries.items()
    }
    index = {
        "availableYears": sorted(years, reverse=True),
        "source": "Extraction PDF Comptes Administratifs",
        "lastUpdate": datetime.now().strftime("%Y-%m-%d"),
        "yearStats": all_stats,
    }
    out = OUTPUT_DIR / "investissements_localises_index.json"
    out.write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    logger.success(f"Index → {out.relative_to(OUTPUT_DIR.parent.parent.parent)}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int)
    parser.add_argument("--city", default="paris")
    args = parser.parse_args()

    global OUTPUT_DIR, MARTS_DATASET
    OUTPUT_DIR = data_dir(args.city) / "map"
    MARTS_DATASET = marts_dataset(args.city)

    logger = Logger("export_investissements_localises")
    logger.header("Export investissements localisés (Annexe IL PDF)")

    client = get_bigquery_client()
    rows = fetch_rows(client)
    by_year = defaultdict(list)
    for r in rows:
        by_year[r["annee_publication"]].append(r)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    target_years = [args.year] if args.year else sorted(by_year.keys())
    summaries = {}
    for y in target_years:
        payload = build_year_payload(y, rows)
        if payload is None:
            logger.warning(f"Année {y} sans donnée, ignorée")
            continue
        out = OUTPUT_DIR / f"investissements_localises_{y}.json"
        out.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        summaries[y] = payload
        logger.success(f"  {y}: {payload['stats']['projets_extraits']} projets → {out.name}")

    if summaries and not args.year:
        write_index(list(summaries.keys()), summaries, logger)

    logger.success(f"Terminé · {len(summaries)} année(s)")


if __name__ == "__main__":
    main()
