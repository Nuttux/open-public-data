# US v0 — execution plan

**Date: 2026-07-15.** Operationalizes [ADR-0010](../decisions/0010-multi-country-architecture.md) + [API-RECON](API-RECON.md). Checkboxes updated as work lands. Each phase has acceptance criteria — a phase is not "done" until they pass.

## Phase R — Routes v2: migrate France to `/{country}/{level}/{level_name}` (branch `routes-v2`, PR to `main`)

Pure URL migration, zero behavior change. Ships independently of US work so France prod gets it early and `us-v0` rebases on it.

- [x] R1. Move trees (`796f2e0b`, pure git mv, 139 files) + import fixes (`7e4f0f1e`: fusion.css depth).
- [x] R2. Redirects retargeted + catch-alls (`49975b22`); verified one-hop 308s incl. `/budget`, `/ville/paris/budget`, `/france/daily-bread`, `/c/lyon`, `/qui-recoit/association/*`.
- [x] R3. Link sweep done (zero residual `"/ville/`/`"/france/` in src); also blog MDX, `corrections.json`, `cross_cutting_themes.json` + its generator `build_cross_cutting_themes.py`.
- [x] R4. `data_lineage.json` updated directly — **no pipeline generator exists** (hand-authored file; only consumer DataProvenance.tsx).
- [x] R5. Build green; 13 Playwright screenshots (desktop+mobile) reviewed 2026-07-15; drawer deep links + client-side intercept verified. **Awaiting daniel's review → merge `routes-v2` into `main`.**

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
