#!/usr/bin/env python3
"""
Script d'export des données cartographiques pour le dashboard Paris Budget.

Exporte les données suivantes depuis Paris OpenData vers des fichiers JSON statiques:
- Subventions aux associations (avec géolocalisation via API entreprises)
- Logements sociaux (déjà géolocalisés)
- Arrondissements (polygones GeoJSON)

Usage:
    python scripts/export_map_data.py

Les fichiers sont créés dans frontend/public/data/map/
"""

import json
import os
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

def export_subventions():
    """Exporte les subventions avec géolocalisation."""
    print("\n📦 Export des subventions...")
    
    # Récupérer toutes les subventions
    records = fetch_all_records(
        "subventions-associations-votees-",
        {"order_by": "montant_vote desc"},
        max_records=5000  # Limiter pour le temps d'export
    )
    
    print(f"  Total: {len(records)} subventions")
    
    # Transformer et géolocaliser
    subventions = []
    geo_cache = {}
    geo_found = 0
    
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
        
        sub = {
            "id": r.get("numero_de_dossier", f"sub-{i}"),
            "annee": annee,
            "beneficiaire": r.get("nom_beneficiaire", ""),
            "siret": siret,
            "objet": r.get("objet_du_dossier", ""),
            "montant": r.get("montant_vote", 0) or 0,
            "direction": r.get("direction", ""),
            "nature": r.get("nature_de_la_subvention", ""),
        }
        
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
            output_file = OUTPUT_DIR / f"subventions_{year}.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump({
                    "year": year,
                    "total": sum(s["montant"] for s in subs),
                    "count": len(subs),
                    "geolocated": len([s for s in subs if "coordinates" in s]),
                    "data": subs
                }, f, ensure_ascii=False, indent=2)
            print(f"  Sauvegardé: {output_file.name} ({len(subs)} subventions)")
    
    # Index des années disponibles
    years_index = sorted([y for y in by_year.keys() if y > 2000], reverse=True)
    with open(OUTPUT_DIR / "subventions_index.json", "w") as f:
        json.dump({"availableYears": years_index}, f)
    
    return subventions

def export_logements():
    """Exporte les logements sociaux (déjà géolocalisés)."""
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
    
    # Stats par arrondissement
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
        arr_stats.append({
            "code": code,
            "nom": f"{code}{'er' if code == 1 else 'ème'} arrondissement",
            "totalLogements": stats["total"],
            "nbProgrammes": stats["count"]
        })
    
    with open(OUTPUT_DIR / "logements_par_arrondissement.json", "w", encoding="utf-8") as f:
        json.dump(arr_stats, f, ensure_ascii=False, indent=2)
    
    return logements

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
    
    print("\n" + "=" * 60)
    print("✅ Export terminé!")
    print("=" * 60)

if __name__ == "__main__":
    main()
