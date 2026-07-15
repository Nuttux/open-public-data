# ADR-0010 : Multi-country architecture — one repo, one app, three contracts

**Status** : Accepted (2026-07-15) — daniel validated the one-repo/three-contracts direction and answered the four open questions (see §Resolved questions).
**Décideur** : daniel
**Contexte** : US expansion (`/us/national` + `/us/city/sf`, docs/us/RESEARCH-BRIEF.md), anticipated third-country requests ("Vancouver version"), question raised 2026-07-15: separate repos per place vs one repo with divided functionality.

## Context

Three bodies of evidence, all from 2026-07-15:

1. **API recon** ([docs/us/API-RECON.md](../us/API-RECON.md)): US sources are green (free, no-auth, machine-readable) but share **zero domain vocabulary** with the French stack — AAO character/object vs M57 chapitres, UEI/DUNS vs SIREN, US fiscal year Oct–Sep, proprietary/governmental funds vs fonctionnement/investissement, obligations-vs-outlays as a first-class accounting distinction France doesn't have.
2. **Repo survey**: the Marseille work built a real *second-French-city* seam — 5 of 6 Marseille pages re-import Paris `*Client`s parameterized by `city`; `configs/cities/*.yaml` + `sync_city.py` + `seeds/cities/*`; unified OBT with `commune_slug` (P2.1). That seam **stops at the French border**. Four load-bearing walls a second country hits: (a) no country/scale dimension anywhere (the app *is* France); (b) chat layer 100% welded to Paris (no `city` param at all); (c) `dbt_paris_*` warehouse namespace hardcoded in profiles/snapshots/audit scripts; (d) French-fiscal types and vocabulary baked into loaders, i18n values, and ~15–20 components. Plus: Paris data un-namespaced at `public/data/` root (rétro-compat special case).
3. **Prior art in-repo**: the [city-replication playbook](../city-replication-playbook.md) already excludes foreign countries explicitly ("ni M57, ni DECP, ni OFGL — refaire l'audit data de zéro"). The country boundary was known; this ADR formalizes it.

Constraints: solo dev, October demo deadline, deliberate retreat from infra-heavy work (SaaS-style platform building is out). Funders (IA, SF, grants) are pitched "one engine, many places, everything learned is shared" — LEARNINGS.md is the connective tissue.

## Decision (proposed)

### D1. One repo, one Next.js app. No separate repos, no workspace packages.

Separate repos fork the design system at the exact moment (pre-October) both the France and US demos must look their best, and every fix ships twice. Workspace packages (`packages/ui`…) add versioning/build surface with no second consumer. The Council Data Project death-by-unmaintained-instances is the cautionary tale for per-place repos.

### D2. The unit of reuse is not "city" — it is three explicit contracts.

- **Place registry** (data, not code): a `places` manifest — slug, country, scale (`national`/`city`), schema family, default locale, currency, data namespace, enabled modules, nav links. Replaces the hand-wired `EXHAUSTIVE_CITIES` set + per-place route enumeration, incrementally. A place with a missing module simply doesn't render it (P3.2 "option a" generalizes).
- **Schema families** (domain): `fr-commune` (M57/OFGL/DECP — Paris, Marseille, Lyon…), `fr-national`, `us-federal`, `us-municipal` (SF; later Ventura), `ca-municipal` (later). **Clients, TS types, and dbt marts belong to a family, not a city.** Cities inside a family share page clients (the proven Marseille⇢Paris move). Families never share schemas — only design-system primitives, chart components, drawer/fiche/provenance mechanisms, and pipeline layering.
- **Export data contract** (already exists France-side; now binding for every family): `generated_at`, `source_pipeline`, per-value `source`/`source_url`, `as_of`/period-completeness flag, units and signs normalized at stg (API-RECON D.3 documents why: units flip dollars/millions/billions and deficit signs flip between tables *within* Treasury alone).

### D3. Country-namespaced everything, new code only — no big-bang France refactor.

- Routes: `app/us/national/*`, `app/us/city/sf/*`. France routes untouched for v0; unifying France under a country segment is logged debt, post-October.
- Data: `public/data/us/national/`, `public/data/us/sf/`. Paris's un-namespaced root stays for now (retiring it is debt, not a v0 prerequisite).
- Warehouse: `raw.us_*` tables; `dbt_us_{staging,analytics,marts}` dataset family mirroring `dbt_paris_*`. Same raw→stg→core→mart layering (ADR-0001), separate family — a cross-country unified OBT would be semantically false (see Rejected C).
- Pipeline code: **protocol adapters, not per-place scripts** — `sync_socrata.py`, `sync_fiscaldata.py`, `sync_usaspending.py`, each driven by `configs/countries/us.yaml` listing sources. This extends PA.2 (generic script + city YAML) one level up: DataSF is just a Socrata config entry, which is also what makes a future Vancouver (Socrata/CKAN) cheap.
- Components: shared primitives stay in `components/fusion/`; US page clients live in the US route tree (or `components/us/`), **copy-then-diverge inside the repo**, promoted to shared only on the second or third use (rule of three). No new barrel files — US clients import primitives directly (the `node:fs` barrel leak fixed in 8039f41 is the precedent).
- i18n: new keys under a `us.*` namespace in the same flat dict; **US pages are EN-only** (daniel 2026-07-15) — no FR parity obligation for US content; the FR/EN toggle is hidden or inert on US routes. The France-side FR→EN parity rule is unchanged.

### D4. Chat becomes parameterized by a "place context pack" — interface designed now, US chat only if time allows.

The chat layer is the most Paris-welded (system prompt, dataContext, tools, dataset paths — zero parameterization). Define the pack interface (prompt fragment + toolset + data paths + refusal rules per place) when US v0 needs it; do not rebuild France chat preemptively.

### D5. Replicability strategy for third parties ("Vancouver version").

**Elevated to a first-class requirement (daniel 2026-07-15): a collaborator wanting Berlin, Vancouver, or Brasil should be able to take the repo and understand how to scale it to their place.** We still do **not** run a multi-tenant platform and do **not** maintain forks. Replicability =
(a) the three contracts above, documented where a stranger will find them; (b) a top-level **`ADDING-A-PLACE.md`** — the collaborator-facing path: audit your sources (country-audit phase 0, since the city-replication playbook explicitly stops at the French border) → declare a schema family (reuse or new) → registry entry + country YAML + seeds → pages; skeleton written during US v0, hardened by the Ventura proof; (c) **Ventura is the proof** that a new place in an *existing* family = YAML config + seeds + registry entry, not code. External instances are forks of a documented repo; LEARNINGS.md is what we actually promise to share. The US build itself must be done as if it were that collaborator — every undocumented assumption it trips over becomes a LEARNINGS row or a playbook fix.

## Alternatives rejected

- **A. Separate repo per country (copy-then-diverge)** — fastest first week; permanent design-system drift, double maintenance during the highest-stakes window, kills the "one engine" pitch. (The RESEARCH-BRIEF's "no shared package between repos" line described a copy into a *new* repo and predates the 2026-07-15 decision to extend this app.)
- **B. Monorepo with `packages/` workspaces** — right shape for a team; for a solo dev it's build/versioning overhead with zero second consumer. The namespaces in D3 make a later app split mechanical if the US side ever needs its own deploy cadence or domain — decide then, not now.
- **C. Stretch the unified commune OBT across countries** (`commune_slug` → `place_slug` on the same `core_*`) — recon says no: the columns themselves (M57 chapitre, SIREN, fonctionnement/investissement) have no US meaning. One OBT *per schema family*, sharing layering conventions and test patterns, not columns.

## Consequences

- v0 US is greenfield inside its own namespaces; France-side edits limited to three additive seams: place registry, per-country lineage file, chat pack interface (if chat in v0 scope).
- Paris root-namespace and France route-shape debt is explicitly carried, logged, retired opportunistically after October.
- Every transplant/generalization gets a LEARNINGS.md row (existing rule, unchanged).
- Deploys stay from `main`; US work stays on `us-v0` until demo-ready; `/us` not linked from France nav until launch.

## Resolved questions (daniel, 2026-07-15)

1. **Domain/brand**: separate domain or subdomain for the US side **for now**; longer term, a new umbrella brand over all countries (**name TBD — deliberately not chosen yet**; nothing public carries a name until daniel picks one). Technically: one app, one deployment, host-based routing (middleware maps host → country segment), so the domain decision never blocks the build. Irrelevant for localhost demos; needed before October.
2. **US locale policy**: **EN-only.** (Folded into D3.)
3. **Warehouse**: **BigQuery for now** — `dbt_us_*` dataset family, existing project (`open-data-france-484717`; the project's "france" name is cosmetic debt, renaming/migrating is not a v0 concern). **Tracked exploration, not a commitment**: open-source / decentralized alternatives, in the spirit of IA's decentralization ethos. Concretely worth evaluating: dbt-duckdb (same raw→stg→core→mart models, no cloud warehouse), pipeline outputs as versioned Parquet/data-package artifacts — potentially archived as archive.org items themselves, which would make the pipeline's own outputs citable IA records (a very strong pitch symmetry). The layering (ADR-0001) is engine-agnostic by design; nothing in v0 may assume BQ outside profiles/adapter config.
4. **URL shape**: **nested `/{country}/{level}/{level_name}`** — `/us/national`, `/us/city/sf`; a future collaborator's place slots in as `/{country}/city/{slug}`. France's eventual unification to `/fr/city/paris` etc. stays logged post-October debt.
