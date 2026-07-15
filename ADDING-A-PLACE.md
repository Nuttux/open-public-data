# Adding a place (city or country) to this explorer

**Status: skeleton (2026-07-15) — hardened as the US build (`docs/us/PLAN.md`) and the Ventura replicability proof exercise it. If you follow this and hit an undocumented assumption, that's a bug in this file: open an issue.**

This repo powers a civic-finance explorer for multiple places at two levels (`/{country}/national`, `/{country}/city/{slug}`). Architecture: [ADR-0010](docs/decisions/0010-multi-country-architecture.md). One repo, one app; you fork it for your own instance — we maintain the contracts and this playbook, not your deployment.

## The three contracts (read these before anything)

1. **Place registry** — `website/src/data/places.json`: every place declares slug, country, level, schema family, locale, currency, data namespace, and enabled modules. Nav, sitemap, and routing read this; nothing about a place is hand-wired elsewhere.
2. **Schema families** — page clients, TS types, and dbt models belong to a *family* (`fr-commune`, `fr-national`, `us-federal`, `us-municipal`, …), never to a single place. Same family ⇒ you reuse everything and ship only config + seeds. New family ⇒ you copy the nearest family and diverge; the design system, drawers, provenance modal, and pipeline layering are shared regardless.
3. **Export data contract** — every JSON the site reads carries `generated_at`, `source_pipeline`, per-value `source`/`source_url`, and an `as_of`/completeness field. Data flows raw → stg → core → mart → export, no bypasses ([ADR-0001](docs/decisions/0001-layering-stg-core-mart.md)).

## The path

### Step 1 — Audit your sources. Write no code.
Verify every dataset **live** before believing it: exact endpoints, the grain of a row, coverage floors, update cadence, subtotal/total traps, units, sign conventions. Find the **arithmetic self-checks** your source offers (published total = Σ details, budget − actual = variance, revenue = spending) — they become mandatory pipeline tests in Step 4. Exemplar to imitate: [docs/us/API-RECON.md](docs/us/API-RECON.md). For French cities, the richer [city-replication playbook](docs/city-replication-playbook.md) applies instead.

### Step 2 — Pick or declare your schema family.
Your place's accounting model decides. Another Socrata-published US city → `us-municipal`: you will likely ship **no code at all** (config, seeds, registry). Berlin → German municipal accounting is a new family: copy the closest family's dbt models + page clients, rename, diverge honestly. Do not force your data into another country's schema — if the columns don't mean the same thing, it's a new family.

### Step 3 — Wire it.
- Registry entry in `places.json`.
- Source config: `pipeline/configs/countries/{country}.yaml` listing datasets → the protocol adapters (`sync_socrata.py`, `sync_fiscaldata.py`, …). Only write a new adapter for a genuinely new API protocol.
- Seeds: `pipeline/seeds/countries/{country}/…` (mappings, constants — each with a source).
- Warehouse: a `dbt_{country}_*` dataset family (BigQuery today; the layering is engine-agnostic by design).
- Exports: `website/public/data/{country}/{place}/…`.
- Pages: `website/src/app/{country}/…` composing the shared components; copy from your schema family's existing pages.

### Step 4 — Prove it before you ship it.
- The self-check identity tests from Step 1 pass in dbt.
- Exported headline totals match the official published figures (spot-check by hand, note where).
- Every number on every page traces to a `source_url`. No hardcoded figures, ever.
- Screenshot review, desktop and mobile, before calling any page done.

### Step 5 — Leave the trail.
Log every generalization, gotcha, and transplanted pattern in a LEARNINGS file (see [docs/us/LEARNINGS.md](docs/us/LEARNINGS.md)). It's the most valuable artifact for the next person.

## What "done" looks like

The registry entry is the only place that "knows" your place exists; deleting it makes the place vanish cleanly. If you had to edit a shared file to special-case your place, something is wrong — fix the contract or ask.
