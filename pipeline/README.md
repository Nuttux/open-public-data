# Pipeline — France Open Data

> Pipeline open source qui transforme les données publiques des collectivités françaises en JSON exploitables par le site [franceopendata.org](https://franceopendata.org).

**Licence** : [GNU AGPL-3.0](../LICENSE) · **Données dérivées** : [Licence Ouverte Etalab 2.0](https://www.data.gouv.fr/pages/legal/licences/etalab-2.0)

---

## À propos

Ce pipeline ingère les données ouvertes publiées par les administrations françaises (Open Data Paris, DECP, INSEE, DGFiP, OFGL…), les nettoie, les enrichit, les normalise, puis exporte des fichiers JSON consommés par le site web.

Publié sous licence **GNU AGPL-3.0**.

## Architecture

```
Sources publiques → BigQuery (raw) → staging → intermediate → core (OBT) → marts → JSON
```

Détail :
- **raw** : ingestion brute (OpenData Paris, DECP, INSEE…)
- **staging** : typage, nettoyage, filtres minimaux
- **intermediate** : jointures, enrichissements (thématique, géoloc, SIREN)
- **core** : One Big Tables row-level pour analytics
- **marts** : agrégations pré-calculées pour le frontend
- **export** : JSON statiques dans `website/public/data/`

## 🚀 Reproduire les chiffres affichés sur le site

Pour **vérifier** un chiffre publié sur franceopendata.org en le recalculant depuis les sources :

```bash
# Prérequis : Python 3.11+, gcloud CLI
git clone https://github.com/AbstractsMachine/france-open-data-pipeline
cd france-open-data-pipeline/pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r ../requirements.txt

# Authentification BigQuery (lecture seule, gratuit)
gcloud auth application-default login

# Recompiler les JSON depuis les datasets BigQuery publics
python scripts/export/export_all.py
```

Les fichiers JSON régénérés se trouvent dans `../website/public/data/`. Vous pouvez les comparer avec ceux publiés sur le site.

**Les datasets BigQuery `open-data-france-484717.dbt_paris_*` sont ouverts en lecture publique** (`allUsers` reader). Aucun projet GCP propre n'est nécessaire pour la reproduction des chiffres.

## Variables d'environnement

Voir [.env.example](.env.example) pour la liste complète.

| Variable | Usage |
|---|---|
| `BQ_PROJECT` | Projet GCP cible (défaut : `open-data-france-484717`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service account JSON pour écriture BQ (requis pour `dbt run`) |
| `ANTHROPIC_API_KEY` | Enrichissement LLM tier 1 (vulgarisations) |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Enrichissement LLM grounded (SIRET, thématiques) |
| `PEXELS_API_KEY` / `UNSPLASH_ACCESS_KEY` | Photos d'illustration (optionnel) |

## Commandes principales

```bash
# dbt
dbt deps                                                # Installer packages
dbt seed                                                # Charger les caches CSV
dbt run                                                 # Transformer les données
dbt test                                                # Lancer les tests

# Sync des sources
python scripts/sync/sync_city.py paris                  # Sources Ville de Paris (ODS, configs/cities/paris.yaml)
python scripts/sync/fetch_decp_paris.py --global        # DECP nationale (tout l'historique)
python scripts/sync/fetch_decp_paris.py --year 2024     # Une année DECP spécifique

# Export vers website
python scripts/export/export_all.py
python scripts/export/export_marches_data.py            # Marchés seuls

# Enrichissement LLM (optionnel)
python scripts/enrich/enrich_thematique_llm.py
```

## Structure

```
pipeline/
├── models/
│   ├── staging/        # Nettoyage, typage, filtre "Réel"
│   ├── intermediate/   # Enrichissement, jointures
│   ├── core/           # Tables OBT (One Big Table)
│   └── marts/          # Vues pour export JSON
├── seeds/              # Caches LLM et géoloc (CSV)
├── scripts/
│   ├── export/         # export_sankey, export_map, etc.
│   ├── enrich/         # LLM pour thématiques/géoloc
│   ├── sync/           # Sync depuis OpenData Paris + DECP
│   └── utils/          # Logger partagé
├── profiles.yml        # Config dbt → BigQuery
└── dbt_project.yml     # Config dbt projet
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

Voir [`docs/architecture-modelling.md`](../docs/architecture-modelling.md) pour les règles anti-double comptage et le détail des choix de modélisation.

## Contact

Site : [franceopendata.org](https://franceopendata.org) · Contact : daniel@franceopendata.org
