# Pipeline dbt — Données Lumières

> Transformation des données OpenData Paris → JSON pour le website

## 🏗️ Architecture

```
BigQuery (raw) → staging → intermediate → core → marts → JSON
```

## 📁 Structure

```
pipeline/
├── models/
│   ├── staging/        # Nettoyage, typage, filtre "Réel"
│   ├── intermediate/   # Enrichissement, jointures
│   ├── core/           # Tables OBT (One Big Table)
│   └── marts/          # Vues pour export JSON
├── seeds/              # Caches LLM et géoloc (CSV)
└── scripts/
    ├── export/         # export_sankey, export_map, etc.
    ├── enrich/         # LLM (Gemini) pour thématiques/géoloc
    ├── sync/           # Sync depuis OpenData Paris
    └── utils/          # Logger partagé
```

## 🚀 Commandes

```bash
# Depuis la racine du projet
source .venv/bin/activate
cd pipeline

# dbt
dbt deps          # Installer packages
dbt seed          # Charger les caches
dbt run           # Transformer les données
dbt test          # Lancer les tests

# Export vers website
python scripts/export/export_all.py

# Enrichissement LLM
export GEMINI_API_KEY="..."
python scripts/enrich/enrich_thematique_llm.py
```

## 📊 Modèles principaux

| Modèle | Description |
|--------|-------------|
| `core_budget` | Budget consolidé (recettes/dépenses) |
| `core_subventions` | Subventions enrichies (thématique, bénéficiaire) |
| `core_ap_projets` | Investissements géolocalisés |
| `core_logements_sociaux` | Logements sociaux par arrondissement |

## ⚠️ Règles métier

Voir `docs/architecture-modelling.md` pour les règles anti-double comptage.
