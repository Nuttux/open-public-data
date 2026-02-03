#!/usr/bin/env python3
"""
Script d'export des données cartographiques pour le dashboard Paris Budget.

Exporte les données suivantes depuis Paris OpenData vers des fichiers JSON statiques:
- Subventions aux associations (avec géolocalisation via API entreprises)
- Logements sociaux (déjà géolocalisés)
- Arrondissements (polygones GeoJSON)
- Autorisations de programmes (avec extraction d'adresse)

Usage:
    python scripts/export_map_data.py

Les fichiers sont créés dans frontend/public/data/map/
"""

import json
import os
import re
import time
import requests
from typing import Optional
from pathlib import Path

# Configuration
BASE_URL = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets"
ENTREPRISES_API = "https://recherche-entreprises.api.gouv.fr/search"
OUTPUT_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data" / "map"

# Rate limiting pour l'API entreprises (7 req/s max, on fait 5 pour être safe)
API_DELAY = 0.2

# Population par arrondissement (INSEE 2021)
POPULATION = {
    1: 15939, 2: 20900, 3: 33000, 4: 28088, 5: 56882,
    6: 40005, 7: 48354, 8: 35016, 9: 59835, 10: 83459,
    11: 142583, 12: 139867, 13: 178350, 14: 134382, 15: 227746,
    16: 165062, 17: 166518, 18: 191531, 19: 182952, 20: 187642,
}

# Mapping direction -> thématique
DIRECTION_THEMATIQUE = {
    'DAC': 'culture', 'DPMP': 'culture', 'SG-DPMC': 'culture', 'SG-MI-CINEMA': 'culture',
    'DJS': 'sport', 'DJOP': 'sport',
    'DASES': 'social', 'CASVP': 'social', 'DSOL': 'social',
    'DASCO': 'education', 'DFPE': 'education',
    'DEVE': 'environnement', 'DPE': 'environnement', 'DTEC': 'environnement',
    'DAE': 'economie',
    'DLH': 'logement', 'DILT': 'urbanisme',
    'DU': 'urbanisme', 'DVD': 'urbanisme', 'DUCT': 'urbanisme',
    'DPSP': 'securite', 'DPVI': 'securite',
    'DDCT': 'democratie',
    'DGRI': 'international', 'DGOM': 'international',
    'DRH': 'administration', 'DFA': 'administration', 'DAJ': 'administration',
    'DSP': 'administration', 'DICOM': 'administration', 'SG': 'administration', 'SGCP': 'administration',
}

def fetch_paris_data(dataset: str, params: dict) -> dict:
    """Récupère des données depuis l'API Paris OpenData."""
    url = f"{BASE_URL}/{dataset}/records"
    response = requests.get(url, params=params)
    response.raise_for_status()
    return response.json()

def fetch_all_records(dataset: str, base_params: dict, max_records: int = 10000) -> list:
    """Récupère tous les enregistrements avec pagination."""
    all_records = []
    offset = 0
    limit = 100
    
    while offset < max_records:
        params = {**base_params, "limit": limit, "offset": offset}
        data = fetch_paris_data(dataset, params)
        records = data.get("results", [])
        
        if not records:
            break
            
        all_records.extend(records)
        total = data.get("total_count", 0)
        print(f"  Fetched {len(all_records)}/{total} records...")
        
        if len(records) < limit:
            break
            
        offset += limit
        time.sleep(0.1)  # Petit délai pour ne pas surcharger l'API
    
    return all_records

def geolocate_siret(siret: str) -> Optional[dict]:
    """Géolocalise un SIRET via l'API entreprises."""
    if not siret or len(siret.replace(" ", "")) != 14:
        return None
    
    try:
        response = requests.get(
            ENTREPRISES_API,
            params={"q": siret.replace(" ", ""), "mtm_campaign": "paris-budget"},
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        if not data.get("results"):
            return None
            
        siege = data["results"][0].get("siege", {})
        if not siege.get("latitude") or not siege.get("longitude"):
            return None
            
        return {
            "lat": float(siege["latitude"]),
            "lon": float(siege["longitude"]),
            "adresse": siege.get("adresse", ""),
            "codePostal": siege.get("code_postal", ""),
            "commune": siege.get("libelle_commune", ""),
        }
    except Exception as e:
        print(f"    Error geolocating {siret}: {e}")
        return None

def extract_arrondissement_from_codepostal(code_postal: str) -> Optional[int]:
    """Extrait le numéro d'arrondissement depuis un code postal parisien."""
    if not code_postal:
        return None
    cp = code_postal.strip()
    if cp.startswith("750") and len(cp) == 5:
        arr = int(cp[3:5])
        if 1 <= arr <= 20:
            return arr
    return None

def export_subventions():
    """Exporte les subventions avec géolocalisation et thématiques."""
    print("\n📦 Export des subventions...")
    
    # Récupérer toutes les subventions
    records = fetch_all_records(
        "subventions-associations-votees-",
        {"order_by": "montant_vote desc"},
        max_records=10000  # Plus de données
    )
    
    print(f"  Total: {len(records)} subventions")
    
    # Transformer et géolocaliser
    subventions = []
    geo_cache = {}
    geo_found = 0
    
    # Stats par arrondissement et par thématique
    stats_by_arr = {i: {"total": 0, "count": 0} for i in range(1, 21)}
    stats_by_thematique = {}
    
    # Charger le cache existant s'il existe
    cache_file = OUTPUT_DIR / "geo_cache.json"
    if cache_file.exists():
        with open(cache_file, "r") as f:
            geo_cache = json.load(f)
        print(f"  Cache chargé: {len(geo_cache)} SIRETs")
    
    for i, r in enumerate(records):
        siret = str(r.get("numero_siret", "")).strip()
        
        # Extraire l'année depuis la date
        annee_str = r.get("annee_budgetaire", "")
        try:
            annee = int(annee_str[:4]) if annee_str else 0
        except:
            annee = 0
        
        direction = r.get("direction", "") or ""
        thematique = DIRECTION_THEMATIQUE.get(direction, "autre")
        
        sub = {
            "id": r.get("numero_de_dossier", f"sub-{i}"),
            "annee": annee,
            "beneficiaire": r.get("nom_beneficiaire", ""),
            "siret": siret,
            "objet": r.get("objet_du_dossier", ""),
            "montant": r.get("montant_vote", 0) or 0,
            "direction": direction,
            "nature": r.get("nature_de_la_subvention", ""),
            "thematique": thematique,
        }
        
        # Compter par thématique
        if thematique not in stats_by_thematique:
            stats_by_thematique[thematique] = {"total": 0, "count": 0}
        stats_by_thematique[thematique]["total"] += sub["montant"]
        stats_by_thematique[thematique]["count"] += 1
        
        # Géolocaliser si SIRET valide
        if siret and len(siret) == 14:
            if siret in geo_cache:
                geo = geo_cache[siret]
                if geo:
                    sub["coordinates"] = {"lat": geo["lat"], "lon": geo["lon"]}
                    sub["adresse"] = geo.get("adresse", "")
                    sub["codePostal"] = geo.get("codePostal", "")
                    sub["commune"] = geo.get("commune", "")
                    geo_found += 1
                    
                    # Extraire arrondissement
                    arr = extract_arrondissement_from_codepostal(geo.get("codePostal", ""))
                    if arr:
                        sub["arrondissement"] = arr
                        stats_by_arr[arr]["total"] += sub["montant"]
                        stats_by_arr[arr]["count"] += 1
            else:
                # Géolocaliser via API (avec rate limiting)
                geo = geolocate_siret(siret)
                geo_cache[siret] = geo
                
                if geo:
                    sub["coordinates"] = {"lat": geo["lat"], "lon": geo["lon"]}
                    sub["adresse"] = geo.get("adresse", "")
                    sub["codePostal"] = geo.get("codePostal", "")
                    sub["commune"] = geo.get("commune", "")
                    geo_found += 1
                    
                    # Extraire arrondissement
                    arr = extract_arrondissement_from_codepostal(geo.get("codePostal", ""))
                    if arr:
                        sub["arrondissement"] = arr
                        stats_by_arr[arr]["total"] += sub["montant"]
                        stats_by_arr[arr]["count"] += 1
                
                time.sleep(API_DELAY)
                
                if (i + 1) % 50 == 0:
                    print(f"  Géolocalisation: {i + 1}/{len(records)} ({geo_found} trouvés)")
                    # Sauvegarder le cache régulièrement
                    with open(cache_file, "w") as f:
                        json.dump(geo_cache, f)
        
        subventions.append(sub)
    
    # Sauvegarder le cache final
    with open(cache_file, "w") as f:
        json.dump(geo_cache, f)
    
    print(f"  Géolocalisés: {geo_found}/{len(subventions)}")
    
    # Grouper par année
    by_year = {}
    for sub in subventions:
        year = sub["annee"]
        if year not in by_year:
            by_year[year] = []
        by_year[year].append(sub)
    
    # Sauvegarder par année
    for year, subs in by_year.items():
        if year > 2000:  # Filtrer les années valides
            # Stats par thématique pour cette année
            year_thematiques = {}
            for s in subs:
                t = s.get("thematique", "autre")
                if t not in year_thematiques:
                    year_thematiques[t] = {"total": 0, "count": 0}
                year_thematiques[t]["total"] += s["montant"]
                year_thematiques[t]["count"] += 1
            
            output_file = OUTPUT_DIR / f"subventions_{year}.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump({
                    "year": year,
                    "total": sum(s["montant"] for s in subs),
                    "count": len(subs),
                    "geolocated": len([s for s in subs if "coordinates" in s]),
                    "parThematique": year_thematiques,
                    "data": subs
                }, f, ensure_ascii=False, indent=2)
            print(f"  Sauvegardé: {output_file.name} ({len(subs)} subventions)")
    
    # Index des années disponibles avec thématiques globales
    years_index = sorted([y for y in by_year.keys() if y > 2000], reverse=True)
    thematiques_list = sorted(stats_by_thematique.keys())
    
    with open(OUTPUT_DIR / "subventions_index.json", "w", encoding="utf-8") as f:
        json.dump({
            "availableYears": years_index,
            "thematiques": thematiques_list,
        }, f, ensure_ascii=False)
    
    # Stats par arrondissement (avec per capita)
    arr_stats = []
    for code in range(1, 21):
        pop = POPULATION.get(code, 0)
        total = stats_by_arr[code]["total"]
        arr_stats.append({
            "code": code,
            "nom": f"{code}{'er' if code == 1 else 'ème'} arrondissement",
            "population": pop,
            "totalSubventions": total,
            "nbSubventions": stats_by_arr[code]["count"],
            "subventionsPerCapita": round(total / pop, 2) if pop > 0 else 0,
        })
    
    with open(OUTPUT_DIR / "subventions_par_arrondissement.json", "w", encoding="utf-8") as f:
        json.dump(arr_stats, f, ensure_ascii=False, indent=2)
    
    print(f"  Stats par arrondissement sauvegardées")
    
    return subventions

def export_logements():
    """Exporte les logements sociaux (déjà géolocalisés) avec per capita."""
    print("\n🏠 Export des logements sociaux...")
    
    records = fetch_all_records(
        "logements-sociaux-finances-a-paris",
        {"order_by": "nb_logmt_total desc"},
        max_records=10000
    )
    
    print(f"  Total: {len(records)} programmes")
    
    logements = []
    for r in records:
        geo = r.get("geo_point_2d")
        if not geo:
            continue
        
        # Extraire l'année
        annee_str = r.get("annee", "")
        try:
            annee = int(annee_str[:4]) if annee_str else 0
        except:
            annee = 0
            
        logements.append({
            "id": r.get("id_livraison", ""),
            "adresse": r.get("adresse_programme", ""),
            "codePostal": r.get("code_postal", ""),
            "annee": annee,
            "bailleur": r.get("bs", ""),
            "nbLogements": r.get("nb_logmt_total", 0) or 0,
            "nbPLAI": r.get("nb_plai", 0) or 0,
            "nbPLUS": r.get("nb_plus", 0) or 0,
            "nbPLUSCD": r.get("nb_pluscd", 0) or 0,
            "nbPLS": r.get("nb_pls", 0) or 0,
            "modeRealisation": r.get("mode_real", ""),
            "arrondissement": r.get("arrdt", 0) or 0,
            "natureProgramme": r.get("nature_programme", ""),
            "coordinates": {
                "lat": geo["lat"],
                "lon": geo["lon"]
            }
        })
    
    # Sauvegarder tous les logements
    output_file = OUTPUT_DIR / "logements_sociaux.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump({
            "total": sum(l["nbLogements"] for l in logements),
            "count": len(logements),
            "data": logements
        }, f, ensure_ascii=False, indent=2)
    
    print(f"  Sauvegardé: {output_file.name}")
    
    # Stats par arrondissement avec per capita
    by_arr = {}
    for l in logements:
        arr = l["arrondissement"]
        if arr not in by_arr:
            by_arr[arr] = {"total": 0, "count": 0}
        by_arr[arr]["total"] += l["nbLogements"]
        by_arr[arr]["count"] += 1
    
    arr_stats = []
    for code in range(1, 21):
        stats = by_arr.get(code, {"total": 0, "count": 0})
        pop = POPULATION.get(code, 0)
        total_logements = stats["total"]
        arr_stats.append({
            "code": code,
            "nom": f"{code}{'er' if code == 1 else 'ème'} arrondissement",
            "population": pop,
            "totalLogements": total_logements,
            "nbProgrammes": stats["count"],
            "logementsPerCapita": round(total_logements / pop * 1000, 2) if pop > 0 else 0,  # pour 1000 hab
        })
    
    with open(OUTPUT_DIR / "logements_par_arrondissement.json", "w", encoding="utf-8") as f:
        json.dump(arr_stats, f, ensure_ascii=False, indent=2)
    
    return logements


def extract_arrondissement_from_text(text: str) -> Optional[int]:
    """
    Extrait le numéro d'arrondissement depuis un texte descriptif.
    Patterns reconnus: "15e", "15ème", "15EME", "ARRONDISSEMENT 15", etc.
    """
    if not text:
        return None
    
    text_upper = text.upper()
    
    # Pattern: "15E", "15ÈME", "15EME"
    match = re.search(r'\b(\d{1,2})(?:E|ÈME|EME|ER)\b', text_upper)
    if match:
        arr = int(match.group(1))
        if 1 <= arr <= 20:
            return arr
    
    # Pattern: "ARRONDISSEMENT 15" ou "ARRT 15"
    match = re.search(r'ARR(?:ONDISSEMENT|DT|T)?\.?\s*(\d{1,2})', text_upper)
    if match:
        arr = int(match.group(1))
        if 1 <= arr <= 20:
            return arr
    
    # Pattern: code postal "75015"
    match = re.search(r'\b750(\d{2})\b', text_upper)
    if match:
        arr = int(match.group(1))
        if 1 <= arr <= 20:
            return arr
    
    return None


def export_autorisations_programmes():
    """Exporte les autorisations de programmes avec extraction d'arrondissement."""
    print("\n📋 Export des autorisations de programmes...")
    
    records = fetch_all_records(
        "comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de",
        {"order_by": "mandate_titre_apres_regul desc"},
        max_records=10000
    )
    
    print(f"  Total: {len(records)} autorisations")
    
    autorisations = []
    arr_extracted = 0
    
    # Stats par arrondissement et par mission
    stats_by_arr = {i: {"total": 0, "count": 0} for i in range(1, 21)}
    stats_by_mission = {}
    
    for i, r in enumerate(records):
        # Extraire l'année
        annee_str = r.get("exercice_comptable", "")
        try:
            annee = int(annee_str[:4]) if annee_str else 0
        except:
            annee = 0
        
        ap_texte = r.get("autorisation_de_programme_texte", "") or ""
        mission_texte = r.get("mission_ap_texte", "") or ""
        montant = r.get("mandate_titre_apres_regul", 0) or 0
        
        # Déterminer la thématique depuis la mission
        mission_code = r.get("mission_ap_cle", "") or ""
        thematique = "autre"
        if "ESPACES VERTS" in mission_texte.upper() or "ENV" in mission_texte.upper():
            thematique = "environnement"
        elif "LOGEMENT" in mission_texte.upper() or "HABITAT" in mission_texte.upper():
            thematique = "logement"
        elif "SPORT" in mission_texte.upper():
            thematique = "sport"
        elif "CULTURE" in mission_texte.upper() or "PATRIMOINE" in mission_texte.upper():
            thematique = "culture"
        elif "ECOLE" in mission_texte.upper() or "EDUCATION" in mission_texte.upper():
            thematique = "education"
        elif "SOCIAL" in mission_texte.upper() or "SOLIDARITE" in mission_texte.upper():
            thematique = "social"
        elif "VOIRIE" in mission_texte.upper() or "TRANSPORT" in mission_texte.upper():
            thematique = "urbanisme"
        elif "PARTICIPATIF" in mission_texte.upper():
            thematique = "democratie"
        
        # Tenter d'extraire l'arrondissement
        arrondissement = extract_arrondissement_from_text(ap_texte)
        if arrondissement:
            arr_extracted += 1
            stats_by_arr[arrondissement]["total"] += montant
            stats_by_arr[arrondissement]["count"] += 1
        
        # Stats par mission
        if mission_texte not in stats_by_mission:
            stats_by_mission[mission_texte] = {"total": 0, "count": 0, "thematique": thematique}
        stats_by_mission[mission_texte]["total"] += montant
        stats_by_mission[mission_texte]["count"] += 1
        
        autorisations.append({
            "id": f"ap-{annee}-{r.get('autorisation_de_programme_cle', i)}",
            "annee": annee,
            "budget": r.get("budget", ""),
            "missionCode": mission_code,
            "missionTexte": mission_texte,
            "activite": r.get("activite_ap", ""),
            "directionCode": r.get("direction_gestionnaire_cle", ""),
            "directionTexte": r.get("direction_gestionnaire_texte", ""),
            "apCode": r.get("autorisation_de_programme_cle", ""),
            "apTexte": ap_texte,
            "natureTexte": r.get("nature_budgetaire_texte", ""),
            "domaineTexte": r.get("domaine_fonctionnel_rubrique_reglementaire_texte", ""),
            "montant": montant,
            "thematique": thematique,
            "arrondissement": arrondissement,
        })
    
    print(f"  Arrondissements extraits: {arr_extracted}/{len(autorisations)}")
    
    # Grouper par année
    by_year = {}
    for ap in autorisations:
        year = ap["annee"]
        if year not in by_year:
            by_year[year] = []
        by_year[year].append(ap)
    
    # Sauvegarder par année
    for year, aps in by_year.items():
        if year >= 2018:
            # Stats par thématique pour cette année
            year_thematiques = {}
            for a in aps:
                t = a.get("thematique", "autre")
                if t not in year_thematiques:
                    year_thematiques[t] = {"total": 0, "count": 0}
                year_thematiques[t]["total"] += a["montant"]
                year_thematiques[t]["count"] += 1
            
            output_file = OUTPUT_DIR / f"autorisations_{year}.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump({
                    "year": year,
                    "total": sum(a["montant"] for a in aps),
                    "count": len(aps),
                    "withArrondissement": len([a for a in aps if a.get("arrondissement")]),
                    "parThematique": year_thematiques,
                    "data": aps
                }, f, ensure_ascii=False, indent=2)
            print(f"  Sauvegardé: {output_file.name} ({len(aps)} autorisations)")
    
    # Index
    years_index = sorted([y for y in by_year.keys() if y >= 2018], reverse=True)
    thematiques_list = sorted(set(a["thematique"] for a in autorisations))
    missions_list = sorted(stats_by_mission.keys())
    
    with open(OUTPUT_DIR / "autorisations_index.json", "w", encoding="utf-8") as f:
        json.dump({
            "availableYears": years_index,
            "thematiques": thematiques_list,
            "missions": missions_list[:50],  # Top 50
        }, f, ensure_ascii=False)
    
    # Stats par arrondissement (avec per capita)
    arr_stats = []
    for code in range(1, 21):
        pop = POPULATION.get(code, 0)
        total = stats_by_arr[code]["total"]
        arr_stats.append({
            "code": code,
            "nom": f"{code}{'er' if code == 1 else 'ème'} arrondissement",
            "population": pop,
            "totalInvestissement": total,
            "nbAutorisations": stats_by_arr[code]["count"],
            "investissementPerCapita": round(total / pop, 2) if pop > 0 else 0,
        })
    
    with open(OUTPUT_DIR / "autorisations_par_arrondissement.json", "w", encoding="utf-8") as f:
        json.dump(arr_stats, f, ensure_ascii=False, indent=2)
    
    print(f"  Stats par arrondissement sauvegardées")
    
    return autorisations

def export_arrondissements():
    """Exporte les polygones des arrondissements."""
    print("\n🗺️ Export des arrondissements...")
    
    url = f"{BASE_URL}/arrondissements/exports/geojson"
    response = requests.get(url)
    response.raise_for_status()
    geojson = response.json()
    
    output_file = OUTPUT_DIR / "arrondissements.geojson"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)
    
    print(f"  Sauvegardé: {output_file.name} ({len(geojson.get('features', []))} arrondissements)")
    
    return geojson

def export_combined_arrondissement_stats():
    """Combine toutes les stats par arrondissement en un seul fichier."""
    print("\n📊 Génération des stats combinées par arrondissement...")
    
    # Charger les stats individuelles
    sub_file = OUTPUT_DIR / "subventions_par_arrondissement.json"
    log_file = OUTPUT_DIR / "logements_par_arrondissement.json"
    ap_file = OUTPUT_DIR / "autorisations_par_arrondissement.json"
    
    sub_stats = {}
    log_stats = {}
    ap_stats = {}
    
    if sub_file.exists():
        with open(sub_file, "r") as f:
            for s in json.load(f):
                sub_stats[s["code"]] = s
    
    if log_file.exists():
        with open(log_file, "r") as f:
            for s in json.load(f):
                log_stats[s["code"]] = s
    
    if ap_file.exists():
        with open(ap_file, "r") as f:
            for s in json.load(f):
                ap_stats[s["code"]] = s
    
    # Combiner
    combined = []
    for code in range(1, 21):
        pop = POPULATION.get(code, 0)
        sub = sub_stats.get(code, {})
        log = log_stats.get(code, {})
        ap = ap_stats.get(code, {})
        
        combined.append({
            "code": code,
            "nom": f"{code}{'er' if code == 1 else 'ème'} arrondissement",
            "population": pop,
            # Subventions
            "totalSubventions": sub.get("totalSubventions", 0),
            "nbSubventions": sub.get("nbSubventions", 0),
            "subventionsPerCapita": sub.get("subventionsPerCapita", 0),
            # Logements
            "totalLogements": log.get("totalLogements", 0),
            "nbProgrammesLogement": log.get("nbProgrammes", 0),
            "logementsPerCapita": log.get("logementsPerCapita", 0),
            # Investissements
            "totalInvestissement": ap.get("totalInvestissement", 0),
            "nbAutorisations": ap.get("nbAutorisations", 0),
            "investissementPerCapita": ap.get("investissementPerCapita", 0),
        })
    
    with open(OUTPUT_DIR / "arrondissements_stats.json", "w", encoding="utf-8") as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)
    
    print(f"  Sauvegardé: arrondissements_stats.json")


def main():
    """Point d'entrée principal."""
    print("=" * 60)
    print("🏛️ Export des données cartographiques Paris Budget")
    print("=" * 60)
    
    # Créer le dossier de sortie
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nDossier de sortie: {OUTPUT_DIR}")
    
    # Exporter les données
    export_arrondissements()
    export_logements()
    export_subventions()
    export_autorisations_programmes()
    export_combined_arrondissement_stats()
    
    print("\n" + "=" * 60)
    print("✅ Export terminé!")
    print("=" * 60)

if __name__ == "__main__":
    main()
