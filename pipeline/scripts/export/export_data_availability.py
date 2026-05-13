#!/usr/bin/env python3
"""
Script d'export du contrat de qualité des données.

Génère data_availability.json avec les informations de disponibilité
et qualité pour chaque dataset par année.

Usage:
    python scripts/export_data_availability.py

Output:
    website/public/data/data_availability.json

Ce fichier permet au website d'afficher des warnings appropriés
quand des données sont manquantes ou incomplètes.
"""

import json
from pathlib import Path
from datetime import datetime
from google.cloud import bigquery

# Configuration
PROJECT_ID = "open-data-france-484717"
DATASET = "dbt_paris_marts"
OUTPUT_PATH = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data" / "data_availability.json"

# Editorial overlay: descriptions, sources, warnings injected by the export.
# These are not part of the underlying data — they belong to the export step.
DATASET_META = {
    "budget": {
        "description": "Budget principal Ville de Paris",
        "source": "OpenData Paris - Budget Mairie Centrale",
        "warnings": {},
    },
    "subventions": {
        "description": "Subventions aux associations",
        "source": "OpenData Paris - Subventions associations votées",
        "warnings": {},  # 2020/2021 incomplete warnings only fire if those years
                          # appear in the data (currently never — filtered out
                          # of core_subventions).
    },
    "ap_projets": {
        "description": "Autorisations de Programme (investissements)",
        "source": "OpenData Paris - Investissements",
        "warnings": {},  # 2023-2024 added below if missing
    },
    "logements": {
        "description": "Logements sociaux financés",
        "source": "OpenData Paris - Logements sociaux",
        "warnings": {},
    },
}


def fetch_availability(client: bigquery.Client) -> list:
    """Fetch availability rows from 4 typed marts (one per dataset).

    Issue #4 cleanup : remplacé l'UNION polymorphe `mart_data_availability`
    par 4 marts typés (mart_data_availability_{budget,subventions,ap_projets,logements}).
    Ajoute une colonne `dataset` synthétique dans la sortie pour rester
    compatible avec build_dataset_section.
    """
    rows = []
    queries = {
        "budget":      "SELECT 'budget' AS dataset, annee, nb_lignes, NULL AS nb_beneficiaires, NULL AS nb_projets, NULL AS nb_operations, NULL AS total_logements, NULL AS nb_geolocalises, total_montant FROM `{p}.{d}.mart_data_availability_budget`",
        "subventions": "SELECT 'subventions' AS dataset, annee, nb_subventions AS nb_lignes, nb_beneficiaires, NULL AS nb_projets, NULL AS nb_operations, NULL AS total_logements, NULL AS nb_geolocalises, total_montant FROM `{p}.{d}.mart_data_availability_subventions`",
        "ap_projets":  "SELECT 'ap_projets' AS dataset, annee, NULL AS nb_lignes, NULL AS nb_beneficiaires, nb_projets, NULL AS nb_operations, NULL AS total_logements, nb_geolocalises, total_montant FROM `{p}.{d}.mart_data_availability_ap_projets`",
        "logements":   "SELECT 'logements' AS dataset, annee, NULL AS nb_lignes, NULL AS nb_beneficiaires, NULL AS nb_projets, nb_operations, total_logements, nb_geolocalises, NULL AS total_montant FROM `{p}.{d}.mart_data_availability_logements`",
    }
    for name, sql in queries.items():
        full = sql.format(p=PROJECT_ID, d=DATASET)
        rows.extend(dict(r) for r in client.query(full).result())
    return rows


def build_dataset_section(name: str, rows: list) -> dict:
    """Build the per-dataset block for a single dataset name."""
    meta = DATASET_META[name]
    years = {}
    warnings_extra: dict = {}
    for r in rows:
        if r["dataset"] != name:
            continue
        year = r["annee"]
        if year is None:
            continue
        if name == "budget":
            years[year] = {
                "status": "complete",
                "nb_lignes": r["nb_lignes"],
                "total_montant": float(r["total_montant"]) if r["total_montant"] else 0,
            }
        elif name == "subventions":
            status = "incomplete" if year in (2020, 2021) else "complete"
            if status == "incomplete":
                warnings_extra[year] = {
                    "severity": "error",
                    "message": f"Données {year} incomplètes : détail des bénéficiaires absent de la source OpenData.",
                    "impact": "Treemap et table bénéficiaires non disponibles pour cette année.",
                }
            years[year] = {
                "status": status,
                "nb_subventions": r["nb_lignes"],
                "nb_beneficiaires": r["nb_beneficiaires"],
                "total_montant": float(r["total_montant"]) if r["total_montant"] else 0,
            }
        elif name == "ap_projets":
            pct_geo = (r["nb_geolocalises"] / r["nb_projets"] * 100) if r["nb_projets"] else 0
            years[year] = {
                "status": "complete",
                "nb_projets": r["nb_projets"],
                "total_montant": float(r["total_montant"]) if r["total_montant"] else 0,
                "pct_geolocalises": round(pct_geo, 1),
            }
        elif name == "logements":
            pct_geo = (r["nb_geolocalises"] / r["nb_operations"] * 100) if r["nb_operations"] else 0
            years[year] = {
                "status": "complete",
                "nb_operations": r["nb_operations"],
                "total_logements": r["total_logements"],
                "pct_geolocalises": round(pct_geo, 1),
            }

    warnings = dict(meta["warnings"])
    warnings.update(warnings_extra)
    if name == "ap_projets":
        current_year = datetime.now().year
        for year in (2023, 2024):
            if year not in years and year <= current_year:
                warnings[year] = {
                    "severity": "warning",
                    "message": f"Données {year} non encore publiées par OpenData Paris.",
                    "impact": "Carte des investissements incomplète pour cette année.",
                }
    return {
        "dataset": name,
        "description": meta["description"],
        "source": meta["source"],
        "years": years,
        "warnings": warnings,
    }


def generate_data_availability():
    """Génère le fichier data_availability.json complet."""
    print("Connexion à BigQuery...")
    client = bigquery.Client(project=PROJECT_ID)

    print("Lecture mart_data_availability...")
    rows = fetch_availability(client)

    result = {
        "generated_at": datetime.now().isoformat(),
        "datasets": {
            name: build_dataset_section(name, rows)
            for name in DATASET_META
        },
        "global_warnings": [
            {
                "type": "paris_centre",
                "message": "Les arrondissements 1-4 sont agrégés en 'Paris Centre' depuis 2020.",
            },
        ],
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Fichier généré: {OUTPUT_PATH}")
    print("\n📊 Résumé de disponibilité:")
    for name, data in result["datasets"].items():
        years_list = sorted(data["years"].keys())
        if years_list:
            print(f"  - {name}: {min(years_list)}-{max(years_list)} ({len(years_list)} années)")
        warnings_count = len(data.get("warnings", {}))
        if warnings_count > 0:
            print(f"    ⚠️  {warnings_count} warning(s)")


if __name__ == "__main__":
    generate_data_availability()
