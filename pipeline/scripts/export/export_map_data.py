#!/usr/bin/env python3
"""
Script d'export des données cartographiques pour le dashboard Paris Budget.

Exporte les données suivantes depuis les tables dbt (BigQuery) vers des fichiers JSON statiques:
- Investissements (AP) avec géolocalisation (enrichie par LLM)
- Logements sociaux (déjà géolocalisés dans la source)
- Statistiques par arrondissement

Usage:
    python scripts/export_map_data.py

Les fichiers sont créés dans website/public/data/map/
"""

import json
import os
from pathlib import Path
from collections import defaultdict
from google.cloud import bigquery

# Configuration
PROJECT_ID = "open-data-france-484717"
DATASET = "dbt_paris_analytics"
OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data" / "map"

# Population par arrondissement (INSEE 2021)
POPULATION = {
    1: 15939, 2: 20900, 3: 33000, 4: 28088, 5: 56882,
    6: 40005, 7: 48354, 8: 35016, 9: 59835, 10: 83459,
    11: 142583, 12: 139867, 13: 178350, 14: 134382, 15: 227746,
    16: 165062, 17: 166518, 18: 191531, 19: 182952, 20: 187642,
}

# Mapping mission -> thématique (fallback si pas de LLM)
MISSION_THEMATIQUE = {
    "espaces verts": "environnement",
    "env": "environnement",
    "logement": "logement",
    "habitat": "logement",
    "sport": "sport",
    "culture": "culture",
    "patrimoine": "culture",
    "ecole": "education",
    "education": "education",
    "social": "social",
    "solidarite": "social",
    "voirie": "urbanisme",
    "transport": "urbanisme",
    "participatif": "democratie",
}


def get_client():
    """Crée un client BigQuery."""
    return bigquery.Client(project=PROJECT_ID)


def export_investissements(client):
    """
    Exporte les investissements (AP) depuis core_ap_projets.
    
    Inclut les colonnes enrichies par LLM (arrondissement, adresse, coords).
    """
    print("\n📋 Export des investissements (AP)...")
    
    query = f"""
    SELECT 
        annee,
        ap_code,
        ap_texte,
        mission_code,
        mission_libelle,
        direction_code,
        direction,
        nature_code,
        fonction_code,
        montant,
        cle_technique,
        -- Colonnes enrichies par LLM
        ode_arrondissement,
        ode_adresse,
        ode_latitude,
        ode_longitude,
        ode_type_equipement,
        ode_nom_lieu,
        ode_source_geo,
        ode_confiance
    FROM `{PROJECT_ID}.{DATASET}.core_ap_projets`
    WHERE annee >= 2018
    ORDER BY annee DESC, montant DESC
    """
    
    rows = list(client.query(query).result())
    print(f"  Total: {len(rows)} projets AP")
    
    # Statistiques
    total_with_arr = sum(1 for r in rows if r.ode_arrondissement)
    total_with_coords = sum(1 for r in rows if r.ode_latitude)
    montant_total = sum(r.montant or 0 for r in rows)
    montant_localise = sum(r.montant or 0 for r in rows if r.ode_arrondissement)
    
    print(f"  Avec arrondissement: {total_with_arr}/{len(rows)} ({100*total_with_arr/len(rows):.1f}%)")
    print(f"  Avec coordonnées: {total_with_coords}/{len(rows)}")
    print(f"  Montant total: {montant_total/1e9:.2f} Mds EUR")
    print(f"  Montant localisé: {montant_localise/1e9:.2f} Mds EUR ({100*montant_localise/montant_total:.1f}%)")
    
    # Grouper par année
    by_year = defaultdict(list)
    for r in rows:
        # Déterminer thématique depuis mission (fallback)
        mission = (r.mission_libelle or "").lower()
        thematique = r.ode_type_equipement or "autre"
        if thematique == "autre":
            for keyword, theme in MISSION_THEMATIQUE.items():
                if keyword in mission:
                    thematique = theme
                    break
        
        item = {
            "id": r.cle_technique,
            "annee": r.annee,
            "apCode": r.ap_code,
            "apTexte": r.ap_texte,
            "missionCode": r.mission_code,
            "missionLibelle": r.mission_libelle,
            "directionCode": r.direction_code,
            "direction": r.direction,
            "montant": r.montant,
            "thematique": thematique,
            # Géolocalisation enrichie
            "arrondissement": r.ode_arrondissement,
            "adresse": r.ode_adresse,
            "latitude": r.ode_latitude,
            "longitude": r.ode_longitude,
            "nomLieu": r.ode_nom_lieu,
            "sourceGeo": r.ode_source_geo,
            "confiance": r.ode_confiance,
        }
        by_year[r.annee].append(item)
    
    # Sauvegarder par année
    for year, items in sorted(by_year.items(), reverse=True):
        # Stats par thématique
        thematiques = defaultdict(lambda: {"total": 0, "count": 0})
        for item in items:
            t = item["thematique"]
            thematiques[t]["total"] += item["montant"] or 0
            thematiques[t]["count"] += 1
        
        # Stats par arrondissement
        arrondissements = {i: {"total": 0, "count": 0} for i in range(1, 21)}
        for item in items:
            arr = item["arrondissement"]
            if arr and 1 <= arr <= 20:
                arrondissements[arr]["total"] += item["montant"] or 0
                arrondissements[arr]["count"] += 1
        
        output_file = OUTPUT_DIR / f"investissements_{year}.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump({
                "year": year,
                "total": sum(i["montant"] or 0 for i in items),
                "count": len(items),
                "withArrondissement": len([i for i in items if i["arrondissement"]]),
                "withCoords": len([i for i in items if i["latitude"]]),
                "parThematique": dict(thematiques),
                "parArrondissement": arrondissements,
                "data": items
            }, f, ensure_ascii=False, indent=2)
        print(f"  Sauvegardé: {output_file.name} ({len(items)} projets)")
    
    # Index
    years = sorted(by_year.keys(), reverse=True)
    with open(OUTPUT_DIR / "investissements_index.json", "w", encoding="utf-8") as f:
        json.dump({
            "years": years,
            "totalRecords": len(rows),
            "totalMontant": montant_total,
            "coverage": {
                "withArrondissement": total_with_arr,
                "withCoords": total_with_coords,
                "montantLocalise": montant_localise,
                "pourcentageLocalise": round(100 * montant_localise / montant_total, 1)
            }
        }, f, ensure_ascii=False, indent=2)
    print(f"  Sauvegardé: investissements_index.json")
    
    return by_year


def export_logements_sociaux(client):
    """
    Exporte les logements sociaux depuis core_logements_sociaux.
    
    Ces données sont déjà géolocalisées à la source.
    """
    print("\n🏠 Export des logements sociaux...")
    
    query = f"""
    SELECT 
        id_livraison,
        annee,
        adresse,
        code_postal,
        arrondissement,
        latitude,
        longitude,
        bailleur,
        nb_logements,
        nb_plai,
        nb_plus,
        nb_pluscd,
        nb_pls,
        nature_programme,
        mode_realisation,
        commentaires,
        cle_technique
    FROM `{PROJECT_ID}.{DATASET}.core_logements_sociaux`
    ORDER BY annee DESC, nb_logements DESC
    """
    
    rows = list(client.query(query).result())
    print(f"  Total: {len(rows)} livraisons")
    
    total_logements = sum(r.nb_logements or 0 for r in rows)
    total_with_coords = sum(1 for r in rows if r.latitude)
    print(f"  Total logements: {total_logements}")
    print(f"  Avec coordonnées: {total_with_coords}/{len(rows)} ({100*total_with_coords/len(rows):.1f}%)")
    
    # Grouper par année
    by_year = defaultdict(list)
    for r in rows:
        item = {
            "id": r.cle_technique,
            "annee": r.annee,
            "adresse": r.adresse,
            "codePostal": r.code_postal,
            "arrondissement": r.arrondissement,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "bailleur": r.bailleur,
            "nbLogements": r.nb_logements,
            "nbPlai": r.nb_plai,
            "nbPlus": r.nb_plus,
            "nbPlusCd": r.nb_pluscd,
            "nbPls": r.nb_pls,
            "natureProgramme": r.nature_programme,
            "modeRealisation": r.mode_realisation,
            "commentaires": r.commentaires,
        }
        by_year[r.annee].append(item)
    
    # Sauvegarder par année
    for year, items in sorted(by_year.items(), reverse=True):
        if year and year >= 2010:  # Filtrer les années anciennes
            # Stats par arrondissement
            arrondissements = {i: {"total": 0, "count": 0} for i in range(1, 21)}
            for item in items:
                arr = item["arrondissement"]
                if arr and 1 <= arr <= 20:
                    arrondissements[arr]["total"] += item["nbLogements"] or 0
                    arrondissements[arr]["count"] += 1
            
            output_file = OUTPUT_DIR / f"logements_{year}.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump({
                    "year": year,
                    "totalLogements": sum(i["nbLogements"] or 0 for i in items),
                    "count": len(items),
                    "withCoords": len([i for i in items if i["latitude"]]),
                    "parArrondissement": arrondissements,
                    "data": items
                }, f, ensure_ascii=False, indent=2)
            print(f"  Sauvegardé: {output_file.name} ({len(items)} livraisons, {sum(i['nbLogements'] or 0 for i in items)} logements)")
    
    # Index
    years = sorted([y for y in by_year.keys() if y and y >= 2010], reverse=True)
    with open(OUTPUT_DIR / "logements_index.json", "w", encoding="utf-8") as f:
        json.dump({
            "years": years,
            "totalRecords": len(rows),
            "totalLogements": total_logements,
            "coverage": {
                "withCoords": total_with_coords,
                "pourcentageCoords": round(100 * total_with_coords / len(rows), 1) if rows else 0
            }
        }, f, ensure_ascii=False, indent=2)
    print(f"  Sauvegardé: logements_index.json")
    
    return by_year


def export_stats_arrondissements(client, investissements_by_year, logements_by_year):
    """
    Exporte les statistiques agrégées par arrondissement.
    
    Combine investissements + logements sociaux pour chaque arrondissement.
    """
    print("\n📊 Export des statistiques par arrondissement...")
    
    # Années disponibles
    inv_years = set(investissements_by_year.keys())
    log_years = set(logements_by_year.keys())
    all_years = sorted(inv_years | log_years, reverse=True)
    
    # Stats globales par arrondissement (toutes années confondues)
    global_stats = {i: {
        "arrondissement": i,
        "population": POPULATION.get(i, 0),
        "investissements": {"total": 0, "count": 0},
        "logements": {"total": 0, "count": 0},
    } for i in range(1, 21)}
    
    # Agréger investissements
    for year, items in investissements_by_year.items():
        for item in items:
            arr = item["arrondissement"]
            if arr and 1 <= arr <= 20:
                global_stats[arr]["investissements"]["total"] += item["montant"] or 0
                global_stats[arr]["investissements"]["count"] += 1
    
    # Agréger logements
    for year, items in logements_by_year.items():
        for item in items:
            arr = item["arrondissement"]
            if arr and 1 <= arr <= 20:
                global_stats[arr]["logements"]["total"] += item["nbLogements"] or 0
                global_stats[arr]["logements"]["count"] += 1
    
    # Calculer métriques par habitant
    for arr, stats in global_stats.items():
        pop = stats["population"]
        if pop > 0:
            stats["investissementsParHabitant"] = round(stats["investissements"]["total"] / pop, 2)
            stats["logementsParHabitant"] = round(1000 * stats["logements"]["total"] / pop, 2)  # pour 1000 hab
        else:
            stats["investissementsParHabitant"] = 0
            stats["logementsParHabitant"] = 0
    
    # Sauvegarder stats globales
    output_file = OUTPUT_DIR / "arrondissements_stats.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump({
            "years": all_years,
            "population": POPULATION,
            "data": list(global_stats.values())
        }, f, ensure_ascii=False, indent=2)
    print(f"  Sauvegardé: {output_file.name}")
    
    # Stats par année
    for year in all_years:
        if year and year >= 2018:
            year_stats = {i: {
                "arrondissement": i,
                "investissements": {"total": 0, "count": 0},
                "logements": {"total": 0, "count": 0},
            } for i in range(1, 21)}
            
            # Investissements de cette année
            for item in investissements_by_year.get(year, []):
                arr = item["arrondissement"]
                if arr and 1 <= arr <= 20:
                    year_stats[arr]["investissements"]["total"] += item["montant"] or 0
                    year_stats[arr]["investissements"]["count"] += 1
            
            # Logements de cette année
            for item in logements_by_year.get(year, []):
                arr = item["arrondissement"]
                if arr and 1 <= arr <= 20:
                    year_stats[arr]["logements"]["total"] += item["nbLogements"] or 0
                    year_stats[arr]["logements"]["count"] += 1
            
            output_file = OUTPUT_DIR / f"arrondissements_stats_{year}.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump({
                    "year": year,
                    "data": list(year_stats.values())
                }, f, ensure_ascii=False, indent=2)
            print(f"  Sauvegardé: {output_file.name}")


def main():
    """Point d'entrée principal."""
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from utils.logger import Logger
    
    log = Logger("export_map")
    log.header("Export Données Carte → JSON")
    
    # Créer le répertoire de sortie
    log.info("Dossier de sortie", extra=str(OUTPUT_DIR))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Client BigQuery
    log.section("Connexion BigQuery")
    client = get_client()
    log.success("Connecté", extra=PROJECT_ID)
    
    # Export des données
    log.section("Export investissements (AP)")
    investissements = export_investissements(client)
    log.success("Investissements exportés", extra=f"{sum(len(v) for v in investissements.values())} projets")
    
    log.section("Export logements sociaux")
    logements = export_logements_sociaux(client)
    log.success("Logements exportés", extra=f"{sum(len(v) for v in logements.values())} livraisons")
    
    log.section("Stats par arrondissement")
    export_stats_arrondissements(client, investissements, logements)
    log.success("Stats arrondissements exportées")
    
    log.summary()


if __name__ == "__main__":
    main()
