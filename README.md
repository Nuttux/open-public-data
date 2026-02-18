# France Open Data

> Transparence des finances publiques de Paris — [franceopendata.org](https://franceopendata.org)

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

## Quickstart

### Prérequis
- Python 3.10+
- Node.js 20+
- Accès GCP (BigQuery)

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

## Deploiement

- **Hosting** : Vercel (CDG1 region)
- **Domaine** : [franceopendata.org](https://franceopendata.org)
- **Deploiement auto** : push sur `main` → build Vercel

## License

MIT
