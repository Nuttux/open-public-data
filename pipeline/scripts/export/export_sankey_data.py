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
    website/public/data/budget_sankey_{year}.json
    website/public/data/budget_index.json
"""

import csv
import json
import os
import sys
from pathlib import Path
from google.cloud import bigquery
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent))
from _sankey_common import get_bigquery_client, sankey_nodes_and_links  # noqa: E402

# ─── Fonction imputation (cf. pipeline/scripts/audit/build_fonction_imputation.py) ───
# Pour les budgets votés (BP 2025+), fonction_libelle est vide → on impute
# par RÉPARTITION PROPORTIONNELLE depuis l'historique CA (2019-2024).
#
# Chaque item BP "Non spécifié" est éclaté en N sub-items selon les ratios
# observés sur le combo (category, flow_category) — préserve le total exact.
# Ex : "Éducation+Personnel" 334M€ → 140M€ Écoles primaires (42%) + 117M€
# Écoles maternelles (35%) + ...
#
# Confiance au niveau du COMBO :
#   - high   : 1 fonction domine ≥70% du combo historique
#   - medium : combo réparti (40-70% sur la dominante)
_FONCTION_IMPUTATION_CACHE: dict[tuple[str, str], list[dict]] | None = None


def _load_fonction_imputation() -> dict[tuple[str, str], list[dict]]:
    """Lazy-load seed into {(category, flow_category) → [{fonction, ratio, confidence}, ...]}."""
    global _FONCTION_IMPUTATION_CACHE
    if _FONCTION_IMPUTATION_CACHE is not None:
        return _FONCTION_IMPUTATION_CACHE
    seed_path = Path(__file__).resolve().parents[2] / "seeds" / "seed_fonction_imputed.csv"
    cache: dict[tuple[str, str], list[dict]] = {}
    if seed_path.exists():
        with seed_path.open() as f:
            for row in csv.DictReader(f):
                key = (row["category"], row["flow_category"])
                cache.setdefault(key, []).append({
                    "fonction": row["fonction"],
                    "ratio": float(row["ratio"]),
                    "confidence": row["confidence"],
                })
    _FONCTION_IMPUTATION_CACHE = cache
    return cache


def split_fonction(category: str, flow_category: str, current_fonction: str, montant: float) -> list[dict]:
    """Return a list of {fonction, share, confidence, imputed, ratio} dicts.

    For CA exécuté (fonction != 'Non spécifié'), returns a single entry with
    the original fonction and the full montant.

    For BP voté (fonction == 'Non spécifié'), splits the montant according to
    historical ratios. Preserves total: last entry gets the rounding residual.
    """
    if current_fonction != "Non spécifié":
        return [{
            "fonction": current_fonction,
            "share": montant,
            "confidence": "ca",
            "imputed": False,
            "ratio": 1.0,
        }]
    seed = _load_fonction_imputation()
    entries = seed.get((category, flow_category))
    if not entries:
        return [{
            "fonction": current_fonction,
            "share": montant,
            "confidence": "unknown",
            "imputed": False,
            "ratio": 1.0,
        }]
    out = []
    accumulated = 0.0
    for i, entry in enumerate(entries):
        if i == len(entries) - 1:
            share = montant - accumulated
        else:
            share = round(montant * entry["ratio"], 2)
            accumulated += share
        if share <= 0:
            continue
        out.append({
            "fonction": entry["fonction"],
            "share": share,
            "confidence": entry["confidence"],
            "imputed": True,
            "ratio": entry["ratio"],
        })
    return out

# Configuration
PROJECT_ID = "open-data-france-484717"
DATASET_ID = "dbt_paris"  # Base dataset (staging, intermediate, analytics)
# Marts dataset can be overridden (e.g. for dev runs against dbt_paris_dev_<user>_marts).
MARTS_DATASET = os.environ.get("PARIS_MARTS_DATASET", "dbt_paris_marts")
RAW_DATASET = "raw"       # Dataset for raw OpenData Paris tables
TABLE_ID = "ca_budget_principal"  # Main budget table in raw
OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data"
SEEDS_DIR = Path(__file__).parent.parent / "paris-public-open-data" / "seeds"

YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]

# Years sourced from core_budget_vote (Budget Primitif) instead of core_budget (CA)
# These are voted/forecast years — not yet executed
VOTED_YEARS = {2025, 2026}

# Data availability by year (based on sync_opendata.py check)
# Updated when sync runs
DATA_AVAILABILITY = {
    2026: {"status": "BUDGET_VOTE", "type_budget": "vote", "has_budget": True, "has_subventions": False, "has_autorisations": False, "has_arrondissements": False},
    2025: {"status": "BUDGET_VOTE", "type_budget": "vote", "has_budget": True, "has_subventions": False, "has_autorisations": False, "has_arrondissements": False},
    2024: {"status": "PARTIEL", "type_budget": "execute", "has_budget": True, "has_subventions": True, "has_autorisations": False, "has_arrondissements": False},
    2023: {"status": "PARTIEL", "type_budget": "execute", "has_budget": True, "has_subventions": True, "has_autorisations": False, "has_arrondissements": True},
    2022: {"status": "COMPLET", "type_budget": "execute", "has_budget": True, "has_subventions": True, "has_autorisations": True, "has_arrondissements": True},
    2021: {"status": "COMPLET", "type_budget": "execute", "has_budget": True, "has_subventions": True, "has_autorisations": True, "has_arrondissements": True},
    2020: {"status": "COMPLET", "type_budget": "execute", "has_budget": True, "has_subventions": True, "has_autorisations": True, "has_arrondissements": True},
    2019: {"status": "COMPLET", "type_budget": "execute", "has_budget": True, "has_subventions": True, "has_autorisations": True, "has_arrondissements": True},
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
    "Remboursement dette": ["Remboursement Dette", "Opérations Financières"],
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


# Note: int_top_beneficiaires and int_top_projets were removed from the dbt
# project. The drill_down field is now always emitted as {} (the upstream
# tables never materialized in production, so the baseline JSON already had
# drill_down empty). If we want top-N drill-downs back, build them as proper
# marts (mart_top_beneficiaires_par_thematique, etc.) and rewire here.


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


def query_budget_data(client, year: int) -> list[dict]:
    """
    Query budget lines for a specific year from mart_budget_sankey_lines.

    The mart unions core_budget (CA, executed) and core_budget_vote (BP, voted)
    with a discriminator column. We pick the right slice per year.
    """
    type_budget = "vote" if year in VOTED_YEARS else "execute"
    print(f"  Querying {type_budget.upper()} budget for {year} (mart_budget_sankey_lines)...")
    query = f"""
    SELECT
        sens_flux AS sens,
        chapitre_code,
        chapitre_libelle,
        fonction_libelle,
        nature_libelle,
        ode_categorie_flux,
        montant
    FROM `{PROJECT_ID}.{MARTS_DATASET}.mart_budget_sankey_lines`
    WHERE annee = {year}
      AND type_budget = '{type_budget}'
    """
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
    # Expense drilldown keyed by (fonction, flow_category, nature_libelle).
    expense_drilldown = defaultdict(lambda: defaultdict(float))
    # Track imputation metadata per (fonction, flow_category, nature) key
    expense_meta: dict[tuple[str, str, str], dict] = {}

    for record in records:
        montant = float(record.get("montant", 0))
        sens = record.get("sens", "")
        chapitre_code = record.get("chapitre_code", "")
        chapitre_libelle = record.get("chapitre_libelle", "")
        nature_libelle = record.get("nature_libelle", "") or chapitre_libelle or "Non spécifié"
        fonction_libelle = (record.get("fonction_libelle") or "").strip() or "Non spécifié"
        flow_category = (record.get("ode_categorie_flux") or "").strip() or "Autre"

        if "Recette" in sens:
            category = classify_by_chapter(chapitre_code, REVENUE_CHAPTER_MAP)
            revenue_by_chapter[category] += montant
            revenue_drilldown[category][nature_libelle] += montant

        elif "Dépense" in sens:
            category = classify_by_chapter(chapitre_code, EXPENSE_CHAPTER_MAP)
            # Split fonction proportionnellement quand absente (BP voté).
            # Préserve le total : chaque sub-item reçoit sa part historique.
            splits = split_fonction(category, flow_category, fonction_libelle, montant)
            expense_by_chapter[category] += montant
            for s in splits:
                key = (s["fonction"], flow_category, nature_libelle)
                expense_drilldown[category][key] += s["share"]
                if key not in expense_meta:
                    expense_meta[key] = {
                        "confidence": s["confidence"],
                        "imputed": s["imputed"],
                        "ratio": s["ratio"],
                    }
    
    revenue_grouped = defaultdict(float)
    expense_grouped = defaultdict(float)
    revenue_group_drilldown = defaultdict(lambda: defaultdict(float))
    # Keys: (fonction, flow_category, name) — name is "{category}: {nature_libelle}"
    # kept for backward-compat with consumers that still split on ":".
    expense_group_drilldown = defaultdict(lambda: defaultdict(float))

    # Track section breakdown per expense group
    # Structure: expense_section_breakdown[group][section] = { total, items: {key: value} }
    expense_section_breakdown = defaultdict(lambda: {
        "Fonctionnement": {"total": 0.0, "items": defaultdict(float)},
        "Investissement": {"total": 0.0, "items": defaultdict(float)},
    })

    for category, amount in revenue_by_chapter.items():
        group = get_group(category, REVENUE_GROUPS)
        revenue_grouped[group] += amount
        for detail, detail_amount in revenue_drilldown[category].items():
            revenue_group_drilldown[group][f"{category}: {detail}"] += detail_amount

    # Per-output-row imputation meta: row_key (fonction, flow_category,
    # "{category}: {nature}") → {confidence, imputed, ratio}
    expense_row_meta: dict[tuple[str, str, str], dict] = {}

    for category, amount in expense_by_chapter.items():
        group = get_group(category, EXPENSE_GROUPS)
        section = get_section(category)
        expense_grouped[group] += amount

        for (fonction, flow_category, nature_libelle), detail_amount in expense_drilldown[category].items():
            row_key = (fonction, flow_category, f"{category}: {nature_libelle}")
            expense_group_drilldown[group][row_key] += detail_amount
            # Carry the imputation meta forward
            meta = expense_meta.get((fonction, flow_category, nature_libelle))
            if meta and row_key not in expense_row_meta:
                expense_row_meta[row_key] = meta

            # Track by section (only for Fonctionnement and Investissement)
            if section in ["Fonctionnement", "Investissement"]:
                expense_section_breakdown[group][section]["total"] += detail_amount
                expense_section_breakdown[group][section]["items"][row_key] += detail_amount
    
    total_recettes = sum(revenue_grouped.values())
    total_depenses = sum(expense_grouped.values())
    solde = total_recettes - total_depenses
    
    # ECharts Sankey nodes + links, with " (R)" / " (D)" disambiguation when a
    # group name appears on both sides. Shared with the Marseille export.
    nodes, links, rev_display, exp_display = sankey_nodes_and_links(
        revenue_grouped, expense_grouped, "Budget Paris"
    )

    drilldown = {"revenue": {}, "expenses": {}}

    for group, items in revenue_group_drilldown.items():
        drilldown["revenue"][rev_display(group)] = [
            {"name": name, "value": value}
            for name, value in sorted(items.items(), key=lambda x: -x[1])
            if value > 0
        ][:50]

    for group, items in expense_group_drilldown.items():
        out_items = []
        for (fonction, flow_category, name), value in sorted(items.items(), key=lambda x: -x[1]):
            if value <= 0:
                continue
            meta = expense_row_meta.get((fonction, flow_category, name), {})
            row = {
                "name": name,
                "value": value,
                "fonction": fonction,
                "flow_category": flow_category,
                "fonction_confidence": meta.get("confidence", "unknown"),
            }
            if meta.get("imputed"):
                row["fonction_imputed"] = True
                row["fonction_ratio"] = meta.get("ratio", 1.0)
            out_items.append(row)
        drilldown["expenses"][exp_display(group)] = out_items[:50]
    
    # Build bySection structure for each expense group
    by_section = {}
    for group, sections in expense_section_breakdown.items():
        group_total = expense_grouped.get(group, 0)
        if group_total <= 0:
            continue

        display_name = exp_display(group)
        by_section[display_name] = {}
        for section_name, section_data in sections.items():
            if section_data["total"] > 0:
                # Sort items by value descending, take top 20
                sorted_items = sorted(
                    section_data["items"].items(),
                    key=lambda x: -x[1]
                )[:20]

                section_items_out = []
                for (fonction, flow_category, name), value in sorted_items:
                    meta = expense_row_meta.get((fonction, flow_category, name), {})
                    row = {
                        "name": name,
                        "value": value,
                        "fonction": fonction,
                        "flow_category": flow_category,
                        "fonction_confidence": meta.get("confidence", "unknown"),
                    }
                    if meta.get("imputed"):
                        row["fonction_imputed"] = True
                        row["fonction_ratio"] = meta.get("ratio", 1.0)
                    section_items_out.append(row)
                by_section[display_name][section_name] = {
                    "total": section_data["total"],
                    "items": section_items_out,
                }
    
    # Get data availability status
    availability = get_data_availability(year)
    type_budget = availability.get("type_budget", "execute")
    
    result = {
        "year": year,
        "type_budget": type_budget,
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
    
    # Add disclaimer for voted (non-executed) years
    if type_budget == "vote":
        result["disclaimer"] = (
            "Budget prévisionnel voté par le Conseil de Paris (Budget Primitif). "
            "Les montants réellement exécutés seront disponibles après clôture du Compte Administratif."
        )
    
    return result


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
    
    # drill_down is always empty until the per-thematique top-N marts are built.
    sankey_data["drill_down"] = {}
    
    output_file = OUTPUT_DIR / f"budget_sankey_{year}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(sankey_data, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {output_file.name}")
    
    return {
        "year": year,
        "type_budget": sankey_data.get("type_budget", "execute"),
        "dataStatus": status,
        "recettes": sankey_data["totals"]["recettes"],
        "depenses": sankey_data["totals"]["depenses"],
        "solde": sankey_data["totals"]["solde"]
    }


def export_index(summaries: list[dict]):
    """Export the index file with available years, data status, and budget type metadata."""
    summaries.sort(key=lambda x: x["year"], reverse=True)
    
    # Find years with complete data
    complete_years = [s["year"] for s in summaries if s.get("dataStatus") == "COMPLET"]
    partial_years = [s["year"] for s in summaries if s.get("dataStatus") == "PARTIEL"]
    voted_years = [s["year"] for s in summaries if s.get("dataStatus") == "BUDGET_VOTE"]
    
    # Build year_types map for frontend BudgetTypeBadge
    year_types = {}
    for s in summaries:
        y = s["year"]
        year_types[str(y)] = "vote" if y in VOTED_YEARS else "execute"
    
    index = {
        "availableYears": [s["year"] for s in summaries],
        "latestYear": summaries[0]["year"] if summaries else 2024,
        "latestCompleteYear": complete_years[0] if complete_years else None,
        "completeYears": complete_years,
        "partialYears": partial_years,
        "votedYears": voted_years,
        "year_types": year_types,
        "covid_years": [2020, 2021],
        "summary": summaries
    }
    
    output_file = OUTPUT_DIR / "budget_index.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    
    print(f"\n✓ Wrote index: {output_file}")
    print(f"  Complete years: {complete_years}")
    print(f"  Partial years: {partial_years}")
    print(f"  Voted years: {voted_years}")


def main():
    """Main entry point."""
    # Import logger
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
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
    client = get_bigquery_client(PROJECT_ID, [Path(__file__).parent.parent.parent / "credentials.json"])
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
