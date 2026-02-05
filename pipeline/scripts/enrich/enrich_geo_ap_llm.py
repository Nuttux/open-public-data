#!/usr/bin/env python3
"""
Géolocalisation des projets AP via LLM (Gemini).
Version optimisée avec batching (20 records/requête) et Pareto (top 500).

Prérequis:
    export GOOGLE_API_KEY=<votre_clé_gemini>

Usage:
    python scripts/enrich_geo_ap_llm.py [--limit N] [--dry-run]
"""

import csv
import time
import os
import argparse
import json
from pathlib import Path
from datetime import datetime
from google.cloud import bigquery
import requests

# =============================================================================
# Configuration
# =============================================================================

PROJECT_ID = "open-data-france-484717"
DATASET = "dbt_paris_analytics"
SEED_PATH = Path(__file__).parent.parent / "paris-public-open-data" / "seeds" / "seed_cache_geo_ap.csv"

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

# Batching config
BATCH_SIZE = 10  # Réduit pour éviter troncature JSON
PARETO_LIMIT = 500  # Top 500 par montant

PROGRESS_INTERVAL = 10

# Prompt système pour batch
SYSTEM_PROMPT = """Tu es un expert en géographie parisienne. Analyse ces descriptions de projets d'investissement municipaux et extrais les informations de localisation pour chacun.

RÈGLES:
1. L'arrondissement doit être un entier entre 1 et 20
2. Ne devine PAS - si l'information n'est pas claire, renvoie null
3. Cherche des indices: noms de rues, places, équipements connus

EXEMPLES DE PATTERNS:
- "GYMNASE JAPY" → arr: 11
- "ECOLE 18 RUE BOULARD" → arr: 14
- "PISCINE ASPIRANT DUNAND" → arr: 14
- "VOIRIE 15EME" → arr: 15

Réponds UNIQUEMENT en JSON valide avec ce format (un objet par projet):
[
  {"ap_code": "...", "arrondissement": <int 1-20 ou null>, "adresse": "<ou null>", "nom_lieu": "<ou null>", "confiance": <0-1>},
  ...
]"""


# =============================================================================
# Fonctions utilitaires
# =============================================================================

def load_existing_cache() -> dict:
    """Charge le cache existant."""
    cache = {}
    if SEED_PATH.exists():
        with open(SEED_PATH, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                ap_code = row.get('ap_code', '')
                if ap_code:
                    cache[ap_code] = {
                        'arrondissement': row.get('ode_arrondissement', ''),
                        'adresse': row.get('ode_adresse', ''),
                        'nom_lieu': row.get('ode_nom_lieu', ''),
                        'latitude': row.get('ode_latitude', ''),
                        'longitude': row.get('ode_longitude', ''),
                        'confiance': row.get('ode_confiance', ''),
                        'date_recherche': row.get('ode_date_recherche', ''),
                        'source': row.get('ode_source', '')
                    }
    return cache


def save_cache(cache: dict):
    """Sauvegarde le cache dans le CSV."""
    fieldnames = [
        'ap_code',
        'ode_arrondissement',
        'ode_adresse',
        'ode_nom_lieu',
        'ode_latitude',
        'ode_longitude',
        'ode_confiance',
        'ode_date_recherche',
        'ode_source'
    ]
    
    with open(SEED_PATH, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for ap_code, data in sorted(cache.items()):
            writer.writerow({
                'ap_code': ap_code,
                'ode_arrondissement': data.get('arrondissement', ''),
                'ode_adresse': data.get('adresse', ''),
                'ode_nom_lieu': data.get('nom_lieu', ''),
                'ode_latitude': data.get('latitude', ''),
                'ode_longitude': data.get('longitude', ''),
                'ode_confiance': data.get('confiance', ''),
                'ode_date_recherche': data.get('date_recherche', ''),
                'ode_source': data.get('source', '')
            })


def call_gemini_batch(projects: list) -> list:
    """
    Appelle Gemini avec un batch de projets.
    Returns liste de résultats ou liste vide si erreur.
    """
    if not GEMINI_API_KEY:
        raise ValueError("GOOGLE_API_KEY non défini")
    
    # Construire le prompt
    projects_text = "\n".join([
        f"- AP_CODE: {p['ap_code']}, DESCRIPTION: {p['ap_texte'][:200]}"
        for p in projects
    ])
    
    try:
        payload = {
            "contents": [{
                "parts": [{
                    "text": f"{SYSTEM_PROMPT}\n\nProjets à analyser:\n{projects_text}"
                }]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 8192
            }
        }
        
        response = requests.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json=payload,
            timeout=60
        )
        
        if response.status_code == 429:
            print("    [RATE LIMIT] Attente 30s...", flush=True)
            time.sleep(30)
            response = requests.post(
                f"{GEMINI_URL}?key={GEMINI_API_KEY}",
                json=payload,
                timeout=60
            )
            if response.status_code == 429:
                print("    [RATE LIMIT] Attente 60s...", flush=True)
                time.sleep(60)
                response = requests.post(
                    f"{GEMINI_URL}?key={GEMINI_API_KEY}",
                    json=payload,
                    timeout=60
                )
        
        if response.status_code != 200:
            print(f"    [ERREUR API] Status {response.status_code}", flush=True)
            return []
        
        data = response.json()
        candidates = data.get('candidates', [])
        if not candidates:
            print(f"    [DEBUG] Pas de candidates", flush=True)
            return []
        
        text = candidates[0].get('content', {}).get('parts', [{}])[0].get('text', '')
        print(f"    [DEBUG] Réponse: {len(text)} chars", flush=True)
        
        # Parser le JSON
        if '```json' in text:
            text = text.split('```json')[1].split('```')[0]
        elif '```' in text:
            text = text.split('```')[1].split('```')[0]
        
        results = json.loads(text.strip())
        
        # Valider les arrondissements
        for r in results:
            arr = r.get('arrondissement')
            if arr is not None:
                try:
                    if not (1 <= int(arr) <= 20):
                        r['arrondissement'] = None
                except:
                    r['arrondissement'] = None
        
        return results
        
    except json.JSONDecodeError as e:
        # Essayer de réparer le JSON tronqué
        try:
            import re
            matches = list(re.finditer(r'\{[^{}]+\}', text))
            if matches:
                fixed = '[' + ','.join(m.group() for m in matches) + ']'
                results = json.loads(fixed)
                print(f"    [RÉPARÉ] Récupéré {len(results)} résultats", flush=True)
                return results
        except:
            pass
        print(f"    [ERREUR JSON] {e}", flush=True)
        return []
    except Exception as e:
        print(f"    [ERREUR] {e}", flush=True)
        return []


def get_ap_to_geolocate(client: bigquery.Client, existing_cache: dict, limit: int = None) -> list:
    """Récupère les AP non localisés, top N par montant (Pareto)."""
    actual_limit = limit or PARETO_LIMIT
    
    query = f"""
    SELECT ap_code, ap_texte, SUM(montant) as montant_total
    FROM `{PROJECT_ID}.{DATASET}.core_ap_projets`
    WHERE ode_source_geo IS NULL
      AND ap_code IS NOT NULL
      AND ap_texte IS NOT NULL
    GROUP BY ap_code, ap_texte
    ORDER BY montant_total DESC
    LIMIT {actual_limit * 2}
    """
    
    results = client.query(query).result()
    
    to_process = []
    for row in results:
        if row.ap_code not in existing_cache:
            to_process.append({
                'ap_code': row.ap_code,
                'ap_texte': row.ap_texte,
                'montant': row.montant_total
            })
            if len(to_process) >= actual_limit:
                break
    
    return to_process


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Géoloc AP via LLM (batch)")
    parser.add_argument('--limit', type=int, help=f"Nombre max d'AP (default: {PARETO_LIMIT})")
    parser.add_argument('--dry-run', action='store_true', help="Simulation")
    args = parser.parse_args()
    
    print("=" * 60)
    print("GÉOLOCALISATION AP - LLM Batch (20/req)")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print()
    
    if not GEMINI_API_KEY and not args.dry_run:
        print("ERREUR: Variable GOOGLE_API_KEY non définie")
        return
    
    cache = load_existing_cache()
    print(f"Cache existant: {len(cache)} AP")
    
    client = bigquery.Client(project=PROJECT_ID)
    to_process = get_ap_to_geolocate(client, cache, args.limit)
    
    total_montant = sum(p['montant'] for p in to_process)
    print(f"AP à traiter: {len(to_process)} (top par montant)")
    print(f"Montant couvert: {total_montant/1e6:.1f}M€")
    print(f"Batches de {BATCH_SIZE}: {(len(to_process) + BATCH_SIZE - 1) // BATCH_SIZE}")
    print()
    
    if not to_process:
        print("Rien à traiter!")
        return
    
    if args.dry_run:
        print("[DRY-RUN]")
        for p in to_process[:3]:
            print(f"  {p['ap_code']}: {p['ap_texte'][:60]}...")
        return
    
    # Traitement par batches
    found = 0
    not_found = 0
    errors = 0
    start_time = time.time()
    last_progress = start_time
    
    print("Démarrage...")
    print("-" * 40)
    
    for i in range(0, len(to_process), BATCH_SIZE):
        batch = to_process[i:i+BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        total_batches = (len(to_process) + BATCH_SIZE - 1) // BATCH_SIZE
        
        print(f"  [Batch {batch_num}/{total_batches}] Appel API...", flush=True)
        batch_results = call_gemini_batch(batch)
        
        # Mapper les résultats
        results_map = {r.get('ap_code'): r for r in batch_results if r.get('ap_code')}
        
        for proj in batch:
            result = results_map.get(proj['ap_code'])
            
            if result and result.get('arrondissement'):
                cache[proj['ap_code']] = {
                    'arrondissement': str(result['arrondissement']),
                    'adresse': result.get('adresse') or '',
                    'nom_lieu': result.get('nom_lieu') or '',
                    'latitude': '',
                    'longitude': '',
                    'confiance': str(result.get('confiance', 0.5)),
                    'date_recherche': datetime.now().strftime('%Y-%m-%d'),
                    'source': 'llm_gemini'
                }
                found += 1
            elif result:
                cache[proj['ap_code']] = {
                    'arrondissement': '',
                    'adresse': '',
                    'nom_lieu': '',
                    'latitude': '',
                    'longitude': '',
                    'confiance': '0',
                    'date_recherche': datetime.now().strftime('%Y-%m-%d'),
                    'source': 'llm_not_found'
                }
                not_found += 1
            else:
                errors += 1
        
        # Log immédiat du résultat du batch
        batch_found = len([r for r in batch_results if r.get('arrondissement')])
        print(f"    → {batch_found}/{len(batch)} localisés | Total: {found} trouvés, {not_found} non trouvés", flush=True)
        
        save_cache(cache)
        time.sleep(1)  # Rate limiting - Gemini paid tier
    
    elapsed = time.time() - start_time
    print("-" * 40)
    print(f"\nTerminé en {elapsed:.1f}s ({elapsed/60:.1f}min)")
    print(f"  Localisés: {found} ({100*found/len(to_process):.1f}%)")
    print(f"  Non trouvés: {not_found}")
    print(f"  Erreurs batch: {errors}")
    print(f"\nCache total: {len(cache)} AP")


if __name__ == "__main__":
    main()
