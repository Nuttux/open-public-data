#!/usr/bin/env python3
"""
Export Sankey Data for Paris Budget Dashboard

This script queries BigQuery to generate JSON files for the Sankey visualization.
Each year gets its own file with:
- Aggregated revenues grouped by category
- Aggregated expenses grouped by category
- Drill-down data for detailed views

Paris uses a FUNCTIONAL budget presentation with chapter codes:
- 940-943: Fiscalité & Opérations financières
- 930-939: Fonctionnement par fonction (Social, Éducation, etc.)
- 900-908: Investissement par fonction

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
TABLE_CENTRALE = "comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement"
TABLE_ARRONDISSEMENTS = "comptes_administratifs_arrondissements"
OUTPUT_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"

# Available years per entity
YEARS_CENTRALE = [2024, 2023, 2022, 2021, 2020, 2019]
YEARS_ARRONDISSEMENTS = [2022, 2021, 2020, 2019]  # Data ends at 2022

# =============================================================================
# CLASSIFICATION BASED ON PARIS CHAPTER CODES
# =============================================================================
# Paris uses functional chapter codes (not M57 nature codes)
# Codes starting with 9xx = Fonctionnement, 0xx = Investissement

# Revenue classification based on chapter code
REVENUE_CHAPTER_MAP = {
    # Fiscalité
    "940": "Fiscalité Directe",       # IMPOSITIONS DIRECTES
    "941": "Fiscalité Indirecte",     # AUTRES IMPÔTS ET TAXES
    "921": "Fiscalité Indirecte",     # TAXES NON AFFECTÉES
    
    # Dotations de l'État
    "922": "Dotations État",          # DOTATIONS ET PARTICIPATIONS (fonct)
    "942": "Dotations État",          # DOTATIONS ET PARTICIPATIONS (invest)
    
    # Dette et Opérations financières
    "923": "Emprunts & Dette",        # DETTES ET OPÉRATIONS FINANCIÈRES
    "943": "Opérations Financières",  # OPÉRATIONS FINANCIÈRES
    
    # Recettes fonctionnelles (revenus liés aux services publics)
    "930": "Services Généraux",       # SERVICES GÉNÉRAUX
    "9305": "Fonds Européens",        # GESTION DES FONDS EUROPÉENS
    "931": "Sécurité",                # SÉCURITÉ
    "932": "Éducation",               # ENSEIGNEMENT
    "933": "Culture & Sport",         # CULTURE, VIE SOCIALE, SPORTS
    "934": "Action Sociale",          # SANTÉ ET ACTION SOCIALE
    "9343": "APA",                    # Allocation Personnes Âgées
    "9344": "RSA",                    # Revenu de Solidarité Active
    "935": "Aménagement",             # AMÉNAGEMENT DES TERRITOIRES
    "936": "Action Économique",       # ACTION ÉCONOMIQUE
    "937": "Environnement",           # ENVIRONNEMENT
    "938": "Transports",              # TRANSPORTS
    
    # Investissement (recettes = subventions d'équipement, cessions, etc.)
    "900": "Invest. Services",        # Services généraux invest
    "901": "Invest. Sécurité",
    "902": "Invest. Éducation",
    "903": "Invest. Culture",
    "904": "Invest. Social",
    "905": "Invest. Aménagement",
    "906": "Invest. Économie",
    "907": "Invest. Environnement",
    "908": "Invest. Transports",
}

# Expense classification (same chapter codes)
EXPENSE_CHAPTER_MAP = {
    # Opérations financières
    "940": "Reversements Fiscaux",    # Reversements aux collectivités
    "941": "Charges Fiscales",        # Charges liées aux impôts
    "923": "Remboursement Dette",     # Remboursement emprunts
    "943": "Opérations Financières",
    
    # Fonctionnement par politique publique
    "930": "Administration",          # SERVICES GÉNÉRAUX
    "9305": "Fonds Européens",
    "931": "Sécurité",                # SÉCURITÉ
    "932": "Éducation",               # ENSEIGNEMENT
    "933": "Culture & Sport",         # CULTURE, VIE SOCIALE, SPORTS
    "934": "Action Sociale",          # SANTÉ ET ACTION SOCIALE
    "9343": "APA",
    "9344": "RSA",
    "935": "Aménagement",             # AMÉNAGEMENT DES TERRITOIRES
    "936": "Action Économique",
    "937": "Environnement",           # ENVIRONNEMENT
    "938": "Transports",              # TRANSPORTS
    "922": "Participations",          # Dotations versées
    "942": "Subventions Équipement",
    
    # Investissement par politique
    "900": "Invest. Administration",
    "901": "Invest. Sécurité",
    "902": "Invest. Éducation",
    "903": "Invest. Culture",
    "904": "Invest. Social",
    "905": "Invest. Aménagement",
    "906": "Invest. Économie",
    "907": "Invest. Environnement",
    "908": "Invest. Transports",
}

# Regroupement pour simplifier le Sankey (moins de nodes)
REVENUE_GROUPS = {
    # Grandes catégories de recettes
    "Impôts & Taxes": ["Fiscalité Directe", "Fiscalité Indirecte"],
    "Dotations & Subventions": ["Dotations État", "Fonds Européens"],
    "Emprunts": ["Emprunts & Dette", "Opérations Financières"],
    "Services Publics": ["Services Généraux", "Sécurité", "Éducation", "Culture & Sport", 
                         "Action Sociale", "APA", "RSA", "Aménagement", "Action Économique",
                         "Environnement", "Transports"],
    "Investissement": ["Invest. Services", "Invest. Sécurité", "Invest. Éducation",
                       "Invest. Culture", "Invest. Social", "Invest. Aménagement",
                       "Invest. Économie", "Invest. Environnement", "Invest. Transports"],
}

EXPENSE_GROUPS = {
    # Grandes catégories de dépenses
    "Personnel & Admin": ["Administration", "Reversements Fiscaux", "Charges Fiscales", "Fonds Européens"],
    "Éducation": ["Éducation", "Invest. Éducation"],
    "Action Sociale": ["Action Sociale", "APA", "RSA", "Invest. Social"],
    "Culture & Sport": ["Culture & Sport", "Invest. Culture"],
    "Sécurité": ["Sécurité", "Invest. Sécurité"],
    "Aménagement & Logement": ["Aménagement", "Invest. Aménagement", "Invest. Administration"],
    "Environnement": ["Environnement", "Invest. Environnement"],
    "Transports": ["Transports", "Invest. Transports"],
    "Économie": ["Action Économique", "Invest. Économie", "Participations", "Subventions Équipement"],
    "Dette": ["Remboursement Dette", "Opérations Financières"],
}


def get_bigquery_client():
    """Initialize BigQuery client with credentials."""
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path:
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


def query_budget_centrale(client, year: int) -> list[dict]:
    """Query central budget data (M57 Ville-Département)."""
    query = f"""
    SELECT 
        sens_depense_recette as sens,
        chapitre_budgetaire_cle as chapitre_code,
        chapitre_niveau_vote_texte_descriptif as chapitre_libelle,
        nature_budgetaire_texte as nature_libelle,
        SUM(mandate_titre_apres_regul) as montant
    FROM `{PROJECT_ID}.{DATASET_ID}.{TABLE_CENTRALE}`
    WHERE 
        exercice_comptable = {year}
        AND type_d_operation_r_o_i_m = 'Réel'
    GROUP BY 
        sens_depense_recette, 
        chapitre_budgetaire_cle,
        chapitre_niveau_vote_texte_descriptif,
        nature_budgetaire_texte
    HAVING SUM(mandate_titre_apres_regul) > 0
    """
    
    print(f"  Querying centrale for {year}...")
    results = client.query(query).result()
    return [dict(row) for row in results]


def query_budget_arrondissements(client, year: int) -> list[dict]:
    """Query arrondissements budget data (États Spéciaux)."""
    query = f"""
    SELECT 
        sens_depense_recette as sens,
        chapitre_code,
        chapitre_texte as chapitre_libelle,
        nature_texte as nature_libelle,
        budget as arrondissement,
        montant
    FROM `{PROJECT_ID}.{DATASET_ID}.{TABLE_ARRONDISSEMENTS}`
    WHERE 
        exercice_comptable = {year}
        AND type_operation = 'Réel'
        AND montant > 0
    """
    
    print(f"  Querying arrondissements for {year}...")
    results = client.query(query).result()
    return [dict(row) for row in results]


def classify_by_chapter(chapitre_code: str, chapter_map: dict) -> str:
    """
    Classify based on chapter code, trying longest match first.
    E.g., '9344' matches before '934'
    """
    if not chapitre_code:
        return "Autres"
    
    # Try exact match first, then progressively shorter prefixes
    for length in range(len(chapitre_code), 0, -1):
        prefix = chapitre_code[:length]
        if prefix in chapter_map:
            return chapter_map[prefix]
    
    return "Autres"


def get_group(category: str, group_map: dict) -> str:
    """Find which group a category belongs to."""
    for group, categories in group_map.items():
        if category in categories:
            return group
    return "Autres"


def build_sankey_data(records: list[dict], year: int) -> dict:
    """
    Transform raw budget records into Sankey chart format.
    Uses two levels: detailed category and grouped display.
    """
    # Level 1: Detailed by chapter
    revenue_by_chapter = defaultdict(float)
    expense_by_chapter = defaultdict(float)
    
    # Drill-down data (by nature within each chapter)
    revenue_drilldown = defaultdict(lambda: defaultdict(float))
    expense_drilldown = defaultdict(lambda: defaultdict(float))
    
    for record in records:
        montant = float(record.get("montant", 0))
        sens = record.get("sens", "")
        chapitre_code = record.get("chapitre_code", "")
        chapitre_libelle = record.get("chapitre_libelle", "")
        nature_libelle = record.get("nature_libelle", "") or chapitre_libelle or "Non spécifié"
        
        if "Recettes" in sens:
            category = classify_by_chapter(chapitre_code, REVENUE_CHAPTER_MAP)
            revenue_by_chapter[category] += montant
            revenue_drilldown[category][nature_libelle] += montant
            
        elif "Dépenses" in sens:
            category = classify_by_chapter(chapitre_code, EXPENSE_CHAPTER_MAP)
            expense_by_chapter[category] += montant
            expense_drilldown[category][nature_libelle] += montant
    
    # Level 2: Group into display categories
    revenue_grouped = defaultdict(float)
    expense_grouped = defaultdict(float)
    
    # Also track which detailed categories feed into each group (for drill-down)
    revenue_group_drilldown = defaultdict(lambda: defaultdict(float))
    expense_group_drilldown = defaultdict(lambda: defaultdict(float))
    
    for category, amount in revenue_by_chapter.items():
        group = get_group(category, REVENUE_GROUPS)
        revenue_grouped[group] += amount
        # Add chapter-level items to group drilldown
        for detail, detail_amount in revenue_drilldown[category].items():
            revenue_group_drilldown[group][f"{category}: {detail}"] += detail_amount
    
    for category, amount in expense_by_chapter.items():
        group = get_group(category, EXPENSE_GROUPS)
        expense_grouped[group] += amount
        for detail, detail_amount in expense_drilldown[category].items():
            expense_group_drilldown[group][f"{category}: {detail}"] += detail_amount
    
    # Calculate totals
    total_recettes = sum(revenue_grouped.values())
    total_depenses = sum(expense_grouped.values())
    solde = total_recettes - total_depenses
    
    # Build nodes (using grouped categories for cleaner display)
    nodes = []
    
    for name in sorted(revenue_grouped.keys()):
        if revenue_grouped[name] > 0:
            nodes.append({"name": name, "category": "revenue"})
    
    nodes.append({"name": "Budget Paris", "category": "central"})
    
    for name in sorted(expense_grouped.keys()):
        if expense_grouped[name] > 0:
            nodes.append({"name": name, "category": "expense"})
    
    # Build links
    links = []
    
    for name, value in revenue_grouped.items():
        if value > 0:
            links.append({
                "source": name,
                "target": "Budget Paris",
                "value": value
            })
    
    for name, value in expense_grouped.items():
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
    
    for group, items in revenue_group_drilldown.items():
        drilldown["revenue"][group] = [
            {"name": name, "value": value}
            for name, value in sorted(items.items(), key=lambda x: -x[1])
            if value > 0
        ][:50]  # Limit to top 50 items
    
    for group, items in expense_group_drilldown.items():
        drilldown["expenses"][group] = [
            {"name": name, "value": value}
            for name, value in sorted(items.items(), key=lambda x: -x[1])
            if value > 0
        ][:50]
    
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
        "byEntity": []
    }


def build_sankey_arrondissements(records: list[dict], year: int) -> dict:
    """Build Sankey data specifically for arrondissements."""
    # Arrondissements use simpler chapter structure (011, 012, etc.)
    # Group by function rather than complex chapter codes
    
    revenue_by_func = defaultdict(float)
    expense_by_func = defaultdict(float)
    revenue_drilldown = defaultdict(lambda: defaultdict(float))
    expense_drilldown = defaultdict(lambda: defaultdict(float))
    by_arrondissement = defaultdict(float)
    
    for record in records:
        montant = float(record.get("montant", 0))
        sens = record.get("sens", "")
        chapitre_libelle = record.get("chapitre_libelle", "")[:30] or "Autres"
        nature_libelle = record.get("nature_libelle", "") or "Non spécifié"
        arrondissement = record.get("arrondissement", "")
        
        # Track by arrondissement for breakdown
        by_arrondissement[arrondissement] += abs(montant)
        
        if "Recettes" in sens:
            revenue_by_func[chapitre_libelle] += montant
            revenue_drilldown[chapitre_libelle][nature_libelle] += montant
        elif "Dépenses" in sens:
            expense_by_func[chapitre_libelle] += montant
            expense_drilldown[chapitre_libelle][nature_libelle] += montant
    
    total_recettes = sum(revenue_by_func.values())
    total_depenses = sum(expense_by_func.values())
    solde = total_recettes - total_depenses
    
    # Build nodes
    nodes = []
    for name in sorted(revenue_by_func.keys()):
        if revenue_by_func[name] > 0:
            nodes.append({"name": name, "category": "revenue"})
    
    nodes.append({"name": "Arrondissements", "category": "central"})
    
    for name in sorted(expense_by_func.keys()):
        if expense_by_func[name] > 0:
            nodes.append({"name": name, "category": "expense"})
    
    # Build links
    links = []
    for name, value in revenue_by_func.items():
        if value > 0:
            links.append({"source": name, "target": "Arrondissements", "value": value})
    
    for name, value in expense_by_func.items():
        if value > 0:
            links.append({"source": "Arrondissements", "target": name, "value": value})
    
    # Drilldown
    drilldown = {"revenue": {}, "expenses": {}}
    for group, items in revenue_drilldown.items():
        drilldown["revenue"][group] = [
            {"name": name, "value": value}
            for name, value in sorted(items.items(), key=lambda x: -x[1])
            if value > 0
        ][:30]
    
    for group, items in expense_drilldown.items():
        drilldown["expenses"][group] = [
            {"name": name, "value": value}
            for name, value in sorted(items.items(), key=lambda x: -x[1])
            if value > 0
        ][:30]
    
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
        "byEntity": [
            {"name": k, "value": v}
            for k, v in sorted(by_arrondissement.items(), key=lambda x: -x[1])
        ]
    }


def export_centrale(client, year: int) -> dict:
    """Export central budget (M57 Ville-Département)."""
    print(f"\n📊 Centrale {year}...")
    
    records = query_budget_centrale(client, year)
    print(f"  Found {len(records)} records")
    
    sankey_data = build_sankey_data(records, year)
    
    print(f"  Recettes: {sankey_data['totals']['recettes']/1e9:.2f} Md€")
    print(f"  Dépenses: {sankey_data['totals']['depenses']/1e9:.2f} Md€")
    
    # Write files
    for suffix in ["", "_centrale"]:
        output_file = OUTPUT_DIR / f"budget_sankey{suffix}_{year}.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(sankey_data, f, ensure_ascii=False, indent=2)
        print(f"  ✓ {output_file.name}")
    
    return {
        "year": year,
        "recettes": sankey_data["totals"]["recettes"],
        "depenses": sankey_data["totals"]["depenses"],
        "solde": sankey_data["totals"]["solde"]
    }


def export_arrondissements(client, year: int) -> dict:
    """Export arrondissements budget (États Spéciaux)."""
    print(f"\n🗺️  Arrondissements {year}...")
    
    records = query_budget_arrondissements(client, year)
    print(f"  Found {len(records)} records")
    
    sankey_data = build_sankey_arrondissements(records, year)
    
    print(f"  Recettes: {sankey_data['totals']['recettes']/1e6:.1f} M€")
    print(f"  Dépenses: {sankey_data['totals']['depenses']/1e6:.1f} M€")
    
    output_file = OUTPUT_DIR / f"budget_sankey_arrondissements_{year}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(sankey_data, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {output_file.name}")
    
    return {
        "year": year,
        "recettes": sankey_data["totals"]["recettes"],
        "depenses": sankey_data["totals"]["depenses"],
        "solde": sankey_data["totals"]["solde"]
    }


def export_index(centrale_summaries: list[dict], arrond_summaries: list[dict]):
    """Export the index file with available years per entity."""
    centrale_summaries.sort(key=lambda x: x["year"], reverse=True)
    arrond_summaries.sort(key=lambda x: x["year"], reverse=True)
    
    index = {
        "availableYears": [s["year"] for s in centrale_summaries],
        "latestYear": centrale_summaries[0]["year"] if centrale_summaries else 2024,
        "entities": {
            "total": {
                "years": [s["year"] for s in centrale_summaries],
                "label": "Budget Total"
            },
            "centrale": {
                "years": [s["year"] for s in centrale_summaries],
                "label": "Mairie Centrale"
            },
            "arrondissements": {
                "years": [s["year"] for s in arrond_summaries],
                "label": "Arrondissements"
            }
        },
        "summary": centrale_summaries
    }
    
    output_file = OUTPUT_DIR / "budget_index.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    
    print(f"\n✓ Wrote index: {output_file}")


def main():
    """Main entry point."""
    print("=" * 60)
    print("Paris Budget Sankey Data Export")
    print("=" * 60)
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    client = get_bigquery_client()
    
    # Export central budget (2019-2024)
    print("\n" + "-" * 40)
    print("BUDGET CENTRAL (M57 Ville-Département)")
    print("-" * 40)
    
    centrale_summaries = []
    for year in YEARS_CENTRALE:
        try:
            summary = export_centrale(client, year)
            centrale_summaries.append(summary)
        except Exception as e:
            print(f"  ✗ Error processing centrale {year}: {e}")
    
    # Export arrondissements budget (2019-2022)
    print("\n" + "-" * 40)
    print("BUDGET ARRONDISSEMENTS (États Spéciaux)")
    print("-" * 40)
    
    arrond_summaries = []
    for year in YEARS_ARRONDISSEMENTS:
        try:
            summary = export_arrondissements(client, year)
            arrond_summaries.append(summary)
        except Exception as e:
            print(f"  ✗ Error processing arrondissements {year}: {e}")
    
    # Export combined index
    if centrale_summaries:
        export_index(centrale_summaries, arrond_summaries)
    
    print("\n" + "=" * 60)
    print("Export complete!")
    print(f"  Central: {len(centrale_summaries)} years")
    print(f"  Arrondissements: {len(arrond_summaries)} years")
    print("=" * 60)


if __name__ == "__main__":
    main()
