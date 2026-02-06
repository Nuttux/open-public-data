#!/usr/bin/env python3
"""
Script d'export des données du bilan comptable depuis BigQuery vers JSON.

Exporte les données depuis core_bilan_comptable pour le composant BilanSankey:
- bilan_sankey_{year}.json : Données pour visualisation Sankey Actif ↔ Passif
- bilan_index.json : Index des années disponibles et métadonnées

Structure Sankey:
  Actif (gauche) → Patrimoine Paris (centre) ← Passif (droite)

Usage:
    python scripts/export/export_bilan_data.py [--year 2024]

Prérequis:
    - Google Cloud credentials configurées
    - Tables dbt existantes (dbt run --select core_bilan_comptable)
"""

import json
import argparse
import sys
from pathlib import Path
from datetime import datetime
from collections import defaultdict
from google.cloud import bigquery

# Ajouter le chemin pour les utils
sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger

# Configuration
PROJECT_ID = "open-data-france-484717"
DATASET = "dbt_paris_analytics"
OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data"


def fetch_bilan_data(client: bigquery.Client, year: int = None) -> list:
    """
    Récupère les données du bilan comptable depuis core_bilan_comptable.
    
    Args:
        client: Client BigQuery
        year: Année spécifique (optionnel, sinon toutes les années)
    
    Returns:
        Liste des enregistrements avec type_bilan, poste, detail et montants
    """
    year_filter = f"WHERE annee = {year}" if year else ""
    
    query = f"""
    SELECT
        annee,
        type_bilan,
        poste,
        detail,
        montant_brut,
        montant_amortissements,
        montant_net,
        categorie_analytique
    FROM `{PROJECT_ID}.{DATASET}.core_bilan_comptable`
    {year_filter}
    ORDER BY annee DESC, type_bilan, poste, montant_net DESC
    """
    
    results = []
    for row in client.query(query).result():
        results.append({
            "annee": row.annee,
            "type_bilan": row.type_bilan,
            "poste": row.poste,
            "detail": row.detail,
            "montant_brut": float(row.montant_brut) if row.montant_brut else 0,
            "montant_amortissements": float(row.montant_amortissements) if row.montant_amortissements else 0,
            "montant_net": float(row.montant_net) if row.montant_net else 0,
            "categorie_analytique": row.categorie_analytique,
        })
    
    return results


def get_available_years(client: bigquery.Client) -> list:
    """Récupère les années disponibles dans les données."""
    query = f"""
    SELECT DISTINCT annee
    FROM `{PROJECT_ID}.{DATASET}.core_bilan_comptable`
    ORDER BY annee DESC
    """
    return [row.annee for row in client.query(query).result()]


def build_sankey_data(data: list, year: int) -> dict:
    """
    Transforme les données brutes en structure optimisée pour le Sankey.
    
    Structure:
      - Actif (gauche) → Patrimoine Paris (centre) ← Passif (droite)
    
    Args:
        data: Données brutes de BigQuery
        year: Année à traiter
    
    Returns:
        Structure prête pour le composant BilanSankey
    """
    # Filtrer pour l'année
    year_data = [d for d in data if d["annee"] == year]
    
    # Agrégation par poste
    postes_actif = defaultdict(lambda: {"net": 0, "brut": 0, "amort": 0, "details": []})
    postes_passif = defaultdict(lambda: {"net": 0, "brut": 0, "amort": 0, "details": []})
    
    for d in year_data:
        poste = d["poste"]
        if d["type_bilan"] == "Actif":
            postes_actif[poste]["net"] += d["montant_net"]
            postes_actif[poste]["brut"] += d["montant_brut"]
            postes_actif[poste]["amort"] += d["montant_amortissements"]
            if d["detail"] and d["montant_net"] > 0:
                postes_actif[poste]["details"].append({
                    "name": d["detail"],
                    "value": d["montant_net"],
                    "brut": d["montant_brut"],
                    "amort": d["montant_amortissements"],
                })
        else:
            postes_passif[poste]["net"] += d["montant_net"]
            postes_passif[poste]["brut"] += d["montant_brut"]
            postes_passif[poste]["amort"] += d["montant_amortissements"]
            if d["detail"] and d["montant_net"] > 0:
                postes_passif[poste]["details"].append({
                    "name": d["detail"],
                    "value": d["montant_net"],
                    "brut": d["montant_brut"],
                    "amort": d["montant_amortissements"],
                })
    
    # Totaux
    total_actif = sum(p["net"] for p in postes_actif.values())
    total_passif = sum(p["net"] for p in postes_passif.values())
    
    # Extraire les composantes clés du passif pour les KPIs
    fonds_propres = postes_passif.get("Fonds propres", {}).get("net", 0)
    dettes_financieres = postes_passif.get("Dettes financières", {}).get("net", 0)
    dettes_non_financieres = postes_passif.get("Dettes non financières", {}).get("net", 0)
    provisions = postes_passif.get("Provisions pour risques et charges", {}).get("net", 0)
    dette_totale = dettes_financieres + dettes_non_financieres
    
    # Identifier les postes dupliqués entre Actif et Passif
    postes_communs = set(postes_actif.keys()) & set(postes_passif.keys())
    
    # Helper pour générer un nom de noeud unique
    def get_node_name(poste: str, category: str) -> str:
        if poste in postes_communs:
            return f"{poste} ({category.capitalize()})"
        return poste
    
    # Construction des nodes
    nodes = []
    
    # Postes Actif (gauche)
    for poste in sorted(postes_actif.keys()):
        if postes_actif[poste]["net"] > 0:
            nodes.append({
                "name": get_node_name(poste, "actif"),
                "category": "actif",
            })
    
    # Noeud central
    nodes.append({
        "name": "Patrimoine Paris",
        "category": "central",
    })
    
    # Postes Passif (droite)
    for poste in sorted(postes_passif.keys()):
        if postes_passif[poste]["net"] > 0:
            nodes.append({
                "name": get_node_name(poste, "passif"),
                "category": "passif",
            })
    
    # Construction des links
    links = []
    
    # Actif → Patrimoine Paris
    for poste, values in postes_actif.items():
        if values["net"] > 0:
            links.append({
                "source": get_node_name(poste, "actif"),
                "target": "Patrimoine Paris",
                "value": values["net"],
            })
    
    # Patrimoine Paris → Passif
    for poste, values in postes_passif.items():
        if values["net"] > 0:
            links.append({
                "source": "Patrimoine Paris",
                "target": get_node_name(poste, "passif"),
                "value": values["net"],
            })
    
    # Construction du drill-down (utilise les noms de noeuds uniques comme clés)
    drilldown = {
        "actif": {},
        "passif": {},
    }
    
    for poste, values in postes_actif.items():
        if values["details"]:
            # Trier par montant décroissant
            sorted_details = sorted(values["details"], key=lambda x: -x["value"])
            drilldown["actif"][get_node_name(poste, "actif")] = sorted_details[:20]  # Top 20
    
    for poste, values in postes_passif.items():
        if values["details"]:
            sorted_details = sorted(values["details"], key=lambda x: -x["value"])
            drilldown["passif"][get_node_name(poste, "passif")] = sorted_details[:20]
    
    # Calcul des KPIs
    ratio_endettement = dette_totale / fonds_propres if fonds_propres > 0 else None
    pct_fonds_propres = (fonds_propres / total_passif * 100) if total_passif > 0 else 0
    pct_dette_financiere = (dettes_financieres / total_passif * 100) if total_passif > 0 else 0
    
    return {
        "year": year,
        "generated_at": datetime.now().isoformat(),
        "totals": {
            "actif_net": total_actif,
            "passif_net": total_passif,
            "ecart_equilibre": abs(total_actif - total_passif),
            "fonds_propres": fonds_propres,
            "dette_totale": dette_totale,
            "dettes_financieres": dettes_financieres,
            "dettes_non_financieres": dettes_non_financieres,
            "provisions": provisions,
        },
        "kpis": {
            "ratio_endettement": round(ratio_endettement, 3) if ratio_endettement else None,
            "pct_fonds_propres": round(pct_fonds_propres, 1),
            "pct_dette_financiere": round(pct_dette_financiere, 1),
        },
        "nodes": nodes,
        "links": links,
        "drilldown": drilldown,
    }


def export_index(years: list, all_data: list) -> dict:
    """Exporte l'index des données du bilan."""
    
    # Calculer les totaux par année
    totals_by_year = {}
    for year in years:
        year_data = [d for d in all_data if d["annee"] == year]
        total_actif = sum(d["montant_net"] for d in year_data if d["type_bilan"] == "Actif")
        total_passif = sum(d["montant_net"] for d in year_data if d["type_bilan"] == "Passif")
        totals_by_year[year] = {
            "actif_net": total_actif,
            "passif_net": total_passif,
        }
    
    index = {
        "generated_at": datetime.now().isoformat(),
        "source": "dbt core (core_bilan_comptable)",
        "description": "Bilan comptable de la Ville de Paris - État patrimonial Actif/Passif",
        "availableYears": years,
        "latestYear": years[0] if years else None,
        "totals_by_year": totals_by_year,
    }
    
    output_file = OUTPUT_DIR / "bilan_index.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    
    return index


def export_year(all_data: list, year: int, log: Logger):
    """Exporte les données Sankey pour une année spécifique."""
    
    output = build_sankey_data(all_data, year)
    
    output_file = OUTPUT_DIR / f"bilan_sankey_{year}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    actif_mds = output["totals"]["actif_net"] / 1e9
    passif_mds = output["totals"]["passif_net"] / 1e9
    log.success(f"Année {year}", extra=f"Actif {actif_mds:.1f} Md€ | Passif {passif_mds:.1f} Md€")


def main():
    """Point d'entrée principal."""
    parser = argparse.ArgumentParser(description="Export données bilan comptable depuis dbt")
    parser.add_argument('--year', type=int, help="Année spécifique (sinon toutes)")
    args = parser.parse_args()
    
    log = Logger("export_bilan")
    log.header("Export Bilan Comptable → JSON")
    
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
    log.info("Années disponibles", extra=", ".join(map(str, available_years)))
    log.info("Années à traiter", extra=", ".join(map(str, years)))
    
    # Récupérer toutes les données
    log.section("Récupération des données")
    all_data = fetch_bilan_data(client)
    log.success("Données récupérées", extra=f"{len(all_data)} lignes")
    
    # Export de l'index
    log.section("Génération de l'index")
    export_index(available_years, all_data)
    log.success("Index créé", extra="bilan_index.json")
    
    # Export par année
    log.section(f"Export Sankey par année ({len(years)} années)")
    for i, year in enumerate(years, 1):
        log.progress(i, len(years), f"Année {year}")
        export_year(all_data, year, log)
    
    log.summary()


if __name__ == "__main__":
    main()
