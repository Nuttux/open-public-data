#!/usr/bin/env python3
"""
Upload du bilan comptable CSV vers BigQuery.

Usage:
    python scripts/sync/upload_bilan_comptable.py

Prérequis:
    - Authentification GCP configurée (gcloud auth application-default login)
    - Ou variable d'environnement GOOGLE_APPLICATION_CREDENTIALS
"""

import re
import unicodedata
from pathlib import Path

import pandas as pd
from google.cloud import bigquery

# =============================================================================
# Configuration
# =============================================================================
PROJECT_ID = "open-data-france-484717"
DATASET_ID = "raw"
TABLE_NAME = "bilan_comptable"

# Chemin vers le CSV (relatif à la racine du projet)
CSV_PATH = Path(__file__).parent.parent.parent.parent / "bilan-comptable.csv"


def clean_column_name(name: str) -> str:
    """Nettoie un nom de colonne pour BigQuery."""
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    name = name.lower()
    name = re.sub(r'[\s/\(\)\-\.]+', '_', name)
    name = re.sub(r'[^a-z0-9_]', '_', name)
    name = re.sub(r'_+', '_', name)
    name = name.strip('_')
    return name


def main():
    print("=" * 60)
    print("📊 UPLOAD BILAN COMPTABLE → BIGQUERY")
    print("=" * 60)
    
    # Vérifier que le fichier existe
    if not CSV_PATH.exists():
        print(f"❌ Fichier non trouvé: {CSV_PATH}")
        return 1
    
    # Charger le CSV
    print(f"\n📥 Chargement de {CSV_PATH.name}...")
    df = pd.read_csv(CSV_PATH, sep=';', encoding='utf-8')
    print(f"  ✓ {len(df)} lignes chargées")
    
    # Nettoyer les noms de colonnes
    original_columns = df.columns.tolist()
    new_columns = {col: clean_column_name(col) for col in original_columns}
    df = df.rename(columns=new_columns)
    
    print(f"\n📝 Colonnes nettoyées:")
    for old, new in new_columns.items():
        print(f"    {old} → {new}")
    
    # Connexion BigQuery
    print(f"\n📤 Upload vers BigQuery: {PROJECT_ID}.{DATASET_ID}.{TABLE_NAME}")
    
    try:
        client = bigquery.Client(project=PROJECT_ID)
    except Exception as e:
        print(f"\n❌ Erreur d'authentification: {e}")
        print("\n💡 Solutions:")
        print("   1. Installer gcloud: brew install google-cloud-sdk")
        print("   2. S'authentifier: gcloud auth application-default login")
        print("   3. Ou définir: export GOOGLE_APPLICATION_CREDENTIALS=/chemin/vers/cle.json")
        return 1
    
    # Créer le dataset s'il n'existe pas
    dataset_ref = f"{PROJECT_ID}.{DATASET_ID}"
    try:
        client.get_dataset(dataset_ref)
        print(f"  ✓ Dataset {DATASET_ID} existe")
    except Exception:
        dataset = bigquery.Dataset(dataset_ref)
        dataset.location = "EU"
        client.create_dataset(dataset)
        print(f"  ✓ Dataset {DATASET_ID} créé")
    
    # Stamp la fraîcheur du sync pour dbt source freshness
    df["_synced_at"] = pd.Timestamp.utcnow().tz_localize(None)

    # Upload
    table_ref = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_NAME}"
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    
    try:
        job = client.load_table_from_dataframe(df, table_ref, job_config=job_config)
        job.result()
        
        table = client.get_table(table_ref)
        print(f"\n✅ {table.num_rows:,} lignes chargées dans {TABLE_NAME}")
        print(f"   Schema: {[f.name for f in table.schema]}")
        
    except Exception as e:
        print(f"\n❌ Erreur upload: {e}")
        return 1
    
    print("\n" + "=" * 60)
    print("✅ Upload terminé !")
    print("=" * 60)
    print("\nProchaine étape:")
    print("  cd pipeline && dbt run --select stg_bilan_comptable")
    
    return 0


if __name__ == "__main__":
    exit(main())
