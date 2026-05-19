# France Open Data

> Transparence des finances publiques de Paris — [franceopendata.org](https://franceopendata.org)

[![CI](https://github.com/Nuttux/open-public-data/actions/workflows/ci.yml/badge.svg)](https://github.com/Nuttux/open-public-data/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![dbt](https://img.shields.io/badge/dbt-BigQuery-orange)](https://www.getdbt.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Open Data](https://img.shields.io/badge/Source-OpenData%20Paris-green)](https://opendata.paris.fr/)

## Le projet

Dashboard interactif pour explorer les finances de la Ville de Paris (~11 Md/an), construit entièrement sur des données publiques.

### Pages

| Page | Description |
|------|-------------|
| **Accueil** | Vue d'ensemble, KPI, navigation |
| **Budget** | Sankey recettes/dépenses, drill-down par chapitre, donut par nature |
| **Patrimoine** | Bilan Actif/Passif, dette, ratios financiers, épargne brute |
| **Investissements** | Projets par arrondissement (carte, liste, choropleth), tendances par secteur |
| **Logements** | Logements sociaux financés (carte, liste, choropleth par arrondissement) |
| **Subventions** | 40k+ bénéficiaires, treemap par thématique, table filtrable |
| **Prevision** | Comparaison Budget Voté vs Exécuté, estimations 2025-2026 |
| **Blog** | Articles sur les données et la méthodologie |

Chaque page thématique suit une architecture en 3 onglets : **Annuel**, **Tendances**, **Explorer**.

## Structure

```
open-public-data/
├── pipeline/                    # Pipeline dbt (BigQuery)
│   ├── models/
│   │   ├── staging/             # 9 modèles — nettoyage, typage
│   │   ├── intermediate/        # Enrichissement (LLM, géoloc)
│   │   ├── core/                # 6 tables OBT dénormalisées
│   │   └── marts/               # 10 vues d'agrégation métier
│   ├── seeds/                   # Mappings + caches enrichissement (CSV)
│   ├── scripts/                 # Sync, export, enrichissement, extraction PDF
│   └── tests/                   # 42 tests qualité (7 catégories)
│
├── website/                     # Next.js 16 (App Router, Turbopack)
│   ├── src/
│   │   ├── app/                 # Pages (10 routes)
│   │   ├── components/          # 40+ composants React (ECharts, Leaflet)
│   │   └── lib/                 # Utils, hooks, types, API loaders
│   └── public/data/             # JSON pré-calculés (budget, carte, subventions)
│
├── scripts/                     # Scripts utilitaires
│   └── sync-to-public.sh        # Sync vers le repo public
│
└── docs/                        # Documentation
    ├── architecture-modelling.md # Pipeline, règles métier, qualité
    ├── architecture-frontend.md  # Composants, design system
    └── data-quality.md           # Limites et pistes d'amélioration
```

## Pipeline

Architecture en couches : `OpenData Paris API → BigQuery (raw) → staging → intermediate → core → marts → JSON`

### Entités

| Core table | Description | Années |
|------------|-------------|--------|
| `core_budget` | Budget exécuté (Compte Administratif) | 2019-2024 |
| `core_budget_vote` | Budget prévisionnel (Budget Primitif, PDFs) | 2023-2026 |
| `core_bilan_comptable` | Actif/Passif, dette, épargne | 2019-2024 |
| `core_subventions` | Subventions enrichies (thématique LLM) | 2018-2024 |
| `core_ap_projets` | Investissements géolocalisés | 2018-2022 |
| `core_logements_sociaux` | Logements sociaux financés | 2001-2024 |

### Tests qualité

42 tests dbt organisés en 7 catégories :
- Intégrité référentielle, équilibres comptables, fraîcheur, complétude, cross-layer, anomalies, qualité des seeds

Plus un **audit re-jouable** (19 checks réconciliation + complétude + freshness) consommé par [`/methode#audit`](https://franceopendata.org/methode#audit) — voir [`pipeline/scripts/audit/run_data_quality_audit.py`](pipeline/scripts/audit/run_data_quality_audit.py).

## Setup nouvel ordi / nouveau contributeur

Tout le state lourd (données BigQuery, IAM/auth, secrets CI, cron) vit dans le cloud (GCP + GitHub). Le clone local est juste un workstation jetable.

```bash
# 1. Outils
brew install gcloud gh git python@3.11 node

# 2. Auth (web sign-in, à faire 1 fois par ordi)
gcloud auth login
gcloud auth application-default login   # ADC pour les scripts Python
gh auth login

# 3. Clone + venv
git clone https://github.com/Nuttux/open-public-data.git
cd open-public-data
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd website && npm install
```

Tu retombes sur tes pieds sans rien re-configurer côté CI : BQ-CI continue de tourner tous les lundis indépendamment de ton matos.

## CI / Automatisation

| Workflow | Cadence | Ce que ça fait |
|---|---|---|
| `data-platform-audit.yml` | À chaque PR + push sur `main` | Layering audit, dbt parse, schema completeness, **dbt test (data + freshness)**, **verify_export**, **data-quality-audit (19 checks)** |
| `enrich-pipeline.yml` | **Lundi 6h UTC** + manuel | Pipeline complète : sync OpenData → dbt → export JSON → enrichissement LLM, auto-commit si diff |

**Auth GCP en CI** : Workload Identity Federation (WIF), zéro clé statique. Voir [`docs/runbooks/enable-bq-ci.md`](docs/runbooks/enable-bq-ci.md) si tu dois ré-activer ou déplacer le setup ailleurs.

Activé par les variables/secrets de repo (à ne jamais commit) :
- `vars.ENABLE_BQ_CI` (`true` = jobs BQ-dependent actifs)
- `secrets.GCP_WORKLOAD_IDENTITY_PROVIDER` + `secrets.GCP_SERVICE_ACCOUNT`

Pour déclencher un sync manuellement (sans attendre lundi) :

```bash
gh workflow run enrich-pipeline.yml -R Nuttux/open-public-data \
  -f phases=auto -f commit=true
```

L'audit data quality est consommé par `/methode#audit` (snapshot JSON public + script re-jouable). Voir [`docs/data-quality.md`](docs/data-quality.md) pour les 19 checks.

## Quickstart (local dev)

### Prérequis
- Python 3.10+
- Node.js 20+
- Accès GCP (BigQuery)

### Configuration env

Avant de lancer pipeline ou website, copier les fichiers `.env.example` :

```bash
cp website/.env.example website/.env.local
cp pipeline/.env.example pipeline/.env
```

Puis remplir les vraies valeurs. Les fichiers `.env*` sont déjà en `.gitignore` — ils ne quittent jamais ta machine. Détail des variables et leur usage : commentaires dans chaque `.env.example`.

Sans clés API, les enrichissements LLM et photo sont sautés (le pipeline reste fonctionnel sur le coeur). Sans `ANTHROPIC_API_KEY` côté website, le chat assistant renvoie 500.

### Pipeline

```bash
source .venv/bin/activate
cd pipeline
dbt deps && dbt seed && dbt run
python scripts/export/export_all.py
```

### Website

```bash
cd website
npm install
npm run dev
# → http://localhost:3000
```

### CI

PR vers `main` déclenche [`.github/workflows/ci.yml`](.github/workflows/ci.yml) :

| Job | Étapes |
|-----|--------|
| **website** | `npm ci` → `npm run lint` → `npm run typecheck` → `npm run build` |
| **pipeline-python** | `python -m compileall pipeline/scripts/` (sanity check syntaxe) |

À reproduire en local avant de pousser :
```bash
cd website && npm run lint && npm run typecheck && npm run build
python3 -m compileall -q pipeline/scripts/
```

Tests unitaires à venir — voir [`docs/testing.md`](docs/testing.md) pour la liste priorisée.

### Sync vers le repo public

Le pipeline et les composants de visualisation sont open source dans [Nuttux/france-open-data](https://github.com/Nuttux/france-open-data).

```bash
./scripts/sync-to-public.sh
```

## Documentation

| Document | Contenu |
|----------|---------|
| [`docs/architecture-modelling.md`](docs/architecture-modelling.md) | Pipeline dbt, règles métier, qualité données |
| [`docs/architecture-frontend.md`](docs/architecture-frontend.md) | Composants React, design system |
| [`docs/data-quality.md`](docs/data-quality.md) | Limites connues, pistes d'amélioration |
| [`pipeline/README.md`](pipeline/README.md) | Commandes dbt, enrichissement |
| [`docs/runbooks/`](docs/runbooks/) | Runbooks ops : rollback, promotion WIP |

## Deploiement

- **Hosting** : Vercel (CDG1 region)
- **Domaine** : [franceopendata.org](https://franceopendata.org)
- **Deploiement auto** : push sur `main` → build Vercel
- **Rollback en cas de prod cassée** : voir [`docs/runbooks/rollback.md`](docs/runbooks/rollback.md) — procédure 1 minute via Vercel dashboard, sans toucher au code source.

## License

MIT
