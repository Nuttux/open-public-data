# Paris Budget Dashboard - Projet dbt

> Transformation des données ouvertes du budget de Paris pour visualisation interactive.

## 🎯 Philosophie du projet

### Flat Modeling (OBT - One Big Table)
Pas de normalisation complexe. On construit des **tables larges et dénormalisées** prêtes pour l'analyse et la visualisation. Chaque table finale (`analytics_*_complet`) contient tout ce qu'il faut pour un cas d'usage.

### Static Data First
Le frontend Next.js consomme des **fichiers JSON pré-calculés**, pas des appels API live. Cela garantit des performances optimales et fonctionne hors-ligne.

### French Naming
Toutes les colonnes et la documentation utilisent des **noms en français** standardisés (`montant`, `annee`, `sens_flux`, etc.).

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     BIGQUERY (raw)                               │
│  Tables brutes importées depuis Paris OpenData                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     STAGING (vues)                               │
│  Nettoyage, typage, filtre "Réel", renommage FR                 │
│  - stg_budget_mairie_centrale                                    │
│  - stg_investissements (+ extraction arrondissement regex)       │
│  - stg_associations (+ normalisation SIRET)                      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   INTERMEDIATE (tables)                          │
│  Logique métier + Enrichissement géographique                    │
│  - int_budget_central_m57 (filtre 2019+, exclut dotations)      │
│  - int_investissements_geo (+ enrichissement LLM)                │
│  - int_subventions_geo (+ géoloc via API Entreprises)            │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CORE / OBT (tables)                         │
│  Tables finales dénormalisées pour le frontend                   │
│  - analytics_finances_macro_complet → Sankey budget              │
│  - analytics_investissements_geo_complet → Carte projets         │
│  - analytics_subventions_geo_complet → Carte subventions         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼ (export_dbt_to_json.py)
┌─────────────────────────────────────────────────────────────────┐
│                   FRONTEND (JSON statiques)                      │
│  /frontend/public/data/*.json                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Structure du projet

```
paris-public-open-data/
├── dbt_project.yml           # Configuration dbt
├── profiles.yml              # Connexion BigQuery
├── models/
│   ├── staging/              # Vues de nettoyage
│   │   ├── sources.yml       # Déclaration des tables raw
│   │   ├── schema.yml        # Documentation
│   │   ├── stg_budget_mairie_centrale.sql
│   │   ├── stg_budget_arrondissements.sql
│   │   ├── stg_investissements.sql
│   │   ├── stg_associations.sql
│   │   ├── stg_logements_sociaux.sql
│   │   └── stg_marches_publics.sql
│   ├── intermediate/         # Logique métier
│   │   ├── int_budget_central_m57.sql
│   │   ├── int_budget_arrondissements_m57.sql
│   │   ├── int_investissements_geo.sql
│   │   └── int_subventions_geo.sql
│   └── core/                 # Tables finales (OBT)
│       ├── analytics_finances_macro_complet.sql
│       ├── analytics_investissements_geo_complet.sql
│       └── analytics_subventions_geo_complet.sql
└── seeds/                    # Caches d'enrichissement
    ├── seed_geo_siret_cache.csv
    └── seed_llm_investissements.csv
```

---

## 📊 Tables sources (BigQuery `raw`)

| Table | Description | Usage |
|-------|-------------|-------|
| `budget_mairie_centrale` | Budget principal Ville+Département | Sankey |
| `budget_arrondissements` | Budgets locaux par arrondissement | Sankey |
| `investissements` | Autorisations de programmes (AP/CP) | Carte |
| `associations` | Subventions aux associations | Carte |
| `logements_sociaux` | Logements sociaux (déjà géolocalisés) | Carte |
| `marches_publics` | Marchés publics (contexte) | - |
| `bilan_comptable` | Bilan actif/passif | - |

---

## ⚠️ Règles métier critiques

### Règle 6A : Filtre "Réel"
On ne compte que les opérations **réalisées** (`type_d_operation = 'Réel'`).
Les écritures "Pour Ordre" sont des mouvements comptables internes.

### Règle 6B : Anti-double comptage
Pour consolider Central + Arrondissements, on **exclut les dotations aux arrondissements** du budget central (sinon on compte deux fois).

### Règle 6C : AP/CP
Utiliser `mandate_titre_apres_regul` (montant annuel mandaté).
**NE JAMAIS** sommer `montant_ap` (c'est l'enveloppe pluriannuelle).

### Subventions = Subset
Les subventions sont un **zoom** sur une partie du budget.
Ne jamais les additionner au budget principal.

---

## 🚀 Démarrage rapide

### Prérequis
- Python 3.10+
- dbt-bigquery (`pip install dbt-bigquery`)
- Accès GCP authentifié
- Clé API Gemini (pour enrichissement LLM)

### 1. Configuration

```bash
# Authentification GCP
gcloud auth application-default login

# Clé API Gemini (pour enrichissement LLM)
export GEMINI_API_KEY='votre_clé_api_gemini'

# Installer les dépendances Python
pip install -r requirements.txt
```

### 2. Pipeline complet (recommandé)

```bash
# Exécuter tout le pipeline en une commande
python scripts/run_pipeline.py
```

Le script `run_pipeline.py` exécute automatiquement:
1. **sync** : Télécharge les données depuis Paris Open Data → BigQuery
2. **dbt** : Transforme les données (staging → intermediate → core)
3. **enrich** : Enrichit via Gemini 3 Pro (localisation, descriptions)
4. **export** : Génère les JSON pour le frontend

### 3. Exécution par étapes

```bash
# Synchroniser les données depuis Paris Open Data
python scripts/sync_opendata.py

# Exécuter dbt
dbt seed  # Charger les caches d'enrichissement
dbt run   # Transformer les données

# Enrichir via LLM (Gemini 3 Pro)
python scripts/enrich_geo_data.py --mode all --llm-limit 200

# Exporter vers JSON
python scripts/export_sankey_data.py
python scripts/export_map_data.py
```

### 4. Lancer le frontend

```bash
cd frontend
npm run dev
```

### 5. Vérifier la disponibilité des données

```bash
# Voir quelles années ont des données complètes
python scripts/sync_opendata.py --check
```

---

## 🗺️ Enrichissement géographique

### Subventions (SIRET → GPS)
```bash
python scripts/enrich_geo_data.py --mode siret
```
Appelle l'API Entreprises pour géolocaliser les associations via leur SIRET.

### Investissements (Texte → Enrichissement complet)
```bash
export GEMINI_API_KEY="votre_clé"
python scripts/enrich_geo_data.py --mode llm --llm-limit 200
```

Utilise **Gemini 3 Pro** pour enrichir les projets d'investissement:
- **Description complète** : Reconstitue les descriptions tronquées
- **Arrondissement** : Identifie le 1er-20ème
- **Adresse approximative** : Si connue (ex: "Gymnase Japy" → "2 rue Japy, 75011")
- **Type d'équipement** : école, gymnase, piscine, musée, etc.
- **Catégorie Sankey** : Pour le drill-down (Éducation, Culture, etc.)
- **Score de confiance** : 0-1 (items < 0.7 marqués incertains)

Le cache est stocké dans `seeds/seed_llm_investissements.csv` pour éviter de refaire les appels.

### Subventions (Catégorisation LLM)
```bash
python scripts/enrich_geo_data.py --mode llm-subventions --llm-limit 500
```
Catégorise les subventions pour le Sankey drill-down.

---

## 📚 Commandes utiles

| Commande | Description |
|----------|-------------|
| `dbt debug` | Tester la connexion BigQuery |
| `dbt compile` | Compiler sans exécuter |
| `dbt run` | Exécuter tous les modèles |
| `dbt run --select +analytics_finances_macro_complet` | Exécuter un modèle et ses dépendances |
| `dbt test` | Lancer les tests |
| `dbt docs generate && dbt docs serve` | Documentation interactive |

---

## 🔗 Ressources

- [Paris OpenData](https://opendata.paris.fr/)
- [dbt Documentation](https://docs.getdbt.com/)
- [API Entreprises](https://recherche-entreprises.api.gouv.fr/)
