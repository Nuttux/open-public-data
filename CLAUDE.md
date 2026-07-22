# CLAUDE.md — project instructions

Civic-finance explorer for multiple places at two levels
(`/{country}/national`, `/{country}/city/{slug}`). One repo, one app; forked
per instance. We maintain the contracts and the playbook, not deployments.

## Before adding or modifying a city/country — read the playbook first

Read **`ADDING-A-PLACE.md`** (repo root) and the ADRs it links
(`docs/decisions/0010-multi-country-architecture.md`,
`0011-budget-convergence.md`) BEFORE touching pipeline configs, page routes,
dbt models, exports, or the place registry.

**The one guardrail that matters:** `website/src/data/places.json` is the ONLY
file that should "know" a place exists — deleting its registry entry should
make the place vanish cleanly. If you find yourself editing a *shared*
component, dbt model, macro, or export to special-case one city, STOP. Either:

- it's a **new schema family** (the data genuinely differs — e.g. M57 vs
  US fund/character) → copy the nearest family and diverge honestly; or
- you're **breaking convergence** → find the config/seed/registry way instead.

"Except where the data justifies divergence" is the ONLY license to diverge.
Same protocol + same schema family ⇒ a new city is config + seeds, not code.

## Convergence primitives — reuse these, don't re-fork

- **Ingestion:** generic protocol adapters driven by YAML. Only write a new
  adapter for a genuinely new API protocol (ODS, Socrata, datagouv, fiscaldata
  already exist).
- **Budget logic:** dbt macros (`ode_categorie_flux`, `budget_thematique_best_match`),
  not copy-pasted CASE blocks.
- **Exports:** `pipeline/scripts/export/_export_common.py` —
  `get_bigquery_client()`, `data_dir(city)`, `marts_dataset(city)`,
  `write_json()`. Write only the city-shaped SQL; reuse the plumbing.
- **District map:** `website/src/components/fusion/DistrictChoropleth.tsx` —
  supply geometry via props, don't fork the component.
- **i18n / slim commune page:** register the place; these are automatic.

## Config paths (note the real layout — the playbook is incomplete here)

- **Per-city source configs (French cities):** `pipeline/configs/cities/{city}.yaml`
  (e.g. `paris.yaml`, `marseille.yaml`), read by `sync_city.py {city}`.
- **Country-level configs:** `pipeline/configs/countries/{country}.yaml`
  (e.g. `us.yaml`).

`ADDING-A-PLACE.md` currently mentions only the `countries/` path — the
`cities/` path above is where French per-city ODS sources actually live.

## Non-negotiables (see also memory / other docs)

- **Data provenance:** every number traces to a `source_url`; no hardcoded
  figures. Data flows raw → stg → core → mart → export, no bypasses (ADR-0001).
- **Prove before ship:** source arithmetic self-checks pass as dbt tests;
  exported headline totals match official published figures; screenshot review
  (desktop + mobile) before calling any UI page done.
- **Commits:** author is the user only — never add Claude as author/co-author.
