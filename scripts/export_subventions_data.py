#!/usr/bin/env python3
"""
Script d'export des données subventions depuis BigQuery vers JSON.

Exporte les données depuis les marts dbt pour le frontend:
- subventions/treemap_{year}.json : Données pour visualisation treemap
- subventions/beneficiaires_{year}.json : Liste filtrée de bénéficiaires
- subventions/index.json : Index des années disponibles et métadonnées filtres

NOTE: Les subventions ne sont PAS géolocalisées car l'adresse du siège
d'une association ne reflète pas où l'action est menée.

Usage:
    python scripts/export_subventions_data.py [--year 2024]

Prérequis:
    - Google Cloud credentials configurées
    - Tables dbt existantes (dbt run --select marts)
"""

import json
import argparse
from pathlib import Path
from datetime import datetime
from google.cloud import bigquery

# Configuration
PROJECT_ID = "open-data-france-484717"
DATASET = "dbt_paris"
OUTPUT_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data" / "subventions"


def fetch_treemap_data(client: bigquery.Client, year: int = None) -> list:
    """
    Récupère les données treemap depuis mart_subventions_treemap.
    
    Args:
        client: Client BigQuery
        year: Année spécifique (optionnel, sinon toutes les années)
    
    Returns:
        Liste des enregistrements par thématique et année
    """
    year_filter = f"WHERE annee = {year}" if year else ""
    
    query = f"""
    SELECT
        annee,
        thematique,
        nb_beneficiaires,
        nb_subventions,
        montant_total,
        pct_total
    FROM `{PROJECT_ID}.{DATASET}.mart_subventions_treemap`
    {year_filter}
    ORDER BY annee DESC, montant_total DESC
    """
    
    results = []
    for row in client.query(query).result():
        results.append({
            "annee": row.annee,
            "thematique": row.thematique or "Autre",
            "nb_beneficiaires": row.nb_beneficiaires,
            "nb_subventions": row.nb_subventions,
            "montant_total": float(row.montant_total) if row.montant_total else 0,
            "pct_total": float(row.pct_total) if row.pct_total else 0,
        })
    
    return results


def fetch_beneficiaires_data(client: bigquery.Client, year: int = None, limit: int = 500) -> list:
    """
    Récupère les bénéficiaires depuis mart_subventions_beneficiaires.
    
    Args:
        client: Client BigQuery
        year: Année spécifique (optionnel)
        limit: Nombre max de bénéficiaires par année (top N par montant)
    
    Returns:
        Liste des bénéficiaires avec filtres et montants
    """
    year_filter = f"WHERE annee = {year}" if year else ""
    
    query = f"""
    SELECT
        annee,
        beneficiaire,
        beneficiaire_normalise,
        nature_juridique,
        direction,
        secteurs_activite,
        thematique,
        sous_categorie,
        source_thematique,
        montant_total,
        nb_subventions,
        objet_principal,
        siret
    FROM `{PROJECT_ID}.{DATASET}.mart_subventions_beneficiaires`
    {year_filter}
    ORDER BY annee DESC, montant_total DESC
    LIMIT {limit * 10 if not year else limit}
    """
    
    results = []
    for row in client.query(query).result():
        results.append({
            "annee": row.annee,
            "beneficiaire": row.beneficiaire,
            "beneficiaire_normalise": row.beneficiaire_normalise,
            "nature_juridique": row.nature_juridique,
            "direction": row.direction,
            "secteurs_activite": row.secteurs_activite,
            "thematique": row.thematique or "Autre",
            "sous_categorie": row.sous_categorie,
            "source_thematique": row.source_thematique,
            "montant_total": float(row.montant_total) if row.montant_total else 0,
            "nb_subventions": row.nb_subventions,
            "objet_principal": row.objet_principal,
            "siret": row.siret,
        })
    
    return results


def get_available_years(client: bigquery.Client) -> list:
    """Récupère les années disponibles dans les données."""
    query = f"""
    SELECT DISTINCT annee
    FROM `{PROJECT_ID}.{DATASET}.mart_subventions_treemap`
    ORDER BY annee DESC
    """
    return [row.annee for row in client.query(query).result()]


def get_filter_options(client: bigquery.Client) -> dict:
    """Récupère les options de filtrage disponibles."""
    
    # Thématiques
    thematiques = []
    query = f"""
    SELECT DISTINCT thematique, SUM(montant_total) as total
    FROM `{PROJECT_ID}.{DATASET}.mart_subventions_treemap`
    WHERE thematique IS NOT NULL
    GROUP BY thematique
    ORDER BY total DESC
    """
    for row in client.query(query).result():
        thematiques.append(row.thematique)
    
    # Natures juridiques
    natures = []
    query = f"""
    SELECT DISTINCT nature_juridique
    FROM `{PROJECT_ID}.{DATASET}.mart_subventions_beneficiaires`
    WHERE nature_juridique IS NOT NULL
    ORDER BY nature_juridique
    """
    for row in client.query(query).result():
        natures.append(row.nature_juridique)
    
    # Directions
    directions = []
    query = f"""
    SELECT DISTINCT direction, COUNT(*) as cnt
    FROM `{PROJECT_ID}.{DATASET}.mart_subventions_beneficiaires`
    WHERE direction IS NOT NULL
    GROUP BY direction
    ORDER BY cnt DESC
    LIMIT 25
    """
    for row in client.query(query).result():
        directions.append(row.direction)
    
    return {
        "thematiques": thematiques,
        "natures_juridiques": natures,
        "directions": directions,
    }


def export_index(client: bigquery.Client):
    """Exporte l'index des données subventions."""
    print("  Génération de l'index...")
    
    years = get_available_years(client)
    filters = get_filter_options(client)
    
    # Totaux par année
    totals_by_year = {}
    query = f"""
    SELECT annee, SUM(montant_total) as total, SUM(nb_subventions) as nb
    FROM `{PROJECT_ID}.{DATASET}.mart_subventions_treemap`
    GROUP BY annee
    ORDER BY annee DESC
    """
    for row in client.query(query).result():
        totals_by_year[row.annee] = {
            "montant_total": float(row.total),
            "nb_subventions": row.nb,
        }
    
    index = {
        "generated_at": datetime.now().isoformat(),
        "source": "dbt marts (mart_subventions_treemap, mart_subventions_beneficiaires)",
        "available_years": years,
        "totals_by_year": totals_by_year,
        "filters": filters,
    }
    
    output_file = OUTPUT_DIR / "index.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    
    print(f"    → {output_file.name}")
    return index


def export_treemap_year(client: bigquery.Client, year: int):
    """Exporte les données treemap pour une année."""
    print(f"  Treemap {year}...")
    
    data = fetch_treemap_data(client, year)
    
    total = sum(d["montant_total"] for d in data)
    
    output = {
        "year": year,
        "generated_at": datetime.now().isoformat(),
        "total_montant": total,
        "nb_thematiques": len(data),
        "data": data,
    }
    
    output_file = OUTPUT_DIR / f"treemap_{year}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"    → {output_file.name} ({len(data)} thématiques, {total/1e6:.1f}M€)")


def export_beneficiaires_year(client: bigquery.Client, year: int, limit: int = 500):
    """Exporte les bénéficiaires pour une année."""
    print(f"  Bénéficiaires {year}...")
    
    data = fetch_beneficiaires_data(client, year, limit)
    
    # Filtrer pour cette année uniquement
    data = [d for d in data if d["annee"] == year][:limit]
    
    total = sum(d["montant_total"] for d in data)
    
    output = {
        "year": year,
        "generated_at": datetime.now().isoformat(),
        "total_montant": total,
        "nb_beneficiaires": len(data),
        "data": data,
    }
    
    output_file = OUTPUT_DIR / f"beneficiaires_{year}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"    → {output_file.name} ({len(data)} bénéficiaires, {total/1e6:.1f}M€)")


def main():
    """Point d'entrée principal."""
    parser = argparse.ArgumentParser(description="Export données subventions depuis dbt")
    parser.add_argument('--year', type=int, help="Année spécifique (sinon toutes)")
    parser.add_argument('--limit', type=int, default=500, 
                       help="Limite de bénéficiaires par année")
    args = parser.parse_args()
    
    print("=" * 60)
    print("📊 Export des données subventions (dbt → JSON)")
    print("=" * 60)
    
    # Créer le dossier de sortie
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Dossier: {OUTPUT_DIR}\n")
    
    # Client BigQuery
    client = bigquery.Client(project=PROJECT_ID)
    
    # Index
    index = export_index(client)
    years = [args.year] if args.year else index["available_years"]
    
    print()
    
    # Export par année
    for year in years:
        export_treemap_year(client, year)
        export_beneficiaires_year(client, year, args.limit)
    
    print("\n" + "=" * 60)
    print("✅ Export subventions terminé!")
    print("=" * 60)


if __name__ == "__main__":
    main()
