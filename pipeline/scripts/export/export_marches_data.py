#!/usr/bin/env python3
"""
Script d'export des données marchés publics depuis BigQuery vers JSON.

Exporte les données depuis les marts dbt pour le website:
- marches-publics/index.json : Index des années disponibles et métadonnées filtres
- marches-publics/marches_{year}.json : Liste des marchés pour une année
- marches-publics/marches_tendances.json : Données tendances multi-dimensions

⚠️ Les montants sont des ENVELOPPES PLURIANNUELLES (plafonds contractuels),
   pas des dépenses annuelles. Le wording dans les JSON reflète cela.

Usage:
    python scripts/export_marches_data.py [--year 2024]

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
OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data" / "marches-publics"

# Top N catégories à garder (le reste → "Autres")
TOP_CATEGORIES = 12


def fetch_marches(client: bigquery.Client, year: int) -> list:
    """Récupère les marchés depuis mart_marches_fournisseurs pour une année."""
    query = f"""
    SELECT *
    FROM `{PROJECT_ID}.{DATASET}.mart_marches_fournisseurs`
    WHERE annee = {year}
    ORDER BY montant_max DESC
    """
    results = []
    for row in client.query(query).result():
        results.append({
            "numero_marche": row.numero_marche,
            "objet": row.objet,
            "nature": row.nature,
            "fournisseur_nom": row.fournisseur_nom,
            "fournisseur_siret": row.fournisseur_siret,
            "montant_min": float(row.montant_min) if row.montant_min else 0,
            "montant_max": float(row.montant_max) if row.montant_max else 0,
            "date_notification": str(row.date_notification) if row.date_notification else None,
            "duree_jours": row.duree_jours,
            "categorie_libelle": row.categorie_libelle,
            "perimetre_financier": row.perimetre_financier,
            "is_multiattributaire": row.is_multiattributaire,
        })
    return results


def get_available_years(client: bigquery.Client) -> list:
    """Récupère les années disponibles."""
    query = f"""
    SELECT DISTINCT annee
    FROM `{PROJECT_ID}.{DATASET}.mart_marches_par_nature`
    ORDER BY annee DESC
    """
    return [row.annee for row in client.query(query).result()]


def get_filter_options(client: bigquery.Client) -> dict:
    """Récupère les options de filtrage disponibles."""
    # Natures
    natures = []
    query = f"""
    SELECT DISTINCT nature
    FROM `{PROJECT_ID}.{DATASET}.mart_marches_fournisseurs`
    WHERE nature IS NOT NULL
    ORDER BY nature
    """
    for row in client.query(query).result():
        natures.append(row.nature)

    # Top catégories
    categories = []
    query = f"""
    SELECT DISTINCT categorie_libelle, COUNT(*) as cnt
    FROM `{PROJECT_ID}.{DATASET}.mart_marches_fournisseurs`
    WHERE categorie_libelle IS NOT NULL
    GROUP BY categorie_libelle
    ORDER BY cnt DESC
    LIMIT 30
    """
    for row in client.query(query).result():
        categories.append(row.categorie_libelle)

    # Périmètres
    perimetres = []
    query = f"""
    SELECT DISTINCT perimetre_financier, COUNT(*) as cnt
    FROM `{PROJECT_ID}.{DATASET}.mart_marches_fournisseurs`
    WHERE perimetre_financier IS NOT NULL
    GROUP BY perimetre_financier
    ORDER BY cnt DESC
    """
    for row in client.query(query).result():
        perimetres.append(row.perimetre_financier)

    return {
        "natures": natures,
        "categories": categories,
        "perimetres": perimetres,
    }


def export_index(client: bigquery.Client):
    """Exporte l'index des données marchés publics."""
    print("  Génération de l'index...")

    years = get_available_years(client)
    filters = get_filter_options(client)

    # Totaux par année
    totals_by_year = {}
    query = f"""
    SELECT annee, SUM(nb_marches) as nb, SUM(enveloppe_max_totale) as total
    FROM `{PROJECT_ID}.{DATASET}.mart_marches_par_nature`
    GROUP BY annee
    ORDER BY annee DESC
    """
    for row in client.query(query).result():
        totals_by_year[row.annee] = {
            "nb_marches": row.nb,
            "enveloppe_max_totale": float(row.total),
        }

    index = {
        "generated_at": datetime.now().isoformat(),
        "source": "dbt marts (mart_marches_par_nature, mart_marches_fournisseurs)",
        "note": "Les montants sont des enveloppes pluriannuelles (plafonds contractuels), pas des dépenses annuelles.",
        "available_years": years,
        "totals_by_year": totals_by_year,
        "filters": filters,
    }

    output_file = OUTPUT_DIR / "index.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"    → {output_file.name}")
    return index


def export_marches_year(client: bigquery.Client, year: int):
    """Exporte les marchés pour une année."""
    print(f"  Marchés {year}...")

    data = fetch_marches(client, year)
    total = sum(d["montant_max"] for d in data)

    output = {
        "year": year,
        "generated_at": datetime.now().isoformat(),
        "enveloppe_max_totale": total,
        "nb_marches": len(data),
        "note": "montant_max = enveloppe pluriannuelle (plafond contractuel), pas une dépense annuelle.",
        "data": data,
    }

    output_file = OUTPUT_DIR / f"marches_{year}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"    → {output_file.name} ({len(data)} marchés, {total/1e6:.0f}M€ enveloppe)")


def export_tendances(client: bigquery.Client, years: list):
    """Exporte les données de tendances multi-dimensions."""
    print("  Tendances multi-dimensions...")

    years_data = []
    for year in sorted(years):
        data = fetch_marches(client, year)

        enveloppe_totale = sum(d["montant_max"] for d in data)
        nb_marches = len(data)

        # Agrégation par nature
        by_nature = {}
        for m in data:
            key = m.get("nature") or "Non renseigné"
            if key not in by_nature:
                by_nature[key] = {"label": key, "montant": 0, "count": 0}
            by_nature[key]["montant"] += m["montant_max"]
            by_nature[key]["count"] += 1

        # Agrégation par catégorie (top N + Autres)
        by_cat_raw = {}
        for m in data:
            key = m.get("categorie_libelle") or "Non renseigné"
            if key not in by_cat_raw:
                by_cat_raw[key] = {"label": key, "montant": 0, "count": 0}
            by_cat_raw[key]["montant"] += m["montant_max"]
            by_cat_raw[key]["count"] += 1

        sorted_cats = sorted(by_cat_raw.values(), key=lambda x: -x["montant"])
        by_categorie = sorted_cats[:TOP_CATEGORIES]
        if len(sorted_cats) > TOP_CATEGORIES:
            autres = {"label": "Autres", "montant": 0, "count": 0}
            for c in sorted_cats[TOP_CATEGORIES:]:
                autres["montant"] += c["montant"]
                autres["count"] += c["count"]
            by_categorie.append(autres)

        # Agrégation par périmètre financier
        by_perimetre = {}
        for m in data:
            key = m.get("perimetre_financier") or "Non renseigné"
            if key not in by_perimetre:
                by_perimetre[key] = {"label": key, "montant": 0, "count": 0}
            by_perimetre[key]["montant"] += m["montant_max"]
            by_perimetre[key]["count"] += 1

        years_data.append({
            "year": year,
            "enveloppe_totale": enveloppe_totale,
            "nb_marches": nb_marches,
            "par_nature": sorted(by_nature.values(), key=lambda x: -x["montant"]),
            "par_categorie": by_categorie,
            "par_perimetre": sorted(by_perimetre.values(), key=lambda x: -x["montant"]),
        })

    output = {
        "generated_at": datetime.now().isoformat(),
        "source": "dbt marts (mart_marches_fournisseurs)",
        "note": "Les montants sont des enveloppes pluriannuelles (plafonds contractuels).",
        "years": years_data,
    }

    output_file = OUTPUT_DIR / "marches_tendances.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"    → {output_file.name} ({len(years_data)} années)")


def main():
    """Point d'entrée principal."""
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from utils.logger import Logger

    parser = argparse.ArgumentParser(description="Export données marchés publics depuis dbt")
    parser.add_argument('--year', type=int, help="Année spécifique (sinon toutes)")
    args = parser.parse_args()

    log = Logger("export_marches")
    log.header("Export Marchés Publics → JSON")

    log.info("Dossier de sortie", extra=str(OUTPUT_DIR))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    log.section("Connexion BigQuery")
    client = bigquery.Client(project=PROJECT_ID)
    log.success("Connecté", extra=PROJECT_ID)

    log.section("Génération de l'index")
    index = export_index(client)
    years = [args.year] if args.year else index["available_years"]
    log.success("Index créé", extra=f"{len(years)} années disponibles")

    log.section(f"Export des données ({len(years)} années)")
    for i, year in enumerate(years, 1):
        log.progress(i, len(years), f"Année {year}")
        export_marches_year(client, year)
        log.success(f"Année {year}")

    log.section("Export des tendances")
    export_tendances(client, years)
    log.success("Tendances", extra="nature + catégorie + périmètre")

    log.summary()


if __name__ == "__main__":
    main()
