#!/usr/bin/env python3
"""
Export Evolution Data for Paris Budget Dashboard

This script queries the mart_evolution_budget model to generate JSON files 
for the evolution page with:
- Yearly totals (recettes, dépenses, solde)
- Section breakdown (Fonctionnement vs Investissement)
- Financial metrics (épargne brute, surplus/déficit financier)

Key concepts:
- Épargne brute = Recettes fonctionnement - Dépenses fonctionnement
  (capacité d'autofinancement de la collectivité)
- Surplus/Déficit financier = Recettes propres (hors emprunts) - Dépenses
  (santé financière réelle, emprunts exclus)
- Solde comptable = Recettes totales - Dépenses totales
  (équilibre technique, toujours proche de 0)

Usage:
    python pipeline/scripts/export/export_evolution_data.py

Output:
    website/public/data/evolution_budget.json
"""

import json
import os
from pathlib import Path
from google.cloud import bigquery
from datetime import datetime

# Import logger utility
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger

logger = Logger("export_evolution")

# Configuration
PROJECT_ID = "open-data-france-484717"
DATASET_ID = "dbt_paris"
OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data"

YEARS = [2024, 2023, 2022, 2021, 2020, 2019]


def get_bigquery_client():
    """Initialize BigQuery client."""
    return bigquery.Client(project=PROJECT_ID)


def fetch_evolution_data(client: bigquery.Client) -> dict:
    """
    Fetch evolution data from mart_evolution_budget.
    
    Returns dict with:
    - par_annee: yearly totals
    - metriques: financial metrics (épargne brute, surplus/déficit)
    - par_section: breakdown by section
    """
    logger.info("Fetching evolution data from BigQuery...")
    
    # Query for all views
    query = f"""
    SELECT
        vue,
        annee,
        sens_flux,
        section,
        thematique_macro,
        montant_total,
        nb_lignes,
        variation_pct,
        montant_annee_prec,
        epargne_brute,
        recettes_propres,
        surplus_deficit
    FROM `{PROJECT_ID}.{DATASET_ID}.mart_evolution_budget`
    WHERE annee IN ({','.join(str(y) for y in YEARS)})
    ORDER BY vue, annee, sens_flux, section
    """
    
    results = client.query(query).result()
    
    data = {
        "par_annee": [],      # Totaux par année
        "metriques": [],      # Métriques financières
        "par_section": [],    # Par section
        "par_thematique": [], # Par thématique
    }
    
    for row in results:
        if row.vue == "par_sens":
            data["par_annee"].append({
                "annee": row.annee,
                "sens_flux": row.sens_flux,
                "montant": float(row.montant_total) if row.montant_total else 0,
                "variation_pct": float(row.variation_pct) if row.variation_pct else None,
            })
        elif row.vue == "metriques":
            data["metriques"].append({
                "annee": row.annee,
                "epargne_brute": float(row.epargne_brute) if row.epargne_brute else 0,
                "recettes_propres": float(row.recettes_propres) if row.recettes_propres else 0,
                "surplus_deficit": float(row.surplus_deficit) if row.surplus_deficit else 0,
            })
        elif row.vue == "par_section":
            data["par_section"].append({
                "annee": row.annee,
                "section": row.section,
                "sens_flux": row.sens_flux,
                "montant": float(row.montant_total) if row.montant_total else 0,
            })
        elif row.vue == "par_thematique":
            data["par_thematique"].append({
                "annee": row.annee,
                "sens_flux": row.sens_flux,
                "thematique": row.thematique_macro,
                "montant": float(row.montant_total) if row.montant_total else 0,
            })
    
    logger.info(f"  - {len(data['par_annee'])} rows par_annee")
    logger.info(f"  - {len(data['metriques'])} rows métriques")
    logger.info(f"  - {len(data['par_section'])} rows par_section")
    logger.info(f"  - {len(data['par_thematique'])} rows par_thematique")
    
    return data


def transform_for_frontend(raw_data: dict) -> dict:
    """
    Transform raw data into frontend-friendly structure.
    
    Output structure:
    {
        "generated_at": "...",
        "years": [
            {
                "year": 2024,
                "totals": {
                    "recettes": 11526790953,
                    "depenses": 11494727617,
                    "solde_comptable": 32063336,  # recettes - dépenses
                    "recettes_propres": 10309899151,  # recettes - emprunts
                    "surplus_deficit": -1184828466,  # recettes propres - dépenses
                    "emprunts": 1216891802
                },
                "epargne_brute": 266900000,  # fonct recettes - fonct dépenses
                "sections": {
                    "fonctionnement": { "recettes": ..., "depenses": ... },
                    "investissement": { "recettes": ..., "depenses": ... }
                }
            },
            ...
        ]
    }
    """
    logger.info("Transforming data for frontend...")
    
    # Build year-indexed structure
    years_data = {}
    
    # Process par_annee (totals)
    for row in raw_data["par_annee"]:
        year = row["annee"]
        if year not in years_data:
            years_data[year] = {
                "year": year,
                "totals": {"recettes": 0, "depenses": 0},
                "sections": {
                    "fonctionnement": {"recettes": 0, "depenses": 0},
                    "investissement": {"recettes": 0, "depenses": 0}
                },
                "variations": {}
            }
        
        if row["sens_flux"] == "Recette":
            years_data[year]["totals"]["recettes"] = row["montant"]
            years_data[year]["variations"]["recettes_pct"] = row["variation_pct"]
        elif row["sens_flux"] == "Dépense":
            years_data[year]["totals"]["depenses"] = row["montant"]
            years_data[year]["variations"]["depenses_pct"] = row["variation_pct"]
    
    # Process metriques
    for row in raw_data["metriques"]:
        year = row["annee"]
        if year in years_data:
            years_data[year]["epargne_brute"] = row["epargne_brute"]
            years_data[year]["totals"]["recettes_propres"] = row["recettes_propres"]
            years_data[year]["totals"]["surplus_deficit"] = row["surplus_deficit"]
            # Calculate emprunts
            years_data[year]["totals"]["emprunts"] = (
                years_data[year]["totals"]["recettes"] - row["recettes_propres"]
            )
    
    # Process par_section
    for row in raw_data["par_section"]:
        year = row["annee"]
        section = row["section"].lower() if row["section"] else "autre"
        
        if year in years_data and section in years_data[year]["sections"]:
            if row["sens_flux"] == "Recette":
                years_data[year]["sections"][section]["recettes"] = row["montant"]
            elif row["sens_flux"] == "Dépense":
                years_data[year]["sections"][section]["depenses"] = row["montant"]
    
    # Calculate solde comptable for each year
    for year_data in years_data.values():
        year_data["totals"]["solde_comptable"] = (
            year_data["totals"]["recettes"] - year_data["totals"]["depenses"]
        )
    
    # Sort by year descending
    sorted_years = sorted(years_data.values(), key=lambda x: x["year"], reverse=True)
    
    result = {
        "generated_at": datetime.now().isoformat(),
        "source": "mart_evolution_budget",
        "description": "Données d'évolution du budget de Paris avec métriques financières",
        "definitions": {
            "solde_comptable": "Recettes totales - Dépenses totales (équilibre technique)",
            "recettes_propres": "Recettes totales - Emprunts (ressources réelles)",
            "surplus_deficit": "Recettes propres - Dépenses (santé financière réelle)",
            "epargne_brute": "Recettes fonct. - Dépenses fonct. (capacité d'autofinancement)"
        },
        "years": sorted_years
    }
    
    logger.info(f"  - {len(sorted_years)} years processed")
    
    return result


def save_json(data: dict, filename: str):
    """Save data to JSON file."""
    output_path = OUTPUT_DIR / filename
    
    # Ensure directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    size_kb = output_path.stat().st_size / 1024
    logger.info(f"Saved {filename} ({size_kb:.1f} KB)")


def main():
    """Main export function."""
    logger.info("=" * 60)
    logger.info("Export Evolution Budget Data")
    logger.info("=" * 60)
    
    try:
        client = get_bigquery_client()
        
        # Fetch data
        raw_data = fetch_evolution_data(client)
        
        # Transform
        frontend_data = transform_for_frontend(raw_data)
        
        # Save
        save_json(frontend_data, "evolution_budget.json")
        
        logger.info("=" * 60)
        logger.info("Export completed successfully!")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"Export failed: {e}")
        raise


if __name__ == "__main__":
    main()
