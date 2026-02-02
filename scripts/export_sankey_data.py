#!/usr/bin/env python3
"""
Export Sankey Data for Paris Budget Dashboard

This script queries BigQuery to generate JSON files for the Sankey visualization.
Each year gets its own file with:
- Aggregated revenues grouped by category
- Aggregated expenses grouped by category
- Drill-down data for detailed views

Usage:
    python scripts/export_sankey_data.py

Output:
    frontend/public/data/budget_sankey_{year}.json
    frontend/public/data/budget_index.json
"""

import json
import os
from pathlib import Path
from google.cloud import bigquery
from collections import defaultdict

# Configuration
PROJECT_ID = "open-data-france-484717"
DATASET_ID = "paris_open_data_dev"
TABLE_ID = "comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement"
OUTPUT_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"

# Revenue grouping based on M57 classification
REVENUE_GROUPS = {
    "Fiscalité Directe": [
        "IMPOSITIONS DIRECTES",
        "TAXES FONCIERES",
        "IMPOTS LOCAUX",
    ],
    "Fiscalité Indirecte": [
        "AUTRES IMPÔTS ET TAXES", 
        "DROITS DE MUTATION",
        "PUBLICITE FONCIERE",
    ],
    "Dotations État": [
        "DOTATIONS ET PARTICIPATIONS",
        "DGF",
        "COMPENSATIONS",
    ],
    "Recettes des Services": [
        "PRODUITS DES SERVICES",
        "PRESTATIONS",
        "REDEVANCES",
    ],
    "Emprunts et Dette": [
        "EMPRUNTS",
        "DETTE",
    ],
    "Autres Recettes": [],  # Catch-all
}

# Expense grouping based on function codes
EXPENSE_GROUPS = {
    "Administration Générale": ["0"],
    "Sécurité et Salubrité": ["1"],
    "Enseignement et Formation": ["2"],
    "Culture, Sport et Loisirs": ["3", "4"],
    "Santé et Action Sociale": ["5", "6"],
    "Aménagement et Logement": ["7", "8"],
    "Action Économique": ["9"],
    "Autres": [],
}


def get_bigquery_client():
    """Initialize BigQuery client with credentials."""
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path:
        # Try common locations
        possible_paths = [
            Path.home() / "Downloads" / "open-data-france-484717-68f33f082f1f.json",
            Path.home() / ".config" / "gcloud" / "application_default_credentials.json",
            Path(__file__).parent.parent / "credentials.json",
        ]
        for p in possible_paths:
            if p.exists():
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(p)
                print(f"  Using credentials: {p}")
                break
    
    return bigquery.Client(project=PROJECT_ID)


def query_budget_data(client, year: int) -> list[dict]:
    """
    Query budget data for a specific year from BigQuery.
    
    Column mapping from source table:
    - exercice_comptable -> year
    - sens_depense_recette -> sens_flux ('Dépense' or 'Recette')
    - chapitre_niveau_vote_texte_descriptif -> chapitre_libelle
    - chapitre_budgetaire_cle -> chapitre_code
    - fonction_cle -> fonction_code
    - fonction_texte -> fonction_libelle
    - nature_budgetaire_texte -> nature_libelle
    - mandate_titre_apres_regul -> montant
    - type_d_operation_r_o_i_m -> type_operation ('R'=Réel)
    """
    query = f"""
    SELECT 
        sens_depense_recette as sens_flux,
        chapitre_budgetaire_cle as chapitre_code,
        chapitre_niveau_vote_texte_descriptif as chapitre_libelle,
        COALESCE(fonction_cle, '0') as fonction_code,
        fonction_texte as fonction_libelle,
        nature_budgetaire_texte as nature_libelle,
        SUM(mandate_titre_apres_regul) as montant
    FROM `{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}`
    WHERE 
        exercice_comptable = {year}
        AND type_d_operation_r_o_i_m = 'Réel'
    GROUP BY 
        sens_depense_recette, 
        chapitre_budgetaire_cle,
        chapitre_niveau_vote_texte_descriptif, 
        fonction_cle,
        fonction_texte,
        nature_budgetaire_texte
    HAVING SUM(mandate_titre_apres_regul) > 0
    """
    
    print(f"  Querying data for {year}...")
    results = client.query(query).result()
    return [dict(row) for row in results]


def classify_revenue(chapitre_libelle: str) -> str:
    """Classify a revenue item into a display group."""
    upper = chapitre_libelle.upper() if chapitre_libelle else ""
    
    for group, keywords in REVENUE_GROUPS.items():
        for keyword in keywords:
            if keyword in upper:
                return group
    
    return "Autres Recettes"


def classify_expense(fonction_code: str) -> str:
    """Classify an expense item based on function code."""
    if not fonction_code:
        return "Autres"
    
    first_digit = fonction_code[0] if fonction_code else "0"
    
    for group, codes in EXPENSE_GROUPS.items():
        if first_digit in codes:
            return group
    
    return "Autres"


def build_sankey_data(records: list[dict], year: int) -> dict:
    """
    Transform raw budget records into Sankey chart format.
    
    Returns:
    {
        "year": 2024,
        "totals": {"recettes": ..., "depenses": ..., "solde": ...},
        "nodes": [...],
        "links": [...],
        "drilldown": {"revenue": {...}, "expenses": {...}},
        "byEntity": [...]
    }
    """
    # Aggregate by group
    revenue_totals = defaultdict(float)
    expense_totals = defaultdict(float)
    
    # Drill-down data (detailed breakdown within each group)
    revenue_drilldown = defaultdict(lambda: defaultdict(float))
    expense_drilldown = defaultdict(lambda: defaultdict(float))
    
    for record in records:
        montant = float(record.get("montant", 0))
        sens = record.get("sens_flux", "")
        
        if "Recette" in sens:
            group = classify_revenue(record.get("chapitre_libelle", ""))
            revenue_totals[group] += montant
            
            # Drill-down by nature_libelle
            detail_name = record.get("nature_libelle") or record.get("chapitre_libelle") or "Autre"
            revenue_drilldown[group][detail_name] += montant
            
        elif "Dépense" in sens:
            group = classify_expense(record.get("fonction_code", ""))
            expense_totals[group] += montant
            
            # Drill-down by fonction_libelle
            detail_name = record.get("fonction_libelle") or record.get("chapitre_libelle") or "Autre"
            expense_drilldown[group][detail_name] += montant
    
    # Calculate totals
    total_recettes = sum(revenue_totals.values())
    total_depenses = sum(expense_totals.values())
    solde = total_recettes - total_depenses
    
    # Build nodes list
    nodes = []
    
    # Revenue nodes (left side)
    for name in sorted(revenue_totals.keys()):
        nodes.append({"name": name, "category": "revenue"})
    
    # Central node
    nodes.append({"name": "Budget Paris", "category": "central"})
    
    # Expense nodes (right side)
    for name in sorted(expense_totals.keys()):
        nodes.append({"name": name, "category": "expense"})
    
    # Build links
    links = []
    
    # Revenue -> Central
    for name, value in revenue_totals.items():
        if value > 0:
            links.append({
                "source": name,
                "target": "Budget Paris",
                "value": value
            })
    
    # Central -> Expenses
    for name, value in expense_totals.items():
        if value > 0:
            links.append({
                "source": "Budget Paris",
                "target": name,
                "value": value
            })
    
    # Format drill-down data
    drilldown = {
        "revenue": {},
        "expenses": {}
    }
    
    for group, items in revenue_drilldown.items():
        drilldown["revenue"][group] = [
            {"name": name, "value": value}
            for name, value in sorted(items.items(), key=lambda x: -x[1])
            if value > 0
        ]
    
    for group, items in expense_drilldown.items():
        drilldown["expenses"][group] = [
            {"name": name, "value": value}
            for name, value in sorted(items.items(), key=lambda x: -x[1])
            if value > 0
        ]
    
    return {
        "year": year,
        "totals": {
            "recettes": total_recettes,
            "depenses": total_depenses,
            "solde": solde
        },
        "nodes": nodes,
        "links": links,
        "drilldown": drilldown,
        "byEntity": []  # Could add entity breakdown if needed
    }


def export_year(client, year: int) -> dict:
    """Export Sankey data for a single year."""
    print(f"\nProcessing year {year}...")
    
    records = query_budget_data(client, year)
    print(f"  Found {len(records)} records")
    
    sankey_data = build_sankey_data(records, year)
    
    # Write to file
    output_file = OUTPUT_DIR / f"budget_sankey_{year}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(sankey_data, f, ensure_ascii=False, indent=2)
    
    print(f"  ✓ Wrote {output_file}")
    
    return {
        "year": year,
        "recettes": sankey_data["totals"]["recettes"],
        "depenses": sankey_data["totals"]["depenses"],
        "solde": sankey_data["totals"]["solde"]
    }


def export_index(summaries: list[dict]):
    """Export the index file with available years and summary data."""
    # Sort by year descending
    summaries.sort(key=lambda x: x["year"], reverse=True)
    
    index = {
        "availableYears": [s["year"] for s in summaries],
        "latestYear": summaries[0]["year"] if summaries else 2024,
        "summary": summaries
    }
    
    output_file = OUTPUT_DIR / "budget_index.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)
    
    print(f"\n✓ Wrote index: {output_file}")


def main():
    """Main entry point."""
    print("=" * 60)
    print("Paris Budget Sankey Data Export")
    print("=" * 60)
    
    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Initialize client
    client = get_bigquery_client()
    
    # Years to export (M57 format starts 2019)
    years = [2024, 2023, 2022, 2021, 2020, 2019]
    
    # Export each year
    summaries = []
    for year in years:
        try:
            summary = export_year(client, year)
            summaries.append(summary)
        except Exception as e:
            print(f"  ✗ Error processing {year}: {e}")
    
    # Export index
    if summaries:
        export_index(summaries)
    
    print("\n" + "=" * 60)
    print("Export complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
