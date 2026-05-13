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

# Sync des sources
python scripts/sync/sync_opendata.py                    # Sources Ville de Paris (opendata.paris.fr)
python scripts/sync/fetch_decp_paris.py --global        # DECP nationale (1 fichier, tout l'historique)
python scripts/sync/fetch_decp_paris.py --year 2024     # Une année DECP spécifique

# Export vers website
python scripts/export/export_all.py
python scripts/export/export_marches_data.py            # Marchés seuls (après sync DECP + dbt)

# Enrichissement LLM
export GEMINI_API_KEY="..."
python scripts/enrich/enrich_thematique_llm.py
```

## 🔀 Marchés publics : fusion Paris + DECP

Les marchés combinent **deux sources** qui se recouvrent partiellement :

1. **opendata.paris.fr** (source historique) — fournit `num_marche`, `montant_max`, `categorie_libelle`
2. **DECP nationale** sur data.gouv.fr (ingestion via `fetch_decp_paris.py`) — apporte `ccag`, `code_cpv`, `lieu_execution`, `offres_recues`, `montant_notifie`, clauses RSE

Clé de jointure : `SUBSTR(stg_marches_publics.numero_marche, 5) = stg_decp_marches_paris.decp_id`.
Dédup multi-titulaires par `(objet, montant, date_notification)` dans `core_marches_publics` pour éviter le sur-comptage des accords-cadres.

## 📊 Modèles principaux

| Modèle | Description |
|--------|-------------|
| `core_budget` | Budget consolidé (recettes/dépenses) |
| `core_subventions` | Subventions enrichies (thématique, bénéficiaire) |
| `core_ap_projets` | Investissements géolocalisés |
| `core_logements_sociaux` | Logements sociaux par arrondissement |
| `core_marches_publics` | Marchés fusionnés opendata.paris.fr + DECP nationale |

## ⚠️ Règles métier

Voir `docs/architecture-modelling.md` pour les règles anti-double comptage.
