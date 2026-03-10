#!/usr/bin/env python3
"""
Export National Data for Multi-City Dashboard

Queries BigQuery national marts and generates JSON files for the frontend.

Output structure:
    website/public/data/villes/
        cities.json               → city metadata + available years
        benchmarking.json         → KPIs compared across all cities
        {slug}/
            budget_sankey_{year}.json  → Sankey data (BudgetData format)
            bilan_{year}.json         → Patrimoine data
            evolution.json            → Multi-year trends
            marches_{year}.json       → Public contracts by category
            subventions_{year}.json   → Subsidies

Usage:
    python scripts/export/export_national.py
"""

import json
import os
from collections import defaultdict
from pathlib import Path

from google.cloud import bigquery

# Configuration
PROJECT_ID = "open-data-france-484717"
NATIONAL_MARTS = "national_marts"
NATIONAL_CORE = "national_core"
OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data" / "villes"

# City display names for Sankey central node
CITY_LABELS = {
    "paris": "Budget Paris",
    "marseille": "Budget Marseille",
    "lyon": "Budget Lyon",
    "toulouse": "Budget Toulouse",
    "nice": "Budget Nice",
}


def ensure_dir(path: Path):
    """Create directory if it doesn't exist."""
    path.mkdir(parents=True, exist_ok=True)


def save_json(data: dict | list, path: Path):
    """Save data as formatted JSON."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"    Saved {path.name} ({path.stat().st_size / 1024:.1f} KB)")


def query_bq(client: bigquery.Client, query: str) -> list[dict]:
    """Execute BigQuery query and return list of dicts."""
    results = client.query(query).result()
    return [dict(row) for row in results]


# =============================================================================
# Export: Budget Sankey
# =============================================================================

def export_budget_sankey(client: bigquery.Client):
    """Export Sankey data per city per year."""
    print("\n  BUDGET SANKEY")

    query = f"""
    SELECT *
    FROM `{PROJECT_ID}.{NATIONAL_MARTS}.mart_sankey_national`
    ORDER BY commune_slug, annee, sens_flux, montant DESC
    """
    rows = query_bq(client, query)

    if not rows:
        print("    No data found")
        return

    # Group by city and year
    by_city_year = defaultdict(lambda: defaultdict(list))
    for row in rows:
        by_city_year[row["commune_slug"]][row["annee"]].append(row)

    for slug, years_data in by_city_year.items():
        city_dir = OUTPUT_DIR / slug
        ensure_dir(city_dir)

        available_years = sorted(years_data.keys(), reverse=True)

        for year, year_rows in years_data.items():
            # Build Sankey structure compatible with BudgetData
            central_label = CITY_LABELS.get(slug, f"Budget {slug.title()}")

            # Collect revenue and expense nodes
            revenue_nodes = {}
            expense_nodes = {}
            emprunts_dette = {"revenue": 0, "expense": 0}

            for row in year_rows:
                group = row["sankey_group"]
                montant = float(row["montant"])
                sens = row["sens_flux"]

                if sens == "Recette":
                    if group == "Emprunts & Dette":
                        emprunts_dette["revenue"] += montant
                    else:
                        revenue_nodes[group] = revenue_nodes.get(group, 0) + montant
                elif sens == "Depense":
                    if group == "Emprunts & Dette":
                        emprunts_dette["expense"] += montant
                    else:
                        expense_nodes[group] = expense_nodes.get(group, 0) + montant
                elif sens == "Both":
                    # Emprunts: positive = received (revenue), negative = repaid (expense)
                    if montant > 0:
                        emprunts_dette["revenue"] += montant
                    else:
                        emprunts_dette["expense"] += abs(montant)

            # Add emprunts if present
            if emprunts_dette["revenue"] > 0:
                revenue_nodes["Emprunts"] = emprunts_dette["revenue"]
            if emprunts_dette["expense"] > 0:
                expense_nodes["Dette"] = emprunts_dette["expense"]

            # Build nodes and links
            nodes = []
            links = []

            # Revenue nodes
            for name, value in sorted(revenue_nodes.items(), key=lambda x: -x[1]):
                if value > 0:
                    nodes.append({"name": name, "category": "revenue"})
                    links.append({"source": name, "target": central_label, "value": round(value, 2)})

            # Central node
            nodes.append({"name": central_label, "category": "central"})

            # Expense nodes
            for name, value in sorted(expense_nodes.items(), key=lambda x: -x[1]):
                if value > 0:
                    nodes.append({"name": name, "category": "expense"})
                    links.append({"source": central_label, "target": name, "value": round(value, 2)})

            total_recettes = sum(revenue_nodes.values())
            total_depenses = sum(expense_nodes.values())

            # Drilldown by category
            drilldown = {"revenue": {}, "expenses": {}}
            for name in revenue_nodes:
                drilldown["revenue"][name] = [{"name": name, "value": round(revenue_nodes[name], 2)}]
            for name in expense_nodes:
                drilldown["expenses"][name] = [{"name": name, "value": round(expense_nodes[name], 2)}]

            sankey_data = {
                "year": year,
                "type_budget": "execute",
                "city_slug": slug,
                "city_name": slug.title() if slug != "paris" else "Paris",
                "dataStatus": "COMPLET",
                "totals": {
                    "recettes": round(total_recettes, 2),
                    "depenses": round(total_depenses, 2),
                    "solde": round(total_recettes - total_depenses, 2),
                },
                "nodes": nodes,
                "links": links,
                "drilldown": drilldown,
            }

            save_json(sankey_data, city_dir / f"budget_sankey_{year}.json")

        # Save city index
        save_json({
            "availableYears": available_years,
            "latestYear": available_years[0] if available_years else None,
        }, city_dir / "budget_index.json")

        print(f"    {slug}: {len(available_years)} years exported")


# =============================================================================
# Export: Benchmarking
# =============================================================================

def export_benchmarking(client: bigquery.Client):
    """Export benchmarking data for all cities."""
    print("\n  BENCHMARKING")

    query = f"""
    SELECT *
    FROM `{PROJECT_ID}.{NATIONAL_MARTS}.mart_benchmarking`
    ORDER BY annee DESC, commune_slug
    """
    rows = query_bq(client, query)

    if not rows:
        print("    No data found")
        return

    # Group by city
    cities = {}
    all_years = set()

    for row in rows:
        slug = row["commune_slug"]
        year = row["annee"]
        all_years.add(year)

        if slug not in cities:
            cities[slug] = {
                "slug": slug,
                "name": row["commune_nom"],
                "population": row["population"],
                "years": {},
            }

        cities[slug]["years"][str(year)] = {
            "recettes_fonctionnement": _float(row.get("produits_fonctionnement")),
            "depenses_fonctionnement": _float(row.get("charges_fonctionnement")),
            "produits_fiscaux": _float(row.get("produits_fiscaux")),
            "dgf": _float(row.get("dgf")),
            "charges_personnel": _float(row.get("charges_personnel")),
            "depenses_investissement": _float(row.get("depenses_investissement")),
            "encours_dette": _float(row.get("encours_dette")),
            "epargne_brute": _float(row.get("epargne_brute")),
            "epargne_nette": _float(row.get("epargne_nette")),
            "recettes_par_hab": _float(row.get("recettes_par_hab")),
            "depenses_par_hab": _float(row.get("depenses_par_hab")),
            "dette_par_hab": _float(row.get("dette_par_hab")),
            "investissement_par_hab": _float(row.get("investissement_par_hab")),
            "personnel_par_hab": _float(row.get("personnel_par_hab")),
            "fiscalite_par_hab": _float(row.get("fiscalite_par_hab")),
            "taux_epargne_brute": _float(row.get("taux_epargne_brute")),
            "pct_personnel": _float(row.get("pct_personnel")),
            "ratio_dette_recettes": _float(row.get("ratio_dette_recettes")),
        }

    sorted_years = sorted(all_years, reverse=True)

    benchmarking = {
        "latest_year": sorted_years[0] if sorted_years else None,
        "available_years": sorted_years,
        "cities": list(cities.values()),
    }

    ensure_dir(OUTPUT_DIR)
    save_json(benchmarking, OUTPUT_DIR / "benchmarking.json")
    print(f"    {len(cities)} cities, {len(sorted_years)} years")


def _float(v) -> float | None:
    """Safe float conversion."""
    if v is None:
        return None
    try:
        return round(float(v), 2)
    except (ValueError, TypeError):
        return None


# =============================================================================
# Export: Evolution
# =============================================================================

def export_evolution(client: bigquery.Client):
    """Export multi-year evolution per city."""
    print("\n  EVOLUTION")

    query = f"""
    SELECT *
    FROM `{PROJECT_ID}.{NATIONAL_MARTS}.mart_evolution_national`
    ORDER BY commune_slug, annee
    """
    rows = query_bq(client, query)

    if not rows:
        print("    No data found")
        return

    by_city = defaultdict(list)
    for row in rows:
        by_city[row["commune_slug"]].append(row)

    for slug, city_rows in by_city.items():
        city_dir = OUTPUT_DIR / slug
        ensure_dir(city_dir)

        evolution = []
        for row in city_rows:
            evolution.append({
                "year": row["annee"],
                "recettes_totales": _float(row.get("recettes_totales")),
                "depenses_totales": _float(row.get("depenses_totales")),
                "solde": _float(row.get("solde")),
                "epargne_brute": _float(row.get("epargne_brute")),
                "section": {
                    "Fonctionnement": {
                        "recettes": _float(row.get("recettes_fonctionnement")),
                        "depenses": _float(row.get("depenses_fonctionnement")),
                    },
                    "Investissement": {
                        "recettes": _float(row.get("recettes_investissement")),
                        "depenses": _float(row.get("depenses_investissement")),
                    },
                },
                "par_categorie": {
                    "personnel": _float(row.get("depenses_personnel")),
                    "fonctionnement_courant": _float(row.get("depenses_fonctionnement_courant")),
                    "transferts": _float(row.get("depenses_transferts")),
                    "charges_financieres": _float(row.get("depenses_financieres")),
                    "investissements": _float(row.get("depenses_investissements_directs")),
                },
            })

        save_json(evolution, city_dir / "evolution.json")
        print(f"    {slug}: {len(evolution)} years")


# =============================================================================
# Export: Marchés Publics
# =============================================================================

def export_marches(client: bigquery.Client):
    """Export public contracts per city per year."""
    print("\n  MARCHÉS PUBLICS")

    # Aggregated data
    query_agg = f"""
    SELECT *
    FROM `{PROJECT_ID}.{NATIONAL_MARTS}.mart_marches_national`
    ORDER BY commune_slug, annee, montant_total DESC
    """
    agg_rows = query_bq(client, query_agg)

    # Detail data (top contracts per city per year)
    query_detail = f"""
    SELECT *
    FROM `{PROJECT_ID}.{NATIONAL_CORE}.core_marches_national`
    ORDER BY commune_slug, annee, montant DESC
    """
    detail_rows = query_bq(client, query_detail)

    if not agg_rows:
        print("    No data found")
        return

    # Group aggregated by city/year
    agg_by_city_year = defaultdict(lambda: defaultdict(list))
    for row in agg_rows:
        agg_by_city_year[row["commune_slug"]][row["annee"]].append(row)

    # Group detail by city/year
    detail_by_city_year = defaultdict(lambda: defaultdict(list))
    for row in detail_rows:
        detail_by_city_year[row["commune_slug"]][row["annee"]].append(row)

    for slug, years_data in agg_by_city_year.items():
        city_dir = OUTPUT_DIR / slug
        ensure_dir(city_dir)

        available_years = sorted(years_data.keys(), reverse=True)

        for year, year_rows in years_data.items():
            categories = []
            for row in year_rows:
                categories.append({
                    "categorie": row["categorie_cpv"],
                    "nb_marches": row["nb_marches"],
                    "montant_total": _float(row["montant_total"]),
                    "montant_moyen": _float(row["montant_moyen"]),
                })

            # Top 100 contracts for detail
            details = detail_by_city_year.get(slug, {}).get(year, [])[:100]
            top_marches = []
            for d in details:
                top_marches.append({
                    "objet": d.get("objet", ""),
                    "montant": _float(d.get("montant")),
                    "categorie": d.get("categorie_cpv", ""),
                    "titulaire": d.get("titulaire_nom", ""),
                    "date": d.get("date_notification", ""),
                    "procedure": d.get("type_procedure", ""),
                })

            marches_data = {
                "annee": year,
                "city_slug": slug,
                "total_montant": sum(c["montant_total"] or 0 for c in categories),
                "total_marches": sum(c["nb_marches"] for c in categories),
                "categories": categories,
                "top_marches": top_marches,
            }

            save_json(marches_data, city_dir / f"marches_{year}.json")

        save_json({"availableYears": available_years}, city_dir / "marches_index.json")
        print(f"    {slug}: {len(available_years)} years")


# =============================================================================
# Export: Subventions
# =============================================================================

def export_subventions(client: bigquery.Client):
    """Export subsidies per city per year."""
    print("\n  SUBVENTIONS")

    query_agg = f"""
    SELECT *
    FROM `{PROJECT_ID}.{NATIONAL_MARTS}.mart_subventions_national`
    ORDER BY commune_slug, annee
    """
    agg_rows = query_bq(client, query_agg)

    query_detail = f"""
    SELECT *
    FROM `{PROJECT_ID}.{NATIONAL_CORE}.core_subventions_national`
    ORDER BY commune_slug, annee, montant DESC
    """
    detail_rows = query_bq(client, query_detail)

    if not agg_rows:
        print("    No subventions data found")
        return

    detail_by_city_year = defaultdict(lambda: defaultdict(list))
    for row in detail_rows:
        detail_by_city_year[row["commune_slug"]][row["annee"]].append(row)

    agg_by_city = defaultdict(list)
    for row in agg_rows:
        agg_by_city[row["commune_slug"]].append(row)

    for slug, city_rows in agg_by_city.items():
        city_dir = OUTPUT_DIR / slug
        ensure_dir(city_dir)

        available_years = sorted(set(r["annee"] for r in city_rows), reverse=True)

        for row in city_rows:
            year = row["annee"]
            details = detail_by_city_year.get(slug, {}).get(year, [])[:200]

            beneficiaires = []
            for d in details:
                beneficiaires.append({
                    "beneficiaire": d.get("nom_beneficiaire", ""),
                    "objet": d.get("objet", ""),
                    "montant": _float(d.get("montant")),
                    "nature": d.get("nature_subvention", ""),
                    "date": d.get("date_convention", ""),
                })

            subv_data = {
                "annee": year,
                "city_slug": slug,
                "total_montant": _float(row.get("montant_total")),
                "nb_subventions": row.get("nb_subventions"),
                "nb_beneficiaires": row.get("nb_beneficiaires_uniques"),
                "beneficiaires": beneficiaires,
            }

            save_json(subv_data, city_dir / f"subventions_{year}.json")

        save_json({"availableYears": available_years}, city_dir / "subventions_index.json")
        print(f"    {slug}: {len(available_years)} years")


# =============================================================================
# Export: Bilan / Patrimoine
# =============================================================================

def export_bilan(client: bigquery.Client):
    """Export patrimoine/bilan data per city per year."""
    print("\n  BILAN / PATRIMOINE")

    query = f"""
    SELECT *
    FROM `{PROJECT_ID}.{NATIONAL_MARTS}.mart_bilan_national`
    ORDER BY commune_slug, annee
    """
    rows = query_bq(client, query)

    if not rows:
        print("    No data found")
        return

    by_city = defaultdict(list)
    for row in rows:
        by_city[row["commune_slug"]].append(row)

    for slug, city_rows in by_city.items():
        city_dir = OUTPUT_DIR / slug
        ensure_dir(city_dir)

        available_years = sorted(set(r["annee"] for r in city_rows), reverse=True)

        for row in city_rows:
            year = row["annee"]

            bilan_data = {
                "year": year,
                "city_slug": slug,
                "totals": {
                    "actif_total": _float(row.get("actif_total")),
                    "passif_total": _float(row.get("passif_total")),
                    "dette_financiere": _float(row.get("dette_financiere")),
                    "fonds_propres": _float(row.get("fonds_propres")),
                    "tresorerie": _float(row.get("tresorerie")),
                    "immobilisations": _float(row.get("immobilisations")),
                },
                "kpis": {
                    "ratio_endettement": _float(row.get("ratio_endettement")),
                    "pct_fonds_propres": _float(row.get("pct_fonds_propres")),
                    "dette_par_hab": _float(row.get("dette_par_hab")),
                },
            }

            save_json(bilan_data, city_dir / f"bilan_{year}.json")

        save_json({"availableYears": available_years}, city_dir / "bilan_index.json")
        print(f"    {slug}: {len(available_years)} years")


# =============================================================================
# Export: Cities Index
# =============================================================================

def export_cities_index(client: bigquery.Client):
    """Export the master cities index with available datasets."""
    print("\n  CITIES INDEX")

    # Get available years from sankey mart
    query = f"""
    SELECT DISTINCT commune_slug, commune_nom, population, annee
    FROM `{PROJECT_ID}.{NATIONAL_MARTS}.mart_sankey_national`
    ORDER BY commune_slug, annee DESC
    """
    rows = query_bq(client, query)

    cities = {}
    for row in rows:
        slug = row["commune_slug"]
        if slug not in cities:
            cities[slug] = {
                "slug": slug,
                "name": row["commune_nom"],
                "population": row["population"],
                "available_years": [],
                "datasets": ["budget", "patrimoine", "marches", "subventions"],
            }
        cities[slug]["available_years"].append(row["annee"])

    all_years = set()
    for c in cities.values():
        all_years.update(c["available_years"])

    index = {
        "cities": list(cities.values()),
        "latest_year": max(all_years) if all_years else None,
        "available_years": sorted(all_years, reverse=True),
    }

    ensure_dir(OUTPUT_DIR)
    save_json(index, OUTPUT_DIR / "cities.json")
    print(f"    {len(cities)} cities indexed")


# =============================================================================
# Main
# =============================================================================

def main():
    print("\n" + "=" * 60)
    print("  EXPORT DONNÉES NATIONALES → JSON")
    print("=" * 60)

    ensure_dir(OUTPUT_DIR)
    client = bigquery.Client(project=PROJECT_ID)

    export_cities_index(client)
    export_budget_sankey(client)
    export_benchmarking(client)
    export_evolution(client)
    export_bilan(client)
    export_marches(client)
    export_subventions(client)

    print(f"\n  Export terminé → {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
