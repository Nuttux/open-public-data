# Architecture & modélisation — Qipu

> Dernière mise à jour : 2026-05-21
>
> Voir aussi : [`data-quality.md`](./data-quality.md) pour les limites, observations et règles de qualité.
>
> ⚠️ **Ce document précède les ADR multi-pays (2026-07) et décrit encore une
> architecture France-seule.** Pour l'architecture multi-villes / multi-pays qui
> fait foi aujourd'hui, voir : [ADR-0010 — multi-country architecture](./decisions/0010-multi-country-architecture.md)
> (familles de schémas par pays, contrats partagés — export envelope + design
> primitives —, **pas** de schéma canonique transverse), [ADR-0011 — budget
> convergence](./decisions/0011-budget-convergence.md) (logique partagée via
> macros, pas d'UNION), et le playbook [`ADDING-A-PLACE.md`](../ADDING-A-PLACE.md).
> Les sections 7 (Multi-collectivités) et 8 sont à réécrire dans ce cadre.

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Sources de données](#2-sources-de-données)
3. [Architecture des couches](#3-architecture-des-couches)
4. [Conventions de nommage](#4-conventions-de-nommage)
5. [Stratégies de jointure et règles métier](#5-stratégies-de-jointure-et-règles-métier)
6. [Enrichissement](#6-enrichissement)
7. [Multi-collectivités](#7-multi-collectivités)
8. [Export et frontend](#8-export-et-frontend)
9. [Workflow de mise à jour](#9-workflow-de-mise-à-jour)

---

## 1. Vue d'ensemble

### 1.1 Objectif

Pipeline qui ingère, normalise et enrichit les données ouvertes publiées par les administrations françaises (collectivités, État, opérateurs publics) puis exporte des JSON statiques consommés par le frontend `qipu.org`.

Couverture actuelle :
- **Paris** : budget M57, marchés publics (Paris + DECP nationale), subventions, investissements géolocalisés, logements sociaux, bilan comptable, dette garantie (hors-bilan), délibérations
- **Marseille** : budget M57 (PoC v1)
- **National** : DECP, INSEE SIRENE, OFGL, DRIHL, DGFiP
- **San Francisco (US)** : famille de schéma distincte (`us-municipal`), pipeline et modèles parallèles (`models/us/`, `dbt_us_*`) — jamais fusionnée au schéma français (cf. ADR-0010)

### 1.2 Principes architecturaux

| Principe | Description |
|----------|-------------|
| **Layering strict** | `raw → staging → intermediate → core → marts` — pas de raccourci, mart ne lit jamais staging |
| **OBT (One Big Table)** | Une table dénormalisée wide & flat par entité dans `core_` |
| **Exécuté ≠ Voté** | `core_budget` (CA) et `core_budget_vote` (BP) sont **deux entités séparées**. Jamais UNIONées en core. Comparaison dans `mart_vote_vs_execute` uniquement |
| **Static data first** | JSON pré-calculés et versionnés, pas d'API live |
| **Enrichissement incrémental** | Seeds CSV = cache persistant, ne traite que les nouveaux records |
| **Séparation données/enrichissement** | Préfixe `ode_` pour distinguer original vs enrichi |
| **LLM hors pipeline dbt** | LLM uniquement dans scripts Python d'enrichissement, jamais dans dbt |
| **Multi-collectivités** | Une seed `city_constants` + des marts city-specific (Paris d'abord, Marseille en v1, autres villes par fork) |

### 1.3 Diagramme global

```
Sources publiques (10+)
        │
        ▼  scripts/sync/*.py (idempotent, WRITE_TRUNCATE)
┌────────────────────────────────────────────────┐
│  BIGQUERY — raw                                 │
│  Tables = dataset_id snake_case, zéro transfo  │
└────────────────────┬───────────────────────────┘
                     │  dbt run
        ┌────────────┼──────────────┐
        ▼            ▼              ▼
   STAGING       SEEDS         (autres staging)
   (Views)       (CSV)
   Nettoyage,    Mappings        ← scripts/enrich/*.py
   typage,       statiques +     (LLM batch, asyncio)
   clés std.     caches LLM
        │            │
        └────┬───────┘
             ▼
       INTERMEDIATE (Tables)
       Joins + enrichissements → colonnes ode_*
             │
             ▼
       CORE (Tables OBT, row-level)
       Une table wide par entité — 14 entités actuellement
             │
             ▼
       MARTS (Views)
       Agrégations métier pour le frontend (~28 marts)
             │
             ▼  scripts/export/*.py
       website/public/data/*.json
```

---

## 2. Sources de données

### 2.1 OpenData Paris (`opendata.paris.fr`)

| Dataset | Table raw | Records | Usage |
|---|---|---|---|
| `comptes-administratifs-budgets-principaux-*` | `comptes_administratifs_budgets_principaux_*` | ~25k | Budget exécuté (CA) |
| `comptes-administratifs-autorisations-de-programmes-*` | `comptes_administratifs_autorisations_*` | ~7k | Projets AP (dataset gelé 2022) |
| `subventions-versees-annexe-compte-administratif-*` | `subventions_versees_*` | ~47k | Subventions versées |
| `subventions-associations-votees-` | `subventions_associations_votees` | ~100k | Détail bénéficiaires (SIRET) |
| `logements-sociaux-finances-a-paris` | `logements_sociaux_finances_a_paris` | ~4k | Logements déjà géolocalisés |
| `liste-des-marches-de-la-collectivite-parisienne` | `liste_des_marches_*` | ~17k | Marchés publics Paris |
| `budgets-votes-principaux-a-partir-de-2019-*` | `budgets_votes_principaux_*` | ~30k | Budget voté (BV) |
| `bilan-comptable` | `bilan_comptable` | 1 ligne/an | Actif/passif consolidé |
| `dette-garantie` | `dette_garantie` | ~10k | Hors-bilan, dette garantie aux bailleurs |

### 2.2 Sources nationales / État

| Source | Table raw | Apport |
|---|---|---|
| **DECP** (data.gouv.fr) | `decp_marches_paris_*` | Marchés consolidés (CCAG, CPV, lieu_execution, offres_recues, montant_notifie, clauses RSE) |
| **INSEE SIRENE** | `sirene_companies` | Registre entreprises (SIRET, APE, effectifs, établissements) — enrichissement tier2 gratuit |
| **Base Adresse Nationale** | _(via API)_ | Géocodage adresses projets investissement |
| **DRIHL Île-de-France** | `drihl_paris_*` | Inventaire SRU, parc social, Socle demandes/attributions logement |
| **OFGL** | seeds `seed_ofgl_*` | Référentiels finances locales (subsectors, niveaux 2/3, comparaisons inter-collectivités) |
| **DGFiP** | `dgfip_*` | Référentiels fiscalité, tranches |
| **DREES, CNAM, CSG** | seeds dédiés | Référentiels sécurité sociale et retraites (contexte) |

### 2.3 Sources PDF (extraction in-pipeline)

| Type | Contenu | Années | Source |
|---|---|---|---|
| **CA IL** | Investissements localisés (mandaté) | 2018-2024 | `cdn.paris.fr` annexes CA |
| **BP IL** | Investissements localisés (voté) | 2025-2026 | `cdn.paris.fr` annexes BP |
| **BP Budget** | Budget voté détaillé chapitre/nature/fonction | 2023-2026 | `cdn.paris.fr` annexes BP |
| **Subventions B8.1.1** | Subventions versées 2020-2021 | 2020-2021 | `cdn.paris.fr` annexes B8.1.1 (combler trou portail) |
| **Délibérations Conseil de Paris** | Articles de séance | 2019-2025 | `api.paris.fr/delibs` |

> Les BP IL, BP Budget et budgets 2025-2026 sont des données **prévisionnelles**. Le frontend affiche un badge "Voté" pour les années non-clôturées.

---

## 3. Architecture des couches

### 3.1 RAW

Miroir exact des sources. Aucune transformation. Sync = `WRITE_TRUNCATE` (idempotent).
Convention : nom de table = `{dataset_id}` en snake_case sans abréviation.

### 3.2 STAGING (Views)

Nettoyage, typage, renommage standardisé. Pas de logique métier. 1 staging = 1 source brute.

Modèles clés actuels :

| Modèle | Source | Transformations |
|---|---|---|
| `stg_budget_principal` | CA budget | Filtre `type_op='Réel'`, typage, renommage FR |
| `stg_budget_vote` | BV budget CSV | Filtre BP initial (pas DM), `credits_votes_pmt` → montant |
| `stg_pdf_budget_vote` | Seeds PDF BV | UNION `seed_pdf_budget_vote_{2023..2026}`, normalise codes |
| `stg_ap_projets` | CA AP | Filtre Réel+Dépenses, extraction arrondissement par regex |
| `stg_pdf_investissements_localises` | Seeds PDF IL | UNION CA IL + BP IL |
| `stg_subventions_all` | CA subventions + PDF B8.1.1 | Fusion 2018-2024, normalisation nom bénéficiaire |
| `stg_associations` | Associations votées | SIRET padding 14, normalisation nom |
| `stg_logements_sociaux` | Logements | Parse `geo_point_2d` → lat/lng |
| `stg_marches_publics` | Marchés Paris | Typage dates et montants |
| `stg_decp_marches_paris` | DECP filtré SIRET 217500* | Parse JSON multi-titulaires, normalisation montants |
| `stg_bilan_comptable` | Bilan | Pivot lignes actif/passif |
| `stg_dette_garantie` | Hors-bilan | Capital restant dû par bailleur, par année |
| `stg_drihl_paris` | DRIHL | Demandes/attributions par arrondissement |
| `stg_sirene_companies` | INSEE | SIRET, APE, effectifs |
| `stg_deliberations_*` | API Paris | Sessions, délibérations, articles |
| `stg_marseille_budget` | OpenData Marseille | M57 Marseille (PoC) |
| `stg_match_projet_marches` | Seed manuel | Appariements projet ↔ marché (hash objet+titulaire) |

### 3.3 SEEDS (CSV versionnés)

**Mappings statiques** :

| Seed | Contenu |
|---|---|
| `seed_mapping_thematiques` | chapitre + fonction → thématique dashboard |
| `seed_mapping_directions` | direction → thématique |
| `seed_mapping_beneficiaires` | pattern regex → thématique subvention |
| `seed_mapping_entites` | pattern → nom canonique (CASVP, RIVP, etc.) |
| `seed_lieux_connus` | pattern → adresse exacte (Piscine Pontoise, Gymnase Japy, etc.) |
| `seed_city_constants` | Constantes par ville (population, surface, codes INSEE) |
| `seed_communes_cibles` | Liste des communes à ingérer (Paris, Marseille, …) |
| `seed_match_projet_marches` | Appariements manuels projet ↔ marché |

**Référentiels nationaux** :

| Seed | Source |
|---|---|
| `seed_apul_subsectors`, `seed_ofgl_*` | OFGL — référentiels finances locales |
| `seed_dette_charges` | Charges financières par catégorie |
| `seed_drees_retraites_branches`, `seed_csg_retraite_tranches` | DREES — retraites |
| `seed_cnam_l4_medecine_ville` | CNAM |
| `seed_etat_autres_ministeres`, `seed_education_niveaux` | État |
| `seed_legal_thresholds`, `seed_fiscal_constants` | Seuils légaux et constantes fiscales |
| `seed_drihl_paris_2024` | Snapshot DRIHL |

**Caches d'enrichissement (générés par scripts Python)** :

| Seed | Source script | Records |
|---|---|---|
| `seed_cache_thematique_beneficiaires` | LLM (Claude/Gemini) | 1k+ |
| `seed_cache_geo_ap` | LLM | 500+ |
| `seed_cache_siret_by_name` | API recherche-entreprises | 5k+ |
| `seed_pdf_budget_vote_{2023..2026}` | `extract_pdf_budget_vote.py` | 1500-1900/an |
| `seed_pdf_investissements_{2022..2024}` | `extract_pdf_investments.py` | ~400/an |

### 3.4 INTERMEDIATE (Tables)

JOIN staging + seeds → ajout colonnes `ode_*`.

> **Règle stricte** : la consolidation de sources multiples (PDF + CSV, Paris + DECP) se fait toujours en intermediate, jamais en staging.

Exemples :
- `int_subventions_enrichies` — cascade thématique (pattern → direction → LLM → default)
- `int_ap_projets_enrichis` — cascade géoloc (regex → lieu connu → LLM)
- `int_marches_publics_fusionnes` — JOIN Paris ⊕ DECP via `SUBSTR(numero_marche, 5) = decp_id`

### 3.5 CORE (Tables OBT, row-level)

Une table dénormalisée wide & flat par entité. Grain le plus fin possible.

| Core table | Source | Grain | Couverture | Colonnes ode_* clés |
|---|---|---|---|---|
| `core_budget` | `stg_budget_principal` | (annee, section, chapitre, nature, fonction, sens_flux) | 2019-2024 | `ode_thematique`, `ode_categorie_flux` |
| `core_budget_vote` | `stg_pdf_budget_vote` | idem | 2023-2026 | `ode_thematique`, `ode_categorie_flux` |
| `core_subventions` | `int_subventions_enrichies` | (annee, beneficiaire_normalise) | 2018-2024 | `ode_thematique`, `ode_type_organisme`, `ode_source_thematique`, `ode_beneficiaire_canonique` |
| `core_ap_projets` | `int_ap_projets_enrichis` | (annee, ap_code) | 2018-2022 (gelé) | `ode_arrondissement`, `ode_latitude/longitude`, `ode_confiance` |
| `core_pdf_investissements_localises` | `stg_pdf_investissements_localises` | (annee, ap_code) | 2018-2026 | Géolocs IL prend le relai après gel du dataset AP |
| `core_logements_sociaux` | `stg_logements_sociaux` | (id_livraison) | 2001-2024 | `ode_arrondissement_affichage` (Paris Centre 1-4 → 0) |
| `core_logement_attente_arr` | `stg_drihl_paris` | (arrondissement) | 2024 | Demandes / attributions / tension |
| `core_marches_publics` | `int_marches_publics_fusionnes` | (numero_marche, titulaire) | 2013-2026 | Fusion Paris + DECP, dédup multi-titulaires |
| `core_bilan_comptable` | `stg_bilan_comptable` | (annee, ligne) | 2019-2024 | Actif/passif normalisé |
| `core_dette_garantie` | `stg_dette_garantie` | (emprunt_id, annee) | 2019-2024 | Capital restant dû, bailleur, garant |
| `core_deliberations` | `stg_deliberations_*` | (session, delib_id, article_id) | 2019-2025 | Bénéficiaires extraits par LLM |
| `core_sirene_companies` | `stg_sirene_companies` | (siret) | snapshot | Cache SIRET enrichi |
| `core_enrichment_caches` | meta | union des caches LLM | — | Provenance/coût enrichissement |
| `core_marseille_budget` | `stg_marseille_budget` | (annee, section, chapitre, nature) | 2019-2024 | Marseille M57 PoC |

### 3.6 MARTS (Views)

Agrégations métier. C'est ici qu'on JOIN/compare/aggregate les entités pour le frontend.

| Catégorie | Marts | Fonction |
|---|---|---|
| Budget | `mart_sankey`, `mart_budget_sankey_lines`, `mart_budget_nature`, `mart_budget_recettes_par_chapitre`, `mart_evolution_budget`, `mart_vote_vs_execute` | Diagrammes, évolution, comparaison voté/exécuté |
| Subventions | `mart_subventions_treemap`, `mart_subventions_beneficiaires`, `mart_concentration` | Treemap, table filtrable, analyse Pareto |
| Investissements | `mart_carte_investissements`, `mart_investissements_map`, `mart_investissements_localises`, `mart_stats_arrondissements` | Cartes + statistiques |
| Logement | `mart_logements_map`, `mart_logement_attente` | Choroplèthe + tension par arrondissement |
| Marchés publics | `mart_marches_fournisseurs`, `mart_marches_par_nature`, `mart_projet_marches` | Fournisseurs, catégories, appariement projet ↔ marché |
| Bilan / hors-bilan | `mart_bilan_comptable`, `mart_bilan_sankey`, `mart_hors_bilan` | Actif/passif + dette garantie |
| Délibérations | `mart_deliberations` | Recherche par bénéficiaire / thématique |
| Méta | `mart_enrichment_caches`, `mart_data_availability_*` | Provenance LLM, fraîcheur des sources |
| Marseille | `mart_marseille_budget_sankey_lines` | Sankey budget Marseille |

**`mart_vote_vs_execute` — détail** :
- FULL OUTER JOIN `core_budget` × `core_budget_vote` sur (annee, section, sens_flux, chapitre_code, ode_thematique)
- Calcule `taux_execution_pct`, `ecart_absolu`, `ecart_relatif_pct`
- CTE `taux_historique` : AVG/STDDEV du taux par poste pour estimation 2025-2026
- Flags : `comparaison_possible` (2023-2024), `vote_seul` (2025-2026)

---

## 4. Conventions de nommage

### 4.1 Colonnes

| Préfixe | Signification | Exemple |
|---|---|---|
| _(aucun)_ | Donnée originale | `beneficiaire`, `montant`, `annee` |
| `ode_` | **O**pen **D**ata **E**nrichment | `ode_thematique`, `ode_latitude` |

### 4.2 Tables

| Couche | Pattern | Exemple |
|---|---|---|
| Raw | `{dataset_id_snake_case}` | `comptes_administratifs_*` |
| Staging | `stg_{entite}` | `stg_budget_principal`, `stg_decp_marches_paris` |
| Intermediate | `int_{entite}_{action}` | `int_subventions_enrichies` |
| Core | `core_{entite}` | `core_budget`, `core_marches_publics` |
| Mart | `mart_{usage}` | `mart_sankey`, `mart_vote_vs_execute` |

### 4.3 Seeds

| Type | Pattern | Exemple |
|---|---|---|
| Mapping statique | `seed_mapping_{objet}` | `seed_mapping_thematiques` |
| Constantes | `seed_{domaine}_constants` | `seed_city_constants`, `seed_fiscal_constants` |
| Référentiels externes | `seed_{source}_{objet}` | `seed_ofgl_local_commune_l2` |
| Cache enrichissement | `seed_cache_{source}_{objet}` | `seed_cache_geo_ap`, `seed_cache_siret_by_name` |
| Extraction PDF | `seed_pdf_{type}_{année}` | `seed_pdf_budget_vote_2025` |

---

## 5. Stratégies de jointure et règles métier

### 5.1 Clés principales

| Source A | Source B | Clé | Qualité |
|---|---|---|---|
| Budget CA | AP Projets | `nature_code + fonction_code + annee` | Exacte |
| Subventions (annexe) | Associations | `beneficiaire_normalise + annee` | Exacte |
| Subventions | Budget | Pas de clé directe | Via thématique (approximatif) |
| Budget CA | Budget BV | `annee + section + sens_flux + chapitre_code + ode_thematique` | Exacte (mart) |
| Marchés Paris | DECP | `SUBSTR(numero_marche, 5) = decp_id` | Exacte |
| AP Projets | Marchés | Hash objet+titulaire (`seed_match_projet_marches`) | Manuel + LLM |

### 5.2 Règles anti-double-comptage

- **Opérations "pour ordre"** : filtrées en staging (`type_op='Réel'`). Sinon le budget double.
- **Multi-titulaires marchés** : un même marché peut apparaître N fois (un par titulaire). Dédup dans `core_marches_publics` par `(objet, montant, date_notification)` pour les agrégats — détail multi-titulaires conservé pour drill-down.
- **CASVP / RIVP / Paris Habitat** : noms multiples → `seed_mapping_entites` → colonne `ode_beneficiaire_canonique`.
- **Paris Centre (1-4)** : agrégés via `ode_arrondissement_affichage=0` dans `core_logements_sociaux` et `core_ap_projets`.
- **Budget voté vs exécuté** : `core_budget` et `core_budget_vote` jamais UNIONés. Comparaison uniquement dans `mart_vote_vs_execute`.

---

## 6. Enrichissement

### 6.1 Principes

- LLM **hors dbt**, dans scripts Python (`pipeline/scripts/enrich/`)
- Incrémental : ne traite que les records non encore cachés
- Cache persistant en seed CSV → committé en Git
- 3 niveaux de confiance déclarés : haut (regex/lieu connu), moyen (LLM), bas (default)

### 6.2 Cascades

**Thématique subventions** :
```
1. seed_mapping_beneficiaires (pattern regex)
2. seed_mapping_directions (par direction)
3. seed_cache_thematique_beneficiaires (LLM Claude/Gemini)
4. Fallback "Autres"
```

**Géolocalisation projets AP** :
```
1. Regex extraction d'adresse dans objet
2. seed_lieux_connus (matching exact bâtiments publics)
3. seed_cache_geo_ap (LLM Gemini avec grounding)
4. Vérification API Adresse (Base Adresse Nationale)
```

**SIRET bénéficiaires** :
```
1. Champ SIRET déjà présent dans associations
2. seed_cache_siret_by_name (recherche-entreprises.api.gouv.fr, public, no auth)
3. enrich_beneficiaire_grounded_llm (Gemini + Google Search grounding)
```

### 6.3 Coût des enrichissements

Les enrichissements LLM tier 1 (vulgarisations marchés ≥ 80k€) sont **opt-in** via `--tier1` dans `run_all.sh`. Sans clé API, les scripts skip gracefully — le pipeline complète son cycle même sans LLM.

---

## 7. Multi-collectivités

### 7.1 Stratégie

- **Paris** = collectivité de référence (couverture la plus complète)
- **Marseille** = PoC v1, périmètre budget M57 uniquement
- Seeds par ville (`seed_city_constants`, `seed_communes_cibles`) pour paramétrer
- Models city-specific préfixés (`core_marseille_budget`, `mart_marseille_budget_sankey_lines`)
- Models génériques (multi-cities-aware) à partir de v2

### 7.2 Ajouter une nouvelle ville

1. Ajouter une ligne à `seed_communes_cibles` (code INSEE, nom, slug)
2. Ajouter une ligne à `seed_city_constants` (population, surface, autres constantes)
3. Créer `stg_{ville}_budget` (ingestion depuis le portail open data de la ville)
4. Créer `core_{ville}_budget` (passthrough OBT)
5. Créer `mart_{ville}_budget_sankey_lines` (agrégations)
6. Ajouter une page frontend dédiée

---

## 8. Export et frontend

Les marts BigQuery sont exportés en JSON statiques dans `website/public/data/` par les scripts `pipeline/scripts/export/*.py`. Le frontend Next.js ne fait **aucun appel à BigQuery en runtime** — tout est pré-calculé.

Format typique des JSON :
```json
{
  "schema_version": 2,
  "generated_at": "2026-05-21T10:32:18Z",
  "source": "core_marches_publics",
  "source_url": "https://opendata.paris.fr/...",
  "data": [ /* ... */ ]
}
```

Les champs `source` et `source_url` sont obligatoires et servent au modal "Provenance" du frontend.

---

## 9. Workflow de mise à jour

```bash
# 1. Sync sources brutes (idempotent)
python scripts/sync/sync_opendata.py
python scripts/sync/fetch_decp_paris.py --global

# 2. dbt build (transformations)
dbt deps
dbt seed
dbt run
dbt test

# 3. Enrichissements (optionnel, payant)
python scripts/enrich/enrich_thematique_llm.py
python scripts/enrich/enrich_beneficiaire_grounded_llm.py

# 4. Re-run dbt pour intégrer les enrichissements
dbt run --select int_*+ core_*+ mart_*+

# 5. Export JSON pour le frontend
python scripts/export/export_all.py
```

Voir `pipeline/run_all.sh` pour un pipeline complet automatisé.

---

## Voir aussi

- [`data-quality.md`](./data-quality.md) — règles de qualité, limites connues, observations
- [`methodology-changelog.md`](./methodology-changelog.md) — journal des changements méthodologiques
- [`replicability.md`](./replicability.md) — comment reproduire les chiffres affichés sur le site
