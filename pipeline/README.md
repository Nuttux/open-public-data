# Pipeline — France Open Data

> Pipeline open source qui transforme les données publiques des collectivités françaises en JSON exploitables par le site [franceopendata.org](https://franceopendata.org).

**Licence** : [GNU AGPL-3.0](../LICENSE) · **Données dérivées** : [Licence Ouverte Etalab 2.0](https://www.data.gouv.fr/pages/legal/licences/etalab-2.0)

---

## À propos

Ce pipeline ingère les données ouvertes publiées par les administrations françaises (Open Data Paris, DECP, INSEE, DGFiP, OFGL…), les nettoie, les enrichit, les normalise, puis exporte des fichiers JSON consommés par le site web.

Il est publié sous licence **AGPL-3.0**. Le code applicatif du site web reste fermé à ce stade — il sera publié séparément une fois stabilisé. Voir la [page licence du site](https://franceopendata.org/licence) pour les détails.

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

## 🚀 Quickstart — reproduire les chiffres du site

Si vous voulez **vérifier** un chiffre affiché sur franceopendata.org en le recalculant depuis les sources :

```bash
# Prérequis : Python 3.11+, gcloud CLI
git clone <repo-url> france-open-data-pipeline
cd france-open-data-pipeline/pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r ../requirements.txt

# Authentification BigQuery (lecture seule, gratuit)
gcloud auth application-default login

# Recompiler les JSON depuis les datasets BigQuery publics
python scripts/export/export_all.py
```

Les fichiers JSON régénérés se trouvent dans `../website/public/data/`. Vous pouvez les comparer avec ceux publiés sur le site.

**Les datasets BigQuery `open-data-france-484717.dbt_paris_*` sont ouverts en lecture publique** (`allUsers` reader). Aucun projet GCP propre n'est nécessaire pour le mode reproduction.

## 🍴 Forker pour une autre ville

Vous voulez adapter ce pipeline à votre territoire (Marseille, Toulouse, une région, un département) ? C'est le but principal de la publication.

```bash
# 1. Cloner et configurer votre propre projet GCP
git clone <repo-url> ma-ville-pipeline
cd ma-ville-pipeline/pipeline
cp .env.example .env  # éditer avec vos clés

# 2. Pointer vers VOTRE projet BigQuery (au lieu du nôtre)
export BQ_PROJECT=mon-projet-gcp
export GOOGLE_APPLICATION_CREDENTIALS=/chemin/vers/service-account.json

# 3. Adapter les sources (scripts/sync/) à votre portail open data
#    et les seeds (seeds/) à votre périmètre

# 4. Run
dbt deps
dbt seed
dbt run
```

**Points d'adaptation principaux** :
- `scripts/sync/sync_opendata.py` : pointer vers votre portail open data (Toulouse, Marseille, etc.)
- `seeds/seed_mapping_*.csv` : adapter les mappings thématiques à vos chapitres budgétaires
- `models/staging/stg_*.sql` : ajuster les filtres aux schémas de vos données

Sous AGPL, votre fork doit être publié sous AGPL également si vous le déployez en service en ligne. Voir [la page licence](https://franceopendata.org/licence) pour le détail des obligations.

## Variables d'environnement

Toutes les clés sont optionnelles selon les scripts utilisés. Voir [.env.example](.env.example) pour la liste complète.

| Variable | Usage |
|---|---|
| `BQ_PROJECT` | Projet GCP cible (défaut : `open-data-france-484717`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service account JSON pour écriture BQ (requis pour `dbt run`) |
| `ANTHROPIC_API_KEY` | Enrichissement LLM tier 1 (vulgarisations) — opt-in via `--tier1` |
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
python scripts/sync/sync_opendata.py                    # Sources Ville de Paris (opendata.paris.fr)
python scripts/sync/fetch_decp_paris.py --global        # DECP nationale (tout l'historique)
python scripts/sync/fetch_decp_paris.py --year 2024     # Une année DECP spécifique

# Export vers website
python scripts/export/export_all.py
python scripts/export/export_marches_data.py            # Marchés seuls

# Enrichissement LLM (optionnel, payant)
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
│   ├── enrich/         # LLM (Gemini, Claude) pour thématiques/géoloc
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

## Contribuer

Issues et PR bienvenues sur les sujets suivants :
- Adapter le pipeline à une nouvelle collectivité
- Améliorer la qualité des enrichissements (thématique, géoloc, SIREN)
- Ajouter des sources publiques (OFGL, DGFiP, INSEE…)
- Corriger une règle métier mal documentée

Voir [CONTRIBUTING.md](../CONTRIBUTING.md) si présent, sinon ouvrir une issue pour discuter.

## Contact

Site : [franceopendata.org](https://franceopendata.org) · Contact : daniel@franceopendata.org
