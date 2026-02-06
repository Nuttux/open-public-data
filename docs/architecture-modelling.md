# ARCHITECTURE DATA MODELLING - PARIS BUDGET DASHBOARD

> Mis à jour le 2026-02-06. Pipeline complet validé (audit 12/12 OK).
> Nouvelles entités : `core_budget_vote` (2023-2026 PDF), `mart_vote_vs_execute`.

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Sources de données](#2-sources-de-données)
3. [Architecture des couches](#3-architecture-des-couches)
4. [Conventions de nommage](#4-conventions-de-nommage)
5. [Stratégie de jointure](#5-stratégie-de-jointure)
6. [Enrichissement](#6-enrichissement)
7. [Scripts Python](#7-scripts-python)
8. [Export et Frontend](#8-export-et-frontend)
9. [Qualité des données](#9-qualité-des-données)
10. [Structure des fichiers](#11-structure-des-fichiers)
11. [Workflow de mise à jour](#12-workflow-de-mise-à-jour)

---

## 1. Vue d'ensemble

### 1.1 Objectif

Dashboard interactif pour les Parisiens, organisé par entité de données :
- **Budget** : Sankey, évolution, comparaison Voté/Exécuté, estimations 2025-2026
- **Patrimoine** : Actif/Passif, dette, épargne brute
- **Subventions** : Treemap par thématique, table filtrable bénéficiaires
- **Investissements** : Projets AP géolocalisés par arrondissement
- **Logements** : Logements sociaux financés, choroplèthe

> **Insight clé** : Les subventions vont à des ORGANISATIONS, pas à des LIEUX.
> Pas de carte pour les subventions — uniquement classification thématique avec drill-down.

### 1.2 Principes architecturaux

| Principe | Description |
|----------|-------------|
| **OBT (One Big Table)** | Tables finales dénormalisées, une OBT par entité |
| **Exécuté ≠ Voté** | `core_budget` (CA) et `core_budget_vote` (BP) sont des entités séparées. Jamais UNIONés. Comparaison dans `mart_vote_vs_execute` uniquement |
| **Static Data First** | JSON pré-calculés, pas d'API live |
| **Enrichissement incrémental** | Seeds = cache persistant, ne traite que les nouveaux records |
| **Séparation données/enrichissement** | Préfixe `ode_` pour distinguer original vs enrichi |
| **LLM hors pipeline** | LLM uniquement dans scripts Python, jamais dans dbt |

### 1.3 Diagramme global

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              OPENDATA PARIS API                                  │
│  (7 datasets : budget CA, budget BV, AP, subventions, assoc, logements, marchés)│
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                    scripts/sync_opendata.py
                    (SKIP si table déjà à jour)
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         BIGQUERY - raw                                           │
│  Tables brutes, noms = dataset_id OpenData (snake_case), AUCUNE transformation  │
└────────────────────────────────┬────────────────────────────────────────────────┘
                                 │
                              dbt run
                                 │
┌────────────────────────────────┼────────────────────────────────────────────────┐
│  STAGING (Views)               │  Nettoyage, typage, clés standardisées        │
├────────────────────────────────┼────────────────────────────────────────────────┤
│  SEEDS (CSV)                   │  Mappings statiques + Caches enrichissement   │
│  ← Scripts Python (hors dbt)   │  (incrémental, asyncio, LLM batch)            │
├────────────────────────────────┼────────────────────────────────────────────────┤
│  INTERMEDIATE (Tables)         │  JOIN staging + seeds → colonnes ode_*        │
├────────────────────────────────┼────────────────────────────────────────────────┤
│  CORE (Tables OBT)             │  1 table wide par entité                      │
│  core_budget         (CA)      │  Budget EXÉCUTÉ (source de vérité)             │
│  core_budget_vote    (BV)      │  Budget VOTÉ (prévisionnel)                    │
│  core_subventions              │  (+ ap_projets, logements, bilan)              │
│  core_ap_projets               │                                                │
│  core_logements_sociaux        │                                                │
├────────────────────────────────┼────────────────────────────────────────────────┤
│  MARTS (Views)                 │  Agrégations métier (Sankey, cartes, stats)   │
└────────────────────────────────┼────────────────────────────────────────────────┘
                                 │
                  scripts/export_*.py
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      website/public/data/                                        │
│            JSON statiques pour Next.js (par entité, avec type_budget)           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Sources de données

### 2.1 Inventaire OpenData Paris

> **Convention raw** : Nom table = dataset_id OpenData en snake_case (aucune abréviation)

| # | Dataset | Table raw | Records | Usage |
|---|---------|-----------|---------|-------|
| 1 | `comptes-administratifs-budgets-principaux-*` | `comptes_administratifs_budgets_principaux_*` | ~25k | Budget exécuté (CA) |
| 2 | `comptes-administratifs-autorisations-de-programmes-*` | `comptes_administratifs_autorisations_*` | ~7k | Projets AP |
| 3 | `subventions-versees-annexe-compte-administratif-*` | `subventions_versees_*` | ~47k | Subventions |
| 4 | `subventions-associations-votees-` | `subventions_associations_votees` | ~100k | Détail SIRET |
| 5 | `logements-sociaux-finances-a-paris` | `logements_sociaux_finances_a_paris` | ~4k | Déjà géolocalisé |
| 6 | `liste-des-marches-de-la-collectivite-parisienne` | `liste_des_marches_*` | ~17k | Contexte (non sommable) |
| 7 | `budgets-votes-principaux-a-partir-de-2019-*` | `budgets_votes_principaux_*` | ~30k | Budget voté (BV) |

### 2.2 Colonnes clés

**CA Budget Principal (source de vérité — exécuté)** :
`exercice_comptable`, `section_budgetaire_i_f`, `sens_depense_recette`, `type_d_operation_r_o_i_m`, `chapitre_budgetaire_cle`, `nature_budgetaire_cle`, `fonction_cle`, `mandate_titre_apres_regul`

**BV Budget Voté (prévisionnel)** :
Structure quasi-identique au CA. Différences :
- `credits_votes_pmt` au lieu de `mandate_titre_apres_regul`
- `type_du_vote` : "Budget primitif", "DM1", "DM2"...
- Couverture : 2019-2026 (CA s'arrête à 2024)

### 2.3 Sources PDF

| Type | Contenu | Années | Sémantique |
|------|---------|--------|------------|
| **CA IL** | Investissements réellement dépensés | 2018-2024 | Mandaté (exécuté) |
| **BP IL** | Investissements votés/prévus | 2025-2026 | Crédits votés (prévisionnel) |
| **BP Budget** | Budget voté par chapitre/nature/fonction | 2023-2026 | Crédits votés (prévisionnel) |

> Les BP IL et BP Budget sont des données PRÉVISIONNELLES.
> Le frontend DOIT afficher un badge "Voté" pour les années 2025-2026.

**PDFs CA IL** :
- 2024: `ca-2024-annexe-il-UtMj.PDF`
- 2023: `ca-2023-investissements-localises-tJO3.pdf`
- 2022: `09-ca-2022-investissements-localises-3owH.pdf`
- 2021: `c86533a2c6f36bfe643e8dffb782c772.pdf`

**PDFs BP IL** :
- 2025: `bp-2025-editique-il-Yt2X.pdf`
- 2026: À récupérer sur paris.fr

---

## 3. Architecture des couches

### 3.1 RAW Layer

Miroir exact d'OpenData Paris. Aucune transformation. Sync = `WRITE_TRUNCATE`.

### 3.2 STAGING Layer (Views)

Nettoyage, typage, renommage standardisé. Pas de logique métier. 1 staging = 1 source brute.

| Modèle | Source | Transformations clés |
|--------|--------|---------------------|
| `stg_budget_principal` | CA budget | Filtre `type_op='Réel'`, typage montant, renommage FR |
| `stg_budget_vote` | BV budget (OpenData CSV) | Filtre `type_op='Réel'` + `type_vote='BP'`, `credits_votes_pmt` → montant |
| `stg_pdf_budget_vote` | Seeds PDF budget voté | UNION `seed_pdf_budget_vote_{2023..2026}`, normalise chapitre_code (retire tirets) |
| `stg_ap_projets` | CA AP | Filtre Réel+Dépenses, extraction arrondissement regex |
| `stg_subventions_all` | CA subventions | Parse année, normalisation nom bénéficiaire |
| `stg_associations` | Associations votées | SIRET padding 14 chars, normalisation nom |
| `stg_logements_sociaux` | Logements | Parse `geo_point_2d` → lat/lng |
| `stg_marches_publics` | Marchés | Typage dates et montants |

> `stg_budget_vote` filtre `type_du_vote LIKE '%budget primitif%'` pour n'avoir que le BP initial (pas les DM).

### 3.3 SEEDS Layer (CSV)

Fichiers CSV versionnés dans Git. Deux types :

**Mappings statiques** :

| Seed | Contenu | Records |
|------|---------|---------|
| `seed_mapping_thematiques` | chapitre_code + fonction_prefix → thématique | ~15 |
| `seed_mapping_directions` | direction → thématique | ~25 |
| `seed_mapping_beneficiaires` | pattern regex → thématique | ~72 |
| `seed_mapping_entites` | pattern → nom_canonique (CASVP, etc.) | ~10 |
| `seed_lieux_connus` | pattern → adresse exacte (Piscine Pontoise, Gymnase Japy...) | ~50 |

**Caches enrichissement (générés par scripts)** :

| Seed | Source | Records |
|------|--------|---------|
| `seed_cache_thematique_beneficiaires` | LLM Gemini | 1,244 |
| `seed_cache_geo_ap` | LLM Gemini | 483 |
| `seed_pdf_budget_vote_{2023..2026}` | `extract_pdf_budget_vote.py` | ~1600-1900/an |
| `seed_pdf_investissements_{2022..2024}` | `extract_pdf_investments.py` | variable |

### 3.4 INTERMEDIATE Layer (Tables)

JOIN staging + seeds → ajout colonnes `ode_*`.

> **RÈGLE** : La consolidation de sources multiples (PDF + CSV) se fait TOUJOURS en INT, jamais en staging.

| Modèle | Sources | Enrichissements |
|--------|---------|-----------------|
| `int_subventions_enrichies` | `stg_subventions_all` + `stg_associations` + seeds | Cascade thématique : Pattern → Direction → LLM → Default. Ajout `ode_thematique`, `ode_type_organisme` |
| `int_ap_projets_enrichis` | `stg_ap_projets` + `seed_lieux_connus` + `seed_cache_geo_ap` | Cascade géoloc : Regex → Lieu connu → LLM. Ajout `ode_arrondissement`, `ode_latitude/longitude` |

### 3.5 CORE Layer (Tables OBT)

Une table dénormalisée (wide & flat) par entité. Grain le plus fin possible.

| Core table | Source | Grain | Années | Colonnes ode_* |
|------------|--------|-------|--------|----------------|
| `core_budget` | `stg_budget_principal` | (annee, section, chapitre, nature, fonction, sens_flux) | 2019-2024 | `ode_thematique`, `ode_categorie_flux` |
| `core_budget_vote` | `stg_pdf_budget_vote` | idem | 2023-2026 | `ode_thematique`, `ode_categorie_flux` (même logique que core_budget) |
| `core_subventions` | `int_subventions_enrichies` | (annee, beneficiaire_normalise, collectivite) | 2018-2024 | `ode_thematique`, `ode_type_organisme`, `ode_source_thematique` |
| `core_ap_projets` | `int_ap_projets_enrichis` | (annee, ap_code) | 2018-2022 | `ode_arrondissement`, `ode_latitude/longitude`, `ode_confiance` |
| `core_logements_sociaux` | `stg_logements_sociaux` | (id_livraison) | 2001-2024 | `ode_arrondissement_affichage` (Paris Centre 1-4 → 0) |

**Principe architectural critique** :

> `core_budget` (CA) et `core_budget_vote` (BV) sont deux entités distinctes.
> Elles ne sont JAMAIS UNIONées dans la couche core.
> La comparaison se fait uniquement dans `mart_vote_vs_execute`.
> Les marts existants (Sankey, évolution...) continuent de lire `core_budget` sans modification.

**core_budget_vote** utilise la même logique de mapping thématique que `core_budget` (seed_mapping_thematiques + fallback CASE par chapitre_code) et la même catégorisation des flux par nature_code.

### 3.6 MARTS Layer (Views)

Agrégations métier pour le dashboard. C'est ici qu'on JOIN/compare les entités.

| Mart | Source(s) | Fonction | Output |
|------|-----------|----------|--------|
| `mart_sankey` | core_budget + core_subventions + core_ap_projets | Diagramme flux budgétaires + drill-down | ~300 liens/an |
| `mart_subventions_treemap` | core_subventions | Treemap par thématique + top bénéficiaires | ~20 thématiques/an |
| `mart_subventions_beneficiaires` | core_subventions | Table filtrable | ~8k lignes/an |
| `mart_carte_investissements` | core_ap_projets | Projets géolocalisés | ~1k points/an |
| `mart_stats_arrondissements` | core_* | Stats agrégées par arrondissement | 20 × années |
| `mart_evolution_budget` | core_budget | Évolution temporelle YoY + variations par thématique | ~200 lignes |
| `mart_concentration` | core_subventions, core_ap | Analyse Pareto (top 80/95/reste) | ~500 lignes |
| **`mart_vote_vs_execute`** | **core_budget + core_budget_vote** | **Comparaison Voté/Exécuté + taux historique + estimation** | **~500 lignes** |

**`mart_vote_vs_execute` — Détail** :

- FULL OUTER JOIN `core_budget_vote` × `core_budget` sur (annee, section, sens_flux, chapitre_code, ode_thematique)
- Calcule : `taux_execution_pct`, `ecart_absolu`, `ecart_relatif_pct`
- CTE `taux_historique` : AVG/STDDEV du taux par poste (pour estimation 2025-2026)
- Colonnes output : `montant_estime`, `montant_estime_bas`, `montant_estime_haut` (±1σ)
- Flags : `comparaison_possible` (2023-2024), `vote_seul` (2025-2026)

### 3.7 Fonctionnalités transversales

**Paris Centre (arrondissements 1-4)** : Agrégés via `ode_arrondissement_affichage = 0` et `ode_arrondissement_label = 'Paris Centre'` dans `core_logements_sociaux` et `core_ap_projets`.

**Déduplication entités** : `seed_mapping_entites.csv` → colonne `ode_beneficiaire_canonique` dans `core_subventions` (ex: "CASVP" = 1,940 M€ total).

---

## 4. Conventions de nommage

### 4.1 Colonnes

| Préfixe | Signification | Exemple |
|---------|---------------|---------|
| *(aucun)* | Donnée originale OpenData | `beneficiaire`, `montant`, `annee` |
| `ode_` | **O**pen **D**ata **E**nrichment | `ode_thematique`, `ode_latitude` |

### 4.2 Tables

| Couche | Pattern | Exemple |
|--------|---------|---------|
| Raw | `{dataset_id_snake_case}` | `comptes_administratifs_budgets_principaux_*` |
| Staging | `stg_{entite}` | `stg_budget_principal`, `stg_pdf_budget_vote` |
| Intermediate | `int_{entite}_{action}` | `int_subventions_enrichies` |
| Core | `core_{entite}` | `core_budget`, `core_budget_vote` |
| Mart | `mart_{usage}` | `mart_sankey`, `mart_vote_vs_execute` |

### 4.3 Seeds

| Type | Pattern | Exemple |
|------|---------|---------|
| Mapping statique | `seed_mapping_{objet}` | `seed_mapping_thematiques` |
| Cache enrichissement | `seed_cache_{source}_{objet}` | `seed_cache_geo_ap` |
| Extraction PDF | `seed_pdf_{type}_{année}` | `seed_pdf_budget_vote_2025` |

---

## 5. Stratégie de jointure

| Source A | Source B | Clé de jointure | Qualité |
|----------|----------|-----------------|---------|
| Budget CA | AP Projets | `nature_code + fonction_code + annee` | Exacte |
| Subventions (annexe) | Associations | `beneficiaire_normalise + annee` | Exacte |
| Subventions | Budget | Pas de clé directe | Via thématique (approximatif) |
| Budget CA | Budget BV | `annee + section + sens_flux + chapitre_code + ode_thematique` | Exacte (mart) |

> **Limitation** : `ca_subventions` n'a PAS de codes budgétaires → classification thématique approximative.

---

## 6. Enrichissement

### 6.1 Principes

| Principe | Description |
|----------|-------------|
| **Incrémental** | Ne traite que les records pas encore dans le cache |
| **Seeds = Cache** | Résultats stockés dans CSV versionnés Git |
| **LLM hors dbt** | Scripts Python séparés, jamais pendant `dbt run` |
| **Cascade** | Regex → Mapping → LLM → Default |

### 6.2 Cascade thématique (subventions)

```
1. Pattern matching (seed_mapping_beneficiaires) → 73.94% des montants
2. LLM Gemini (seed_cache_thematique)            → 20.90% des montants
3. Direction (seed_mapping_directions)            →  4.45% des montants
4. Default ("Non classifié")                      →  0.49% des montants
TOTAL: 99.51% classifiés
```

### 6.3 Cascade géoloc (AP projets)

```
1. Regex (code postal, "15E") → 16.6% montants, confiance 1.0
2. Lieux connus (seed)        →  5.2% montants, confiance 0.95
3. LLM (seed_cache_geo_ap)   → 21.3% montants, confiance 0.8-0.96
4. Non localisable            → 56.9% montants (projets multi-arr)
TOTAL: 43.08% géolocalisés
```

### 6.4 Fusion Investissements (PDF + BigQuery)

Le PDF "Investissements Localisés" est la base, complété par BigQuery pour les gros projets manquants (>500k€, localisables, pas déjà dans PDF). Lieux iconiques toujours inclus (Philharmonie, Théâtre de la Ville...).

Résultats 2022 : 446 PDF + 13 BigQuery = 459 projets, 184.86 M€.

---

## 7. Scripts Python

### 7.1 Inventaire

| Script | Fonction | Status |
|--------|----------|--------|
| `sync_opendata.py` | Sync OpenData → BigQuery (skip si à jour) | ✅ |
| `enrich_thematique_llm.py` | Nom bénéficiaire → Thématique (Gemini batch) | ✅ |
| `enrich_geo_ap_llm.py` | Texte AP → Géoloc (Gemini batch) | ✅ |
| `extract_pdf_investments.py` | Extraction IL depuis PDFs CA/BP | ✅ |
| `extract_pdf_budget_vote.py` | Extraction Budget Voté depuis PDFs BP (pdfplumber + regex) | ✅ |
| `export_sankey_data.py` | Export JSON Sankey (core_budget) | ✅ |
| `export_subventions_data.py` | Export JSON treemap + bénéficiaires | ✅ |
| `export_map_data.py` | Export JSON carte AP + logements | ✅ |
| `export_evolution_data.py` | Export JSON évolution temporelle | ✅ |
| `export_vote_vs_execute.py` | Export JSON comparaison Voté/Exécuté | ✅ |
| `merge_investments.py` | Fusion PDF + BigQuery investissements | ✅ |
| `geocode_investments.py` | Géocodage projets fusionnés | ✅ |
| `export_all.py` | Orchestration tous exports | ✅ |

### 7.2 Extract PDF Budget Voté (`extract_pdf_budget_vote.py`)

- Utilise `fitz` (PyMuPDF) pour scan rapide des pages + `pdfplumber` pour extraction texte
- Regex robustes pour lignes de nature, codes fonction, montants
- Gère les pages de continuation (héritage contexte page précédente)
- Filtre les "group codes" pour ne garder que les codes feuille
- Détection heuristique de la colonne "TOTAL DU CHAPITRE" (texte + data-driven fallback)
- Output : `seed_pdf_budget_vote_{year}.csv`

---

## 8. Export et Frontend

### 8.1 Structure JSON (`website/public/data/`)

```
website/public/data/
├── budget_index.json                     # Années 2019-2026 + type_par_annee
├── budget_sankey_{2019..2026}.json       # Sankey + drilldown (2025-2026 depuis core_budget_vote)
├── budget_nature_{2019..2026}.json       # Répartition par nature (Donut)
├── evolution_budget.json                 # Totaux, dette, variations par thématique
├── vote_vs_execute.json                  # Taux exécution, ranking écarts, estimations
├── bilan_sankey_{year}.json              # Actif/Passif
├── data_availability.json                # Warnings par dataset/année
│
├── subventions/
│   ├── index.json                        # Années, filtres, totaux
│   ├── treemap_{year}.json               # Agrégé par thématique
│   └── beneficiaires_{year}.json         # Liste complète filtrable
│
└── map/
    ├── investissements_localises_index.json
    ├── investissements_localises_{year}.json
    ├── investissements_complet_{year}.json  # Fusionné PDF+BQ
    ├── logements_sociaux.json
    ├── arrondissements_stats.json
    └── arrondissements.geojson
```

### 8.2 Métadonnée `type_budget`

Tous les JSON avec des montants incluent un champ `type_budget` :

| Année | `type_budget` | Source |
|-------|---------------|--------|
| 2019-2024 | `"execute"` | Compte Administratif (CA) |
| 2025-2026 | `"vote"` | Budget Primitif (BP) |

Le frontend utilise ce champ pour afficher `BudgetTypeBadge` et les bannières disclaimer.

### 8.3 `budget_index.json`

```json
{
  "annees": [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
  "year_types": {
    "2019": "execute", "2020": "execute", "2021": "execute",
    "2022": "execute", "2023": "execute", "2024": "execute",
    "2025": "vote", "2026": "vote"
  },
  "covid_years": [2020, 2021],
  "execution_rate_hors_covid": {
    "taux_moyen": 102.5,
    "ecart_type": 1.8
  }
}
```

### 8.4 `data_availability.json`

```json
{
  "budget": {
    "annees_disponibles": [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
    "type_par_annee": {
      "2019": "execute", "2024": "execute", "2025": "vote", "2026": "vote"
    },
    "warnings": {
      "2025": { "severity": "info", "type": "previsionnel", "message": "Budget prévisionnel (voté par le Conseil de Paris). Exécuté disponible mi-2026." },
      "2026": { "severity": "info", "type": "previsionnel", "message": "Budget prévisionnel (voté le 16/12/2025). Exécuté disponible mi-2027." }
    }
  },
  "subventions": {
    "annees_disponibles": [2018, 2019, 2020, 2021, 2022, 2023, 2024],
    "warnings": {
      "2020": { "severity": "error", "message": "Données bénéficiaires absentes (source)" },
      "2021": { "severity": "error", "message": "Données bénéficiaires absentes (source)" }
    }
  },
  "investissements_localises": {
    "annees_disponibles": [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
    "type_par_annee": { "2024": "execute", "2025": "vote", "2026": "vote" },
    "warnings": {
      "2025": { "severity": "info", "type": "previsionnel", "message": "Investissements prévus (BP 2025). Réels disponibles mi-2026." },
      "2026": { "severity": "info", "type": "previsionnel", "message": "Investissements prévus (BP 2026). Réels disponibles mi-2027." }
    }
  },
  "vote_vs_execute": {
    "annees_comparables": [2023, 2024],
    "annees_vote_seul": [2025, 2026],
    "estimation_disponible": [2025, 2026]
  }
}
```

---

## 9. Qualité des données

### 9.1 Vue d'ensemble

| Table | Lignes | Années | Qualité | Status |
|-------|--------|--------|---------|--------|
| `core_budget` (Exécuté) | 24,526 | 2019-2024 | Excellent | ✅ Production |
| `core_budget_vote` (Voté PDF) | ~7,000 | 2023-2026 | Bon | ✅ Production |
| `core_subventions` | 42,931 | 2018-2024 | Bon | ⚠️ 2020-2021 dégradés |
| `core_ap_projets` | 7,155 | 2018-2022 | Bon | ⚠️ Manque 2023-2024 |
| `core_logements_sociaux` | 4,174 | 2001-2024 | Excellent | ✅ Production |

### 9.2 Matrice par année

| Année | Budget CA | Budget BV | Subventions | AP | IL | Logements |
|-------|-----------|-----------|-------------|----|----|-----------|
| 2018 | ❌ | ❌ | ✅ 12k | ✅ 2.4k | ✅ PDF CA | ✅ |
| 2019 | ✅ 5.4k | ✅ CSV | ✅ 13.8k | ✅ 2.0k | ✅ PDF CA | ✅ |
| 2020 | ✅ 5.1k | ✅ CSV | ⚠️ benef NULL | ✅ 1.3k | ✅ PDF CA | ✅ |
| 2021 | ✅ 5.2k | ✅ CSV | ⚠️ benef NULL | ✅ 889 | ✅ PDF CA | ✅ |
| 2022 | ✅ 5.7k | ✅ CSV | ✅ 7.2k | ✅ 485 | ✅ PDF CA | ✅ |
| 2023 | ✅ 5.5k | ✅ PDF | ✅ 7.2k | ❌ | ✅ PDF CA | ✅ |
| 2024 | ✅ 5.7k | ✅ PDF | ✅ 8.3k | ❌ | ✅ PDF CA | ✅ |
| 2025 | ❌ (~juin 2026) | ✅ PDF | ❌ | ❌ | ✅ PDF BP | ❌ |
| 2026 | ❌ (~mi 2027) | ✅ PDF | ❌ | ❌ | ✅ PDF BP | ❌ |

### 9.3 Audit complet (2026-02-05) — 12/12 checks passed

| Check | Status |
|-------|--------|
| Budget: Total core vs staging (0.00% diff) | ✅ |
| Subventions: Total core vs staging (0.00% diff) | ✅ |
| Budget: Lignes core vs staging (24,526 = 24,526) | ✅ |
| Subventions: Classifiées 99.51% | ✅ |
| AP: Géolocalisés 43.08% | ✅ |
| Budget: Variations YoY < 20% (max 7.8%) | ✅ |
| Unicité clés budget (0.106% doublons) | ✅ |
| Unicité clés subventions (0.000%) | ✅ |
| Unicité clés AP (0.000%) | ✅ |
| Paris Centre: Agrégation 1-4 | ✅ |
| CASVP: Dédupliqué (1,940 M€) | ✅ |
| Budget Voté PDF: Totaux cohérents avec chiffres officiels | ✅ |

### 9.4 Contrat qualité frontend

| Condition | Message | Badge |
|-----------|---------|-------|
| `annee >= 2025` budget | "Budget prévisionnel, pas encore exécuté" | Orange "Voté" |
| `annee >= 2025` IL | "Investissements prévus (BP), pas réalisés" | Orange "Voté" |
| `annee IN (2020, 2021)` subventions | "Données bénéficiaires indisponibles" | Warning |
| `annee >= 2023` AP | "Projets AP non publiés pour cette année" | Warning |
| `ode_confiance < 0.8` géoloc | "Localisation approximative" | Tooltip |
| Estimation (taux historique) | Disclaimer complet + fourchette ±1σ | Gris "Estimé" |

### 9.5 Règles anti-double comptage

| Règle | Implémentation |
|-------|----------------|
| Exclure "Pour Ordre" | `WHERE type_operation = 'Réel'` en staging |
| AP ⊂ Budget investissement | Documentation, pas d'addition |
| Subventions ⊂ Budget | Documentation, pas d'addition |
| Marchés = enveloppes | Non sommable, contexte uniquement |
| Ne jamais sommer `Montant AP` | Utiliser `Mandaté après régul.` |

---

## 10. Structure des fichiers

```
paris-budget-dashboard/
├── docs/
│   ├── architecture-modelling.md         # Ce document
│   └── architecture-frontend.md          # Architecture frontend
│
├── pipeline/                             # Projet dbt + scripts
│   ├── dbt_project.yml
│   ├── profiles.yml
│   ├── models/
│   │   ├── staging/                      # 8 modèles stg_*
│   │   ├── intermediate/                 # int_subventions_enrichies, int_ap_projets_enrichis
│   │   ├── core/                         # 5 OBTs : budget, budget_vote, subventions, ap, logements
│   │   └── marts/                        # 8 marts
│   ├── seeds/                            # ~15 CSVs (mappings + caches)
│   └── scripts/
│       ├── sync/sync_opendata.py
│       ├── tools/                        # extract_pdf_*, enrich_*
│       └── export/                       # export_*.py, merge_*, geocode_*
│
├── website/                              # Next.js 16
│   ├── public/data/                      # JSON pré-calculés
│   └── src/
│       ├── app/                          # Pages par entité
│       ├── components/                   # Composants React
│       └── lib/                          # Utils, types, API loaders
│
└── .venv/                                # Python virtualenv
```

---

## 11. Workflow de mise à jour

### 11.1 Mise à jour annuelle (après publication CA)

```bash
# 1. Sync OpenData → BigQuery
python pipeline/scripts/sync/sync_opendata.py

# 2. Enrichissement LLM incrémental (nouveaux records seulement)
python pipeline/scripts/tools/enrich_thematique_llm.py
python pipeline/scripts/tools/enrich_geo_ap_llm.py

# 3. Rebuild dbt
cd pipeline && .venv/bin/dbt seed && .venv/bin/dbt run

# 4. Export JSON
python pipeline/scripts/export/export_all.py

# 5. Build frontend
cd website && npm run build
```

### 11.2 Ajout Budget Voté (one-shot pour nouvelles années)

```bash
# 1. Extraire depuis PDFs Budget Primitif
python pipeline/scripts/tools/extract_pdf_budget_vote.py --year 2027

# 2. Rebuild dbt (charge nouveau seed + transforme)
cd pipeline && .venv/bin/dbt seed && .venv/bin/dbt run

# 3. Exporter Sankey pour la nouvelle année
python pipeline/scripts/export/export_sankey_data.py
python pipeline/scripts/export/export_vote_vs_execute.py

# 4. Mettre à jour budget_index.json et data_availability.json
```

---

## Annexes

### A. APIs utilisées

| API | Auth | Coût |
|-----|------|------|
| OpenData Paris | Non | Gratuit |
| API Entreprises | Non | Gratuit |
| API Adresse | Non | Gratuit |
| Gemini 2.5 Flash | API Key | ~$0.10/1M tokens |

### B. Glossaire

| Terme | Définition |
|-------|------------|
| **AP** | Autorisation de Programme — enveloppe pluriannuelle d'investissement |
| **BP** | Budget Primitif — budget initial voté par le Conseil de Paris |
| **BV** | Budget Voté — ensemble BP + DM |
| **CA** | Compte Administratif — budget réellement exécuté, publié ~juin N+1 |
| **DM** | Décision Modificative — ajustement en cours d'année |
| **IL** | Investissements Localisés — annexe détaillant investissements par arrondissement |
| **M57** | Nomenclature comptable des collectivités depuis 2019 |
| **OBT** | One Big Table — table dénormalisée finale |
| **Taux d'exécution** | Ratio Exécuté/Voté × 100 |
