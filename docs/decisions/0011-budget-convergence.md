# ADR-0011 — Budget convergence: shared logic, not a shared table

Status: accepted (2026-07-21)
Supersedes the informal "P2.1" note (the `commune_slug` constant in
`core_budget.sql` and `models/core/schema.yml`: "core fusionnera dans
core_budget global via UNION ALL discriminé par commune_slug").

## Context

The multi-city convergence work asked: how should the Paris and Marseille
budget models converge, and what scales best as we add cities? Four audits of
the live codebase (budget core consumer graph, sankey/export chain, the
`national/` layer, the frontend tiers, and the US models) established the
following facts:

1. **There are three budget tiers, and scale is already solved.**
   - *Breadth* (all ~36k French communes, cheap): `sync_ofgl_all_communes.py`
     → `public/data/communes-all/index.json` → `CitySlimClient`. Direct
     OFGL→JSON, no dbt, no BigQuery. A new commune costs nothing.
   - *Rich single-page* (promoted cities): `sync_ofgl_communes.py` →
     `public/data/communes/<slug>.json` → `CityClient`. One seed row per city.
   - *Exhaustive deep sankey* (M57 line-level): Paris + Marseille only. This is
     the `core_budget` → `mart_budget_sankey_lines` → `export_sankey_data.py`
     chain. It is inherently few-city and high-touch.

2. **A physical `core_budget` UNION is the wrong move.** 7 Paris marts + ~15
   dbt tests read `core_budget`, none filter by city; adding Marseille rows
   silently corrupts every Paris aggregation, and several tests hard-fail by
   construction (e.g. `ref_core_budget_to_stg` asserts
   `count(core_budget) == count(stg_budget_principal)`). The two core schemas
   also genuinely differ because the *data* differs (Paris has a functional
   dimension `ode_thematique`/`fonction_libelle` that Marseille's source lacks).
   The payoff would be retiring one passthrough model with one consumer. Bad
   trade, and it spreads `commune_slug = 'paris'` filters across ~22 Paris-only
   files — less legible, not more.

3. **The `national/` dbt layer is dormant, not dead — it is the multi-scale
   roadmap seam.** It is `+enabled: false`, its `raw_national.*` sources are not
   synced, its `seed_communes_cibles` gate was trimmed below what its own
   scripts need, its `data/villes/` output does not exist, and no frontend
   consumes it yet. For the *36k-slim-commune* use case it was superseded by the
   OFGL-direct path. BUT pulling in national / regional / provincial data is an
   explicit product goal, and this layer (OFGL communes, DGFiP balances, DECP
   nat., subventions nat., benchmarking) is exactly the `commune_slug`-native,
   multi-scale scaffolding for it. It is KEPT and to be rewired (restore the
   seed's `siren`/`dep`/`reg`/geo columns, sync `raw_national.*`), not deleted.

4. **Cross-country, budget models cannot share a schema or macros** (ADR-0010):
   M57 section/nature/fonction and SF fund/character/object share zero
   vocabulary. The shared contract is the *presentation/export envelope*
   (`generated_at`, `source`, `source_url`, `as_of`, normalized units), plus
   design-system chart primitives — not columns.

## Decision

Converge the budget domain by **sharing logic, not tables**:

- **Extract the duplicated France budget SQL into dbt macros** (country-scoped,
  under `macros/`): the `ode_categorie_flux` CASE (byte-identical across
  `core_budget`, `core_budget_vote`, and `mart_marseille_budget_sankey_lines`)
  and the `thematique_best_match` CTE (byte-identical across the two Paris core
  models). These are pure text extractions with output verified byte-identical.
  The `ode_thematique` chapter map is deliberately left INLINE, not extracted:
  the CA (`core_budget`) and BP (`core_budget_vote`) chapter maps genuinely
  differ (BP carries chapters 9305/9343/9344 that CA lacks), so a shared macro
  would be incorrect.
- **Keep the exhaustive tier's models city/source-shaped.** Paris and Marseille
  budgets stay separate models because their source granularity differs; they
  now share the extracted macros instead of copy-pasted CASE blocks.
- **Unify the two sankey export scripts** (`export_sankey_data.py`,
  `export_marseille_sankey.py`) into one shared module + a per-city grouping
  strategy (~83% of the Marseille script is a copy of the Paris skeleton). See
  Block 3.
- **Keep the `national/` layer** as the national/regional/provincial roadmap
  seam (§3); rewire it rather than delete it when that work is scheduled.
- **Remove the orphan `mart_sankey`** aggregate only (no export or model reads
  it; distinct from `mart_sankey_national` and `mart_budget_sankey_lines`).
- **Do not** build a physical multi-city `core_budget`, a shared cross-country
  `budget_line` schema, or cross-country budget macros.

## How a new city gets a budget

- Any French commune: already covered by the OFGL breadth tier (free).
- Promote to a rich single-page: add a seed row; `sync_ofgl_communes.py`
  produces its `communes/<slug>.json`. No new models.
- A deep M57 sankey (rare, high-touch): add a `stg_<city>_budget` mapping and a
  thin sankey mart reusing the shared macros + the shared export module. No new
  core fork, no `core_budget` union.

## Consequences

- Removes ~150+ lines of duplicated SQL and ~250 lines of duplicated Python.
- Leaves Paris output byte-identical (macro extraction is output-preserving),
  gated by a parity check.
- The `national/` layer stays as the documented seam for national / regional /
  provincial expansion; a follow-up ADR will cover rewiring it (seed columns +
  `raw_national.*` sync + a scale/echelon discriminator for
  commune→département→région→national).
