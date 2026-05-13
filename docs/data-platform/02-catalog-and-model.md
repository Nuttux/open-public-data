# 02 — Data Catalog + Data Model + UI Mapping

> Companion docs: [01-pipeline-diagram.md](./01-pipeline-diagram.md) · [03-quality-monitoring.md](./03-quality-monitoring.md)
> Related: [../data-quality.md](../data-quality.md) (issue tracker) · [../architecture-modelling.md](../architecture-modelling.md) (narrative architecture)

This document is the **reference manual** for the data platform. It answers three questions:

1. **Where does every dataset come from?** — §1 Data catalog
2. **What are the tables, their grain, their keys, their measures?** — §2 Data model (staging / core / intermediate / mart)
3. **For every number visible in the UI, what is the path back to source?** — §3 UI ↔ JSON ↔ mart ↔ core mapping

Convention: all paths are relative to repo root. Table names come from [pipeline/models/](../../pipeline/models/) `.sql` files. Source dataset IDs come from [pipeline/scripts/sync/](../../pipeline/scripts/sync/) and [docs/data-quality.md](../data-quality.md).

---

## 1. Data catalog — external sources

Every row below is a **distinct source contract**: one external system we pull from, with its own cadence, license, and failure modes.

### 1.1 OpenData Paris (API)

Base URL: `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/`
Ingest script: [pipeline/scripts/sync/sync_opendata.py](../../pipeline/scripts/sync/sync_opendata.py) (plus [fetch_subventions_opendata.py](../../pipeline/scripts/sync/fetch_subventions_opendata.py) for the bypass path).
License: Licence Ouverte Etalab 2.0.

| Source | Dataset ID | Target | Coverage | Cadence | Notes |
|---|---|---|---|---|---|
| Budget CA | `comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement` | `raw.comptes_administratifs_budgets_principaux_*` | 2019–2024 | Annuelle (~juin N+1) | Source de vérité macro |
| Budget CA 2018 (legacy) | `comptes-administratifs-principaux-2018-m57-ville-departement` | idem | 2018 | Figé | Format legacy |
| AP CA | `comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de` | `raw.ap_projets_*` | 2018–2022 | **⚠️ Gelé depuis 2019-11-28** | Voir [data-quality.md §2.1](../data-quality.md) |
| AP BV | `budgets-votes-autorisations-de-programmes-a-partir-de-2018-m57-ville-departement` | idem | 2018–2022 | ⚠️ Gelé | idem |
| Subventions Votées | `subventions-associations-votees-` | `beneficiaires_*.json` direct + `raw.subventions_*` | 2018–2024 | Annuelle | Riche : SIRET, direction, objet, secteurs ; **associations uniquement** |
| Subventions Annexe CA | `subventions-versees-annexe-compte-administratif-a-partir-de-2018` | idem | 2018–2024 | Annuelle (~juin N+1) | Large : tous bénéficiaires, champs minimaux ; **2020 & 2021 anonymisées** |
| Marchés Paris | `liste-des-marches-de-la-collectivite-parisienne` | `raw.liste_des_marches_de_la_collectivite_parisienne` | 2013–2024 | Mensuelle (rolling) | ~17k contrats ; `montant_max` = plafond |
| Logements sociaux | `logements-sociaux-finances-a-paris` | `raw.logements_sociaux_finances_a_paris` | 2001–2024 | Annuelle | `geo_point_2d` inclus en source |

### 1.2 data.gouv.fr — DECP nationale

| Source | Dataset ID | Target | Coverage | Cadence | Notes |
|---|---|---|---|---|---|
| DECP | `5cd57bf68b4c4179299eb0e9` | `raw.decp_marches_paris` | 2019, 2022, 2024, 2025, 2026 | Annuelle | Fichier ~944 MB/an ; filtré SIRET `217500*` ; ~30% superset vs Paris OpenData ; ajoute `codeCPV`, `CCAG`, `lieu_execution`, `offres_recues` |

Ingest script: [pipeline/scripts/sync/fetch_decp_paris.py](../../pipeline/scripts/sync/fetch_decp_paris.py). License: Licence Ouverte 2.0.

### 1.3 cdn.paris.fr — PDFs officiels

| Source | URL pattern | Target | Coverage | Cadence | Parser |
|---|---|---|---|---|---|
| Budget voté BG (Partie 1) | `cdn.paris.fr/paris/*/BG-*.PDF` | `seed_pdf_budget_vote_*.csv` | 2020–2026 | Annuelle (~févr. N) | [extract_pdf_budget_vote.py](../../pipeline/scripts/tools/extract_pdf_budget_vote.py) — pdfplumber + fitz |
| Annexe Investissements Localisés (IL) | `cdn.paris.fr/paris/*/ca-{year}-annexe-il-*.PDF` + BP équivalent | `seed_pdf_investissements_*.csv` (par année) + `investissements_localises_*.json` | 2018–2024 (CA) + 2025–2026 (BP) | Annuelle | [extract_pdf_investments.py](../../pipeline/scripts/tools/extract_pdf_investments.py) — **Gemini 3 Flash vision** avec réconciliation total-par-page |

PDFs Annexe IL 2024 : `https://cdn.paris.fr/paris/2025/06/25/ca-2024-annexe-il-UtMj.PDF` (historique 2021–2023 documenté dans le script). Anti-hallucination : page totale vérifiée ; pages non conformes flaggées pour revue manuelle.

### 1.4 Web scraping — Conseil de Paris

| Source | URL pattern | Target | Coverage | Cadence | Parser |
|---|---|---|---|---|---|
| Délibérations Conseil de Paris | `https://a06-v7.apps.paris.fr/a06/` (HTML index → PDFs par direction) | `cache/delibs/pdf/{id_entite}.pdf` + `subventions_delibs/session_*.json` | Sessions ≥ 145 (2025 YTD) | Rolling (~1–2 j lag) | [scrape_deliberations.py](../../pipeline/scripts/sync/scrape_deliberations.py) — requests + BeautifulSoup + pypdf + regex |

Filtre titre : `Subvention|Financement|Subventionnement` (case-insensitive). Article-level extraction.

### 1.5 APIs externes (enrichissement)

| Source | URL | Usage | Notes |
|---|---|---|---|
| recherche-entreprises (INSEE miroir) | `https://recherche-entreprises.api.gouv.fr/search` | `enrich_sirene.py`, `enrich_deliberations_sirene.py` | Déterministe ; cacheable ; sans clé API |
| BAN (Base Adresse Nationale) | `https://api-adresse.data.gouv.fr/search/` | `enrich_geo_ap_llm.py` (étape 3) | Déterministe ; score 0.0–1.0 renvoyé |
| Wikipedia FR API | `https://fr.wikipedia.org/w/api.php` | `enrich_beneficiaire_grounded_llm.py` (fallback) | Biais connu : meilleure couverture culturelle |
| Anthropic API | `api.anthropic.com` | Claude Haiku 4.5 (grounded), Claude Opus (vulgarize, photos) | Tier 1 rate-limit (60s wait on 429) |
| Google Gemini | `generativelanguage.googleapis.com` | Gemini 3 Flash (thematique, geo_ap, vision PDF, deliberations) | Moins cher pour batch |

### 1.6 Seeds et fichiers locaux

Sous [pipeline/seeds/](../../pipeline/seeds/) (chargés par `dbt seed`) :

| Seed | Rôle | Éditorial ? |
|---|---|---|
| `seed_city_constants.csv` | Constantes ville (pop INSEE 2021, surface, etc.) | Non — sourcé INSEE |
| `seed_legal_thresholds.csv` | Seuils légaux (capacité désendettement alerte, % dette courte, etc.) | Non — sourcé CRC / DGFIP |
| `seed_editorial_params.csv` | Choix éditoriaux (tolérance afficher_deux_montants, filtres, etc.) | **Oui** — tracé dans `methodology.json` |
| `seed_mapping_thematiques.csv` | `chapitre × fonction → thematique` | Semi-éditorial (M57 officiel + regroupements) |
| `seed_cache_thematique_beneficiaires.csv` | Cache LLM thematique | Auto (LLM) |
| `seed_cache_geo_ap.csv` | Cache géocodage AP | Auto (regex + BAN + LLM) |
| `seed_cache_sirene.csv` | Cache SIRET | Auto (API) |
| `seed_pdf_budget_vote_*.csv` | Budget voté extrait PDF | Auto (PDF parser) |
| `seed_pdf_investissements_*.csv` | AP extrait PDF (per-year) | Auto (PDF vision LLM) |
| `seed_drihl_paris_2024.csv` | Attente logement DRIHL | Semi-auto (xlsx → CSV) |
| `seed_match_projet_marches.csv` | Mapping manuel projet ↔ marché | **Éditorial** |
| `bilan-comptable.csv` (repo root) | Bilan CA agrégé | Semi-auto — upload one-shot via [upload_bilan_comptable.py](../../pipeline/scripts/sync/upload_bilan_comptable.py) |

---

## 2. Data model

The platform follows a dbt layered architecture:

```
raw.*              (BigQuery ingested tables + seeds)
  ↓
staging/stg_*      (normalization: types, keys, dedup)
  ↓
core/core_*        (denormalized One-Big-Table per domain)
  ↓
intermediate/int_* (domain joins + enrichment grafting)
  ↓
marts/mart_*       (UI-ready aggregates, one per export JSON)
```

dbt config: [pipeline/dbt_project.yml](../../pipeline/dbt_project.yml). Sources declared in [pipeline/models/staging/sources.yml](../../pipeline/models/staging/sources.yml). All schemas in the `schema.yml` files per folder.

### 2.1 Staging layer

Purpose: one `stg_*` per raw source, minimal transformation. No business logic.

| Model | Source | Purpose |
|---|---|---|
| [stg_budget_principal.sql](../../pipeline/models/staging/stg_budget_principal.sql) | `raw.comptes_administratifs_budgets_principaux_*` | Typing + sens_flux derivation |
| [stg_pdf_budget_vote.sql](../../pipeline/models/staging/stg_pdf_budget_vote.sql) | `seed_pdf_budget_vote_*` | PDF seed normalization |
| [stg_budget_vote.sql](../../pipeline/models/staging/stg_budget_vote.sql) | `stg_pdf_budget_vote` + `raw.budgets_votes_*` | Unified voted budget |
| [stg_ap_projets.sql](../../pipeline/models/staging/stg_ap_projets.sql) | `raw.ap_projets_*` + `seed_pdf_investissements` | AP from API + PDF union |
| [stg_subventions_all.sql](../../pipeline/models/staging/stg_subventions_all.sql) | `raw.subventions_*` (votées + annexe CA) | Merge by (year, normalized name) |
| [stg_associations.sql](../../pipeline/models/staging/stg_associations.sql) | `stg_subventions_all` filtered | Associations only (with SIRET/direction/secteurs) |
| [stg_marches_publics.sql](../../pipeline/models/staging/stg_marches_publics.sql) | `raw.liste_des_marches_*` | Paris OpenData normalization |
| [stg_decp_marches_paris.sql](../../pipeline/models/staging/stg_decp_marches_paris.sql) | `raw.decp_marches_paris` | DECP flattening |
| [stg_logements_sociaux.sql](../../pipeline/models/staging/stg_logements_sociaux.sql) | `raw.logements_sociaux_*` | Type casting |
| [stg_bilan_comptable.sql](../../pipeline/models/staging/stg_bilan_comptable.sql) | `raw.bilan_comptable` | Parent/child hierarchy |

### 2.2 Core layer — One Big Table per domain

Purpose: **denormalized, analytical-ready** tables. One per business domain. Columns prefixed `ode_*` are **enrichments** (not from raw).

#### core_budget

- **File:** [core_budget.sql](../../pipeline/models/core/core_budget.sql)
- **Grain:** `(annee, section, chapitre_code, nature_code, fonction_code, sens_flux)` — unique key `cle_technique`
- **Coverage:** 2019–2024 (executed CA)
- **Measures:** `montant`
- **Enrichments:** `ode_thematique` (from `seed_mapping_thematiques` — deterministic), `ode_categorie_flux`
- **Role:** Source of truth for macro totals. All budget sankey/nature/evolution derive from this.

#### core_budget_vote

- **File:** [core_budget_vote.sql](../../pipeline/models/core/core_budget_vote.sql)
- **Grain:** same as `core_budget` (suffix `-BV` on `cle_technique` to avoid collision in unions)
- **Coverage:** 2019–2026 (2025, 2026 = forecasts via PDF)
- **Role:** Pair with `core_budget` in `mart_vote_vs_execute` for vote/exec ecart ranking.

#### core_subventions

- **File:** [core_subventions.sql](../../pipeline/models/core/core_subventions.sql)
- **Grain:** `(annee, beneficiaire_normalise, collectivite)` — one row per beneficiary-year, montants **summed**
- **Coverage:** 2018–2024, **skip 2020 & 2021** (anonymisées par la source)
- **Measures:** `montant_total`, `nb_subventions`
- **Enrichments:**
  - `ode_thematique` + `ode_sous_categorie` (LLM, Pareto top 500 bénéficiaires)
  - `ode_confiance` (0.0–1.0)
  - `source_thematique ∈ {pattern, direction, llm, default}` — traceability field
  - SIRET + direction + secteurs from votées dataset (associations only)
- **Volume:** ~53k rows
- **No geolocation** by design — siège ≠ périmètre d'action.

#### core_ap_projets

- **File:** [core_ap_projets.sql](../../pipeline/models/core/core_ap_projets.sql)
- **Grain:** `(annee, ap_code)` — one row per authorization-year
- **Coverage:** 2018–2022 dense via OpenData (~2.5k/yr), 2023–2024 sparse via PDF IL (~450/yr)
- **Measures:** `montant_vote`, `montant_execute`, `montant` (AP)
- **Enrichments:**
  - `ode_arrondissement` (cascade: regex → lieu connu → BAN → LLM)
  - `ode_latitude`, `ode_longitude`
  - `ode_type_equipement`
  - `ode_adresse`
  - `ode_confiance` (0.0–1.0)
- **Known gap:** 20–30% `ode_arrondissement IS NULL` (transverse / études pluri-sites).

#### core_marches_publics

- **File:** [core_marches_publics.sql](../../pipeline/models/core/core_marches_publics.sql)
- **Grain:** `(annee, numero_marche)` — unique key `cle_technique`
- **Coverage:** 2013–2026 (rolling monthly sync)
- **Measures:** `montant_max` (plafond, Paris source), `montant_notifie` (DECP, si disponible)
- **Enrichments from DECP join:** `ccag`, `codeCPV`, `codeCPV_traduit`, `lieu_execution` (département 75), `offres_recues`, clauses sociales/env
- **Join rule:** `SUBSTR(paris.numero_marche, 5) = decp.id` then fallback on `(fournisseur_siret, date_notification)` window.
- **Domain flag:** `afficher_deux_montants = True` si |notifie − max|/max > 5% (seuil dans `seed_editorial_params.csv`).

#### core_logements_sociaux

- **File:** [core_logements_sociaux.sql](../../pipeline/models/core/core_logements_sociaux.sql)
- **Grain:** `id_livraison` — one row per programme livré
- **Coverage:** 2001–2024
- **Measures:** `nb_logements_finances`, `nb_logements_livres`, `cout_total`
- **Geo:** déjà géocodé en source (`geo_point_2d`)

#### core_bilan_comptable

- **File:** [core_bilan_comptable.sql](../../pipeline/models/core/core_bilan_comptable.sql)
- **Grain:** `(annee, actif_pasif, compte_code)` — hierarchical parent/child
- **Coverage:** 2019–2024
- **Measures:** `montant`
- **Role:** Drives the bilan sankey (actif → masses patrimoniales → détail) and debt structure.

#### core_logement_attente_arr

- **File:** [core_logement_attente_arr.sql](../../pipeline/models/core/core_logement_attente_arr.sql)
- **Grain:** `(arrondissement, annee)`
- **Coverage:** 2024 snapshot (DRIHL)
- **Measures:** `nb_menages_en_attente`, `duree_moyenne_annees`, `ratio_offre_demande`

### 2.3 Intermediate layer

Purpose: domain joins that are reused by multiple marts; not a final product.

| Model | Joins | Used by |
|---|---|---|
| [int_subventions_enrichies.sql](../../pipeline/models/intermediate/int_subventions_enrichies.sql) | `core_subventions` + caches (thematique, sirene, grounded) | `mart_subventions_treemap`, `mart_subventions_beneficiaires` |
| [int_ap_projets_enrichis.sql](../../pipeline/models/intermediate/int_ap_projets_enrichis.sql) | `core_ap_projets` + geo_cache + type_equipement | `mart_carte_investissements`, `mart_stats_arrondissements` |
| [int_projet_marches.sql](../../pipeline/models/intermediate/int_projet_marches.sql) | `core_ap_projets` ⋈ `core_marches_publics` via `seed_match_projet_marches` | `mart_projet_marches` |

### 2.4 Marts layer — UI-ready aggregates

One mart per exported JSON (with rare exceptions: `mart_concentration` is a building-block reused in `mart_marches_*`).

| Mart | Grain | Consumed by export | Output JSON | UI page |
|---|---|---|---|---|
| [mart_sankey.sql](../../pipeline/models/marts/mart_sankey.sql) | (annee, categorie_flux, thematique) | `export_sankey_data.py` | `budget_sankey_*.json` | `/` + `/budget` |
| [mart_budget_nature.sql](../../pipeline/models/marts/mart_budget_nature.sql) | (annee, nature_code, sens_flux) | `export_budget_nature.py` | `budget_nature_*.json` | `/budget` |
| [mart_evolution_budget.sql](../../pipeline/models/marts/mart_evolution_budget.sql) | (annee, thematique) | `export_evolution_data.py` | `evolution_budget.json` | `/budget` + `/` |
| [mart_vote_vs_execute.sql](../../pipeline/models/marts/mart_vote_vs_execute.sql) | (annee, thematique, section) | `export_vote_vs_execute.py` | `vote_vs_execute.json` | `/budget` |
| [mart_subventions_treemap.sql](../../pipeline/models/marts/mart_subventions_treemap.sql) | (annee, thematique) | `export_subventions_data.py` | `subventions/treemap_*.json` | `/qui-recoit` |
| [mart_subventions_beneficiaires.sql](../../pipeline/models/marts/mart_subventions_beneficiaires.sql) | (annee, beneficiaire_normalise) | `export_subventions_data.py` | `subventions/beneficiaires_*.json` | `/qui-recoit` |
| [mart_marches_par_nature.sql](../../pipeline/models/marts/mart_marches_par_nature.sql) | (annee, nature_cpv) | `export_marches_data.py` | `marches-publics/marches_*.json` | `/marches-publics` |
| [mart_marches_fournisseurs.sql](../../pipeline/models/marts/mart_marches_fournisseurs.sql) | (annee, fournisseur_siret) | `export_marches_data.py` | `marches-publics/marches_*.json` (enrichi) | `/marches-publics` |
| [mart_concentration.sql](../../pipeline/models/marts/mart_concentration.sql) | (annee, metric) | internal | — | — |
| [mart_carte_investissements.sql](../../pipeline/models/marts/mart_carte_investissements.sql) | (annee, ap_code, arrondissement) | `export_map_data.py` | `map/investissements_*.json` | `/investissements` |
| [mart_stats_arrondissements.sql](../../pipeline/models/marts/mart_stats_arrondissements.sql) | (annee, arrondissement) | `export_map_data.py` | `map/arrondissements_stats_*.json` | `/investissements` + `/logement-social` |
| [mart_projet_marches.sql](../../pipeline/models/marts/mart_projet_marches.sql) | (ap_code, numero_marche) | `export_projet_marches.py` | `map/projet_marches.json` | `/investissements` |
| [mart_bilan_sankey.sql](../../pipeline/models/marts/mart_bilan_sankey.sql) | (annee, masse, level) | `export_bilan_data.py` | `bilan_sankey_*.json` | `/dette-patrimoine` |

**Mart design principles:**
- Marts exclude rows where `donnees_disponibles = FALSE` (quality filter applied upstream in core).
- Subventions marts drop geolocation (siège ≠ action).
- Investment marts come in two flavours: `mart_carte_investissements` (geocoded only, used on the map) and a parallel view that keeps non-geocoded rows (exported to `investissements_complet_*.json` for total counts).
- Marches mart carries the dual-amount decision flag.

### 2.5 Core vs Mart — the distinction

| | core_* | mart_* |
|---|---|---|
| Grain | Row-level (entity) | Aggregated |
| Role | Single source of truth for a domain | One per UI component |
| Enrichments | ✓ (ode_* columns grafted on) | — (already applied upstream) |
| Schema stability | Stable (breaks on source schema change) | Can change with UI needs |
| Consumed by | Multiple marts, audit scripts, LLM enrichment inputs | Exactly one `export_*.py`, rarely two |
| Tested by | Freshness, row count, completeness, anomaly tests | Balance tests (mart vs core) |

When to promote a metric from mart to core: if more than one mart would need to compute it, compute it once in core. When to keep it in mart: if only one UI component uses it.

---

## 3. UI ↔ JSON ↔ mart ↔ core mapping

For every page that shows factual numbers, trace each metric back to its source. This is the **contract**: no number in the UI without a documented chain.

### 3.1 Central data loader

[website/src/lib/fusion-data.ts](../../website/src/lib/fusion-data.ts) — module-level memoized loaders:

```ts
loadBudgetIndex()                  → budget_index.json
loadBudgetSankey(year)             → budget_sankey_{year}.json
loadBudgetNature(year)             → budget_nature_{year}.json
loadVoteExecute()                  → vote_vs_execute.json
loadEvolutionBudget()              → evolution_budget.json
loadBilanSankey(year)              → bilan_sankey_{year}.json
loadMarcheVulgarization(numero)    → enrichment/vulgarization_marches.json
loadSubventionVulgarization(name)  → enrichment/vulgarization_subventions.json
loadSirene(siren)                  → enrichment/sirene_companies.json
loadBeneficiaireGrounded(name)     → enrichment/beneficiaire_grounded.json
```

Caching: enrichment caches are loaded once per session; budget files are loaded fresh per route (they're cheap).

### 3.2 Landing page — `/`

**File:** [website/src/app/LandingClient.tsx](../../website/src/app/LandingClient.tsx)

| UI metric | JSON | Mart / script | Core table |
|---|---|---|---|
| `totalDepenses` (fmtBillions) | `budget_sankey_{latestYear}.json` → `totals.depenses` | `mart_sankey` | `core_budget` |
| `nbMarchesCumul` | `marches-publics/marches_tendances.json` → cumul | (aggregate on export) | `core_marches_publics` |
| `nbSubventionsCumul` | `subventions_tendances.json` | (aggregate on export) | `core_subventions` |
| `perCapitaMonth` / `perCapitaYear` | `methodology.json` → `paris_population` constant + `budget_sankey` total | — (compute in client) | `core_budget` + `seed_city_constants` |
| `deltaVsLastExecutedPct` | `evolution_budget.json` | `mart_evolution_budget` | `core_budget` |
| `breakdown[]` per thématique | `budget_sankey_{latestYear}.json` → `links` | `mart_sankey` | `core_budget` |

### 3.3 Budget page — `/budget`

**File:** [website/src/app/budget/BudgetClient.tsx](../../website/src/app/budget/BudgetClient.tsx)

| UI component | JSON | Mart | Core |
|---|---|---|---|
| Sankey diagram | `budget_sankey_{year}.json` | `mart_sankey` | `core_budget` |
| Vote vs Execute toggle | `vote_vs_execute.json` → `ecart_ranking` | `mart_vote_vs_execute` | `core_budget` + `core_budget_vote` |
| Nature donut | `budget_nature_{year}.json` | `mart_budget_nature` | `core_budget` |
| Evolution sparkline | `evolution_budget.json` | `mart_evolution_budget` | `core_budget` |
| Year selector | `budget_index.json` | meta | — |

### 3.4 Qui reçoit — `/qui-recoit`

**Files:** [website/src/app/qui-recoit/QuiRecoitExplorer.tsx](../../website/src/app/qui-recoit/QuiRecoitExplorer.tsx), [website/src/app/qui-recoit/page.tsx](../../website/src/app/qui-recoit/page.tsx)

| UI component | JSON | Mart | Core |
|---|---|---|---|
| Treemap | `subventions/treemap_{year}.json` | `mart_subventions_treemap` | `core_subventions` |
| Searchable table | `subventions/beneficiaires_{year}.json` | `mart_subventions_beneficiaires` | `core_subventions` |
| Full-text search precompute | `subventions/beneficiaires_search.json` | (derived) | idem |
| Filters (thematique, nature juridique, direction) | Inline in beneficiaires JSON | idem | idem |
| Detail drawer — activity + sources | `enrichment/beneficiaire_grounded.json` | (enrichment) | via [enrich_beneficiaire_grounded_llm.py](../../pipeline/scripts/enrich/enrich_beneficiaire_grounded_llm.py) |
| Detail drawer — company card | `enrichment/sirene_companies.json` | (enrichment) | via [enrich_sirene.py](../../pipeline/scripts/enrich/enrich_sirene.py) |
| Detail drawer — vulgarization | `enrichment/vulgarization_subventions.json` | (enrichment) | via [vulgarize_subventions_llm.py](../../pipeline/scripts/enrich/vulgarize_subventions_llm.py) |
| 2025 partial (via delibs) | `subventions_delibs/session_*.json` | (scrape + parse) | via [scrape_deliberations.py](../../pipeline/scripts/sync/scrape_deliberations.py) |

### 3.5 Marchés publics — `/marches-publics`

**Files:** [website/src/app/marches-publics/MarchesSearch.tsx](../../website/src/app/marches-publics/MarchesSearch.tsx), [website/src/app/marches-publics/MarchesFullList.tsx](../../website/src/app/marches-publics/MarchesFullList.tsx)

| UI component | JSON | Mart | Core |
|---|---|---|---|
| Year selector | `marches-publics/index.json` | meta | — |
| Contract list | `marches-publics/marches_{year}.json` | `mart_marches_par_nature` + `mart_marches_fournisseurs` | `core_marches_publics` |
| Dual-amount display flag | Field `afficher_deux_montants` in JSON | `mart_marches_par_nature` | `core_marches_publics` (computed) |
| Supplier concentration | `marches-publics/marches_tendances.json` | `mart_concentration` | `core_marches_publics` |
| Detail drawer — vulgarization | `enrichment/vulgarization_marches.json` | — | via [vulgarize_marches_llm.py](../../pipeline/scripts/enrich/vulgarize_marches_llm.py) |

### 3.6 Investissements — `/investissements`

**File:** [website/src/app/investissements/page.tsx](../../website/src/app/investissements/page.tsx) + [website/src/components/fusion/ProjectMap.tsx](../../website/src/components/fusion/ProjectMap.tsx)

| UI component | JSON | Mart | Core |
|---|---|---|---|
| Choropleth par arrondissement | `map/arrondissements_stats_{year}.json` | `mart_stats_arrondissements` | `core_ap_projets` + `core_logements_sociaux` |
| Points projets géocodés | `map/investissements_{year}.json` | `mart_carte_investissements` | `core_ap_projets` |
| Projets non géocodés (banner, count) | `map/investissements_complet_{year}.json` | (view parallèle) | `core_ap_projets` |
| Détail PDF IL | `map/investissements_localises_{year}.json` | — (direct from PDF) | — |
| Overlay projet ↔ marchés | `map/projet_marches.json` | `mart_projet_marches` | `core_ap_projets` + `core_marches_publics` |
| Photos | `enrichment/projet_photos.json` | — | via [fetch_photos_grounded_llm.py](../../pipeline/scripts/enrich/fetch_photos_grounded_llm.py) |

### 3.7 Logement social — `/logement-social`

**File:** [website/src/app/logement-social/page.tsx](../../website/src/app/logement-social/page.tsx)

| UI component | JSON | Mart / script | Core |
|---|---|---|---|
| Carte tension attente | `logement_attente_paris.json` | — (export direct) | `core_logement_attente_arr` |
| Timeline logements financés | `map/logements_{year}.json` | — | `core_logements_sociaux` |
| Liste programmes | `map/logements_sociaux.json` | — | `core_logements_sociaux` |
| Synthèse par arr | `map/logements_par_arrondissement.json` | `mart_stats_arrondissements` (shared) | `core_logements_sociaux` |

### 3.8 Dette et patrimoine — `/dette-patrimoine`

**File:** [website/src/app/dette-patrimoine/page.tsx](../../website/src/app/dette-patrimoine/page.tsx)

| UI component | JSON | Mart / script | Core |
|---|---|---|---|
| Bilan sankey | `bilan_sankey_{year}.json` | `mart_bilan_sankey` | `core_bilan_comptable` |
| Structure dette (taux fixe, maturité, émissions) | `patrimoine_structure_{year}.json` | via [build_patrimoine_structure.py](../../pipeline/scripts/enrich/build_patrimoine_structure.py) (**⚠️ constants indicatives**) | `core_bilan_comptable` |
| Hors bilan | `hors_bilan_{year}.json` | via [build_hors_bilan.py](../../pipeline/scripts/enrich/build_hors_bilan.py) (seed éditorial) | — |
| Ratios (capacité désendettement, etc.) | `methodology.json` thresholds + bilan JSON | — (calcul client) | `core_bilan_comptable` + `seed_legal_thresholds` |

### 3.9 Méthode — `/methode`

**File:** [website/src/app/methode/page.tsx](../../website/src/app/methode/page.tsx)

| Contenu | Source |
|---|---|
| Timeline axis | `methodology.json` → `timeline_axis_start`, `_end`, `subventions_years_excluded` |
| Seuils légaux (capacite_desendettement_alerte = 12 ans, etc.) | `methodology.json` → `legal_thresholds` |
| Population Paris | `methodology.json` → `paris_population` (INSEE 2021 + `source_url`) |
| Couverture par dataset | `data_availability.json` → per-dataset `years{}` |
| Choix éditoriaux (tolérances, filtres) | `methodology.json` → `editorial_params` |

### 3.10 Analyses — `/analyses`

**File:** [website/src/app/analyses/AnalysesClient.tsx](../../website/src/app/analyses/AnalysesClient.tsx)

Pulls are ad hoc via `fusion-data` loaders. Any number displayed here MUST also trace back to the core tables above via a loader function — `check_no_hardcoded_factuals.py` enforces this.

---

## 4. Metadata channel

Two JSONs power traceability and must stay consistent with core tables:

- **[methodology.json](../../website/public/data/methodology.json)** — exported by [export_methodology.py](../../pipeline/scripts/export/export_methodology.py). Contains `source`, `source_url`, `date_reference` for every externally-sourced constant. Hard rule: no UI metric without a matching entry.
- **[data_availability.json](../../website/public/data/data_availability.json)** — exported by [export_data_availability.py](../../pipeline/scripts/export/export_data_availability.py). Per-dataset per-year: `status`, `nb_lignes`, `total_montant`, `warnings`. Single source for freshness in the UI and for monitoring.

Every export JSON also carries a top-level `generated_at` (ISO 8601 UTC). That timestamp is how you tell if a file is fresh relative to a pipeline run.

---

## 5. Naming conventions (recap)

- `raw.*` — BigQuery landing zone, schema = source schema
- `stg_*` — staging, one per raw source, minimal transform
- `core_*` — denormalized entity per domain
- `int_*` — intermediate join, not a final product
- `mart_*` — one per exported JSON (with few exceptions)
- `ode_*` — column prefix for enrichment added by our pipeline (vs source columns)
- `cle_technique` — synthetic unique key, suffix by subdomain (`-BV` for budget vote)
- `seed_*` — dbt seed CSV loaded by `dbt seed`
- `seed_cache_*` — cache populated by a script (LLM, API) that's also a seed
- `generated_at` — ISO 8601 UTC timestamp on every export JSON

See also: naming rationale in [architecture-modelling.md §4](../architecture-modelling.md).
