#!/usr/bin/env python3
"""
Script d'export des données budget par nature depuis BigQuery vers JSON.

Exporte les données depuis mart_budget_nature pour le composant NatureDonut:
- budget_nature_{year}.json : Données pour visualisation donut avec drill-down
- budget_nature_index.json : Index des années disponibles et métadonnées

Structure du JSON de sortie:
{
  "year": 2024,
  "total_depenses": 11500000000,
  "niveau_1": [
    { "nature": "Personnel", "montant": 5000000000, "pct": 43.5 }
  ],
  "niveau_2": {
    "Personnel": [
      { "thematique": "Éducation", "montant": 1500000000, "pct": 30.0 }
    ]
  }
}

Usage:
    python scripts/export/export_budget_nature.py [--year 2024]

Prérequis:
    - Google Cloud credentials configurées
    - Tables dbt existantes (dbt run --select mart_budget_nature)
"""

import json
import argparse
import sys
from pathlib import Path
from datetime import datetime
from google.cloud import bigquery

# Ajouter le chemin pour les utils
sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger

# Configuration
PROJECT_ID = "open-data-france-484717"
DATASET = "dbt_paris"
OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data"


def fetch_budget_nature_data(client: bigquery.Client, year: int = None) -> list:
    """
    Récupère les données budget par nature depuis mart_budget_nature.
    
    Args:
        client: Client BigQuery
        year: Année spécifique (optionnel, sinon toutes les années)
    
    Returns:
        Liste des enregistrements avec niveau, nature, thématique et montant
    """
    year_filter = f"WHERE annee = {year}" if year else ""
    
    query = f"""
    SELECT
        niveau,
        annee,
        nature,
        thematique,
        montant,
        nb_lignes
    FROM `{PROJECT_ID}.{DATASET}.mart_budget_nature`
    {year_filter}
    ORDER BY annee DESC, niveau, montant DESC
    """
    
    results = []
    for row in client.query(query).result():
        results.append({
            "niveau": row.niveau,
            "annee": row.annee,
            "nature": row.nature or "Autre",
            "thematique": row.thematique,
            "montant": float(row.montant) if row.montant else 0,
            "nb_lignes": row.nb_lignes,
        })
    
    return results


def get_available_years(client: bigquery.Client) -> list:
    """Récupère les années disponibles dans les données."""
    query = f"""
    SELECT DISTINCT annee
    FROM `{PROJECT_ID}.{DATASET}.mart_budget_nature`
    ORDER BY annee DESC
    """
    return [row.annee for row in client.query(query).result()]


def transform_for_donut(data: list, year: int) -> dict:
    """
    Transforme les données brutes en structure optimisée pour le donut.
    
    Args:
        data: Données brutes de BigQuery
        year: Année à traiter
    
    Returns:
        Structure prête pour le composant NatureDonut
    """
    # Filtrer pour l'année
    year_data = [d for d in data if d["annee"] == year]
    
    # Séparer niveau 1 et niveau 2
    niveau_1_data = [d for d in year_data if d["niveau"] == "niveau_1"]
    niveau_2_data = [d for d in year_data if d["niveau"] == "niveau_2"]
    
    # Total des dépenses
    total = sum(d["montant"] for d in niveau_1_data)
    
    # Niveau 1: par nature avec pourcentage
    niveau_1 = []
    for d in sorted(niveau_1_data, key=lambda x: -x["montant"]):
        pct = (d["montant"] / total * 100) if total > 0 else 0
        niveau_1.append({
            "nature": d["nature"],
            "montant": d["montant"],
            "pct": round(pct, 1),
        })
    
    # Niveau 2: groupé par nature
    niveau_2 = {}
    for d in niveau_2_data:
        nature = d["nature"]
        if nature not in niveau_2:
            niveau_2[nature] = []
        
        # Calculer le pourcentage par rapport au total de cette nature
        nature_total = next(
            (n["montant"] for n in niveau_1 if n["nature"] == nature), 
            0
        )
        pct = (d["montant"] / nature_total * 100) if nature_total > 0 else 0
        
        niveau_2[nature].append({
            "thematique": d["thematique"] or "Autre",
            "montant": d["montant"],
            "pct": round(pct, 1),
        })
    
    # Trier chaque liste de niveau 2 par montant décroissant
    for nature in niveau_2:
        niveau_2[nature] = sorted(niveau_2[nature], key=lambda x: -x["montant"])
    
    return {
        "year": year,
        "generated_at": datetime.now().isoformat(),
        "total_depenses": total,
        "nb_natures": len(niveau_1),
        "niveau_1": niveau_1,
        "niveau_2": niveau_2,
    }


def export_index(client: bigquery.Client, years: list) -> dict:
    """Exporte l'index des données budget par nature."""
    
    # Récupérer les totaux par année
    totals_by_year = {}
    query = f"""
    SELECT annee, SUM(montant) as total
    FROM `{PROJECT_ID}.{DATASET}.mart_budget_nature`
    WHERE niveau = 'niveau_1'
    GROUP BY annee
    ORDER BY annee DESC
    """
    for row in client.query(query).result():
        totals_by_year[row.annee] = float(row.total)
    
    # Récupérer la liste des natures disponibles
    natures = []
    query = f"""
    SELECT DISTINCT nature, SUM(montant) as total
    FROM `{PROJECT_ID}.{DATASET}.mart_budget_nature`
    WHERE niveau = 'niveau_1'
    GROUP BY nature
    ORDER BY total DESC
    """
    for row in client.query(query).result():
        natures.append(row.nature)
    
    index = {
        "generated_at": datetime.now().isoformat(),
        "source": "dbt mart (mart_budget_nature)",
        "description": "Répartition du budget par nature de dépense avec drill-down par thématique",
        "available_years": years,
        "totals_by_year": totals_by_year,
        "natures": natures,
    }
    
    output_file = OUTPUT_DIR / "budget_nature_index.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    
    return index


def export_year(data: list, year: int, log: Logger):
    """Exporte les données pour une année spécifique."""
    
    output = transform_for_donut(data, year)
    
    output_file = OUTPUT_DIR / f"budget_nature_{year}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    total_mds = output["total_depenses"] / 1e9
    log.success(f"Année {year}", extra=f"{output['nb_natures']} natures, {total_mds:.1f} Md€")


def main():
    """Point d'entrée principal."""
    parser = argparse.ArgumentParser(description="Export données budget par nature depuis dbt")
    parser.add_argument('--year', type=int, help="Année spécifique (sinon toutes)")
    args = parser.parse_args()
    
    log = Logger("export_budget_nature")
    log.header("Export Budget par Nature → JSON")
    
    # Créer le dossier de sortie
    log.info("Dossier de sortie", extra=str(OUTPUT_DIR))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Client BigQuery
    log.section("Connexion BigQuery")
    client = bigquery.Client(project=PROJECT_ID)
    log.success("Connecté", extra=PROJECT_ID)
    
    # Récupérer les années disponibles
    available_years = get_available_years(client)
    years = [args.year] if args.year else available_years
    log.info("Années à traiter", extra=", ".join(map(str, years)))
    
    # Récupérer toutes les données
    log.section("Récupération des données")
    all_data = fetch_budget_nature_data(client)
    log.success("Données récupérées", extra=f"{len(all_data)} lignes")
    
    # Export de l'index
    log.section("Génération de l'index")
    export_index(client, available_years)
    log.success("Index créé", extra="budget_nature_index.json")
    
    # Export par année
    log.section(f"Export par année ({len(years)} années)")
    for i, year in enumerate(years, 1):
        log.progress(i, len(years), f"Année {year}")
        export_year(all_data, year, log)
    
    log.summary()


if __name__ == "__main__":
    main()
