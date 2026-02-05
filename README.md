# Données Lumières 🏛️

> Transparence des finances publiques de Paris — Open Data pour la démocratie

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![dbt](https://img.shields.io/badge/dbt-BigQuery-orange)](https://www.getdbt.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 🎯 Le projet

Dashboard interactif pour explorer le budget de la Ville de Paris (~11 Md€/an) :
- **Sankey** : Flux recettes → dépenses par chapitre
- **Subventions** : 40k+ bénéficiaires classés par thématique
- **Carte** : Logements sociaux et investissements géolocalisés
- **Évolution** : Tendances 2019-2024

**[📊 Sources OpenData Paris](https://opendata.paris.fr/)**

---

## 📁 Structure

```
├── pipeline/           # dbt models + scripts Python
│   ├── models/         # staging → intermediate → core → marts
│   ├── seeds/          # Caches d'enrichissement (LLM, géoloc)
│   └── scripts/        # Export, enrichissement, sync
│
├── website/            # Next.js 16 (App Router)
│   ├── src/app/        # Pages (/, /budget, /subventions, /carte, /blog)
│   └── public/data/    # JSON pré-calculés
│
└── docs/               # Architecture détaillée
```

---

## 🚀 Quickstart

### Prérequis
- Python 3.10+ avec venv
- Node.js 20+
- Accès GCP (BigQuery)

### 1. Pipeline (données)

```bash
# Activer l'environnement Python
source .venv/bin/activate

# Exécuter dbt
cd pipeline
dbt run

# Exporter vers JSON
python scripts/export/export_all.py
```

### 2. Website

```bash
cd website
npm install
npm run dev
# → http://localhost:3000
```

---

## 📚 Documentation

| Document | Contenu |
|----------|---------|
| [`docs/architecture-modelling.md`](docs/architecture-modelling.md) | Pipeline dbt, règles métier, qualité données |
| [`docs/architecture-frontend.md`](docs/architecture-frontend.md) | Composants React, design system |
| [`pipeline/README.md`](pipeline/README.md) | Commandes dbt, enrichissement |
| [`website/README.md`](website/README.md) | Next.js, routes, composants |

---

## ⚠️ Règles métier critiques

1. **Filtre "Réel"** : Exclure les opérations "Pour Ordre"
2. **Anti-double comptage** : Subventions = subset du budget (pas une addition)
3. **AP/CP** : Utiliser `mandaté_après_régul`, jamais `montant_ap`

Voir [`docs/architecture-modelling.md`](docs/architecture-modelling.md) pour les détails.

---

## 🤝 Contribution

1. Fork le repo
2. Crée une branche (`git checkout -b feature/ma-feature`)
3. Commit en français (`git commit -m "feat: ajouter X"`)
4. Push et ouvre une PR

---

## 📄 License

MIT — Données publiques Paris OpenData
