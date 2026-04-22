# Legacy cleanup — post fusion redesign

Date : 2026-04-22
Branche : `test`

Nettoyage du code pré-fusion (ancienne version du site Paris) après la refonte
`mockups/06-fusion`. Objectif : supprimer tout ce qui n'est plus importé par les
pages live, en préservant l'infra analytics (provider + endpoint BigQuery).

## Ce qui reste en prod

Toutes les routes live utilisent `@/components/fusion/*` + loaders
`@/lib/fusion-data.ts` :

- `/` (LandingClient)
- `/budget`, `/budget/poste/[slug]`, `/budget/@drawer/*`
- `/investissements`, `/investissements/projet/[id]`, `/investissements/chapitre/[slug]`, `/investissements/arrondissement/[num]`, `/investissements/@drawer/*`
- `/qui-recoit`, `/qui-recoit/association/[slug]`, `/qui-recoit/theme/[slug]`, `/qui-recoit/@drawer/*`
- `/marches-publics`, `/marches-publics/contrat/[numero]`, `/marches-publics/fournisseur/[siren]`, `/marches-publics/categorie/[slug]`, `/marches-publics/@drawer/*`
- `/dette-patrimoine`, `/dette-patrimoine/bailleur/[slug]`, `/dette-patrimoine/stress-test`, `/dette-patrimoine/@drawer/*`
- `/logement-social`
- `/analyses`, `/analyses/[slug]`
- `/methode`, `/contact`
- `/fusion-preview` (design-system showcase)

## Ce qui a été supprimé

### Répertoires de composants (pré-fusion, plus référencés nulle part)

```
website/src/components/blog/
website/src/components/budget/
website/src/components/investissements/
website/src/components/logements/
website/src/components/map/
website/src/components/marches-publics/
website/src/components/patrimoine/
website/src/components/shared/
website/src/components/subventions/
website/src/components/tableau-de-bord/
website/src/components/villes/
```

### Composants racine orphelins

```
BilanSankey · BudgetSankey · BudgetTypeBadge · DataQualityBanner
DebtRatiosChart · DebtStockChart · DrilldownPanel · EvolutionChart
FinancialHealthChart · GlossaryDrawer · GlossaryShell · GlossaryTip
MarchesFilters · MarchesTable · NatureDonut · Navbar (ancien)
PageHeader · StatsCards · SubventionsFilters · SubventionsTable
SubventionsTreemap · TabBar · VariationRankChart · YearRangeSelector
YearSelector · YoyCards
```

`AnalyticsProvider.tsx` conservé à la racine — point de montage unique dans
`app/layout.tsx`.

### Modules `lib/` supprimés

```
lib/api/villesData.ts · lib/api/staticData.ts
lib/api/parisOpenData.ts · lib/api/entreprises.ts
lib/types/villes.ts · lib/types/map.ts
lib/constants/cities.ts · lib/constants/arrondissements.ts · lib/constants/directions.ts
lib/colors.ts · lib/icons.tsx
lib/glossary.ts · lib/glossaryContext.tsx
lib/formatters.ts · lib/categoryTranslations.ts
lib/hooks/useIsMobile.ts · lib/hooks/useTabState.ts · lib/hooks/useYearParam.ts
```

Les sous-dossiers `lib/api/`, `lib/types/`, `lib/constants/` ont été entièrement
supprimés (plus aucun fichier dedans). `lib/hooks/` conserve uniquement
`useAnalytics.ts`.

### Routes supprimées

- Tout le sous-arbre `website/src/app/[locale]/villes/*` (voir section
  « Feature `/villes` » ci-dessous).

### Data publique supprimée

- `website/public/data/villes/` (JSON pré-exportés des 20 villes).

### Redirects `next.config.ts`

Retrait des deux entrées `/villes` → `/fr/villes` (la route cible n'existe plus).
Les redirects pré-fusion vers les nouvelles routes (`/subventions` →
`/qui-recoit`, etc.) sont conservés.

## Feature `/villes` — ce qu'elle faisait

Section multi-ville comparant les finances des 20 plus grandes villes
françaises, construite avant la refonte fusion. Arbre de routes :

```
/[locale]/villes                        → index + barre de recherche
/[locale]/villes/benchmarking           → comparaison multi-ville (barres/radar)
/[locale]/villes/comparaison            → comparateur sélectif entre villes
/[locale]/villes/carte                  → carte de France avec choroplèthe
/[locale]/villes/[city-slug]            → redirect vers /budget
/[locale]/villes/[city-slug]/budget     → Sankey + KPIs d'une ville
/[locale]/villes/[city-slug]/patrimoine → bilan + ratios d'une ville
/[locale]/villes/[city-slug]/marches    → top titulaires + catégories CPV
/[locale]/villes/[city-slug]/subventions → top bénéficiaires + tableau
```

### Données sources

- 20 villes indexées dans `lib/constants/cities.ts` (slug, code INSEE,
  population, couleur par ville).
- Fichiers JSON pré-exportés côté serveur, chargés côté client via
  `lib/api/villesData.ts` (fetch + cache mémoire) :
  - `public/data/villes/cities.json` — index des villes
  - `public/data/villes/benchmarking.json` — agrégats multi-ville par année
  - `public/data/villes/<slug>/budget.json`, `/marches.json`, `/subventions.json`, `/bilan.json`
- Pipeline d'export côté Python dans `pipeline/` (scripts OFGL/DGFiP —
  non touchés par ce nettoyage).

### Composants clés (supprimés)

- `components/villes/BenchmarkingBars` + `BenchmarkingRadar` — charts
  multi-ville
- `components/villes/SourceLinks` — footer de sources DGFiP/OFGL
- `components/villes/GlossaryTip`, `VillesSkeleton` — UI partagée
- `CityLayoutClient` (dans la route) — breadcrumb + tabs budget/patrimoine/
  marches/subventions pour chaque ville

### Positionnement vis-à-vis de la stratégie France Open Data

La stratégie validée (voir `project_france_open_data.md` en mémoire) prévoit
une refonte complète de l'extension nationale avec :

- une entrée territoriale scalée aux ~35 000 collectivités (via OFGL, pas un
  subset de 20 villes hard-codées) ;
- une entrée thématique nationale (budget État, APU consolidés) ;
- socle data partagé DGFiP / SIRENE / DECP, cross-links entre les deux
  échelles.

La feature `/villes` actuelle ne correspond pas à ce plan (20 villes en dur,
pas de nomenclature M14/M57, pas d'APU). Elle est donc retirée plutôt que
migrée, et sera reconstruite nativement dans le design fusion au moment
opportun.

## Analytics — impact du cleanup

Backbone préservé :

- `AnalyticsProvider` monté dans `app/layout.tsx`
- Hook `useAnalytics` dans `lib/hooks/useAnalytics.ts`
- Contexte `lib/analyticsContext.tsx` (hook `useTrack`)
- Endpoint serveur `app/api/ev/route.ts` (écrit dans BigQuery
  `product_analytics.events_v2`)
- Variables d'env : `NEXT_PUBLIC_ANALYTICS_ENABLED`,
  `BIGQUERY_ANALYTICS_KEY`, `BIGQUERY_ANALYTICS_PROJECT`,
  `BIGQUERY_ANALYTICS_DATASET`

Events automatiques toujours émis (liés au pathname, pas aux composants) :

- `session_start`
- `page_view`
- `scroll_depth`

Events custom perdus avec le cleanup (ils n'étaient câblés que dans des
composants legacy, jamais portés sur les pages fusion) :

```
nav_click · tab_change · glossary_open · glossary_term_view ·
glossary_section_toggle · sankey_node_click · sankey_drilldown ·
drilldown_close · chart_click · donut_click · treemap_click ·
table_sort · table_paginate · view_toggle · filter_change ·
filter_reset · year_change · year_range_change · map_view_toggle ·
cta_click · external_link_click
```

Ces events ne sont **pas** réémis aujourd'hui. Rewire à prévoir (tâche
séparée) : ajouter `useTrack()` sur les interactions clés des composants
`fusion/*` (drawers, choroplèthe, filtres recherche marchés publics,
sélecteurs d'année, etc.).
