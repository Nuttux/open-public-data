# Replicability Guide — Deploying for Other French Cities

This document analyzes what would need to change to deploy Donnees Lumieres
for a city other than Paris, and estimates the effort involved.

---

## What's Already Generic

| Component | Why it works everywhere |
|-----------|----------------------|
| **dbt pipeline** (staging → core → marts) | Architecture is city-agnostic |
| **M57 nomenclature** | National standard since 2019 — all French communes use it |
| **Export pattern** (Python → JSON) | Generic, only queries need city-specific table names |
| **Shared UI components** (AnnuelTab, TendancesTab, ExplorerTab) | Config-driven, no city logic |
| **ECharts visualizations** (Sankey, Treemap, stacked bar) | Data-driven, no hardcoded content |
| **Blog engine** (MDX) | Generic |
| **LLM enrichment mechanism** (geocoding, classification) | Prompts are adaptable, mechanism is reusable |

---

## What's Paris-Specific

### Pipeline (effort: ~1 week)

| File | What's hardcoded | How to parameterize |
|------|-----------------|-------------------|
| `pipeline/scripts/sync/sync_opendata.py` | Dataset IDs (`comptes-administratifs-budgets-principaux-...`), API base URL (`opendata.paris.fr`) | Create `cities/<city>.yml` config with dataset IDs + API URL. Modify sync script to load from config. |
| `pipeline/models/staging/stg_ap_projets.sql` | Regex for Paris postal codes (`7500[1-9]\|750[12][0-9]`) and arrondissement extraction | Make regex configurable per city, or make AP geolocation optional for cities without sub-divisions. |
| `pipeline/dbt_project.yml` | BigQuery project/dataset names, seed file references | Add a `city` variable. Prefix dataset names with city slug. |
| `pipeline/seeds/seed_mapping_*` | Thematic mappings based on Paris budget structure | Regenerate per city. Structure is reusable, content is city-specific. |
| `pipeline/seeds/seed_lieux_connus.csv` | Manual geocoding of known Paris locations | Create per-city seed files. |
| `pipeline/seeds/seed_cache_geo_ap.csv` | LLM geocoding cache for Paris AP projects | Regenerate via `enrich_geo_ap_llm.py` for new city's data. |

### Frontend (effort: ~1-2 weeks)

| File | What's hardcoded | How to parameterize |
|------|-----------------|-------------------|
| `website/src/lib/constants/arrondissements.ts` | 20 Paris arrondissements + populations (150+ lines) | Create a `cities/<city>/divisions.ts` with the city's administrative subdivisions. Small communes may have none. |
| `website/src/lib/api/parisOpenData.ts` | Base URL `opendata.paris.fr`, dataset IDs in function calls, `limit: 20` for arrondissements | Rename to `cityOpenData.ts`, load config from city module. |
| `website/src/components/map/` (ParisMap, LeafletMap) | `PARIS_CENTER: { lat: 48.8566, lon: 2.3522 }`, `ARRONDISSEMENT_CENTROIDS`, default zoom 12 | Load center/zoom from city config. Load centroids dynamically. |
| `website/src/app/page.tsx` | Hero figures ("11,7 Md euros"), text "Ville de Paris", "collectivite parisienne" | Make data-driven (fetch from budget index) and city-name configurable. |
| `website/src/components/Navbar.tsx` | Brand name "Donnees Lumieres", descriptions mentioning "Paris" | Parameterize brand and city name. |
| `website/public/data/` | All pre-computed JSON files are Paris data | Re-run export pipeline for new city's data. Structure is identical. |

### Content (effort: ~3 days)

| File | What's hardcoded |
|------|-----------------|
| `website/content/blog/*.mdx` | All articles reference Paris data and policies |
| `website/src/lib/glossary.ts` | Budget terms — these are actually universal (M57) |

---

## Recommended Architecture for Multi-City Support

```
cities/
  paris.yml         # Dataset IDs, API URL, admin divisions, coordinates
  lyon.yml
  marseille.yml

pipeline/
  scripts/sync/
    sync_opendata.py  # Reads from cities/<city>.yml
  models/
    staging/          # Parameterized with {{ var('city') }}

website/
  src/lib/
    config/
      cities.ts       # City registry with center, divisions, etc.
      index.ts        # Export active city config
  public/data/
    paris/            # City-specific data directory
    lyon/
```

### Key decisions

1. **One deployment per city** (recommended initially): Fork or branch per city.
   Simplest to maintain, avoids multi-tenant complexity.

2. **Multi-tenant SaaS** (future): Single deployment with city selector.
   Requires URL-based routing (`/paris/budget`, `/lyon/budget`) and dynamic data loading.

---

## Effort Estimate

| Task | Days | Notes |
|------|------|-------|
| Create city config system (YAML + loader) | 2 | Pipeline + frontend |
| Parameterize sync script | 1 | Swap hardcoded DATASETS dict |
| Parameterize staging SQL (AP regex) | 1 | Or make optional |
| Frontend city config module | 2 | Arrondissements, map center, API URLs |
| Landing page data-driven content | 1 | Replace hardcoded figures |
| Re-run pipeline for new city | 2 | Sync + dbt + enrichment + export |
| Testing + fixes | 2-3 | |
| **Total** | **~11-14 days** | For an experienced developer |

---

## Best Candidate Cities

| City | Arrondissements | Open Data Portal | Budget Data | AP/Investissements | Logements | Marches |
|------|----------------|-----------------|-------------|-------------------|-----------|---------|
| **Lyon** | 9 arr. | data.grandlyon.com (ODS) | Yes (M57) | Likely | Yes | Yes |
| **Marseille** | 16 arr. | data.marseille.fr (ODS) | Yes (M57) | Partial | Partial | Yes |
| **Bordeaux** | None (quartiers) | opendata.bordeaux-metropole.fr | Yes (M57) | Unknown | Yes | Yes |
| **Toulouse** | None (quartiers) | data.toulouse-metropole.fr | Yes (M57) | Unknown | Unknown | Yes |
| **Nantes** | None | data.nantesmetropole.fr | Yes (M57) | Unknown | Yes | Yes |

**Lyon** is the strongest candidate: arrondissements (like Paris), mature ODS portal, comprehensive datasets.

---

## Business Model Considerations

### Potential Offerings

1. **Open-source self-deploy**: Any city can fork and deploy. Free, community-maintained.
2. **Setup-as-a-service**: Configure, deploy, and hand over a city instance. One-time fee.
3. **SaaS for collectivites**: Hosted, maintained, updated. Monthly/annual subscription.
4. **Training / consulting**: Help cities improve their open data practices.

### Market Size

- ~35,000 French communes, but realistically:
  - ~300 cities > 30,000 inhabitants (likely publish open data)
  - ~40 cities > 100,000 inhabitants (most have ODS portals)
  - ~13 metropoles (highest data maturity)

### Competitive Landscape

- **OpenDataSoft/Huwise**: Dominant SaaS for data catalogs, but weak on narrative/visualization
- **data.gouv.fr**: National catalog, no storytelling
- **DataFrance**: National indicators, not budget-focused
- **No direct competitor** for purpose-built, story-first municipal budget visualization in France

### Key Differentiator

The pipeline (dbt + enrichment + M57 knowledge) is the moat. Raw open data is available to everyone, but the transformation into citizen-readable visualizations requires significant domain expertise that's encoded in the SQL models and seed mappings.
