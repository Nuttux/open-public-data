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
DATASET = "dbt_paris"
OUTPUT_PATH = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data" / "data_availability.json"


def check_budget_availability(client: bigquery.Client) -> dict:
    """
    Vérifie la disponibilité des données budget par année.
    Le budget principal est complet pour toutes les années publiées.
    """
    query = f"""
    SELECT 
        annee,
        COUNT(*) as nb_lignes,
        SUM(montant) as total_montant
    FROM `{PROJECT_ID}.{DATASET}.core_budget`
    GROUP BY annee
    ORDER BY annee
    """
    
    years = {}
    for row in client.query(query).result():
        years[row.annee] = {
            "status": "complete",
            "nb_lignes": row.nb_lignes,
            "total_montant": float(row.total_montant) if row.total_montant else 0,
        }
    
    return {
        "dataset": "budget",
        "description": "Budget principal Ville de Paris",
        "source": "OpenData Paris - Budget Mairie Centrale",
        "years": years,
        "warnings": {},  # Aucun warning connu pour le budget
    }


def check_subventions_availability(client: bigquery.Client) -> dict:
    """
    Vérifie la disponibilité des données subventions par année.
    2020-2021: données agrégées seulement, pas de détail bénéficiaires.
    """
    # Vérifier les totaux par année
    query = f"""
    SELECT 
        annee,
        COUNT(*) as nb_subventions,
        COUNT(DISTINCT beneficiaire) as nb_beneficiaires,
        SUM(montant) as total_montant
    FROM `{PROJECT_ID}.{DATASET}.core_subventions`
    GROUP BY annee
    ORDER BY annee
    """
    
    years = {}
    warnings = {}
    
    for row in client.query(query).result():
        year = row.annee
        
        # 2020-2021: données incomplètes (pas de détail bénéficiaires dans source)
        if year in [2020, 2021]:
            status = "incomplete"
            warnings[year] = {
                "severity": "error",
                "message": f"Données {year} incomplètes : détail des bénéficiaires absent de la source OpenData.",
                "impact": "Treemap et table bénéficiaires non disponibles pour cette année.",
            }
        else:
            status = "complete"
        
        years[year] = {
            "status": status,
            "nb_subventions": row.nb_subventions,
            "nb_beneficiaires": row.nb_beneficiaires,
            "total_montant": float(row.total_montant) if row.total_montant else 0,
        }
    
    return {
        "dataset": "subventions",
        "description": "Subventions aux associations",
        "source": "OpenData Paris - Subventions associations votées",
        "years": years,
        "warnings": warnings,
    }


def check_ap_projets_availability(client: bigquery.Client) -> dict:
    """
    Vérifie la disponibilité des données AP/Investissements par année.
    2023-2024: données pas encore publiées par OpenData Paris.
    """
    query = f"""
    SELECT 
        annee,
        COUNT(*) as nb_projets,
        SUM(montant) as total_montant,
        COUNTIF(ode_arrondissement IS NOT NULL) as nb_geolocalises
    FROM `{PROJECT_ID}.{DATASET}.core_ap_projets`
    GROUP BY annee
    ORDER BY annee
    """
    
    years = {}
    warnings = {}
    
    for row in client.query(query).result():
        year = row.annee
        pct_geo = (row.nb_geolocalises / row.nb_projets * 100) if row.nb_projets > 0 else 0
        
        years[year] = {
            "status": "complete",
            "nb_projets": row.nb_projets,
            "total_montant": float(row.total_montant) if row.total_montant else 0,
            "pct_geolocalises": round(pct_geo, 1),
        }
    
    # Ajouter warnings pour années manquantes (2023-2024)
    current_year = datetime.now().year
    for year in [2023, 2024]:
        if year not in years and year <= current_year:
            warnings[year] = {
                "severity": "warning",
                "message": f"Données {year} non encore publiées par OpenData Paris.",
                "impact": "Carte des investissements incomplète pour cette année.",
            }
    
    return {
        "dataset": "ap_projets",
        "description": "Autorisations de Programme (investissements)",
        "source": "OpenData Paris - Investissements",
        "years": years,
        "warnings": warnings,
    }


def check_logements_availability(client: bigquery.Client) -> dict:
    """
    Vérifie la disponibilité des données logements sociaux.
    Données déjà géolocalisées dans la source.
    """
    query = f"""
    SELECT 
        annee_financement as annee,
        COUNT(*) as nb_operations,
        SUM(nombre_logements) as total_logements,
        COUNTIF(latitude IS NOT NULL) as nb_geolocalises
    FROM `{PROJECT_ID}.{DATASET}.core_logements_sociaux`
    WHERE annee_financement IS NOT NULL
    GROUP BY annee_financement
    ORDER BY annee_financement
    """
    
    years = {}
    
    for row in client.query(query).result():
        if row.annee is None:
            continue
        pct_geo = (row.nb_geolocalises / row.nb_operations * 100) if row.nb_operations > 0 else 0
        
        years[row.annee] = {
            "status": "complete",
            "nb_operations": row.nb_operations,
            "total_logements": row.total_logements,
            "pct_geolocalises": round(pct_geo, 1),
        }
    
    return {
        "dataset": "logements",
        "description": "Logements sociaux financés",
        "source": "OpenData Paris - Logements sociaux",
        "years": years,
        "warnings": {},
    }


def generate_data_availability():
    """
    Génère le fichier data_availability.json complet.
    """
    print("Connexion à BigQuery...")
    client = bigquery.Client(project=PROJECT_ID)
    
    print("Vérification disponibilité budget...")
    budget = check_budget_availability(client)
    
    print("Vérification disponibilité subventions...")
    subventions = check_subventions_availability(client)
    
    print("Vérification disponibilité AP/investissements...")
    ap_projets = check_ap_projets_availability(client)
    
    print("Vérification disponibilité logements...")
    logements = check_logements_availability(client)
    
    # Assembler le résultat
    result = {
        "generated_at": datetime.now().isoformat(),
        "datasets": {
            "budget": budget,
            "subventions": subventions,
            "ap_projets": ap_projets,
            "logements": logements,
        },
        "global_warnings": [
            {
                "type": "paris_centre",
                "message": "Les arrondissements 1-4 sont agrégés en 'Paris Centre' depuis 2020.",
            },
        ],
    }
    
    # Sauvegarder
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ Fichier généré: {OUTPUT_PATH}")
    
    # Résumé
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
