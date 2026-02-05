#!/usr/bin/env python3
"""
Export Sankey Data for Paris Budget Dashboard

This script queries BigQuery to generate JSON files for the Sankey visualization.
Each year gets its own file with:
- Aggregated revenues grouped by category
- Aggregated expenses grouped by category
- Drill-down data for detailed views
- Section breakdown (Fonctionnement vs Investissement) per expense group
- Data availability status (COMPLET/PARTIEL/BUDGET_SEUL)
- LLM-enriched project details for deeper drill-down

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

import csv
import json
import os
from pathlib import Path
from google.cloud import bigquery
from collections import defaultdict

# Configuration
PROJECT_ID = "open-data-france-484717"
DATASET_ID = "dbt_paris"  # Base dataset (staging, intermediate, analytics)
RAW_DATASET = "raw"       # Dataset for raw OpenData Paris tables
TABLE_ID = "ca_budget_principal"  # Main budget table in raw
OUTPUT_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"
SEEDS_DIR = Path(__file__).parent.parent / "paris-public-open-data" / "seeds"

YEARS = [2024, 2023, 2022, 2021, 2020, 2019]

# Data availability by year (based on sync_opendata.py check)
# Updated when sync runs
DATA_AVAILABILITY = {
    2024: {"status": "PARTIEL", "has_budget": True, "has_subventions": True, "has_autorisations": False, "has_arrondissements": False},
    2023: {"status": "PARTIEL", "has_budget": True, "has_subventions": True, "has_autorisations": False, "has_arrondissements": True},
    2022: {"status": "COMPLET", "has_budget": True, "has_subventions": True, "has_autorisations": True, "has_arrondissements": True},
    2021: {"status": "COMPLET", "has_budget": True, "has_subventions": True, "has_autorisations": True, "has_arrondissements": True},
    2020: {"status": "COMPLET", "has_budget": True, "has_subventions": True, "has_autorisations": True, "has_arrondissements": True},
    2019: {"status": "COMPLET", "has_budget": True, "has_subventions": True, "has_autorisations": True, "has_arrondissements": True},
}

# =============================================================================
# CLASSIFICATION BASED ON PARIS CHAPTER CODES
# =============================================================================

REVENUE_CHAPTER_MAP = {
    "940": "Fiscalité Directe",
    "941": "Fiscalité Indirecte",
    "921": "Fiscalité Indirecte",
    "922": "Dotations État",
    "942": "Dotations État",
    "923": "Emprunts & Dette",
    "943": "Opérations Financières",
    "930": "Services Généraux",
    "9305": "Fonds Européens",
    "931": "Sécurité",
    "932": "Éducation",
    "933": "Culture & Sport",
    "934": "Action Sociale",
    "9343": "APA",
    "9344": "RSA",
    "935": "Aménagement",
    "936": "Action Économique",
    "937": "Environnement",
    "938": "Transports",
    "900": "Invest. Services",
    "901": "Invest. Sécurité",
    "902": "Invest. Éducation",
    "903": "Invest. Culture",
    "904": "Invest. Social",
    "905": "Invest. Aménagement",
    "906": "Invest. Économie",
    "907": "Invest. Environnement",
    "908": "Invest. Transports",
}

EXPENSE_CHAPTER_MAP = {
    "940": "Reversements Fiscaux",
    "941": "Charges Fiscales",
    "923": "Remboursement Dette",
    "943": "Opérations Financières",
    "930": "Administration",
    "9305": "Fonds Européens",
    "931": "Sécurité",
    "932": "Éducation",
    "933": "Culture & Sport",
    "934": "Action Sociale",
    "9343": "APA",
    "9344": "RSA",
    "935": "Aménagement",
    "936": "Action Économique",
    "937": "Environnement",
    "938": "Transports",
    "922": "Participations",
    "942": "Subventions Équipement",
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

REVENUE_GROUPS = {
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

# =============================================================================
# SECTION CLASSIFICATION (Fonctionnement vs Investissement)
# =============================================================================

# Categories that are considered "Investissement" (capital expenditure)
INVEST_CATEGORIES = [
    "Invest. Services", "Invest. Sécurité", "Invest. Éducation", "Invest. Culture",
    "Invest. Social", "Invest. Aménagement", "Invest. Économie", "Invest. Environnement",
    "Invest. Transports", "Invest. Administration"
]

# Categories that are considered special operations (not Fonct/Invest)
SPECIAL_CATEGORIES = [
    "Remboursement Dette", "Opérations Financières", "Reversements Fiscaux", 
    "Charges Fiscales", "Participations", "Subventions Équipement"
]


def get_section(category: str) -> str:
    """
    Determine the budget section for a category.
    
    Returns:
        'Investissement' for capital expenditure (chapter 90X)
        'Fonctionnement' for operating expenses (chapter 93X)
        'Opérations spéciales' for debt/fiscal operations (chapter 92X/94X)
    """
    if category in INVEST_CATEGORIES:
        return "Investissement"
    if category in SPECIAL_CATEGORIES:
        return "Opérations spéciales"
    return "Fonctionnement"


def load_llm_enrichments() -> dict:
    """
    Load LLM enrichments from the new cache file (seed_geocache_llm.csv).
    
    Returns a dict mapping ap_code to enrichment data.
    """
    cache_file = SEEDS_DIR / "seed_geocache_llm.csv"
    enrichments = {}
    
    if not cache_file.exists():
        print("  ℹ️ No LLM enrichment cache found")
        return enrichments
    
    with open(cache_file, "r", encoding="utf-8") as f:
        # Skip comment lines
        lines = [line for line in f if not line.startswith('#')]
        reader = csv.DictReader(lines)
        for row in reader:
            ap_code = row.get("ap_code", "")
            if ap_code:
                enrichments[ap_code] = {
                    "ap_texte": row.get("ap_texte", ""),
                    "arrondissement": row.get("arrondissement", ""),
                    "adresse": row.get("adresse", ""),
                    "confiance": float(row.get("confiance", 0) or 0),
                    "source": row.get("source", ""),
                }
    
    print(f"  📚 Loaded {len(enrichments)} LLM enrichments")
    return enrichments


def load_top_beneficiaires(client, year: int) -> dict:
    """
    Load top beneficiaries by thematique from BigQuery.
    
    Returns a dict mapping thematique to list of top beneficiaries.
    """
    try:
        query = f"""
        SELECT
            thematique,
            beneficiaire,
            montant_total,
            rang
        FROM `{PROJECT_ID}.{DATASET_ID}_intermediate.int_top_beneficiaires`
        WHERE annee = {year}
        ORDER BY thematique, rang
        """
        results = client.query(query).result()
        
        top_by_theme = defaultdict(list)
        for row in results:
            top_by_theme[row.thematique].append({
                "nom": row.beneficiaire,
                "montant": float(row.montant_total),
                "rang": row.rang,
            })
        
        if top_by_theme:
            print(f"  📋 Loaded top beneficiaries for {len(top_by_theme)} themes")
        return dict(top_by_theme)
    except Exception as e:
        print(f"  ⚠️ Could not load top beneficiaries: {e}")
        return {}


def load_top_projets(client, year: int) -> dict:
    """
    Load top projects by thematique from BigQuery.
    
    Returns a dict mapping thematique to list of top projects.
    """
    try:
        query = f"""
        SELECT
            thematique,
            projet,
            direction_libelle,
            arrondissement,
            montant_total,
            rang
        FROM `{PROJECT_ID}.{DATASET_ID}_intermediate.int_top_projets`
        WHERE annee = {year}
        ORDER BY thematique, rang
        """
        results = client.query(query).result()
        
        top_by_theme = defaultdict(list)
        for row in results:
            top_by_theme[row.thematique].append({
                "nom": row.projet[:100] if row.projet else "",
                "direction": row.direction_libelle,
                "arrondissement": row.arrondissement,
                "montant": float(row.montant_total),
                "rang": row.rang,
            })
        
        if top_by_theme:
            print(f"  📋 Loaded top projects for {len(top_by_theme)} themes")
        return dict(top_by_theme)
    except Exception as e:
        print(f"  ⚠️ Could not load top projects: {e}")
        return {}


def get_data_availability(year: int) -> dict:
    """
    Get data availability status for a year.
    
    Returns availability info including:
    - status: COMPLET/PARTIEL/BUDGET_SEUL
    - sources disponibles
    """
    return DATA_AVAILABILITY.get(year, {
        "status": "INCONNU",
        "has_budget": False,
        "has_subventions": False,
        "has_autorisations": False,
        "has_arrondissements": False,
    })


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


def query_budget_data(client, year: int) -> list[dict]:
    """Query budget data for a specific year from dbt core_budget table."""
    query = f"""
    SELECT 
        sens_flux as sens,
        chapitre_code,
        chapitre_libelle,
        nature_libelle,
        montant
    FROM `{PROJECT_ID}.dbt_paris_analytics.core_budget`
    WHERE annee = {year}
      AND montant > 0
    """
    
    print(f"  Querying data for {year}...")
    results = client.query(query).result()
    return [dict(row) for row in results]


def classify_by_chapter(chapitre_code: str, chapter_map: dict) -> str:
    """Classify based on chapter code, trying longest match first."""
    if not chapitre_code:
        return "Autres"
    
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
    
    Also builds bySection breakdown (Fonctionnement vs Investissement) for each
    expense group to enable drill-down by section in the UI.
    """
    revenue_by_chapter = defaultdict(float)
    expense_by_chapter = defaultdict(float)
    revenue_drilldown = defaultdict(lambda: defaultdict(float))
    expense_drilldown = defaultdict(lambda: defaultdict(float))
    
    for record in records:
        montant = float(record.get("montant", 0))
        sens = record.get("sens", "")
        chapitre_code = record.get("chapitre_code", "")
        chapitre_libelle = record.get("chapitre_libelle", "")
        nature_libelle = record.get("nature_libelle", "") or chapitre_libelle or "Non spécifié"
        
        if "Recette" in sens:
            category = classify_by_chapter(chapitre_code, REVENUE_CHAPTER_MAP)
            revenue_by_chapter[category] += montant
            revenue_drilldown[category][nature_libelle] += montant
            
        elif "Dépense" in sens:
            category = classify_by_chapter(chapitre_code, EXPENSE_CHAPTER_MAP)
            expense_by_chapter[category] += montant
            expense_drilldown[category][nature_libelle] += montant
    
    revenue_grouped = defaultdict(float)
    expense_grouped = defaultdict(float)
    revenue_group_drilldown = defaultdict(lambda: defaultdict(float))
    expense_group_drilldown = defaultdict(lambda: defaultdict(float))
    
    # Track section breakdown per expense group
    # Structure: expense_section_breakdown[group][section] = { total, items: {name: value} }
    expense_section_breakdown = defaultdict(lambda: {
        "Fonctionnement": {"total": 0.0, "items": defaultdict(float)},
        "Investissement": {"total": 0.0, "items": defaultdict(float)},
    })
    
    for category, amount in revenue_by_chapter.items():
        group = get_group(category, REVENUE_GROUPS)
        revenue_grouped[group] += amount
        for detail, detail_amount in revenue_drilldown[category].items():
            revenue_group_drilldown[group][f"{category}: {detail}"] += detail_amount
    
    for category, amount in expense_by_chapter.items():
        group = get_group(category, EXPENSE_GROUPS)
        section = get_section(category)
        expense_grouped[group] += amount
        
        for detail, detail_amount in expense_drilldown[category].items():
            expense_group_drilldown[group][f"{category}: {detail}"] += detail_amount
            
            # Track by section (only for Fonctionnement and Investissement)
            if section in ["Fonctionnement", "Investissement"]:
                expense_section_breakdown[group][section]["total"] += detail_amount
                expense_section_breakdown[group][section]["items"][f"{category}: {detail}"] += detail_amount
    
    total_recettes = sum(revenue_grouped.values())
    total_depenses = sum(expense_grouped.values())
    solde = total_recettes - total_depenses
    
    nodes = []
    for name in sorted(revenue_grouped.keys()):
        if revenue_grouped[name] > 0:
            nodes.append({"name": name, "category": "revenue"})
    
    nodes.append({"name": "Budget Paris", "category": "central"})
    
    for name in sorted(expense_grouped.keys()):
        if expense_grouped[name] > 0:
            nodes.append({"name": name, "category": "expense"})
    
    links = []
    for name, value in revenue_grouped.items():
        if value > 0:
            links.append({"source": name, "target": "Budget Paris", "value": value})
    
    for name, value in expense_grouped.items():
        if value > 0:
            links.append({"source": "Budget Paris", "target": name, "value": value})
    
    drilldown = {"revenue": {}, "expenses": {}}
    
    for group, items in revenue_group_drilldown.items():
        drilldown["revenue"][group] = [
            {"name": name, "value": value}
            for name, value in sorted(items.items(), key=lambda x: -x[1])
            if value > 0
        ][:50]
    
    for group, items in expense_group_drilldown.items():
        drilldown["expenses"][group] = [
            {"name": name, "value": value}
            for name, value in sorted(items.items(), key=lambda x: -x[1])
            if value > 0
        ][:50]
    
    # Build bySection structure for each expense group
    by_section = {}
    for group, sections in expense_section_breakdown.items():
        group_total = expense_grouped.get(group, 0)
        if group_total <= 0:
            continue
            
        by_section[group] = {}
        for section_name, section_data in sections.items():
            if section_data["total"] > 0:
                # Sort items by value descending, take top 20
                sorted_items = sorted(
                    section_data["items"].items(),
                    key=lambda x: -x[1]
                )[:20]
                
                by_section[group][section_name] = {
                    "total": section_data["total"],
                    "items": [
                        {"name": name, "value": value}
                        for name, value in sorted_items
                    ]
                }
    
    # Get data availability status
    availability = get_data_availability(year)
    
    return {
        "year": year,
        "dataStatus": availability.get("status", "INCONNU"),
        "dataAvailability": {
            "budget": availability.get("has_budget", False),
            "subventions": availability.get("has_subventions", False),
            "autorisations": availability.get("has_autorisations", False),
            "arrondissements": availability.get("has_arrondissements", False),
        },
        "totals": {
            "recettes": total_recettes,
            "depenses": total_depenses,
            "solde": solde
        },
        "nodes": nodes,
        "links": links,
        "drilldown": drilldown,
        "bySection": by_section,
        "byEntity": []
    }


def export_year(client, year: int, llm_enrichments: dict = None) -> dict:
    """
    Export Sankey data for a single year.
    
    Args:
        client: BigQuery client
        year: Year to export
        llm_enrichments: Optional dict of LLM enrichments (ap_code -> enrichment)
    """
    print(f"\n📊 Processing {year}...")
    
    records = query_budget_data(client, year)
    print(f"  Found {len(records)} records")
    
    sankey_data = build_sankey_data(records, year)
    
    # Add data status info
    availability = get_data_availability(year)
    status = availability.get("status", "INCONNU")
    print(f"  Status: {status}")
    
    print(f"  Recettes: {sankey_data['totals']['recettes']/1e9:.2f} Md€")
    print(f"  Dépenses: {sankey_data['totals']['depenses']/1e9:.2f} Md€")
    print(f"  Solde: {sankey_data['totals']['solde']/1e6:.1f} M€")
    
    # Print section breakdown summary
    if sankey_data.get("bySection"):
        total_fonct = sum(
            s.get("Fonctionnement", {}).get("total", 0)
            for s in sankey_data["bySection"].values()
        )
        total_invest = sum(
            s.get("Investissement", {}).get("total", 0)
            for s in sankey_data["bySection"].values()
        )
        total_sections = total_fonct + total_invest
        if total_sections > 0:
            pct_fonct = total_fonct / total_sections * 100
            pct_invest = total_invest / total_sections * 100
            print(f"  Section: Fonct. {pct_fonct:.0f}% ({total_fonct/1e9:.1f} Md€) | "
                  f"Invest. {pct_invest:.0f}% ({total_invest/1e9:.1f} Md€)")
    
    # Load top beneficiaries and projects for drill-down
    top_beneficiaires = load_top_beneficiaires(client, year)
    top_projets = load_top_projets(client, year)
    
    # Add drill_down section for contextual examples
    sankey_data["drill_down"] = {}
    all_themes = set(list(top_beneficiaires.keys()) + list(top_projets.keys()))
    for theme in all_themes:
        sankey_data["drill_down"][theme] = {
            "top_beneficiaires": top_beneficiaires.get(theme, []),
            "top_projets": top_projets.get(theme, []),
        }
    
    if sankey_data["drill_down"]:
        print(f"  📋 Added drill_down data for {len(sankey_data['drill_down'])} themes")
    
    output_file = OUTPUT_DIR / f"budget_sankey_{year}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(sankey_data, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {output_file.name}")
    
    return {
        "year": year,
        "dataStatus": status,
        "recettes": sankey_data["totals"]["recettes"],
        "depenses": sankey_data["totals"]["depenses"],
        "solde": sankey_data["totals"]["solde"]
    }


def export_index(summaries: list[dict]):
    """Export the index file with available years and data status."""
    summaries.sort(key=lambda x: x["year"], reverse=True)
    
    # Find years with complete data
    complete_years = [s["year"] for s in summaries if s.get("dataStatus") == "COMPLET"]
    partial_years = [s["year"] for s in summaries if s.get("dataStatus") == "PARTIEL"]
    
    index = {
        "availableYears": [s["year"] for s in summaries],
        "latestYear": summaries[0]["year"] if summaries else 2024,
        "latestCompleteYear": complete_years[0] if complete_years else None,
        "completeYears": complete_years,
        "partialYears": partial_years,
        "summary": summaries
    }
    
    output_file = OUTPUT_DIR / "budget_index.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    
    print(f"\n✓ Wrote index: {output_file}")
    print(f"  Complete years: {complete_years}")
    print(f"  Partial years: {partial_years}")


def main():
    """Main entry point."""
    # Import logger
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from utils.logger import Logger
    
    log = Logger("export_sankey")
    log.header("Export Budget Sankey → JSON")
    
    log.info("Création dossier de sortie", extra=str(OUTPUT_DIR))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Load LLM enrichments (for reference, not heavily used now)
    log.section("Chargement enrichissements LLM")
    llm_enrichments = load_llm_enrichments()
    
    # Initialize BigQuery client
    log.section("Connexion BigQuery")
    log.info("Initialisation client", extra=PROJECT_ID)
    client = get_bigquery_client()
    log.success("Connecté à BigQuery")
    
    log.section(f"Export des {len(YEARS)} années")
    summaries = []
    for i, year in enumerate(YEARS, 1):
        log.progress(i, len(YEARS), f"Année {year}")
        try:
            summary = export_year(client, year, llm_enrichments)
            summaries.append(summary)
            log.success(f"Année {year} exportée", extra=f"{summary['recettes']/1e9:.2f} Md€ recettes")
        except Exception as e:
            log.error(f"Erreur année {year}", extra=str(e))
            import traceback
            traceback.print_exc()
    
    if summaries:
        log.section("Génération de l'index")
        export_index(summaries)
        log.success("Index créé", extra="budget_index.json")
    
    log.summary()
    
    # Légende
    print("Légende statuts:")
    print("  COMPLET  = Budget + Subventions + AP/CP + Arrondissements")
    print("  PARTIEL  = Budget + Subventions (sources manquantes)")
    print("  BUDGET_SEUL = Budget principal uniquement")


if __name__ == "__main__":
    main()
