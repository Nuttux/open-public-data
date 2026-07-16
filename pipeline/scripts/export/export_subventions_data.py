#!/usr/bin/env python3
"""
Script d'export des données subventions depuis BigQuery vers JSON.

Exporte les données depuis les marts dbt pour le website:
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
import os
from pathlib import Path
from datetime import datetime
from google.cloud import bigquery

# Configuration
PROJECT_ID = "open-data-france-484717"
# Dataset des marts. Par défaut prod ; override possible via env DBT_MARTS_DATASET
# ou flag --dataset pour exporter depuis un schema dev/ci (ex. validation locale
# d'un changement de pipeline avant que prod soit reconstruit).
DATASET = os.environ.get("DBT_MARTS_DATASET", "dbt_paris_marts")
OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data" / "subventions"


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


def fetch_beneficiaires_data(client: bigquery.Client, year: int = None, limit: int | None = None) -> list:
    """
    Récupère les bénéficiaires depuis mart_subventions_beneficiaires.

    Args:
        client: Client BigQuery
        year: Année spécifique (optionnel)
        limit: Nombre max de bénéficiaires par année (None = tous, défaut).
               Un cap top-N est une optimisation historique — on exporte
               désormais l'intégralité du mart pour que l'UI long-tail voie
               les petits bénéficiaires (cf. fetch_subventions_opendata.py).

    Returns:
        Liste des bénéficiaires avec filtres et montants
    """
    year_filter = f"WHERE annee = {year}" if year else ""
    limit_clause = f"LIMIT {limit * 10 if not year else limit}" if limit else ""

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
    {limit_clause}
    """

    results = []
    for row in client.query(query).result():
        nature = row.nature_juridique
        nature = NATURE_JURIDIQUE_NORMALIZE.get(nature, nature)
        results.append({
            "annee": row.annee,
            "beneficiaire": row.beneficiaire,
            "beneficiaire_normalise": row.beneficiaire_normalise,
            "nature_juridique": nature,
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


MIN_YEAR_EXPORTED = 2018  # Frontend / UI scope starts at 2018 (Loi NOTRe + M57)


def get_available_years(client: bigquery.Client) -> list:
    """Récupère les années disponibles dans les données (bornées à MIN_YEAR_EXPORTED)."""
    query = f"""
    SELECT DISTINCT annee
    FROM `{PROJECT_ID}.{DATASET}.mart_subventions_treemap`
    WHERE annee >= {MIN_YEAR_EXPORTED}
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
    
    # Natures juridiques (normalized and deduplicated)
    natures_set = set()
    query = f"""
    SELECT DISTINCT nature_juridique
    FROM `{PROJECT_ID}.{DATASET}.mart_subventions_beneficiaires`
    WHERE nature_juridique IS NOT NULL
    ORDER BY nature_juridique
    """
    for row in client.query(query).result():
        natures_set.add(NATURE_JURIDIQUE_NORMALIZE.get(row.nature_juridique, row.nature_juridique))
    natures = sorted(natures_set)
    
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
        "availableYears": years,
        "totalsByYear": totals_by_year,
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


def export_beneficiaires_year(client: bigquery.Client, year: int, limit: int | None = None):
    """Exporte les bénéficiaires pour une année (tous par défaut)."""
    print(f"  Bénéficiaires {year}...")

    data = fetch_beneficiaires_data(client, year, limit)

    # Filtrer pour cette année uniquement
    data = [d for d in data if d["annee"] == year]
    if limit:
        data = data[:limit]
    
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


# Normalize inconsistent nature_juridique values from source data.
# The source has both "Etablissements de droit public" and "Etablissements publics"
# which refer to the same category. We normalize at export time so the website
# doesn't need to maintain duplicate mappings.
NATURE_JURIDIQUE_NORMALIZE = {
    'Etablissements de droit public': 'Etablissements publics',
}

NATURE_TO_TYPE = {
    'Associations': 'Associations',
    'Etablissements publics': 'Établissements publics',
    'Autres personnes de droit public': 'Établissements publics',
    'Etat': 'Établissements publics',
    'Communes': 'Établissements publics',
    'Département': 'Établissements publics',
    'Régions': 'Établissements publics',
    'Entreprises': 'Entreprises',
    'Autres personnes de droit privé': 'Autres privés',
    'Personnes physiques': 'Personnes physiques',
    'Autres': 'Autres',
}


def export_beneficiaires_search(years: list):
    """Fichier slim agrégé pour la recherche long tail côté client.

    Post-traite les `beneficiaires_{year}.json` déjà écrits pour produire
    un seul fichier dédupliqué par `beneficiaire_normalise` (fallback nom),
    avec montants par année → évite de ré-interroger BigQuery. Chaque ligne
    pèse quelques centaines d'octets : charge client raisonnable même à 10k
    bénéficiaires uniques.
    """
    print("  Index recherche slim (long tail)...")

    merged: dict[str, dict] = {}
    years_seen: set[int] = set()

    for year in sorted(years):
        path = OUTPUT_DIR / f"beneficiaires_{year}.json"
        if not path.exists():
            continue
        with path.open(encoding="utf-8") as f:
            payload = json.load(f)
        years_seen.add(year)

        for row in payload.get("data", []):
            # Personnes physiques (label source Ville de Paris) : hors index de
            # recherche — la page cible les associations/organismes ; sinon
            # ~8k noms de famille par exercice (aides individuelles) polluent
            # la long tail (ex. « gay » remontait GAYE, GAYET, GAYOUT).
            if (row.get("nature_juridique") or "").strip() == "Personnes physiques":
                continue
            name = (row.get("beneficiaire") or "").strip()
            if not name:
                continue
            # Dédup par normalise en priorité, sinon par nom brut
            key = (row.get("beneficiaire_normalise") or name).strip().lower() or name
            cur = merged.get(key)
            if cur is None:
                cur = {
                    "name": name,
                    "norm": key,
                    "siret": row.get("siret") or None,
                    "theme": row.get("thematique") or None,
                    "totalAmount": 0.0,
                    "lastActiveYear": year,
                    "nb": 0,
                    "byYear": {},
                }
                merged[key] = cur
            amount = float(row.get("montant_total") or 0)
            cur["byYear"][str(year)] = cur["byYear"].get(str(year), 0.0) + amount
            cur["totalAmount"] += amount
            cur["nb"] += int(row.get("nb_subventions") or 0)
            if amount > 0 and year > cur["lastActiveYear"]:
                cur["lastActiveYear"] = year
            # Garde le thème le plus récent non null rencontré
            if not cur["theme"] and row.get("thematique"):
                cur["theme"] = row["thematique"]
            # SIRET : premier rencontré, on ne réécrit pas
            if not cur["siret"] and row.get("siret"):
                cur["siret"] = row["siret"]

    data = sorted(merged.values(), key=lambda r: -r["totalAmount"])

    output = {
        "generated_at": datetime.now().isoformat(),
        "source": "post-processing beneficiaires_{year}.json",
        "excludes": "nature_juridique = 'Personnes physiques' (label source)",
        "years": sorted(years_seen),
        "count": len(data),
        "data": data,
    }
    output_file = OUTPUT_DIR / "beneficiaires_search.json"
    with output_file.open("w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = output_file.stat().st_size / 1024
    print(f"    → {output_file.name} ({len(data)} bénéficiaires uniques, {size_kb:.0f} Ko)")


def export_tendances(client: bigquery.Client, years: list, limit: int | None = None):
    """
    Exporte les données de tendances multi-dimensions.

    Génère subventions_tendances.json avec agrégation par :
    - Thématique
    - Direction
    - Type d'organisme (nature juridique simplifiée)
    """
    print("  Tendances multi-dimensions...")

    years_data = []
    for year in sorted(years):
        data = fetch_beneficiaires_data(client, year, limit)
        data = [d for d in data if d["annee"] == year]
        if limit:
            data = data[:limit]

        total_montant = sum(d["montant_total"] for d in data)
        nb_subventions = sum(d.get("nb_subventions", 1) for d in data)

        # Agrégation par thématique
        by_thematique = {}
        for b in data:
            key = b.get("thematique") or "Non classifié"
            if key not in by_thematique:
                by_thematique[key] = {"label": key, "montant": 0, "count": 0}
            by_thematique[key]["montant"] += b["montant_total"]
            by_thematique[key]["count"] += 1

        # Agrégation par direction
        by_direction = {}
        for b in data:
            key = b.get("direction") or "Non renseignée"
            if key not in by_direction:
                by_direction[key] = {"label": key, "montant": 0, "count": 0}
            by_direction[key]["montant"] += b["montant_total"]
            by_direction[key]["count"] += 1

        # Agrégation par type d'organisme
        by_type = {}
        for b in data:
            key = NATURE_TO_TYPE.get(b.get("nature_juridique", ""), "Autres")
            if key not in by_type:
                by_type[key] = {"label": key, "montant": 0, "count": 0}
            by_type[key]["montant"] += b["montant_total"]
            by_type[key]["count"] += 1

        years_data.append({
            "year": year,
            "total_montant": total_montant,
            "nb_subventions": nb_subventions,
            "nb_beneficiaires": len(data),
            "par_thematique": sorted(by_thematique.values(), key=lambda x: -x["montant"]),
            "par_direction": sorted(by_direction.values(), key=lambda x: -x["montant"]),
            "par_type_organisme": sorted(by_type.values(), key=lambda x: -x["montant"]),
        })

    output = {
        "generated_at": datetime.now().isoformat(),
        "source": "dbt marts (mart_subventions_beneficiaires)",
        "note_perimetre": (
            f"Top {limit} bénéficiaires par année (long tail inclus)."
            if limit
            else "Tous les bénéficiaires (long tail complet, aucun cap)."
        ),
        "years": years_data,
    }

    output_file = OUTPUT_DIR / "subventions_tendances.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"    → {output_file.name} ({len(years_data)} années)")


def main():
    """Point d'entrée principal."""
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from utils.logger import Logger

    global DATASET

    parser = argparse.ArgumentParser(description="Export données subventions depuis dbt")
    parser.add_argument('--year', type=int, help="Année spécifique (sinon toutes)")
    parser.add_argument('--limit', type=int, default=None,
                       help="Cap top-N par année (défaut: aucun, tous les bénéficiaires)")
    parser.add_argument('--dataset', type=str, default=None,
                       help=f"Dataset BQ des marts (défaut: {DATASET}). "
                            f"Override via env DBT_MARTS_DATASET aussi.")
    args = parser.parse_args()

    if args.dataset:
        DATASET = args.dataset
    
    log = Logger("export_subventions")
    log.header("Export Subventions → JSON")
    
    # Créer le dossier de sortie
    log.info("Dossier de sortie", extra=str(OUTPUT_DIR))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Client BigQuery
    log.section("Connexion BigQuery")
    client = bigquery.Client(project=PROJECT_ID)
    log.success("Connecté", extra=PROJECT_ID)
    
    # Index
    log.section("Génération de l'index")
    index = export_index(client)
    years = [args.year] if args.year else index["availableYears"]
    log.success("Index créé", extra=f"{len(years)} années disponibles")
    
    # Export par année
    log.section(f"Export des données ({len(years)} années)")
    for i, year in enumerate(years, 1):
        log.progress(i, len(years), f"Année {year}")
        export_treemap_year(client, year)
        export_beneficiaires_year(client, year, args.limit)
        log.success(f"Année {year}", extra=f"treemap + {args.limit or 'tous'} bénéficiaires")

    # Tendances multi-dimensions
    log.section("Export des tendances")
    export_tendances(client, years, args.limit)
    log.success("Tendances", extra="thématique + direction + type organisme")

    # Index recherche slim (post-traitement des fichiers déjà écrits)
    log.section("Index recherche long tail")
    export_beneficiaires_search(years)
    log.success("Recherche", extra="beneficiaires_search.json")

    log.summary()


if __name__ == "__main__":
    main()
