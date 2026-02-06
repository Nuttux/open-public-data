#!/usr/bin/env python3
"""
Extraction d'adresses par LLM pour les projets non géocodés.

Ce script utilise Gemini pour extraire les adresses des projets qui ont
clairement une adresse dans leur nom mais que le regex n'a pas capturée.

Exemples de cas récupérables:
- "École maternelle 6 rue Littré" → "6 rue Littré"
- "CC Garancière - Travaux" → "rue Garancière" (si arrondissement connu)
- "Gymnase Japy - Rénovation" → "Gymnase Japy" (lieu connu)

PRINCIPE ANTI-HALLUCINATION:
- Le LLM doit retourner un score de confiance
- On ne garde que les extractions avec confiance >= 0.85
- On vérifie ensuite via l'API BAN que l'adresse existe vraiment
- Double validation = pas d'hallucination

Usage:
    python llm_extract_addresses.py --year 2022
    python llm_extract_addresses.py --all --dry-run
"""

import argparse
import json
import os
import re
import time
from datetime import datetime
from pathlib import Path

import google.generativeai as genai
import requests

# =============================================================================
# Configuration
# =============================================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = PROJECT_ROOT / "website" / "public" / "data" / "map"

# Seuil de confiance minimum pour accepter une extraction LLM
MIN_CONFIDENCE = 0.85

# API
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
BAN_API_URL = "https://api-adresse.data.gouv.fr/search"

# Rate limiting
DELAY_BETWEEN_LLM = 0.5  # 500ms entre appels LLM
DELAY_BETWEEN_BAN = 0.1  # 100ms entre appels BAN


# =============================================================================
# Prompt LLM
# =============================================================================

EXTRACTION_PROMPT_TEMPLATE = """Tu es un expert en adresses parisiennes. Extrait l'adresse de ce nom de projet municipal.

RÈGLES STRICTES:
1. Extrais UNIQUEMENT si tu vois clairement une adresse ou un lieu identifiable
2. Si le texte est trop vague ou générique, réponds avec adresse null
3. Donne un score de confiance entre 0 et 1

EXEMPLES:
- "École maternelle 6 rue Littré - Travaux" => adresse: "6 rue Littré", confidence: 0.95
- "CC 34 avenue Jean Jaurès - Rénovation" => adresse: "34 avenue Jean Jaurès", confidence: 0.95
- "Gymnase Japy - Réfection" => adresse: "Gymnase Japy", confidence: 0.90
- "Piscine de la Butte aux Cailles" => adresse: "Piscine de la Butte aux Cailles", confidence: 0.95
- "Square René Le Gall - Travaux" => adresse: "Square René Le Gall", confidence: 0.90
- "Travaux de rénovation divers" => adresse: null, confidence: 0
- "Budget Participatif" => adresse: null, confidence: 0
- "Embellir votre quartier" => adresse: null, confidence: 0
- "Plan climat" => adresse: null, confidence: 0

PROJET: "__PROJECT__"
ARRONDISSEMENT: __ARR__

Réponds UNIQUEMENT avec un JSON valide (format: {"adresse": "...", "confidence": 0.X}), sans markdown:
"""


# =============================================================================
# LLM Extraction
# =============================================================================

def init_gemini():
    """Initialise le client Gemini."""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY non définie")
    genai.configure(api_key=GEMINI_API_KEY)
    return genai.GenerativeModel('gemini-2.0-flash')


def extract_address_llm(model, project_name: str, arrondissement: int | None) -> dict | None:
    """
    Extrait une adresse depuis le nom du projet via LLM.
    
    Returns:
        dict avec 'adresse' et 'confidence', ou None si échec
    """
    prompt = EXTRACTION_PROMPT_TEMPLATE.replace(
        "__PROJECT__", project_name
    ).replace(
        "__ARR__", str(arrondissement) if arrondissement else "inconnu"
    )
    
    try:
        print(f"    📡 Appel LLM...", end="", flush=True)
        response = model.generate_content(prompt)
        print(f" reçu!", flush=True)
        text = response.text.strip()
        
        # Parser le JSON
        # Enlever les backticks markdown si présents
        text = re.sub(r'^```json\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        
        print(f"    📝 Réponse: {text[:80]}", flush=True)
        
        result = json.loads(text)
        
        if result.get('adresse') and result.get('confidence', 0) >= MIN_CONFIDENCE:
            return {
                'adresse': result['adresse'],
                'confidence': result['confidence']
            }
        
        return None
        
    except Exception as e:
        print(f"\n    ⚠️ Erreur LLM: {e}", flush=True)
        return None


# =============================================================================
# Validation API BAN
# =============================================================================

def validate_address_ban(adresse: str, arrondissement: int | None) -> dict | None:
    """
    Valide une adresse via l'API BAN et retourne les coordonnées.
    
    Returns:
        dict avec lat, lon, score, label ou None si non trouvé
    """
    # Construire la requête
    query = adresse.strip()
    if arrondissement and arrondissement > 0:
        cp = f"750{arrondissement:02d}" if arrondissement > 4 else "75001"
        query = f"{query}, {cp} Paris"
    else:
        query = f"{query}, Paris"
    
    try:
        response = requests.get(
            BAN_API_URL,
            params={'q': query, 'limit': 1},
            timeout=5
        )
        response.raise_for_status()
        data = response.json()
        
        if data.get('features'):
            feature = data['features'][0]
            coords = feature['geometry']['coordinates']
            props = feature['properties']
            postcode = props.get('postcode', '')
            
            # Vérifier que c'est à Paris
            if postcode.startswith('75') and props.get('score', 0) > 0.4:
                return {
                    'lat': round(coords[1], 6),
                    'lon': round(coords[0], 6),
                    'score': props['score'],
                    'label': props.get('label', '')
                }
        
        return None
        
    except Exception as e:
        print(f"    ⚠️ Erreur API BAN: {e}")
        return None


# =============================================================================
# Processing
# =============================================================================

def process_year(year: int, model, dry_run: bool = False) -> dict:
    """
    Traite les projets non géocodés d'une année.
    
    Returns:
        dict avec statistiques
    """
    print(f"\n{'='*60}")
    print(f"🤖 Extraction LLM {year}")
    print(f"{'='*60}")
    
    # Charger les données
    path = DATA_DIR / f'investissements_complet_{year}.json'
    if not path.exists():
        print(f"  ⚠️ Fichier non trouvé: {path}")
        return {'year': year, 'status': 'NOT_FOUND'}
    
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    
    projects = data.get('data', [])
    
    # Filtrer les projets avec centroïde ou non géocodés
    candidates = [
        (i, p) for i, p in enumerate(projects)
        if p.get('geo_source') in ('centroid', 'none')
    ]
    
    print(f"  📊 {len(candidates)} projets candidats (centroid/none)")
    
    # Stats
    stats = {
        'total_candidates': len(candidates),
        'llm_extracted': 0,
        'llm_low_confidence': 0,
        'ban_validated': 0,
        'ban_failed': 0,
    }
    
    updated = []
    
    import sys
    
    for idx, (i, project) in enumerate(candidates):
        nom = project.get('nom_projet', '')
        arr = project.get('arrondissement')
        
        print(f"\n  [{idx+1}/{len(candidates)}] {nom[:50]}...", flush=True)
        
        # 1. Extraction LLM
        time.sleep(DELAY_BETWEEN_LLM)
        extraction = extract_address_llm(model, nom, arr)
        
        if not extraction:
            stats['llm_low_confidence'] += 1
            print(f"    ❌ LLM: pas d'adresse confiante", flush=True)
            continue
        
        stats['llm_extracted'] += 1
        print(f"    🤖 LLM: '{extraction['adresse']}' (conf={extraction['confidence']:.2f})", flush=True)
        
        # 2. Validation API BAN
        time.sleep(DELAY_BETWEEN_BAN)
        validation = validate_address_ban(extraction['adresse'], arr)
        
        if not validation:
            stats['ban_failed'] += 1
            print(f"    ❌ BAN: adresse non trouvée", flush=True)
            continue
        
        stats['ban_validated'] += 1
        print(f"    ✅ BAN: {validation['label']} (score={validation['score']:.2f})", flush=True)
        
        # 3. Mettre à jour le projet
        if not dry_run:
            projects[i]['lat'] = validation['lat']
            projects[i]['lon'] = validation['lon']
            projects[i]['geo_source'] = 'llm_ban'
            projects[i]['geo_score'] = min(extraction['confidence'], validation['score'])
            projects[i]['geo_label'] = validation['label']
            projects[i]['llm_extracted_address'] = extraction['adresse']
        
        updated.append({
            'nom': nom[:50],
            'adresse_extraite': extraction['adresse'],
            'adresse_validee': validation['label'],
            'confidence': extraction['confidence'],
            'ban_score': validation['score']
        })
    
    # Résumé
    print(f"\n  📊 Résultats:")
    print(f"     Candidats:        {stats['total_candidates']}")
    print(f"     LLM extraits:     {stats['llm_extracted']} ({100*stats['llm_extracted']/stats['total_candidates']:.1f}%)")
    print(f"     BAN validés:      {stats['ban_validated']} ({100*stats['ban_validated']/stats['total_candidates']:.1f}%)")
    print(f"     LLM low conf:     {stats['llm_low_confidence']}")
    print(f"     BAN failed:       {stats['ban_failed']}")
    
    # Sauvegarder
    if not dry_run and stats['ban_validated'] > 0:
        # Recalculer les stats
        geo_sources = {}
        for p in projects:
            src = p.get('geo_source', 'none')
            geo_sources[src] = geo_sources.get(src, 0) + 1
        
        data['stats']['geo_breakdown'] = geo_sources
        data['stats']['llm_enriched'] = stats['ban_validated']
        data['llm_enriched_at'] = datetime.now().isoformat()
        
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"\n  ✓ Sauvegardé: {path}")
    
    return {
        'year': year,
        'status': 'OK',
        **stats,
        'updated': updated
    }


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Extraction d'adresses par LLM",
    )
    parser.add_argument('--year', type=int, help="Année spécifique")
    parser.add_argument('--all', action='store_true', help="Toutes les années")
    parser.add_argument('--dry-run', action='store_true', help="Ne pas sauvegarder")
    
    args = parser.parse_args()
    
    print("\n" + "="*60)
    print("🤖 Extraction d'Adresses par LLM (Gemini)")
    print("="*60)
    print(f"  Seuil de confiance: {MIN_CONFIDENCE}")
    print(f"  Double validation: LLM + API BAN")
    
    # Init LLM
    model = init_gemini()
    print("  ✓ Gemini initialisé")
    
    # Déterminer les années
    if args.year:
        years = [args.year]
    elif args.all:
        years = [2022, 2023, 2024]  # Années avec données PDF
    else:
        print("❌ Spécifiez --year YYYY ou --all")
        return
    
    # Traiter
    results = []
    for year in years:
        result = process_year(year, model, dry_run=args.dry_run)
        results.append(result)
    
    # Résumé final
    print("\n" + "="*60)
    print("📊 RÉSUMÉ FINAL")
    print("="*60)
    
    total_validated = sum(r.get('ban_validated', 0) for r in results if r.get('status') == 'OK')
    total_candidates = sum(r.get('total_candidates', 0) for r in results if r.get('status') == 'OK')
    
    print(f"  Candidats traités:  {total_candidates}")
    print(f"  Adresses validées:  {total_validated} ({100*total_validated/total_candidates:.1f}%)")
    
    if not args.dry_run:
        print("\n✅ Enrichissement LLM terminé!")
    else:
        print("\n⚠️ Mode dry-run, aucune modification sauvegardée")


if __name__ == "__main__":
    main()
