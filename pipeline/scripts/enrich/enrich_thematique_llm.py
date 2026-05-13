#!/usr/bin/env python3
"""
Classification thématique des bénéficiaires via LLM (Claude ou Gemini).
Version optimisée avec batching et Pareto (top 500).

Prérequis:
    Claude:  export ANTHROPIC_API_KEY=<votre_clé>
    Gemini:  export GOOGLE_API_KEY=<votre_clé>

Usage:
    python scripts/enrich/enrich_thematique_llm.py [--provider claude] [--limit N] [--dry-run]
"""

import csv
import time
import os
import argparse
import json
from pathlib import Path
from datetime import datetime
import requests

# =============================================================================
# Configuration
# =============================================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SUBVENTIONS_DIR = PROJECT_ROOT / "pipeline" / "cache" / "subventions_pre_enrichment"
SEED_PATH = Path(__file__).parent.parent.parent / "seeds" / "seed_cache_thematique_beneficiaires.csv"

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
# Gemini 3 Flash — main workhorse for classification with long system prompt.
# Reasoning is needed to disambiguate themes (e.g. "Maison Européenne de la
# Photographie" → Culture, not International). Override via GEMINI_MODEL env
# if you want to fall back or try a newer variant.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5")

BATCH_SIZE = 10
# Long tail activé : on classe tous les bénéficiaires exportés (cap côté export).
# Override avec `--limit` pour les runs exploratoires.
PARETO_LIMIT = None

THEMATIQUES = [
    "Social - Solidarité", "Social - Petite enfance", "Social",
    "Éducation", "Culture", "Sport",
    "Environnement", "Transport", "Économie",
    "Administration", "Santé", "Logement",
    "Sécurité", "International", "Autre"
]

SYSTEM_PROMPT = f"""Tu es un expert en classification des acteurs associatifs et des politiques publiques parisiennes.
Tu travailles sur les subventions versées par la Ville de Paris.
Analyse ces noms de bénéficiaires et classifie-les selon leur DOMAINE D'ACTION principal.

THÉMATIQUES AUTORISÉES: {json.dumps(THEMATIQUES, ensure_ascii=False)}

RÈGLES DE CLASSIFICATION:
- Aide sociale, insertion, handicap, personnes âgées, hébergement d'urgence, réfugiés, aide alimentaire → "Social - Solidarité"
- Crèches, haltes-garderies, jardins d'enfants, petite enfance, parentalité → "Social - Petite enfance"
- Aide sociale générale non couverte ci-dessus → "Social"
- Écoles, universités, formation professionnelle, jeunesse, recherche → "Éducation"
- Théâtre, musique, danse, cinéma, patrimoine, musées, galeries, festivals culturels, photographie, arts visuels → "Culture"
- Clubs sportifs, fédérations sportives, événements sportifs, JO → "Sport"
- Écologie, jardins partagés, biodiversité, qualité de l'air, agriculture urbaine → "Environnement"
- Transports en commun, mobilité, voirie → "Transport"
- Commerce, emploi, microfinance, startups, insertion économique → "Économie"
- Syndicats (CFDT, CGT, FO), copropriétés (ASL), mairies, institutions publiques → "Administration"
- Hôpitaux, centres de santé, recherche médicale, prévention addictions, VIH/SIDA → "Santé"
- Logement social, aide au logement, HLM, lutte contre le mal-logement → "Logement"
- Police, prévention, sécurité → "Sécurité"
- Coopération internationale, aide au développement, francophonie, affaires européennes → "International"
- Si vraiment inclassable → "Autre"

PIÈGES À ÉVITER:
- "Maison Européenne de la Photographie" (MEP) → "Culture" (PAS International)
- "Parc de la Villette" / "Grande Halle" → "Culture" (c'est un lieu culturel, PAS Environnement)
- "ASL Olympiades" → "Administration" (c'est une copropriété du 13e, PAS les JO)
- "FONDATION" ne signifie PAS syndicat → classifier selon l'activité réelle
- "ASSOCIATION" ne signifie PAS sport → classifier selon l'activité réelle
- Les noms peuvent être tronqués, utilise le contexte pour deviner l'activité

IMPORTANT: "Associations" n'est PAS une thématique valide. Classifie selon le DOMAINE D'ACTION.

Réponds UNIQUEMENT en JSON valide:
[
  {{"id": "...", "thematique": "<une des thématiques>", "sous_categorie": "<description courte ou null>", "confiance": <0.0-1.0>}},
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


def _parse_llm_response(text: str) -> list:
    """Parse la réponse JSON d'un LLM, avec réparation si nécessaire."""
    # Extraire le JSON des blocs de code markdown
    if '```json' in text:
        text = text.split('```json')[1].split('```')[0]
    elif '```' in text:
        text = text.split('```')[1].split('```')[0]

    try:
        results = json.loads(text.strip())
    except json.JSONDecodeError:
        # Essayer de réparer le JSON tronqué
        import re
        matches = list(re.finditer(r'\{[^{}]+\}', text))
        if matches:
            fixed = '[' + ','.join(m.group() for m in matches) + ']'
            results = json.loads(fixed)
            print(f"    [RÉPARÉ] Récupéré {len(results)} résultats", flush=True)
        else:
            raise

    # Valider et normaliser les résultats
    for r in results:
        if 'id' in r:
            r['id'] = str(r['id'])
        if r.get('thematique') not in THEMATIQUES:
            print(f"    [WARN] Thématique inconnue: {r.get('thematique')!r} → Autre", flush=True)
            r['thematique'] = 'Autre'

    return results


def call_claude_batch(beneficiaires: list) -> list:
    """Appelle Claude avec un batch de bénéficiaires."""
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY non défini")

    items_text = "\n".join([
        f"- ID: {b['id']}, NOM: {b['nom']}"
        for b in beneficiaires
    ])

    try:
        payload = {
            "model": CLAUDE_MODEL,
            "max_tokens": 8192,
            # temperature deprecated for Claude 4.x models — omit it
            "messages": [{
                "role": "user",
                "content": f"{SYSTEM_PROMPT}\n\nBénéficiaires à classifier:\n{items_text}"
            }]
        }

        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            json=payload,
            timeout=120
        )

        if response.status_code == 429:
            print("    [RATE LIMIT] Attente 30s...", flush=True)
            time.sleep(30)
            response = requests.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json=payload,
                timeout=120
            )

        if response.status_code != 200:
            print(f"    [ERREUR API] Status {response.status_code}: {response.text[:200]}", flush=True)
            return []

        data = response.json()
        text = data.get('content', [{}])[0].get('text', '')
        print(f"    [DEBUG] Réponse brute: {text[:150]}...", flush=True)

        return _parse_llm_response(text)

    except json.JSONDecodeError as e:
        print(f"    [ERREUR JSON] {e}", flush=True)
        return []
    except Exception as e:
        print(f"    [ERREUR] {e}", flush=True)
        return []


def call_gemini_batch(beneficiaires: list) -> list:
    """Appelle Gemini avec un batch de bénéficiaires."""
    if not GEMINI_API_KEY:
        raise ValueError("GOOGLE_API_KEY non défini")

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

        return _parse_llm_response(text)

    except json.JSONDecodeError as e:
        print(f"    [ERREUR JSON] {e}", flush=True)
        return []
    except Exception as e:
        print(f"    [ERREUR] {e}", flush=True)
        return []


def get_beneficiaires_to_classify(existing_cache: dict, limit: int = None) -> list:
    """Liste les bénéficiaires à classifier depuis les JSONs publics.

    Lit `website/public/data/subventions/beneficiaires_*.json`, agrège les
    montants par nom sur toutes les années disponibles, puis renvoie les
    top N non encore en cache. Remplace l'ancienne requête BigQuery.
    """
    actual_limit = limit or PARETO_LIMIT  # None = pas de cap (long tail complet)

    totals: dict[str, float] = {}
    for f in sorted(SUBVENTIONS_DIR.glob("beneficiaires_*.json")):
        try:
            with f.open(encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception:
            continue
        for row in data.get("data", []):
            name = (row.get("beneficiaire") or "").strip()
            if not name:
                continue
            amount = float(row.get("montant_total") or row.get("montant") or 0)
            totals[name] = totals.get(name, 0) + amount

    ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
    to_process = []
    for nom, montant in ranked:
        if nom in existing_cache:
            continue
        to_process.append({"nom": nom, "montant": montant})
        if actual_limit is not None and len(to_process) >= actual_limit:
            break
    return to_process


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Classification thématique LLM (batch)")
    parser.add_argument('--limit', type=int, help="Nombre max (default: tous les bénéficiaires exportés)")
    parser.add_argument('--dry-run', action='store_true', help="Simulation")
    parser.add_argument('--provider', choices=['claude', 'gemini'], default='gemini',
                       help="LLM provider (default: gemini)")
    args = parser.parse_args()

    provider_label = f"Claude ({CLAUDE_MODEL})" if args.provider == 'claude' else f"Gemini ({GEMINI_MODEL})"

    print("=" * 60)
    print(f"CLASSIFICATION THÉMATIQUE - {provider_label}")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"Seed path: {SEED_PATH}")
    print()

    if args.provider == 'claude' and not ANTHROPIC_API_KEY and not args.dry_run:
        print("ERREUR: Variable ANTHROPIC_API_KEY non définie")
        return
    if args.provider == 'gemini' and not GEMINI_API_KEY and not args.dry_run:
        print("ERREUR: Variable GOOGLE_API_KEY non définie")
        return

    cache = load_existing_cache()
    print(f"Cache existant: {len(cache)} bénéficiaires")

    to_process = get_beneficiaires_to_classify(cache, args.limit)

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

    call_fn = call_claude_batch if args.provider == 'claude' else call_gemini_batch
    source_label = f"llm_{args.provider}"

    # Traitement par batches
    classified = 0
    errors = 0
    montant_classifie = 0
    start_time = time.time()

    print("Démarrage...")
    print("-" * 40)

    for i in range(0, len(to_process), BATCH_SIZE):
        batch = to_process[i:i+BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        total_batches = (len(to_process) + BATCH_SIZE - 1) // BATCH_SIZE

        print(f"  [Batch {batch_num}/{total_batches}] Appel API ({args.provider})...", flush=True)

        batch_with_ids = [{'id': str(j), 'nom': b['nom']} for j, b in enumerate(batch)]

        batch_results = call_fn(batch_with_ids)

        results_map = {r.get('id'): r for r in batch_results if r.get('id')}

        for j, b in enumerate(batch):
            result = results_map.get(str(j))

            if result and result.get('thematique'):
                cache[b['nom']] = {
                    'thematique': result['thematique'],
                    'sous_categorie': result.get('sous_categorie') or '',
                    'confiance': str(result.get('confiance', 0.5)),
                    'date_recherche': datetime.now().strftime('%Y-%m-%d'),
                    'source': source_label
                }
                classified += 1
                montant_classifie += b['montant']
            else:
                errors += 1

        batch_found = len([r for r in batch_results if r.get('thematique')])
        print(f"    -> {batch_found}/{len(batch)} classifiés | Total: {classified} | {montant_classifie/1e6:.1f}M€", flush=True)

        save_cache(cache)
        time.sleep(1)

    elapsed = time.time() - start_time
    print("-" * 40)
    print(f"\nTerminé en {elapsed:.1f}s ({elapsed/60:.1f}min)")
    print(f"  Classifiés: {classified} ({100*classified/len(to_process):.1f}%)")
    print(f"  Montant classifié: {montant_classifie/1e6:.1f}M€")
    print(f"  Erreurs: {errors}")
    print(f"\nCache total: {len(cache)} bénéficiaires")


if __name__ == "__main__":
    main()
