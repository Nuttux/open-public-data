# US v0 — execution plan

**Date: 2026-07-15.** Operationalizes [ADR-0010](../decisions/0010-multi-country-architecture.md) + [API-RECON](API-RECON.md). Checkboxes updated as work lands. Each phase has acceptance criteria — a phase is not "done" until they pass.

## Phase R — Routes v2: migrate France to `/{country}/{level}/{level_name}` (branch `routes-v2`, PR to `main`)

Pure URL migration, zero behavior change. Ships independently of US work so France prod gets it early and `us-v0` rebases on it.

- [ ] R1. Move trees: `app/ville/paris/*` → `app/fr/city/paris/*`, `app/ville/marseille/*` → `app/fr/city/marseille/*`, `app/ville/[slug]` → `app/fr/city/[slug]`, `app/france/*` → `app/fr/national/*`; drawer intercepts `@drawer/(...)ville/*` → `@drawer/(...)fr/city/*`; fix cross-tree imports (Marseille pages import Paris clients).
- [ ] R2. `next.config.ts`: retarget the 34 legacy redirects to final destinations (no chains), add catch-alls `/ville/:path*` → `/fr/city/:path*`, `/france/:path*` → `/fr/national/:path*`.
- [ ] R3. Internal link sweep: ~123 `"/ville/` + ~121 `/france/` occurrences across ~100 src files (nav-links, ScopeDropdown, chat systemPrompt/tools, sitemap, robots, OG routes, i18n values). Data-file paths under `public/data/` are NOT routes — untouched.
- [ ] R4. `data_lineage.json` page references + its pipeline generator (so regeneration doesn't revert).
- [ ] R5. Verify: build green; zero residual old-route strings outside redirect sources; Playwright desktop+mobile screenshots of root, Paris budget/subventions, Marseille budget, national budget/daily-bread; drawer deep-link loads; old URL 301s once.

**Acceptance**: all R5 checks pass, screenshots visually reviewed (no layout/regression), single-hop redirects, France pages pixel-identical.

## Phase 0 — Foundations (branch `us-v0`)

- [ ] 0.1 Place registry: `places` manifest (slug, country, level, schema family, locale, currency, data namespace, enabled modules) + loader; ScopeDropdown/nav/sitemap read it. `EXHAUSTIVE_CITIES` hand-wiring retired.
- [ ] 0.2 `ADDING-A-PLACE.md` skeleton at repo root (collaborator path: source audit → schema family → registry + country YAML + seeds → pages).

**Acceptance**: France behavior unchanged with registry driving nav; a stranger can read ADDING-A-PLACE.md and name the files they'd touch for a new place.

## Phase 1 — `/us/national` daily-bread vertical slice (branch `us-v0`)

- [ ] 1.1 `configs/countries/us.yaml` + `scripts/sync/sync_fiscaldata.py` (protocol adapter) → `raw.us_mts_table_9`, `raw.us_mts_table_5`, `raw.us_debt_*` (+ catalog metadata capture).
- [ ] 1.2 dbt `models/us/{staging,core,marts}` → `dbt_us_*` datasets. stg encodes the verified extraction recipes (Table 9: `D`+`F` rows; Table 5: `T`+`C` agency totals). Tests: `T = Σ D` identities, cross-table total equality (T9=T3=T5), units/signs normalized per API-RECON D.3.
- [ ] 1.3 Census population seed/sync (per-resident scaling) with source_url.
- [ ] 1.4 Export `public/data/us/national/daily_bread.json` (+ index): `generated_at`, `source_pipeline`, per-value `source`/`source_url`, `as_of` completeness flag.
- [ ] 1.5 Page `app/us/national/` (EN-only): receipts → functions daily-bread view composed from fusion primitives; per-resident scaling; provenance modal wired to `dbt_us_*` lineage.
- [ ] 1.6 LEARNINGS.md rows for every transplant/generalization made along the way.

**Acceptance**: dbt tests green incl. identity tests; exported totals match MTS published figures (spot-check vs Treasury site); page renders with real data, screenshot-reviewed desktop+mobile; every displayed number traceable to a source_url; zero hardcoded figures.

## Phase 2 — `/us/city/sf` modern spine (next milestone, plan before starting)

DataSF budget + actuals + vendors per API-RECON A; reconciliation rule (net vs gross) decided and documented on the méthode page; then ACFR/archive time-machine layers per RESEARCH-BRIEF.

## Phase 3+ — later

Chat place-pack, archive era layers, Ventura replicability proof, decentralized artifact exploration (ADR-0010 §Resolved 3).
