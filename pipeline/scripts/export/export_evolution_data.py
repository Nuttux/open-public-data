#!/usr/bin/env python3
"""
Export Evolution Data for Paris Budget Dashboard

This script queries the mart_evolution_budget model to generate JSON files 
for the evolution page with:
- Yearly totals (recettes, dépenses, solde)
- Section breakdown (Fonctionnement vs Investissement)
- Financial metrics (épargne brute, surplus/déficit financier)
- Métriques dette (emprunts, remboursement principal, intérêts, variation nette)
- 6-year variations:
  - DÉPENSES: par thématique (où va l'argent)
  - RECETTES: par source (d'où vient l'argent)

Key concepts:
- Épargne brute = Recettes fonctionnement - Dépenses fonctionnement
  (capacité d'autofinancement de la collectivité)
- Surplus/Déficit financier = Recettes propres (hors emprunts) - Dépenses
  (santé financière réelle, emprunts exclus)
- Solde comptable = Recettes totales - Dépenses totales
  (équilibre technique, toujours proche de 0)

Métriques dette (nature codes M57):
- Emprunts = nature 16xx recettes (nouveaux emprunts reçus)
- Remboursement principal = nature 16xx dépenses (capital remboursé)
- Intérêts dette = nature 66xx dépenses (coût du service de la dette)
- Variation dette nette = Emprunts - Remboursement principal
  (positif = dette augmente, négatif = dette diminue)

Note: Les emprunts sont classés en "recettes" par la comptabilité publique
(flux entrant) mais ce n'est PAS une ressource propre - c'est de la dette !
C'est pourquoi on distingue recettes_propres = recettes - emprunts.

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
from collections import defaultdict

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

# =============================================================================
# REVENUE SOURCE CLASSIFICATION (same as Sankey for consistency)
# =============================================================================

# Mapping chapitre_code → catégorie source
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

# Groupement des catégories → source de recette (labels citoyens)
REVENUE_GROUPS = {
    "Impôts & Taxes": ["Fiscalité Directe", "Fiscalité Indirecte"],
    "Dotations État": ["Dotations État", "Fonds Européens"],
    "Emprunts": ["Emprunts & Dette", "Opérations Financières"],
    "Services Publics": ["Services Généraux", "Sécurité", "Éducation", "Culture & Sport", 
                         "Action Sociale", "APA", "RSA", "Aménagement", "Action Économique",
                         "Environnement", "Transports"],
    "Cessions & Investissement": ["Invest. Services", "Invest. Sécurité", "Invest. Éducation",
                       "Invest. Culture", "Invest. Social", "Invest. Aménagement",
                       "Invest. Économie", "Invest. Environnement", "Invest. Transports"],
}


def classify_revenue_by_chapter(chapitre_code: str) -> str:
    """Classify revenue chapter to category, using longest prefix match."""
    if not chapitre_code:
        return "Autres"
    
    for length in range(len(chapitre_code), 0, -1):
        prefix = chapitre_code[:length]
        if prefix in REVENUE_CHAPTER_MAP:
            return REVENUE_CHAPTER_MAP[prefix]
    
    return "Autres"


def get_revenue_source_group(category: str) -> str:
    """Map a revenue category to its source group."""
    for group, categories in REVENUE_GROUPS.items():
        if category in categories:
            return group
    return "Autres"


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
    - par_thematique: breakdown by thematique (for expenses)
    """
    logger.info("Fetching evolution data from BigQuery...")
    
    # Query for all views (including new debt metrics)
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
        surplus_deficit,
        -- Métriques dette
        emprunts,
        remboursement_principal,
        interets_dette,
        variation_dette_nette
    FROM `{PROJECT_ID}.{DATASET_ID}.mart_evolution_budget`
    WHERE annee IN ({','.join(str(y) for y in YEARS)})
    ORDER BY vue, annee, sens_flux, section
    """
    
    results = client.query(query).result()
    
    data = {
        "par_annee": [],      # Totaux par année
        "metriques": [],      # Métriques financières
        "par_section": [],    # Par section
        "par_thematique": [], # Par thématique (dépenses uniquement)
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
                # Métriques dette
                "emprunts": float(row.emprunts) if row.emprunts else 0,
                "remboursement_principal": float(row.remboursement_principal) if row.remboursement_principal else 0,
                "interets_dette": float(row.interets_dette) if row.interets_dette else 0,
                "variation_dette_nette": float(row.variation_dette_nette) if row.variation_dette_nette else 0,
            })
        elif row.vue == "par_section":
            data["par_section"].append({
                "annee": row.annee,
                "section": row.section,
                "sens_flux": row.sens_flux,
                "montant": float(row.montant_total) if row.montant_total else 0,
            })
        elif row.vue == "par_thematique":
            # Only keep expenses for thematique (revenues will use source classification)
            if row.sens_flux == "Dépense":
                data["par_thematique"].append({
                    "annee": row.annee,
                    "sens_flux": row.sens_flux,
                    "thematique": row.thematique_macro,
                    "montant": float(row.montant_total) if row.montant_total else 0,
                })
    
    logger.info(f"  - {len(data['par_annee'])} rows par_annee")
    logger.info(f"  - {len(data['metriques'])} rows métriques")
    logger.info(f"  - {len(data['par_section'])} rows par_section")
    logger.info(f"  - {len(data['par_thematique'])} rows par_thematique (dépenses)")
    
    return data


def fetch_revenues_by_source(client: bigquery.Client) -> list:
    """
    Fetch revenue data by chapitre_code from core_budget for source classification.
    
    This allows us to classify revenues by their SOURCE (Impôts, Emprunts, Dotations...)
    instead of by thematique which is not meaningful for revenues.
    
    Uses dbt_paris_analytics.core_budget (same as sankey export).
    
    Returns list of dicts with: annee, source, montant
    """
    logger.info("Fetching revenue data by chapter for source classification...")
    
    # Use dbt_paris_analytics dataset where core_budget is materialized
    analytics_dataset = "dbt_paris_analytics"
    
    query = f"""
    SELECT
        annee,
        chapitre_code,
        SUM(montant) AS montant
    FROM `{PROJECT_ID}.{analytics_dataset}.core_budget`
    WHERE annee IN ({','.join(str(y) for y in YEARS)})
      AND sens_flux = 'Recette'
    GROUP BY annee, chapitre_code
    ORDER BY annee, chapitre_code
    """
    
    results = client.query(query).result()
    
    # Process: chapitre_code → category → source group, aggregate by year + source
    revenues_by_source = defaultdict(lambda: defaultdict(float))
    
    for row in results:
        category = classify_revenue_by_chapter(row.chapitre_code)
        source_group = get_revenue_source_group(category)
        revenues_by_source[row.annee][source_group] += float(row.montant) if row.montant else 0
    
    # Convert to list format
    result = []
    for annee, sources in revenues_by_source.items():
        for source, montant in sources.items():
            result.append({
                "annee": annee,
                "sens_flux": "Recette",
                "source": source,
                "montant": montant,
            })
    
    logger.info(f"  - {len(result)} revenue rows by source")
    return result


def calculate_variations_6ans(par_thematique: list, revenues_by_source: list) -> dict:
    """
    Calculate 6-year variation (2019 → 2024) for budget categories.
    
    IMPORTANT: Uses DIFFERENT classifications for expenses and revenues:
    - DÉPENSES: par thématique (où va l'argent: Social, Éducation, Transport...)
    - RECETTES: par source (d'où vient l'argent: Impôts, Emprunts, Dotations...)
    
    Returns:
    {
        "periode": {"debut": 2019, "fin": 2024},
        "depenses": [
            {"label": "Action Sociale", "montant_debut": X, "montant_fin": Y, "variation_euros": Z, "variation_pct": W},
            ...
        ],
        "recettes": [
            {"label": "Impôts & Taxes", "montant_debut": X, "montant_fin": Y, "variation_euros": Z, "variation_pct": W},
            ...
        ]
    }
    
    Sorted by variation_euros (biggest changes first)
    """
    # -------------------------------------------------------------------------
    # DÉPENSES: Group by thematique
    # -------------------------------------------------------------------------
    depenses_by_thematique = defaultdict(dict)
    
    for row in par_thematique:
        if row["sens_flux"] == "Dépense":
            depenses_by_thematique[row["thematique"]][row["annee"]] = row["montant"]
    
    # -------------------------------------------------------------------------
    # RECETTES: Group by source (already classified in revenues_by_source)
    # -------------------------------------------------------------------------
    recettes_by_source = defaultdict(dict)
    
    for row in revenues_by_source:
        recettes_by_source[row["source"]][row["annee"]] = row["montant"]
    
    # -------------------------------------------------------------------------
    # Find min and max years across all data
    # -------------------------------------------------------------------------
    all_years = set()
    for row in par_thematique:
        all_years.add(row["annee"])
    for row in revenues_by_source:
        all_years.add(row["annee"])
    
    if not all_years:
        return {"periode": {}, "depenses": [], "recettes": []}
    
    annee_debut = min(all_years)
    annee_fin = max(all_years)
    
    # -------------------------------------------------------------------------
    # Calculate DÉPENSES variations (by thématique)
    # -------------------------------------------------------------------------
    depenses = []
    
    for thematique, montants_par_annee in depenses_by_thematique.items():
        # Skip "Autre" category - not meaningful
        if thematique == "Autre":
            continue
            
        montant_debut = montants_par_annee.get(annee_debut, 0)
        montant_fin = montants_par_annee.get(annee_fin, 0)
        
        variation_euros = montant_fin - montant_debut
        variation_pct = ((montant_fin / montant_debut) - 1) * 100 if montant_debut > 0 else 0
        
        depenses.append({
            "label": thematique,  # "label" instead of "thematique" for consistency
            "montant_debut": montant_debut,
            "montant_fin": montant_fin,
            "variation_euros": variation_euros,
            "variation_pct": round(variation_pct, 1)
        })
    
    # -------------------------------------------------------------------------
    # Calculate RECETTES variations (by source)
    # -------------------------------------------------------------------------
    recettes = []
    
    for source, montants_par_annee in recettes_by_source.items():
        # Skip "Autres" category
        if source == "Autres":
            continue
            
        montant_debut = montants_par_annee.get(annee_debut, 0)
        montant_fin = montants_par_annee.get(annee_fin, 0)
        
        variation_euros = montant_fin - montant_debut
        variation_pct = ((montant_fin / montant_debut) - 1) * 100 if montant_debut > 0 else 0
        
        recettes.append({
            "label": source,  # "label" instead of "source" for consistency
            "montant_debut": montant_debut,
            "montant_fin": montant_fin,
            "variation_euros": variation_euros,
            "variation_pct": round(variation_pct, 1)
        })
    
    # -------------------------------------------------------------------------
    # Sort: by absolute variation (biggest changes first)
    # -------------------------------------------------------------------------
    depenses.sort(key=lambda x: abs(x["variation_euros"]), reverse=True)
    recettes.sort(key=lambda x: abs(x["variation_euros"]), reverse=True)
    
    return {
        "periode": {"debut": annee_debut, "fin": annee_fin},
        "depenses": depenses,
        "recettes": recettes,
        "classifications": {
            "depenses": "par thématique (destination des dépenses)",
            "recettes": "par source (origine des recettes)"
        }
    }


def transform_for_frontend(raw_data: dict, revenues_by_source: list) -> dict:
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
        ],
        "variations_6ans": {
            "depenses": [...],   # par thématique
            "recettes": [...]    # par source
        }
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
            # Métriques dette (depuis dbt, nature codes précis)
            years_data[year]["totals"]["emprunts"] = row["emprunts"]
            years_data[year]["totals"]["remboursement_principal"] = row["remboursement_principal"]
            years_data[year]["totals"]["interets_dette"] = row["interets_dette"]
            years_data[year]["totals"]["variation_dette_nette"] = row["variation_dette_nette"]
    
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
    
    # Calculate 6-year variations with DIFFERENT classifications:
    # - Dépenses: par thématique (où va l'argent)
    # - Recettes: par source (d'où vient l'argent)
    variations_6ans = calculate_variations_6ans(raw_data["par_thematique"], revenues_by_source)
    
    result = {
        "generated_at": datetime.now().isoformat(),
        "source": "mart_evolution_budget + core_budget",
        "description": "Données d'évolution du budget de Paris avec métriques financières",
        "definitions": {
            "solde_comptable": "Recettes totales - Dépenses totales (équilibre technique)",
            "recettes_propres": "Recettes totales - Emprunts (ressources réelles)",
            "surplus_deficit": "Recettes propres - Dépenses (santé financière réelle)",
            "epargne_brute": "Recettes fonct. - Dépenses fonct. (capacité d'autofinancement)",
            "emprunts": "Nouveaux emprunts reçus (nature 16xx recettes)",
            "remboursement_principal": "Remboursement du capital de la dette (nature 16xx dépenses)",
            "interets_dette": "Intérêts payés sur la dette (nature 66xx dépenses)",
            "variation_dette_nette": "Emprunts - Remboursement principal (+ = dette augmente)"
        },
        "years": sorted_years,
        "variations_6ans": variations_6ans
    }
    
    logger.info(f"  - {len(sorted_years)} years processed")
    logger.info(f"  - {len(variations_6ans['depenses'])} postes dépenses (par thématique)")
    logger.info(f"  - {len(variations_6ans['recettes'])} postes recettes (par source)")
    
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
        
        # Fetch data from mart_evolution_budget
        raw_data = fetch_evolution_data(client)
        
        # Fetch revenue data by source (separate query for proper classification)
        revenues_by_source = fetch_revenues_by_source(client)
        
        # Transform with both data sources
        frontend_data = transform_for_frontend(raw_data, revenues_by_source)
        
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
