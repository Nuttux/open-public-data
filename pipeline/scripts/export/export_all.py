#!/usr/bin/env python3
"""
Script principal d'export de toutes les données.

Exécute tous les exports dans l'ordre:
1. Budget Sankey (pour page principale)
2. Subventions (treemap + bénéficiaires)
3. Carte (investissements + logements + stats)

Usage:
    python scripts/export_all.py
    
    # Avec credentials explicites
    GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json python scripts/export_all.py

Prérequis:
    - Google Cloud credentials configurées
    - Tables dbt existantes (dbt run)
"""

import subprocess
import sys
import time
from pathlib import Path

# Ajouter le dossier scripts au path pour importer utils
sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger


def run_script(script_name: str, log: Logger) -> bool:
    """
    Exécute un script Python et retourne True si succès.
    """
    script_path = Path(__file__).parent / script_name
    
    if not script_path.exists():
        log.error(f"Script non trouvé: {script_name}")
        return False
    
    try:
        result = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=False,  # Afficher la sortie en temps réel
            check=True,
        )
        return True
    except subprocess.CalledProcessError as e:
        log.error(f"Échec {script_name}", extra=f"code {e.returncode}")
        return False
    except Exception as e:
        log.error(f"Erreur {script_name}", extra=str(e))
        return False


def main():
    log = Logger("export_all")
    log.header("Export Complet Paris Budget Dashboard")
    
    scripts = [
        ("export_sankey_data.py", "Budget Sankey"),
        ("export_budget_nature.py", "Budget par Nature (Donut)"),
        ("export_subventions_data.py", "Subventions"),
        ("export_map_data.py", "Données Carte"),
    ]
    
    log.info(f"Scripts à exécuter: {len(scripts)}")
    for script, desc in scripts:
        log.info(f"  • {desc}", extra=script)
    
    results = []
    
    for i, (script, desc) in enumerate(scripts, 1):
        log.section(f"[{i}/{len(scripts)}] {desc}")
        print()  # Ligne vide avant le script
        
        start = time.time()
        success = run_script(script, log)
        elapsed = time.time() - start
        
        results.append((desc, success, elapsed))
        
        if success:
            log.success(f"{desc} terminé", extra=f"{elapsed:.1f}s")
        else:
            log.error(f"{desc} échoué")
        
        print()  # Ligne vide après le script
    
    # Résumé final
    log.header("Résumé Export Complet")
    
    total_time = sum(r[2] for r in results)
    successes = sum(1 for r in results if r[1])
    
    for desc, success, elapsed in results:
        status = "✅" if success else "❌"
        print(f"  {status} {desc} ({elapsed:.1f}s)")
    
    print()
    print(f"Total: {successes}/{len(results)} exports réussis en {total_time:.1f}s")
    
    log.summary()
    
    # Exit code
    sys.exit(0 if successes == len(results) else 1)


if __name__ == "__main__":
    main()
