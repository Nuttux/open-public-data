#!/usr/bin/env python3
"""
Géocodage des investissements fusionnés.

Ce script enrichit les données investissements_complet_{year}.json avec:
1. Extraction d'adresses depuis les noms de projets
2. Matching avec les lieux connus (piscines, gymnases, etc.)
3. Appel à l'API BAN (Base Adresse Nationale)
4. Fallback sur le centroïde de l'arrondissement si rien ne matche

PRIORITÉ DE GÉOCODAGE:
1. Lieux connus (seed_lieux_connus.csv) - score 1.0
2. Adresse extraite via regex (API BAN) - score 0.9 à 0.5 selon API
3. Nom de lieu (API BAN) - score 0.3 à 0.5
4. Centroïde arrondissement - score 0.1

Usage:
    python geocode_investments.py --year 2022
    python geocode_investments.py --all

Output:
    Met à jour les fichiers investissements_complet_{year}.json avec lat/lon
"""

import argparse
import json
import re
import time
from datetime import datetime
from pathlib import Path

import requests

# =============================================================================
# Configuration
# =============================================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = PROJECT_ROOT / "website" / "public" / "data" / "map"
SEEDS_DIR = PROJECT_ROOT / "pipeline" / "seeds"
LIEUX_FILE = SEEDS_DIR / "seed_lieux_connus.csv"
GEO_CACHE_FILE = DATA_DIR / "geo_cache.json"

API_URL = "https://api-adresse.data.gouv.fr/search"
DELAY_BETWEEN_CALLS = 0.1  # 100ms entre appels API

# Centroïdes des arrondissements parisiens (fallback)
CENTROIDS = {
    1: (48.8605, 2.3478), 2: (48.8673, 2.3414), 3: (48.8631, 2.3606), 4: (48.8536, 2.3578),
    5: (48.8450, 2.3497), 6: (48.8492, 2.3337), 7: (48.8583, 2.3121), 8: (48.8744, 2.3117),
    9: (48.8763, 2.3380), 10: (48.8760, 2.3616), 11: (48.8596, 2.3794), 12: (48.8391, 2.3896),
    13: (48.8311, 2.3592), 14: (48.8339, 2.3265), 15: (48.8418, 2.2988), 16: (48.8600, 2.2690),
    17: (48.8867, 2.3102), 18: (48.8922, 2.3447), 19: (48.8840, 2.3820), 20: (48.8639, 2.3985),
}


# =============================================================================
# Patterns regex pour extraction d'adresses
# =============================================================================

# Patterns typiques dans les noms de projets parisiens
ADDRESS_PATTERNS = [
    # Format standard: "123 rue/avenue/boulevard etc"
    r'(\d{1,4}(?:\s?(?:bis|ter))?)\s+(rue|avenue|av|bd|boulevard|place|passage|impasse|quai|allée|square|villa|cité|chemin)\s+([A-Za-zÀ-ÿ\'\-\s]+?)(?:\s*\(|\s*-|\s*,|$)',
    # Format avec slash: "12/14 rue du X"
    r'(\d{1,4}/\d{1,4})\s+(rue|avenue|av|bd|boulevard|place)\s+([A-Za-zÀ-ÿ\'\-\s]+?)(?:\s*\(|\s*-|\s*,|$)',
    # Format sans numéro: "rue de X" (moins précis)
    r'\b(rue|avenue|av|bd|boulevard|place|passage|quai)\s+(d[eu]\s+|du\s+|de\s+la\s+|des\s+)?([A-Za-zÀ-ÿ\'\-\s]+?)(?:\s*\(|\s*-|\s*,|$)',
]

# Patterns pour lieux connus (piscines, gymnases, etc.)
PLACE_PATTERNS = [
    r'(piscine|gymnase|stade|école|college|lycée|crèche|mairie|bibliothèque|médiathèque)\s+([A-Za-zÀ-ÿ\'\-\s]+?)(?:\s*\(|\s*-|\s*,|$)',
    r'(centre sportif|centre d\'animation|maison de la culture)\s+([A-Za-zÀ-ÿ\'\-\s]+?)(?:\s*\(|\s*-|\s*,|$)',
]

# Patterns arrondissement dans le texte
ARROND_PATTERNS = [
    r'\((\d{1,2})(?:e|ème|er|eme|E|EME)\)',  # (12e), (12ème), (1er)
    r'\b(\d{1,2})(?:e|ème|er|eme)\s*arr',      # 12ème arr
    r'\b75(\d{3})\b',                            # 75012
]


# =============================================================================
# Chargement des données de référence
# =============================================================================

def load_lieux_connus() -> dict:
    """Charge les lieux connus depuis le CSV."""
    import csv
    lieux = {}
    if LIEUX_FILE.exists():
        with open(LIEUX_FILE, encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                patterns = row['pattern_match'].upper().split('|')
                for pattern in patterns:
                    lieux[pattern.strip()] = {
                        'lat': float(row['latitude']) if row['latitude'] else None,
                        'lon': float(row['longitude']) if row['longitude'] else None,
                        'adresse': row.get('adresse', ''),
                        'arrondissement': int(row['arrondissement']) if row.get('arrondissement') else None,
                    }
    print(f"  ✓ Chargé {len(lieux)} patterns de lieux connus")
    return lieux


def load_geo_cache() -> dict:
    """Charge le cache de géocodage pour éviter les appels API répétés."""
    if GEO_CACHE_FILE.exists():
        with open(GEO_CACHE_FILE, encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_geo_cache(cache: dict):
    """Sauvegarde le cache de géocodage."""
    with open(GEO_CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


# =============================================================================
# Extraction d'informations depuis le nom du projet
# =============================================================================

def extract_arrondissement(text: str) -> int | None:
    """Extrait l'arrondissement depuis le texte."""
    for pattern in ARROND_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            arr = int(match.group(1))
            # Valider que c'est un arrondissement parisien
            if pattern.startswith(r'\b75'):  # Format code postal
                arr = int(str(arr)[-2:])  # 75012 → 12
            if 1 <= arr <= 20:
                return arr
    return None


def extract_address(text: str) -> tuple[str | None, str | None]:
    """
    Extrait une adresse depuis le nom du projet.
    
    Returns:
        (adresse, type): adresse extraite et type ('numero' ou 'rue')
    """
    # Essayer les patterns avec numéro d'abord
    for pattern in ADDRESS_PATTERNS[:2]:  # Patterns avec numéro
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            numero = match.group(1)
            type_voie = match.group(2)
            nom_voie = match.group(3).strip()
            # Nettoyer le nom de voie
            nom_voie = re.sub(r'\s+', ' ', nom_voie).strip()
            if len(nom_voie) > 2:
                return f"{numero} {type_voie} {nom_voie}", 'numero'
    
    # Essayer le pattern sans numéro (moins précis)
    for pattern in ADDRESS_PATTERNS[2:]:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            type_voie = match.group(1)
            prep = match.group(2) or ''
            nom_voie = match.group(3).strip()
            nom_voie = re.sub(r'\s+', ' ', nom_voie).strip()
            if len(nom_voie) > 2:
                return f"{type_voie} {prep}{nom_voie}", 'rue'
    
    return None, None


def extract_place_name(text: str) -> str | None:
    """Extrait un nom de lieu (piscine, gymnase, etc.)."""
    for pattern in PLACE_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            type_lieu = match.group(1)
            nom_lieu = match.group(2).strip()
            nom_lieu = re.sub(r'\s+', ' ', nom_lieu).strip()
            if len(nom_lieu) > 2:
                return f"{type_lieu} {nom_lieu}"
    return None


def match_lieu_connu(text: str, lieux: dict) -> dict | None:
    """Cherche si le texte contient un lieu connu."""
    text_upper = text.upper()
    
    # Match exact
    for pattern, data in lieux.items():
        if pattern in text_upper and data.get('lat'):
            return {**data, 'pattern': pattern}
    
    return None


# =============================================================================
# API de géocodage
# =============================================================================

def geocode_api(query: str, arrondissement: int | None, geo_cache: dict) -> dict | None:
    """
    Géocode via l'API BAN avec mise en cache.
    
    Returns:
        dict avec lat, lon, score, label ou None
    """
    # Construire la clé de cache
    cache_key = f"{query}|{arrondissement or 0}"
    
    if cache_key in geo_cache:
        return geo_cache[cache_key]
    
    # Préparer la requête
    full_query = query.strip()
    if arrondissement and arrondissement > 0:
        cp = f"750{arrondissement:02d}" if arrondissement > 4 else "75001"
        full_query = f"{full_query}, {cp} Paris"
    else:
        full_query = f"{full_query}, Paris"
    
    time.sleep(DELAY_BETWEEN_CALLS)
    
    try:
        # Premier essai avec type=housenumber
        response = requests.get(
            API_URL,
            params={'q': full_query, 'limit': 1, 'type': 'housenumber'},
            timeout=5
        )
        response.raise_for_status()
        data = response.json()
        
        if data.get('features'):
            feature = data['features'][0]
            coords = feature['geometry']['coordinates']
            props = feature['properties']
            
            # Vérifier que c'est à Paris
            postcode = props.get('postcode', '')
            if postcode.startswith('75'):
                result = {
                    'lat': round(coords[1], 6),
                    'lon': round(coords[0], 6),
                    'score': props.get('score', 0),
                    'label': props.get('label', ''),
                }
                geo_cache[cache_key] = result
                return result
        
        # Deuxième essai sans type
        response = requests.get(
            API_URL,
            params={'q': full_query, 'limit': 1},
            timeout=5
        )
        response.raise_for_status()
        data = response.json()
        
        if data.get('features'):
            feature = data['features'][0]
            coords = feature['geometry']['coordinates']
            props = feature['properties']
            postcode = props.get('postcode', '')
            
            if postcode.startswith('75'):
                result = {
                    'lat': round(coords[1], 6),
                    'lon': round(coords[0], 6),
                    'score': props.get('score', 0),
                    'label': props.get('label', ''),
                }
                geo_cache[cache_key] = result
                return result
        
        # Rien trouvé
        geo_cache[cache_key] = None
        return None
        
    except Exception as e:
        print(f"    ⚠️ Erreur API: {e}")
        return None


# =============================================================================
# Géocodage principal
# =============================================================================

def geocode_project(project: dict, lieux: dict, geo_cache: dict) -> dict:
    """
    Géocode un projet et ajoute les coordonnées.
    
    Modifie le projet en place et retourne le type de géocodage utilisé.
    """
    nom = project.get('nom_projet', '')
    arr_existant = project.get('arrondissement', 0)
    
    # Extraire l'arrondissement si pas déjà présent
    arr = arr_existant if arr_existant and arr_existant > 0 else extract_arrondissement(nom)
    if arr:
        project['arrondissement'] = arr
    
    # 1. LIEUX CONNUS - priorité maximale
    lieu_match = match_lieu_connu(nom, lieux)
    if lieu_match and lieu_match.get('lat'):
        project['lat'] = lieu_match['lat']
        project['lon'] = lieu_match['lon']
        project['geo_source'] = 'lieu_connu'
        project['geo_score'] = 1.0
        project['geo_label'] = lieu_match.get('adresse', '')
        if not project.get('arrondissement') and lieu_match.get('arrondissement'):
            project['arrondissement'] = lieu_match['arrondissement']
        return 'lieu_connu'
    
    # 2. ADRESSE EXTRAITE
    adresse, addr_type = extract_address(nom)
    if adresse:
        result = geocode_api(adresse, arr, geo_cache)
        if result and result.get('score', 0) > 0.4:
            project['lat'] = result['lat']
            project['lon'] = result['lon']
            project['geo_source'] = f"api_{addr_type}"
            project['geo_score'] = result['score']
            project['geo_label'] = result['label']
            return f'api_{addr_type}'
    
    # 3. NOM DE LIEU
    place = extract_place_name(nom)
    if place:
        result = geocode_api(place, arr, geo_cache)
        if result and result.get('score', 0) > 0.3:
            project['lat'] = result['lat']
            project['lon'] = result['lon']
            project['geo_source'] = 'api_lieu'
            project['geo_score'] = result['score']
            project['geo_label'] = result['label']
            return 'api_lieu'
    
    # 4. CENTROÏDE ARRONDISSEMENT (fallback)
    if arr and arr in CENTROIDS:
        lat, lon = CENTROIDS[arr]
        project['lat'] = lat
        project['lon'] = lon
        project['geo_source'] = 'centroid'
        project['geo_score'] = 0.1
        project['geo_label'] = f"Arrondissement {arr}"
        return 'centroid'
    
    # 5. AUCUNE GÉOLOCALISATION
    project['geo_source'] = 'none'
    project['geo_score'] = 0
    return 'none'


def geocode_year(year: int, lieux: dict, geo_cache: dict) -> dict:
    """
    Géocode tous les projets d'une année.
    
    Returns:
        dict avec les statistiques
    """
    print(f"\n{'='*60}")
    print(f"📍 Géocodage {year}")
    print(f"{'='*60}")
    
    # Charger les données
    input_path = DATA_DIR / f'investissements_complet_{year}.json'
    if not input_path.exists():
        print(f"  ⚠️ Fichier non trouvé: {input_path}")
        return {'year': year, 'status': 'NOT_FOUND'}
    
    with open(input_path, encoding='utf-8') as f:
        data = json.load(f)
    
    projects = data.get('data', [])
    print(f"  📊 {len(projects)} projets à géocoder")
    
    # Stats
    stats = {
        'total': len(projects),
        'lieu_connu': 0,
        'api_numero': 0,
        'api_rue': 0,
        'api_lieu': 0,
        'centroid': 0,
        'none': 0,
    }
    
    # Géocoder chaque projet
    for i, project in enumerate(projects):
        nom = project.get('nom_projet', '')[:50]
        result = geocode_project(project, lieux, geo_cache)
        stats[result] = stats.get(result, 0) + 1
        
        # Log chaque projet avec son résultat
        emoji = {
            'lieu_connu': '🏛️',
            'api_numero': '📍',
            'api_rue': '🛣️',
            'api_lieu': '🏢',
            'centroid': '⭕',
            'none': '❌',
        }.get(result, '?')
        
        score = project.get('geo_score', 0)
        label = project.get('geo_label', '')[:30] if project.get('geo_label') else ''
        
        print(f"  [{i+1:4}/{len(projects)}] {emoji} {result:12} | {score:.2f} | {nom}...")
        if label:
            print(f"           → {label}")
    
    # Résumé
    geo_rate = 100 * (1 - stats['none'] / stats['total']) if stats['total'] > 0 else 0
    precise_rate = 100 * (stats['lieu_connu'] + stats['api_numero']) / stats['total'] if stats['total'] > 0 else 0
    
    print(f"\n  📊 Résultats:")
    print(f"     Lieux connus:     {stats['lieu_connu']:4} ({100*stats['lieu_connu']/stats['total']:5.1f}%)")
    print(f"     API (numéro):     {stats['api_numero']:4} ({100*stats['api_numero']/stats['total']:5.1f}%)")
    print(f"     API (rue):        {stats['api_rue']:4} ({100*stats['api_rue']/stats['total']:5.1f}%)")
    print(f"     API (lieu):       {stats['api_lieu']:4} ({100*stats['api_lieu']/stats['total']:5.1f}%)")
    print(f"     Centroïde arr.:   {stats['centroid']:4} ({100*stats['centroid']/stats['total']:5.1f}%)")
    print(f"     Non géolocalisé:  {stats['none']:4} ({100*stats['none']/stats['total']:5.1f}%)")
    print(f"\n  ✅ Taux de géoloc: {geo_rate:.1f}% | Précision haute: {precise_rate:.1f}%")
    
    # Mettre à jour les stats
    data['stats']['geo_rate'] = round(geo_rate, 1)
    data['stats']['precise_geo_rate'] = round(precise_rate, 1)
    data['stats']['geo_breakdown'] = {
        'lieu_connu': stats['lieu_connu'],
        'api_numero': stats['api_numero'],
        'api_rue': stats['api_rue'],
        'api_lieu': stats['api_lieu'],
        'centroid': stats['centroid'],
        'none': stats['none'],
    }
    data['geocoded_at'] = datetime.now().isoformat()
    
    # Sauvegarder
    with open(input_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"  ✓ Sauvegardé: {input_path}")
    
    return {'year': year, 'status': 'OK', **stats}


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Géocodage des investissements",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument('--year', type=int, help="Année spécifique")
    parser.add_argument('--all', action='store_true', help="Toutes les années")
    
    args = parser.parse_args()
    
    print("\n" + "="*60)
    print("📍 Géocodage des Investissements")
    print("="*60)
    
    # Charger les données de référence
    lieux = load_lieux_connus()
    geo_cache = load_geo_cache()
    print(f"  ✓ Cache géo: {len(geo_cache)} entrées")
    
    # Déterminer les années
    if args.year:
        years = [args.year]
    elif args.all:
        years = []
        for f in DATA_DIR.glob('investissements_complet_*.json'):
            if 'index' not in f.name:
                match = re.search(r'(\d{4})', f.name)
                if match:
                    years.append(int(match.group(1)))
        years = sorted(years)
    else:
        print("❌ Spécifiez --year YYYY ou --all")
        return
    
    print(f"Années à traiter: {years}")
    
    # Géocoder
    results = []
    for year in years:
        result = geocode_year(year, lieux, geo_cache)
        results.append(result)
        # Sauvegarder le cache régulièrement
        save_geo_cache(geo_cache)
    
    # Sauvegarder le cache final
    save_geo_cache(geo_cache)
    print(f"\n✓ Cache géo sauvegardé: {len(geo_cache)} entrées")
    
    # Résumé final
    print("\n" + "="*60)
    print("📊 RÉSUMÉ FINAL")
    print("="*60)
    
    total = sum(r.get('total', 0) for r in results if r.get('status') == 'OK')
    precise = sum(r.get('lieu_connu', 0) + r.get('api_numero', 0) for r in results if r.get('status') == 'OK')
    non_geo = sum(r.get('none', 0) for r in results if r.get('status') == 'OK')
    
    print(f"  Total projets:        {total}")
    print(f"  Géoloc précise:       {precise} ({100*precise/total:.1f}%)")
    print(f"  Non géolocalisables:  {non_geo} ({100*non_geo/total:.1f}%)")
    print("\n✅ Géocodage terminé!")


if __name__ == "__main__":
    main()
