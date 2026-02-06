#!/usr/bin/env python3
"""
Géocodage des adresses AP via api-adresse.data.gouv.fr

Ce script :
1. Lit seed_cache_geo_ap.csv (contient adresses sans coordonnées)
2. Lit seed_lieux_connus.csv (lieux parisiens avec coordonnées)
3. Pour chaque adresse:
   - D'abord cherche dans lieux_connus (match par nom)
   - Sinon appelle l'API BAN (Base Adresse Nationale)
4. Met à jour le CSV avec les coordonnées

Usage:
    python pipeline/scripts/geocode_ap_cache.py

Output:
    Met à jour pipeline/seeds/seed_cache_geo_ap.csv avec lat/lon
"""

import csv
import time
import requests
from pathlib import Path
from datetime import datetime

# Configuration
SEEDS_DIR = Path(__file__).parent.parent / "seeds"
CACHE_FILE = SEEDS_DIR / "seed_cache_geo_ap.csv"
LIEUX_FILE = SEEDS_DIR / "seed_lieux_connus.csv"
API_URL = "https://api-adresse.data.gouv.fr/search"

# Rate limiting (API BAN est généreux mais soyons polis)
DELAY_BETWEEN_CALLS = 0.1  # 100ms


def load_lieux_connus() -> dict:
    """
    Charge les lieux connus avec leurs coordonnées.
    
    Returns:
        dict: {pattern_upper: {lat, lon, adresse, arrondissement}}
    """
    lieux = {}
    with open(LIEUX_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pattern = row["pattern_match"].upper().strip()
            lieux[pattern] = {
                "lat": float(row["latitude"]) if row["latitude"] else None,
                "lon": float(row["longitude"]) if row["longitude"] else None,
                "adresse": row["adresse"],
                "arrondissement": int(row["arrondissement"]) if row["arrondissement"] else None,
            }
    print(f"✓ Chargé {len(lieux)} lieux connus")
    return lieux


def match_lieu_connu(nom_lieu: str, lieux: dict) -> dict | None:
    """
    Cherche si un nom de lieu match un lieu connu.
    
    Utilise une recherche par inclusion (le pattern doit être dans le nom).
    """
    if not nom_lieu:
        return None
    
    nom_upper = nom_lieu.upper().strip()
    
    # Match exact d'abord
    if nom_upper in lieux:
        return lieux[nom_upper]
    
    # Match par inclusion
    for pattern, data in lieux.items():
        if pattern in nom_upper or nom_upper in pattern:
            return data
    
    return None


def geocode_address(adresse: str, arrondissement: int | None = None) -> dict | None:
    """
    Géocode une adresse via l'API BAN.
    
    Args:
        adresse: L'adresse à géocoder (ex: "5 rue Curial")
        arrondissement: L'arrondissement si connu (pour améliorer la précision)
    
    Returns:
        dict avec lat, lon, score ou None si échec
    """
    if not adresse or len(adresse.strip()) < 3:
        return None
    
    # Construire la requête
    query = adresse.strip()
    
    # Ajouter Paris et arrondissement si connu
    if arrondissement and arrondissement > 0:
        # Code postal Paris: 75001 à 75020 (mais 75001-75004 = 75001)
        if arrondissement <= 4:
            cp = "75001"
        else:
            cp = f"750{arrondissement:02d}"
        query = f"{query}, {cp} Paris"
    else:
        query = f"{query}, Paris"
    
    try:
        response = requests.get(
            API_URL,
            params={
                "q": query,
                "limit": 1,
                "type": "housenumber",  # Priorité aux adresses précises
            },
            timeout=5,
        )
        response.raise_for_status()
        data = response.json()
        
        if data.get("features"):
            feature = data["features"][0]
            coords = feature["geometry"]["coordinates"]
            props = feature["properties"]
            
            return {
                "lat": coords[1],  # API retourne [lon, lat]
                "lon": coords[0],
                "score": props.get("score", 0),
                "label": props.get("label", ""),
            }
        
        # Essayer sans type=housenumber (plus large)
        response = requests.get(
            API_URL,
            params={"q": query, "limit": 1},
            timeout=5,
        )
        response.raise_for_status()
        data = response.json()
        
        if data.get("features"):
            feature = data["features"][0]
            coords = feature["geometry"]["coordinates"]
            props = feature["properties"]
            
            return {
                "lat": coords[1],
                "lon": coords[0],
                "score": props.get("score", 0),
                "label": props.get("label", ""),
            }
        
        return None
        
    except Exception as e:
        print(f"  ⚠️ Erreur API pour '{query}': {e}")
        return None


def geocode_lieu(nom_lieu: str, arrondissement: int | None = None) -> dict | None:
    """
    Géocode un nom de lieu (pas une adresse) via l'API BAN.
    
    Ex: "Carreau du Temple", "Piscine Mourlon"
    """
    if not nom_lieu or len(nom_lieu.strip()) < 3:
        return None
    
    query = nom_lieu.strip()
    
    if arrondissement and arrondissement > 0:
        if arrondissement <= 4:
            cp = "75001"
        else:
            cp = f"750{arrondissement:02d}"
        query = f"{query}, {cp} Paris"
    else:
        query = f"{query}, Paris"
    
    try:
        response = requests.get(
            API_URL,
            params={"q": query, "limit": 1},
            timeout=5,
        )
        response.raise_for_status()
        data = response.json()
        
        if data.get("features"):
            feature = data["features"][0]
            coords = feature["geometry"]["coordinates"]
            props = feature["properties"]
            
            # Vérifier que c'est bien à Paris (75)
            postcode = props.get("postcode", "")
            if postcode.startswith("75"):
                return {
                    "lat": coords[1],
                    "lon": coords[0],
                    "score": props.get("score", 0),
                    "label": props.get("label", ""),
                }
        
        return None
        
    except Exception as e:
        print(f"  ⚠️ Erreur API pour lieu '{query}': {e}")
        return None


def main():
    print("=" * 60)
    print("Géocodage des adresses AP")
    print("=" * 60)
    
    # Charger les lieux connus
    lieux = load_lieux_connus()
    
    # Lire le cache actuel
    rows = []
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)
    
    print(f"✓ Chargé {len(rows)} records du cache AP")
    
    # Stats
    stats = {
        "already_geocoded": 0,
        "from_lieux_connus": 0,
        "from_api_address": 0,
        "from_api_lieu": 0,
        "no_data": 0,
        "api_failed": 0,
    }
    
    # Traiter chaque record
    updated_rows = []
    
    for i, row in enumerate(rows):
        # Déjà géocodé ?
        if row.get("ode_latitude") and row.get("ode_longitude"):
            stats["already_geocoded"] += 1
            updated_rows.append(row)
            continue
        
        # Pas de données à géocoder
        adresse = row.get("ode_adresse", "").strip()
        nom_lieu = row.get("ode_nom_lieu", "").strip()
        arrondissement = int(row["ode_arrondissement"]) if row.get("ode_arrondissement") else None
        
        if not adresse and not nom_lieu:
            stats["no_data"] += 1
            updated_rows.append(row)
            continue
        
        # 1. D'abord chercher dans les lieux connus
        lieu_match = match_lieu_connu(nom_lieu, lieux) if nom_lieu else None
        
        if lieu_match and lieu_match.get("lat"):
            row["ode_latitude"] = lieu_match["lat"]
            row["ode_longitude"] = lieu_match["lon"]
            row["ode_source"] = "lieu_connu"
            stats["from_lieux_connus"] += 1
            print(f"  [{i+1}/{len(rows)}] {nom_lieu} → lieu connu ✓")
            updated_rows.append(row)
            continue
        
        # 2. Si adresse, géocoder via API
        if adresse:
            time.sleep(DELAY_BETWEEN_CALLS)
            result = geocode_address(adresse, arrondissement)
            
            if result and result.get("score", 0) > 0.4:
                row["ode_latitude"] = round(result["lat"], 6)
                row["ode_longitude"] = round(result["lon"], 6)
                row["ode_source"] = "api_adresse"
                stats["from_api_address"] += 1
                print(f"  [{i+1}/{len(rows)}] {adresse} → {result['label']} (score={result['score']:.2f}) ✓")
                updated_rows.append(row)
                continue
        
        # 3. Si nom de lieu, essayer de géocoder le lieu
        if nom_lieu:
            time.sleep(DELAY_BETWEEN_CALLS)
            result = geocode_lieu(nom_lieu, arrondissement)
            
            if result and result.get("score", 0) > 0.3:
                row["ode_latitude"] = round(result["lat"], 6)
                row["ode_longitude"] = round(result["lon"], 6)
                row["ode_source"] = "api_lieu"
                stats["from_api_lieu"] += 1
                print(f"  [{i+1}/{len(rows)}] {nom_lieu} → {result['label']} (score={result['score']:.2f}) ✓")
                updated_rows.append(row)
                continue
        
        # Échec
        stats["api_failed"] += 1
        print(f"  [{i+1}/{len(rows)}] {adresse or nom_lieu} → non trouvé ✗")
        updated_rows.append(row)
    
    # Sauvegarder
    with open(CACHE_FILE, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(updated_rows)
    
    print()
    print("=" * 60)
    print("Résultats")
    print("=" * 60)
    print(f"  Déjà géocodés:      {stats['already_geocoded']}")
    print(f"  Lieux connus:       {stats['from_lieux_connus']}")
    print(f"  API (adresse):      {stats['from_api_address']}")
    print(f"  API (lieu):         {stats['from_api_lieu']}")
    print(f"  Sans données:       {stats['no_data']}")
    print(f"  Échecs API:         {stats['api_failed']}")
    print()
    total_geocoded = stats['from_lieux_connus'] + stats['from_api_address'] + stats['from_api_lieu']
    print(f"  → {total_geocoded} nouveaux géocodages ajoutés")
    print(f"  → Fichier mis à jour: {CACHE_FILE}")


if __name__ == "__main__":
    main()
