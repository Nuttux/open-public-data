# Data Platform Documentation

This folder is the **reference manual** for the Open Data Paris data platform — sources, pipelines, tables, JSON outputs, UI consumption, and quality monitoring. Three companion documents:

| # | Doc | What's in it |
|---|---|---|
| 01 | [Pipeline Diagram](./01-pipeline-diagram.md) | Mermaid graphs — master overview + per-domain (budget, subventions, marchés, investissements, logement, bilan, enrichment) |
| 02 | [Catalog + Data Model + UI Mapping](./02-catalog-and-model.md) | Every external source · every dbt model (staging/core/intermediate/mart) with grain/keys/measures · UI ↔ JSON ↔ mart ↔ core for every metric |
| 03 | [Quality & Monitoring](./03-quality-monitoring.md) | Caveats register · freshness contracts · test catalog (~35 dbt tests) · LLM audit trail · test gaps + proposals |

## Scope

- **In scope:** data lineage, pipeline structure, dbt model reference, UI metric traceability, quality test specs, LLM enrichment auditing.
- **Out of scope (lives elsewhere):** incidents tracker → [../data-quality.md](../data-quality.md) ; narrative architecture → [../architecture-modelling.md](../architecture-modelling.md) ; frontend architecture → [../architecture-frontend.md](../architecture-frontend.md) ; editorial angles → [../editorial-angles.md](../editorial-angles.md).

## How to use

- **New contributor:** read 02 for the model, then 01 to see the flow, then 03 for the rules.
- **Adding a metric to the UI:** find the core table in 02 §2 → confirm a mart exists (or add one) → add the metric to §3 UI mapping → add a reconciliation test (§3.7 gaps, proposal 4.1).
- **Adding a source:** update 02 §1 catalog → update the domain Mermaid in 01 § corresponding to domain → add a caveat row if applicable in 03 §1.
- **Changing a model/column:** update the grain/key/measures in 02 §2 → run `dbt test` → update 03 §3 if a test threshold changes.

## Maintenance

These docs describe the data platform as of **2026-04-23**. Keep them in sync when:
- a new `pipeline/scripts/sync/*.py` or `pipeline/scripts/enrich/*.py` ships → touch 01 + 02
- a new `pipeline/models/{staging,core,marts}/*.sql` is added → touch 02
- a new `pipeline/tests/cat*/*.sql` is added → touch 03
- a new `website/public/data/*.json` is exported → touch 02 (§1.6/§3) + 01 (JSONs box)

Rendering Mermaid: VS Code + "Markdown Preview Mermaid Support", or GitHub's built-in renderer.
