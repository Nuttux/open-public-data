#!/usr/bin/env python3
"""
Script maître d'enrichissement du pipeline Paris Budget.

Exécute séquentiellement les étapes d'enrichissement LLM:
1. Géolocalisation des AP/CP via LLM (Gemini)
2. Classification thématique des bénéficiaires via LLM (Gemini)

NOTE: Les scripts de géolocalisation SIRET ont été abandonnés.
Les subventions ne sont pas géolocalisées car l'adresse du siège
d'une association ne reflète pas où l'action est menée.

Usage:
    python scripts/run_enrichment.py [--step N] [--limit N] [--dry-run]

Étapes:
    1 = Géo AP (LLM) uniquement
    2 = Classification thématique (LLM) uniquement
    (sans --step = toutes les étapes)

Prérequis:
    - Google Cloud credentials configurées
    - export GOOGLE_API_KEY=<clé_gemini>
"""

import subprocess
import sys
import argparse
from datetime import datetime
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent


def run_script(script_name: str, args: list = None) -> bool:
    """Exécute un script d'enrichissement."""
    script_path = SCRIPTS_DIR / script_name
    cmd = [sys.executable, str(script_path)]
    if args:
        cmd.extend(args)
    
    print(f"\n{'='*60}")
    print(f"Exécution: {script_name}")
    print(f"{'='*60}\n")
    
    result = subprocess.run(cmd, cwd=str(SCRIPTS_DIR.parent))
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser(description="Pipeline d'enrichissement LLM")
    parser.add_argument('--step', type=int, choices=[1, 2], 
                       help="Exécuter uniquement cette étape")
    parser.add_argument('--limit', type=int, 
                       help="Limiter le nombre d'éléments par étape (Pareto filter)")
    parser.add_argument('--dry-run', action='store_true', 
                       help="Simulation sans appels API")
    args = parser.parse_args()
    
    print("=" * 60)
    print("PIPELINE ENRICHISSEMENT LLM - Paris Budget Dashboard")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    script_args = []
    if args.limit:
        script_args.extend(['--limit', str(args.limit)])
    if args.dry_run:
        script_args.append('--dry-run')
    
    # Étapes d'enrichissement restantes (LLM uniquement)
    steps = {
        1: ('enrich_geo_ap_llm.py', 'Géolocalisation AP/CP (LLM Gemini)'),
        2: ('enrich_thematique_llm.py', 'Classification thématique (LLM Gemini)')
    }
    
    # Déterminer quelles étapes exécuter
    if args.step:
        steps_to_run = [args.step]
    else:
        steps_to_run = [1, 2]
    
    print(f"\nÉtapes à exécuter: {steps_to_run}")
    if args.limit:
        print(f"Limite Pareto: {args.limit} éléments")
    if args.dry_run:
        print("Mode: DRY-RUN (pas d'appels API)")
    
    # Exécution
    results = {}
    for step in steps_to_run:
        script, description = steps[step]
        print(f"\n[STEP {step}] {description}")
        success = run_script(script, script_args)
        results[step] = success
        
        if not success:
            print(f"\n[AVERTISSEMENT] Étape {step} a rencontré des erreurs (voir logs)")
    
    # Résumé
    print("\n" + "=" * 60)
    print("RÉSUMÉ PIPELINE")
    print("=" * 60)
    for step in steps_to_run:
        script, description = steps[step]
        status = "✓" if results[step] else "✗"
        print(f"  [{status}] Step {step}: {description}")
    
    print("\n[PROCHAINES ÉTAPES]")
    print("  1. dbt seed   → Charger les caches CSV en BigQuery")
    print("  2. dbt run    → Recalculer les modèles enrichis")
    print("  3. git add seeds/seed_cache_*.csv && git commit")


if __name__ == "__main__":
    main()
