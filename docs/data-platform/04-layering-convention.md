# 04 — Layering convention

> Companion docs: [01-pipeline-diagram.md](./01-pipeline-diagram.md) · [02-catalog-and-model.md](./02-catalog-and-model.md) · [03-quality-monitoring.md](./03-quality-monitoring.md)

This document defines the **layering rule** every pipeline change must respect. It is enforced by [pipeline/scripts/audit/check_layering.py](../../pipeline/scripts/audit/check_layering.py) (CI gate, see §6).

---

## 1. The rule

```
Source → ingest → raw.* (BigQuery) → stg_* → core_* → (int_*) → mart_* → export → JSON → UI
```

Hard constraints:

1. **Every external data source lands in `raw.*` first.** No script writes directly to `website/public/data/`.
2. **Every `core_*` model reads from `stg_*` or another `core_*`.** Not from `seed_*` (data) and not from `raw.*`.
3. **Every `mart_*` model reads from `core_*` or `int_*`.** Not from `stg_*` or `seed_*`.
4. **Every export script reads from `mart_*` only.** Not from `core_*` or `int_*`.
5. **The UI reads only from `website/public/data/*.json`.** Never from BigQuery directly, never from a Python script's stdout.

A diagram with all these arrows in solid black is the goal — every dotted "bypass" arrow is a rule violation that needs justification or removal.

---

## 2. Layer purposes

| Layer | Purpose | What goes here | What does **not** |
|---|---|---|---|
| **raw.*** (BQ) | Faithful copy of an external source. Schema may be ugly. | Loader output, no semantic transformation | Joins, computed columns |
| **stg_** | Make raw addressable: rename, type, filter quality, parse JSON, dedupe rows. **One staging model per raw table or per seed of source data.** | `SAFE_CAST`, column renaming, source-specific normalization | Joins across sources, business logic |
| **core_** | Domain entity. Row-level OBT (one big table) for the entity. | Joins `stg_*` of the same domain. Adds business keys. | Aggregations / rollups |
| **int_** | Cross-cutting enrichment that needs seeds/caches (LLM, SIRENE, mappings). May sit either side of `core_*` depending on domain: `stg_ → int_ → core_` (when `core_` is the canonical enriched OBT) or `core_ → int_ → mart_` (when several marts need the same join). | Join `stg_*`/`core_*` with seeds, attach `ode_*` columns | UI-shape aggregations |
| **mart_** | Aggregation tuned for one (or a small family of) downstream JSON. | `GROUP BY`, ranks, cumulative metrics, JSON-ready shape | Source-specific cleaning |
| **mart_** *thin* | Acceptable variant : projection de colonnes + filter + ORDER BY stable, sans agrégation. Doit être matérialisé en `view` (pas `table`) et tagué `thin`. Sert de contrat de colonnes/ordre pour un export quand le SQL ne fait pas d'aggregation. | Stable contract for export | Real transformation logic |
| Python `export_*.py` | `SELECT * FROM mart_…` → write `*.json` | I/O, JSON shaping the SQL can't express | SQL transforms |

---

## 3. Seeds: hard data vs. soft config

Seeds (`pipeline/seeds/*.csv`) are not all created equal. The audit treats them in three buckets:

### 3.1 Data-source seeds — wrap in `stg_*`

Seeds that carry **actual observations** (numbers measured in the world, not configuration). They behave like a `raw.*` table that happens to be hand-loaded.

Examples:
- `seed_drihl_paris_2024` (DRIHL waitlist counts)
- `seed_pdf_budget_vote_2020..2026` (figures extracted from voted-budget PDFs)
- `seed_apul_subsectors`, `seed_communes_cibles` (wherever they carry observations)

**Rule:** referenced only from `stg_*`, never from `core_*` or `int_*` directly.

### 3.2 Mapping/parameter seeds — may be referenced from `core_*` / `int_*`

Editorial classifications, regex patterns, threshold values. Configuration, not data. They typically have one row per concept and are tiny.

Examples:
- `seed_mapping_thematiques`, `seed_mapping_beneficiaires`, `seed_mapping_directions`, `seed_mapping_entites`
- `seed_match_projet_marches` (deterministic match decisions)
- `seed_lieux_connus` (manual georeferences)
- `seed_city_constants`, `seed_legal_thresholds`, `seed_editorial_params`

**Rule:** allowed to be `ref()`'d from any layer ≥ stg, **provided** the referencing model has an inline comment `-- mapping seed`.

### 3.3 LLM cache seeds — may be referenced from `int_*`

`seed_cache_*` files are memoization tables: the output of an LLM enrichment job, frozen as a CSV so dbt can join on it without re-paying tokens.

Examples:
- `seed_cache_thematique_beneficiaires`
- `seed_cache_geo_ap`

**Rule:** allowed to be `ref()`'d from `int_*` only. Comment `-- llm cache seed` required on the referencing model.

---

## 4. JSON outputs

Every metric file under `website/public/data/` is produced by **exactly one** script under `pipeline/scripts/export/` reading from a `mart_*`. Metric files are ones the UI uses for charts, totals, rankings, maps — anything fact-bearing.

The `website/public/data/enrichment/` subtree is **different** by design: it holds *side-channel enrichment caches* that the UI lazy-loads on user interaction (per-record vulgarizations, SIRENE company info, grounded LLM context, photo bank, etc.). These caches are large (1–50 MB) and per-record; loading them eagerly would balloon the initial bundle. They originate from LLM/API enrichment runs that don't fit cleanly in dbt (LLM calls are not idempotent SQL), and they feed back into dbt only through `seed_cache_*` files.

### 4.1 Hard rule (metric outputs)

- No `pipeline/scripts/sync/*.py` (ingest) writes to `website/public/data/`.
- No `pipeline/scripts/enrich/build_*.py` writes to `website/public/data/`.
- No `pipeline/scripts/tools/*.py` writes to `website/public/data/`.
- No `pipeline/scripts/export/*.py` writes anywhere except `website/public/data/`.

### 4.2 Exception — enrichment caches (Category E)

`pipeline/scripts/enrich/*.py` MAY write to `website/public/data/enrichment/` provided:
1. The output is per-record cache data (vulgarization, SIRENE, grounded context, photos), not aggregated metrics.
2. The same data is also reflected in `seed_cache_*` (when applicable) so dbt can join on it.
3. The script is listed in the audit whitelist with a one-line justification.

Current Category E whitelist (audited in `check_layering.py`):
- `enrich_sirene.py` → `enrichment/sirene_companies.json` (recherche-entreprises API cache)
- `enrich_beneficiaire_grounded_llm.py` → `enrichment/beneficiaire_grounded.json` (LLM grounded context per associations)
- `enrich_deliberations_sirene.py` → `enrichment/deliberations_sirene.json`
- `vulgarize_marches_llm.py` → `enrichment/vulgarization_marches.json`
- `vulgarize_subventions_llm.py` → `enrichment/vulgarization_subventions.json`
- `vulgarize_projets_llm.py` / `vulgarize_projets_anthropic.py` → `enrichment/vulgarization_projets.json`
- `build_generic_photo_bank.py` → `enrichment/generic_photo_bank.json`
- `match_projet_photos.py` → `enrichment/projet_photos.json`

### 4.3 Exception — documented bypasses (Category D)

A small number of legacy ingest scripts emit JSON directly to `public/data/`. Each is listed in the audit whitelist with **(a)** the diagram §0 reference, **(b)** the unique-output rationale (data not derivable from existing marts), and **(c)** a `TODO` pointer to a future refactor PR. New bypasses are not allowed.

Current Category D whitelist:
- `pipeline/scripts/sync/scrape_deliberations.py` → `subventions_delibs/session_*.json`. Source = HTML+PDF scrape; data shape is per-session and feeds enrichment chain. Future refactor: land in `raw.deliberations_paris` and route via mart.
- `pipeline/scripts/tools/extract_pdf_investments.py` → `map/investissements_localises_*.json`. Source = PDF Vision (Gemini); JSON carries per-extraction validation metadata that doesn't fit a row-level schema. Future refactor: split data (BQ-route) from metadata (separate cache).

### 4.4 Exception — WIP (Category W)

Scripts under `pipeline/scripts/sync/` and `pipeline/scripts/tools/` that are part of in-progress feature work (national extension, alternative PDF parsers) are tagged `wip-not-yet-consumed`. The audit gate accepts them because their outputs aren't wired into UI pages yet, BUT they must comply with §4.1 before they can be wired up. The check shows them as warnings, not errors.

If a new exception is needed, it must be added to the appropriate whitelist in `check_layering.py` with a one-line justification.

---

## 5. Naming convention

| Pattern | Layer | Owner |
|---|---|---|
| `stg_<source>_<entity>` | staging | one source × one entity |
| `core_<entity>` | core | one entity, all sources merged |
| `int_<purpose>` | intermediate | one cross-domain compose step |
| `mart_<consumer>_<grain>` | mart | one downstream JSON family |
| `export_<consumer>_data.py` | export script | one or several JSONs of the same family |

Nouvelles tables: respecter le préfixe + une entrée dans `schema.yml` du même répertoire avec description et tests minimaux (`not_null` sur la PK au moins).

---

## 6. Audit gate

`pipeline/scripts/audit/check_layering.py` runs in CI and on pre-commit. It:

1. Walks every dbt model and rejects refs that violate §2.
2. Walks every export script and rejects `FROM core_…` or `FROM int_…`.
3. Walks every ingest/enrich script and rejects writes to `website/public/data/`.
4. Loads a YAML whitelist for justified exceptions; an exception without justification fails the gate.

Exit code 0 = clean. Anything else = the diff cannot land.

---

## 7. Migration history

Initial codification: refactor `pipeline/layering-cleanup` (see [_layering_refactor_tracker.md](./_layering_refactor_tracker.md)). Before that branch, the rule existed informally in [feedback_pipeline_no_bypass](../../.. # in user memory) but was not enforced; that refactor closed every hard violation in the Paris pipeline.
