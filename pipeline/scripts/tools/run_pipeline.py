#!/usr/bin/env python3
"""
Pipeline complet pour Paris Budget Dashboard.

Ce script exécute l'ensemble du pipeline de données:
1. Synchronise les données depuis Paris Open Data vers BigQuery
2. Exécute dbt pour transformer les données
3. Enrichit les données via LLM (Gemini 3 Pro)
4. Exporte les données JSON pour le frontend

Usage:
    # Pipeline complet
    python scripts/run_pipeline.py
    
    # Étapes spécifiques
    python scripts/run_pipeline.py --steps sync,export
    
    # Mode dry-run (pas d'upload)
    python scripts/run_pipeline.py --dry-run

Configuration requise:
    export GEMINI_API_KEY='votre_clé_api_gemini'
    export GOOGLE_APPLICATION_CREDENTIALS='path/to/credentials.json'
"""

import argparse
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Chemins
PROJECT_ROOT = Path(__file__).parent.parent
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
DBT_DIR = PROJECT_ROOT / "paris-public-open-data"

# Configuration
STEPS = ["sync", "dbt", "enrich", "export"]


def run_command(cmd: list, cwd: Path = None, env: dict = None) -> bool:
    """
    Exécute une commande et retourne True si succès.
    """
    print(f"\n{'='*60}")
    print(f"  Executing: {' '.join(cmd)}")
    print(f"{'='*60}\n")
    
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd or PROJECT_ROOT,
            env={**os.environ, **(env or {})},
            check=True,
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Command failed with exit code {e.returncode}")
        return False
    except FileNotFoundError as e:
        print(f"❌ Command not found: {e}")
        return False


def step_sync(dry_run: bool = False) -> bool:
    """
    Étape 1: Synchroniser les données depuis Paris Open Data.
    """
    print("\n" + "="*60)
    print("📥 ÉTAPE 1: Synchronisation Paris Open Data → BigQuery")
    print("="*60)
    
    cmd = [sys.executable, str(SCRIPTS_DIR / "sync_opendata.py")]
    if dry_run:
        cmd.append("--dry-run")
    
    return run_command(cmd)


def step_dbt() -> bool:
    """
    Étape 2: Exécuter dbt pour transformer les données.
    """
    print("\n" + "="*60)
    print("🔄 ÉTAPE 2: Transformation dbt")
    print("="*60)
    
    # dbt deps
    if not run_command(["dbt", "deps"], cwd=DBT_DIR):
        print("⚠️ dbt deps failed, continuing...")
    
    # dbt seed (charger les caches LLM)
    if not run_command(["dbt", "seed"], cwd=DBT_DIR):
        print("⚠️ dbt seed failed, continuing...")
    
    # dbt run
    return run_command(["dbt", "run"], cwd=DBT_DIR)


def step_enrich(llm_limit: int = 100) -> bool:
    """
    Étape 3: Enrichir les données via LLM (Gemini 3 Pro).
    """
    print("\n" + "="*60)
    print("🤖 ÉTAPE 3: Enrichissement LLM (Gemini 3 Pro)")
    print("="*60)
    
    if not os.environ.get("GEMINI_API_KEY"):
        print("⚠️ GEMINI_API_KEY non configurée, skip enrichissement LLM")
        print("   Pour activer: export GEMINI_API_KEY='votre_clé'")
        return True  # Ne pas bloquer le pipeline
    
    cmd = [
        sys.executable, 
        str(SCRIPTS_DIR / "enrich_geo_data.py"),
        "--mode", "all",
        "--llm-limit", str(llm_limit),
    ]
    
    return run_command(cmd)


def step_export() -> bool:
    """
    Étape 4: Exporter les données JSON pour le frontend.
    """
    print("\n" + "="*60)
    print("📤 ÉTAPE 4: Export JSON pour le frontend")
    print("="*60)
    
    success = True
    
    # Export Sankey
    if not run_command([sys.executable, str(SCRIPTS_DIR / "export_sankey_data.py")]):
        success = False
    
    # Export Map
    if not run_command([sys.executable, str(SCRIPTS_DIR / "export_map_data.py")]):
        success = False
    
    return success


def main():
    parser = argparse.ArgumentParser(
        description="Pipeline complet Paris Budget Dashboard",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemples:
    # Pipeline complet
    python scripts/run_pipeline.py
    
    # Synchronisation seule
    python scripts/run_pipeline.py --steps sync
    
    # Export seul (après modifications manuelles)
    python scripts/run_pipeline.py --steps export
    
    # Sync + Export sans dbt/LLM
    python scripts/run_pipeline.py --steps sync,export
    
    # Dry run (pas d'upload BigQuery)
    python scripts/run_pipeline.py --dry-run
        """
    )
    parser.add_argument(
        "--steps",
        default=",".join(STEPS),
        help=f"Étapes à exécuter (défaut: {','.join(STEPS)})"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Mode dry-run (pas d'upload vers BigQuery)"
    )
    parser.add_argument(
        "--llm-limit",
        type=int,
        default=100,
        help="Limite d'items pour l'enrichissement LLM (défaut: 100)"
    )
    parser.add_argument(
        "--skip-dbt",
        action="store_true",
        help="Skip l'étape dbt (utile si BigQuery n'est pas configuré)"
    )
    
    args = parser.parse_args()
    
    print("\n" + "="*60)
    print("🚀 PARIS BUDGET DASHBOARD - PIPELINE COMPLET")
    print("="*60)
    print(f"  Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Étapes: {args.steps}")
    print(f"  Dry run: {args.dry_run}")
    print(f"  LLM limit: {args.llm_limit}")
    
    # Parse steps
    steps_to_run = [s.strip() for s in args.steps.split(",")]
    
    # Track results
    results = {}
    
    # Run steps
    if "sync" in steps_to_run:
        results["sync"] = step_sync(dry_run=args.dry_run)
    
    if "dbt" in steps_to_run and not args.skip_dbt:
        results["dbt"] = step_dbt()
    elif "dbt" in steps_to_run:
        print("\n⏭️ Skip dbt (--skip-dbt)")
        results["dbt"] = True
    
    if "enrich" in steps_to_run:
        results["enrich"] = step_enrich(llm_limit=args.llm_limit)
    
    if "export" in steps_to_run:
        results["export"] = step_export()
    
    # Summary
    print("\n" + "="*60)
    print("📋 RÉSUMÉ DU PIPELINE")
    print("="*60)
    
    all_success = True
    for step, success in results.items():
        icon = "✓" if success else "✗"
        status = "OK" if success else "ÉCHEC"
        print(f"  {icon} {step}: {status}")
        if not success:
            all_success = False
    
    if all_success:
        print("\n✅ Pipeline terminé avec succès !")
        print("\nProchaines étapes:")
        print("  1. cd frontend && npm run dev   # Lancer le serveur de dev")
        print("  2. Ouvrir http://localhost:3000  # Voir le dashboard")
    else:
        print("\n⚠️ Pipeline terminé avec des erreurs")
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
