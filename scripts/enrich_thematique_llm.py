#!/usr/bin/env python3
"""
Classification thématique des bénéficiaires via LLM (Gemini).
Version optimisée avec batching (20 records/requête) et Pareto (top 500).

Prérequis:
    export GOOGLE_API_KEY=<votre_clé_gemini>

Usage:
    python scripts/enrich_thematique_llm.py [--limit N] [--dry-run]
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
SEED_PATH = Path(__file__).parent.parent / "paris-public-open-data" / "seeds" / "seed_cache_thematique_beneficiaires.csv"

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

BATCH_SIZE = 10  # Réduit pour éviter troncature JSON
PARETO_LIMIT = 500

PROGRESS_INTERVAL = 10

THEMATIQUES = [
    "Social", "Éducation", "Culture & Sport", "Environnement",
    "Transport", "Économie", "Administration", "Santé",
    "Logement", "Sécurité", "International", "Autre"
]

SYSTEM_PROMPT = f"""Tu es un expert en classification des acteurs associatifs et des politiques publiques parisiennes.
Analyse ces noms de bénéficiaires de subventions et classifie-les selon leur DOMAINE D'ACTION.

THÉMATIQUES AUTORISÉES: {json.dumps(THEMATIQUES, ensure_ascii=False)}

RÈGLES:
- Associations sportives → "Culture & Sport"
- Aide sociale, insertion, handicap, personnes âgées → "Social"
- Théâtre, musique, danse, cinéma, patrimoine → "Culture & Sport"
- Écologie, jardins, biodiversité → "Environnement"
- Écoles, formation, jeunesse → "Éducation"
- Commerce, emploi, startups → "Économie"
- Syndicats de copropriété, mairies → "Administration"
- Coopération internationale, solidarité internationale → "International"
- Si vraiment inclassable → "Autre"

IMPORTANT: "Associations" n'est PAS une thématique valide. Classifie selon le DOMAINE D'ACTION.

Réponds UNIQUEMENT en JSON valide:
[
  {{"id": "...", "thematique": "<une des thématiques>", "sous_categorie": "<ou null>", "confiance": <0-1>}},
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
                beneficiaire = row.get('beneficiaire_normalise', '')
                if beneficiaire:
                    cache[beneficiaire] = {
                        'thematique': row.get('ode_thematique', ''),
                        'sous_categorie': row.get('ode_sous_categorie', ''),
                        'confiance': row.get('ode_confiance', ''),
                        'date_recherche': row.get('ode_date_recherche', ''),
                        'source': row.get('ode_source', '')
                    }
    return cache


def save_cache(cache: dict):
    """Sauvegarde le cache dans le CSV."""
    fieldnames = [
        'beneficiaire_normalise',
        'ode_thematique',
        'ode_sous_categorie',
        'ode_confiance',
        'ode_date_recherche',
        'ode_source'
    ]
    
    with open(SEED_PATH, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for beneficiaire, data in sorted(cache.items()):
            writer.writerow({
                'beneficiaire_normalise': beneficiaire,
                'ode_thematique': data.get('thematique', ''),
                'ode_sous_categorie': data.get('sous_categorie', ''),
                'ode_confiance': data.get('confiance', ''),
                'ode_date_recherche': data.get('date_recherche', ''),
                'ode_source': data.get('source', '')
            })


def call_gemini_batch(beneficiaires: list) -> list:
    """Appelle Gemini avec un batch de bénéficiaires."""
    if not GEMINI_API_KEY:
        raise ValueError("GOOGLE_API_KEY non défini")
    
    # Construire le prompt
    items_text = "\n".join([
        f"- ID: {b['id']}, NOM: {b['nom']}"
        for b in beneficiaires
    ])
    
    try:
        payload = {
            "contents": [{
                "parts": [{
                    "text": f"{SYSTEM_PROMPT}\n\nBénéficiaires à classifier:\n{items_text}"
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
            print(f"    [ERREUR API] Status {response.status_code}: {response.text[:200]}", flush=True)
            return []
        
        data = response.json()
        candidates = data.get('candidates', [])
        if not candidates:
            print(f"    [DEBUG] Pas de candidates dans la réponse", flush=True)
            return []
        
        text = candidates[0].get('content', {}).get('parts', [{}])[0].get('text', '')
        print(f"    [DEBUG] Réponse brute: {text[:150]}...", flush=True)
        
        if '```json' in text:
            text = text.split('```json')[1].split('```')[0]
        elif '```' in text:
            text = text.split('```')[1].split('```')[0]
        
        results = json.loads(text.strip())
        
        # Valider et normaliser les résultats
        for r in results:
            # Convertir id en string si nécessaire
            if 'id' in r:
                r['id'] = str(r['id'])
            # Valider thématique
            if r.get('thematique') not in THEMATIQUES:
                r['thematique'] = 'Associations'
        
        return results
        
    except json.JSONDecodeError as e:
        # Essayer de réparer le JSON tronqué
        try:
            # Chercher le dernier objet complet
            import re
            matches = list(re.finditer(r'\{[^{}]+\}', text))
            if matches:
                fixed = '[' + ','.join(m.group() for m in matches) + ']'
                results = json.loads(fixed)
                for r in results:
                    if 'id' in r:
                        r['id'] = str(r['id'])
                    if r.get('thematique') not in THEMATIQUES:
                        r['thematique'] = 'Associations'
                print(f"    [RÉPARÉ] Récupéré {len(results)} résultats", flush=True)
                return results
        except:
            pass
        print(f"    [ERREUR JSON] {e}", flush=True)
        return []
    except Exception as e:
        print(f"    [ERREUR] {e}", flush=True)
        return []


def get_beneficiaires_to_classify(client: bigquery.Client, existing_cache: dict, limit: int = None) -> list:
    """Récupère les bénéficiaires 'default', top N par montant."""
    actual_limit = limit or PARETO_LIMIT
    
    query = f"""
    SELECT 
        beneficiaire_normalise,
        SUM(montant) as montant_total
    FROM `{PROJECT_ID}.{DATASET}.core_subventions`
    WHERE ode_source_thematique = 'default'
      AND beneficiaire_normalise IS NOT NULL
    GROUP BY beneficiaire_normalise
    ORDER BY montant_total DESC
    LIMIT {actual_limit * 2}
    """
    
    results = client.query(query).result()
    
    to_process = []
    for row in results:
        if row.beneficiaire_normalise not in existing_cache:
            to_process.append({
                'nom': row.beneficiaire_normalise,
                'montant': row.montant_total
            })
            if len(to_process) >= actual_limit:
                break
    
    return to_process


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Classification thématique LLM (batch)")
    parser.add_argument('--limit', type=int, help=f"Nombre max (default: {PARETO_LIMIT})")
    parser.add_argument('--dry-run', action='store_true', help="Simulation")
    args = parser.parse_args()
    
    print("=" * 60)
    print("CLASSIFICATION THÉMATIQUE - LLM Batch (20/req)")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print()
    
    if not GEMINI_API_KEY and not args.dry_run:
        print("ERREUR: Variable GOOGLE_API_KEY non définie")
        return
    
    cache = load_existing_cache()
    print(f"Cache existant: {len(cache)} bénéficiaires")
    
    client = bigquery.Client(project=PROJECT_ID)
    to_process = get_beneficiaires_to_classify(client, cache, args.limit)
    
    total_montant = sum(b['montant'] for b in to_process)
    print(f"Bénéficiaires à classifier: {len(to_process)} (top par montant)")
    print(f"Montant couvert: {total_montant/1e6:.1f}M€")
    print(f"Batches de {BATCH_SIZE}: {(len(to_process) + BATCH_SIZE - 1) // BATCH_SIZE}")
    print()
    
    if not to_process:
        print("Rien à traiter!")
        return
    
    if args.dry_run:
        print("[DRY-RUN]")
        for b in to_process[:5]:
            print(f"  {b['nom']}: {b['montant']/1e6:.2f}M€")
        return
    
    # Traitement par batches
    classified = 0
    errors = 0
    montant_classifie = 0
    start_time = time.time()
    last_progress = start_time
    
    print("Démarrage...")
    print("-" * 40)
    
    for i in range(0, len(to_process), BATCH_SIZE):
        batch = to_process[i:i+BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        total_batches = (len(to_process) + BATCH_SIZE - 1) // BATCH_SIZE
        
        print(f"  [Batch {batch_num}/{total_batches}] Appel API...", flush=True)
        
        # Préparer avec IDs
        batch_with_ids = [{'id': str(j), 'nom': b['nom']} for j, b in enumerate(batch)]
        
        batch_results = call_gemini_batch(batch_with_ids)
        
        # Mapper les résultats
        results_map = {r.get('id'): r for r in batch_results if r.get('id')}
        
        for j, b in enumerate(batch):
            result = results_map.get(str(j))
            
            if result and result.get('thematique'):
                cache[b['nom']] = {
                    'thematique': result['thematique'],
                    'sous_categorie': result.get('sous_categorie') or '',
                    'confiance': str(result.get('confiance', 0.5)),
                    'date_recherche': datetime.now().strftime('%Y-%m-%d'),
                    'source': 'llm_gemini'
                }
                classified += 1
                montant_classifie += b['montant']
            else:
                errors += 1
        
        # Log immédiat du résultat du batch
        batch_found = len([r for r in batch_results if r.get('thematique')])
        print(f"    → {batch_found}/{len(batch)} classifiés | Total: {classified} | {montant_classifie/1e6:.1f}M€", flush=True)
        
        save_cache(cache)
        time.sleep(1)  # Rate limiting - Gemini paid tier
    
    elapsed = time.time() - start_time
    print("-" * 40)
    print(f"\nTerminé en {elapsed:.1f}s ({elapsed/60:.1f}min)")
    print(f"  Classifiés: {classified} ({100*classified/len(to_process):.1f}%)")
    print(f"  Montant classifié: {montant_classifie/1e6:.1f}M€")
    print(f"  Erreurs: {errors}")
    print(f"\nCache total: {len(cache)} bénéficiaires")


if __name__ == "__main__":
    main()
