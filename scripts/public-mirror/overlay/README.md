# qipu-open-public-data-pipeline

The reproducible data pipeline behind **Qipu** — the transforms and tests that
turn raw public financial data into the figures published on the site.

This repository exists for one reason: **so anyone can verify the numbers.**
Start from the same public sources, run the same transformations, run the same
tests, and reproduce the same figures.

## What this repo is

- **Source ingestion** (`pipeline/scripts/sync/`) — how each dataset is fetched
  from its official open-data source into the raw layer.
- **Transformations** (`pipeline/models/`) — the dbt project: `staging → core →
  marts`, row-level and auditable at every layer.
- **Tests** (`pipeline/tests/`) — referential integrity, accounting balance,
  freshness, completeness, cross-layer and anomaly checks.

The published figures are the **marts**. They are publicly queryable in BigQuery
(the `dbt_paris_*` datasets under project `open-data-france-484717`), so you can
rebuild them from source and compare against the exact tables the site reads.

See **[REPRODUCE.md](REPRODUCE.md)** for the step-by-step replay.

> The step that renders marts to the site's JSON files is a thin formatting
> layer maintained separately; it is not required to verify any figure.

## What this repo is not

This is the **deterministic backbone**, not the whole product. The following
live in a separate, private repository and are **not** required to verify the
figures:

- The website / application.
- The enrichment layer — LLM-generated descriptions, summaries, thematic
  classification logic, geocoding and archive grounding. These require compute
  to produce; their **outputs** that affect published aggregates (thematic and
  geo classification) are included here as **frozen seed files** so the numbers
  still reproduce end-to-end. See [NOTICE](NOTICE).
- Media assets (photographs, archives).

## Data sources

All figures derive from official open-data portals (e.g. Paris Open Data,
`data.economie.gouv.fr`/DECP, DGFiP, and the equivalent portals for other
covered cities). Exact dataset references are declared in the dbt `sources` and
in each ingestion script.

## License

Code is licensed under the **PolyForm Noncommercial License 1.0.0** — free to
use, run, study, modify and share for **non-commercial** purposes (verification,
research, journalism, education). See [LICENSE](LICENSE) and [NOTICE](NOTICE).
