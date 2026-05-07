# ADR-0008 : Convention de nommage des tables BigQuery

**Status** : Accepted (2026-05-07)
**Décideur** : daniel

## Contexte

Le dataset `raw.*` mélange aujourd'hui deux conventions :

**Tables récentes (suffixe `_paris`)** — ajoutées dans le refactor layering :
- `deliberations_sessions_paris`, `deliberations_delibs_paris`, `deliberations_articles_paris`
- `dette_garantie_paris`
- `enrichment_caches_paris`
- `pdf_investissements_localises_paris`
- `sirene_companies_paris`
- `decp_marches_paris` (existant)

**Tables legacy (pas de suffixe)** — créées par `sync_opendata.py` et héritant des dataset IDs OpenData :
- `bilan_comptable`
- `comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement`
- `budgets_votes_principaux_a_partir_de_2019_m57_ville_departement`
- `subventions_associations_votees`
- `subventions_versees_annexe_compte_administratif_a_partir_de_2018`
- `logements_sociaux_finances_a_paris`
- `liste_des_marches_de_la_collectivite_parisienne`

## Décision

### Règle pour les nouvelles tables

**Format** : `<entity>_<scope>` où :
- `<entity>` = nom court du concept (ex `dette_garantie`, `deliberations_articles`)
- `<scope>` = `paris` (Paris-only), `idf` (Île-de-France), ou supprimé si globalement national/multi

Exemples corrects :
- `dette_garantie_paris` ✓
- `deliberations_articles_paris` ✓
- `eurostat_cofog` (scope national) ✓

Justification : préfixer par scope plutôt que suffixer permet une lecture cohérente quand le projet s'étendra hors Paris (cf. roadmap France Open Data).

### Règle pour les tables legacy

**Ne pas renommer**. Le coût (drop + recreate + recompute downstream + risque de casse silencieuse de l'UI) dépasse le gain. Documenter dans `sources.yml` et `02-catalog-and-model.md` la correspondance dataset OpenData → table raw pour rester traçable.

### Quand un legacy doit-il être migré

- Si une migration majeure du sync est prévue (changement de schéma, partitioning)
- Si une table legacy doit être renommée pour un autre raison (collision de nom, conflit de dataset)

À ce moment-là, créer un ADR de migration spécifique avec plan de rollback.

## Alternatives rejetées

**A. Renommer toutes les legacy en `<entity>_paris`**
- ✅ Cohérent
- ❌ ~8 tables × (BQ rename + dbt source update + stg update + verify) = ~2-3h de churn
- ❌ Risque non-zero de régression silencieuse pendant la migration
- ❌ Aucune valeur user-facing (les tables ne sont pas exposées en UI)

**B. Renommer toutes les nouvelles SANS suffixe** (uniformiser dans l'autre sens)
- ✅ Imite l'existant
- ❌ Quand le projet s'étendra national, on aura `dette_garantie` (Paris) vs `dette_garantie_lyon` ? Inconsistant.

## Conséquences

**Positives** :
- Nouveau code suit une règle claire
- Pas de churn massif sur le legacy

**Négatives** :
- Les tables raw dataset restent une mosaïque de conventions, jusqu'à ce qu'une raison externe oblige la migration
- Un nouveau contributeur peut être surpris

## Enforcement

Ajouter dans `pipeline/scripts/audit/check_layering.py` un check optionnel (warning, pas error) :
> `raw.*` table not following `<entity>_<scope>` pattern → warning. Listed exceptions = legacy tables (whitelist explicite).
